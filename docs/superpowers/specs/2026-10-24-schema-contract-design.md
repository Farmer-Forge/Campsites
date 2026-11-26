# Schema contract ("do not change") — Design

Status: **approved by Shawn 2026-10-25.** Spec 1 of the roadmap (`2026-10-20-v1.1-roadmap-design.md`). It includes the fixes Shawn asked for on 2026-10-24 (see **Fixes**), merged in PR #3.

Last updated: 2026-10-24

## What this is

The database and edge functions V1.1 builds on. Every task in `task.md` that reads or writes data points here for names, types and rules. **The loop changes none of it.**

The contract is these files:
- `supabase/migrations/0001–0018`, unchanged from V1's `v1.0` tag;
- `supabase/migrations/0019_function_search_path.sql`, which adds the one thing production had that `0001–0018` lacked (below);
- `supabase/migrations/0020_security_fixes.sql`, the fixes Shawn asked for on 2026-10-24 (see **Fixes**). This is where V1.1's database **differs from V1's**;
- `supabase/migrations/0025_osm_state_campgrounds.sql` and `0026_osm_sync_schedule.sql`: state-run campgrounds from OpenStreetMap, retired rather than deleted, and the sync's weekly schedule (Shawn, 2026-11-26; see **Fixes** #12). Hand-written, applied by hand;
- `supabase/functions/`: V1's six edge functions, plus `osm-sync` (2026-11-26, **Fixes** #12), plus a caller check added to `nps-sync` and `ridb-sync` (`_shared/service-role.ts`, see **Fixes**) and the Priest Rock correction in `nps-sync/transform.ts` (**Fixes** #9);
- `supabase/migrations/0021_skip_zero_locations.sql`: search leaves out campgrounds at 0,0 (Shawn, 2026-10-27; see **Fixes** #8);
- `supabase/migrations/0022_state_filter_excludes_unknown_state.sql`: a state filter no longer lets in campgrounds with no state (Shawn, 2026-11-14; see **Fixes** #10);
- `supabase/migrations/0023_forgegeo_v0_1_0.sql`: a byte-for-byte copy of ForgeGeo v0.1.0's `20261115000000_create_geo.sql` (the `geo` schema; sha256 `8f242e32c503055a0dfb3eb15709150df1ec53ebae068b79030b73050313ff26`). Never edited here: a new ForgeGeo release is a new migration;
- `supabase/geo/us_states_cb_2025_500k.sql`: ForgeGeo v0.1.0's boundary data file, also a byte copy (sha256 `e2b41736fef54c817bdd5876d4c8e1e5ea17528e4be735d181d6625ff888ecae`). It's data, not a migration: `ralphloop/seed-dev.sh` loads it locally, and production loads it once by hand with `psql`;
- `supabase/migrations/0024_campground_state_from_location.sql`: a campground's state comes from its location (Shawn, 2026-11-15; see **Fixes** #11);
- `supabase/tests/security_fixes_test.sql`, `zero_location_test.sql`, `state_filter_test.sql` and `state_from_location_test.sql`: pgTAP tests for `0020`, `0021`, `0022` and `0024` (`supabase test db`, on Ralph);
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
| `supabase_vault` | `vault` | Supabase default. **Since `0026`:** holds `osm_sync_url` and `osm_sync_key`, which `call_osm_sync()` reads (created by hand) |
| `pg_trgm` | `extensions` | **`0025`.** `similarity()` for the OSM duplicate check |
| `pg_cron` | `pg_catalog` (`cron` schema) | **`0026`.** The `osm-sync` job, every 15 minutes |
| `pg_net` | `extensions` (`net` schema) | **`0026`.** `call_osm_sync()` posts to the `osm-sync` edge function |

## Tables

All seven of V1's tables, and `campground_state_log` (`0024`), have RLS on. Supabase's default grants give `anon` and `authenticated` all table privileges, so RLS policies are what actually decide access. There's one column-level exception, on `users`.

### `campgrounds`: synced reference data

| Column | Type | Notes |
|---|---|---|
| `id` | text, PK | NPS rows: NPS's campground id. RIDB rows: `ridb:<FacilityID>`. OSM rows (`0025`): `osm:<type>/<id>`, e.g. `osm:way/1104856366`. |
| `park_code` | text, nullable | NPS park code; `null` for RIDB rows |
| `name` | text, not null | |
| `description` | text | |
| `location` | `geography(Point,4326)`, not null | GiST index |
| `amenities`, `fees`, `images`, `contact` | jsonb | as each source gives them |
| `reservation_url`, `directions_url` | text | can be `''` (see the reserve/directions plan in V1) |
| `agency` | text, not null, default `'NPS'` | btree index; `NPS`, `USFS`, `BLM`, `USACE`, `FWS`, or `STATE` (OSM rows, `0025`) |
| `source` | text, not null, default `'nps'` | `nps`, `ridb` or `osm` (`0025`) |
| `state` | text, nullable | two-letter state; btree index. **Null means unknown, and state filters always include it.** In production, 463 of the 4,900 rows have no `state`: 163 NPS, 243 USFS, 43 BLM and 8 USACE (counted from the seed, 2026-10-25). *(An earlier draft said every NPS row lacked a state; the data says otherwise.)* **Since `0024`** (**Fixes** #11) it's set by trigger on every insert and update: the override, else the location's state, else the source's (see `state_reason`). Since `0022`, state filters leave out nulls. |
| `source_state` | text, nullable (`0024`) | the state the source's address gave, as the sync sent it |
| `state_override` | text, nullable (`0024`) | an admin's state for this campground; outranks location and source until cleared (`admin_set_campground_state_override`) |
| `state_reason` | text, nullable, check (`0024`) | why `state` has its value: `manual`, `no_geo_data`, `no_location`, `no_boundary`, `location_filled`, `source`, `near_border` or `location_overrode` |
| `updated_at` | timestamptz, not null, default `now()` | |
| `retired_at` | timestamptz, nullable (`0025`) | set when its Source no longer lists it; null means live. **Only `osm` rows are ever retired** (a check), and both columns are set or both null |
| `retired_reason` | text, nullable, check (`0025`) | `gone_from_osm`, `not_state_run` or `duplicate` |

- **Policy:** "anyone can read campgrounds" (select, everyone).
- **Writes:** none from the app. Only `nps-sync`, `ridb-sync` and (`0025`) `osm-sync` write, with the service role, upserting on `id`. `osm-sync` writes through `apply_osm_sync_state()` and only ever touches `osm` rows. **Since `0024`,** three triggers decide `state` on every write (see **Fixes** #11 and `docs/adr/0002-three-triggers-for-campground-state.md`).
- **App use:** the `nearest_campgrounds` and `get_campgrounds_by_ids` RPCs; `select park_code where park_code is not null` (the Finder's park filter); and `select id, name ilike %q% limit 20` (search by name, for add-a-stop).

### `campground_state_log`: every change to a campground's state (`0024`)

`id` (identity), `campground_id` (FK, cascade), `at`, `old_state`, `new_state`, `source_state`, `location_state`, `override_state`, `reason`, `distance_m` (to the source's state, for `near_border` and `location_overrode`), `changed_by` (`auth.uid()`, null for syncs). Written only by the `campground_state_resolve` trigger. RLS on with no policies; `anon` and `authenticated` have no privileges. Admins read it through `admin_campground_state_log`.

### `osm_campgrounds`: the OSM-only facts for each `osm` row (`0025`)

`campground_id` (PK, FK cascade), `overpass_state` (the 2-letter Overpass area it came from; the retire rule keys on this, not on `state`), `operator`, `operator_wikidata`, `first_seen_at`, `last_seen_at`, `created_at`. RLS on: "admins read osm_campgrounds" (select, `is_admin`). `anon` has no privileges, `authenticated` only `select`. Written only by `apply_osm_sync_state()`.

### `osm_sync_runs`: one row per state per OSM sync run (`0025`)

`id` (identity), `state`, `status` (`running`, `ok`, `failed`, `guarded`), `started_at`, `finished_at`, the counts (`fetched`, `kept_classified`, `kept_new`, `kept_updated`, `dropped_not_state_run`, `dropped_no_name`, `dropped_duplicate`, `dropped_no_point`, `retired`, `unretired`), `operators` (operator → kept/dropped), `near_misses` (OSM rows within 300 m of an NPS/RIDB row with a different name), `error`, `created_at`. RLS on: "admins read osm_sync_runs". Same privileges as `osm_campgrounds`. "How many did each state add" is one query on this table.

### `geo.us_states` and `geo.dataset`: ForgeGeo v0.1.0 (`0023`)

Reference geography from ForgeGeo (its README is the contract): the 56 Census state-level areas with their boundaries, and which data vintage is loaded. `geo` isn't in `[api] schemas`; `anon` has nothing, `authenticated` and `service_role` may read. Functions: `geo.state_at(geography)` and `geo.distance_to_state_m(geography, text)`.

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
- **Deleting a campground** cascades to favorites, trip stops and attributes. The syncs only upsert, so in practice this never happens. **OSM rows are retired, never deleted** (`0025`, `docs/adr/0003-osm-campgrounds-retire-never-delete.md`).

## Functions (RPCs)

All are owned by `postgres` and pin `search_path`. "Admin-guarded" means the function's first statement is `if not is_admin(auth.uid()) then raise exception 'not authorized'`.

| Function | Kind | Who can execute | Does |
|---|---|---|---|
| `nearest_campgrounds(user_lat, user_lng, result_limit int = 50, agency_filter text[] = null, max_distance_m float = null, state_filter text[] = null, park_filter text[] = null)` | sql, stable | anon, authenticated | Campgrounds ordered by distance, with `lat`, `lng` and `distance_m`. Each filter is skipped when null. **Since `0022`,** `state_filter` returns only rows whose `state` is in it; rows with no `state` come back only when `state_filter` is null (**Fixes** #10). When `max_distance_m` is set, it returns **every** row within that radius and ignores `result_limit`; otherwise it returns the nearest `result_limit`. **V1.1** (`0021`) also leaves out rows at exactly 0,0 (**Fixes** #8). **Since `0025`** it leaves out retired campgrounds (**Fixes** #12). |
| `get_campgrounds_by_ids(campground_ids text[], agency_filter text[] = null)` | sql, stable | anon, authenticated | The same columns minus `distance_m`, for the given ids, optionally filtered by agency. Used for favorites and trip stops. **Since `0025`** it also returns `retired boolean`, and returns retired campgrounds too (re-created, since its return type changed). |
| `is_admin(uid uuid)` | sql, stable | authenticated | `true` if that user's `role = 'admin'`. Used by RLS, every admin function and the admin edge functions. |
| `get_users_for_admin()` | plpgsql, security definer, admin-guarded | authenticated | Every user: `id, email, display_name, role, suspended, created_at` (email and created_at from `auth.users`), newest first. |
| `admin_update_user_role(target_user_id, new_role)` | plpgsql, security definer, admin-guarded | authenticated | Sets `role`. Refuses your own id (`'cannot modify your own role'`) and anything but the three roles (`'invalid role'`). |
| `admin_set_user_suspended(target_user_id, is_suspended)` | plpgsql, security definer, admin-guarded | authenticated | Sets `suspended`. Refuses your own id (`'cannot modify your own suspension'`). |
| `admin_update_user_display_name(target_user_id, new_display_name)` | plpgsql, security definer, admin-guarded | authenticated | Sets `display_name`, including your own. |
| `get_admin_stats()` | plpgsql, security definer, admin-guarded | authenticated | One row: `favorites_count`, `trips_count` across all users. |
| `recompute_campground_states()` | plpgsql, security definer | service_role | **`0024`.** Re-runs the state rules on every campground (the first backfill, and after a boundary reload); returns `(state_reason, n)`. |
| `admin_set_campground_state_override(campground_id, state_code)` | plpgsql, security definer, admin-guarded (`42501`) | authenticated | **`0024`.** Sets (null clears) `state_override`. The code is trimmed and upper-cased; one not in `geo.us_states` raises `22023`, an unknown campground `P0002`. Returns the row's new `state, state_reason`. For the later Admin UI. |
| `admin_campground_state_log(campground_id = null, result_limit = 100)` | plpgsql, stable, security definer, admin-guarded (`42501`) | authenticated | **`0024`.** `campground_state_log` rows, newest first, for one campground or all; at most 1,000. |
| `start_osm_sync_run(p_state text = null)` | plpgsql | service_role | **`0025`.** Starts one state's run and returns `(run_id, state)`, or no row when another run is in progress (a run `running` for over 10 minutes is marked failed) or nothing is due. With no state it picks, of the 50, a state with no `ok` run in 6 days **and no attempt of any kind in 6 hours**, oldest attempt first, so a state that keeps failing is tried at most 4 times a day. An unknown state raises `22023`. |
| `apply_osm_sync_state(p_run_id, p_rows jsonb, p_dropped_ids text[], p_unplaced_ids text[], p_fetched int, p_dropped_no_name int, p_operators jsonb)` | plpgsql | service_role | **`0025`.** In one transaction: drops duplicates (a live NPS/RIDB row within 300 m with name `similarity` > 0.5; an existing OSM row retires as `duplicate`), upserts the rest as `agency = 'STATE'`, `source = 'osm'` (unretiring any that come back), retires this state's `osm` rows that are gone or classified out (rows in `p_unplaced_ids`, kept but with no usable point, are left as they are), and logs the run. **The guard:** with 0 fetched, or under half the state's last `ok` kept count, nothing is retired as gone or not state-run and the run is `guarded`. A real drop is accepted on the 4th such run in a row (3 guarded runs with data before it); an empty result is always guarded. |
| `fail_osm_sync_run(p_run_id, p_error)` | sql | service_role | **`0025`.** Marks a running run failed. |
| `normalize_campground_name(text)`, `osm_sync_states()` | sql, immutable | service_role | **`0025`.** Helpers: a name lowercased with punctuation and the generic words dropped; the 50 state codes. |
| `call_osm_sync()` | plpgsql, security definer | only `postgres` (the cron job); revoked from `public`, `anon`, `authenticated` and `service_role` | **`0026`.** Posts to `osm-sync` through `pg_net` with the URL and key from Vault; does nothing until both secrets exist. |
| `handle_new_user()` | plpgsql, security definer, trigger | nobody directly (revoked; 0002) | Inserts the `users` row: `display_name` from the sign-up metadata's `display_name`, else the part of the email before `@`. |

**Trigger:** `on_auth_user_created`: `after insert on auth.users for each row execute function public.handle_new_user()`.

**Triggers on `campgrounds` (`0024`):** `campgrounds_state_capture_source` (before insert, per row: `source_state := state`, nothing else), `campgrounds_state_resolve` (before update, per row: the state rules and the log) and `campgrounds_state_resolve_inserted` (after insert, per statement, transition table: re-runs the rules on rows really inserted). Why three: `docs/adr/0002-three-triggers-for-campground-state.md`.

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

All seven use `SUPABASE_URL`, plus `SUPABASE_SERVICE_ROLE_KEY` for privileged work. Supabase provides those automatically.

| Function | Called by | Checks the caller | Does |
|---|---|---|---|
| `delete-account` | the signed-in user (Account page) | a valid user JWT (`auth.getUser`) | Deletes the caller's own `auth.users` row, and so their data by cascade. |
| `admin-delete-account` | admin page | user JWT, then `is_admin` → 401 / 403 | Deletes `target_user_id`'s auth user. |
| `admin-invite-user` | admin page | user JWT, then `is_admin` | `inviteUserByEmail(email, { data: { display_name } })`; the invite email comes from Supabase. |
| `admin-update-user-email` | admin page | user JWT, then `is_admin` | `updateUserById(target_user_id, { email: new_email })`. |
| `nps-sync` | run by hand (dashboard or CLI) | **none in code**; only the platform's JWT check | Pages through NPS `/campgrounds` and `/parks` (`NPS_API_KEY`) and upserts `campgrounds` and `parks`. |
| `ridb-sync` | run by hand | **none in code** | Pages through RIDB `/facilities?activity=9&full=true` (`RIDB_API_KEY`) and upserts `campgrounds` with `ridb:` ids, `source = 'ridb'`, `park_code = null`, plus agency, state and the recreation.gov reservation URL. |
| `osm-sync` (2026-11-26) | `pg_cron` every 15 minutes (`0026`), or by hand with `?state=MN` | the secret-key check (`_shared/service-role.ts`), `verify_jwt = false` | One state per call: Overpass `tourism=camp_site` for that state (`OVERPASS_URL` secret overrides the server), keeps state-run ones (`classify.ts`), and hands them to `apply_osm_sync_state()`. Never touches NPS or RIDB rows. |

- **There's no schedule for `nps-sync` or `ridb-sync`:** they only run when someone runs them. `osm-sync` is the one scheduled sync (`0026`), and only once its Vault secrets exist.
- **Tests:** `deno test supabase/functions`, 67 tests (2026-11-26), covering only the pure parts: `ridb-sync/transform.ts`, `ridb-sync/agency.ts`, `nps-sync/transform.ts`, the caller check and, since 2026-11-26, `osm-sync/classify.ts`, `transform.ts` and `overpass.ts` (with a fake `fetch`). They don't touch the network or a database. Each step that touches these files would run them. No step should touch them, since they're in the contract.
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
| 8 | **212 campgrounds sat at 0,0** (added 2026-10-27). RIDB sends 0,0 when it doesn't know a location, and `ridb-sync` stored it. | `nearest_campgrounds` leaves out rows at exactly 0,0, so Finder results and counts only hold real locations. `get_campgrounds_by_ids` still returns them, so favorites and trip stops keep working, and the Admin page's name search (`ilike`) still finds them. `ridb-sync` is unchanged: it still stores and refreshes them, so their names and Reserve links stay current. The rows stay in the seed, which mirrors production. | `0021` |
| 9 | **"NPS Priest Rock Public Use Cabin" had its longitude's sign flipped** (+154.18, in Russia; added 2026-10-27) | `nps-sync` flips that one campground's longitude back when it's positive, so every sync stores the right value (+1 Deno test). It's not a general rule, because real US places such as Guam have a positive longitude. `ralphloop/seed-app.sql` makes the same correction after loading production's data. V1's own row is unchanged. | `nps-sync/transform.ts`; seed |
| 10 | **The Where filter let in campgrounds from other states** (added 2026-11-14; `docs/next-loop-bugs.md`, bug 6). `state_filter` kept every row with a null `state` (0014), and 422 of the 4,688 searchable campgrounds in production have none, so "Midwest only" returned 897 campgrounds nationwide instead of 475. | `nearest_campgrounds` drops `c.state is null or`: a state filter returns only rows in those states. With no state filter ("All states") the null-state rows still come back. **Applied to production by hand 2026-11-14** (Lisa, Shawn's go-ahead; history 22/22). Filling in the missing states from each campground's location is a later, hand-written migration (bug 6, option A), not loop work. | `0022` |
| 11 | **Campgrounds with no state** (added 2026-11-15; `docs/next-loop-bugs.md`, bug 6 part A). 457 rows (422 searchable) had no `state` because their source records have no address (checked against the NPS API, 2026-11-15), so since #10 no Where filter finds them. Source addresses can also name a mailing office in another state. | ForgeGeo's state boundaries (`0023`, Census 1:500k) and three triggers (`0024`): a campground's `state` is its `state_override`, else the state its location is in, except that the source's state is kept within 1 km of that state (`near_border`) or when there's no location, boundary or boundary data. Every change is written to `campground_state_log`; admins fix a wrong result with `admin_set_campground_state_override`. Spec `~/plans/2026-11-15-state-backfill-design.md` (on Lisa). **Applied to production by hand 2026-11-15** (Lisa, Shawn's go-ahead; history 24/24; boundaries `cb_2025_us_state_500k` loaded; 422 → 1 searchable with no state, Midwest only 475 → 540). | `0023`, `0024` |
| 12 | **No state-run campgrounds** (added 2026-11-26; Shawn). The Finder only knew federal campgrounds (NPS, RIDB); state parks and state forests were missing. Design `~/plans/2026-11-26-campsites-state-parks-osm-design.md` (on Lisa). | A third Source, OpenStreetMap: `osm-sync` fetches one state per call from Overpass, keeps state-run campgrounds, drops duplicates of NPS/RIDB rows, and stores them as `agency = 'STATE'`, `source = 'osm'`. **OSM rows are retired, never deleted** (deletes cascade into favorites and trips): a retired campground leaves search but stays in favorites and trips, flagged `retired`. A guard stops a bad Overpass result retiring a state. Runs every 15 minutes through `pg_cron`, once its Vault secrets exist. NPS and RIDB rows are never touched. Tests: `supabase/tests/osm_state_campgrounds_test.sql` (71) and `supabase/functions/osm-sync/*.test.ts`. **Applied to production by hand** (not yet). | `0025`, `0026`, `osm-sync` |

**Correction to the first draft.** It said an admin could demote or suspend every other admin, leaving none. That can't happen: admins can't change their own role or suspension, so the caller always stays an admin. The real gaps were #3 (a suspended admin kept its powers) and #4 (self-deletion).

**Tests:** `supabase/tests/security_fixes_test.sql`, 22 pgTAP tests. Each fix has tests, and so do the V1 behaviors that must keep working (an active user adds favorites, trips and stops, and changes their theme; an admin lists users). It was run red before `0020` (16 failing, 6 passing), then green after `0020`, and green again after a full `supabase db reset` and the dev seed. `supabase/tests/zero_location_test.sql`, 5 pgTAP tests, covers `0021` (#8). `supabase/tests/state_filter_test.sql`, 4 pgTAP tests, covers `0022` (#10); run red against `0021`'s function (test 3 fails), green with `0022`. `supabase/tests/state_from_location_test.sql`, 55 pgTAP tests, covers `0024` (#11) with its own square test states; run red before `0024` (every test fails), green with it, and red again (T1–T6 and more) with the after-insert trigger dropped.

## Behaviors reviewed (2026-10-24)

Shawn's answers: 1–4, 7 and 8 are fixed (see **Fixes**); 5 stays as it is; 6 waits.

1. **Anyone, signed in or not, can read every user's `display_name`, `role` and `suspended`** ("anyone can read profiles"; table grants include `anon`). Confirmed locally: an anon REST call to `/rest/v1/users` lists them. Nothing in V1's UI shows other users' names, so this looks left over from the MVP.
2. **Suspension isn't enforced by the database.** A suspended user's session token still passes RLS, so they could reach their own data through the API directly. Only the app signs them out.
3. **`nps-sync` and `ridb-sync` don't check who calls them.** Supabase's JWT check is on by default, and `config.toml` doesn't turn it off. The public anon key is itself a valid JWT, so anyone with it should be able to trigger a full sync against the NPS and RIDB APIs. Not tested: the functions aren't served locally.
4. **No last-admin guard** (see Functions). *Fixed as #3 and #4; see the correction under Fixes.*
5. **`moderator` is a role with no powers.** *Stays: moderators get powers later.*
6. **Some campgrounds have no `state` in production.** Until `0022` the state filter never hid them; since `0022` (**Fixes** #10) any state filter leaves them out, so they're found only with "All states" (see `campgrounds.state`): 463 of the 4,900 rows have no `state`: 163 NPS, 243 USFS, 43 BLM and 8 USACE (counted from the seed, 2026-10-25). *Later.* A future sync from NPS and RIDB, whose code already parses state, could fill in some of them; rows whose source address has no state stay unknown. **Resolved by `0024`** (**Fixes** #11): the state now comes from location.
7. **`trip_stops.position` isn't unique per trip.**
8. **The `users` constraint names still say `profiles_…`** (cosmetic; from the 0004 rename).

## Not in this contract

- `auth`, `storage`, `realtime` and `vault` internals: Supabase's, not V1's. V1 doesn't use `storage`; production has one bucket (`ShawnsDropBox`) with one object, unrelated to the app.
- Production's project settings: auth URLs, SMTP, API keys, edge-function secrets. They're recorded by hand when V1.1's own cloud project is set up.
- Data. The seed (Phase 3) carries campground reference data only.

## Corrections made elsewhere

- **CLAUDE.md and the roadmap said the seed keeps the loop from calling "the National Archives" API.** V1 has no such API anywhere; it calls only NPS and RIDB. Both were corrected on 2026-10-24.
