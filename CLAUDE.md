# Campsites (CampsiteFinder V1.1)

## What this project is

Campsites is **CampsiteFinder V1.1**: a rebuild of the live CampsiteFinder site (V1), built by a Ralph loop from written specs.

**The goal driving this project is to move MyGear's Ralph loop (`~/ReactProjects/myGear/ralphloop/`, React) over to Angular** and prove it can rebuild a real, shipped app. V1.1 is the test case.

- **V1** is `~/projects/PrimeNG`. Its code is on GitHub (`Farmer-Forge/CampsiteFinder`), its database on Supabase cloud, and the site on Vercel. **Shawn isn't changing V1's app or database until the loop can rebuild it.**
- **V1.1** is this repo (GitHub `Farmer-Forge/Campsites`). It gets its own Supabase cloud project and Vercel site when it's ready. Those cloud steps are done by hand, never by the loop.
- **V1.1 matches V1's behavior and look exactly, plus the security fixes Shawn asked for on 2026-10-24** (spec 1, **Fixes**: users can read only their own row, suspension is enforced in the database, the last-admin guard, unique trip-stop positions with a reorder RPC, and the sync functions' caller check), **and the behavior changes in specs 2 and 3's "Changes from V1" sections** (Shawn, 2026-10-25: favorites load once, a list that skips drawing off-screen cards, guards that wait for the session, no dark mode, a 404 page, and others). No other new features, except those Shawn approved after launch and recorded in spec 1's **Fixes** (#12 state-run campgrounds, 2026-11-26; #13 saved filters, 2026-11-27). Other new ideas wait for V1.2.
- **Stack:** Angular + PrimeNG + Supabase, the same as V1.
- **Strategy:** the loop rebuilds the app from specs. V1's code isn't copied in, except the schema (below).

## Machines and repo

- **Lisa:** this WSL machine. Interactive Claude sessions, spec writing, V1's code (`~/projects/PrimeNG`) and the production backup. Docker on Lisa is being handled by other agents, outside this project. Campsites doesn't depend on it.
- **Ralph:** the loop server (`ssh ralph`: `claude@192.168.1.188`). Docker, the loop's worker image, and this project's local Supabase stack. Anything that needs Docker or a database runs here, including the schema comparison. MyGear's stack on Ralph uses ports 54330–54339; Campsites keeps the default 54320–54329.
- **GitHub:** `Farmer-Forge/Campsites`, **public**, default branch `main`. The loop's repo-scoped token goes in `~/.secrets/campsites-ralph-loop.env` on Ralph (installed and checked 2026-10-23: push and PR access to this repo only).

## Hard rules

1. **Never touch the production Supabase database** (V1's cloud project) from the loop or an ordinary session. Everything runs against a local Supabase stack. No `supabase link`, no `db push` or `functions deploy` to a cloud project, and no Supabase cloud MCP tool that can change anything. **Exception, read-only (Shawn, 2026-11-15):** an interactive Lisa session (never the loop, never a worker) may use these Supabase cloud MCP tools, which can't change anything: `get_advisors`, `query_logs`, `get_project`, `list_projects`, `get_project_url`, `list_tables`, `list_extensions`, `list_migrations`, `list_edge_functions`, `get_edge_function`, `list_branches` and `search_docs`. Every other connector tool stays off limits, `execute_sql` and `apply_migration` included (they can write). When such a session needs to read production data, it uses `psql` with the session forced read-only (`PGOPTIONS='-c default_transaction_read_only=on'`). Every change still goes through the hand routes below. **The one exception is the V1.1 cutover** (Shawn, 2026-11-12): V1.1 goes live on V1's hosted database instead of a new project. Its `db push` of `0019–0021` and the edge-function deploy are done by hand on Lisa, only in the cutover window, after a fresh backup and a passing rehearsal on Ralph, as set out in the Tongs cutover thread. **Since the cutover,** an approved additive migration (so far `0022`, 2026-11-14) is pushed by hand from Lisa with `supabase db push --db-url`, only after Shawn's go-ahead, its tests pass on a throwaway stack on Ralph, and the PR is merged. Never by the loop.
2. **Vercel: V1.1 is ready to deploy** (Shawn, 2026-11-12). `vercel.json` builds with `scripts/write-env.mjs`, which writes `environment.ts` from the Vercel project's `SUPABASE_URL` and `SUPABASE_ANON_KEY` at build time. The committed `environment.ts` stays empty. The loop never changes `vercel.json`, the script or the Vercel project.
3. **The schema is a fixed contract.** `supabase/migrations/0001–0018` and `supabase/functions/` are copied unchanged from V1 (`v1.0` tag), because production data depends on them. `0019_function_search_path.sql` (2026-10-24, approved by Shawn) adds the one thing production has that `0001–0018` lack (see below). `0020_security_fixes.sql`, and the caller check in `nps-sync`/`ridb-sync` (`supabase/functions/_shared/service-role.ts`), are the fixes Shawn asked for (2026-10-24, spec 1). The caller check was widened on 2026-11-14 for Supabase's new `sb_secret_` keys: it accepts any key in `SUPABASE_SECRET_KEYS` or `SUPABASE_SERVICE_ROLE_KEY`, and `config.toml` sets `verify_jwt = false` for the two sync functions, because the platform's JWT check can't read the new keys. `0021_skip_zero_locations.sql` (search leaves out the 212 campgrounds at 0,0) and the Priest Rock correction in `nps-sync/transform.ts` are two more (2026-10-27, spec 1, **Fixes** #8–9). `0022_state_filter_excludes_unknown_state.sql` (a state filter no longer lets in campgrounds with no state; 2026-11-14, spec 1, **Fixes** #10) is live in production. `0023_forgegeo_v0_1_0.sql` is a byte copy of ForgeGeo v0.1.0's `geo` schema (its boundary data is `supabase/geo/`, loaded by the dev seed and, in production, once by hand). `0024_campground_state_from_location.sql` sets each campground's state from its location (bug 6 part A; 2026-11-15, spec 1, **Fixes** #11). `0025_osm_state_campgrounds.sql` and `0026_osm_sync_schedule.sql`, with the new `osm-sync` edge function, add state-run campgrounds from OpenStreetMap, retired rather than deleted (2026-11-26, spec 1, **Fixes** #12). `0027_osm_dedupe_park_suffix.sql` makes the duplicate check ignore NPS's " - <park>" name suffix (2026-11-27). `0028_saved_filters.sql` adds saved filters and the Park filter's "Not in a national park" (2026-11-27, spec 1, **Fixes** #13) and is the latest. Don't edit any of them. Their tests: `supabase test db` (pgTAP, `supabase/tests/`) and `deno test supabase/functions`. If V1.1 truly needs a schema change, write it up as an additive migration for Shawn to review and apply by hand. The loop never writes or applies migrations.
4. **Spec first.** Shawn approves a spec, then a checkbox plan, before any code is written. Plans list what's out of scope.
5. **Loops belong to this project and run on the Ralph server** (in Docker, as MyGear's do). No shared, cross-project loop scripts.
6. **Every step is checked before it's ticked, by the worker and then by the loop.** `task.md` gives each step its own checks (`ng build`, `deno test`, `psql` queries), and the worker runs them before ticking the box. Since 2026-11-14 (Lisa, with Shawn's go-ahead; spec `~/plans/2026-11-14-campsites-loop-update.md` on Lisa) **the loop's own gate** then checks every ticked step:
   - `supabase db reset` + `supabase test db` on this project's local stack;
   - the dev seed again;
   - `ralphloop/app-check.sh`: lint, the production build (`ng build -c production,local`), and `console-check.mjs`, which loads that build in headless Chromium and fails on any console error.

   A failed gate unticks the step. Three failures open a draft PR titled `GATE FAILING`, and the chain stops. The gate came over from ForgeDB's loop, together with **ratify**: an independent Opus call that judges each finished task before its PR.

## The V1 reference

- **Where V1 is:** `~/projects/PrimeNG`. Read it, never edit it. Tag `v1.0` marks the version V1.1 copies (commit `3f85a8a`, which is also `main`).
- **There's no separate V1 copy.** A pinned checkout at `~/projects/CampsiteFinder-v1.0` was removed on 2026-10-20, since V1 is frozen. To read V1 exactly as tagged, use `git -C ~/projects/PrimeNG show v1.0:<path>`.
- **What's in it:** V1's specs and plans (`docs/superpowers/specs/`, `docs/superpowers/plans/`) and V1's code, with its features in `src/app/features/`: about, account, admin, auth, favorites, finder, trips.
- **V1's specs describe changes, not the finished app, and V1's code wins.** Each spec changes the one before. Five October changes shipped without a spec (their plans were written afterwards). The first spec promises a PWA that was never built. V1.1's specs are written from V1's **code**, with V1's specs and plans as background.
- **Who uses it:** only interactive spec-writing sessions. The loop worker never sees V1's code; it builds from this repo's specs and `task.md`.
- **Don't copy from it:** `src/environments/` holds V1's production Supabase URL and key, and `supabase/.temp/` links to the production project. Neither may come into this repo.
- **If V1 changes anyway:** a fix Shawn ships to V1 after `v1.0` goes on a "V1 changes since v1.0" list and gets folded into the specs.

## The loop and the local stack (Phase 1, done 2026-10-23)

- **`ralphloop/`** is MyGear's loop (from `dfeb147`), adapted for Angular, and merged with ForgeDB's loop on 2026-11-14:
  - the gate (hard rule 6);
  - ratify (`ratify-prompt.md`, Opus, `RALPH_RATIFY_MODEL`);
  - the guard that puts back `task.md` changes outside the current task;
  - draft PRs when the gate fails;
  - the code-fence fix.

  Its own tests run on Ralph with `bash ralphloop/tests/run-on-ralph.sh`. The worker image is `campsites-claude-worker:latest`, built on Ralph from `ralphloop/worker.Dockerfile`. It holds Node 22, Deno 2.9.5, psql 17 + pg_prove, jq, Playwright 1.64.1 with headless Chromium, and Claude Code. **Every worker call runs on Sonnet** (`claude-sonnet-5-5`, Shawn, 2026-10-26). `RALPH_MODEL=<model>` overrides it for one run of `doloop.sh` or `chain.sh`.
- **The review app** (`ralphloop/review.sh`, port 4200) serves the **production** build (`ng build -c production,local`, then `serve-spa.mjs`), so QC sees what users get; `--dev` serves `ng serve` instead. Re-run it after merges (`chain.sh` does). `angular.json`'s `local` configuration only swaps in `environment.local.ts`; Vercel's build doesn't use it.
- **The local Supabase stack** runs on Ralph from `~/projects/Campsites` (as `claude`), with ports 54321 (API) and 54322 (DB). Its values are in `~/.secrets/campsites-supabase.env`.
- **Dev login:** `admin@campsites.test` / `campsites-admin`, from `ralphloop/seed-dev.sh`. Re-run the seed after any `supabase db reset` (the loop's gate does this itself).
- **Local app settings:** `src/environments/environment.local.ts` (gitignored), the same shape as V1's `environment.ts`, swapped in by the `development` configuration. It's never committed: checkpoints skip it, and chain mode refuses a PR that contains it.

## Production backup (taken by Shawn, 2026-10-18)

`~/backups/campsitefinder/2026-10-18/`, with a copy in OneDrive (`backups/campsitefinder/`). `manifest.txt` lists the files, row counts and checksums:
- `schema.sql`: the `public` schema (tables, functions, RLS policies, grants);
- `auth_triggers.sql`: the `on_auth_user_created` trigger;
- `roles.sql`: custom roles, with no passwords;
- `data.sql` and `full.dump`: all data.

**`data.sql` and `full.dump` hold real users' password hashes and session tokens.** They never come into this repo, never go into a seed, and are never read whole. The seed takes only the campground reference data from them: `campgrounds`, `parks`, and `campground_attributes`, if it has rows (the manifest gives no count for it). That data is copied as it is, including what older sync functions left behind (for example, the 463 campgrounds with no `state`), because that's what V1 users see. The backup doesn't include production's project settings, API keys or deployed edge-function versions.

## What's here so far

- `supabase/`: V1's migrations, edge functions and `config.toml`, copied unchanged from `v1.0` (`project_id` set to `Campsites`).
- `docs/design/`: the '50s road-trip design assets. This is V1's current look (shipped 2026-10-08), not a redesign.
- `docs/superpowers/specs/2026-10-20-v1.1-roadmap-design.md`: the plan forward (approved 2026-10-20).
- `docs/superpowers/specs/`: specs 1–9, all approved (2026-10-25). `docs/superpowers/Design.md` and `style-task.md`: the design reference and UI rules.
- `ralphloop/task.md`: the loop's plan, generated by `docs/superpowers/plans/task-md/` (see its README). `ralphloop/seed-*.sql` and `seed-data/`: the dev admin, campground data from the production backup, and sample users.
- `create-new-project.md`, `reviewing-a-loop-project.md`: MyGear's checklists for setting up and reviewing a loop project.
- `forge/db-conventions.md`: MyGear's SQL rules. **Where they conflict with V1's existing schema, the schema wins.**

## Forge (the shared loop kit)

Forge is the layered kit from MyGear:
- **L0, loop machinery,** and **L1, conventions** (plan format, database rules, testing rules, step-check configuration) are framework-neutral and shared.
- **L2, the project scaffold,** comes in one version per framework.
- **L3, the core domain** (items and collections), is React-only and optional.

Campsites uses L0, L1 and its own Angular setup. **It does not use Forge's core plan (`core-plan.md`) or its domain**, because Campsites' domain is V1's schema. Forge's Angular scaffold will be extracted from Campsites after Campsites works. Each project copies Forge in; nothing is shared live.

## Order of work

The full version, with checkboxes, is in the roadmap spec.

1. **Specs.** Write V1.1 specs in `docs/superpowers/specs/` from V1's code, one per area. Include a "do not change" spec for the schema covering tables, RPCs, RLS policies and edge functions. Shawn reviews each and marks what's intended and what's accidental. Not started.
   - **Schema contract checked against production (2026-10-24).** The local stack's schema (`pg_dump --schema-only --schema=public` in `supabase_db_Campsites` on Ralph) was diffed on Lisa against the backup's `schema.sql`, plus the `auth.users` triggers and the extensions (from `full.dump`'s table of contents only). Everything matched except one thing: production pins `search_path = public, pg_temp` on `get_campgrounds_by_ids`, `is_admin` and `nearest_campgrounds`, and `0001–0018` didn't. That was most likely applied from Supabase's security advisor, outside the migrations. `0019_function_search_path.sql` adds it, so `0001–0019` now equal production's `public` schema. V1's own repo still has the gap; V1 is frozen, so it's only noted.
2. **Tests.** Playwright and app unit tests are **dropped** (Shawn, 2026-10-19). The loop's console check (2026-11-14) uses Playwright to judge the app, but it lives in `ralphloop/`; it's not an app test suite. V1 has no database tests. V1's Deno tests for the edge functions (`ridb-sync`, `nps-sync`) are part of the copied `supabase/functions/` and run as a step check.
3. **Loop setup: the main goal.** Follow `create-new-project.md`. Copy `ralphloop/` from MyGear, which works as it is today, and make Angular versions of its React-specific parts: worker prompt rule 8, `review.sh`'s dev-server command and port, the worker image (add Deno), and the seed scripts. Skip the parts of `create-new-project.md` that assume Forge's core plan and Tailwind.
4. **`task.md`,** written from the approved specs. Task 1 (local Supabase stack, migrations, seed) is done by hand. The seed uses the campground data from the production backup and fake users, so the loop never calls the live RIDB or NPS APIs (V1 calls no others). Migration `0007_set_shawnpfarmer_admin.sql` promotes Shawn's real email, so the local dev admin comes from the seed instead.
5. **Run the loop,** one task per PR, reviewed by Shawn.
6. **Later, by hand:** V1.1's own Supabase cloud project and Vercel site, once V1.1 is ready.

---

# General behavioral guidelines (carried over from V1)

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.