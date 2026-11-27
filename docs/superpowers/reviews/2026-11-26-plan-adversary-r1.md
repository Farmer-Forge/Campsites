# Plan adversary: ralphloop/task.md (Task 13), round 1, 2026-11-26

**Verdict:** 0 High, 4 Med, 4 Low. Architect can fix: 7. Decision for Shawn: 1.

## Findings

### F1. Favorites' "Plan a trip" still puts a retired campground into a new trip
- **Severity:** Med
- **For:** architect can fix
- **Where:** Task 13, Step 3 (and Review Focus 1, spec 3 change #14, the favorites-trips spec's "Change: retired campgrounds")
- **Failure:** Pat clicks "Plan a trip" on Favorites, ticks the retired "Sample Bluff State Park" with the shared table's `plan-check` button (`campground-table.component.ts` line 34, shown whenever `planMode()`), names the trip and saves; `FavoritesComponent.saveTrip` → `TripsService.createTrip` inserts it as a stop. Design §6.2 says "Retired rows can't be added to a new trip", and Review Focus 1 claims the three ways it lists (+, popup, `addable`) are all of them, but this fourth one is left open and no case checks it.
- **Fix:** In Step 3, add `[disabled]="c.retired"` (and the same title) to `button.plan-check`, with a disabled style if `plan-check` needs one. Add a `state-check.mjs` case, or extend case 3, that clicks "Plan a trip" and requires the retired card's check to be disabled and a live card's check enabled. Update Review Focus 1 to "four ways in".
- **Evidence:** reasoning only (read `favorites.component.html/.ts`, `campground-table.component.ts`, `trips.service.ts` `createTrip` on `main` 7f0ac9c)

### F2. Trip detail's stop cards never show "No longer listed": the plan assumes they use the shared list, and they don't
- **Severity:** Med
- **For:** architect can fix
- **Where:** Task 13, Step 3 and Files; spec 3 change #14 ("Where the shared card list shows one (Favorites, Trip detail)"); favorites-trips spec "Change: retired campgrounds" ("A favorite or a trip stop … Its card shows 'No longer listed'")
- **Failure:** Trip detail draws its stops with its own markup (`trip-detail.component.html` lines 70–90, `.stop-card` with its own `.tags`). The favorites-trips spec says the same thing ("Stop cards (this page's own markup, not the shared list)"). Only `favorites.component.html` and `finder.component.html` use `app-campground-table`, so a retired stop in a trip looks live, against design §6.5 ("A retired card in Favorites, a trip or trip detail shows a 'No longer listed' tag"). No case can catch this, because Pat's seeded trip has no retired stop.
- **Fix:** Add a step that puts the same `@if (stop.campground.retired)` tag into `trip-detail.component.html`'s `.tags` (a 10th file: update Files, Step 5's list and Review Focus 5). Correct spec 3's "(Favorites, Trip detail)" wording. In the plan PR, give Pat's sample trip the retired campground as a third stop, and add a state-check assertion on `.stop-card`. If the architect would rather drop the stop tag, that changes approved design and becomes a decision for Shawn.
- **Evidence:** reasoning only (`grep -rl app-campground-table src/app` → favorites, finder, the component itself)

### F3. State campgrounds' website opens from a button labelled "Reserve on recreation.gov"
- **Severity:** Med
- **For:** decision for Shawn
- **Where:** Task 13 Out of Scope ("a 'Website' label for OSM links (they use the existing Reserve button)"); design §6.1 table, `reservation_url` row
- **Failure:** `osm-sync/transform.ts` puts OSM's `website` into `reservation_url`. The shared detail panel draws every non-empty `reservationUrl` as **"Reserve on recreation.gov"** (`campground-detail-panel.component.ts` line 16). So every state park with a website gets a button that names the wrong site and promises a booking it may not offer. The design approved "*the button still reads 'Reserve'*", but the code doesn't say "Reserve"; it says "Reserve on recreation.gov", so the approval rested on a wrong premise.
- **Fix:** Shawn chooses one: (a) keep it as planned and accept the label; (b) show "Website" when `agency === 'STATE'` (or when `source` is osm), a one-line change in the detail panel (a 10th or 11th file, plus a check assertion); (c) a neutral "Reserve" for every campground, which changes V1's look for federal rows too.
- **Evidence:** reasoning only (read `campground-detail-panel.component.ts` and `transform.ts` line 102 on `main`)

### F4. Case 2 never checks that the Finder saves `agenciesVersion`, so dropping that line passes while STATE keeps coming back on
- **Severity:** Med
- **For:** architect can fix
- **Where:** Task 13, Step 2 (the `agenciesVersion: AGENCIES_VERSION` save line); `state-check.mjs` case 2
- **Failure:** Case 2 writes both snapshots itself: it deletes the version for the "old" one and sets `agenciesVersion: 2` by hand for the "v2" one. A build that skips Step 2's third edit (never saving `agenciesVersion`) therefore passes all eight cases. In that build, a user who turns STATE off and reloads, or leaves the Finder and comes back, finds STATE on again every time, because every saved snapshot looks like an old one.
- **Fix:** In case 2, before editing, assert `snap.agenciesVersion === 2` and `snap.agencies` without STATE (the app's own save after case 1 clicked STATE off). Better: reload once with the app's own snapshot unchanged and require STATE to stay off with the live samples gone. Break-test it by removing the save line.
- **Evidence:** reasoning only (read `state-check.mjs` lines 229–245)

### F5. Task 13 doesn't forbid `chain.sh`, which would merge to `main`, and so deploy to production, with no QC
- **Severity:** Low
- **For:** architect can fix
- **Where:** task.md header ("`doloop.sh` (or `chain.sh`)"); Task 13 intro; decisions D1/D2
- **Failure:** The design (header and §8 step 4) says this half runs with `doloop.sh`, not `chain.sh`, because `main` deploys, and D2 says to merge "after QC". But the plan's only loop instruction still offers `chain.sh`, which auto-merges unread. The plan relies on the operator remembering D1; the plan itself never says it. That's the assumption this finding depends on.
- **Fix:** Add one line to Task 13's intro: "Run with `doloop.sh` only; Shawn QCs and merges (main deploys)."
- **Evidence:** reasoning only

### F6. `section.contact.credits` doubles the About page's bottom spacing
- **Severity:** Low
- **For:** architect can fix
- **Where:** Task 13, Step 4.2
- **Failure:** `.contact` has `padding: 48px 32px` (`about.component.scss` line 47), so the new section adds another 48px top and bottom: a 96px gap between the contact line and the credit, plus 48px under it. The step says `about.component.scss` doesn't change, so the worker can't tighten it, and no check measures it. Users will see the gap; whether it matters is a judgement.
- **Fix:** Either accept it in D7 as the look, or reuse `.contact`'s text styles only (for example `<section class="credits">` with one small rule in `about.component.scss`, which adds a file). Say which, so ratify doesn't flag it.
- **Evidence:** reasoning only

### F7. Nothing checks the disabled + look (`rt-icon-btn:disabled`, no hover)
- **Severity:** Low
- **For:** architect can fix
- **Where:** Task 13, Step 3.3; `state-check.mjs` case 3
- **Failure:** Case 3 checks only `button.disabled` and `title`. If Step 3.3 is skipped or applied to the wrong block (`styles.scss` has three other `&:hover {` lines, at 121, 187 and 215), every case still passes, and the color-count greps don't change. The retired + then looks fully active, and the hover tint still shows on it.
- **Fix:** In case 3, read `getComputedStyle` of the retired + (opacity ≈ 0.45, `cursor: default`) and of a live + (opacity 1).
- **Evidence:** reasoning only

### F8. The design's "Show all stays fast" QC item is missing
- **Severity:** Low
- **For:** architect can fix
- **Where:** Task 13 QC; design §6.5 ("QC must check that Miles All still appears in about a second") and §7
- **Failure:** The plan's QC list leaves out the only performance item the design asks for. With the dev seed's two live samples it can't be measured anyway; it only means something once production holds the synced OSM rows. So nobody checks it.
- **Fix:** Add a QC bullet saying it's checked after rollout step 3/5 on production data (or on the `osm-dry` stack), not on the review app. Or record in D2 that it's deferred to rollout.
- **Evidence:** reasoning only

## Sweeps

| Sweep | Result |
|---|---|
| 1 Security | Clean. No table, grant or function changes (the database is merged, `0025`/`0026`). The retired guard is UI-only: a signed-in user can still insert a retired id into their own `trip_stops` over REST. That's harmless (public reference data, own rows only), and design §6.2 asks only for the UI rule. No new HTML sinks: names stay `textContent`, the attribution and credit are static strings. |
| 2 Interfaces | Clean. `get_campgrounds_by_ids.retired` (0025 line 142/154) → `toCampground` `row.retired === true`; `nearest_campgrounds` has no `retired` column, so Finder rows get `false`. `toCampground` is the only place a `Campground` is built, so the required field breaks no other literal. `trip-detail.addable` and `buildPopup(c, …)` both receive `Campground`. The spec's "shared card list on Trip detail" claim is wrong (F2). |
| 3 Dark code | F1, F2, F3. Every anchor in Steps 1–4 is present exactly once on `main` 7f0ac9c (`styles.scss` has 3 `&:hover {` lines, but Step 3.3 scopes to `.rt-icon-btn`). |
| 4 Verification | F4, F7. Case 7's `waitForFunction(options > 0)` is satisfied at once by the placeholder option, but it can't pass vacuously: favorites arrive in one `set`, and an empty list fails "no live favorite". Case 1's "retired not in the Finder" is guaranteed by the database, not by the app (as documented). Self-Review break-testing is only `main`'s all-red run; no single-defence breaks are recorded for Task 13, unlike Tasks 10–12. |
| 5 Snippets | Applied Steps 1–4 literally to `git archive origin/main src` with a script: all anchors unique, and the result reads as intended (the `.rt-icon-btn` diff and the tags and title edits inspected). `deno check ralphloop/state-check.mjs`: parses, exit 0. ng build, lint and the check runs were not run (no Node on Lisa; no stack may be started). Ralph `~/scratch/osm-check` holds the identical `state-check.mjs` and `seed-osm.sql` (md5 match) and a `main` build (no "No longer listed" in its bundle), which fits the red run. There's no artefact of the claimed 8/8 green run to confirm. |
| 6 Loop fit | F5. One PR, no human-only step inside the loop, checks in the same task. The gate seeds from the canonical checkout's `seed-osm.sql` (`doloop.sh` `CANONICAL_ROOT`), so Ralph's checkout must be pulled after this plan PR merges, before D1's reset. That's implied (Task 13 exists only after the pull). Confirmed: Ralph's Campsites stack is at migration `0024` with 0 osm rows, so D1 is real. |
| 7 Defaults and retro | N/A. `create-new-project.md`'s plan defaults are about the database and scaffold (no schema work here); there is no `retro-findings.md` in the repo. |
| 8 Blast radius | `seed-osm.sql` is shared by every check script and the review app: the samples moved north keep `scroll-check`'s 4th card and `map-check`'s nearest-to-home marker unchanged (stated, not re-run here). `styles.scss` `.rt-icon-btn` is also the favorite heart, which is never disabled, so no change. Production: merging deploys (D2). Before `0025` reaches production, `retired` is absent → `false`, and `STATE` in `agency_filter` matches nothing: harmless. Ralph: GearForge `chain.sh` and UFOPager `doloop.sh` are running now, and throwaway stacks `osm-check`, `osm-dry`, `ufopager-mh` and `gf-sort-scratch` are still up. 20 GiB of RAM is free, so a third loop fits, but `osm-check` should be torn down when done. |
| 9 Free pass | F3 (wrong button label for OSM websites), F6, F8. As an attacker: nothing new beyond sweep 1. As the worker: Steps 1–4 apply cleanly. Step 1's "Anything else … BLOCKED" is strict but clear. |
