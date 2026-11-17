# Plan adversary: ralphloop/task.md (Task 11), round 1, 2026-11-16

**Verdict:** 0 High, 2 Med, 5 Low. Architect can fix: 4. Decision for Shawn: 3.

All runtime evidence below comes from Lisa, using a disposable worktree of `a1db1fb` and the **mock** Supabase on port 54999. None of it was run against Ralph's real stack or the dev seed, which was not allowed this round. Results that depend only on CSS (contrast ratios, header heights, token values) don't depend on the mock. Results that need a signed-in header (the Admin pill, titles behind guards) assume the real seed gives the same roles the mock does.

## Findings

### F1. The token change drops every cream-on-cherry button below 4.5:1 and makes cream-on-teal worse. The plan names only body links.
- **Severity:** Med
- **For:** decision for Shawn
- **Where:** Task 11, Step 1 (the `:root` values); Out of Scope (the body-link note); Review Focus 1
- **Failure:** cream on cherry goes from 4.83:1 to 4.17:1, which is now under AA. That covers all 15 `rt-btn--cherry` primary buttons (14–15px bold, which doesn't count as large text), the Finder's `.is-on` toggle, trip-stop markers and stop badges, and the About hero. Cream on teal (`rt-tag--teal`, postcard header, plan checks, admin stat, auth header) goes from 3.61:1 to 3.26:1. So the task makes the header pass 4.5:1 while making the app's primary buttons fail it. The ratifier is pointed at contrast and told that "any hole the checks don't catch is a rejection", so it could reject the task and stop the chain.
- **Fix:** Shawn chooses one of three. (a) Accept it: Out of Scope and QC list the button and tag ratios next to the body-link note, so the ratifier and Shawn both know. (b) Fix it in the app: cherry buttons use `--rt-cherry-dark` as the fill (cream 6.33:1) or ink text, which changes how the app looks. (c) Change the brand pack's cherry or cream, which also affects GearForge.
- **Evidence:** confirmed. I computed the old and new ratios for every token pair. On Task 11's build, the `/login` submit button `rt-btn--cherry` (15px/700) measured 4.17:1 in Chromium. That measurement is CSS only and doesn't depend on the mock.

### F2. The header now wraps to two rows below 1212px for the admin (1005px signed out), not 1049px / 775px as today. Case 7 only looks at 1280px.
- **Severity:** Med
- **For:** decision for Shawn
- **Where:** Task 11, Step 2 (`app.scss` spacing); `header-check.mjs` case 7; QC bullet 1 ("at a laptop width")
- **Failure:** between those widths the header grows from today's 76px to 140px, and the map loses 64px. That band covers 1024 and 1180 tablets in landscape, a 1366 laptop at 125% zoom (1093px), and split-screen windows. On `main` the header stayed on one row there. Case 7 measures only 1280px, which leaves 68px of headroom, so it can't see this regression. The QC wording ("a laptop width") invites a check at whatever width Shawn happens to use.
- **Fix:** Shawn chooses. (a) Accept it, since spec 2 change #6 only promises 1280px, and make the QC bullet say "at 1280px; narrower than about 1210px it wraps". (b) Tighten further, for example a smaller wordmark or a hidden section label between 900 and 1280px, and add a narrower width to case 7. (c) Pick a different target width.
- **Evidence:** confirmed on the mock. I binary-searched the viewport width on the `/` builds of `main` and Task 11. One-row thresholds: admin 1049 → 1212px; signed out 775 → 1005px. Admin header heights at 900/1024/1100/1200px are 140px. The admin pill is there because the mock makes admin@ an admin.

### F3. On phones narrower than 390px the header takes much more than D3 says.
- **Severity:** Low
- **For:** decision for Shawn
- **Where:** Task 11, Step 2 (44px pills under 640px); decisions file D3
- **Failure:** D3 quotes 222px at 390px. Signed in as the admin, the header is 253px at 360px (a common Android width) and 297px at 320px. On a short screen that's a third to a half of the height, before the Finder map starts.
- **Fix:** Shawn decides D3 with these numbers in front of him: keep 44px pills, or use 40px pills under 640px (or a tighter phone layout). The architect then adds the numbers to D3 and the QC bullet.
- **Evidence:** confirmed on the mock (admin `/trips` at 320/360/390px: 297/253/222px, no sideways scroll).

### F4. Step 4's "exactly eight files" diff can't see changes outside five folders.
- **Severity:** Low
- **For:** architect can fix
- **Where:** Task 11, Step 4 (the `git diff --name-only` line); Review Focus 4
- **Failure:** the pathspec `-- src/ public/ ralphloop/ supabase/ docs/` leaves out `angular.json` (budgets, font inlining), `package.json`/`package-lock.json`, `vercel.json`, `tsconfig*.json` and root docs. A worker that raises a budget or adds a dependency still sees exactly eight lines, so Review Focus 4 claims more than the check does. `git diff` also never lists untracked files. Checkpoint commits cover that in the loop, but not if a file is created in Step 4 itself.
- **Fix:** diff the whole tree: `git diff --name-only "$(git merge-base main HEAD)" -- . ':(exclude)ralphloop/task.md' ':(exclude)ralphloop/activity.md'`. Then add `git status --porcelain` and expect no output.
- **Evidence:** reasoning, plus I ran the command. It is pathspec-limited, and it didn't list my new untracked `brand-title.strategy.ts`.

### F5. The check can't fail for several parts the plan specifies.
- **Severity:** Low
- **For:** architect can fix
- **Where:** `header-check.mjs` cases 1, 4 and 6
- **Failure:** in each case below, a worker who drifts from the verbatim blocks still passes:
  - Case 1 checks 6 of the 12 route titles. Favorites, Trips, Account, Sign up, Forgot password and Reset password aren't checked; for example, `title: 'My Account'` passes.
  - Case 4 hovers only `.nav-link`, so a translucent `.nav-pill:hover` passes.
  - Case 6 doesn't read `--rt-paper`, `--rt-card`, `--rt-sand` or `--rt-mustard-dark`, which spec 2 change #6 says stay as they are.

  The ratifier's comparison against the verbatim blocks partly covers this.
- **Fix:** add the missing titles: visit `/signup`, `/forgot-password` and `/reset-password` signed out, and `/favorites`, `/trips` and `/account` as the admin. Hover `.nav-pill` as well, and add the four unchanged tokens to `TOKENS`. Alternatively, say in Review Focus that these rely on the verbatim blocks.
- **Evidence:** reasoning (from reading `header-check.mjs`).

### F6. `styles.scss` keeps two raw colors built from the old cherry and ink.
- **Severity:** Low
- **For:** architect can fix
- **Where:** Task 11, Step 1 ("Nothing else in `styles.scss` changes"); Review Focus 3; Design.md ("There are no other colors")
- **Failure:** line 170 `rgba(198, 58, 47, 0.08)` (the old `#c63a2f`, danger-outline hover) and line 238 `rgba(43, 37, 34, 0.55)` (the old `#2b2522`, input placeholder) keep the old palette. Goal 3 is "one palette", and Review Focus 3 claims raw colors are refused, but the grep only covers the three shell files. The visual difference is negligible.
- **Fix:** update both to the new values in Step 1, or derive them from tokens (`color-mix(in srgb, var(--rt-cherry) 8%, transparent)`), and extend the grep to `styles.scss`. Alternatively, list them in Out of Scope as known leftovers.
- **Evidence:** confirmed (I grepped `src/` for the old values after applying Steps 1–3).

### F7. A temporary network or stack error stops the whole chain at Step 1, and Step 4 has no instruction for one.
- **Severity:** Low
- **For:** architect can fix
- **Where:** Task 11, Step 1 ("Anything else … BLOCKED") and Step 4
- **Failure:**
  - `header-check.mjs` exits 2 when Google Fonts doesn't load (`Yellowtail never loaded`) or a page times out. Step 1 turns that into BLOCKED, which stops `chain.sh` until a person looks.
  - Step 4 doesn't say what to do on exit 2, so the worker improvises.
  - Smaller: if `git merge-base main HEAD` fails, the guard falls into "app already changed: red check skipped" without saying anything.
- **Fix:** on exit 2, rerun the check once, and write BLOCKED only if it fails again, in both steps. Make the guard fail loudly when the merge base is empty, for example `base=$(git merge-base main HEAD) || { echo "no main"; exit 1; }`.
- **Evidence:** reasoning (from `look()` in `header-check.mjs` and Step 1's text).

## Sweeps

| Sweep | Result |
|---|---|
| 1 Security | Clean. No tables, policies, functions or guards change. Every route in Step 3's `app.routes.ts` keeps its `canActivate`. Titles are static strings (no trip name, so no injection path). |
| 2 Interfaces | Clean. `supabase.session()`, `userService.profile()`, `RouterLink`/`RouterLinkActive` are already used by `main`'s `app.html`. `BrandTitleStrategy`/`SITE_TITLE` are produced and consumed in the same task. Lint and build pass. |
| 3 Dark code | F7. Step 1's styles.scss anchor and Step 3's three `app.config.ts` edits are unique, and a script applying them literally from the plan text gave the intended diff. |
| 4 Verification | F2, F4, F5. The red check is real: `main`'s build gives exactly the expected output (FAIL 1–6, PASS 7, "6 of 7", exit 1). |
| 5 Snippets | On the mock: every Task 11 code block extracted from `task.md` and applied by script; `ng lint` all pass; `ng build -c production,local` OK (only the existing initial-budget warning; Archivo `400 800` inlined). `header-check.mjs`: `main` → FAIL 1–6/PASS 7, exit 1; Task 11 → 7 of 7, exit 0. Step 4 greps both exit 1; badge sha256 matches. `console-check.mjs` passed (15 page loads). **Not run:** anything against Ralph's real stack and dev seed (Ralph busy, per instructions). `app-check.sh` was not run as a whole (it rewrites env.local), but each of its parts was. |
| 6 Loop fit | F1 (ratifier may reject on the button contrast it isn't told about), F7. One PR; the badge and check ship in the plan PR; no human-only step inside the task; the check lands with the rules it enforces. |
| 7 Defaults and retro | No `retro-findings.md`. The `create-new-project.md` plan defaults (CRUD, admin, ids, grants, seed) don't apply to a branding-only task. The QC list is present. The `src/config/app.json` name rule is for Forge-core React apps; Campsites isn't on the core. |
| 8 Blast radius | The `--rt-*` values are global, so every page changes (F1). The brand pack is shared with GearForge (F1 option c). Design.md and style-task.md rule changes bind future tasks consistently. No DB, auth, ports or shared machine: the check serves on its own port, not 4200. |
| 9 Free pass | F3, F6. |
