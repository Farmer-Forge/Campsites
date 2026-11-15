# Campsites V1.1, Task 10: architect decisions (2026-11-14)

Task 10 fixes bug 5 (a card selected from the map lands short, showing its bottom). Spec 3 change #12; `ralphloop/task.md` Task 10; check script `ralphloop/scroll-check.mjs`.

## Must answer before chain.sh

- [ ] D1: **Scope of this run is Task 10 only.** Bugs 1–4 are already built (Tasks 5–6, merged). Bug 6 part B (`0022`) is live and in spec 1 and `CLAUDE.md`; bug 6 part A (fill in missing states from location) is a hand-written migration, not loop work (the loop never writes migrations), so it's listed under Out of Scope. Options: Task 10 only | add more before tonight. Draft assumes Task 10 only (task.md: Task 10; Out of Scope). If wrong: whatever else you expected isn't in the run.
- [ ] D2: **Merge this PR by hand and pull it on Ralph before the run.** It adds `ralphloop/scroll-check.mjs` and changes `task.md`, and chain mode never merges loop files. Then on Ralph, in `~/projects/Campsites`: `git pull`, and `./ralphloop/seed-dev.sh` if the stack was reset. Options: merge then run | run from this branch. Draft assumes merge then run (task.md: Task 10's "Check script" note). If wrong: the worker can't find `scroll-check.mjs` and Step 1 ends in `BLOCKED:`.

## Default stands unless you object

D3: **Keep your pick, scroll-then-correct, although a one-liner also works in Chrome.** In Chromium, one instant `scrollIntoView({ block: 'start' })` lands exactly (it passed the same check). The correction passes stay as cheap insurance for browsers with weaker scroll anchoring, and three `grep -c` checks require them (task.md: Review Focus 1; Task 10 Step 2). Other: the one-liner, about 1 line instead of 50.

D4: **The jump is instant, not smooth.** Spec 3 change #12. A smooth animation picks its target up front, then cards resize under it, and that's half of bug 5. Other: smooth scroll plus a final correction (it would visibly bounce).

D5: **Where the card lands:** just inside the top padding of whatever scrolls the list (the list, 2px; on a phone the Finder's `main` area), with no extra margin. Spec 3 change #12; `scroll-check.mjs` allows ±2px. Other: a small gap above the card.

D6: **`scroll-check.mjs` runs only in Task 10's steps,** not in the gate (`app-check.sh`). Other: add it to the gate so every later task re-checks the scroll (about 30 seconds more per gate run; it depends on the seed's 4,900 campgrounds).

D7: **List clicks use the same path.** A card clicked in the list also lands with its top at the top. Measured: it already did with `nearest`, because an open card is taller than the list's view, so nothing a user sees changes (task.md: Self-Review Notes). Other: keep `nearest` for list clicks (more code, no visible difference).

D8: **At most 10 correction passes** (`MAX_SCROLL_PASSES`). On the seed, the check lands in fewer. Other: any small number.
