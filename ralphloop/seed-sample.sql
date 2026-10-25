-- ==============================================================================
-- SAMPLE SEED: fake users with favorites and a trip, for reviewers. Safe to run any time.
-- ==============================================================================
-- Runs after seed-dev.sql (the dev admin) and seed-app.sql (campgrounds), so
-- reviewers see the signed-in pages with data in them. Every account is fake
-- and dev-only:
--   pat@campsites.test / campsites-pat   a camper: 3 favorites (one with a note) and a 2-stop trip
--   sam@campsites.test / campsites-sam   a suspended user: sign-in is refused
-- Campgrounds are picked by query (the first NPS and USFS ones by id), not by
-- hard-coded id, so this follows whatever seed-app.sql loaded. An account that
-- already exists is left as it is, and nothing is duplicated.
-- ==============================================================================

do $$
declare
  v_people constant jsonb := '[
    {"email": "pat@campsites.test", "password": "campsites-pat", "name": "Pat Camper", "suspended": false},
    {"email": "sam@campsites.test", "password": "campsites-sam", "name": "Sam Suspended", "suspended": true}
  ]';
  v_person jsonb;
  v_id uuid;
  v_pat uuid;
  v_trip uuid;
  v_picks text[];
begin
  for v_person in select * from jsonb_array_elements(v_people) loop
    select id into v_id from auth.users where email = v_person->>'email';
    if v_id is null then
      v_id := gen_random_uuid();
      -- Same shape as seed-dev.sql: GoTrue reads these token columns as strings.
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_person->>'email',
        extensions.crypt(v_person->>'password', extensions.gen_salt('bf')), now(),
        '', '', '', '',
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('display_name', v_person->>'name'),
        now(), now()
      );
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (
        v_id::text, v_id,
        jsonb_build_object('sub', v_id::text, 'email', v_person->>'email', 'email_verified', true),
        'email', now(), now(), now()
      );
      raise notice 'Created sample account %.', v_person->>'email';
    end if;
    update public.users set suspended = (v_person->>'suspended')::boolean where id = v_id;
  end loop;

  select id into v_pat from auth.users where email = 'pat@campsites.test';

  -- Pat's favorites: the first two NPS campgrounds and the first USFS one, by id.
  select array_agg(id order by id) into v_picks from (
    (select id from public.campgrounds where agency = 'NPS' order by id limit 2)
    union all
    (select id from public.campgrounds where agency = 'USFS' order by id limit 1)
  ) picks;
  if v_picks is null or array_length(v_picks, 1) < 3 then
    raise notice 'Not enough campgrounds for Pat''s sample favorites; run seed-app.sql first.';
    return;
  end if;

  insert into public.favorites (user_id, campground_id, note)
  select v_pat, c, case when c = v_picks[1] then 'Sample note: arrive before dark.' end
  from unnest(v_picks) as c
  on conflict (user_id, campground_id) do nothing;

  -- Pat's trip, created once, with the first two favorites as stops.
  if not exists (select 1 from public.trips where user_id = v_pat and name = 'Sample road trip') then
    insert into public.trips (user_id, name) values (v_pat, 'Sample road trip') returning id into v_trip;
    insert into public.trip_stops (trip_id, campground_id, position)
    values (v_trip, v_picks[1], 0), (v_trip, v_picks[2], 1);
    raise notice 'Created Pat''s sample trip.';
  end if;
end;
$$;
