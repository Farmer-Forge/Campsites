# Favorites, Trips and Trip detail — Design

Status: **draft for Shawn's review** (2026-10-25). Specs 6 and 7 of the roadmap, together, because they share `TripsService` and the plan-a-trip flow.

Last updated: 2026-10-25

## What this is

Three signed-in pages, as V1 has them (`features/favorites/`, `features/trips/`, `core/services/trips.service.ts` at `v1.0`):
- `/favorites`;
- `/trips`;
- `/trips/:id`.

All three use `authGuard`. They reuse the Finder's shared pieces (spec 3): the card list, the map, the favorite heart and the add-to-trip panel. Page styles are carried over verbatim.

## TripsService (root)

`trips` signal: `Trip[]` (`{ id, name, createdAt }`), newest first.

| Method | Does |
|---|---|
| `loadTrips()` | The user's trips, `order by created_at desc`. Signed out → `[]`. |
| `getTrip(id)` | One trip (filtered by `user_id` too, defense in depth), or `null`. |
| `getTripStops(id)` | The stops in `position` order, joined to campgrounds via `get_campgrounds_by_ids`. A stop whose campground is missing is dropped. Returns `TripStop[]` (`{ stopId, campground }`). |
| `createTrip(name, campgroundIds)` | Inserts the trip, then inserts its stops with `position` = index (0, 1, …), then reloads the trips and returns the new id. |
| `renameTrip(id, name)` / `deleteTrip(id)` | Update or delete with `.select()`. Zero rows throws ("No matching trip to rename/delete"). Updates the signal. |
| `addStop(tripId, campgroundId)` | Reads the highest position, then inserts at highest + 1, or 0 for an empty trip. |
| `removeStop(tripId, stopId)` | Deletes that stop, which leaves a gap in the positions. |
| `getTripIdsForCampground(id)` | The ids of the user's trips that contain this campground (RLS scopes it). |
| `reorderStops(tripId, orderedStopIds)` | V1: one update per stop. **V1.1: one call to `reorder_trip_stops`** (spec 1, **Fixes** #5). |

## Favorites (`/favorites`)

The map-and-list layout:
- **Map:** the shared map with the favorites. There's no search location, so it sits on the default view.
- **Side column:**
  - **Header:** "Favorites" (`rt-list-title`), plus a **"Plan a trip"** button (mustard; it reads "Cancel" while planning) when there's at least one favorite.
  - **Planning panel** (`rt-dashed-panel`):
    - the hint "Tick the stops below, name the trip, and save.";
    - a "Trip name" input;
    - **"Save Trip"** (cherry), enabled only when the trimmed name isn't empty **and** at least one card is ticked.
    - Saving creates the trip with the ticked campgrounds **in the order they were ticked**, then goes to `/trips/{id}`.
    - Failure: "Couldn't save this trip — try again."
    - Toggling planning clears the ticks, the name and the error.
  - **Empty:** "No favorites yet. Star a campground from the Finder to save it here."
  - **The card list:** no distances, notes on, plan mode while planning.
    - Saving a note (on blur) calls `updateNote`.
    - Failure: "Couldn't save that note — try again.", shown above the list.
- **On open:** load the favorites, then `get_campgrounds_by_ids` for them.

## Trips list (`/trips`)

- **Layout:** `rt-content`, with the title "Trips".
- **Empty:** "No trips yet. Select some favorites on the Favorites page and choose "Plan a trip" to create one." ("Favorites" links to `/favorites`.)
- **A postcard grid,** one card per trip, newest first:
  - **Header** (links to the trip): "Greetings from" (script), then the trip name.
  - **Body:** "{n} stop(s)" and the route "A → B → C" (stop names in order), once the stops have loaded.
  - **Footer:**
    - "Created {date}" (Angular `date` pipe, default format);
    - **Open** (mustard, → `/trips/{id}`);
    - **Delete** (danger outline), which asks with the browser's `confirm('Delete this trip?')` and then deletes.
- **On open:** load the trips, then each trip's stops in parallel. A trip whose stops fail to load shows no summary.

## Trip detail (`/trips/:id`)

- **Not found** (missing id, no such trip, or any load error): "‹ All trips" (→ `/trips`) and "Trip not found."
- **Map:** the shared map in **ordered** mode with the stops: numbered markers, a route line, and the view fitted to the stops.
- **Side column:**
  - "‹ All trips".
  - **The name** (`rt-list-title`), or, while renaming, an input plus **Save** (Enter saves). A blank name doesn't save. Failure: "Couldn't rename this trip — try again."
  - **Meta row:**
    - "{n} stop(s) · created {date}";
    - **Rename**, hidden while renaming;
    - **Delete trip**, which asks `confirm('Delete this trip? This cannot be undone.')`, deletes, and goes to `/trips`. Failure: "Couldn't delete this trip — try again."
  - **Stop cards** (this page's own markup, not the shared list):
    - a badge "{n} / STOP";
    - the name, plus agency and park-code tags;
    - up and down buttons ("Move up" is disabled on the first stop, "Move down" on the last);
    - **Remove** (danger outline).
    - Clicking a card expands it to the shared detail panel (description, Reserve, Directions).
  - **Moving a stop** swaps it on screen at once, then saves the new order. If saving fails: "Couldn't reorder stops — try again.", and the stops are re-read so the screen matches the database.
  - **Removing:** failure shows "Couldn't remove that stop — try again."
  - **Add a stop:**
    - a select, "Choose a favorite to add...", listing the user's favorites **not already in the trip**;
    - **Add** (mustard), disabled until one is chosen. It adds at the end and reloads the stops.
    - Failure: "Couldn't add that stop — try again."
- **On open:** load the trip and its stops in parallel, then the favorites (for the add select). A favorites failure just leaves the select empty.

## Proposed changes from V1 (Claude's suggestions, pending Shawn's OK)

1. **Unfavoriting on the Favorites page removes the card right away,** with its note. In V1 the card stayed until a reload, and editing its note then failed with an error.
2. **The empty message matches the heart icon:** "No favorites yet. Tap the heart on a campground in the Finder to save it here." V1 said "Star".
3. **Load failures say so.**
   - Favorites: "Couldn't load your favorites — try again."
   - Trips list: "Couldn't load your trips — try again."
   - Trip detail: "Couldn't load this trip — try again." In V1, any failure there read "Trip not found."

   Each one has a "Try again" button. In V1, a failed load on Favorites or Trips showed nothing at all.
4. **The Favorites map shows your favorites.** On load it fits the map to them (32px padding, as Trip detail does), instead of sitting on the middle of the US.
5. **The Trips list loads all stops in two requests:** one `trip_stops` query for all of the user's trips, then one `get_campgrounds_by_ids`. V1 made two requests per trip.
6. **Styled delete confirmation.** Deleting a trip, on the list or the detail page, uses the same inline "Are you sure?" pattern as Account's delete, instead of the browser's `confirm()`:
   - the text "Delete this trip? This cannot be undone.";
   - **Cancel** / **"Yes, delete this trip"**.
7. **The Trips list reports delete failures:** "Couldn't delete this trip — try again." V1 dropped them silently.
8. **Rename has a Cancel button.** V1 had no way out of renaming except saving.
9. **Creating a trip doesn't leave half a trip behind.** If inserting the stops fails after the trip was created, the app deletes that new trip before showing the error. V1 left an empty trip.
10. **Reorder uses `reorder_trip_stops`.** This one is required: with V1.1's unique positions, V1's one-update-per-stop would fail part-way. It's listed so the trips task builds it.

## Out of scope

- Searching all campgrounds to add a stop: V1 adds only from favorites.
- Sharing trips, trip dates, and drag-and-drop reordering (V1 dropped drag in the redesign).
