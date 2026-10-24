-- ==============================================================================
-- DEV SEED: the dev admin login. Safe to run any time.
-- ==============================================================================
-- Idempotent: creates the account if it's missing, then makes sure its
-- public.users row exists, is an admin and isn't suspended. An account that
-- already exists keeps its password. Nothing is ever duplicated. Run it again
-- after `supabase db reset`, which deletes every account.
--
-- The schema is V1's (supabase/migrations/0001-0019), used as it is:
--   * the on_auth_user_created trigger (0005) makes the public.users row,
--     taking display_name from the account's metadata;
--   * role is 'user', 'moderator' or 'admin' (0004); suspended is from 0008.
-- 0007 promotes Shawn's real email, which doesn't exist locally, so this is
-- where the local admin comes from.
--
-- Dev-only credentials, never used anywhere else:
--   admin@campsites.test / campsites-admin
-- Override with psql variables: -v admin_email=… -v admin_password=…
--
-- Run: ./ralphloop/seed-dev.sh on ralph, or from inside the loop's worker:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ralphloop/seed-dev.sql
-- ==============================================================================

\if :{?admin_email}
\else
  \set admin_email 'admin@campsites.test'
\endif
\if :{?admin_password}
\else
  \set admin_password 'campsites-admin'
\endif

-- DO blocks can't read psql variables, so hand the values over as session settings.
select set_config('seed.admin_email', :'admin_email', false) is not null as seed_email_set \gset
select set_config('seed.admin_password', :'admin_password', false) is not null as seed_password_set \gset

do $$
declare
  v_email text := lower(current_setting('seed.admin_email'));
  v_password text := current_setting('seed.admin_password');
  v_id uuid;
begin
  select id into v_id from auth.users where email = v_email;

  if v_id is null then
    v_id := gen_random_uuid();
    -- GoTrue reads these token columns as strings; NULL there breaks sign-in.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
      '', '', '', '',
      '{"provider":"email","providers":["email"]}',
      '{"display_name":"Admin"}',
      now(), now()
    );
    -- identities.email is generated from identity_data, so it isn't set here.
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      v_id::text, v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    );
    raise notice 'Created the dev admin account %.', v_email;
  else
    raise notice 'The dev admin account % already exists; its password is left as it is.', v_email;
  end if;

  -- The sign-up trigger has usually made the row already; either way it ends up admin.
  insert into public.users (id, display_name, role, suspended)
  values (v_id, 'Admin', 'admin', false)
  on conflict (id) do update set role = 'admin', suspended = false;
  raise notice '% is an admin.', v_email;
end;
$$;
