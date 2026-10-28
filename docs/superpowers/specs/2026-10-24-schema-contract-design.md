# Schema contract ("do not change") — Design

Status: **approved by Shawn 2026-10-25.** Spec 1 of the roadmap (`2026-10-20-v1.1-roadmap-design.md`). It includes the fixes Shawn asked for on 2026-10-24 (see **Fixes**), merged in PR #3.

Last updated: 2026-10-24

## What this is

The database and edge functions V1.1 builds on. Every task in `task.md` that reads or writes data points here for names, types and rules. **The loop changes none of it.**

The contract is these files:
- `supabase/migrations/0001–0018`, unchanged from V1's `v1.0` tag;
- `supabase/migrations/0019_function_search_path.sql`, which adds the one thing production had that `0001–0018` lacked (below);
- `supabase/migrations/0020_security_fixes.sql`, the fixes Shawn asked for on 2026-10-24 (see **Fixes**). This is where V1.1's database **differs from V1's**;
- `supabase/functions/`: V1's six edge functions, plus a caller check added to `nps-sync` and `ridb-sync` (`_shared/service-role.ts`, see **Fixes**);
- `supabase/migrations/0021_skip_zero_locations.sql`: search leaves out campgrounds at 0,0 (Shawn, 2026-10-27; see **Fixes** #8);
- `supabase/tests/security_fixes_test.sql` and `zero_location_test.sql`: pgTAP tests for `0020` and `0021` (`supabase test db`, on Ralph);
- `deno.lock`, unchanged from V1.

Rules (CLAUDE.md hard rule 3, worker prompt rule 4):
- No task edits these files, and the loop never runs DDL against the database.
- If V1.1 truly needs a schema change, it's written up as a new additive migration for Shawn to review and apply by hand.
- Chain mode refuses to auto-merge any PR that touches `supabase/migrations/` or `supabase/functions/`.

Where this spec and the files disagree, the files win, and this spec gets fixed.

## Proven equal to production (2026-10-24)

**Method** (reusable for any rebuild):
1. **Shawn takes a schema-only backup of production** (2026-10-18): `pg_dump --schema-only --schema=public`, the `auth.users` triggers, and a full `pg_dump -Fc`.
2. **Build a local stack from the repo's migrations** on Ralph.
3. **Dump the local stack the same way.** Use `pg_dump --schema-only --schema=public` inside the stack's own database container, so the `pg_dump` version matches the server.
4. **Normalize and diff, on Lisa,** so production files never leave Lisa:
   - drop the `\restrict` / `\unrestrict` lines and the `-- Dumped from/by` lines;
   - `diff -u` the two dumps.
5. **Compare the rest:**
   - the triggers on `auth.users` (`pg_get_triggerdef`);
   - the extensions and their schemas, from `pg_restore --schema-only -f - full.dump | grep '^CREATE EXTENSION'`. This reads only the schema, never the data.

**Result:**
- `0001–0018` matched production **except** for one gap. Production pins `search_path = public, pg_temp` on `get_campgrounds_by_ids`, `is_admin` and `nearest_campgrounds`; the migrations didn't. It was most likely applied from Supabase's security advisor, outside the migrations.
- `0019` adds it. After `0019`, the diff is **empty**, and the trigger and extensions match.
- V1's own repo still has the gap. V1 is frozen, so it's only noted here.

## Extensions

| Extension | Schema | Used for |
|---|---|---|
| `postgis` | `public` | `campgrounds.location` (`geography(Point, 4326)`), distance and radius search |
| `pgcrypto` | `extensions` | `gen_random_uuid()` defaults; the dev seed's password hashing |
| `uuid-ossp` | `extensions` | Supabase default, unused by V1's tables |
| `pg_stat_statements` | `extensions` | Supabase default |
| `supabase_vault` | `vault` | Supabase default, unused by V1 |

## Tables

All seven tables have RLS on. Supabase's default grants give `anon` and `authenticated` all table privileges, so RLS policies are what actually decide access. There's one column-level exception, on `users`.

### `campgrounds`: synced reference data

| Column | Type | Notes |
|---|---|---|
| `id` | text, PK | NPS rows: NPS's campground id. RIDB rows: `ridb:<FacilityID>`. |
| `park_code` | text, nullable | NPS park code; `null` for RIDB rows |
| `name` | text, not null | |
| `description` | text | |
| `location` | `geography(Point,4326)`, not null | GiST index |
| `amenities`, `fees`, `images`, `contact` | jsonb | as each source gives them |
| `reservation_url`, `directions_url` | text | can be `''` (see the reserve/directions plan in V1) |
| `agency` | text, not null, default `'NPS'` | btree index; e.g. `NPS`, `USFS`, `BLM`, `USACE` |
| `source` | text, not null, default `'nps'` | `nps` or `ridb` |
| `state` | text, nullable | two-letter state; btree index. **Null means unknown, and state filters always include it.** In production, 463 of the 4,900 rows have no `state`: 163 NPS, 243 USFS, 43 BLM and 8 USACE (counted from the seed, 2026-10-25). *(An earlier draft said every NPS row lacked a state; the data says otherwise.)* |
| `updated_at` | timestamptz, not null, default `now()` | |

- **Policy:** "anyone can read campgrounds" (select, everyone).
- **Writes:** none from the app. Only `nps-sync` and `ridb-sync` write, with the service role, upserting on `id`.
- **App use:** the `nearest_campgrounds` and `get_campgrounds_by_ids` RPCs; `select park_code where park_code is not null` (the Finder's park filter); and `select id, name ilike %q% limit 20` (search by name, for add-a-stop).

### `parks`: synced reference data

`park_code` text PK, `name` text not null, `updated_at` timestamptz.

- **Policy:** "anyone can read parks".
- **Writes:** `nps-sync` only.
- **App use:** turning park codes into names in the Finder's park filter.

### `campground_attributes`: admin-managed notes on a campground

| Column | Type |
|---|---|
| `id` | uuid PK, default `gen_random_uuid()` |
| `campground_id` | text, not null → `campgrounds(id)`, on delete cascade |
| `type`, `name` | text, not null |
| `value` | text |
| `created_at` | timestamptz, default `now()` |

- **Policy:** "admins manage campground attributes": all operations, `using` and `with check` `is_admin(auth.uid())`.
- **App use:** the admin page only (list by campground ordered by `created_at`, insert, update, delete).
- **Non-admins can't see attributes at all.** For `anon` the query errors rather than returning nothing, because `is_admin` isn't executable by `anon`.

### `users`: one row per account (formerly `profiles`)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK → `auth.users(id)`, on delete cascade | constraint names still say `profiles_…` |
| `display_name` | text, not null | |
| `theme` | text, nullable, `light` or `dark` | |
| `role` | text, not null, default `user`, `user` / `moderator` / `admin` | `moderator` exists but V1 gives it no powers |
| `suspended` | boolean, not null, default false | |

- **Policies:**
  - "anyone can read profiles" (select, everyone);
  - "users can insert own profile" (`auth.uid() = id`);
  - "users can update own profile" (`auth.uid() = id`).
- **Column grants:** `anon` and `authenticated` have every privilege except `UPDATE`. `authenticated` may update only `display_name` and `theme` (0006). So a user can't change their own `role` or `suspended`, even though the update policy allows their row.
- **Created by:** the `on_auth_user_created` trigger (below), not by the app.
- **App use:**
  - read own `id, display_name, theme, role`;
  - update own `display_name` (it also writes `display_name` into the auth user's metadata) and own `theme`;
  - after sign-in and on password reset, read own `suspended`, and sign out if it's true.

### `favorites`

`(user_id, campground_id)` PK.
- `user_id` → `auth.users(id)`, on delete cascade.
- `campground_id` → `campgrounds(id)`, on delete cascade.
- `note` text, nullable.
- `created_at` timestamptz.

**Policy:** "users manage own favorites": all operations, `auth.uid() = user_id`.

### `trips` and `trip_stops`

`trips`:
- `id` uuid PK;
- `user_id` → `auth.users(id)`, on delete cascade;
- `name` text, not null;
- `created_at`.

**Policy:** "users manage own trips" (`auth.uid() = user_id`).

`trip_stops`:
- `id` uuid PK;
- `trip_id` → `trips(id)`, on delete cascade (indexed);
- `campground_id` → `campgrounds(id)`, on delete cascade;
- `position` int, not null. There's **no** uniqueness on `(trip_id, position)`; the app keeps the order.

**Policy:** "users manage own trip stops": all operations, allowed when the parent trip belongs to `auth.uid()`.

### Deleting things

- **Deleting an `auth.users` row** cascades to its `users`, `favorites` and `trips` rows, and through `trips` to `trip_stops`.
- **Deleting a campground** cascades to favorites, trip stops and attributes. The syncs only upsert, so in practice this never happens.

## Functions (RPCs)

All are owned by `postgres` and pin `search_path`. "Admin-guarded" means the function's first statement is `if not is_admin(auth.uid()) then raise exception 'not authorized'`.

| Function | Kind | Who can execute | Does |
|---|---|---|---|
| `nearest_campgrounds(user_lat, user_lng, result_limit int = 50, agency_filter text[] = null, max_distance_m float = null, state_filter text[] = null, park_filter text[] = null)` | sql, stable | anon, authenticated | Campgrounds ordered by distance, with `lat`, `lng` and `distance_m`. Each filter is skipped when null. `state_filter` also keeps rows whose `state` is null. When `max_distance_m` is set, it returns **every** row within that radius and ignores `result_limit`; otherwise it returns the nearest `result_limit`. |
| `get_campgrounds_by_ids(campground_ids text[], agency_filter text[] = null)` | sql, stable | anon, authenticated | The same columns minus `distance_m`, for the given ids, optionally filtered by agency. Used for favorites and trip stops. |
| `is_admin(uid uuid)` | sql, stable | authenticated | `true` if that user's `role = 'admin'`. Used by RLS, every admin function and the admin edge functions. |
| `get_users_for_admin()` | plpgsql, security definer, admin-guarded | authenticated | Every user: `id, email, display_name, role, suspended, created_at` (email and created_at from `auth.users`), newest first. |
| `admin_update_user_role(target_user_id, new_role)` | plpgsql, security definer, admin-guarded | authenticated | Sets `role`. Refuses your own id (`'cannot modify your own role'`) and anything but the three roles (`'invalid role'`). |
| `admin_set_user_suspended(target_user_id, is_suspended)` | plpgsql, security definer, admin-guarded | authenticated | Sets `suspended`. Refuses your own id (`'cannot modify your own suspension'`). |
| `admin_update_user_display_name(target_user_id, new_display_name)` | plpgsql, security definer, admin-guarded | authenticated | Sets `display_name`, including your own. |
| `get_admin_stats()` | plpgsql, security definer, admin-guarded | authenticated | One row: `favorites_count`, `trips_count` across all users. |
| `handle_new_user()` | plpgsql, security definer, trigger | nobody directly (revoked; 0002) | Inserts the `users` row: `display_name` from the sign-up metadata's `display_name`, else the part of the email before `@`. |

**Trigger:** `on_auth_user_created`: `after insert on auth.users for each row execute function public.handle_new_user()`.

**Last admin:** V1 only stops admins changing their own role or suspension. V1.1 adds a trigger that keeps at least one active admin (see **Fixes** #4).

## Auth (Supabase Auth, as V1 uses it)

- **Email and password only.** The calls V1 makes:
  - `signUp({ email, password, options: { data: { display_name } } })`;
  - `signInWithPassword`;
  - `resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })`;
  - `updateUser({ password })`, and `updateUser({ data: { display_name } })`;
  - `getSession`, `onAuthStateChange` and `signOut`.
- **Suspension is enforced in the app, not the database.** After sign-in, and on the reset-password page, the app reads `users.suspended` and signs out if it's true.
- **Local settings:** `supabase/config.toml` from V1, with `project_id = "Campsites"`. Email confirmations are **off** locally, and `site_url` is `http://127.0.0.1:3000`.
- **Production's auth settings aren't in the backup.** That's email confirmation, site URL, redirect URLs and SMTP; a production database dump doesn't include them.

## Edge functions

All six use `SUPABASE_URL`, plus `SUPABASE_SERVICE_ROLE_KEY` for privileged work. Supabase provides those automatically.

| Function | Called by | Checks the caller | Does |
|---|---|---|---|
| `delete-account` | the signed-in user (Account page) | a valid user JWT (`auth.getUser`) | Deletes the caller's own `auth.users` row, and so their data by cascade. |
| `admin-delete-account` | admin page | user JWT, then `is_admin` → 401 / 403 | Deletes `target_user_id`'s auth user. |
| `admin-invite-user` | admin page | user JWT, then `is_admin` | `inviteUserByEmail(email, { data: { display_name } })`; the invite email comes from Supabase. |
| `admin-update-user-email` | admin page | user JWT, then `is_admin` | `updateUserById(target_user_id, { email: new_email })`. |
| `nps-sync` | run by hand (dashboard or CLI) | **none in code**; only the platform's JWT check | Pages through NPS `/campgrounds` and `/parks` (`NPS_API_KEY`) and upserts `campgrounds` and `parks`. |
| `ridb-sync` | run by hand | **none in code** | Pages through RIDB `/facilities?activity=9&full=true` (`RIDB_API_KEY`) and upserts `campgrounds` with `ridb:` ids, `source = 'ridb'`, `park_code = null`, plus agency, state and the recreation.gov reservation URL. |

- **There's no schedule.** No `pg_cron` job exists in production or the migrations, so the syncs only run when someone runs them.
- **Tests:** `deno test supabase/functions`, 34 tests, covering only the pure parts: `ridb-sync/transform.ts`, `ridb-sync/agency.ts` and `nps-sync/transform.ts`. They don't touch the network or a database. Each step that touches these files would run them. No step should touch them, since they're in the contract.
- **The loop never calls NPS or RIDB,** and never deploys a function. Locally, campground data comes from the seed (Phase 3), copied from production as it is.

## Fixes (Shawn, 2026-10-24)

Shawn reviewed the behaviors below and asked for them fixed in V1.1, except `moderator` (it gets powers later) and the rows with no `state` (dealt with later). **V1's production database doesn't have these fixes; V1 is frozen.** The Tables, Functions and Edge functions sections above describe V1 as it was through `0019`. These fixes apply on top of them, and where the two differ, this section wins.

| # | Problem in V1 | Fix in V1.1 | Where |
|---|---|---|---|
| 1 | Anyone could read every user's name, role and suspension | `users` select policy is "users can read own row" (authenticated, `auth.uid() = id`), and `anon` has no privileges on `users`. Admins list users through `get_users_for_admin()` (security definer), as before. | `0020` §1 |
| 2 | Suspension enforced only by the app | New `is_active_user(uid)` (security definer: true if the row exists and isn't suspended). The `favorites`, `trips` and `trip_stops` policies, and the `users` update policy, also require `is_active_user(auth.uid())`. A suspended user still reads their own `users` row, which the app uses to sign them out. | `0020` §2 |
| 3 | A suspended admin kept admin powers | `is_admin(uid)` also requires `not suspended`. | `0020` §3 |
| 4 | The last admin could delete their own account | Trigger `users_guard_last_admin` (before update of `role`/`suspended`, or delete, on `users`) raises `cannot remove the last admin` when the change would leave no active admin. Deleting an `auth.users` row cascades to `users`, so the whole delete fails. | `0020` §4 |
| 5 | Trip stop positions could repeat within a trip | Unique `(trip_id, position)`, deferrable initially immediate. New `reorder_trip_stops(p_trip_id, p_stop_ids uuid[])` sets every position in one statement (position = index in the array, from 0); it runs as the caller, so RLS applies. **V1.1's app reorders with this RPC**, not V1's one-update-per-stop, which a unique position would break part-way. | `0020` §5 |
| 6 | Sync functions ran for any caller | `nps-sync` and `ridb-sync` return 403 unless `Authorization: Bearer <service role key>`, checked before anything else. Confirmed live on Ralph: the anon key now gets 403, where before the platform's JWT check let it through. | `_shared/service-role.ts` (+4 Deno tests) |
| 7 | Constraint names said `profiles_…` | Renamed to `users_pkey`, `users_id_fkey`. | `0020` §6 |
| 8 | **212 campgrounds sat at 0,0** (added 2026-10-27). RIDB sends 0,0 when it doesn't know a location, and `ridb-sync` stored it. | `nearest_campgrounds` leaves out rows at exactly 0,0, so Finder results and counts only hold real locations. `get_campgrounds_by_ids` still returns them, so favorites and trip stops keep working. `ridb-sync` skips 0,0 facilities (+2 Deno tests). The rows stay in the seed, which mirrors production. | `0021`; `ridb-sync/transform.ts` |
| 9 | **"NPS Priest Rock Public Use Cabin" had its longitude's sign flipped** (+154.18, in Russia; added 2026-10-27) | Corrected in `ralphloop/seed-app.sql` after loading (V1's own row is unchanged). | seed |

**Correction to the first draft.** It said an admin could demote or suspend every other admin, leaving none. That can't happen: admins can't change their own role or suspension, so the caller always stays an admin. The real gaps were #3 (a suspended admin kept its powers) and #4 (self-deletion).

**Tests:** `supabase/tests/security_fixes_test.sql`, 22 pgTAP tests. Each fix has tests, and so do the V1 behaviors that must keep working (an active user adds favorites, trips and stops, and changes their theme; an admin lists users). It was run red before `0020` (16 failing, 6 passing), then green after `0020`, and green again after a full `supabase db reset` and the dev seed.

## Behaviors reviewed (2026-10-24)

Shawn's answers: 1–4, 7 and 8 are fixed (see **Fixes**); 5 stays as it is; 6 waits.

1. **Anyone, signed in or not, can read every user's `display_name`, `role` and `suspended`** ("anyone can read profiles"; table grants include `anon`). Confirmed locally: an anon REST call to `/rest/v1/users` lists them. Nothing in V1's UI shows other users' names, so this looks left over from the MVP.
2. **Suspension isn't enforced by the database.** A suspended user's session token still passes RLS, so they could reach their own data through the API directly. Only the app signs them out.
3. **`nps-sync` and `ridb-sync` don't check who calls them.** Supabase's JWT check is on by default, and `config.toml` doesn't turn it off. The public anon key is itself a valid JWT, so anyone with it should be able to trigger a full sync against the NPS and RIDB APIs. Not tested: the functions aren't served locally.
4. **No last-admin guard** (see Functions). *Fixed as #3 and #4; see the correction under Fixes.*
5. **`moderator` is a role with no powers.** *Stays: moderators get powers later.*
6. **Some campgrounds have no `state` in production,** so the state filter never hides them (see `campgrounds.state`): 463 of the 4,900 rows have no `state`: 163 NPS, 243 USFS, 43 BLM and 8 USACE (counted from the seed, 2026-10-25). *Later.* A future sync from NPS and RIDB, whose code already parses state, could fill in some of them; rows whose source address has no state stay unknown.
7. **`trip_stops.position` isn't unique per trip.**
8. **The `users` constraint names still say `profiles_…`** (cosmetic; from the 0004 rename).

## Not in this contract

- `auth`, `storage`, `realtime` and `vault` internals: Supabase's, not V1's. V1 doesn't use `storage`; production has one bucket (`ShawnsDropBox`) with one object, unrelated to the app.
- Production's project settings: auth URLs, SMTP, API keys, edge-function secrets. They're recorded by hand when V1.1's own cloud project is set up.
- Data. The seed (Phase 3) carries campground reference data only.

## Corrections made elsewhere

- **CLAUDE.md and the roadmap said the seed keeps the loop from calling "the National Archives" API.** V1 has no such API anywhere; it calls only NPS and RIDB. Both were corrected on 2026-10-24.
