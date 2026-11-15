-- Tests for 0024_campground_state_from_location.sql (bug 6 part A, Shawn,
-- 2026-11-15; spec ~/plans/2026-11-15-state-backfill-design.md on Lisa,
-- sections 5 and 7). A campground's state comes from its location, with the
-- source's state kept within 1 km of its border, a manual override above both,
-- and a log of every change.
-- The tests use their own two square "states" (MN and WI, sharing the line
-- lng = -92), never the real boundaries, so they don't depend on the dev seed.
-- Run on ralph from the repo root: supabase test db. Rolled back at the end.
begin;
select plan(47);

-- One plain user and one admin. The sign-up trigger makes their public.users rows.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'user-a@test.local', '{"display_name":"A"}'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'admin-b@test.local', '{"display_name":"B"}');
update public.users set role = 'admin' where id = '22222222-2222-2222-2222-222222222222';

-- act_as(uid): become that signed-in user for the statements that follow.
create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- The two test states. MN: lng -97..-92, lat 43..49. WI: lng -92..-87, lat 42..47.
create function pg_temp.load_squares() returns void language sql as $$
  delete from geo.us_states;
  insert into geo.us_states (code, name, fips, boundary) values
    ('MN', 'Test MN', '27', st_multi(st_makeenvelope(-97, 43, -92, 49, 4326))),
    ('WI', 'Test WI', '55', st_multi(st_makeenvelope(-92, 42, -87, 47, 4326)));
$$;

-- sync(id, lng, lat, state): the shape of nps-sync/ridb-sync's PostgREST upsert.
create function pg_temp.sync(p_id text, p_lng float8, p_lat float8, p_state text) returns void language sql as $$
  insert into public.campgrounds (id, name, location, agency, source, state)
  values (p_id, 'Test ' || p_id, st_setsrid(st_point(p_lng, p_lat), 4326)::geography, 'USFS', 'ridb', p_state)
  on conflict (id) do update set name = excluded.name, location = excluded.location,
    agency = excluded.agency, source = excluded.source, state = excluded.state;
$$;

create function pg_temp.got(p_id text) returns text language sql as $$
  select coalesce(state, '-') || '/' || coalesce(state_reason, '-') from public.campgrounds where id = p_id;
$$;

create function pg_temp.logs(p_id text) returns int language sql as $$
  select count(*)::int from public.campground_state_log where campground_id = p_id;
$$;

select pg_temp.load_squares();

-- Points: in-MN (-94.5, 46); in-WI (-89.5, 44.5); near-border-in-MN (-92.005, 45),
-- about 390 m from WI; far-in-MN (-92.05, 45), about 3.9 km from WI;
-- outside both (-80, 30); zero (0, 0).

-- T1: no source state, inside MN → filled in from location, logged once.
select pg_temp.sync('test:fill', -94.5, 46, null);
select is((select state from public.campgrounds where id = 'test:fill'), 'MN', 'T1: a campground with no source state gets the state its location is in');
select is((select state_reason from public.campgrounds where id = 'test:fill'), 'location_filled', 'T1: ... with reason location_filled');
select ok((select source_state from public.campgrounds where id = 'test:fill') is null, 'T1: ... and its source_state stays null');
select is(pg_temp.logs('test:fill'), 1, 'T1: ... and one log row');
select ok(exists (select 1 from public.campground_state_log where campground_id = 'test:fill'
  and old_state is null and new_state = 'MN' and reason = 'location_filled' and location_state = 'MN'),
  'T1: ... which records null → MN, location_filled');

-- T2: source agrees with location → source, no log.
select pg_temp.sync('test:agree', -89.5, 44.5, 'WI');
select is(pg_temp.got('test:agree'), 'WI/source', 'T2: a source state that matches the location is kept as source');
select is(pg_temp.logs('test:agree'), 0, 'T2: ... and nothing is logged');

-- T3: source WI, location MN, 3.9 km from WI → location wins, logged with the distance.
select pg_temp.sync('test:far', -92.05, 45, 'WI');
select is(pg_temp.got('test:far'), 'MN/location_overrode', 'T3: a source state more than 1 km away is replaced by the location''s state');
select ok((select distance_m from public.campground_state_log where campground_id = 'test:far' and reason = 'location_overrode') between 3000 and 5000,
  'T3: ... and the log records the distance to the source''s state');

-- T4: source WI, location MN but 390 m from WI → source kept, near_border.
select pg_temp.sync('test:near', -92.005, 45, 'WI');
select is(pg_temp.got('test:near'), 'WI/near_border', 'T4: within 1 km of the source''s state, the source state is kept');
select ok((select distance_m from public.campground_state_log where campground_id = 'test:near' and reason = 'near_border') < 1000,
  'T4: ... logged as near_border with its distance');

-- T5: outside every state → source kept, no_boundary, logged.
select pg_temp.sync('test:out', -80, 30, 'WI');
select is(pg_temp.got('test:out'), 'WI/no_boundary', 'T5: a point in no state keeps the source state');
select is(pg_temp.logs('test:out'), 1, 'T5: ... and is logged');

-- T6: at 0,0 → no_location, not logged.
select pg_temp.sync('test:zero', 0, 0, null);
select is(pg_temp.got('test:zero'), '-/no_location', 'T6: a campground at 0,0 keeps its (null) source state as no_location');
select is(pg_temp.logs('test:zero'), 0, 'T6: ... and is not logged');

-- T7: no boundary data loaded → source kept, no_geo_data, not logged.
delete from geo.us_states;
select pg_temp.sync('test:nogeo', -94.5, 46, 'WI');
select is(pg_temp.got('test:nogeo'), 'WI/no_geo_data', 'T7: with no boundaries loaded, the source state is kept as no_geo_data');
select is(pg_temp.logs('test:nogeo'), 0, 'T7: ... and nothing is logged');
select pg_temp.load_squares();

-- T8: the catch. A sync sending state = null over a filled row changes nothing.
select pg_temp.sync('test:fill', -94.5, 46, null);
select is((select state from public.campgrounds where id = 'test:fill'), 'MN', 'T8: a sync that sends no state does not wipe a filled-in state');
select is(pg_temp.logs('test:fill'), 1, 'T8: ... and writes no log row');

-- T9: an update that doesn't touch state keeps source_state.
update public.campgrounds set name = 'renamed' where id = 'test:far';
select is((select source_state || '/' || state from public.campgrounds where id = 'test:far'), 'WI/MN', 'T9: an update that does not touch state keeps source_state and state');
select is(pg_temp.logs('test:far'), 1, 'T9: ... and writes no log row');

-- T10: an override sticks across a sync; clearing it brings back the computed state.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select is((select state || '/' || state_reason from public.admin_set_campground_state_override('test:far', 'WI')), 'WI/manual', 'T10: an admin override sets the state');
reset role;
select pg_temp.sync('test:far', -92.05, 45, 'WI');
select is(pg_temp.got('test:far'), 'WI/manual', 'T10: ... and survives a sync');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select is((select state || '/' || state_reason from public.admin_set_campground_state_override('test:far', null)), 'MN/location_overrode', 'T10: clearing it brings back the location''s state');
reset role;
select is((select count(*)::int from public.campground_state_log where campground_id = 'test:far' and changed_by = '22222222-2222-2222-2222-222222222222'), 2,
  'T10: both changes are logged with the admin''s id');

-- T11: the override RPC's checks.
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select throws_ok($$ select * from public.admin_set_campground_state_override('test:agree', 'WI') $$, '42501', null, 'T11: a non-admin cannot set an override');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select throws_ok($$ select * from public.admin_set_campground_state_override('test:agree', 'ZZ') $$, '22023', null, 'T11: an unknown state code is refused');
select throws_ok($$ select * from public.admin_set_campground_state_override('test:nope', 'WI') $$, 'P0002', null, 'T11: an unknown campground is refused');
select is((select state || '/' || state_reason from public.admin_set_campground_state_override('test:agree', ' wi')), 'WI/manual', 'T11: the code is trimmed and upper-cased');
select lives_ok($$ select * from public.admin_set_campground_state_override('test:agree', null) $$, 'T11: ... and the override can be cleared again');
reset role;

-- T12: the log is readable only through the admin RPC.
set local role anon;
select throws_ok('select * from public.campground_state_log', '42501', null, 'T12: anon cannot read the log table');
reset role;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select throws_ok('select * from public.campground_state_log', '42501', null, 'T12: a signed-in user cannot read the log table');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select ok((select count(*) from public.admin_campground_state_log('test:far')) >= 3, 'T12: an admin reads a campground''s log through the RPC');
select is((select new_state || '/' || changed_by::text from public.admin_campground_state_log('test:far') limit 1),
  'MN/22222222-2222-2222-2222-222222222222', 'T12: ... newest first');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select throws_ok($$ select * from public.admin_campground_state_log() $$, '42501', null, 'T12: a non-admin cannot call the log RPC');
reset role;

-- T13: the same sync twice writes nothing new (test:agree has one row, from T11's override).
select pg_temp.sync('test:agree', -89.5, 44.5, 'WI');
select pg_temp.sync('test:agree', -89.5, 44.5, 'WI');
select is(pg_temp.logs('test:agree'), 1, 'T13: repeating a sync with the same values writes no log rows');

-- T14: a filled-in row now matches its state in the Where filter.
select ok(exists (select 1 from public.nearest_campgrounds(46, -94.5, 50, null, 20038000, array['MN'], null) where id = 'test:fill'),
  'T14: a campground whose state was filled in comes back under that state''s filter');

-- T15: recompute is for the service role only.
select ok(not has_function_privilege('anon', 'public.recompute_campground_states()', 'execute'), 'T15: anon cannot run recompute');
select ok(not has_function_privilege('authenticated', 'public.recompute_campground_states()', 'execute'), 'T15: authenticated cannot run recompute');

-- T16: a brand-new campground in a multi-row sync upsert is resolved in the same statement.
insert into public.campgrounds (id, name, location, agency, source, state) values
  ('test:new1', 'New one', 'SRID=4326;POINT(-94.5 46)', 'USFS', 'ridb', null),
  ('test:new2', 'New two', 'SRID=4326;POINT(-89.5 44.5)', 'USFS', 'ridb', 'WI')
on conflict (id) do update set name = excluded.name, location = excluded.location,
  agency = excluded.agency, source = excluded.source, state = excluded.state;
select is(pg_temp.got('test:new1'), 'MN/location_filled', 'T16: a new row with no source state is filled in by the same statement');
select is(pg_temp.got('test:new2'), 'WI/source', 'T16: a new row whose source agrees is kept');
select is(pg_temp.logs('test:new1') + pg_temp.logs('test:new2'), 1, 'T16: ... with exactly one log row between them');

-- T17: moving a campground re-resolves its state and keeps source_state.
update public.campgrounds set location = 'SRID=4326;POINT(-89.5 44.5)' where id = 'test:fill';
select is(pg_temp.got('test:fill'), 'WI/location_filled', 'T17: a location change re-resolves the state');
select ok((select source_state from public.campgrounds where id = 'test:fill') is null, 'T17: ... and keeps the (null) source_state');
select is(pg_temp.logs('test:fill'), 2, 'T17: ... with one more log row');

-- T18: recompute is idempotent.
select results_eq('select * from public.recompute_campground_states() order by 1',
                  'select * from public.recompute_campground_states() order by 1',
                  'T18: running recompute twice gives the same counts');
create temp table t18_logs as select count(*)::int as n from public.campground_state_log;
do $$ begin perform public.recompute_campground_states(); end $$;
select is((select count(*)::int from public.campground_state_log), (select n from t18_logs), 'T18: ... and another run writes no log rows');

select * from finish();
rollback;
