-- The Where filter let in campgrounds from other states (bug 6 in
-- docs/next-loop-bugs.md; Shawn, 2026-11-14). 0014 made a NULL state pass every
-- state filter so unknown-state rows wouldn't vanish. In production that is 422
-- of the 4,688 searchable campgrounds, so "Midwest only" returned 897 instead of
-- 475, with campgrounds all over the map. Now a state filter returns only rows
-- in those states. With no state filter ("All states"), unknown-state rows still
-- come back. Filling in the missing states from each campground's location is
-- planned for later (bug 6, option A).
-- Tested by supabase/tests/state_filter_test.sql.
--
-- Same signature, body and settings as 0021, minus `c.state is null or`.
-- create or replace keeps the existing grants.
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
    and (agency_filter is null or c.agency = any(agency_filter))
    and (state_filter is null or c.state = any(state_filter))
    and (park_filter is null or c.park_code = any(park_filter))
    and (
      max_distance_m is null
      or st_dwithin(c.location, st_setsrid(st_point(user_lng, user_lat), 4326)::geography, max_distance_m)
    )
  order by c.location <-> st_setsrid(st_point(user_lng, user_lat), 4326)::geography
  limit (case when max_distance_m is not null then null else result_limit end);
$$;
