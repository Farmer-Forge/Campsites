-- State-run campgrounds from OpenStreetMap (Shawn, 2026-11-26; spec 1, Fixes #12;
-- design ~/plans/2026-11-26-campsites-state-parks-osm-design.md on Lisa).
-- Hand-written and applied by hand (CLAUDE.md hard rule 3), additive only.
--
-- What this adds:
--   * campgrounds.retired_at / retired_reason. A Retired campground is one its Source
--     no longer lists. It drops out of search (nearest_campgrounds) but stays in
--     favorites and trips (get_campgrounds_by_ids returns it with retired = true).
--     Only osm rows are ever retired: deleting a campground would cascade into
--     favorites, trip stops, admin notes and the state log, so OSM rows are never deleted.
--   * osm_campgrounds: the OSM-only facts for each osm row (which Overpass state area it
--     came from, its operator, when it was last seen).
--   * osm_sync_runs: one row per state per sync run, with counts, operator values and
--     near-miss duplicates, so the filter can be tuned.
--   * start_osm_sync_run / apply_osm_sync_state / fail_osm_sync_run: the database half of
--     the osm-sync edge function, callable only with the service role.
-- NPS and RIDB rows are never changed by anything here.
-- Tested by supabase/tests/osm_state_campgrounds_test.sql.

create extension if not exists pg_trgm with schema extensions;

-- 1. Retired campgrounds -----------------------------------------------------------

alter table public.campgrounds
  add column retired_at timestamptz,
  add column retired_reason text check (retired_reason in ('gone_from_osm', 'not_state_run', 'duplicate'));

-- Both set or both null, and only an osm row may be retired.
alter table public.campgrounds
  add check (
    (retired_at is null and retired_reason is null)
    or (retired_at is not null and retired_reason is not null and source = 'osm')
  );

-- 2. OSM-only facts ----------------------------------------------------------------

create table public.osm_campgrounds (
  -- cascade: these facts mean nothing without their campground (and campgrounds are
  -- never deleted by the sync, only retired).
  campground_id text primary key references public.campgrounds (id) on delete cascade,
  overpass_state text not null check (overpass_state ~ '^[A-Z]{2}$'),
  operator text,
  operator_wikidata text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index osm_campgrounds_overpass_state_idx on public.osm_campgrounds (overpass_state);

alter table public.osm_campgrounds enable row level security;
revoke all on public.osm_campgrounds from anon, authenticated;
grant select on public.osm_campgrounds to authenticated;
create policy "admins read osm_campgrounds" on public.osm_campgrounds
  for select to authenticated using (public.is_admin(auth.uid()));

create table public.osm_sync_runs (
  id int generated always as identity primary key,
  state text not null check (state ~ '^[A-Z]{2}$'),
  status text not null default 'running' check (status in ('running', 'ok', 'failed', 'guarded')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched int,
  kept_classified int,
  kept_new int,
  kept_updated int,
  dropped_not_state_run int,
  dropped_no_name int,
  dropped_duplicate int,
  dropped_no_point int,
  retired int,
  unretired int,
  operators jsonb,
  near_misses jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index osm_sync_runs_state_started_at_idx on public.osm_sync_runs (state, started_at desc);

alter table public.osm_sync_runs enable row level security;
revoke all on public.osm_sync_runs from anon, authenticated;
revoke all on sequence public.osm_sync_runs_id_seq from anon, authenticated;
grant select on public.osm_sync_runs to authenticated;
create policy "admins read osm_sync_runs" on public.osm_sync_runs
  for select to authenticated using (public.is_admin(auth.uid()));

-- 3. Search leaves retired campgrounds out ----------------------------------------
-- Same signature, body and settings as 0022, plus `c.retired_at is null`.
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
    and c.retired_at is null
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

-- 4. Favorites and trips still get retired campgrounds, flagged --------------------
-- The return type gains `retired`, so the function is dropped and re-created
-- (0013's body and 0019's search_path, plus the new column), and its grant restored.

drop function public.get_campgrounds_by_ids(text[], text[]);
create function public.get_campgrounds_by_ids(campground_ids text[], agency_filter text[] default null)
returns table (
  id text, park_code text, name text, description text,
  lat double precision, lng double precision,
  agency text, state text, amenities jsonb, fees jsonb,
  reservation_url text, directions_url text, images jsonb, contact jsonb,
  retired boolean
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
    c.retired_at is not null as retired
  from public.campgrounds c
  where c.id = any(campground_ids)
    and (agency_filter is null or c.agency = any(agency_filter));
$$;
grant execute on function public.get_campgrounds_by_ids(text[], text[]) to anon, authenticated;

-- 5. The sync's database half ------------------------------------------------------

-- A campground name reduced to the words that tell campgrounds apart, for the
-- duplicate check: lowercase, punctuation to spaces, and the generic words dropped.
create function public.normalize_campground_name(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g'),
      '\m(state park|state forest|state recreation area|campground|campgrounds|camp)\M', ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

-- The 50 states the sync cycles through (DC and the territories have no state agency).
create function public.osm_sync_states()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array['AK','AL','AR','AZ','CA','CO','CT','DE','FL','GA','HI','IA','ID','IL','IN',
               'KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH',
               'NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA',
               'VT','WA','WI','WV','WY']::text[];
$$;

-- Start one state's run. Returns no row when another run is in progress or nothing is
-- due. A run still 'running' after 10 minutes is marked failed ("timed out").
-- p_state forces that state (dry runs and QC). Otherwise a state is due when it has no
-- ok run in 6 days and no attempt of any kind in 6 hours (so a state that keeps failing
-- or coming back guarded is tried at most 4 times a day, never every tick), and the
-- due state whose last attempt is oldest is picked.
create function public.start_osm_sync_run(p_state text default null)
returns table (run_id int, state text)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_state text;
  v_run int;
begin
  perform pg_advisory_xact_lock(hashtext('osm-sync'));

  update public.osm_sync_runs r
     set status = 'failed', finished_at = now(), error = 'timed out'
   where r.status = 'running' and r.started_at < now() - interval '10 minutes';

  if exists (select 1 from public.osm_sync_runs r where r.status = 'running') then
    return;
  end if;

  if p_state is not null then
    if not (p_state = any(public.osm_sync_states())) then
      raise exception 'unknown state %', p_state using errcode = '22023';
    end if;
    v_state := p_state;
  else
    select s.code into v_state
    from unnest(public.osm_sync_states()) as s(code)
    left join lateral (
      select max(r.started_at) filter (where r.status = 'ok') as last_ok,
             max(r.started_at) as last_try
      from public.osm_sync_runs r where r.state = s.code
    ) h on true
    where (h.last_ok is null or h.last_ok < now() - interval '6 days')
      and (h.last_try is null or h.last_try < now() - interval '6 hours')
    order by h.last_try nulls first, s.code collate "C"
    limit 1;
    if v_state is null then
      return;
    end if;
  end if;

  insert into public.osm_sync_runs (state) values (v_state) returning id into v_run;
  run_id := v_run;
  state := v_state;
  return next;
end;
$$;

create function public.fail_osm_sync_run(p_run_id int, p_error text)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.osm_sync_runs
     set status = 'failed', finished_at = now(), error = left(p_error, 2000)
   where id = p_run_id and status = 'running';
$$;

-- Apply one state's classified Overpass result in one transaction.
--   p_rows: the kept elements, each {id, name, description, lng, lat, reservation_url,
--           contact, amenities, state, operator, operator_wikidata} (built by osm-sync).
--   p_dropped_ids: ids of named elements classified as not state-run.
--   p_unplaced_ids: ids of elements kept by the classifier but with no usable point:
--           left exactly as they are (neither upserted nor retired), and counted.
--   p_fetched: how many elements Overpass returned; p_dropped_no_name: how many had no name.
--   p_operators: operator value -> {kept, dropped} counts, stored for tuning.
-- Duplicates of a live NPS/RIDB campground (within 300 m, name similarity > 0.5) are
-- dropped, or retired if already present. The guard: when Overpass returned nothing, or
-- under half of this state's last ok kept count, nothing is retired as gone or
-- not state-run and the run is 'guarded'. A real drop is accepted on the 4th run in a
-- row that would be guarded for it (3 guarded runs with data before it); an empty
-- result is always guarded.
create function public.apply_osm_sync_state(
  p_run_id int,
  p_rows jsonb,
  p_dropped_ids text[],
  p_unplaced_ids text[],
  p_fetched int,
  p_dropped_no_name int,
  p_operators jsonb
)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_state text;
  v_prev int;
  v_kept int := coalesce(jsonb_array_length(p_rows), 0);
  v_guarded boolean;
  v_new int := 0;
  v_updated int := 0;
  v_dup int := 0;
  v_retired int := 0;
  v_unretired int := 0;
  v_n int;
  v_near jsonb;
  v_last_ok_id int;
  v_guarded_since int;
begin
  select r.state into v_state from public.osm_sync_runs r
   where r.id = p_run_id and r.status = 'running'
   for update;
  if v_state is null then
    raise exception 'run % is not running', p_run_id using errcode = '22023';
  end if;

  select r.kept_classified, r.id into v_prev, v_last_ok_id from public.osm_sync_runs r
   where r.state = v_state and r.status = 'ok' and r.id <> p_run_id
   order by r.started_at desc, r.id desc limit 1;
  select count(*) into v_guarded_since from public.osm_sync_runs r
   where r.state = v_state and r.status = 'guarded' and coalesce(r.fetched, 0) > 0
     and r.id > coalesce(v_last_ok_id, 0) and r.id <> p_run_id;
  v_guarded := coalesce(p_fetched, 0) = 0
    or (v_prev is not null and v_kept < 0.5 * v_prev and v_guarded_since < 3);

  if to_regclass('pg_temp.osm_in') is not null then
    drop table pg_temp.osm_in;
  end if;
  create temporary table osm_in on commit drop as
  select x.id, x.name, x.description,
         st_setsrid(st_point(x.lng, x.lat), 4326)::geography as location,
         x.reservation_url, coalesce(x.contact, '{}'::jsonb) as contact,
         coalesce(x.amenities, '{}'::jsonb) as amenities, x.state,
         x.operator, x.operator_wikidata,
         false as is_duplicate
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
    id text, name text, description text, lng float8, lat float8, reservation_url text,
    contact jsonb, amenities jsonb, state text, operator text, operator_wikidata text)
  where x.id like 'osm:%' and x.name is not null and x.lng is not null and x.lat is not null;

  -- Duplicates: a live NPS/RIDB campground within 300 m with a similar name.
  update osm_in i set is_duplicate = true
  where exists (
    select 1 from public.campgrounds c
    where c.source <> 'osm' and c.retired_at is null
      and st_dwithin(c.location, i.location, 300)
      and similarity(public.normalize_campground_name(c.name), public.normalize_campground_name(i.name)) > 0.5
  );
  select count(*) into v_dup from osm_in where is_duplicate;

  -- Near misses (for review): within 300 m of a live NPS/RIDB campground, names not similar.
  select coalesce(jsonb_agg(m order by m->>'osm_id'), '[]'::jsonb) into v_near from (
    select jsonb_build_object(
      'osm_id', i.id, 'osm_name', i.name, 'other_id', c.id, 'other_name', c.name,
      'distance_m', round(st_distance(c.location, i.location)::numeric),
      'similarity', round(similarity(public.normalize_campground_name(c.name),
                                     public.normalize_campground_name(i.name))::numeric, 2)) as m
    from osm_in i
    join public.campgrounds c on c.source <> 'osm' and c.retired_at is null
      and st_dwithin(c.location, i.location, 300)
    where not i.is_duplicate
    limit 200
  ) near;

  -- Already-present osm rows that are now duplicates: retired as duplicate.
  update public.campgrounds c
     set retired_at = now(), retired_reason = 'duplicate', updated_at = now()
    from osm_in i
   where c.id = i.id and i.is_duplicate and c.retired_at is null;
  get diagnostics v_n = row_count;
  v_retired := v_retired + v_n;

  select count(*) into v_unretired
    from public.campgrounds c join osm_in i on i.id = c.id
   where not i.is_duplicate and c.retired_at is not null;

  with up as (
    insert into public.campgrounds as c (
      id, park_code, name, description, location, amenities, fees, reservation_url,
      directions_url, images, contact, updated_at, agency, source, state,
      retired_at, retired_reason)
    select i.id, null, i.name, coalesce(i.description, ''), i.location, i.amenities, '[]'::jsonb,
           coalesce(i.reservation_url, ''), '', '[]'::jsonb, i.contact, now(), 'STATE', 'osm',
           i.state, null, null
    from osm_in i where not i.is_duplicate
    on conflict (id) do update set
      name = excluded.name, description = excluded.description, location = excluded.location,
      amenities = excluded.amenities, reservation_url = excluded.reservation_url,
      contact = excluded.contact, updated_at = now(), state = excluded.state,
      retired_at = null, retired_reason = null
    where c.source = 'osm'
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into v_new, v_updated from up;

  insert into public.osm_campgrounds as o (campground_id, overpass_state, operator, operator_wikidata, last_seen_at)
  select i.id, v_state, i.operator, i.operator_wikidata, now()
  from osm_in i join public.campgrounds c on c.id = i.id and c.source = 'osm'
  on conflict (campground_id) do update set
    overpass_state = excluded.overpass_state, operator = excluded.operator,
    operator_wikidata = excluded.operator_wikidata, last_seen_at = now();

  if not v_guarded then
    update public.campgrounds c
       set retired_at = now(), retired_reason = 'not_state_run', updated_at = now()
      from public.osm_campgrounds o
     where o.campground_id = c.id and o.overpass_state = v_state
       and c.source = 'osm' and c.retired_at is null
       and c.id = any(coalesce(p_dropped_ids, '{}'::text[]));
    get diagnostics v_n = row_count;
    v_retired := v_retired + v_n;

    update public.campgrounds c
       set retired_at = now(), retired_reason = 'gone_from_osm', updated_at = now()
      from public.osm_campgrounds o
     where o.campground_id = c.id and o.overpass_state = v_state
       and c.source = 'osm' and c.retired_at is null
       and not exists (select 1 from osm_in i where i.id = c.id)
       and not (c.id = any(coalesce(p_dropped_ids, '{}'::text[])))
       and not (c.id = any(coalesce(p_unplaced_ids, '{}'::text[])));
    get diagnostics v_n = row_count;
    v_retired := v_retired + v_n;
  end if;

  update public.osm_sync_runs set
    status = case when v_guarded then 'guarded' else 'ok' end,
    finished_at = now(),
    fetched = p_fetched,
    kept_classified = v_kept,
    kept_new = v_new,
    kept_updated = v_updated,
    dropped_not_state_run = coalesce(array_length(p_dropped_ids, 1), 0),
    dropped_no_name = p_dropped_no_name,
    dropped_duplicate = v_dup,
    dropped_no_point = coalesce(array_length(p_unplaced_ids, 1), 0),
    retired = v_retired,
    unretired = v_unretired,
    operators = p_operators,
    near_misses = v_near
  where id = p_run_id;

  return jsonb_build_object(
    'state', v_state, 'status', case when v_guarded then 'guarded' else 'ok' end,
    'fetched', p_fetched, 'kept_classified', v_kept, 'kept_new', v_new,
    'kept_updated', v_updated, 'dropped_duplicate', v_dup, 'retired', v_retired,
    'unretired', v_unretired, 'near_misses', jsonb_array_length(v_near));
end;
$$;

revoke all on function public.normalize_campground_name(text) from public, anon, authenticated;
revoke all on function public.osm_sync_states() from public, anon, authenticated;
revoke all on function public.start_osm_sync_run(text) from public, anon, authenticated;
revoke all on function public.fail_osm_sync_run(int, text) from public, anon, authenticated;
revoke all on function public.apply_osm_sync_state(int, jsonb, text[], text[], int, int, jsonb) from public, anon, authenticated;
grant execute on function public.normalize_campground_name(text) to service_role;
grant execute on function public.osm_sync_states() to service_role;
grant execute on function public.start_osm_sync_run(text) to service_role;
grant execute on function public.fail_osm_sync_run(int, text) to service_role;
grant execute on function public.apply_osm_sync_state(int, jsonb, text[], text[], int, int, jsonb) to service_role;
