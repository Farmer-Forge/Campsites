-- Tests for 0020_security_fixes.sql (Shawn, 2026-10-24). Run on ralph from the
-- repo root: supabase test db. Everything happens in one transaction that is
-- rolled back, so the local database is left as it was.
begin;
select plan(22);

-- Three accounts: a normal user and two admins. The sign-up trigger makes
-- their public.users rows.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'user-a@test.local', '{"display_name":"A"}'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'admin-b@test.local', '{"display_name":"B"}'),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'admin-c@test.local', '{"display_name":"C"}');
update public.users set role = 'admin' where id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

insert into public.campgrounds (id, name, location) values
  ('test:1', 'Test One', 'SRID=4326;POINT(-90 38)'),
  ('test:2', 'Test Two', 'SRID=4326;POINT(-91 39)'),
  ('test:3', 'Test Three', 'SRID=4326;POINT(-92 40)');

-- act_as(uid): become that signed-in user for the statements that follow.
create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- 1. Nobody reads other people's users rows.
set local role anon;
select throws_ok('select * from public.users', '42501', null, 'anon cannot read users at all');
reset role;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.users), 1, 'a signed-in user sees only their own users row');
select is((select string_agg(display_name, ',') from public.users), 'A', '... and it is theirs');
reset role;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select ok((select count(*) from public.get_users_for_admin()) >= 3, 'an admin still lists every user through get_users_for_admin');
reset role;

-- V1 behavior that must keep working for an active user.
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$ insert into public.favorites (user_id, campground_id) values ('11111111-1111-1111-1111-111111111111', 'test:1') $$, 'an active user can add a favorite');
select lives_ok($$ insert into public.trips (id, user_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Trip') $$, 'an active user can create a trip');
select lives_ok($$ insert into public.trip_stops (id, trip_id, campground_id, position) values
  ('b1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test:1', 0),
  ('b2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test:2', 1),
  ('b3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test:3', 2) $$, 'an active user can add trip stops');
select lives_ok($$ update public.users set theme = 'dark' where id = '11111111-1111-1111-1111-111111111111' $$, 'an active user can change their theme');

-- 2. Trip stop positions are unique per trip, and reordering happens in one call.
select throws_ok($$ insert into public.trip_stops (trip_id, campground_id, position) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test:1', 0) $$, '23505', null, 'two stops in one trip cannot share a position');
select lives_ok($$ select public.reorder_trip_stops('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', array['b3333333-3333-3333-3333-333333333333', 'b1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222']::uuid[]) $$, 'reorder_trip_stops reorders a whole trip in one call');
select results_eq($$ select campground_id from public.trip_stops where trip_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' order by position $$,
  array['test:3', 'test:1', 'test:2'], '... into the given order');
reset role;

-- 3. Suspension is enforced by the database, not only the app.
update public.users set suspended = true where id = '11111111-1111-1111-1111-111111111111';
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.favorites), 0, 'a suspended user sees none of their favorites');
select is((select count(*)::int from public.trips), 0, 'a suspended user sees none of their trips');
select throws_ok($$ insert into public.favorites (user_id, campground_id) values ('11111111-1111-1111-1111-111111111111', 'test:2') $$, '42501', null, 'a suspended user cannot add a favorite');
select is((select suspended from public.users where id = '11111111-1111-1111-1111-111111111111'), true, 'a suspended user can still read their own row (the app signs them out from it)');
update public.users set theme = 'light' where id = '11111111-1111-1111-1111-111111111111';
reset role;
select is((select theme from public.users where id = '11111111-1111-1111-1111-111111111111'), 'dark', 'a suspended user cannot change their own row');

-- 4. A suspended admin has no admin powers.
update public.users set suspended = true where id = '33333333-3333-3333-3333-333333333333';
select is(public.is_admin('33333333-3333-3333-3333-333333333333'), false, 'is_admin is false for a suspended admin');
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select throws_ok('select * from public.get_users_for_admin()', 'P0001', 'not authorized', 'a suspended admin cannot use admin functions');
reset role;

-- 5. The last active admin can't be removed: B is now the only active admin
-- once the dev seed's admin (if present) is suspended too.
update public.users set suspended = true where role = 'admin' and id <> '22222222-2222-2222-2222-222222222222';
select throws_ok($$ update public.users set role = 'user' where id = '22222222-2222-2222-2222-222222222222' $$, 'P0001', 'cannot remove the last admin', 'the last active admin cannot be demoted');
select throws_ok($$ delete from auth.users where id = '22222222-2222-2222-2222-222222222222' $$, 'P0001', 'cannot remove the last admin', 'the last active admin cannot be deleted (account deletion cascades to users)');

-- 6. Leftover constraint names from the profiles → users rename are fixed.
select ok(exists (select 1 from pg_constraint where conname = 'users_pkey' and conrelid = 'public.users'::regclass), 'users primary key is named users_pkey');
select ok(exists (select 1 from pg_constraint where conname = 'users_id_fkey' and conrelid = 'public.users'::regclass), 'users foreign key is named users_id_fkey');

select * from finish();
rollback;
