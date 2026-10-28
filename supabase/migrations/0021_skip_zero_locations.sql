-- Campgrounds at exactly 0,0 have no known location: RIDB sends 0 for both
-- coordinates when it doesn't know them, and ridb-sync stored them as real
-- points (212 rows in production, all RIDB; Shawn, 2026-10-27). They aren't
-- "near" anything, so search leaves them out. get_campgrounds_by_ids is
-- unchanged, so favorites and trip stops that point at one keep working.
-- ridb-sync now skips 0,0 facilities too (supabase/functions/ridb-sync/transform.ts).
-- Tested by supabase/tests/zero_location_test.sql.
--
-- Same signature, body and settings as 0015/0019, plus the one condition.
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
    and (state_filter is null or c.state is null or c.state = any(state_filter))
    and (park_filter is null or c.park_code = any(park_filter))
    and (
      max_distance_m is null
      or st_dwithin(c.location, st_setsrid(st_point(user_lng, user_lat), 4326)::geography, max_distance_m)
    )
  order by c.location <-> st_setsrid(st_point(user_lng, user_lat), 4326)::geography
  limit (case when max_distance_m is not null then null else result_limit end);
$$;
