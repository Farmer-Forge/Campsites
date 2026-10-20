-- Display names for NPS park codes, so the Finder's park filter can show
-- "Yellowstone" instead of "yell". Populated by nps-sync from the NPS /parks
-- endpoint for the codes its campgrounds reference. Deliberately no foreign
-- key from campgrounds.park_code: a code with no row here just falls back to
-- showing the code.
create table parks (
  park_code text primary key,
  name text not null,
  updated_at timestamptz not null default now()
);

alter table parks enable row level security;
create policy "anyone can read parks" on parks for select using (true);
-- no insert/update/delete policy for anon/authenticated: only the
-- nps-sync Edge Function (service role key) writes to this table.
