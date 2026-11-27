-- OSM SAMPLE SEED: three made-up state-run campgrounds in central Minnesota, for reviewers and
-- for the State chip / retired-card checks (design ~/plans/2026-11-26-campsites-state-parks-osm-design.md
-- on Lisa; needs 0025). Safe to run any time; run after seed-sample.sql (Pat must exist).
--   osm:node/900000001  Sample Lake State Park          live
--   osm:way/900000002   Sample River State Forest Camp  live
--   osm:node/900000003  Sample Bluff State Park         retired (gone_from_osm), in Pat's favorites
--   osm:node/900000004  Sample Pines State Forest Camp  retired (gone_from_osm), a stop on Pat's trip
-- Pat also favorites Sample Lake (live), so a live State card can be opened on Favorites.
-- The names are invented, so no real park is misdescribed. They sit 110–140 miles north of
-- Minneapolis, well below the top of the Finder's list, so scroll-check.mjs's fixed cards
-- (the 4th nearest, and so on) stay what they were (moved there 2026-11-26).
insert into public.campgrounds (id, park_code, name, description, location, amenities, fees,
  reservation_url, directions_url, images, contact, updated_at, agency, source, state,
  retired_at, retired_reason)
values
  ('osm:node/900000001', null, 'Sample Lake State Park', 'Operated by Sample State DNR.',
   st_setsrid(st_point(-94.20, 46.60), 4326)::geography, '{"toilets":"yes","potableWater":"yes"}', '[]',
   'https://example.org/sample-lake', '', '[]', '{"phone":"","email":""}', now(), 'STATE', 'osm', 'MN', null, null),
  ('osm:way/900000002', null, 'Sample River State Forest Campground', 'Operated by Sample State DNR.',
   st_setsrid(st_point(-94.60, 46.90), 4326)::geography, '{}', '[]',
   '', '', '[]', '{"phone":"","email":""}', now(), 'STATE', 'osm', 'MN', null, null),
  ('osm:node/900000003', null, 'Sample Bluff State Park', 'Operated by Sample State DNR.',
   st_setsrid(st_point(-93.90, 46.40), 4326)::geography, '{}', '[]',
   '', '', '[]', '{"phone":"","email":""}', now(), 'STATE', 'osm', 'MN', now(), 'gone_from_osm'),
  ('osm:node/900000004', null, 'Sample Pines State Forest Campground', 'Operated by Sample State DNR.',
   st_setsrid(st_point(-94.00, 46.75), 4326)::geography, '{}', '[]',
   'https://example.org/sample-pines', '', '[]', '{"phone":"","email":""}', now(), 'STATE', 'osm', 'MN', now(), 'gone_from_osm')
on conflict (id) do update set
  name = excluded.name, description = excluded.description, location = excluded.location,
  agency = excluded.agency, retired_at = excluded.retired_at, retired_reason = excluded.retired_reason;

insert into public.osm_campgrounds (campground_id, overpass_state, operator, last_seen_at)
values
  ('osm:node/900000001', 'MN', 'Sample State DNR', now()),
  ('osm:way/900000002', 'MN', 'Sample State DNR', now()),
  ('osm:node/900000003', 'MN', 'Sample State DNR', now() - interval '8 days'),
  ('osm:node/900000004', 'MN', 'Sample State DNR', now() - interval '8 days')
on conflict (campground_id) do nothing;

insert into public.favorites (user_id, campground_id, note)
select u.id, c.id, null
from auth.users u cross join (values ('osm:node/900000003'), ('osm:node/900000001')) as c(id)
where u.email = 'pat@campsites.test'
on conflict (user_id, campground_id) do nothing;

-- Sample Pines as the last stop of Pat's sample trip (once).
insert into public.trip_stops (trip_id, campground_id, position)
select t.id, 'osm:node/900000004', coalesce((select max(s.position) + 1 from public.trip_stops s where s.trip_id = t.id), 0)
from public.trips t join auth.users u on u.id = t.user_id
where u.email = 'pat@campsites.test' and t.name = 'Sample road trip'
  and not exists (select 1 from public.trip_stops s where s.trip_id = t.id and s.campground_id = 'osm:node/900000004');
