# Plan adversary: ralphloop/task.md (Task 12, map maximize / reduce switch), round 1, 2026-11-22

**Verdict:** 0 High, 4 Med, 1 Low. Architect can fix: 3. Decision for Shawn: 2.

Reviewed: `plan/task-12-map-maximize` at 3658820 (Task 12; header blurb; Review Focus 1–5; Out of Scope; Task 12 Self-Review Notes; `ralphloop/map-check.mjs`; spec 3 change #13; `Design.md` edits; the architect decisions file), against the approved design `~/plans/2026-11-21-campsites-map-maximize-design.md`. The architect has since rebased the branch to 236c9d5, which changes only the bug-list status line.

How it was tested: in a separate worktree of 3658820, I built `main` on Lisa against the seeded `t12` stack. Map-check on that build gave FAIL 1–5 and PASS 6, then "MAP CHECK FAILED: 5 of 6." and exit 1, which matches Step 1's `# expect`. I then applied Steps 1–3 by script from the plan's own text; every anchor was unique and applied cleanly. On that build, `ng lint` was clean, the build showed only the budget warning, `map-check` passed 6 of 6, `scroll-check` 5 of 5, `header-check` 7 of 7 and `console-check` 15 loads, the colour greps were 0 / 1 / 3, and the file list was the expected nine modified files plus the new service. I also ran my own Playwright probes and one break build (details are in each finding).

## Findings

### F1. Maximizing hides every page's title and controls, but the design and spec say the page title stays
- **Severity:** Med
- **For:** decision for Shawn
- **Where:** Task 12, Step 2 (`.rt-map-layout--max .rt-side { display: none }`); spec 3 change #13, 2nd bullet; design "Maximized"
- **Failure:** On all three pages the title is inside `rt-side`, so it disappears with the list. That covers the Finder's "N campgrounds · nearest first" and its "Change location" / "Use my device location" buttons, the Favorites `h1` and "Plan a trip", and Trip detail's trip name, "‹ All trips", Rename and Delete. A probe at 1280px confirmed it: `.rt-list-title`, `.back-link` and `.plan-button` all have zero height while maximized. The spec text the worker builds from ("The header, the page title and the Finder's filter bar stay") is false for the code the plan prescribes, and no check notices.
- **Fix:** Shawn: (a) accept that the title and the page's controls hide with the list, and the architect corrects the spec and design wording; or (b) keep the title row (and the Trip detail back link) visible above the map, which moves markup out of `rt-side` on all three pages and adds files and a check case.
- **Evidence:** confirmed (Playwright probe on the Task 12 build: Finder, Favorites as Pat, Trip detail as Pat, at 1280px)

### F2. On a phone (D1), "Enlarge map" seems to do nothing, and the big map traps scrolling
- **Severity:** Med
- **For:** decision for Shawn
- **Where:** Task 12, Step 2 (`height: calc(100cqh - 32px)` under 900px); decisions file D1
- **Failure:** At 390px the switch sits at the map's top edge, about 570px down the screen. Tapping it grows the map downward, below the fold, so the visible screen doesn't change apart from the icon (screenshots before and after are identical above y≈844). Once the user scrolls down, the 590px map fills 590 of `.app-main`'s 622px. Leaflet sets `touch-action: none`, so a swipe pans the map rather than the page. A CDP touch swipe moved the map center by 0.58° while `.app-main.scrollTop` stayed at 334. The only ways back to the filters are the two 16px strips or "Show list". D1 asks Shawn to object or accept, but it describes only the height gain, not these two effects.
- **Fix:** Shawn: (a) accept D1 as drafted; (b) take D1's "Other" (filters and map in view together, smaller gain); or (c) D1 plus scrolling the map to the top of `.app-main` on maximize under 900px, with the map a little shorter than the scroll area so some drag room remains (this adds behaviour and a check assertion).
- **Evidence:** confirmed (Playwright at 390×844 with `hasTouch`: geometry, a CDP touch swipe, screenshots `phone-before.png` / `phone-max.png` / `phone-max-bottom.png` in `scratchpad/adversary-t12/shots/`)

### F3. Case 3 can't catch a missing size container or a clipped phone layout
- **Severity:** Med
- **For:** architect can fix
- **Where:** Task 12, Step 2.3 (`.app-main { container-type: size }`); `map-check.mjs` case 3; Review Focus 3
- **Failure:** Without the container, `100cqh` falls back to the small viewport. The phone map is then 812px tall inside a 622px scroll area, taller than the screen, and case 3 still passes because it only asks for +100px. The `sideways` test reads `document.documentElement.scrollWidth`, which can never exceed the viewport because `app-root` and `.app-main` hide overflow. So a 700px-wide maximized layout at 390px, clipped by 310px, also passes. One break build with Step 2.3 removed, a `min-width: 700px` on `.rt-map-layout--max` under 900px, and Trip detail's binding removed (see F5) gave 6 of 6 PASS, exit 0.
- **Fix:** In case 3, also require `max.frameH <= .app-main.clientHeight - 30` (the map fits the scroll area), and replace `sideways` with `.app-main.scrollWidth > .app-main.clientWidth` or with the layout's right edge ≤ the viewport. Re-run the break test on the fixed check.
- **Evidence:** confirmed (break build, then map-check: 6 of 6 PASS; a measure probe showed main 622px, frame 812px tall, layout 700px wide, `document.scrollWidth` 390)

### F4. One font-inlining blip in Step 1 ends in BLOCKED, and network flakes become FAILs that no rerun rule covers
- **Severity:** Med
- **For:** architect can fix
- **Where:** Task 12, Step 1 red-check block and the paragraph after it; Step 4's build and `map-check` lines; decisions file "Notes"
- **Failure:** In Step 1 a failed `ng build` doesn't stop the block. On a fresh worktree there is no `dist/`, so `serveSpa` throws at top level, outside the check's try block. Node then exits 1 with a stack trace and no FAIL lines, which is "anything else" → BLOCKED, and the loop stops. The decisions file says this blip would only fail the gate once, but the red check isn't the gate. The blip is not rare: in this review two builds in a row failed with "Inlining of fonts failed". Separately, during a flaky moment case 6 failed on `net::ERR_CONNECTION_CLOSED` (exit 1, not 2), so the "rerun once on exit 2" rule doesn't apply and the worker is pushed to "fix" a console error.
- **Fix:** In Steps 1 and 4, retry `ng build` up to twice when its output has "Inlining of fonts failed", and run the check only after a successful build, e.g. `npx ng build … || npx ng build … || { echo "build failed twice"; …; }`. Also say that a case-6-only failure made up entirely of `net::ERR_*` resource errors is rerun once before it counts.
- **Evidence:** confirmed (two consecutive font-inlining failures on Lisa; a case-6 `ERR_CONNECTION_CLOSED` failure in the same window); `serve-spa.mjs` throws on a missing `index.html` (read) and map-check line 215 calls it outside the try block (read)

### F5. Check coverage gaps: Trip detail's maximize, case 4 on a phone, and the icon
- **Severity:** Low
- **For:** architect can fix
- **Where:** `map-check.mjs` cases 1, 4 and 5; Task 12, Step 3
- **Failure:** Trip detail is only checked for the switch being present and reduced. With its `[class.rt-map-layout--max]` binding left out, the switch there flips its label but the list never hides, and every case passes (the same break build as F3). Case 4 runs only at 1280px; I ran it by hand at 390px and it works (the card top 0.3px from `.app-main`'s top), but nothing keeps it that way. The `pi-window-maximize` / `pi-window-minimize` icon isn't asserted, so a missing or wrong icon (an empty button) passes. This is Low because the plan gives the exact text and Step 4's file list forces the files to change, so a worker following it literally gets it right.
- **Fix:** Case 5: also open `/trips/<id>` in the same tab and require `maximizedState`. Case 4: add one "View details" run at 390px. Cases 1 and 2: assert the icon class for each state.
- **Evidence:** confirmed (break build passed 6 of 6 without the Trip detail binding; the 390px "View details" probe passed)

## Sweeps

| Sweep | Result |
|---|---|
| 1 Security | N/A: no table, RLS, RPC or function change. The only new state is a `'1'`/`'0'` flag in `sessionStorage`, and its key doesn't collide with `campsite-finder.finder`. |
| 2 Interfaces | Clean. `MapSizeService` (`maximized`, `toggle`, `reduce`) matches what Steps 2–3 consume. The Finder's `viewDetails`/`addToTrip` exist; Favorites and Trip detail don't bind them (D6, as today). |
| 3 Dark code | F1 (the spec says the title stays; the code hides it). Otherwise every anchor (styles.scss ×3, app.scss, the three `<div class="rt-map-layout">`, the inject lines and imports) was applied by script from the plan text: unique and unambiguous. |
| 4 Verification | F3, F5. Case 2 (width and view), case 4 (popup → list and card) and case 5 (reload, Favorites, new tab, which tells sessionStorage from localStorage and from memory only) are sound. Red check matches `# expect` on `main`. |
| 5 Snippets | TS and SCSS built from the plan's text: `ng lint` clean and the production build OK. The Step 1 and Step 4 bash blocks ran and gave their `# expect` output (greps 0/1/3; file list correct once the service is committed by the checkpoint). No SQL or Auth snippets. |
| 6 Loop fit | F4. One PR, no human-only step, the check is in the same task, no real infrastructure touched. `map-check.mjs` edits would show in Step 4's whole-tree file list, and the ratifier reruns Step 4. Run with `doloop.sh` (decisions file), so the PR is read before merge. |
| 7 Defaults and retro | Partial: `create-new-project.md` and `retro-findings.md` weren't among the inputs given for this Task-12-only review. The plan follows Global Constraints (no raw colours, `rt-*` classes, Design.md updated in the same PR, no `*.spec.ts`, port rules untouched). |
| 8 Blast radius | Clean. `.app-main` becomes a size container on every page. Probes: no layout containment (a `position: fixed` child stays at viewport top 0); the PrimeNG multiselect overlay opens on top at 390px and 1280px; scroll-check 5/5, header-check 7/7 and console-check 15 loads pass. The stack was used read-only through the app; nothing on Ralph changed. |
| 9 Free pass | F1, F2. Also confirmed fine: the list's scroll position survives maximize/reduce (20000 → 20000); Enter toggles the switch and Space doesn't (D3, already disclosed); no console errors in the probes. |
