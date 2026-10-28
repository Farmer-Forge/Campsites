-- Tests for 0021_skip_zero_locations.sql (Shawn, 2026-10-27). Campgrounds at
-- exactly 0,0 are RIDB rows with no known location: search never returns them,
-- but looking one up by id still works (favorites and trip stops keep it).
-- Run on ralph from the repo root: supabase test db. Rolled back at the end.
begin;
select plan(4);

insert into public.campgrounds (id, name, location, agency, source) values
  ('test:zero', 'Nowhere', 'SRID=4326;POINT(0 0)', 'USFS', 'ridb'),
  ('test:real', 'Somewhere', 'SRID=4326;POINT(-90 38)', 'USFS', 'ridb');

select ok(not exists (select 1 from public.nearest_campgrounds(38, -90, 50, null, 20038000, null, null) where id = 'test:zero'),
  '"Show all" leaves out campgrounds at 0,0');
select ok(not exists (select 1 from public.nearest_campgrounds(0, 0, 5) where id = 'test:zero'),
  'even a search from 0,0 itself leaves them out');
select ok(exists (select 1 from public.nearest_campgrounds(38, -90, 50, null, 20038000, null, null) where id = 'test:real'),
  'campgrounds with a real location still come back');
select ok(exists (select 1 from public.get_campgrounds_by_ids(array['test:zero'])),
  'get_campgrounds_by_ids still returns a 0,0 campground, so favorites and trip stops keep it');

select * from finish();
rollback;
