-- Bug 6 part A (Shawn, 2026-11-15): a campground's state comes from its
-- location. 457 campgrounds (422 searchable) had no state because their source
-- records have no address, and since 0022 the Where filter leaves them out.
--
-- Rules (spec ~/plans/2026-11-15-state-backfill-design.md on Lisa, section 5):
-- an admin's state_override wins; otherwise the state whose boundary holds the
-- location (geo.state_at, from ForgeGeo in 0023), except that the source's state
-- is kept when the point is within 1 km of that state (near_border), or when
-- there's no location, no boundary or no boundary data. Every change of state,
-- and every change to a "logged" reason, goes to campground_state_log.
--
-- Why three triggers and not one: docs/adr/0002-three-triggers-for-campground-state.md.
-- In short, the syncs' PostgREST upserts fire BEFORE INSERT even for rows that
-- become updates, so that trigger may only record the source's value.
--
-- Additive only: three nullable columns, one table, five functions, three
-- triggers. No existing object or RPC changes.

alter table public.campgrounds
  add column source_state text,
  add column state_override text,
  add column state_reason text check (state_reason in (
    'manual', 'no_geo_data', 'no_location', 'no_boundary',
    'location_filled', 'source', 'near_border', 'location_overrode'));

comment on column public.campgrounds.source_state is 'The state the source''s address gave (what the sync sent).';
comment on column public.campgrounds.state_override is 'A state an admin chose by hand; outranks location and source until cleared.';
comment on column public.campgrounds.state_reason is 'Why state has its value (see 0024).';

-- Before any trigger exists: what's in state today is what the feeds sent.
update public.campgrounds set source_state = state where true;

create table public.campground_state_log (
  id bigint generated always as identity primary key,
  campground_id text not null references public.campgrounds (id) on delete cascade,
  at timestamptz not null default now(),
  old_state text,
  new_state text,
  source_state text,
  location_state text,
  override_state text,
  reason text not null,
  distance_m double precision,
  changed_by uuid
);
comment on table public.campground_state_log is 'Every change to a campground''s state or logged state_reason (0024). Read it through admin_campground_state_log().';

create index campground_state_log_campground_idx on public.campground_state_log (campground_id, at desc);

alter table public.campground_state_log enable row level security;
revoke all on public.campground_state_log from anon, authenticated;
revoke all on sequence public.campground_state_log_id_seq from anon, authenticated;

-- (a) BEFORE INSERT: only remember what the source sent. It must not change
-- state or log anything: on an upsert it also runs for rows that become updates.
-- An insert that already carries source_state (a copy of rows written after
-- 0024) keeps it.
create function public.campground_state_capture_source()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.source_state := coalesce(new.source_state, new.state);
  return new;
end;
$$;

-- (b) BEFORE UPDATE: decide the state and write the log.
create function public.campground_state_resolve()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_border_margin_m constant double precision := 1000;  -- spec section 5: keep the source's state within 1 km of it
  c_logged constant text[] := array['manual', 'no_boundary', 'location_filled', 'near_border', 'location_overrode'];
  v_src text;
  v_src_code text;
  v_loc text;
  v_dist double precision;
  v_has_geo boolean := exists (select 1 from geo.us_states);
  v_zero boolean := st_x(new.location::geometry) = 0 and st_y(new.location::geometry) = 0;
begin
  -- The source's value: a write that changes state is a feed (or a fix) saying
  -- so; one that leaves it alone (a rename, a recompute, an override) keeps the
  -- last source value rather than mistaking the computed state for it.
  if new.state is distinct from old.state then
    v_src := new.state;
  else
    v_src := old.source_state;
  end if;
  new.source_state := v_src;

  -- Some sources send the state's name, not its code ("OREGON", "Tennessee"):
  -- read either as the code. source_state keeps what was sent.
  v_src_code := coalesce(
    (select s.code from geo.us_states s
     where s.code = upper(btrim(v_src)) or upper(s.name) = upper(btrim(v_src))
     order by s.code limit 1),
    v_src);

  if v_has_geo and not v_zero then
    v_loc := geo.state_at(new.location);
  end if;

  if new.state_override is not null then
    new.state := new.state_override;
    new.state_reason := 'manual';
  elsif not v_has_geo then
    new.state := v_src_code;
    new.state_reason := 'no_geo_data';
  elsif v_zero then
    new.state := v_src_code;
    new.state_reason := 'no_location';
  elsif v_loc is null then
    new.state := v_src_code;
    new.state_reason := 'no_boundary';
  elsif v_src_code is null then
    new.state := v_loc;
    new.state_reason := 'location_filled';
  elsif v_loc = v_src_code then
    new.state := v_src_code;
    new.state_reason := 'source';
  else
    v_dist := geo.distance_to_state_m(new.location, v_src_code);  -- null if it isn't a known state
    if v_dist is not null and v_dist <= c_border_margin_m then
      new.state := v_src_code;
      new.state_reason := 'near_border';
    else
      new.state := v_loc;
      new.state_reason := 'location_overrode';
    end if;
  end if;

  -- Log a change of state, a move into a logged reason, and the end of an
  -- override (an admin action is always on record, even when the state stays).
  if new.state is distinct from old.state
     or (new.state_reason is distinct from old.state_reason
         and (new.state_reason = any (c_logged) or old.state_reason = 'manual')) then
    insert into public.campground_state_log
      (campground_id, old_state, new_state, source_state, location_state, override_state, reason, distance_m, changed_by)
    values
      (new.id, old.state, new.state, v_src, v_loc, new.state_override, new.state_reason, v_dist, auth.uid());
  end if;

  return new;
end;
$$;

-- (c) AFTER INSERT, once per statement: run (b) on the rows that were really
-- inserted (the transition table leaves out upsert rows that became updates).
create function public.campground_state_resolve_inserted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.campgrounds c set state = c.state from inserted i where c.id = i.id;
  return null;
end;
$$;

create trigger campgrounds_state_capture_source
  before insert on public.campgrounds
  for each row execute function public.campground_state_capture_source();

create trigger campgrounds_state_resolve
  before update on public.campgrounds
  for each row execute function public.campground_state_resolve();

create trigger campgrounds_state_resolve_inserted
  after insert on public.campgrounds
  referencing new table as inserted
  for each statement execute function public.campground_state_resolve_inserted();

-- Re-run the rules on every campground (the first backfill, and after a
-- boundary reload). Returns how many campgrounds have each reason.
create function public.recompute_campground_states()
returns table (state_reason text, n bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  -- "where true": Supabase's pg_safeupdate refuses an UPDATE with no WHERE in API sessions.
  update public.campgrounds set state = state where true;
  return query
    select c.state_reason, count(*) from public.campgrounds c group by c.state_reason;
end;
$$;

-- Admin: set (or, with null, clear) a campground's state override.
create function public.admin_set_campground_state_override(campground_id text, state_code text)
returns table (state text, state_reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_code text := upper(btrim(state_code));
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'only admins can set a campground''s state' using errcode = '42501';
  end if;
  if v_code is not null and not exists (select 1 from geo.us_states s where s.code = v_code) then
    raise exception 'unknown state code: %', state_code using errcode = '22023';
  end if;

  update public.campgrounds c set state_override = v_code
  where c.id = admin_set_campground_state_override.campground_id;
  if not found then
    raise exception 'unknown campground: %', admin_set_campground_state_override.campground_id using errcode = 'P0002';
  end if;

  return query
    select c.state, c.state_reason from public.campgrounds c
    where c.id = admin_set_campground_state_override.campground_id;
end;
$$;

-- Admin: read the state log, newest first, for one campground or all of them.
create function public.admin_campground_state_log(campground_id text default null, result_limit int default 100)
returns setof public.campground_state_log
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'only admins can read the state log' using errcode = '42501';
  end if;
  return query
    select l.* from public.campground_state_log l
    where admin_campground_state_log.campground_id is null
       or l.campground_id = admin_campground_state_log.campground_id
    order by l.at desc, l.id desc
    limit least(greatest(coalesce(result_limit, 100), 1), 1000);
end;
$$;

revoke all on function public.campground_state_capture_source() from public, anon, authenticated;
revoke all on function public.campground_state_resolve() from public, anon, authenticated;
revoke all on function public.campground_state_resolve_inserted() from public, anon, authenticated;

revoke all on function public.recompute_campground_states() from public, anon, authenticated;
grant execute on function public.recompute_campground_states() to service_role;

revoke all on function public.admin_set_campground_state_override(text, text) from public, anon;
revoke all on function public.admin_campground_state_log(text, int) from public, anon;
grant execute on function public.admin_set_campground_state_override(text, text) to authenticated;
grant execute on function public.admin_campground_state_log(text, int) to authenticated;
