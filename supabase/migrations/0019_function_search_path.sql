-- Pin search_path on the three functions whose migrations didn't, matching
-- production. Production already has this (most likely applied from Supabase's
-- "function search path mutable" advisor, outside the migrations); the
-- 2026-10-24 schema comparison against the production backup found it was the
-- only difference between 0001-0018 and production's public schema. The other
-- six functions already set it in their own migrations.
--
-- Written for V1.1 (Campsites) and approved by Shawn, 2026-10-24. Production
-- needs nothing; this makes a stack built from the migrations equal production.
alter function public.get_campgrounds_by_ids(text[], text[]) set search_path = public, pg_temp;
alter function public.is_admin(uuid) set search_path = public, pg_temp;
alter function public.nearest_campgrounds(double precision, double precision, integer, text[], double precision, text[], text[]) set search_path = public, pg_temp;
