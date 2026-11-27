-- Tests for 0028_saved_filters.sql (Shawn, 2026-11-27; design
-- ~/plans/2026-11-27-campsites-saved-filters-design.md on Lisa, sections 5.1–5.2):
-- the Park filter's "Not in a national park" ('' in park_filter), and saved_filters
-- (own rows only, no update, active users only, 20 per user, unique names ignoring case).
-- Test campgrounds sit in the open Pacific (lat 10, lng -150), so no dev-seed row is near.
-- Run on ralph from the repo root: supabase test db. Rolled back at the end.
begin;
select plan(35);

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'sf-a@test.local', '{"display_name":"A"}'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'sf-b@test.local', '{"display_name":"B"}'),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'sf-c@test.local', '{"display_name":"C"}');
update public.users set suspended = true where id = '33333333-3333-3333-3333-333333333333';

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.be_postgres() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
  select set_config('role', 'postgres', true);
$$;

-- found(park_filter): the test campgrounds the search returns, by id, comma-joined.
create function pg_temp.found(p_parks text[]) returns text language sql as $$
  select coalesce(string_agg(id, ',' order by id collate "C"), '-')
  from public.nearest_campgrounds(10.0, -150.0, 50, null, 5000, null, p_parks)
  where id like 'sf:%';
$$;

insert into public.campgrounds (id, park_code, name, location, agency, source) values
  ('sf:nps-a', 'tsta', 'Park A Campground', st_setsrid(st_point(-150.00, 10.00), 4326)::geography, 'NPS', 'nps'),
  ('sf:nps-b', 'tstb', 'Park B Campground', st_setsrid(st_point(-150.01, 10.00), 4326)::geography, 'NPS', 'nps'),
  ('sf:ridb', null, 'Forest Campground', st_setsrid(st_point(-150.00, 10.01), 4326)::geography, 'USFS', 'ridb'),
  ('sf:osm', null, 'State Campground', st_setsrid(st_point(-150.01, 10.01), 4326)::geography, 'STATE', 'osm');

-- The park rule ----------------------------------------------------------------------
select is(pg_temp.found(null), 'sf:nps-a,sf:nps-b,sf:osm,sf:ridb', 'K1: no park filter returns every campground');
select is(pg_temp.found(array['tsta']), 'sf:nps-a', 'K2: one park returns only that park (as before)');
select is(pg_temp.found(array['tsta', '']), 'sf:nps-a,sf:osm,sf:ridb', 'K3: a park plus Not in a national park adds every campground with no park code');
select is(pg_temp.found(array['']), 'sf:osm,sf:ridb', 'K4: Not in a national park alone returns only campgrounds with no park code');
select is(pg_temp.found(array['tsta', 'tstb']), 'sf:nps-a,sf:nps-b', 'K5: parks without the new choice still leave out campgrounds with no park code');
select is((select count(*)::int from public.nearest_campgrounds(10.0, -150.0, 50, array['STATE'], 5000, null, array['tsta', '']) where id like 'sf:%'), 1,
  'K6: the other filters still apply (STATE only: just the state campground)');

-- Shape and grants -------------------------------------------------------------------
select has_table('public', 'saved_filters', 'S1: saved_filters exists');
select ok(not has_table_privilege('anon', 'public.saved_filters', 'select'), 'S2: anon cannot read saved filters');
select ok(not has_table_privilege('authenticated', 'public.saved_filters', 'update'), 'S3: nobody signed in can update a saved filter');
select ok(has_table_privilege('authenticated', 'public.saved_filters', 'insert'), 'S4: a signed-in user can add saved filters');
select ok(not has_function_privilege('authenticated', 'public.saved_filters_enforce_limit()', 'execute'), 'S5: the limit function cannot be called directly');

-- create(name): insert one saved filter for the current user.
create function pg_temp.save(p_name text) returns void language sql as $$
  insert into public.saved_filters (user_id, name, agencies, states, parks, is_near_me, radius_miles)
  values (auth.uid(), p_name, array['NPS', 'STATE'], array['MO'], array['ozar', ''], false, 50);
$$;

-- Own rows only ----------------------------------------------------------------------
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$ select pg_temp.save('NSR + MO state parks') $$, 'R1: a user saves a filter');
select is((select parks from public.saved_filters where name = 'NSR + MO state parks'), array['ozar', ''], 'R1: ... with Not in a national park stored as an empty string');
select throws_ok($$ insert into public.saved_filters (user_id, name, agencies, is_near_me, radius_miles)
  values ('22222222-2222-2222-2222-222222222222', 'For B', array['NPS'], false, 50) $$, '42501', null, 'R2: a user cannot save a filter for someone else');
select throws_ok($$ select pg_temp.save('nsr + mo STATE PARKS') $$, '23505', null, 'R3: names are unique per user, ignoring case');
select throws_ok($$ select pg_temp.save('   ') $$, '23514', null, 'R4: a blank name is refused');
select throws_ok($$ select pg_temp.save(' Padded ') $$, '23514', null, 'R5: a name with spaces around it is refused (the app trims)');
select throws_ok($$ select pg_temp.save(repeat('x', 61)) $$, '23514', null, 'R6: a name over 60 characters is refused');
select throws_ok($$ update public.saved_filters set name = 'Renamed' $$, '42501', null, 'R7: renaming is refused (no update)');
select throws_ok($$ insert into public.saved_filters (user_id, name, agencies, is_near_me, radius_miles)
  values (auth.uid(), 'No agencies', '{}', false, 50) $$, '23514', null, 'R7b: an empty agency list is refused');
select throws_ok($$ insert into public.saved_filters (user_id, name, agencies, states, is_near_me, radius_miles)
  values (auth.uid(), 'Null state', array['NPS'], array[null::text], false, 50) $$, '23514', null, 'R7c: a null inside a list is refused');

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.saved_filters), 0, 'R8: another user sees none of them');
select lives_ok($$ select pg_temp.save('NSR + MO state parks') $$, 'R9: another user may use the same name');
select lives_ok($$ delete from public.saved_filters where user_id = '11111111-1111-1111-1111-111111111111' $$, 'R10: deleting someone else''s filter runs ...');
select pg_temp.be_postgres();
select is((select count(*)::int from public.saved_filters where user_id = '11111111-1111-1111-1111-111111111111'), 1, 'R10: ... but deletes nothing');

-- Suspended users --------------------------------------------------------------------
insert into public.saved_filters (user_id, name, agencies, is_near_me, radius_miles)
  values ('33333333-3333-3333-3333-333333333333', 'Before suspension', array['NPS'], false, 50);
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select throws_ok($$ select pg_temp.save('While suspended') $$, '42501', null, 'U1: a suspended user cannot save a filter');
select is((select count(*)::int from public.saved_filters), 0, 'U2: a suspended user reads none, even their own');
delete from public.saved_filters where name = 'Before suspension';
select pg_temp.be_postgres();
select is((select count(*)::int from public.saved_filters where name = 'Before suspension'), 1, 'U3: a suspended user cannot delete their own');

-- The limit of 20 ----------------------------------------------------------------------
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$ select pg_temp.save('Filter ' || n) from generate_series(2, 20) as n $$, 'L1: a user can have 20');
select is((select count(*)::int from public.saved_filters), 20, 'L1: ... and has 20');
select throws_ok($$ select pg_temp.save('Filter 21') $$, 'P0001', 'saved filter limit reached (20)', 'L2: the 21st is refused');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select throws_ok($$ insert into public.saved_filters (user_id, name, agencies, is_near_me, radius_miles)
  values ('11111111-1111-1111-1111-111111111111', 'Probe', array['NPS'], false, 50) $$, '42501', null,
  'L2b: saving for a user at the limit is refused as not yours (42501), never by the limit (no leak)');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$ delete from public.saved_filters where name = 'Filter 20' $$, 'L3: a user deletes their own');
select lives_ok($$ select pg_temp.save('Filter 21') $$, 'L3: ... and can then save another');

-- Deleting the user ---------------------------------------------------------------------
select pg_temp.be_postgres();
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.saved_filters where user_id = '11111111-1111-1111-1111-111111111111'), 0, 'C1: a deleted user''s saved filters go with them');

select * from finish();
rollback;
