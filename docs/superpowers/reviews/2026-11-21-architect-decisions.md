# Campsites Task 12 (map maximize / reduce switch): architect decisions (2026-11-21)

Spec: spec 3, **Change #13** (from Lisa's approved design `2026-11-21-campsites-map-maximize-design.md`, Shawn 2026-11-21). Plan: `ralphloop/task.md` Task 12. Check: `ralphloop/map-check.mjs`.

## Must answer before chain.sh

None. The plan was run against a real throwaway stack with the dev seed (task.md Self-Review Notes). Run Task 12 with `doloop.sh`, not `chain.sh`: `main` deploys to production.

## Default stands unless you object

D1: The big map on a phone. The design said "fill the space below the filters". On a 390px phone the header and the Finder's filters leave only 308px there, less than today's 45vh (380px), so the map would *shrink*. Draft: the big map takes the height of the scrolling area under the header, less the layout's padding (`calc(100cqh - 32px)`, 590px at 390px), **and a maximize scrolls it into view** (adversary F2: without that, the tap seemed to do nothing). It then fills the screen: swipes pan the map, as in a map app, and "Show list" at its top-right brings everything back (task.md: Step 2; case 3). Other: keep the filters and map in view together with a smaller gain, or leave some room above the map to drag the page.

D2: To size the phone map, `.app-main` (the shell's scrolling area) becomes a CSS size container, only under 900px and only while a map is maximized (`.app-main:has(.rt-map-layout--max)`, after the code review). Draft: that (task.md: Step 2's `app.scss`). `scroll-check.mjs` and `header-check.mjs` still pass, and the Finder's dropdowns open in the same place. Other: `100dvh` minus a hard-coded header height, which breaks whenever the header wraps.

D3: The switch is an `<a role="button">` in a `.leaflet-bar`, exactly like Leaflet's zoom buttons, so Leaflet's own styles give it the look and no new colors are needed. Click, Enter and Space flip it (Space added after the code review). Other: a real `<button>` with its own styles (new colors in `styles.scss`).

D4: Icon and words: one accessible name, "Enlarge map", with `aria-pressed` saying whether it's on (a toggle keeps its name; code review). The icon is `pi-window-maximize` and the tooltip "Enlarge map" while the list shows; `pi-window-minimize` and "Show list" while the map is big.

D5: Which actions bring the list back: only the Finder's popup "View details ▸" and "Add to trip…", in the Finder's own handler (moved there from the shared map after the code review). A marker click, a right-click "Search from here", panning and zooming keep the map big.

D6: On Favorites and Trip detail, the popup's buttons do nothing, as today, and the big map stays big. (The first draft brought the list back there with nothing opened; the code review flagged it.) Making those buttons open the card is a separate change.

D7: The setting's storage: `sessionStorage` key `campsite-finder.map-maximized` (`'1'` / `'0'`), per browser tab, shared by the three pages; a private window without storage keeps it until reload.

D8: The spec and design-system edits come with this plan PR (spec 3 **Change #13**, `Design.md`'s map-layout row and Leaflet line). The bug list's item 8 (added by docs PR #53, merged 2026-11-22) is updated here to point at change #13 and Task 12.

D9: Maximizing hides each page's top row too (adversary F1), because the title and actions live in the list column: the Finder's count, "Change location" and "Use my device location"; Favorites' heading and "Plan a trip"; a trip's name, "‹ All trips", Rename and Delete. The design said "the page title stays". Draft: accept it (the switch is for browsing, and "Show list" is one click); spec 3 change #13 says so. Other: move each page's top row out of `rt-side` on all three pages (three more templates and styles, and a check case).

## Notes (not decisions)

- **The production build can fail on a network blip.** Angular inlines the Google Fonts CSS at build time, and one build in testing failed with "Inlining of fonts failed" while Google Fonts answered 200 a moment later; the retry passed. This has been true since the fonts link existed (not new in Task 12). In the loop it would fail the gate once and the step would be retried.
