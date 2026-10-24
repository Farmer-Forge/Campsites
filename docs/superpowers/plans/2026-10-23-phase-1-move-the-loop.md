# Phase 1: Move MyGear's Loop to Angular — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Campsites has its own working copy of MyGear's Ralph loop, adapted for Angular. A one-task shakedown run on Ralph proves it end to end: worker container, Angular build, Deno tests, local database, checkpoints, PR.

**Architecture:** Copy `ralphloop/` from MyGear's `main` (commit `dfeb147`). Rename everything project-specific to Campsites. Then change only what's React-specific or what Campsites' rules add:
- Angular's dev server and config file in `review.sh`;
- Deno in the worker image;
- a dev seed for V1's schema;
- worker prompt rules for the schema contract;
- a chain-mode guard on `supabase/migrations/` and `supabase/functions/`.

The loop's own bash tests come along and must stay green. Work happens on branch `phase-1-loop`, which merges to `main` before anything runs on Ralph.

**Tech Stack:** bash, git, jq, Docker (on Ralph), Supabase CLI 2.117 (on Ralph), Node 22, Angular CLI 22, Deno 2.9.5, psql.

**Spec:** `docs/superpowers/specs/2026-10-20-v1.1-roadmap-design.md` (Phase 1).

## Global Constraints

- Never touch production: no Supabase cloud MCP tools, no `supabase link`, `db push` or `functions deploy`.
- Never change MyGear's files, containers, stack, image or secrets on Ralph or Lisa. If a bug turns up in the shared loop code, note it for MyGear; don't fix it there in this plan.
- Never print a token or key. Secrets files are `chmod 600`, owned by `claude`, in `/home/claude/.secrets/`.
- `supabase/migrations/0001–0018` and `supabase/functions/` stay unchanged.
- Campsites names:

  | What | Name |
  |---|---|
  | Repo | `Farmer-Forge/Campsites` |
  | Worktrees | `~/projects/Campsites-worktrees/` |
  | Worker image | `campsites-claude-worker:latest` |
  | Review container | `campsites-dev` |
  | Review port | `4200` |
  | Local Supabase ports | default `54320–54329` (MyGear's are `54330–54339`) |
  | Secrets | `campsites-ralph-loop.env`, `campsites-supabase.env` |
  | Chain files | `Campsites-chain.log`, `Campsites-chain.lock`, `Campsites-qc-checklist.md` |
  | Dev login | `admin@campsites.test` / `campsites-admin` |
- Loop tests run on Ralph via `bash ralphloop/tests/run-on-ralph.sh` (Lisa has no `jq`), in `~/looptest-campsites`, never MyGear's `~/looptest`.

## Review Focus

1. **Cross-project leak.** A leftover `mygear` name would make Campsites' loop use MyGear's image, secrets, stack or repo. Pinned by Task 1's grep step and the name assertions in the review and seed tests.
2. **The local config file getting committed.** `src/environments/environment.local.ts` holds the LAN address and anon key. A checkpoint must never commit it, even if the worker runs `git add -f`. Pinned by Task 2's checkpoint test.
3. **Schema contract edited by the worker and auto-merged.** A PR touching `supabase/migrations/` or `supabase/functions/` must stop chain mode. Pinned by Task 2's chain test.
4. **Port clash with MyGear's stack on Ralph.** Pinned by Task 5's port check and its check that MyGear's containers are still up.
5. **The seed breaking after a database reset or a second run.** Pinned by Task 5's run-twice and reset-then-seed steps.

---

### Task 1: Copy the loop and rename it for Campsites

**Files:**
- Create: `ralphloop/doloop.sh`, `ralphloop/loop-lib.sh`, `ralphloop/chain.sh`, `ralphloop/review.sh`, `ralphloop/seed-dev.sh`, `ralphloop/worker.Dockerfile`, `ralphloop/reset-and-rerun.md`, `ralphloop/tests/*` (all from MyGear `dfeb147`)
- Create: `ralphloop/task.md` (placeholder), `.gitignore`

**Interfaces:**
- Produces: every name in Global Constraints, used by all later tasks.

- [ ] **Step 1: Get the baseline.** Run MyGear's own loop tests on Ralph, unchanged:
  `bash ~/ReactProjects/myGear/ralphloop/tests/run-on-ralph.sh`
  Expected: `N passed, 0 failed`. Record N, the target for Step 6.
- [ ] **Step 2: Create branch `phase-1-loop`, then copy the files.**
  ```bash
  git -C ~/ReactProjects/myGear archive dfeb147 ralphloop | tar -x -C ~/projects/Campsites
  rm ralphloop/{task.md,activity.md,retro-findings.md,seed-app.sql,seed-sample.sql,seed-dev.sql}
  ```
  `seed-dev.sql` is rewritten in Task 3.
- [ ] **Step 3: Rename for Campsites** across `ralphloop/`:

  | From | To |
  |---|---|
  | `Farmer-Forge/MyGear` | `Farmer-Forge/Campsites` |
  | `MyGear-worktrees` | `Campsites-worktrees` |
  | `MyGear-chain.log`, `.lock`, `MyGear-qc-checklist.md` | the Campsites names |
  | `# MyGear QC checklist` | `# Campsites QC checklist` |
  | `mygear-claude-worker` | `campsites-claude-worker` |
  | `mygear-supabase.env`, `mygear-ralph-loop.env` | `campsites-…` |
  | `mygear-dev` | `campsites-dev` |
  | `"Run this from the myGear repo root"` | `"…the Campsites repo root"` |
  | the tests' `$SB/MyGear` (sandbox clone path) | `$SB/Campsites` |
  | `run-on-ralph.sh`'s `~/looptest` | `~/looptest-campsites` |
- [ ] **Step 4: Write `ralphloop/task.md` as a placeholder.** A heading `# Campsites task plan` and one line saying the plan is written in Phase 4 from the approved specs. No `## Task` headings, so `doloop.sh` reports nothing to do.
- [ ] **Step 5: Write the root `.gitignore`:** `node_modules/`, `dist/`, `.angular/`, `.env*`, `!.env.example`, `src/environments/environment.local.ts`.
- [ ] **Step 6: Run the tests.** `bash ralphloop/tests/run-on-ralph.sh` → `N passed, 0 failed`, the same N as Step 1.
- [ ] **Step 7: Check for leftover names.** `grep -rni mygear ralphloop/`. Every remaining hit must be prose about MyGear's history (for example, "MyGear's own precedent" in `reset-and-rerun.md`), never a name a script uses.
- [ ] **Step 8: Commit.** `git add ralphloop .gitignore && git commit -m "Loop: copy MyGear's ralphloop (dfeb147), renamed for Campsites"`

### Task 2: Campsites' guards: worker prompt, schema-contract guard, checkpoint excludes

**Files:**
- Modify: `ralphloop/doloop.sh` (worker prompt rules 4 and 8)
- Modify: `ralphloop/chain.sh` (the `FORBIDDEN` check, ~line 195)
- Modify: `ralphloop/loop-lib.sh` (`checkpoint_commit`)
- Modify: `ralphloop/tests/stub-worker.sh`, `tests/test-lib.sh`, `tests/test-chain.sh`, `tests/test-doloop.sh`

**Interfaces:**
- Consumes: Task 1's renamed scripts.
- Produces: the files rule 8 names, which spec 2 (app shell and design system) must create: `docs/superpowers/Design.md`, `docs/superpowers/style-task.md`, and shared components in `src/app/shared/ui/`.

- [ ] **Step 1: Write the failing tests.**
  - `test-lib.sh`: `test_checkpoint_never_commits_angular_cache_or_local_environment`. Create `.angular/cache/x` and `src/environments/environment.local.ts`, plus one normal file. Also force-stage the local environment file (`git add -f`). Run `checkpoint_commit`. Assert:
    - the committed file list contains the normal file;
    - it contains neither `.angular/` nor `environment.local.ts`.
  - `stub-worker.sh`: a new action, `tick-schemafile`. It ticks a step, then writes `supabase/migrations/0019_sneaky.sql` and `supabase/functions/sneaky/index.ts`.
  - `test-chain.sh`: `test_chain_refuses_pr_touching_schema_contract`, using `run_chain tick tick-schemafile`. Assert:
    - RC 1;
    - output contains `the schema contract`, `supabase/migrations/0019_sneaky.sql` and `supabase/functions/sneaky/index.ts`;
    - `main_subjects` has no `(#`.
  - `test-doloop.sh`: `test_prompt_carries_campsites_rules`. One `tick` run, then check `prompt-1.txt`. Assert:
    - it contains `supabase/migrations/`, `supabase link`, `docs/superpowers/style-task.md` and `src/app/shared/ui/`;
    - it doesn't contain `.jsx`.
- [ ] **Step 2: Confirm they fail.** `bash ralphloop/tests/run-on-ralph.sh checkpoint`, then `… schema_contract`, then `… campsites_rules` → each fails.
- [ ] **Step 3: Implement.**
  - `checkpoint_commit`:
    - add `':(exclude,glob)**/.angular/**'` and `':(exclude,glob)**/environment.local.ts'`;
    - extend the unstage `grep -E` with `\.angular/|environment\.local\.ts$`;
    - keep the existing excludes.
  - `chain.sh`:
    - `FORBIDDEN` regex: `'^(ralphloop/|\.github/|supabase/migrations/|supabase/functions/)'`;
    - the stop message starts: `PR #N changes the loop's own files or the schema contract (supabase/migrations/, supabase/functions/), which chain mode never auto-merges.`
    - update the header comment to match.
  - `doloop.sh` worker prompt, **rule 4**, replaced with exactly:
    ```
    4. NEVER call any mcp__claude_ai_Supabase__* tool, and never run
       supabase link, supabase db push or supabase functions deploy. This
       project's database is the local Supabase stack on ralph; production
       must never be touched. Use psql "\$DATABASE_URL" exactly as the step
       describes.
    ```
  - **Rule 8**, replaced with exactly:
    ```
    8. If this step touches UI (writes or modifies an Angular component's
       .ts, .html or .scss), follow 'docs/superpowers/style-task.md' before
       marking it done: read 'docs/superpowers/Design.md' first if you
       haven't this session, use the existing 'src/app/shared/ui/*'
       component or shared rt-* class for anything that has one (never a
       one-off button/input style), and run its self-check list before
       step 9 below. If you genuinely need a pattern Design.md doesn't have,
       add it to Design.md AND the matching shared/ui file in this same
       step — never improvise inline.
       NEVER create or edit anything under 'supabase/migrations/' or
       'supabase/functions/': they are a fixed contract copied from V1. If a
       step seems to need a schema or edge-function change, follow rule 6
       (BLOCKED) instead. SQL you write in seeds uses the existing schema's
       names as they are.
    ```
- [ ] **Step 4: Run all the tests.** `bash ralphloop/tests/run-on-ralph.sh` → `N+3 passed, 0 failed`.
- [ ] **Step 5: Commit.** `git commit -am "Loop: worker rules, chain guard and checkpoint excludes for Campsites"` (the new stub action is in a tracked file).

### Task 3: Angular review app and the Campsites dev seed

**Files:**
- Modify: `ralphloop/review.sh`, `ralphloop/seed-dev.sh`
- Create: `ralphloop/seed-dev.sql`
- Modify: `ralphloop/tests/test-review.sh`, `ralphloop/tests/test-seed.sh`

**Interfaces:**
- Consumes: the env file keys `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, `DATABASE_URL` (the same format as MyGear's).
- Produces the **local config convention**:
  - `review.sh` writes `src/environments/environment.local.ts` (gitignored, `600`), shaped like V1's `environment.ts`:
    ```ts
    export const environment = {
      production: false,
      supabaseUrl: 'http://<LAN host>:<API port>',
      supabaseAnonKey: '<anon key>',
    };
    ```
  - The scaffold task (written from spec 2) must make `angular.json`'s `development` configuration replace `src/environments/environment.ts` with that file (`fileReplacements`). The committed `environment.ts` holds no keys.

- [ ] **Step 1: Update the tests first.**
  - `test-review.sh`, `test_review_starts_app_for_the_lan`. Replace the `.env.local` assertions. `src/environments/environment.local.ts` must:
    - contain `supabaseUrl: 'http://10.9.8.7:54331'` and `supabaseAnonKey: 'anon123'`;
    - have mode `600`.

    The docker calls must contain:
    - `run -d --name campsites-dev --restart unless-stopped`;
    - `npx ng serve --host 0.0.0.0 --port 4200`.

    The output must contain:
    - `http://10.9.8.7:4200`;
    - `admin@campsites.test / campsites-admin`;
    - `sudo ufw allow from 10.9.8.0/24 to any port 4200 proto tcp`.
  - `test-seed.sh`:
    - delete `test_seed_passes_the_apps_default_units`;
    - rename `test_seed_without_app_json_passes_no_units` to `test_seed_without_app_seed_runs_only_the_dev_seed`, keeping only its `seed-app.sql` assertion;
    - check that the image in `test_seed_runs_psql_in_the_worker_image` reads `campsites-claude-worker:latest`.
- [ ] **Step 2: Confirm they fail.** `bash ralphloop/tests/run-on-ralph.sh review` → fails.
- [ ] **Step 3: Implement `review.sh`.**
  - `PORT=4200`.
  - Write the environment file above with `mkdir -p src/environments` and `umask 077`, in place of `.env.local`.
  - Start the dev server with `npx ng serve --host 0.0.0.0 --port "$PORT"`.
  - Dev login text: `admin@campsites.test / campsites-admin`.
  - Update the header comments to match (Angular dev server, port 4200).
- [ ] **Step 4: Implement `seed-dev.sh`.** Remove the `UNITS`/`app.json` lines. Keep the `seed-app.sql` and `seed-sample.sql` hooks; campground data becomes `seed-app.sql` in Phase 3. Update the header comment.
- [ ] **Step 5: Write `ralphloop/seed-dev.sql`.**
  - Keep MyGear's structure: psql variables `admin_email` (default `admin@campsites.test`) and `admin_password` (default `campsites-admin`), handed over via `set_config`, then one `do` block.
  - Create the `auth.users` and `auth.identities` rows only if the email is missing, with the same column list and empty-string token columns as MyGear's. `raw_user_meta_data` is `{"display_name":"Admin"}`.
  - The `on_auth_user_created` trigger (`0005`) creates the `public.users` row. Then:
    ```sql
    insert into public.users (id, display_name, role, suspended)
    values (v_id, 'Admin', 'admin', false)
    on conflict (id) do update set role = 'admin', suspended = false;
    ```
  - Keep MyGear's `raise notice` lines for created / already exists / is an admin.
  - The live check is Task 5.
- [ ] **Step 6: Run all the tests.** `bash ralphloop/tests/run-on-ralph.sh` → `N+2 passed, 0 failed` (Task 2 added three tests; this task removes one).
- [ ] **Step 7: Commit.** `git add ralphloop && git commit -m "Loop: Angular review app on 4200 and a dev seed for V1's schema"`

### Task 4: Worker image with Deno, and V1's Deno lock file

**Files:**
- Modify: `ralphloop/worker.Dockerfile`
- Create: `deno.lock` (from V1: `git -C ~/projects/PrimeNG show v1.0:deno.lock`)

**Interfaces:**
- Produces: the image `campsites-claude-worker:latest` on Ralph, with `node` 22, `npm`/`npx`, `git`, `psql`, `curl`, `claude` and `deno` 2.9.5, and `NG_CLI_ANALYTICS=false`.

- [ ] **Step 1: Edit the Dockerfile.**
  - After the `apt-get` block: `COPY --from=denoland/deno:bin-2.9.5 /deno /usr/local/bin/deno`.
  - Before `WORKDIR`: `ENV NG_CLI_ANALYTICS=false`. This stops `ng` from asking about analytics in an unattended run.
  - Header comment: build command `docker build -t campsites-claude-worker:latest - < ralphloop/worker.Dockerfile` (no build context needed).
- [ ] **Step 2: Copy `deno.lock`.** `git -C ~/projects/PrimeNG show v1.0:deno.lock > deno.lock`, then `deno test supabase/functions` on Lisa → `34 passed | 0 failed`.
- [ ] **Step 3: Build on Ralph.** `ssh ralph 'docker build -t campsites-claude-worker:latest -' < ralphloop/worker.Dockerfile` → succeeds. If the `bin-2.9.5` tag doesn't exist, use the newest `bin-2.9.x` tag, and record it in the Dockerfile and here.
- [ ] **Step 4: Check the toolchain.** `ssh ralph 'docker run --rm campsites-claude-worker:latest sh -c "node --version && deno --version && psql --version && claude --version"'` → prints all four. Node is `v22.x`; deno matches Step 3.
- [ ] **Step 5: Check an Angular build in the image.**
  ```bash
  ssh ralph 'docker run --rm --network host --user $(id -u):$(id -g) -e HOME=/tmp campsites-claude-worker:latest sh -c "cd /tmp && npx --yes @angular/cli@22 new smoke --defaults --ssr=false --skip-git --interactive=false && cd smoke && npx ng build"'
  ```
  Expected: `Application bundle generation complete`.
- [ ] **Step 6: Check the Deno tests in the image.**
  ```bash
  git archive HEAD supabase deno.lock | ssh ralph 'rm -rf ~/denotest-campsites && mkdir ~/denotest-campsites && tar -x -C ~/denotest-campsites && docker run --rm --network host --user $(id -u):$(id -g) -e HOME=/tmp -v ~/denotest-campsites:/w -w /w campsites-claude-worker:latest deno test supabase/functions; rm -rf ~/denotest-campsites'
  ```
  Expected: `34 passed | 0 failed`.
- [ ] **Step 7: Commit.** `git add ralphloop/worker.Dockerfile deno.lock && git commit -m "Loop: worker image gets Deno 2.9.5; V1's deno.lock"`
- [ ] **Step 8: Merge.** Push `phase-1-loop`, open a PR, Shawn reviews and squash-merges, then `git -C ~/projects/Campsites pull` on Ralph (as `claude`). Tasks 5–6 run from `main` on Ralph.

### Task 5: The local Supabase stack on Ralph (by hand)

This was Phase 3's first item in the roadmap. It moves here because the shakedown needs a database. It's done interactively over `ssh ralph` (as `claude`), never by the loop.

**Interfaces:**
- Produces: `/home/claude/.secrets/campsites-supabase.env` (`600`) with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` and `DATABASE_URL`, in the same format as MyGear's, pointing at `127.0.0.1:54321` / `54322`.

- [ ] **Step 1: Check the ports.** `ss -ltn | grep -E ':(5432[0-9]|4200)\b'` → no output. (Checked free on 2026-10-23.)
- [ ] **Step 2: Start the stack.** `cd ~/projects/Campsites && supabase start` → all 18 migrations apply, and the API is on `http://127.0.0.1:54321`. `docker ps` still shows `supabase_db_MyGear` up.
- [ ] **Step 3: Write the secrets file.** Map `supabase status -o env`'s `API_URL`, `ANON_KEY`, `JWT_SECRET` and `DB_URL` to `campsites-supabase.env`, written with `umask 077`. Check it with `sed -E 's/=.*/=<redacted>/'`: four keys.
- [ ] **Step 4: Seed twice.** `./ralphloop/seed-dev.sh` twice. The first run says `Created the dev admin account admin@campsites.test`; the second says `already exists`; both exit 0.
- [ ] **Step 5: Check the dev login works.**
  - `curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $SUPABASE_ANON_KEY" -H 'Content-Type: application/json' -d '{"email":"admin@campsites.test","password":"campsites-admin"}' | jq -r 'has("access_token")'` → `true`.
  - A query through the worker image's `psql` (`select role from public.users join auth.users using (id) where email = 'admin@campsites.test'`) → `admin`.
- [ ] **Step 6: Check the seed survives a reset.** `supabase db reset`, then `./ralphloop/seed-dev.sh` → `Created…` again, and Step 5's checks pass again.

### Task 6: Shakedown run

**Files:**
- Modify: `ralphloop/task.md` (the shakedown plan, then back to the placeholder)
- Modify: `docs/superpowers/specs/2026-10-20-v1.1-roadmap-design.md`, `CLAUDE.md`

- [ ] **Step 1: Write the shakedown `ralphloop/task.md`.** Commit and push it to `main`.

  `## Task 1: Local Supabase stack on Ralph (by hand)` has one step, already `- [x]`.

  `## Task 2: Shakedown: prove the Angular loop works` has these steps:
  - **Step 1: Record the toolchain.** Write `ralphloop/shakedown.md` with four lines:
    - `node: <node --version>`
    - `deno: <first line of deno --version>`
    - `angular-cli: <the "Angular CLI" line of npx --yes @angular/cli@22 version>`
    - `users in local db: <psql "$DATABASE_URL" -Atc "select count(*) from public.users">`

    Verify: four non-empty lines, and the user count is at least 1.
  - **Step 2: Build a throwaway Angular app outside the repo.** `cd /tmp && npx --yes @angular/cli@22 new shakedown-app --defaults --ssr=false --skip-git --interactive=false && cd shakedown-app && npx ng build`. Then append `angular build: ok` to `shakedown.md`. Verify: the build exits 0, and nothing under `/tmp` is added to the repo.
  - **Step 3: Run the Deno tests.** `deno test supabase/functions`, then append `deno test: <its summary line>`. Verify: `0 failed`.
  - **Step 4: Commit.** `git add ralphloop/shakedown.md && git commit -m "Shakedown: toolchain check"`
- [ ] **Step 2: Run the loop.** On Ralph as `claude`, in tmux, from `~/projects/Campsites`:
  ```bash
  git pull
  set -a; source ~/.secrets/campsites-ralph-loop.env; set +a
  ./ralphloop/doloop.sh
  ```
  Expected: four worker calls, each followed by a checkpoint commit and push, then `✅ PR: https://github.com/Farmer-Forge/Campsites/pull/…`.
- [ ] **Step 3: Review the PR.**
  - `ralphloop/shakedown.md` has all six lines (node 22, deno 2.9.x, Angular CLI 22, user count, build ok, `34 passed | 0 failed`).
  - `activity.md` has one entry per call and a `TASK 2 COMPLETE` line.
  - No `.angular/`, `node_modules/` or `environment.local.ts` in the diff.
- [ ] **Step 4: Close the PR without merging and delete its branch.** It proved the loop; its content doesn't belong on `main`.
- [ ] **Step 5: Put back the placeholder `ralphloop/task.md`** (Task 1, Step 4).
- [ ] **Step 6: Update the docs.**
  - Roadmap:
    - tick Phase 1;
    - mark Phase 3's stack item done in Phase 1;
    - note the `environment.local.ts` convention and rule 8's file names as inputs to spec 2.
  - CLAUDE.md: the local config convention and the dev login.
- [ ] **Step 7: Commit and push.** `git commit -am "Phase 1 done: Angular loop shakedown passed; task.md back to placeholder" && git push`

## Out of Scope

- MyGear's verification gate (deferred, in the roadmap).
- The real `task.md` (Phase 4), and the specs (Phase 2).
- Campground data in the seed (`seed-app.sql`) and fake users (`seed-sample.sql`): Phase 3.
- The schema comparison against the production backup: Phase 3 / spec 1.
- Running `review.sh` or `chain.sh` for real. There's no app on `main` yet; their unit tests cover them until the first real task merges.
- Any change to MyGear, including fixes to shared loop code found here (noted for MyGear instead).
- Extracting Forge's Angular scaffold.
- Updating the Supabase CLI on Ralph (2.117 is installed; 2.122 is available).
