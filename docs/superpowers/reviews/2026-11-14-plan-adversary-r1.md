# Plan adversary: ralphloop/task.md (Task 10), round 1, 2026-11-14

**Verdict:** 1 High, 4 Med, 3 Low. Architect can fix: 5. Decision for Shawn: 3.

## Findings

### F1. Step 2's `git diff --name-only origin/main -- src/ ralphloop/ supabase/` can never print only the component file
- **Severity:** High
- **For:** architect can fix
- **Where:** Task 10, Step 2; Review Focus 3
- **Failure:** By Step 2 the worker has ticked Step 1 in `ralphloop/task.md` and appended to `ralphloop/activity.md` (worker rules 9 and 11, plus the checkpoint commit), so the command always lists those two files as well as the component. The worker can't meet the `# expect:`, so it either goes round until the loop stops for no progress, writes BLOCKED, or talks itself past a check that has stopped meaning anything. Ratify runs "the task's own verification steps exactly as written", and its `activity.md` is an empty bind mount that also shows as changed, so it can REJECT on the same line. A second problem: `origin/main` is only as fresh as the canonical clone's last `git fetch origin`. `chain.sh` updates `main` from `FETCH_HEAD` (`git fetch "$PUSH_URL"`), never `refs/remotes/origin/main`, so if `origin/main` is stale the list also picks up older loop files (e.g. `ralphloop/scroll-check.mjs`).
- **Fix:** Diff against `main`, the branch `doloop.sh` forks the worktree from and the base ratify's own diff uses, and leave out the two loop-owned files: `git diff --name-only main -- src/ supabase/ ralphloop/ ':(exclude)ralphloop/task.md' ':(exclude)ralphloop/activity.md'`, and add `git status --porcelain -- src/ supabase/ ralphloop/` for untracked files (environment.local.ts is gitignored, so it won't appear). Update Review Focus 3 to match.
- **Evidence:** confirmed. I cloned the repo to the scratchpad and made a worktree off `plan/task-10-list-scroll` (main after D2). I applied Step 1, ticked it, appended to activity.md and committed a checkpoint, then ran the diff. Against that base it lists `ralphloop/activity.md`, `ralphloop/task.md` and the component. Against today's `origin/main` it also lists `ralphloop/scroll-check.mjs`.

### F2. List clicks do change what a user sees: D7, spec 3 change #12 and the Self-Review Notes say they don't
- **Severity:** Med
- **For:** decision for Shawn
- **Where:** Spec 3 change #12 ("Clicking a card in the list…"); decisions file D7; Task 10 Self-Review Notes ("List clicks"); Task 10 QC line 4
- **Failure:** The claim "an open card is taller than the list's view, so `nearest` already put its top at the top" only holds for cards with long descriptions. Finder at 1400px: clicking the 4th visible card ("Middle St. Croix", 312px tall open, in a 574px list view) leaves it where it is on main (the list scrolls 28px and the card sits 262px down). On Task 10's build the list jumps 288px and the card snaps to the top. Finder at 390px: tapping the first card under the map leaves `main` at 582 with the map still in view on main. On Task 10's build `main` scrolls to 864 and the map leaves the screen. So the QC line "Clicking a card in the list itself still just opens it, as before" fails. D7 is filed as "Default stands" but it changes behaviour users will notice. Favorites, with Pat's three cards, behaved the same before and after.
- **Fix:** Shawn picks one. (a) Accept the snap-to-top for list clicks too: then correct the spec #12 bullet, D7, the Self-Review note and the QC line so they say so. (b) Keep list clicks as they were: only selections from outside the component use `scrollCardToTop` (e.g. `toggleCard` records the id it just emitted and the effect skips that id), and list clicks keep `nearest`. That's more code and a spec change. Either way, D7 moves to "Must answer".
- **Evidence:** confirmed (my Playwright probe on Ralph against the `before` and `after` builds: `finder-listclick-1400`, `finder-listclick-390`, `favorites-pat-390/1400`).

### F3. Step 1's "prove it fails first" breaks a retried or resumed Step 1, and the ratifier's re-run
- **Severity:** Med
- **For:** architect can fix
- **Where:** Task 10, Step 1 (the red check and its BLOCKED rule)
- **Failure:** If the gate fails after Step 1 (the step is unticked and the next call retries it), or a call is interrupted after the edit (resume), the next worker finds the component already changed. Run literally, the red check then prints `SCROLL CHECK PASSED`, and Step 1 says to write `BLOCKED:`, which stops the loop on a correct change. The ratifier is told to run every verification step "exactly as written", so it also sees PASSED where Step 1 expects FAIL and may count that against the task.
- **Fix:** Make the red check conditional and say so: `if git diff --quiet main -- "$F"; then <build + scroll-check, expect FAIL>; else echo "component already changed (retry or resume): red check skipped"; fi`. Add one sentence saying the red check is evidence for the first attempt only and is not re-run in Step 2 or by ratify.
- **Evidence:** reasoning only (`doloop.sh` gate failure path: "A failed gate unticks the step and the worker retries it"; `ratify-prompt.md` step 1).

### F4. Running chain.sh now ships Task 10 to live users with no human reading it
- **Severity:** Med
- **For:** decision for Shawn
- **Where:** Decisions D1 and D2 (the run plan); Global Constraints; blast radius
- **Failure:** V1.1 has been live on Vercel since the 2026-11-12 cutover. Tongs STATUS records that hotfix #38 was "merged and is serving" from Vercel, which means a merge to `main` deploys to production. `chain.sh` squash-merges Task 10's PR unread, so the scroll change (and F2's behaviour change) reaches production users overnight with no QC on 4200 first. This is the first loop task since the cutover, and nothing in task.md or the decisions file says it.
- **Fix:** Shawn picks one. (a) Run `doloop.sh` only, QC on 4200, then merge by hand. (b) Use `chain.sh` and accept the auto-deploy. (c) Use `chain.sh` with Vercel's production auto-deploy for `main` paused during the run. Record the choice as a Must-answer decision.
- **Evidence:** reasoning only (Tongs `STATUS.md` Campsites section; `chain.sh` merge step). I didn't look at the Vercel project.

### F5. The stop rules are judged one frame too early: last cards in the list, and a busy page, land off and the check can't see it
- **Severity:** Med
- **For:** architect can fix
- **Where:** Task 10, Step 1 code block 4 (`scrollCardToTop`'s stop conditions); `scroll-check.mjs` (one marker at 75%); spec 3 change #12 ("can't move further")
- **Failure:** (1) For the last card in "Miles: All" (index 4687, Kulanaokuaiki in Hawaii, which is exactly "a campground far from you"), pass 1 is clamped at the scroller's max at that moment (440,140). Pass 2 finds no movement and stops. Then the cards at the end of the list are drawn and the max grows to 440,486, but nothing is left running. In my probe the card's top ended 553px down a 574px list (about 20px of it showing). Through scroll-check's own flow it ended 207px down (anonymous), 91px (admin) and 224px (390px). (2) With the map busy during the passes (my probe clicked "View details" while the map was still zoomed out, so `centreOn` zooms in at the same moment), pass 2 measured in place and stopped. Then the card moved 30–52px further down and stayed there, at 50%, 75%, 90% and 98%, and in two other runs, a re-selection 150ms after another and a same-card re-selection. scroll-check passes at 25%, 50%, 75% and 90% in its own flow, so it can't catch either of these.
- **Fix:** Stop only when two passes in a row agree: |offBy| < 1, or the scroll position equals the current max, on consecutive passes with the drawing in between. Keep `MAX_SCROLL_PASSES` as the cap. Add a fourth scroll-check case for the last marker (`ms[ms.length - 1]`) that passes only when `scrollTop` is within 1px of the max or the card is in place. Update spec #12's "can't move further" wording to match.
- **Evidence:** confirmed (on Ralph, against the `after` build: my `adv-probe2.mjs`, which logs every `scrollTop` write, gave `passes: 2` at the end of the list and `passes: 1` before the 41px misses; and a copy of scroll-check with the marker position as a parameter, `adv-sc.mjs`, at 0.25/0.5/0.9 PASS and 0.9999 FAIL ×3). Part (2) came from my probe's flow, not the real one, so how often users would hit it is unproven.

### F6. scroll-check can't fail for several things it describes, and a one-shot build with the grep strings pasted in passes everything
- **Severity:** Low
- **For:** architect can fix
- **Where:** `ralphloop/scroll-check.mjs` pass rule; Task 10 Step 2 `grep -c` lines; Review Focus 1–2
- **Failure:** `pickerOpen` is measured but never asserted, so the "Add to trip…" case passes even if the picker doesn't open (QC line 2). At 1400px only `document.scrollingElement` is checked, not `main.app-main`, so an implementation that moves `main` on desktop still passes. The ±2px tolerance accepts the one-shot `scrollIntoView`, which lands at −2 because it ignores the list's 2px top padding (D5 says "just inside the padding"). The greps check that the text is there, not that the passes ever run, so a build that keeps `scrollIntoView` and also contains the three strings passes Step 2.
- **Fix:** Assert `pickerOpen` for the admin case and `main.app-main.scrollTop === 0` at 1400px. Either narrow the tolerance to ±1 or say in D5 that ±2 is deliberate. Add F5's end-of-list case, which is the one case the one-shot can't pass. The greps can stay, as a backstop.
- **Evidence:** confirmed (the `half` build: 3 of 3 PASS at offBy −2, −2, 0; I read the pass rule in scroll-check.mjs).

### F7. Step 1 doesn't say what to do when the red check crashes instead of failing
- **Severity:** Low
- **For:** architect can fix
- **Where:** Task 10, Step 1 ("If it prints SCROLL CHECK PASSED, or exits 2…")
- **Failure:** If the stack has no seed (or an empty one), `waitForFunction(... > 2000 cards)` times out, the top-level await rejects, and node exits 1 with a stack trace and no FAIL lines. The plan's BLOCKED rule covers only PASSED and exit 2, so a worker can read exit 1 as "the expected failure" and carry on. Step 2's check then crashes the same way, and the loop stops for no progress instead of a clear BLOCKED line.
- **Fix:** Say it plainly: the red check must print exactly three `FAIL` lines and `SCROLL CHECK FAILED.`, and anything else (a stack trace, a timeout, fewer lines) is `BLOCKED:` with the output.
- **Evidence:** reasoning only (I read the code in scroll-check.mjs; no run with an empty seed).

### F8. "View details ▸" on the campground that's already selected does nothing
- **Severity:** Low
- **For:** decision for Shawn
- **Where:** Task 10 QC lines 1–2; Out of Scope; `finder.component.ts` `viewDetails` (the `selected` signal is set to the same object, so the effect never fires)
- **Failure:** Select a campground, scroll the list away, then click its marker's "View details ▸" again: the list doesn't move, before or after Task 10. The QC pass could hit this and report bug 5 as not fixed.
- **Fix:** Shawn picks one. (a) Out of scope for Task 10: add a line to Out of Scope and to the QC notes. (b) Fix it, which touches `finder.component.ts` (e.g. a selection counter, or `signal(..., { equal: () => false })`), so it's no longer a one-file task.
- **Evidence:** confirmed (my probe `same-selection-twice-1400` on both builds: the second click left the card 220,000px off).

## Sweeps

| Sweep | Result |
|---|---|
| 1 Security | clean: no tables, RLS, functions or grants; the code builds its selector from an id through `CSS.escape`; scroll-check only reads and signs in with the dev seed's logins |
| 2 Interfaces | clean: `selected`, `host`, `injector`, `[attr.data-id]` and `.rt-scroll-list` all exist in main's file as named; the anchors for code blocks 1, 2 and 4 and the single `afterNextRender(` are each unique |
| 3 Dark code | F2 (list-click behaviour stated wrongly), F3 (what a retried Step 1 does), F7 (crash path) |
| 4 Verification | F1 (an expect that can't pass), F5 (the end of the list and settling aren't tested), F6 (pickerOpen, main on desktop, the one-shot passes) |
| 5 Snippets | Applied Step 1's four blocks literally to `main`'s file with a script: byte-identical to `~/scratch/t10/app`'s version. `npx ng lint` in the worker image: "All files pass linting." scroll-check: `before` FAIL ×3 (4,497 / 7,492 / 12,925px), `after` PASS 3/3, `half` PASS 3/3. task.md matches `gen_task.py` output modulo ticks; 3 unchecked steps. esbuild on its own: not run (ng build covers it). `check-task-md.sh` (`~/Root-Forge/skills/ralph-architect/scripts/`): Task 10 has 3 open steps, 9 `# expect:` lines (the Self-Review Notes say 8), QC 1, commit step 1; "PARSE FAILED" comes only from the expected "no unchecked steps" lines for Tasks 2–9 |
| 6 Loop fit | F1, F3, F4. No browser-only step inside the loop; scroll-check serves on 127.0.0.1 with a random port, not 4200; D2 (merge by hand) correctly keeps `scroll-check.mjs` out of chain's forbidden-path check, and chain would refuse a Task 10 PR that edited it |
| 7 Defaults and retro | N/A: the `create-new-project.md` plan defaults are app-scaffold items already met by Tasks 1–9; there's no `retro-findings.md` |
| 8 Blast radius | F4 (production via Vercel). Shared component: Favorites probed, no change for Pat's cards. The local Campsites stack is only read (the gate resets and re-seeds it as usual). Ralph: about 1 minute of Chromium per scroll-check run |
| 9 Free pass | F8 |
