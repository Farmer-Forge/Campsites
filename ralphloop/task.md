# Campsites task plan: shakedown

A throwaway plan that proves the Angular loop works end to end on ralph:
worker container, Angular CLI, Deno, the local database, checkpoints, PR.
Its PR is closed without merging. The real plan is written in Phase 4.

## Task 1: Local Supabase stack on Ralph (by hand)

- [x] **Step 1: Started by hand** (`supabase start` in ~/projects/Campsites on ralph; `~/.secrets/campsites-supabase.env` written; dev admin seeded).

## Task 2: Shakedown: prove the Angular loop works

- [ ] **Step 1: Record the toolchain in `ralphloop/shakedown.md`**

  Create `ralphloop/shakedown.md` with exactly these four lines, each filled in from the command shown:

  ```
  node: <output of node --version>
  deno: <first line of deno --version>
  angular-cli: <the line starting "Angular CLI" from npx --yes @angular/cli@22 version>
  users in local db: <output of psql "$DATABASE_URL" -Atc "select count(*) from public.users">
  ```

  Verify: the file has four non-empty lines, and the user count is at least 1.

- [ ] **Step 2: Build a throwaway Angular app outside the repo**

  ```bash
  cd /tmp && npx --yes @angular/cli@22 new shakedown-app --defaults --ssr=false --skip-git --interactive=false
  cd /tmp/shakedown-app && npx ng build
  ```

  Then append the line `angular build: ok` to `ralphloop/shakedown.md`.

  Verify: `npx ng build` exited 0, and nothing from `/tmp` was added to this repo (`git status --short` lists only `ralphloop/` files).

- [ ] **Step 3: Run the edge functions' Deno tests**

  ```bash
  deno test supabase/functions
  ```

  Append `deno test: <its final summary line>` to `ralphloop/shakedown.md`.

  Verify: the summary says `0 failed`.

- [ ] **Step 4: Commit**

  ```bash
  git add ralphloop/shakedown.md
  git commit -m "Shakedown: toolchain check"
  ```
