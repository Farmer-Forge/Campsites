-- The weekly OSM sync's schedule (Shawn, 2026-11-26; spec 1, Fixes #12; design
-- ~/plans/2026-11-26-campsites-state-parks-osm-design.md on Lisa, section 6.3).
-- Hand-written and applied by hand (CLAUDE.md hard rule 3), additive only.
--
-- Every 15 minutes pg_cron calls public.call_osm_sync(), which posts to the osm-sync
-- edge function through pg_net. Each call does at most one state (the function picks the
-- due one), so the 50 states take about 13 hours, once a week.
--
-- The function's URL and the secret key it checks come from Supabase Vault, never from
-- this file: create the secrets 'osm_sync_url' and 'osm_sync_key' by hand. Until both
-- exist, call_osm_sync() does nothing, so this migration is safe to apply before the
-- rollout. **Creating the secrets is what turns the sync on** (deleting one turns it
-- off), so create them only at the rollout's last step, after the forced runs are
-- checked. Forced runs (`osm-sync?state=MN`) call the function directly with the key and
-- don't need Vault.
-- Tested by supabase/tests/osm_state_campgrounds_test.sql.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function public.call_osm_sync()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text;
  v_key text;
begin
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'osm_sync_url';
  select s.decrypted_secret into v_key from vault.decrypted_secrets s where s.name = 'osm_sync_key';
  if v_url is null or v_url = '' or v_key is null or v_key = '' then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object('apikey', v_key, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
end;
$$;

revoke all on function public.call_osm_sync() from public, anon, authenticated, service_role;

select cron.schedule('osm-sync', '*/15 * * * *', 'select public.call_osm_sync()');
