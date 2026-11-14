# Bugs for the next loop

Found while QC'ing the loop's build. Each one gets folded into its spec's "Changes from V1" section (with Shawn's approval) and then into `task.md` before the loop runs.

## 1. Map zooms out and loses the campground you picked (Shawn, 2026-10-31)

**What happens:** zoom in close, click a campground marker: fine, its bubble opens. Click anything in the bubble ("View details ▸", "Add to trip…") and the map zooms out a little and the campground is lost. It's worst when the campground sits right next to another one.

**Why (diagnosis, not yet tested):** the map always jumps to a fixed zoom of 12, even when you're zoomed in closer than that:
- the marker click: `map.setView(marker.getLatLng(), 12)` ([campground-map.component.ts:123](../src/app/shared/ui/campground-map/campground-map.component.ts#L123));
- selecting a campground (which "View details" and "Add to trip…" both do): `setView([lat, lng], 12)` ([campground-map.component.ts:66](../src/app/shared/ui/campground-map/campground-map.component.ts#L66)).

At zoom 12 the marker cluster group merges nearby markers again, so a campground next to another one disappears into a cluster and its bubble closes. V1 does the same (`setView(..., 12)` in V1's `campground-map.component`), so this is a change from V1, not a rebuild mistake.

**Fix to spec:** centering on a campground never zooms out: it uses zoom 12 or the current zoom, whichever is closer in, and the campground's marker stays visible and out of a cluster (for example `cluster.zoomToShowLayer`). Applies to the Finder, Favorites and Trip maps, since they share this component.

**Spec:** 3 (Finder, `2026-10-25-finder-design.md`), "Changes from V1".

**Approved (Shawn, 2026-11-08).** Folded into spec 3 as change #10, and into `task.md` and its template (Task 5, the shared map). The code changes when the loop next runs.

## 2. Reset filters button on the Finder (Shawn, 2026-10-31)

**What's missing:** there's no way to undo all the filter changes at once. You have to put back every agency chip, the Where picker, the Park picker and the miles control one by one.

**This is new, not a fix.** V1 has no reset either. It was deferred on 2026-11-05 until Shawn was happy with the loop's build. **Added (Shawn, 2026-11-08):** folded into spec 3 as change #11, and into `task.md` and its template (Task 6). The code changes when the loop next runs.

**Fix to spec (approved, Shawn, 2026-11-05):** a "Reset filters" button in the filter bar. It puts every filter back to its starting value in one go and reruns the search once:
- AGENCY: all five chips on;
- Where: all regions and states selected;
- Park: all parks selected;
- MILES FROM ME: All, with the remembered radius back to 50.

It keeps the current search location: resetting doesn't ask for your location again or move you back to it. It's disabled, not hidden, when the filters are already at their starting values. It sits at the end of the filter row. The saved Finder state (`sessionStorage`) is updated just as for any other filter change.

**Spec:** 3 (Finder, `2026-10-25-finder-design.md`), "Filter bar" and "Changes from V1".

## 3. No place to enter my location (Shawn, 2026-11-09)

**What happens:** while QC'ing the Tasks 5–9 rerun, Shawn found no place to enter a location on the Finder, by more than one route. One of them:

- **The error state** (screenshot, 2026-11-09): the page shows "Locating you took too long. Enter your coordinates below to search manually." and a "Use my device location" button. **Nothing is below it.** The latitude/longitude panel is missing.

The code check that followed also found that the map's right-click doesn't work (item 2 below).

**Why (checked in code):**

1. **The error state hides the manual panel.** Spec 3's Error state says it shows "the manual-location panel, without the map tip", and V1 always shows it there. In the rebuild, the error state and the side panel share one `#manualPanel` template, and the worker put `@if (manualOpen())` *inside* that template. In the side panel, "Change location" sets `manualOpen`. The error state has no such link, so the panel never appears and there's no way to type coordinates ([finder.component.html](../src/app/features/finder/finder.component.html), `#manualPanel`). V1 keeps the `@if (showLocationForm())` on the side panel's use only.
   - Smaller: the error state's "Use my device location" is `rt-btn rt-btn--sm rt-btn--cherry`. V1 uses `rt-text-btn rt-text-btn--teal retry`.
2. **The map pick is wrong.** Spec 3 and V1: right-click opens a popup with the coordinates (4 decimal places) and a **Search from here** button, and only that button searches. The rebuild has no right-click. A plain left-click anywhere on the map searches from that spot straight away ([campground-map.component.ts:90](../src/app/shared/ui/campground-map/campground-map.component.ts#L90)). Any stray click throws away the search location, which is what V1's comment warns against.

**Why `task.md` let it through:** Task 6 Step 3 lists the side panel's pieces in detail but sums up the error state as "`div.status-area` for the first load and the error state". Task 5's map step never describes the right-click popup. The only mention is Task 6's QC line. Spec 3 is right on both; the gaps are in `task.md`.

**Fix to `task.md` and its template (spec 3 needs no change):**
- **Task 6 Step 3, error state:** `div.status-area` holds the error message, the blocked help when blocked, a `rt-text-btn rt-text-btn--teal retry` "Use my device location" button, and the manual panel **always shown** (no map tip). Only the side panel's copy is toggled by "Change location"; keep that `@if` outside the shared template.
- **Task 5, shared map:** with `allowLocationPick`, listen for `contextmenu`, not `click`. Open a popup with the coordinates to 4 decimal places and a "Search from here" button. Emit `locationPick` only when that button is clicked, and close the popup.
- **Task 6 QC:** add "Error state (time out or deny location): the lat/lng panel shows and searches."

**Why you hit the error state at all (not an app bug):** the review app is served over plain `http://192.168.1.188:4200`, which isn't a secure origin, so Chrome won't give it your location (the crossed-out location icon in the address bar). V1 on Vercel is HTTPS. To test device location in QC, open it through an ssh tunnel (`ssh -L 4200:localhost:4200 ralph`, then `http://localhost:4200`) or add the address under `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.

**Spec:** 3 (Finder), "Error state" and "Map". `task.md` Tasks 5 and 6.

**Approved (Shawn, 2026-11-09).** Folded into spec 3 (Error state: the panel is always shown; Map: a plain left-click doesn't search) and into `task.md` and its template (Task 5 Step 7's location pick and Step 8's grep check; Task 6 Step 3's error state; Task 6's QC lines, including the ssh-tunnel note for device location).

## 4. "View details ▸" on the map does nothing (Shawn, 2026-11-09)

**What happens:** on the Finder, clicking a marker zooms in properly now (bug 1's fix works). But clicking "View details ▸" in its bubble gets no visible reaction.

**Why (checked in code and in the installed package, not yet in the browser):** the list never scrolls to the campground.
- The click works. The popup emits `viewDetails`, the Finder sets `selected`, and the list's effect opens that card (`openId`) and then calls `viewport.scrollToIndex(index, 'smooth')` ([campground-table.component.ts:265](../src/app/shared/ui/campground-table/campground-table.component.ts#L265)).
- The list uses the CDK's **autosize** strategy (`@angular/cdk-experimental` 22.2.4), and autosize doesn't support `scrollToIndex`. In a dev build (the review app on :4200), it **throws** ("cdk-virtual-scroll: scrollToIndex is currently not supported for the autosize scroll strategy"). In a production build it silently does nothing.
- So the card opens off-screen and nothing moves. "Add to trip…" in the bubble goes through the same path and has the same problem. So does every page that uses the shared list (Finder, Favorites).
- **To confirm in the browser:** after clicking "View details ▸", F12 → Console should show that error, and scrolling the list down by hand should show the card already open.

**Whose mistake:** the spec's (Claude's), not the loop's. Spec 3 change #2 asks for autosize **and** `scrollToIndex`, which can't work together. `task.md` Task 5 Step 6 copied both, and the worker did exactly that.

**Fix options:**
- **A (recommended): drop the CDK virtual scroll and use CSS `content-visibility: auto`.** The list renders every card with a plain `@for`. Each card gets `content-visibility: auto; contain-intrinsic-size: auto <collapsed height>`, so the browser skips laying out and painting the off-screen cards. A selection from outside uses `element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })`, which is V1's behavior and what spec 3's card-list section already says (line 174). Variable heights just work. It drops `@angular/cdk-experimental`. Cost: "Show all" creates all ~4,700 cards in the DOM once (V1 did that too). The drawing stays cheap.
- **B: keep autosize, scroll in two steps.** `scrollToOffset(index × average card height)` brings the card into the drawn range, then after the next render find the card and `scrollIntoView`. It keeps virtual scrolling, but autosize's estimates make it jumpy and hard for the loop to get right.
- **C: fixed-size virtual scroll (`itemSize`).** `scrollToIndex` works, but an open card is taller than the fixed size, so it breaks the variable heights that spec 3 needs.

**Fix to spec:** spec 3 change #2 (and the Tech Stack line and Task 5 Step 6 in `task.md` and its template), per the option Shawn picks.

**Picked: option A (Shawn, 2026-11-09).** Shawn's worry: losing the virtual scroll. What changes for the user: nothing visible, except that "View details ▸" and "Add to trip…" start working. What's given up is under the hood: "Show all" creates every card (~4,700) instead of the ~20 on screen. That makes the first "Show all" slower to appear and uses more memory, as in V1. QC check after the next run: Miles **All** should appear in about a second, and scrolling should stay smooth. If it doesn't, fall back to B.

**Spec:** 3 (Finder), "Changes from V1" #2, and "Campground card list". `task.md` Task 5 Step 6. 

**Folded in (Shawn, 2026-11-09):** spec 3 change #2 rewritten (with a "Revised" note), the roadmap spec and CLAUDE.md wording, and `task.md` and its template (Tech Stack, Task 2's install line, Task 5 Steps 6 and 8, and Task 6's QC lines).

## 5. Picking a campground still misbehaves when the list is long (Shawn, 2026-11-14)

**What happens:** clicking a campground still has a problem with the list when the list is long. This is the same area as bug 4, and its fix (option A) hasn't cured it. Short lists seem fine.

**Symptom (Shawn, 2026-11-14):** on the **live site**, **Finder**, clicking **"View details ▸" in a map bubble**. The list does move, but not far enough. And when it stops, what's in view is the **bottom** of the opened card (Reserve / Directions), not its **top** (the name, the heart and the **+** add-to-trip button), which is where it should land.

**Likely cause (diagnosis from the code, not yet tested in the browser):** bug 4's fix gives every card `content-visibility: auto; contain-intrinsic-size: auto 80px` and scrolls with `scrollIntoView({ behavior: 'smooth', block: 'nearest' })` in `afterNextRender` ([campground-table.component.ts:135](../src/app/shared/ui/campground-table/campground-table.component.ts#L135), [:267-281](../src/app/shared/ui/campground-table/campground-table.component.ts#L267-L281)).
- Cards that have never been drawn count as the 80px placeholder, not their real height. The smooth scroll works out its target from those guesses. As it passes, the cards get drawn at their real height and the target moves, so it stops in the wrong place.
- The error adds up with every undrawn card above the target, which explains "only when the list is long."
- The open card is taller still (the detail panel), which adds to the miss.
- **Why it shows the bottom of the card: `block: 'nearest'`.** For a card below the visible area, `nearest` scrolls just far enough to bring the card's **bottom** edge into view. An open card with its detail panel is about as tall as the list pane, so its top (name, heart, **+**) ends up above the visible area. This part happens even with no height error. The spec should say the card's **top** lands at the top of the list: `block: 'start'`.

**Fix options (two parts):**
- **Part 1, required in every option: land on the card's top.** Use `scrollIntoView({ block: 'start' })` instead of `'nearest'`, so the card's name, heart and **+** sit at the top of the list pane.
- **Part 2, pick one for the distance:**
  - **A (recommended): scroll, then correct.** Jump with `behavior: 'auto'` (instant), wait a frame or two for the cards around it to draw, then `scrollIntoView` again. Repeat until the card's top stops moving (cap it at a few tries). Small change, keeps `content-visibility`.
  - **B: a closer placeholder height.** Measure the real collapsed card height and set `contain-intrinsic-size` to it. That cuts the error but doesn't remove it (names wrap, so heights vary). Best used together with A.
  - **C: drop `content-visibility` from the list.** Every card is laid out for real, so the scroll position is exact. The cost is "Show all" layout time on ~4,700 cards; check it before choosing.

**Spec:** 3 (Finder), "Campground card list" and change #2. `task.md` Task 5 Step 6 and its QC line. Add a QC check: with Miles **All**, click "View details ▸" in the bubble of a campground far down the list. Its card opens with its **top** (name, heart, **+**) at the top of the list pane. Repeat from "Add to trip…".

## 6. Where filter lets in campgrounds from other states (Shawn, 2026-11-14)

**What happens:** on production, with Where set to just the Midwest (12 states), the list says 897 campgrounds, and the map shows clusters in California, Arizona, the Northeast and the Southeast. Adding or removing states does change the count, so the filter is doing something.

**The map isn't the problem.** The map and the list both draw from the same `results()` ([finder.component.html:153-199](../src/app/features/finder/finder.component.html#L153-L199)), and the map's clusters add up to the list's count. The search results themselves include campgrounds from outside the selected states.

**Why (confirmed against the 2026-11-14 nightly backup):**
- `nearest_campgrounds` (latest version in [0021_skip_zero_locations.sql:41](../supabase/migrations/0021_skip_zero_locations.sql#L41)) filters with `c.state is null or c.state = any(state_filter)`. [0014](../supabase/migrations/0014_nearest_campgrounds_null_state.sql) added the `is null` on purpose, so that campgrounds with no state recorded don't disappear. So **every campground with no state passes every Where filter.**
- **422 of the 4,688 searchable campgrounds have no state** (457 of 4,900 in the table, counting the 0,0 rows the search skips). By agency: USFS 243, NPS 163, BLM 43, USACE 8. By source: ridb 294, nps 163. About 265 of them are in the West.
- The numbers match exactly: 475 Midwest campgrounds + 422 with no state = **897**, the count in the screenshot.
- Where the nulls come from: `ridb-sync` and `nps-sync` take the state from the source's address record (the Physical address first, otherwise the first one listed). When the source has no address, or an empty state code, the state is null ([ridb-sync/transform.ts:44-49](../supabase/functions/ridb-sync/transform.ts#L44-L49), [nps-sync/transform.ts:40-43](../supabase/functions/nps-sync/transform.ts#L40-L43)). Nothing ever fills it in later.

**Fix options:**
- **A (recommended): derive the state from the campground's location.** Load US state boundaries (Census cartographic boundary file, simplified) into a table once. Backfill `state` for rows where it's null with a PostGIS point-in-polygon. Both syncs use the same lookup as a fallback when the source gives no state. Then only rows truly outside every state (offshore, territories) stay null. It's an additive migration plus a sync change, which ForgeDB's additive-only rule allows.
- **B: stop letting null states through.** Drop `c.state is null or` from the filter. One-line migration, but with any Where filter on, those 422 campgrounds can never be found by region.
- **C: B now, A later.** Ship the one-liner first so the filter is honest, then backfill.

**Also worth checking under A:** the source's address can be a mailing or headquarters address in a different state from the campground. A spot check comparing source state to location state would show whether to trust location over the source everywhere, not just as a fallback.

**Spec:** 3 (Finder), "Filter bar" (Where); the `nearest_campgrounds` migrations (0014 / 0021); both sync functions. This is a data and DB fix, not only a loop `task.md` change. QC check: Where = Midwest only, the map shows no campgrounds outside the Midwest, and the count equals the Midwest-only count.

**Picked: option C (Shawn, 2026-11-14): B now, A later.**
- **Now (hotfix, like #38/#39):** a new migration `0022` that re-creates `nearest_campgrounds` exactly as in 0021, minus `c.state is null or`, plus a pgTAP test. Only this function has the rule. With Where on **All states**, the app sends no state filter, so all 4,688 campgrounds still show. The 422 with no state drop out only when some states are picked.
- **Later:** option A (state from location, backfill, sync fallback) goes through the normal spec → `task.md` route. Until then, the 422 can't be found with a region filter on.
