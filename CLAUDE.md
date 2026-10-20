# Campsites (CampsiteFinder V1.1)

## What this project is

Campsites is **CampsiteFinder V1.1**: a rebuild of the live CampsiteFinder site (V1), built by a Ralph loop from written specs.

**The goal driving this project is to move MyGear's Ralph loop (`~/ReactProjects/myGear/ralphloop/`, React) over to Angular** and prove it can rebuild a real, shipped app. V1.1 is the test case.

- **V1** is `~/projects/PrimeNG`. Its code is on GitHub (`Farmer-Forge/CampsiteFinder`), its database on Supabase cloud, and the site on Vercel. **Shawn isn't changing V1's app or database until the loop can rebuild it.**
- **V1.1** is this repo: a new git repo, which eventually gets its own GitHub repo, then its own Supabase cloud project and Vercel site when it's ready. Those cloud steps are done by hand, never by the loop.
- **V1.1 matches V1's behavior and look exactly.** No new features. New ideas wait for V1.2.
- **Stack:** Angular + PrimeNG + Supabase, the same as V1.
- **Strategy:** the loop rebuilds the app from specs. V1's code isn't copied in, except the schema (below).

## Hard rules

1. **Never touch the production Supabase database** (V1's cloud project). Everything runs against a local Supabase stack. No Supabase cloud MCP tools, no `supabase link`, no `db push` or `functions deploy` to a cloud project.
2. **No Vercel deploys until V1.1 is ready.** This repo has no Vercel project attached. Don't add one, and don't add `vercel.json`.
3. **The schema is a fixed contract.** `supabase/migrations/0001–0018` and `supabase/functions/` are copied unchanged from V1 (`v1.0` tag), because production data depends on them. Don't edit them. If V1.1 truly needs a schema change, write it up as an additive migration for Shawn to review and apply by hand. The loop never writes or applies migrations.
4. **Spec first.** Shawn approves a spec, then a checkbox plan, before any code is written. Plans list what's out of scope.
5. **Loops belong to this project and run on the Ralph server** (in Docker, as MyGear's do). No shared, cross-project loop scripts.
6. **Every step is checked before it's ticked.** As in MyGear today, `task.md` gives each step its own checks (`ng build`, `deno test`, `psql` queries), and the worker runs them before ticking the box. An extra check run by the loop script itself, MyGear's "verification gate" (spec on MyGear's unmerged `loop-verification-gate` branch, no code yet), is **deferred** (Shawn, 2026-10-20). The loop moves over as it works today. The gate can be added to both projects later as its own spec. The scaffold adds `angular-eslint`, so each step's checks include lint.

## The V1 reference

- **Where V1 is:** `~/projects/PrimeNG`. Read it, never edit it. Tag `v1.0` marks the version V1.1 copies (commit `3f85a8a`, which is also `main`).
- **There's no separate V1 copy.** A pinned checkout at `~/projects/CampsiteFinder-v1.0` was removed on 2026-10-20, since V1 is frozen. To read V1 exactly as tagged, use `git -C ~/projects/PrimeNG show v1.0:<path>`.
- **What's in it:** V1's specs and plans (`docs/superpowers/specs/`, `docs/superpowers/plans/`) and V1's code, with its features in `src/app/features/`: about, account, admin, auth, favorites, finder, trips.
- **V1's specs describe changes, not the finished app, and V1's code wins.** Each spec changes the one before. Five October changes shipped without a spec (their plans were written afterwards). The first spec promises a PWA that was never built. V1.1's specs are written from V1's **code**, with V1's specs and plans as background.
- **Who uses it:** only interactive spec-writing sessions. The loop worker never sees V1's code; it builds from this repo's specs and `task.md`.
- **Don't copy from it:** `src/environments/` holds V1's production Supabase URL and key, and `supabase/.temp/` links to the production project. Neither may come into this repo.
- **If V1 changes anyway:** a fix Shawn ships to V1 after `v1.0` goes on a "V1 changes since v1.0" list and gets folded into the specs.

## Production backup (taken by Shawn, 2026-10-18)

`~/backups/campsitefinder/2026-10-18/`, with a copy in OneDrive (`backups/campsitefinder/`). `manifest.txt` lists the files, row counts and checksums:
- `schema.sql`: the `public` schema (tables, functions, RLS policies, grants);
- `auth_triggers.sql`: the `on_auth_user_created` trigger;
- `roles.sql`: custom roles, with no passwords;
- `data.sql` and `full.dump`: all data.

**`data.sql` and `full.dump` hold real users' password hashes and session tokens.** They never come into this repo, never go into a seed, and are never read whole. The seed takes only the campground reference data from them: `campgrounds`, `parks`, and `campground_attributes`, if it has rows (the manifest gives no count for it). That data is copied as it is, including what older sync functions left behind (for example, NPS rows with no `state`), because that's what V1 users see. The backup doesn't include production's project settings, API keys or deployed edge-function versions.

## What's here so far

- `supabase/`: V1's migrations, edge functions and `config.toml`, copied unchanged from `v1.0` (`project_id` set to `Campsites`).
- `docs/design/`: the '50s road-trip design assets. This is V1's current look (shipped 2026-10-08), not a redesign.
- `docs/superpowers/specs/2026-10-20-v1.1-roadmap-design.md`: the plan forward (approved 2026-10-20).
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
   - **Check the schema contract against production.** V1's migrations were applied to production one at a time through MCP, so `0001–0018` hasn't been proved to equal production's real schema. Compare the backup's `schema.sql` and `auth_triggers.sql` with a schema dump of a local stack built from `0001–0018`, and resolve any differences before the schema spec is approved.
2. **Tests.** Playwright and app unit tests are **dropped** (Shawn, 2026-10-19). V1 has no database tests. V1's Deno tests for the edge functions (`ridb-sync`, `nps-sync`) are part of the copied `supabase/functions/` and run as a step check.
3. **Loop setup: the main goal.** Follow `create-new-project.md`. Copy `ralphloop/` from MyGear, which works as it is today, and make Angular versions of its React-specific parts: worker prompt rule 8, `review.sh`'s dev-server command and port, the worker image (add Deno), and the seed scripts. Skip the parts of `create-new-project.md` that assume Forge's core plan and Tailwind.
4. **`task.md`,** written from the approved specs. Task 1 (local Supabase stack, migrations, seed) is done by hand. The seed uses the campground data from the production backup and fake users, so the loop never calls the live RIDB, NPS or National Archives APIs. Migration `0007_set_shawnpfarmer_admin.sql` promotes Shawn's real email, so the local dev admin comes from the seed instead.
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