-- ForgeGeo v0.1.0: read-only US reference geography for Forge apps.
-- Schema only; the boundaries are loaded from supabase/data/ (see README and
-- docs/adr/0002). Copy this file byte for byte from a tag; don't edit it.
--
-- PostGIS may already live in public (older projects, e.g. Campsites) or in
-- extensions (new Supabase projects). "if not exists" leaves an existing
-- install where it is, and the functions' search_path covers both places.

create extension if not exists postgis with schema extensions;

create schema geo;
comment on schema geo is 'ForgeGeo: read-only reference geography. Not exposed through the Data API.';

create table geo.us_states (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  fips text not null unique,
  boundary geometry(MultiPolygon, 4326) not null
);
comment on table geo.us_states is 'The 56 Census state-level areas (50 states, DC, PR, VI, GU, AS, MP), keyed by USPS code.';

create index us_states_boundary_idx on geo.us_states using gist (boundary);

create table geo.dataset (
  layer text primary key,
  source_url text not null,
  vintage text not null,
  source_sha256 text not null,
  row_count int not null,
  loaded_at timestamptz not null
);
comment on table geo.dataset is 'Which vintage of each layer this database holds, and the sha256 of the source it was built from.';

-- The state whose boundary covers p, or null. On a shared border the lowest code wins.
create function geo.state_at(p geography)
returns text
language sql
stable
set search_path = extensions, public, pg_temp
as $$
  select s.code
  from geo.us_states s
  where st_covers(s.boundary, p::geometry)
  order by s.code
  limit 1;
$$;

-- Metres from p to the given state (0 when p is inside it), or null for an unknown code.
-- "Inside" and the nearest point are both taken on the stored (planar) boundary,
-- the same shape state_at tests, so the two never disagree; only the final
-- point-to-point distance is geodesic. (Casting the boundary to geography would
-- bend long straight borders such as the 49th parallel by tens of metres.)
create function geo.distance_to_state_m(p geography, state_code text)
returns double precision
language sql
stable
set search_path = extensions, public, pg_temp
as $$
  select case
           when st_covers(s.boundary, p::geometry) then 0::double precision
           else st_distance(st_closestpoint(s.boundary, p::geometry)::geography, p)
         end
  from geo.us_states s
  where s.code = state_code;
$$;

-- Grants: nothing for anon; read and execute for signed-in users and the service role.
revoke all on schema geo from public, anon;
revoke all on all tables in schema geo from public, anon, authenticated, service_role;
revoke all on function geo.state_at(geography), geo.distance_to_state_m(geography, text) from public, anon;

grant usage on schema geo to authenticated, service_role;
grant select on geo.us_states, geo.dataset to authenticated, service_role;
grant execute on function geo.state_at(geography), geo.distance_to_state_m(geography, text) to authenticated, service_role;

alter table geo.us_states enable row level security;
alter table geo.dataset enable row level security;
create policy "reference data is readable" on geo.us_states for select to authenticated, service_role using (true);
create policy "reference data is readable" on geo.dataset for select to authenticated, service_role using (true);
