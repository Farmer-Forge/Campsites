-- ==============================================================================
-- APP SEED: campground reference data. Safe to run any time.
-- ==============================================================================
-- Production's campgrounds and parks, copied as they are from Shawn's backup
-- of 2026-10-18 (~/backups/campsitefinder/2026-10-18/data.sql, the COPY blocks
-- for public.campgrounds and public.parks only). That includes what older sync
-- functions left behind, e.g. 463 campgrounds with no state (CLAUDE.md,
-- "Production backup"). campground_attributes was empty in production, so it has no seed.
--
-- The data lives in ralphloop/seed-data/*.copy.gz (COPY text format, gzipped).
-- Rows that already exist are left alone, so a second run changes nothing; after
-- `supabase db reset` it loads everything again. The loop never calls NPS or RIDB.
--
-- Run by ./ralphloop/seed-dev.sh (after seed-dev.sql), from the repo root:
-- \copy ... from program reads the files relative to the current directory.
-- ==============================================================================

create temp table seed_parks (like public.parks including defaults);
\copy seed_parks (park_code, name, updated_at) from program 'gzip -dc ralphloop/seed-data/parks.copy.gz'
insert into public.parks (park_code, name, updated_at)
select park_code, name, updated_at from seed_parks
on conflict (park_code) do nothing;

create temp table seed_campgrounds (like public.campgrounds including defaults);
\copy seed_campgrounds (id, park_code, name, description, location, amenities, fees, reservation_url, directions_url, images, contact, updated_at, agency, source, state) from program 'gzip -dc ralphloop/seed-data/campgrounds.copy.gz'
insert into public.campgrounds (id, park_code, name, description, location, amenities, fees, reservation_url, directions_url, images, contact, updated_at, agency, source, state)
select id, park_code, name, description, location, amenities, fees, reservation_url, directions_url, images, contact, updated_at, agency, source, state
from seed_campgrounds
on conflict (id) do nothing;

-- Corrections to production's data (Shawn, 2026-10-27). V1's own rows are unchanged.
-- "NPS Priest Rock Public Use Cabin" (Alaska) has its longitude's sign flipped
-- (+154.18 puts it in Russia). Flip it back; a second run finds nothing to change.
update public.campgrounds
set location = st_setsrid(st_point(-st_x(location::geometry), st_y(location::geometry)), 4326)::geography
where id = '7FDEE7A6-EB52-43E9-A4D8-193545AB5207' and st_x(location::geometry) > 0;

do $$
begin
  raise notice 'Campground data: % campgrounds, % parks.',
    (select count(*) from public.campgrounds), (select count(*) from public.parks);
end;
$$;

drop table seed_campgrounds;
drop table seed_parks;
