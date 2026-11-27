-- Saved filters, and the Park filter's "Not in a national park" choice (Shawn, 2026-11-27;
-- design ~/plans/2026-11-27-campsites-saved-filters-design.md on Lisa; spec 1, Fixes #13).
-- Hand-written and applied by hand (CLAUDE.md hard rule 3), additive only.
--
-- 1. nearest_campgrounds: an empty string in park_filter means "campgrounds with no park
--    code" (every RIDB and OSM campground), so "Park = Ozark + Not in a national park" shows
--    NSR and the state campgrounds together. '' is never a real park code. Same signature,
--    body and settings as 0025 apart from that one line; create or replace keeps the grants.
-- 2. saved_filters: a user's named Finder filters. Own rows only (read, add, delete; no
--    update), active users only (as favorites), at most 20 per user, names unique per user
--    ignoring case.
-- Tested by supabase/tests/saved_filters_test.sql.

-- 1. The park rule -------------------------------------------------------------------

create or replace function public.nearest_campgrounds(
  user_lat double precision,
  user_lng double precision,
  result_limit integer default 50,
  agency_filter text[] default null,
  max_distance_m double precision default null,
  state_filter text[] default null,
  park_filter text[] default null
)
returns table (
  id text, park_code text, name text, description text,
  lat double precision, lng double precision,
  agency text, state text, amenities jsonb, fees jsonb,
  reservation_url text, directions_url text, images jsonb, contact jsonb,
  distance_m double precision
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    c.id, c.park_code, c.name, c.description,
    st_y(c.location::geometry) as lat,
    st_x(c.location::geometry) as lng,
    c.agency, c.state, c.amenities, c.fees, c.reservation_url, c.directions_url,
    c.images, c.contact,
    st_distance(c.location, st_setsrid(st_point(user_lng, user_lat), 4326)::geography) as distance_m
  from public.campgrounds c
  where not (st_x(c.location::geometry) = 0 and st_y(c.location::geometry) = 0)
    and c.retired_at is null
    and (agency_filter is null or c.agency = any(agency_filter))
    and (state_filter is null or c.state = any(state_filter))
    and (park_filter is null or c.park_code = any(park_filter) or ('' = any(park_filter) and c.park_code is null))
    and (
      max_distance_m is null
      or st_dwithin(c.location, st_setsrid(st_point(user_lng, user_lat), 4326)::geography, max_distance_m)
    )
  order by c.location <-> st_setsrid(st_point(user_lng, user_lat), 4326)::geography
  limit (case when max_distance_m is not null then null else result_limit end);
$$;

-- 2. Saved filters ------------------------------------------------------------------

create table public.saved_filters (
  id int generated always as identity primary key,
  -- cascade: a saved filter means nothing without its user.
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  -- At least one agency (an empty list would match nothing); no nulls in any list.
  agencies text[] not null check (cardinality(agencies) > 0 and array_position(agencies, null) is null),
  states text[] check (states is null or (cardinality(states) > 0 and array_position(states, null) is null)),        -- null: all states
  parks text[] check (parks is null or (cardinality(parks) > 0 and array_position(parks, null) is null)),         -- null: all parks; '' stands for "Not in a national park"
  is_near_me boolean not null,
  radius_miles int not null check (radius_miles between 1 and 1000),
  created_at timestamptz not null default now()
);
-- The unique index leads with user_id, so it also serves per-user lookups and the count.
create unique index saved_filters_user_id_lower_name_idx on public.saved_filters (user_id, lower(name));

alter table public.saved_filters enable row level security;
revoke all on public.saved_filters from anon, authenticated;
revoke all on sequence public.saved_filters_id_seq from anon, authenticated;
grant select, insert, delete on public.saved_filters to authenticated;

create policy "users read own saved_filters" on public.saved_filters
  for select to authenticated
  using (auth.uid() = user_id and public.is_active_user(auth.uid()));
create policy "users add own saved_filters" on public.saved_filters
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_active_user(auth.uid()));
create policy "users delete own saved_filters" on public.saved_filters
  for delete to authenticated
  using (auth.uid() = user_id and public.is_active_user(auth.uid()));

-- At most 20 per user. The advisory lock makes two saves at once count each other under
-- READ COMMITTED (PostgREST's and Supabase's default). A row for someone else is left to the
-- insert policy to refuse (42501) without counting, so the error never tells a caller
-- whether another user is at the limit.
create function public.saved_filters_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('saved_filters:' || new.user_id::text));
  if (select count(*) from public.saved_filters where user_id = new.user_id) >= 20 then
    raise exception 'saved filter limit reached (20)' using errcode = 'P0001', hint = 'saved_filters_limit';
  end if;
  return new;
end;
$$;
revoke all on function public.saved_filters_enforce_limit() from public, anon, authenticated;

create trigger saved_filters_limit
  before insert on public.saved_filters
  for each row execute function public.saved_filters_enforce_limit();
