# Campsites (CampsiteFinder V1.1)

## What this project is

Campsites is **CampsiteFinder V1.1**: a rebuild of the live CampsiteFinder site (V1, Angular + PrimeNG + Supabase), built by a Ralph loop from written specs. It follows the model of the MyGear project (`~/ReactProjects/myGear`, React).

- **V1.1 matches V1's behavior exactly.** No new features. New ideas wait for V1.2.
- **Stack:** Angular + PrimeNG + Supabase, the same as V1.
- **Strategy:** rebuild from specs, not a retrofit of V1's code.

## Hard rules

1. **Never touch the production Supabase database** (V1's cloud project). Everything runs against a local Supabase stack. No Supabase cloud MCP tools, no `supabase link`, no `db push` or `functions deploy` to a cloud project.
2. **No Vercel deploys until V1.1 is ready.** This repo has no Vercel project attached. Don't add one, and don't add `vercel.json`.
3. **The schema is a fixed contract.** `supabase/migrations/0001–0018` and `supabase/functions/` are copied unchanged from V1 (`v1.0` tag), because production data depends on them. Don't edit them. If V1.1 truly needs a schema change, write it up as an additive migration for Shawn to review and apply by hand. The loop never writes or applies migrations.
4. **Spec first.** Shawn approves a spec, then a checkbox plan, before any code is written. Plans list what's out of scope.
5. **Loops belong to this project and run on the Ralph server** (in Docker, as MyGear's do). No shared, cross-project loop scripts.
6. **The loop gates on real checks.** The loop script, not the worker, runs build, lint and tests before a step's checkbox is committed. A step that fails its checks is un-ticked.

## The V1 reference

- **Read-only copy of V1:** `~/projects/CampsiteFinder-v1.0`, a git worktree at tag `v1.0`. Read it, never edit it.
- **What's in it:** V1's specs and plans (`docs/superpowers/specs/`, `docs/superpowers/plans/`) and V1's code, with its features in `src/app/features/`: about, account, admin, auth, favorites, finder, trips.
- **Who uses it:** only interactive spec-writing sessions. The loop worker never sees V1's code; it builds from this repo's specs and `task.md`.
- **Don't copy from it:** `src/environments/` holds V1's production Supabase URL and key, and `supabase/.temp/` links to the production project. Neither may come into this repo.
- **Later V1 changes:** fixes Shawn ships to live V1 after `v1.0` go on a "V1 changes since v1.0" list and get folded into the specs.

## What's here so far

- `supabase/`: V1's migrations, edge functions and `config.toml`, copied unchanged from `v1.0` (`project_id` set to `Campsites`).
- `docs/design/`: the '50s road-trip design assets.
- `create-new-project.md`, `reviewing-a-loop-project.md`: MyGear's checklists for setting up and reviewing a loop project.
- `forge/db-conventions.md`: MyGear's SQL rules. **Where they conflict with V1's existing schema, the schema wins.**

## Forge (the shared loop kit)

Forge is the layered kit from MyGear:
- **L0, loop machinery,** and **L1, conventions** (plan format, database rules, testing rules, step-check configuration) are framework-neutral and shared.
- **L2, the project scaffold,** comes in one version per framework.
- **L3, the core domain** (items and collections), is React-only and optional.

Campsites uses L0, L1 and its own Angular setup. **It does not use Forge's core plan (`core-plan.md`) or its domain**, because Campsites' domain is V1's schema. Forge's Angular scaffold will be extracted from Campsites after Campsites works. Each project copies Forge in; nothing is shared live.

## Order of work

1. **Specs.** Read the V1 reference and write V1.1 specs in `docs/superpowers/specs/`, one per feature. Include a "do not change" spec for the schema covering tables, RPCs, RLS policies and edge functions. Shawn reviews each and marks what's intended and what's accidental. Not started.
   - **Check the schema contract against production.** V1's migrations were applied to production one at a time through MCP, and production records them under different names (for example, repo `0014_nearest_campgrounds_null_state` is production `nearest_campgrounds_null_state`). So `0001–0018` hasn't been proved to equal production's real schema. Once Shawn has taken the production backup (`supabase db dump`, schema only, run by Shawn), compare it with a local stack built from `0001–0018`, and resolve any differences before the schema spec is approved. Read-only on production; Shawn runs the dump.
2. **Parity tests.** Playwright end-to-end tests are being written by another agent against V1. They must run against a local stack, never production, and use a configurable base URL so the same tests run against V1 and V1.1. Database tests (pgTAP via `supabase test db`) and edge-function tests carry over to V1.1 unchanged and belong in the step check.
3. **Loop setup.** Follow `create-new-project.md`. Copy `ralphloop/` from MyGear only **after** its step check is built (see `~/ReactProjects/myGear/docs/superpowers/handoff-2026-10-10-loop-verification-gate.md`), and make the React-specific parts per-project (worker prompt rule 8, `review.sh`'s dev-server command and port, the check commands).
4. **`task.md`,** written from the approved specs. Task 1 (local Supabase stack, migrations, seed) is done by hand. The seed uses V1's campground data and fake users, so the loop never calls the live RIDB, NPS or National Archives APIs. Migration `0007_set_shawnpfarmer_admin.sql` promotes Shawn's real email, so the local dev admin comes from the seed instead.
5. **Run the loop,** one task per PR, reviewed by Shawn.

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