# App shell and design system — Design

Status: **draft for Shawn's review** (2026-10-24; changes from V1 added 2026-10-25). Spec 2 of the roadmap (`2026-10-20-v1.1-roadmap-design.md`).

Last updated: 2026-10-24

## What this is

Everything every screen shares:
- the stack and project setup;
- local settings;
- routes and guards;
- the nav bar;
- the session and the signed-in user;
- the '50s road-trip design system.

It's written from V1's code (`~/projects/PrimeNG` at `v1.0`). V1's design notes, `docs/design/Campsite01/README.md` (already in this repo), describe the same look. Where they differ, V1's code wins.

The first real task in `task.md`, the scaffold, is built from this spec. Each feature spec (Finder, auth, account, favorites, trips, admin, about) builds on it.

## Stack (same as V1)

| Piece | Version (V1's `package.json` range) | Notes |
|---|---|---|
| Angular | `^22.1` (core, common, router, forms, animations, platform-browser) | Standalone components, signals, new control flow (`@if`, `@for`). `zone.js` `^0.16` with `provideZoneChangeDetection({ eventCoalescing: true })`. |
| Angular CLI and build | `@angular/cli`, `@angular/build` `^22.1` | `@angular/build:application` and `:dev-server`. |
| PrimeNG | `primeng` `^22.0`, `@primeuix/themes` `^3.0`, `primeicons` `^8.0` | Aura preset via `providePrimeNG({ theme: { preset: Aura }, license })`. Only multiselect, select and autocomplete are used, all restyled (below). |
| Leaflet | `leaflet` `^1.9.4`, `@bluehalo/ngx-leaflet` `^22`, `leaflet.markercluster` `^1.5.3`, `@bluehalo/ngx-leaflet-markercluster` `^22` (+ `@types/*`) | OpenStreetMap tiles. Map details are in the Finder spec. |
| Supabase | `@supabase/supabase-js` `^2.112` | |
| TypeScript | `~6.0` | |
| Prettier | `^3.8` | V1 has it. |
| **ESLint (new)** | `angular-eslint` (`ng add angular-eslint`), default config | Shawn, 2026-10-20: lint is part of every step's checks. |

**Dropped from V1:** Vitest, jsdom and the `test` target (Shawn, 2026-10-19). The scaffold uses `--skip-tests`, and no task writes `*.spec.ts`.

## Project setup

- Workspace and project name: `campsite-finder` (as V1). Component prefix `app`, styles in SCSS (`inlineStyleLanguage: scss`).
- **`angular.json`, as V1's:**
  - assets: everything in `public/` (V1 has only `favicon.ico`), plus `node_modules/leaflet/dist/images/*.png` copied to `/`;
  - styles, in this order: `leaflet/dist/leaflet.css`, `leaflet.markercluster/dist/MarkerCluster.css`, `…/MarkerCluster.Default.css`, `src/styles.scss`;
  - production budgets: initial 500 kB warning / 1 MB error; any component style 4 kB / 8 kB;
  - `build` defaults to `production`, `serve` to `development`.
- **`src/index.html`:**
  - `<title>Campsite Finder</title>` (V1 had "CampsiteFinder"; see **Changes from V1**, #5), `lang="en"`, `<base href="/">`, viewport meta, `favicon.ico`;
  - Google Fonts preconnects;
  - a stylesheet link for `Yellowtail`, `Alfa Slab One` and `Work Sans:wght@400;500;600;700`, with `display=swap`.
- **Folders** (as V1, with one change):
  - `src/app/core/services/`, `core/guards/`, `core/models/`;
  - `src/app/features/<feature>/`;
  - shared components in **`src/app/shared/ui/`** (V1 used `src/app/shared/`). That's where worker prompt rule 8 looks, so `favorite-toggle` and `add-to-trip` live there.

## Local settings (the convention Phase 1 set)

- **`src/environments/environment.ts` (committed) holds no keys:**
  ```ts
  export const environment = { production: true, supabaseUrl: '', supabaseAnonKey: '' };
  ```
  V1 committed its production URL and key here. V1.1 never does.
- **`src/environments/environment.local.ts`** is gitignored and has the same shape, with `production: false` and the local stack's URL and anon key.
  - `angular.json`'s `development` configuration replaces `environment.ts` with it (`fileReplacements`), so `ng serve` uses it.
  - Checkpoints never commit it, and chain mode refuses a PR that contains it.
- **Who writes it:**
  - `review.sh` writes it in the canonical clone on Ralph, pointing at Ralph's LAN address so a browser elsewhere can reach Supabase.
  - **Worker steps must write it themselves before running `ng serve`.** Worktrees don't have it. The worker writes it from `$SUPABASE_URL` and `$SUPABASE_ANON_KEY`, which the worker container already has.
  - `ng build` uses the production configuration, so it doesn't need the file.
- **Production settings for V1.1's own deploy are out of scope here.** They're set up by hand later.

## Checks every step runs

- **Every step:** `npx ng lint` and `npx ng build`, both clean.
- **Only if a step serves the app:** `npx ng serve --port 4201`. Port 4200 belongs to the review app on Ralph.
- **Never needed per step:** `deno test --lock=deno.lock --frozen supabase/functions` and the pgTAP tests (`supabase test db`). No step may touch the contract (worker prompt rule 4), so they don't apply.

## Routes and guards (as V1)

Every route lazy-loads its component (`loadComponent`).

| Path | Component | Guard |
|---|---|---|
| `` (home) | Finder | none |
| `favorites` | Favorites | `authGuard` |
| `trips` | Trips list | `authGuard` |
| `trips/:id` | Trip detail | `authGuard` |
| `account` | Account | `authGuard` |
| `admin` | Admin | `adminGuard` |
| `login`, `signup`, `forgot-password`, `reset-password` | auth pages | none |
| `about` | About | none |

Plus a wildcard `**` route to the "page not found" page (**Changes from V1**, #3).

- **`authGuard`:** allows the route if a session exists; otherwise it redirects to `/login`. It first waits for the saved session to load (**Changes from V1**, #1).
- **`adminGuard`:**
  1. No session → `/login`.
  2. Load the profile if it isn't loaded yet.
  3. `role === 'admin'` → allow; otherwise → `/`.

  (With V1.1's database, a suspended admin isn't an admin either: `is_admin` and the user's own row both reflect that.)

## Session and the signed-in user

- **`SupabaseService`** (root):
  - one `createClient(environment.supabaseUrl, environment.supabaseAnonKey)`;
  - a `session` signal, set from `auth.getSession()` at startup and from `auth.onAuthStateChange`;
  - `isAuthenticated` (session is not null).
- **`UserService`** (root):
  - a `profile` signal: `{ id, displayName, theme, role }` from the user's own `users` row;
  - `loadProfile()`, which also sets `document.documentElement.dataset.theme` when a theme is saved;
  - `updateDisplayName`, which updates `users` and also the auth user's metadata;
  - `updatePassword` (`auth.updateUser`);
  - `updateTheme`, which updates `users` and the `data-theme` attribute;
  - `deleteAccount` (the `delete-account` edge function, then sign out).

  Details are in the account spec.
- **Root component:** whenever the session becomes non-null, it loads the profile. "Sign out" calls `auth.signOut()`.

## Nav bar (as V1)

A teal bar across the top. Under it, a `<main class="app-main">` holds the `router-outlet`. The page is 100vh with the main area scrolling inside it, and map pages fill the remaining height.

- **Left:** the wordmark "Campsite Finder", linking to `/`.
- **Main links:** Finder (`/`, active only on an exact match), Favorites, Trips, **About Us**. The active link is a cream pill (`routerLinkActive`); Trip detail highlights Trips.
- **Right:**
  - **Signed in:**
    - Account (outlined pill);
    - Admin (outlined pill), only when `profile().role === 'admin'`;
    - **Sign out**, a mustard pill (`rt-btn rt-btn--mustard rt-btn--shadow`).
  - **Signed out:** "Sign in" (outlined pill) → `/login`.
- **Favorites and Trips stay in the nav when signed out.** Following one hits `authGuard` and lands on `/login`.

Exact sizes and colors are in `app.scss` (below).

## Design system

### Source of truth

**V1's global stylesheet (`src/styles.scss`, 524 lines) and shell stylesheet (`src/app/app.scss`, 109 lines) are carried over verbatim.** The interactive session that writes `task.md` copies them into the scaffold task's steps. The loop worker never reads V1. That's how V1.1 matches V1's look exactly, and V1's code decides any doubt.

### What's in it (for `Design.md`)

**Tokens** (on `:root`):

| Token | Value | Use |
|---|---|---|
| `--rt-paper` | `#f3e9d2` | page background |
| `--rt-card` | `#fbf4e4` | card surface |
| `--rt-cream` | `#fff6e3` | inputs, light buttons, text on dark fills |
| `--rt-ink` | `#2b2522` | text, every border, hard shadows |
| `--rt-teal` | `#2f8f8a` | nav bar, agency tags, "on" states |
| `--rt-cherry` / `--rt-cherry-dark` | `#c63a2f` / `#9e2a21` | primary buttons, titles, links (hover dark), danger, trip-stop markers |
| `--rt-mustard` / `--rt-mustard-dark` | `#e8a93a` / `#d4952a` | distance badges, secondary actions, the focus ring |
| `--rt-sand` | `#e7dcc2` | disabled and inactive fills |
| `--rt-script` | `'Yellowtail', cursive` | wordmark |
| `--rt-display` | `'Alfa Slab One', serif` | titles, headings, labels |
| `--rt-body` | `'Work Sans', system-ui, sans-serif` | body text: 15px / 1.5 |

**Globals:**
- body on paper with ink text;
- links cherry, darker on hover;
- `:focus-visible` is a 3px mustard outline with a 2px offset;
- Leaflet uses the body font;
- `primeicons` is imported.

**Shared classes** (each `rt-*` class is a building block; screens use them instead of one-off styles):

| Group | Classes |
|---|---|
| Type | `rt-title` (40px display, cherry), `rt-list-title` (30px), `rt-heading` (18px), `rt-label`, `rt-notice`, `rt-error` |
| Buttons | `rt-btn` (pill) with `--shadow`, `--sm`, `--cherry`, `--mustard`, `--danger-outline`; `rt-text-btn` with `--teal`, `--cherry` (borderless row actions); `rt-icon-btn` (40px round: heart, plus) |
| Inputs | `rt-input` (`--sm`; also styles `select.rt-input`) |
| Cards and panels | `rt-page-card`, `rt-message` (`--error`), `rt-dashed-panel`, `rt-tag` (`--teal`, `--outline`) |
| Page layouts | `rt-content` (scrolling page: Trips, Account, Admin); `rt-map-layout` + `rt-map-frame` + `rt-side` + `rt-scroll-list` (map-and-list pages: Finder, Favorites, Trip detail). Under 900px the map stacks above the list. |
| Tables (admin) | `rt-table-card`, `rt-table`, `rt-row-actions` |
| PrimeNG restyles | `.p-multiselect`, `.p-select` and the autocomplete input become cream 10px-radius boxes with 2px ink borders; overlays and selected options in theme colors; checked checkbox |
| Leaflet | `.trip-stop-marker` (numbered, cherry), `.view-details-button` (in popups), `.current-location-marker` (search-location pin) |

**Shape rules** (from the design notes, used across the stylesheet):
- **Radius:** pills 999px; inputs 10px; list cards 14px; page cards 16px; map frame 18px.
- **Borders:** 2px ink on controls and cards; 3px on page cards; 4px on the map frame and the nav's bottom edge; dashed 2px for dividers and inline panels.
- **Hard shadows, no blur:** buttons 2px; list cards 3px; page cards 5px; map and auth cards 6px.

### `docs/superpowers/Design.md` and `style-task.md`

Worker prompt rule 8 sends UI steps to these files, so they're written with `task.md`, before the loop runs:
- **`Design.md`:** the tokens, the class catalog above with when to use each class, and the shape rules. It's a short reference, not a copy of the stylesheet.
- **`style-task.md`:** the rules for UI steps, following MyGear's pattern:
  - use an existing `rt-*` class or `src/app/shared/ui/` component;
  - no raw colors outside the tokens, and no new one-off styles;
  - a genuinely new pattern goes into `styles.scss` **and** `Design.md` in the same step;
  - the Leaflet map's own look (tiles, default markers, clusters, popups) never changes.
- **No dark theme** in V1.1 (see **Changes from V1**, #2).

## Changes from V1 (Shawn, 2026-10-25)

Shawn reviewed V1's behaviors and asked for them addressed. He handed the details to Claude: these are Claude's suggestions, accepted without discussion. V1.1 does the following, where V1 didn't:

1. **Guards wait for the saved session.** `SupabaseService` exposes a `ready` promise, resolved once `auth.getSession()` has returned at startup. `authGuard` and `adminGuard` `await` it before checking. So refreshing a signed-in page stays on that page, where V1 probably sent it to `/login`.
2. **No dark mode.**
   - The Account page has no theme toggle.
   - `UserService` doesn't read or write `theme`, and nothing sets `data-theme`.
   - The `users.theme` column stays (it's in the schema contract) but is unused.
3. **A "page not found" page.**
   - A wildcard route (`**`) shows a road-trip-styled page in `rt-content` with an `rt-page-card`.
   - The title is "Page not found" (`rt-title`), followed by "That page isn't on the map." and an `rt-btn rt-btn--cherry` link "Back to the Finder" → `/`.
4. **One sign-out routine.** Signing out, whether from the nav, after a suspension check or after deleting the account, goes through one method. It calls `auth.signOut()` and then clears every per-user signal:
   - the profile;
   - favorites (ids and notes);
   - trips and their stops.

   The Finder's saved search stays, since it belongs to the tab, not the user.
5. **"Campsite Finder" everywhere.** The browser tab title becomes "Campsite Finder", matching the wordmark. The nav link keeps the label "About Us".

## Decided

- **PrimeNG license key** (Shawn, 2026-10-25): V1.1 commits the same PrimeUI community license key V1 has in `app.config.ts` (`providePrimeNG({ theme: { preset: Aura }, license: … })`). The session that writes `task.md` copies it from V1's `app.config.ts`.

## Out of scope

- The screens themselves: Finder, auth, account, favorites, trips, admin and about each get their own spec.
- Production settings and deployment (by hand, later).
- A dark palette, a 404 page and any other new feature, unless Shawn marks the behaviors above for fixing.
- The Forge Angular scaffold (extracted from Campsites after it works).
