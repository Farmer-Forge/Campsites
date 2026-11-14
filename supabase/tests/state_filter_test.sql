-- Tests for 0022_state_filter_excludes_unknown_state.sql (bug 6, Shawn,
-- 2026-11-14). A state filter returns only campgrounds in the picked states;
-- campgrounds with no state come back only when there's no state filter.
-- Run on ralph from the repo root: supabase test db. Rolled back at the end.
begin;
select plan(4);

insert into public.campgrounds (id, name, location, agency, source, state) values
  ('test:wi', 'In Wisconsin', 'SRID=4326;POINT(-89.5 44.5)', 'USFS', 'ridb', 'WI'),
  ('test:ca', 'In California', 'SRID=4326;POINT(-119.5 37.5)', 'USFS', 'ridb', 'CA'),
  ('test:nostate', 'No state recorded', 'SRID=4326;POINT(-119.4 37.4)', 'USFS', 'ridb', null);

select ok(exists (select 1 from public.nearest_campgrounds(44, -89, 50, null, 20038000, array['WI','MN'], null) where id = 'test:wi'),
  'a campground in a picked state comes back');
select ok(not exists (select 1 from public.nearest_campgrounds(44, -89, 50, null, 20038000, array['WI','MN'], null) where id = 'test:ca'),
  'a campground in a state that is not picked is left out');
select ok(not exists (select 1 from public.nearest_campgrounds(44, -89, 50, null, 20038000, array['WI','MN'], null) where id = 'test:nostate'),
  'a campground with no state is left out when a state filter is set');
select ok(exists (select 1 from public.nearest_campgrounds(44, -89, 50, null, 20038000, null, null) where id = 'test:nostate'),
  'a campground with no state still comes back with no state filter ("All states")');

select * from finish();
rollback;
