# Campsite Finder design system

The '50s road-trip look, as V1 shipped it on 2026-10-08. It's the single reference for UI steps (worker prompt rule 8; the rules are in `style-task.md`).

- **The source of truth is the stylesheet:** `src/styles.scss` (tokens, globals and every shared `rt-*` class), `src/app/app.scss` (the nav), and each component's own styles. All of them are carried over verbatim from V1 by the scaffold and feature tasks.
- **This file says what exists and when to use it.**
- **The fuller description** is in `docs/design/Campsite01/README.md` and the clickable prototype `docs/design/Campsite01/CampsiteFinder.dc.html`.

## Tokens (on `:root`)

| Token | Value | Use |
|---|---|---|
| `--rt-paper` | `#f3e9d2` | page background |
| `--rt-card` | `#fbf4e4` | card surface |
| `--rt-cream` | `#fff6e3` | inputs, light buttons, text on dark fills, expanded cards |
| `--rt-ink` | `#2b2522` | text, **every** border, hard shadows |
| `--rt-teal` | `#2f8f8a` | nav bar, agency tags, "on" states, teal text buttons |
| `--rt-cherry` | `#c63a2f` | primary buttons, page titles, links, danger, trip-stop markers |
| `--rt-cherry-dark` | `#9e2a21` | link and cherry-button hover |
| `--rt-mustard` | `#e8a93a` | distance badges, secondary actions (Sign out, Plan a trip, Add, Open), the focus ring |
| `--rt-mustard-dark` | `#d4952a` | mustard hover |
| `--rt-sand` | `#e7dcc2` | disabled and inactive fills (an "added" trip chip, an inactive tab, a switch track that's off) |
| `--rt-script` | `'Yellowtail', cursive` | the wordmark and postcard script only |
| `--rt-display` | `'Alfa Slab One', serif` | titles, headings, labels, badges |
| `--rt-body` | `'Work Sans', system-ui, sans-serif` | everything else: body 15px / 1.5 |

**There are no other colors.** Use `var(--rt-…)`, never a raw hex value, in component styles.

**There's no dark theme** (spec 2, **Changes from V1**, #2).

## Shape

- **Radius:** pills `999px` (buttons, chips, tags, nav links); inputs and selects `10px`; list cards `14px`; page cards `16px`; map frame `18px`; checkboxes `8px`; reorder buttons `6px`; badges `50%`.
- **Borders:** `2px solid var(--rt-ink)` on controls and cards; `3px` on page cards; `4px` on the map frame and the nav's bottom edge; dashed `2px` for dividers and inline panels.
- **Hard shadows, no blur:** buttons `2px 2px 0`; list cards `3px 3px 0`; stat pills `4px 4px 0`; page cards `5px 5px 0`; map and auth cards `6px 6px 0`, all `var(--rt-ink)`.
- **Spacing:** page padding 32px horizontal; 24px grid gaps; 10–14px card gaps; card padding 12–14px (list) and 20–24px (page).
- **Focus:** `:focus-visible` is a 3px mustard outline with a 2px offset. It's set globally; don't override it.

## Shared classes: use these before writing styles

| Need | Class | Notes |
|---|---|---|
| Page title | `rt-title` | 40px display, cherry (Trips, Account, Admin) |
| List title | `rt-list-title` | 30px (Finder count, Favorites, a trip's name) |
| Card or section heading | `rt-heading` | 18px display |
| Small caps label | `rt-label` | "AGENCY", "ADD TO TRIP", … |
| Success or info line | `rt-notice` | |
| Error line | `rt-error` | |
| Button | `rt-btn` | cream pill; add `--cherry` (primary), `--mustard` (secondary), `--danger-outline` (destructive), `--sm` (compact), `--shadow` (hard 2px shadow) |
| Borderless action | `rt-text-btn` | `--teal` (neutral actions), `--cherry` (Delete) |
| Round icon button | `rt-icon-btn` | 40px: favorite heart, add-to-trip plus |
| Text input or select | `rt-input` | `--sm` for compact rows; also styles `select.rt-input` |
| Page card | `rt-page-card` | Account cards, the 404 page |
| Message box | `rt-message` | `--error` variant |
| Inline panel | `rt-dashed-panel` | manual location, trip planner |
| Tag | `rt-tag` | `--teal` (agency), `--outline` (park code) |
| Scrolling page | `rt-content` | Trips, Account, Admin, 404 |
| Map-and-list page | `rt-map-layout` + `rt-map-frame` + `rt-side` (+ `rt-scroll-list`) | Finder, Favorites, Trip detail. Under 900px the map stacks above the list. |
| Admin table | `rt-table-card` + `rt-table` (+ `rt-row-actions`) | |

**PrimeNG:** only `p-multiselect` (the Finder filters), `p-select` (the admin role) and `p-autocomplete` (the admin campground search). They're restyled globally in `styles.scss`; don't restyle them per page.

**Leaflet:** the map's own look (tiles, default markers, clusters, popups) never changes. The app's only marker classes are `.trip-stop-marker`, `.current-location-marker` and `.view-details-button` (popup buttons).

## Shared components: use these before writing markup

They live in `src/app/shared/ui/` (spec 3, **Shared pieces**):

| Component | Use |
|---|---|
| `app-campground-table` | Any list of campgrounds (Finder, Favorites). Virtual-scrolled. |
| `app-campground-map` | Any map of campgrounds (Finder, Favorites, Trip detail) |
| `app-campground-detail-panel` | A campground's description, Reserve and Directions |
| `app-favorite-toggle` | The heart |
| `app-add-to-trip` | The inline add-to-trip panel |

## Copy

- The product is **"Campsite Finder"** (two words), everywhere.
- Buttons are short verbs in title case, as in V1 ("Save Name", "Plan a trip", "Create & Add").
- Errors follow V1's pattern: "Couldn't … — try again." or "Could not …. Please try again.". The specs give the exact text for each.
