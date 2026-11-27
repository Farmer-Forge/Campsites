-- Tests for 0025_osm_state_campgrounds.sql, 0026_osm_sync_schedule.sql and 0027_osm_dedupe_park_suffix.sql (state-run
-- campgrounds from OpenStreetMap; Shawn, 2026-11-26; design
-- ~/plans/2026-11-26-campsites-state-parks-osm-design.md on Lisa, sections 6–7).
-- OSM campgrounds are retired, never deleted; only osm rows retire; a duplicate of an
-- NPS/RIDB campground is dropped; a bad Overpass result retires nothing (the guard).
-- The tests use their own campgrounds, never the dev seed's, and no geo boundaries.
-- Run on ralph from the repo root: supabase test db. Rolled back at the end.
begin;
select plan(74);

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'user-a@test.local', '{"display_name":"A"}'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'admin-b@test.local', '{"display_name":"B"}');
update public.users set role = 'admin' where id = '22222222-2222-2222-2222-222222222222';

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- el(id, name, lng, lat): one kept element, the shape osm-sync sends.
create function pg_temp.el(p_id text, p_name text, p_lng float8, p_lat float8) returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'name', p_name, 'description', 'Operated by Test DNR.',
    'lng', p_lng, 'lat', p_lat, 'reservation_url', 'https://example.test/' || p_id,
    'contact', jsonb_build_object('phone', '', 'email', ''), 'amenities', '{}'::jsonb,
    'state', null, 'operator', 'Test DNR', 'operator_wikidata', null);
$$;

-- run(state, rows, dropped ids, fetched[, unplaced ids]): start a forced run for that
-- state and apply it.
create function pg_temp.run(p_state text, p_rows jsonb, p_dropped text[], p_fetched int, p_unplaced text[] default '{}') returns jsonb language sql as $$
  select public.apply_osm_sync_state(r.run_id, p_rows, p_dropped, p_unplaced, p_fetched, 0, '{"Test DNR":{"kept":1,"dropped":0}}'::jsonb)
  from public.start_osm_sync_run(p_state) r;
$$;

create function pg_temp.reason(p_id text) returns text language sql as $$
  select coalesce(retired_reason, 'live') from public.campgrounds where id = p_id;
$$;

-- The existing federal campgrounds the OSM rows meet.
insert into public.campgrounds (id, name, location, agency, source, state) values
  ('ridb:t1', 'Birch Lake Campground', st_setsrid(st_point(-94.5, 46.0), 4326)::geography, 'USFS', 'ridb', 'MN'),
  ('nps:t2', 'Far Away Campground', st_setsrid(st_point(-100.0, 40.0), 4326)::geography, 'NPS', 'nps', 'NE'),
  ('nps:t4', 'Gold Bluffs Beach Campground - Prairie Creek Redwoods State Park', st_setsrid(st_point(-91.0, 44.0), 4326)::geography, 'NPS', 'nps', 'WI');
create temporary table before_hash as
  select id, md5(row(c.*)::text) as h from public.campgrounds c where source in ('ridb', 'nps');

-- Schema and grants -----------------------------------------------------------------
select has_column('public', 'campgrounds', 'retired_at', 'S1: campgrounds has retired_at');
select has_column('public', 'campgrounds', 'retired_reason', 'S2: campgrounds has retired_reason');
select throws_ok($$ update public.campgrounds set retired_at = now(), retired_reason = 'duplicate' where id = 'ridb:t1' $$,
  '23514', null, 'S3: a RIDB campground can never be retired');
select throws_ok($$ update public.campgrounds set retired_at = now() where id = 'ridb:t1' $$,
  '23514', null, 'S4: retired_at without a reason is refused');
select ok(not has_function_privilege('anon', 'public.start_osm_sync_run(text)', 'execute'), 'S5: anon cannot start a sync run');
select ok(not has_function_privilege('authenticated', 'public.start_osm_sync_run(text)', 'execute'), 'S6: a signed-in user cannot start a sync run');
select ok(has_function_privilege('service_role', 'public.start_osm_sync_run(text)', 'execute'), 'S7: the service role can start a sync run');
select ok(not has_function_privilege('anon', 'public.apply_osm_sync_state(int, jsonb, text[], text[], int, int, jsonb)', 'execute'), 'S8: anon cannot apply a sync');
select ok(not has_function_privilege('authenticated', 'public.apply_osm_sync_state(int, jsonb, text[], text[], int, int, jsonb)', 'execute'), 'S9: a signed-in user cannot apply a sync');
select ok(has_function_privilege('service_role', 'public.apply_osm_sync_state(int, jsonb, text[], text[], int, int, jsonb)', 'execute'), 'S10: the service role can apply a sync');
select ok(not has_function_privilege('authenticated', 'public.fail_osm_sync_run(int, text)', 'execute'), 'S11: a signed-in user cannot fail a run');
select ok(not has_function_privilege('anon', 'public.call_osm_sync()', 'execute'), 'S12: anon cannot trigger the sync call');
select ok(not has_function_privilege('authenticated', 'public.call_osm_sync()', 'execute'), 'S13: a signed-in user cannot trigger the sync call');
select ok(not has_function_privilege('service_role', 'public.call_osm_sync()', 'execute'), 'S13b: only postgres (the cron job) can trigger the sync call');
select ok(has_function_privilege('anon', 'public.get_campgrounds_by_ids(text[], text[])', 'execute'), 'S14: anon can still look up campgrounds by id');
select ok(has_function_privilege('authenticated', 'public.get_campgrounds_by_ids(text[], text[])', 'execute'), 'S15: a signed-in user can still look up campgrounds by id');
select ok(not has_table_privilege('anon', 'public.osm_sync_runs', 'select'), 'S16: anon cannot read sync runs');
select ok(not has_table_privilege('authenticated', 'public.osm_sync_runs', 'insert'), 'S17: a signed-in user cannot write sync runs');
select ok(not has_table_privilege('authenticated', 'public.osm_campgrounds', 'update'), 'S18: a signed-in user cannot change OSM facts');
select is((select schedule from cron.job where jobname = 'osm-sync'), '*/15 * * * *', 'S19: the osm-sync cron job runs every 15 minutes');
select is(public.call_osm_sync(), null::bigint, 'S20: with no Vault secrets the sync call does nothing');
select is(public.normalize_campground_name('Itasca State Park Campground'), 'itasca', 'S21: names lose punctuation and the generic words');
select is(public.normalize_campground_name('Gold Bluffs Beach Campground - Prairie Creek Redwoods State Park'), 'gold bluffs beach', 'S22: an NPS " - <park>" suffix is dropped (0027)');
select is(public.normalize_campground_name('Ah-Gwah-Ching Campground'), 'ah gwah ching', 'S23: a hyphen without spaces is kept as a word break');

-- Run 1 (MN): A new; B a duplicate of ridb:t1 (15 m, same words); C near ridb:t1 with
-- another name (a near miss, kept). ---------------------------------------------------
create temporary table r1 as select pg_temp.run('MN', jsonb_build_array(
  pg_temp.el('osm:node/1', 'Itasca State Park Campground', -95.2, 47.2),
  pg_temp.el('osm:way/2', 'Birch Lake State Forest Campground', -94.5001, 46.0001),
  pg_temp.el('osm:node/3', 'Pine Point', -94.5005, 46.0005),
  pg_temp.el('osm:node/7', 'Gold Bluffs Beach Campground', -91.0029, 44.0)), '{osm:node/9}', 5) as j;

select is((select j->>'status' from r1), 'ok', 'R1: the first run is ok');
select is((select (j->>'kept_new')::int from r1), 2, 'R1: two new campgrounds');
select is((select (j->>'dropped_duplicate')::int from r1), 2, 'R1: two duplicates dropped');
select ok(not exists (select 1 from public.campgrounds where id = 'osm:node/7'), 'R1: a duplicate of an NPS name with a " - <park>" suffix is dropped (0027)');
select ok(not exists (select 1 from public.campgrounds where id = 'osm:way/2'), 'R1: the duplicate was never inserted');
select is((select agency || '/' || source from public.campgrounds where id = 'osm:node/1'), 'STATE/osm', 'R1: an OSM row is agency STATE, source osm');
select is((select overpass_state from public.osm_campgrounds where campground_id = 'osm:node/1'), 'MN', 'R1: its Overpass state is recorded');
select ok((select near_misses @> '[{"osm_id":"osm:node/3","other_id":"ridb:t1"}]' from public.osm_sync_runs where state = 'MN' order by id limit 1), 'R1: the near miss is logged');
select ok(exists (select 1 from public.nearest_campgrounds(47.2, -95.2, 5) where id = 'osm:node/1'), 'R1: search finds the new campground');
select is((select count(*)::int from public.start_osm_sync_run('MN')), 1, 'R1: a new run can start once the last one finished');
select is((select count(*)::int from public.start_osm_sync_run('MN')), 0, 'R1: no second run starts while one is running');
update public.osm_sync_runs set status = 'failed', finished_at = now() where status = 'running';
select throws_ok($$ select public.start_osm_sync_run('ZZ') $$, '22023', null, 'R1: an unknown state is refused');

-- A WI osm row that MN runs must never touch, and a favorite on C.
insert into public.campgrounds (id, name, location, agency, source) values
  ('osm:node/50', 'Wisconsin One', st_setsrid(st_point(-89.5, 44.5), 4326)::geography, 'STATE', 'osm');
insert into public.osm_campgrounds (campground_id, overpass_state, last_seen_at) values ('osm:node/50', 'WI', now());
insert into public.favorites (user_id, campground_id) values ('11111111-1111-1111-1111-111111111111', 'osm:node/3');

-- Run 2 (MN): A, D, E; C is gone → retired, never deleted. ---------------------------
select is((pg_temp.run('MN', jsonb_build_array(
  pg_temp.el('osm:node/1', 'Itasca State Park Campground', -95.2, 47.2),
  pg_temp.el('osm:node/4', 'Dee State Park', -93.0, 45.0),
  pg_temp.el('osm:node/5', 'Ee State Forest', -92.5, 45.5)), '{}', 3))->>'status', 'ok', 'R2: the run is ok');
select is(pg_temp.reason('osm:node/3'), 'gone_from_osm', 'R2: a campground OSM no longer lists is retired as gone');
select ok(not exists (select 1 from public.nearest_campgrounds(46.0, -94.5, 50) where id = 'osm:node/3'), 'R2: search leaves the retired campground out');
select is((select retired from public.get_campgrounds_by_ids(array['osm:node/3'])), true, 'R2: favorites still get it, flagged retired');
select ok(exists (select 1 from public.favorites where campground_id = 'osm:node/3'), 'R2: the favorite on it survives');
select is(pg_temp.reason('osm:node/50'), 'live', 'R2: an MN run never retires a WI campground');
select is((select retired from public.get_campgrounds_by_ids(array['osm:node/1'])), false, 'R2: a live campground is flagged not retired');

-- Run 3 (MN): C comes back (unretired); D is now classified out. ----------------------
create temporary table r3 as select pg_temp.run('MN', jsonb_build_array(
  pg_temp.el('osm:node/1', 'Itasca State Park Campground', -95.2, 47.2),
  pg_temp.el('osm:node/5', 'Ee State Forest', -92.5, 45.5),
  pg_temp.el('osm:node/3', 'Pine Point', -94.5005, 46.0005)), '{osm:node/4}', 4) as j;
select is(pg_temp.reason('osm:node/3'), 'live', 'R3: a campground that reappears is unretired');
select is((select (j->>'unretired')::int from r3), 1, 'R3: ... and counted');
select is(pg_temp.reason('osm:node/4'), 'not_state_run', 'R3: one now classified out is retired as not state-run');

-- Run 4 (MN): only 1 of last time's 3 kept → guarded, nothing retired. -----------------
select is((pg_temp.run('MN', jsonb_build_array(
  pg_temp.el('osm:node/1', 'Itasca State Park Campground', -95.2, 47.2)), '{}', 10))->>'status', 'guarded', 'R4: under half of last time is guarded');
select is(pg_temp.reason('osm:node/5'), 'live', 'R4: ... and retires nothing');
select is((pg_temp.run('MN', '[]'::jsonb, '{}', 0))->>'status', 'guarded', 'R4: an empty Overpass result is guarded');
select is(pg_temp.reason('osm:node/3'), 'live', 'R4: ... and retires nothing');

-- Run 5 (MN): RIDB now lists A's campground too → the OSM row retires as a duplicate. --
insert into public.campgrounds (id, name, location, agency, source) values
  ('ridb:t3', 'Itasca Campground', st_setsrid(st_point(-95.2001, 47.2001), 4326)::geography, 'USFS', 'ridb');
insert into before_hash select id, md5(row(c.*)::text) from public.campgrounds c where id = 'ridb:t3';
select is((pg_temp.run('MN', jsonb_build_array(
  pg_temp.el('osm:node/1', 'Itasca State Park Campground', -95.2, 47.2),
  pg_temp.el('osm:node/5', 'Ee State Forest', -92.5, 45.5),
  pg_temp.el('osm:node/3', 'Pine Point', -94.5005, 46.0005)), '{}', 3))->>'status', 'ok', 'R5: the run is ok');
select is(pg_temp.reason('osm:node/1'), 'duplicate', 'R5: an OSM row that now duplicates RIDB is retired as a duplicate');
select is((select count(*)::int from public.campgrounds c join before_hash b using (id) where md5(row(c.*)::text) <> b.h), 0,
  'R5: no NPS or RIDB row changed in any run');
select throws_ok($$ select public.apply_osm_sync_state(1, '[]'::jsonb, '{}', '{}', 0, 0, '{}'::jsonb) $$, '22023', null,
  'R5: a finished run cannot be applied again');

-- Run 6 (MN): C kept but with no usable point → left exactly as it is. ----------------
create temporary table r6 as select pg_temp.run('MN', jsonb_build_array(
  pg_temp.el('osm:node/5', 'Ee State Forest', -92.5, 45.5),
  pg_temp.el('osm:node/1', 'Itasca State Park Campground', -95.2, 47.2)), '{}', 3, '{osm:node/3}') as j;
select is((select j->>'status' from r6), 'ok', 'U1: the run is ok');
select is(pg_temp.reason('osm:node/3'), 'live', 'U1: a kept campground with no usable point is not retired');
select is((select dropped_no_point from public.osm_sync_runs where state = 'MN' order by id desc limit 1), 1, 'U1: ... and is counted');

-- Runs 7–10 (MN): a real drop to 0 kept (with data) is guarded 3 times, then accepted. --
select is((pg_temp.run('MN', '[]'::jsonb, '{}', 10))->>'status', 'guarded', 'G1: a drop to 0 kept is guarded (1)');
select is((pg_temp.run('MN', '[]'::jsonb, '{}', 10))->>'status', 'guarded', 'G2: ... (2)');
select is((pg_temp.run('MN', '[]'::jsonb, '{}', 0))->>'status', 'guarded', 'G3: an empty result is guarded and doesn''t count toward accepting');
select is((pg_temp.run('MN', '[]'::jsonb, '{}', 10))->>'status', 'guarded', 'G4: ... (3)');
select is(pg_temp.reason('osm:node/5'), 'live', 'G4: nothing retired while guarded');
select is((pg_temp.run('MN', '[]'::jsonb, '{}', 10))->>'status', 'ok', 'G5: the 4th guarded-sized result in a row is accepted');
select is(pg_temp.reason('osm:node/5'), 'gone_from_osm', 'G5: ... and retires what is gone');

-- Picking the due state, timeouts and failures. --------------------------------------
insert into public.osm_sync_runs (state, status, started_at) values ('TX', 'running', now() - interval '11 minutes');
select is((select state from public.start_osm_sync_run()), 'AK', 'P1: with no state given, the first never-tried state is picked');
select is((select status || '/' || error from public.osm_sync_runs where state = 'TX'), 'failed/timed out', 'P2: a run stuck for over 10 minutes is marked failed');
select public.fail_osm_sync_run((select id from public.osm_sync_runs where state = 'AK'), 'Overpass 502');
select is((select status from public.osm_sync_runs where state = 'AK'), 'failed', 'P3: a failed run is recorded');
select is((select state from public.start_osm_sync_run()), 'AL', 'P4: a failed state goes to the back of the queue');
update public.osm_sync_runs set status = 'failed', finished_at = now() where status = 'running';
insert into public.osm_sync_runs (state, status, finished_at)
  select code, 'ok', now() from unnest(public.osm_sync_states()) as code where code <> 'AK';
select is((select count(*)::int from public.start_osm_sync_run()), 0, 'P5: a state tried under 6 hours ago is not picked, even when it is the only one due');
update public.osm_sync_runs set started_at = now() - interval '7 hours' where state = 'AK';
select is((select state from public.start_osm_sync_run()), 'AK', 'P6: ... and is picked again after 6 hours');
update public.osm_sync_runs set status = 'failed', finished_at = now() where status = 'running';

-- Who can read the run log and the OSM facts. ------------------------------------------
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.osm_sync_runs), 0, 'A1: a plain user reads no sync runs');
select is((select count(*)::int from public.osm_campgrounds), 0, 'A2: a plain user reads no OSM facts');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select ok((select count(*) from public.osm_sync_runs) > 0, 'A3: an admin reads the sync runs');
select ok((select count(*) from public.osm_campgrounds) > 0, 'A4: an admin reads the OSM facts');
reset role;

select * from finish();
rollback;
