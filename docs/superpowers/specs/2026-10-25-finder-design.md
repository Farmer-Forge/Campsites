# Finder — Design

Status: **approved by Shawn 2026-10-25**, including its proposed changes from V1. Spec 3 of the roadmap (`2026-10-20-v1.1-roadmap-design.md`).

Last updated: 2026-10-25

## What this is

The home page (`/`), as V1 has it. You see campgrounds near a location, on a map and in a card list, and filter them by agency, region, state, park and distance. It's written from V1's code at `v1.0`:
- `features/finder/`;
- `core/services/campgrounds.service.ts`, `geolocation.service.ts`, `finder-state.service.ts`, `favorites.service.ts`;
- `shared/`.

It also defines **four pieces Favorites and Trips reuse:**
- the campground card list;
- the campground map;
- the favorite heart;
- the add-to-trip panel.

Those pieces are specified once, here.

**Styles:** each component's own SCSS, and the inline `styles` of the shared pieces, are carried over **verbatim from V1**, the same as the global stylesheets in spec 2. The session that writes `task.md` copies them in. This spec gives behavior and layout, not pixel values.

## Data it uses (spec 1)

- **`nearest_campgrounds`,** through `CampgroundsService.getNearest(coords, limit, agencies, maxDistanceMeters, states?, parks?)`:
  - It **pages** with `.range()` in 1,000-row pages until a page comes back short. PostgREST caps any one response at 1,000 rows.
  - Rows map to `Campground`: `id, parkCode, name, description, lat, lng, agency, state, amenities (default {}), fees ([]), reservationUrl, directionsUrl, images ([]), contact, distanceMeters`.
- **`getParkCodes()`:** the distinct, sorted, non-null `campgrounds.park_code` values. Only NPS rows have one.
- **`getParkNames()`:** `parks` as `{ park_code: name }`. It's cosmetic: on failure, the park codes are used as labels.
- **Favorites:** the signed-in user's `favorites` rows (`campground_id, note`).
- **Trips:** the user's trips and stops (through `TripsService`, in the trips spec).

## Page layout

From top to bottom:
1. **The filter bar,** shown unless the page is in its error state.
2. **The body:** the map-and-list layout (`rt-map-layout`: map frame on the left, side column on the right; under 900px the map stacks above the list), **or** the status area while loading or after an error.

### Filter bar

Changing any filter reruns the search from the current search location. Nothing happens if there's no location yet.

- **AGENCY:** five toggle chips, `NPS USFS BLM USACE FWS`, all on to start. A chip toggles its agency, and the selection stays in this fixed order. Turning all of them off is allowed; it simply matches nothing. Each chip has `aria-pressed`.
- **Region** (PrimeNG multiselect):
  - The regions are Northeast, Midwest, South and West, with fixed state lists (below). All are selected to start.
  - Its label is "All regions" when all are selected, "{n} regions" past two, and "No regions" when empty.
  - **Changing regions replaces the state selection** with exactly the states in the chosen regions.
  - The header "select all" box selects all or none.
- **State** (multiselect, with a filter box):
  - The 51 codes (50 states + DC), in region order. All are selected to start.
  - Labels: "All states", "{n} states" past three, "No states".
- **Park** (multiselect, with a filter box), shown only once park codes have loaded:
  - Options are park names (truncated to 30 characters with "…"), sorted by name; the value is the park code. All are selected to start.
  - Labels: "All parks", "{n} parks", "No parks".
- **MILES FROM ME:** a segmented control, `All · 25 · 50 · 100 · 250`. "All" turns near-me off; a number turns it on with that radius. The default is All, with the radius remembered as 50. Each segment has `aria-pressed`.

Regions and their states:

| Region | States |
|---|---|
| Northeast | CT ME MA NH RI VT NJ NY PA |
| Midwest | IL IN IA KS MI MN MO NE ND OH SD WI |
| South | AL AR DE FL GA KY LA MD MS NC OK SC TN TX VA WV DC |
| West | AK AZ CA CO HI ID MT NV NM OR UT WA WY |

### How a search runs

`loadNearest(coords?)`:
1. Set loading. Clear the page error and the inline device-location error. If no coordinates were passed, clear "location blocked".
2. **The location** is the coordinates given, or the browser's: `navigator.geolocation.getCurrentPosition` with a 10-second timeout.
3. **If the browser lookup fails,** check the permission state (Permissions API; `'unsupported'` where it's missing or throws). Then:
   - "blocked" means the state is `'denied'`;
   - **if a search location already exists,** show the message inline under the location controls and keep the current results;
   - **otherwise** show the full error state.
4. **Query:** `getNearest(location, 50, selectedAgencies, maxDistance, states, parks)`:
   - `maxDistance` is `radiusMiles × 1609.34` when near-me is on. Otherwise it's **20,038,000 m** ("Show all": half the Earth's circumference, which takes the RPC's no-limit branch, so every matching row comes back).
   - `states` is **omitted** (null) when every state is selected, so rows with an unknown `state` still appear. Otherwise it's the selected list.
   - `parks` is omitted when every park is selected. **A partial park selection hides every non-NPS row,** because their `park_code` is null.
5. **On success:** set the results, set the search location, and **save the snapshot** (below).
6. **On a query failure:** show the error state with the error's message, or "Unable to load nearby campgrounds."

**While loading, the map and list are replaced** by "Finding campgrounds near you...". That happens on every filter change too.

### Location messages (exact text)

| Case | Message |
|---|---|
| Denied (code 1) | "Location access was denied. Enter your coordinates below to search manually." |
| Unavailable (2) | "Your location could not be determined. Enter your coordinates below to search manually." |
| Timeout (3) | "Locating you took too long. Enter your coordinates below to search manually." |
| No geolocation API | "Geolocation is not supported by this browser" |
| Blocked help (permission `'denied'`) | "Location is blocked for this site. Click the icon left of the address bar → Site settings → Location → Allow, then press Use my device location again." |

### Side column (results)

- **Header:** "{n} campground(s)" (`rt-list-title`), then "nearest first".
- **Location controls** (teal text buttons):
  - **"Change location" / "Cancel"** toggles the manual-location panel.
  - **"Use my device location"** runs a fresh browser lookup.
- **Inline device-location error:** the message, plus the blocked help when blocked.
- **The manual-location panel** (`rt-dashed-panel`), when open:
  - two number inputs, "Latitude (e.g. 44.31)" and "Longitude (e.g. -68.21)", both required, with `step="any"`;
  - a **"Search this location"** button (cherry), which closes the panel and searches there;
  - help text: "Don't know your coordinates? Search "[your city] coordinates" or right-click your location in Google Maps and copy the two numbers shown.", with Google Maps linking to `https://maps.google.com` in a new tab;
  - except in the error state: "**Tip:** right-click any spot on the map and choose **Search from here**."
- **The card list** (below), with distances shown and no notes.

### Error state

Shown instead of the filter bar and body:
- the error message (`rt-message--error`);
- the blocked help, when blocked;
- a "Use my device location" button;
- the manual-location panel, without the map tip.

### Map (Finder use)

The shared map (below), given the results, the selected campground, the search location, and `allowLocationPick = true`.

- **Right-clicking the map** opens a popup with the clicked coordinates (4 decimal places) and a **"Search from here"** button. Clicking it closes the popup, closes the manual panel, and searches from that point.
- **A popup's "View details ▸"** selects that campground. The list expands its card and scrolls it into view.

## Saved state (survives navigation and refresh)

`FinderStateService` (root) keeps the **last successful search**:

```ts
{ location: { lat, lng }, agencies: string[], states: string[], regions: string[], parks: string[] | null, nearMeEnabled: boolean, radiusMiles: number }
```

- **Where it lives:**
  - in memory;
  - mirrored to `sessionStorage['campsite-finder.finder']`, so it lasts per tab and is cleared when the tab closes.
- **Writes:** only after a successful load.
  - `parks: null` means all parks.
  - Storage errors are swallowed, leaving the state in memory only.
- **Reads:** memory first, then storage. A stored value is used only if:
  - it parses;
  - `lat` and `lng` are finite numbers with `|lat| ≤ 90` and `|lng| ≤ 180`;
  - every list holds strings, `parks` is null or a string list, `nearMeEnabled` is a boolean and `radiusMiles` is a number.

  Anything else counts as no saved state.
- **On page open:**
  - **No saved state:** run the search (from the device location) and load the park codes, in parallel.
  - **Saved state:**
    1. Restore the filters. Keep only values still offered, in canonical order. Restore `radiusMiles` only if it's one of 25/50/100/250.
    2. Load the park codes, restoring the saved park selection by intersecting it with the codes. `null` means all.
    3. Then search from the saved location, **without asking the browser for the location.**

## Shared pieces

### Campground card list (`app-campground-table`)

Used by Finder (distances on, no notes), Favorites (notes on, plan mode) and Trips (see those specs). It renders **every** campground passed in, in the order given, in a scrolling list (`rt-scroll-list`). There's no paging.

- **Inputs:**
  - `campgrounds` (required);
  - `selected`;
  - `showDistance` (default true);
  - `showNotes` (default false);
  - `notes: Map<id, string | null>`;
  - `planMode` (default false);
  - `planSelected: Set<id>`.
- **Outputs:** `selectedChange(campground | null)`, `noteChange({ campgroundId, note })`, `planToggle(id)`.
- **A card,** left to right:
  - **In plan mode:** a checkbox button ("Include in trip", `aria-pressed`) that emits `planToggle` without expanding the card.
  - **With distances on:** a mustard badge. It shows miles to one decimal under 100, rounded at 100 and above, over "MI".
  - **The name, with tags under it:** the agency (teal tag), and the park code (outline tag) when there is one.
  - **The favorite heart** (below).
  - **When signed in:** a round **+** button ("Add to trip", `aria-expanded`). It toggles that card's add-to-trip panel. Only one panel is open at a time.
- **Clicking a card** expands it, collapsing any other card, and emits `selectedChange(campground)`. Clicking it again collapses it and emits `null`.
- **When `selected` changes from outside** (the map popup), that card expands and scrolls into view smoothly (`block: 'nearest'`).
- **The expanded detail:**
  - the description, rendered as HTML (`innerHTML`; NPS descriptions contain markup), indented past the badge when distances are on;
  - **"Reserve on recreation.gov"** (cherry button, new tab), only when `reservationUrl` isn't empty;
  - **"Directions"** (new tab): `directionsUrl` when set, else `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`.
- **Notes** (when `showNotes` is on): an "Add a note" text input per card. It's seeded from `notes` without ever overwriting a draft in progress, and it emits `noteChange` on blur.

### Campground map (`app-campground-map`)

Used by Finder and Trip detail.

**Map setup:**
- OpenStreetMap tiles, attribution "&copy; OpenStreetMap contributors".
- It starts at the middle of the continental US, `(39.8283, -98.5795)`, at zoom 6.
- **Marker images:** Leaflet's default marker icons are pointed at the site root (`imagePath = ''`, with `marker-icon.png`, `marker-icon-2x.png` and `marker-shadow.png` served from the Leaflet assets rule).
- **Re-measuring:** a `ResizeObserver` calls `invalidateSize()` whenever the frame changes size.

**Inputs:**
- `campgrounds` (required);
- `selectedId`;
- `ordered` (Trip detail);
- `searchLocation`;
- `allowLocationPick` (default false).

**Outputs:** `viewDetails(id)`, `locationPick(coords)`.

**Markers:**
- One marker per campground, in a **marker cluster** with default options.
- **Clicking a marker** zooms to it at zoom 12.
- **In ordered mode:**
  - markers are numbered (`.trip-stop-marker`, 28px);
  - a polyline joins them when there are two or more;
  - the map fits them with 32px padding.

**The marker popup** (plain DOM, not an Angular component):
- the campground's name;
- **"View details ▸"**, which closes the popup and emits `viewDetails`;
- when signed in **and** the trips list is already loaded with at least one trip, **"Add to Trip"**. It adds the campground to the **most recent trip** (`trips[0]`) in one click, then shows "Added ✓"; on failure the button comes back.

**Selection and the search location:**
- **A newly selected campground** recentres the map on it at zoom 12.
- **The search location** shows as a 16px `.current-location-marker` behind the other markers, with the tooltip "Your search location", and recentres the map there at zoom 9.

### Favorite heart (`app-favorite-toggle`)

Shown only when signed in. A round cherry heart: filled when favorited; title "Remove favorite" or "Favorite"; `aria-pressed`. Clicking it toggles the favorite and doesn't expand the card.

`FavoritesService` (root) holds `favoriteIds: Set` and `favoriteNotes: Map`:
- **`loadFavoriteIds()`** reads the user's rows. If the user is signed out, it clears both.
- **`toggleFavorite(id)`:**
  - **removing** deletes the row and drops the id and the note locally;
  - **adding** inserts the row and seeds a null note locally.
- **`updateNote(id, note)`** updates the row with `.select()`. If no row came back, it throws "No matching favorite to update".
- **Each heart, when it appears, loads the favorites if the local set is empty.**

### Add-to-trip panel (`app-add-to-trip`)

An inline dashed cream panel under a card.
- **When it opens,** it loads the user's trips and which trips already contain this campground.
- **Contents:**
  - "ADD TO TRIP";
  - one button per trip, disabled with " (added)" when the trip already has this campground;
  - a "New trip name" input, plus **"Create & Add"** (or Enter). It creates the trip with this one stop. A blank name does nothing.
- **When done,** it emits `done`, and the card closes the panel.
- **Errors:**
  - "Couldn't load trips — try again.";
  - "Couldn't add to that trip — try again.";
  - "Couldn't create that trip — try again."

## Changes from V1 (Shawn, 2026-10-25)

Shawn reviewed V1's behaviors and asked for them addressed. He handed the details to Claude: these are Claude's suggestions, accepted without discussion. Where this section and the sections above differ, this section wins.

1. **Favorites load once, centrally.**
   - `FavoritesService.loadFavoriteIds()` runs once when a session starts, next to the profile load.
   - The sign-out routine (spec 2, **Changes from V1**, #4) clears favorites.
   - The heart never loads anything itself; it only reads `favoriteIds`.

   That removes V1's one-request-per-card storm, and the previous user's hearts showing after a sign-out.
2. **The card list is virtual-scrolled.** It uses the Angular CDK's `cdk-virtual-scroll-viewport` (`@angular/cdk`, same major version as Angular). Only the cards on screen are drawn, so "Show all" still lists every result.
   - **Variable heights:** expanded cards, open add-to-trip panels and note rows change a card's height, so the list uses autosize (`@angular/cdk-experimental/scrolling`) or an equivalent that handles them.
   - **Scrolling to a selection:** a card selected from the map scrolls into view through the viewport (`scrollToIndex`).
   - **Everything else is unchanged:** the card's look, the clicks, plan mode and notes. Favorites and Trips use the same list.
3. **The map loads markers in chunks.** The marker cluster uses `chunkedLoading: true`, so adding thousands of markers doesn't freeze the page. Clustering and the map's look are unchanged.
4. **"Add to trip…" in the map popup.**
   - It replaces V1's one-click "Add to Trip".
   - It's shown whenever the user is signed in, whether or not trips have loaded.
   - Clicking it closes the popup, selects that campground (the list expands and scrolls to it, as with "View details ▸"), and opens that card's add-to-trip panel. The user then picks a trip there.
   - "View details ▸" is unchanged.
5. **Filter changes don't blank the page.**
   - Only the **first** load shows "Finding campgrounds near you..." in place of the map and list.
   - After that, the map and list stay up while results reload. The list header shows "Updating…" next to the count until they arrive.
   - The map keeps its view. It recentres only when the **search location** changes, as before.
6. **The park filter explains itself.** The behavior is kept: a partial park selection still shows only those parks' campgrounds, which are all NPS. When fewer than all parks are selected, the filter bar shows the note "Park filter shows NPS campgrounds only" (`rt-notice`).
7. **One "Where" picker** replaces the separate Region and State multiselects.
   - It's a PrimeNG multiselect with options **grouped by region** (Northeast, Midwest, South, West; states as in the table above), with a filter box.
   - Ticking a region's group header ticks all its states, so there's nothing left to overwrite.
   - Labels: "All states" when all are selected, "{n} states", "No states".
   - The saved state keeps `regions` for compatibility, computed as the regions whose states are all selected.
   - The query is as before: states are omitted when all are selected.
8. **No unused limit.** The client stops sending `result_limit`; the RPC's default doesn't apply when a radius is sent anyway. No visible change.

## Out of scope

- Favorites, Trips and Trip detail pages (their own specs). They reuse the shared pieces above.
- The Leaflet map's own look (tiles, default markers, cluster style, popups). It never changes (design notes).
- Any new feature, or any fix to the behaviors above unless Shawn marks it.
