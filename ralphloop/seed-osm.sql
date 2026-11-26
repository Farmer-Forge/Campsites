-- OSM SAMPLE SEED: three made-up state-run campgrounds near Minneapolis, for reviewers and
-- for the State chip / retired-card checks (design ~/plans/2026-11-26-campsites-state-parks-osm-design.md
-- on Lisa; needs 0025). Safe to run any time; run after seed-sample.sql (Pat must exist).
--   osm:node/900000001  Sample Lake State Park          live
--   osm:way/900000002   Sample River State Forest Camp  live
--   osm:node/900000003  Sample Bluff State Park         retired (gone_from_osm), in Pat's favorites
-- The names are invented, so no real park is misdescribed.
insert into public.campgrounds (id, park_code, name, description, location, amenities, fees,
  reservation_url, directions_url, images, contact, updated_at, agency, source, state,
  retired_at, retired_reason)
values
  ('osm:node/900000001', null, 'Sample Lake State Park', 'Operated by Sample State DNR.',
   st_setsrid(st_point(-93.05, 44.95), 4326)::geography, '{"toilets":"yes","potableWater":"yes"}', '[]',
   'https://example.org/sample-lake', '', '[]', '{"phone":"","email":""}', now(), 'STATE', 'osm', 'MN', null, null),
  ('osm:way/900000002', null, 'Sample River State Forest Campground', 'Operated by Sample State DNR.',
   st_setsrid(st_point(-93.40, 45.10), 4326)::geography, '{}', '[]',
   '', '', '[]', '{"phone":"","email":""}', now(), 'STATE', 'osm', 'MN', null, null),
  ('osm:node/900000003', null, 'Sample Bluff State Park', 'Operated by Sample State DNR.',
   st_setsrid(st_point(-93.20, 44.85), 4326)::geography, '{}', '[]',
   '', '', '[]', '{"phone":"","email":""}', now(), 'STATE', 'osm', 'MN', now(), 'gone_from_osm')
on conflict (id) do update set
  name = excluded.name, description = excluded.description, location = excluded.location,
  agency = excluded.agency, retired_at = excluded.retired_at, retired_reason = excluded.retired_reason;

insert into public.osm_campgrounds (campground_id, overpass_state, operator, last_seen_at)
values
  ('osm:node/900000001', 'MN', 'Sample State DNR', now()),
  ('osm:way/900000002', 'MN', 'Sample State DNR', now()),
  ('osm:node/900000003', 'MN', 'Sample State DNR', now() - interval '8 days')
on conflict (campground_id) do nothing;

insert into public.favorites (user_id, campground_id, note)
select u.id, 'osm:node/900000003', null
from auth.users u where u.email = 'pat@campsites.test'
on conflict (user_id, campground_id) do nothing;
