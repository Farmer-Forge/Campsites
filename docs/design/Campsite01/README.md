# Handoff: CampsiteFinder — '50s Road Trip Redesign

## Overview
A full visual redesign of CampsiteFinder (repo `Farmer-Forge/CampsiteFinder`, Angular 22 + PrimeNG + Supabase + Leaflet) in a 1950s road-trip style: cream paper, teal, cherry red and mustard, a script wordmark, pill buttons with hard offset shadows. Covers every route: Finder, Favorites, Trips, Trip detail, Account, Admin, About, Login, Signup.

**The Leaflet map itself is NOT to change** — same OpenStreetMap tiles, default `L.Icon.Default` markers, marker cluster, popup content ("View details ▸", "Add to Trip"). Only the frame around it and the UI next to it change. The one exception: trip-route numbered markers (`.trip-stop-marker`) recolor from green to cherry red (see tokens).

## About the Design Files
`CampsiteFinder.dc.html` is a **design reference built in HTML** — a clickable prototype of the intended look and behavior, not code to ship. Recreate it inside the existing Angular app using its current components, services and PrimeNG (restyle PrimeNG via its theme preset / pass-through, or replace individual controls where noted). All data in the prototype is mock; wire everything to the existing services (`CampgroundsService`, `TripsService`, `FavoritesService`, `UserService`, etc.). Do not change data flow, RPCs, guards or routes.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and shadows below are final.

## Design Tokens
Colors
- `--rt-paper` #f3e9d2 — page background
- `--rt-card` #fbf4e4 — card surface
- `--rt-cream` #fff6e3 — inputs, light buttons, text on dark fills
- `--rt-ink` #2b2522 — text, all borders, hard shadows
- `--rt-teal` #2f8f8a — nav bar, agency tags, success text, "on" toggles
- `--rt-cherry` #c63a2f — primary buttons, page titles, wordmark shadow, danger, trip stop markers
- `--rt-mustard` #e8a93a — distance badges, secondary CTA (Sign out, Plan a trip, Add, Open)
- `--rt-sand` #e7dcc2 — disabled/inactive fills (added trip chip, inactive admin tab, toggle track off)
- Link: #c63a2f, hover #9e2a21. Focus ring: `outline: 3px solid #e8a93a; outline-offset: 2px`.

Type (Google Fonts)
- Wordmark/script: **Yellowtail** 400 — nav 40px; auth card 44px; trip postcards 36px; About hero 120px
- Display/headings: **Alfa Slab One** 400 — page titles 40px (Trips/Account/Admin), list headers 30px, section/card headings 18px, filter labels 14px letter-spacing .04em, badges 16–17px
- UI/body: **Work Sans** 400/500/600/700 — body 15px/1.5, buttons 13–15px 700, nav links 14px 700 uppercase letter-spacing .08em, tags 12px 700, micro labels 10–12px 700 uppercase letter-spacing .1–.12em

Shape
- Radius: pills 999px (buttons, chips, tags, nav links); inputs/selects 10px; cards 14px (list) / 16px (page cards); map frame 18px; checkbox 8px; reorder buttons 6px; badges 50%
- Borders: 2px ink on controls/cards; 3px on page cards; 4px on map frame and nav bottom edge; dashed 2px ink for section dividers/inline panels
- Hard shadows (no blur): buttons `2px 2px 0 ink`; list cards `3px 3px 0`; stat pills `4px 4px 0`; page cards `5px 5px 0`; map/auth `6px 6px 0`
- Spacing: page padding 32px horizontal; 24px grid gaps; 10–14px card gaps; card inner padding 12–14px (list), 20–24px (page)

## Global Shell (app.html / app.scss)
- Full viewport `height:100vh`, column flex, page area scrolls internally (map pages fill remaining height).
- **Nav**: teal bar, min-height 76px, padding 12px 32px, 4px ink bottom border, `flex-wrap:wrap`, gap 8px 24px.
  - Left: "Campsite Finder" wordmark (Yellowtail 40px, cream, `text-shadow:3px 3px 0 #c63a2f`), links to `/`.
  - Main links: Finder, Favorites, Trips, About Us — pill, 8px 16px, uppercase. Active = cream bg + ink text; inactive = transparent + cream text. Trip detail highlights Trips.
  - Right (margin-left:auto): signed in → Account, Admin (role==='admin' only) as outlined pills (2px cream border; active fills cream), then **Sign out** mustard pill with ink border + 2px shadow. Signed out → "Sign in" outlined pill.

## Screens

### Finder (`/`)
Filter bar (padding 16px 32px, dashed 2px ink bottom border, wraps):
- "AGENCY" label + 5 toggle chips NPS/USFS/BLM/USACE/FWS (pill, 2px ink border; on = ink bg/cream text, off = cream bg/ink text). Replaces the agency `p-multiselect`; same `selectedAgencies` model.
- Region, State, Park — keep `p-multiselect` behavior, styled as cream 10px-radius boxes with 2px ink border, 14px 600 label + chevron ("All regions" etc. when all selected). Park only when `parkCodes().length > 0`.
- Right: "MILES FROM ME" + segmented pill: All · 25 · 50 · 100 · 250. "All" = `nearMeEnabled=false`; a number = `nearMeEnabled=true, radiusMiles=n`. Selected = cherry bg/cream text. Replaces toggle switch + radius select.

Body: grid `minmax(0,1fr) minmax(380px,500px)`, gap 24px, padding 24px 32px 32px.
- Left: map in a frame (4px ink border, 18px radius, overflow hidden, 6px hard shadow), fills height. Call `map.invalidateSize()` after layout/resizes.
- Right column: header "{n} campgrounds" (Alfa Slab 30px cherry) + "nearest first" (14px 600). Then a scrolling card list replacing `p-table` (keep pagination or switch to virtual scroll — sorted by distance):
  - Card: `#fbf4e4` (expanded `#fff6e3`), 2px ink border, 14px radius, 3px shadow; row padding 12px 14px, gap 14px.
  - 58px mustard circle badge: distance (Alfa Slab 16–17px, 1 decimal under 100, rounded above) over "MI" (10px 700).
  - Name 17px 700; tags row: agency (teal pill, cream text) + park code (outlined pill).
  - 40px round cream buttons: heart (favorite toggle, cherry; filled when favorited) and + (add to trip; only when authenticated; active = ink fill).
  - Click card → expand detail (same as current `expandedId` + selection → map `setView(...,12)`): description (15px/1.5) + "Reserve on recreation.gov" (cherry pill) + "Directions" (cream pill), indented 86px.
  - "+" opens inline panel (replaces `p-popover`): dashed-bordered cream box, "ADD TO TRIP" label, one pill per trip ("Name (added)" disabled with sand bg), then "New trip name" input + "Create & Add" cherry pill.
- Loading/error states: keep current logic; style messages as cream cards with 2px ink border; manual lat/lng form uses the input + cherry button styles.

### Favorites (`/favorites`)
Same map + list layout, no filter bar, no distance badge. Header "Favorites" + "Plan a trip" mustard pill (becomes "Cancel", cream). Each card has a note input under it (transparent, dotted 2px ink bottom border, "Add a note", saves on blur via existing `noteChange`). Planning mode: dashed cream panel "Tick the stops below, name the trip, and save." + Trip name input + "Save Trip" (cherry; 45% opacity when disabled), and a 28px checkbox at the left of each card (teal when checked). Empty state copy unchanged.

### Trips (`/trips`)
Title "Trips" (Alfa 40px cherry). Grid `repeat(auto-fill,minmax(300px,1fr))`, gap 20px, of postcard cards: teal header (3px ink bottom border) with "GREETINGS FROM" (12px 700 caps) over trip name (Yellowtail 36px, cream, 2px cherry text-shadow); body "{n} stops" + route "Stop A → Stop B → …"; dashed footer "Created {date}" + "Open" (mustard) + "Delete" (cherry outline; keeps `confirm`). Empty-state copy unchanged.

### Trip detail (`/trips/:id`)
Map + list layout. Map uses `ordered=true` (numbered markers + polyline, fitBounds). Header: "‹ All trips" (13px 700 caps teal), trip name (Alfa 30px cherry) or rename input + Save; meta "{n} stops · created {date}" + Rename (cream pill) + Delete trip (cherry outline). Cards: cherry badge with stop number over "STOP"; up/down arrow buttons replace drag handle (drag-and-drop via existing `onRowReorder` is fine to keep — just style the handle); "Remove" cherry outline pill. Footer (dashed top border): "Choose a favorite to add..." select + "Add" mustard pill.

### Account (`/account`)
Max-width 720px column, gap 20px. Four cards (3px ink border, 16px radius, 5px shadow): Display name (input + "Save Name"), Password (two inputs side by side + "Update Password"), Theme (pill toggle switch: 48×26 track, sand off / teal on, cream knob — "Dark mode"), Delete Account (cherry 3px border, no shadow; confirm flow unchanged). Success notices teal 14px 600; errors cherry.

### Admin (`/admin`)
Title; stat pills (64px circle number — mustard for Favorites, teal for Trips — + caps label). Folder-style tabs (3px ink, top radius 12px; active `#fbf4e4`, inactive sand). Users: invite row (Email, Display name, "Invite User"); table as rounded card with ink header row (cream 12px caps) and dashed row dividers; role as pill (mustard for admin); Suspend/Unsuspend teal text button; Edit/Delete text buttons. Attributes: search box + same table style with an add row (cream bg, 3px top border).

### About (`/about`)
Cherry hero (4px ink bottom border, padding 88px 32px 96px, centered): "CAMPSITE FINDER" 14px caps letter-spacing .3em cream; "About Us" Yellowtail 120px cream with 5px ink text-shadow; tagline "Because it sounded fun." in a mustard pill (Alfa 28px). Contact paragraph 18px centered below, copy unchanged. (The prototype dropped the animated SVG dusk scene; keeping it recolored to the palette is also acceptable — confirm with Shawn.)

### Login / Signup
Centered 420px card (3px ink, 18px radius, 6px shadow): teal header with "Sign In"/"Sign Up" in Yellowtail 44px; inputs; full-width cherry submit; switch link. Copy unchanged.

## Interactions & State
No new state beyond what the components already hold, except:
- Finder: radius segmented control maps onto `nearMeEnabled` + `radiusMiles`.
- Add-to-trip becomes inline expansion per card (one open at a time).
- Hover: buttons darken ~8% (e.g. cherry → #9e2a21, mustard → #d4952a); cards no hover lift. Pressed: translate(2px,2px) and shadow → 0.
- Responsive: nav wraps; under ~900px stack map above list (map ~45vh).

## Leaflet notes
- Keep `campground-map.component.ts` as-is. Only add `.trip-stop-marker` restyle in `styles.scss`: background #c63a2f, color #fff6e3, `border:2px solid #2b2522`.
- Popup `.view-details-button` may stay #2563eb (unchanged) — the brief is to leave the map alone.

## Files
- `CampsiteFinder.dc.html` — full clickable prototype of every screen (open in a browser; Tweaks let you set start page / signed-in / admin).
- `Finder Directions.dc.html` — the earlier Modernist vs road-trip comparison (1b was chosen). Reference only.
