-- The OSM duplicate check compares names before a " - " suffix (Shawn, 2026-11-27;
-- dry-run report ~/plans/2026-11-26-campsites-osm-dry-run-report.md on Lisa, finding 3).
-- Hand-written and applied by hand (CLAUDE.md hard rule 3), additive only.
--
-- NPS names some campgrounds "<campground> - <park>" ("Gold Bluffs Beach Campground -
-- Prairie Creek Redwoods State Park"). OSM's "Gold Bluffs Beach Campground", 234 m away,
-- scored 0.43 against it, under apply_osm_sync_state's 0.5, so it wasn't caught as a
-- duplicate. Now everything from the first " - " (spaces around the dash) is dropped
-- before the generic words, on both sides. Hyphenated names without spaces
-- ("Ah-Gwah-Ching") are unchanged. Same signature and settings as 0025; create or
-- replace keeps its grant (service_role only).
-- Tested by supabase/tests/osm_state_campgrounds_test.sql.
create or replace function public.normalize_campground_name(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(regexp_replace(coalesce(p_name, ''), '\s+-\s+.*$', '')), '[^a-z0-9]+', ' ', 'g'),
      '\m(state park|state forest|state recreation area|campground|campgrounds|camp)\M', ' ', 'g'),
    '\s+', ' ', 'g'));
$$;
