# Campsites Task 12 (map maximize / reduce switch): architect decisions (2026-11-21)

Spec: spec 3, **Change #13** (from Lisa's approved design `2026-11-21-campsites-map-maximize-design.md`, Shawn 2026-11-21). Plan: `ralphloop/task.md` Task 12. Check: `ralphloop/map-check.mjs`.

## Must answer before chain.sh

None. The plan was run against a real throwaway stack with the dev seed (task.md Self-Review Notes). Run Task 12 with `doloop.sh`, not `chain.sh`: `main` deploys to production.

## Default stands unless you object

D1: The big map on a phone. The design said "fill the space below the filters". On a 390px phone the header and the Finder's filters leave only 308px there, less than today's 45vh (380px), so the map would *shrink*. Draft: the big map takes the height of the scrolling area under the header, less the layout's padding (`calc(100cqh - 32px)`, 590px at 390px); you scroll past the filters to a map that fills the screen (task.md: Step 2's `styles.scss`; case 3). Other: keep the filters and map in view together with a smaller gain.

D2: To size the phone map, `.app-main` (the shell's scrolling area) becomes a CSS size container (`container-type: size`). Draft: that (task.md: Step 2's `app.scss`). `scroll-check.mjs` and `header-check.mjs` still pass with it. Other: `100dvh` minus a hard-coded header height, which breaks whenever the header wraps.

D3: The switch is an `<a role="button">` in a `.leaflet-bar`, exactly like Leaflet's zoom buttons, so Leaflet's own styles give it the look and no new colors are needed. Like the zoom buttons, Enter activates it and Space doesn't. Other: a real `<button>` with its own styles (new colors in `styles.scss`).

D4: Icon and words: `pi-window-maximize` / "Enlarge map" while the list shows, `pi-window-minimize` / "Show list" while the map is big (as `aria-label`, `title` and `aria-pressed`).

D5: Which actions bring the list back: only the popup's "View details ▸" and "Add to trip…". A marker click, a right-click "Search from here" (Finder), panning and zooming keep the map big.

D6: On Favorites and Trip detail, the popup's "View details ▸" also brings the list back. Those pages don't act on it otherwise (as today), so the list simply returns.

D7: The setting's storage: `sessionStorage` key `campsite-finder.map-maximized` (`'1'` / `'0'`), per browser tab, shared by the three pages; a private window without storage keeps it until reload.

D8: The spec and design-system edits come with this plan PR (spec 3 **Change #13**, `Design.md`'s map-layout row and Leaflet line). The bug list's item 8 is added by docs PR #53 (still open), so its status is updated after #53 merges, not here.

## Notes (not decisions)

- **The production build can fail on a network blip.** Angular inlines the Google Fonts CSS at build time, and one build in testing failed with "Inlining of fonts failed" while Google Fonts answered 200 a moment later; the retry passed. This has been true since the fonts link existed (not new in Task 12). In the loop it would fail the gate once and the step would be retried.
