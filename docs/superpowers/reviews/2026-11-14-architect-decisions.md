# Campsites V1.1, Task 10: architect decisions (2026-11-14)

Task 10 fixes bug 5 (a card selected from the map lands short, showing its bottom). Spec 3 change #12; `ralphloop/task.md` Task 10; check script `ralphloop/scroll-check.mjs`. Revised after plan-adversary round 1 (`2026-11-14-plan-adversary-r1.md`).

## Must answer before the run

- [x] D1 (**answered: Task 10 only**, Shawn, 2026-11-14): **Scope of this run is Task 10 only.** Bugs 1–4 are already built (Tasks 5–6, merged). Bug 6 part B (`0022`) is live and in spec 1 and `CLAUDE.md`; bug 6 part A (fill in missing states from location) is a hand-written migration, not loop work (the loop never writes migrations), so it's listed under Out of Scope.
- [ ] D2: **Merge this PR by hand and pull it on Ralph before the run.** It adds `ralphloop/scroll-check.mjs` and changes `task.md`, and chain mode never merges loop files. Then on Ralph, in `~/projects/Campsites`: `git pull`, and `./ralphloop/seed-dev.sh` if the stack was reset. Options: merge then run | run from this branch. Draft assumes merge then run (task.md: Task 10's "Check script" note). If wrong: the worker can't find `scroll-check.mjs` and Step 1 ends in `BLOCKED:`.
- [ ] D9 (adversary F4): **Run Task 10 with `doloop.sh`, not `chain.sh`.** V1.1 deploys from `main` to Vercel production, and `chain.sh` merges each task's PR itself, so Task 10 would reach live users before anyone looks at it. This is the first loop task since the cutover. With `doloop.sh` the task ends in a PR: you QC it on the review app (:4200, the production build), then merge, and Vercel deploys. Options: `doloop.sh` (PR, you merge) | `chain.sh` (auto-merge, auto-deploy). Draft assumes `doloop.sh`. If wrong: an unreviewed change goes live, which is what the branch rule (2026-11-14) is there to stop.

## Default stands unless you object

D3: **Keep your pick, scroll-then-correct.** In Chromium one instant `scrollIntoView({ block: 'start' })` lands map selections exactly; the correction passes are insurance for browsers with weaker scroll anchoring and for the end of the list, where they wait for the last cards to be drawn. Step 2's `grep` lines require them (task.md: Review Focus 1). Other: a one-shot scroll for map selections (about 10 lines instead of 60).

D4: **The jump is instant, not smooth.** Spec 3 change #12. A smooth animation picks its target up front, then cards resize under it, and that's half of bug 5. Other: smooth scroll plus a final correction (it would visibly bounce).

D5: **Where the card lands:** just inside the top padding of whatever scrolls the list (the list, 2px; on a phone the Finder's `main` area), with no extra margin. `scroll-check.mjs` allows ±2px. Near the end of the list: the list scrolled to its end with the card fully in view. Other: a small gap above the card.

D6: **`scroll-check.mjs` runs only in Task 10's steps,** not in the gate (`app-check.sh`). Other: add it to the gate so every later task re-checks the scroll (about a minute more per gate run; it depends on the seed's 4,900 campgrounds).

D7 (revised after F2): **A click on a card in the list itself keeps today's scroll** (smooth `nearest`, only as far as needed). The list remembers the card it just clicked (`clickedId`) and uses `revealCard` for its echoed selection; only selections from outside (the map popup) land the card's top. Without this, a click on a card already in view jumped it 288px to the top, and on a phone the map scrolled away. `scroll-check.mjs` case 5 checks it. Other: list clicks land the top too.

D8: **At most 10 correction passes** (`MAX_SCROLL_PASSES`), stopping after two calm passes in a row. On the seed the checks settle in fewer. Other: any small number.

D10 (adversary F8): **"View details ▸" on the campground that's already selected does nothing**, as on `main` today (the selection doesn't change, so nothing reacts). Task 10 leaves it alone. Other: make a repeat selection scroll again (a change to the Finder and Favorites pages, outside this task).
