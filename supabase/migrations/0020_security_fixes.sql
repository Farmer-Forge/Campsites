-- Security and integrity fixes for V1.1, asked for by Shawn on 2026-10-24
-- after reviewing the schema contract (docs/superpowers/specs/
-- 2026-10-24-schema-contract-design.md, "Fixes"). Tested by
-- supabase/tests/security_fixes_test.sql.
--
-- V1's production database doesn't have these; V1 is frozen.

-- 1. users: each signed-in user reads only their own row. "anyone can read
--    profiles" let anyone, signed in or not, list every user's name, role and
--    suspension. Admins list users through get_users_for_admin(), which is
--    security definer and unaffected.
drop policy "anyone can read profiles" on public.users;
create policy "users can read own row" on public.users
  for select to authenticated using (auth.uid() = id);
revoke all on table public.users from anon;

-- 2. Suspension is enforced by the database. A suspended account keeps
--    reading its own users row (the app reads `suspended` to sign it out),
--    but its favorites, trips and trip stops are closed to it, and it can't
--    change its own row.
create function public.is_active_user(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.users where id = uid and not suspended);
$$;
revoke all on function public.is_active_user(uuid) from public;
grant execute on function public.is_active_user(uuid) to anon, authenticated, service_role;

drop policy "users manage own favorites" on public.favorites;
create policy "users manage own favorites" on public.favorites
  using (auth.uid() = user_id and public.is_active_user(auth.uid()))
  with check (auth.uid() = user_id and public.is_active_user(auth.uid()));

drop policy "users manage own trips" on public.trips;
create policy "users manage own trips" on public.trips
  using (auth.uid() = user_id and public.is_active_user(auth.uid()))
  with check (auth.uid() = user_id and public.is_active_user(auth.uid()));

drop policy "users manage own trip stops" on public.trip_stops;
create policy "users manage own trip stops" on public.trip_stops
  using (
    public.is_active_user(auth.uid())
    and exists (select 1 from public.trips where trips.id = trip_stops.trip_id and trips.user_id = auth.uid())
  ) with check (
    public.is_active_user(auth.uid())
    and exists (select 1 from public.trips where trips.id = trip_stops.trip_id and trips.user_id = auth.uid())
  );

drop policy "users can update own profile" on public.users;
create policy "users can update own profile" on public.users
  for update using (auth.uid() = id and public.is_active_user(auth.uid()));

-- 3. A suspended admin has no admin powers: is_admin also requires the
--    account to be active. Every admin function, the campground_attributes
--    policy and the admin edge functions go through it.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.users where id = uid and role = 'admin' and not suspended);
$$;

-- 4. There is always at least one active admin. Admins can't demote or
--    suspend themselves already; this also covers deleting the last admin's
--    account (auth.users deletes cascade to users) and changes made outside
--    the admin functions.
create function public.guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.role = 'admin' and not old.suspended
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.suspended)
     and not exists (
       select 1 from public.users
       where id <> old.id and role = 'admin' and not suspended
     ) then
    raise exception 'cannot remove the last admin';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.guard_last_admin() from public, anon, authenticated;

create trigger users_guard_last_admin
  before update of role, suspended or delete on public.users
  for each row execute function public.guard_last_admin();

-- 5. Trip stop positions are unique within a trip. The constraint is checked
--    at the end of each statement, so reorder_trip_stops can move every stop
--    in one update. (V1 reordered with one update per stop, which a unique
--    position would break part-way.)
alter table public.trip_stops
  add constraint trip_stops_trip_id_position_key unique (trip_id, position)
  deferrable initially immediate;

create function public.reorder_trip_stops(p_trip_id uuid, p_stop_ids uuid[])
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.trip_stops s
  set position = array_position(p_stop_ids, s.id) - 1
  where s.trip_id = p_trip_id
    and s.id = any(p_stop_ids);
$$;
revoke all on function public.reorder_trip_stops(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_trip_stops(uuid, uuid[]) to authenticated, service_role;

-- 6. Constraint names left over from the profiles → users rename (0004).
alter table public.users rename constraint profiles_pkey to users_pkey;
alter table public.users rename constraint profiles_id_fkey to users_id_fkey;
