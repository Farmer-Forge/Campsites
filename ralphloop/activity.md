## Task 2, call 1
- Step 1: generated the Angular 22 workspace in /tmp/scaffold, copied angular.json, package.json(+lock), tsconfigs, .editorconfig, .prettierrc, public/, src/ into the repo; appended Angular entries to .gitignore (kept existing lines). Generator added no test target or test deps; removed the unused "test" npm script. Verified git status shows only the listed files and .gitignore; nothing under supabase/ or ralphloop/ changed. Scaffold app.html is the generator placeholder (to be replaced later).

## Task 2, call 2
- Step 2: installed the runtime and dev dependencies exactly as listed. `npx ng build` succeeds; all @angular/* packages are major 22. npm audit reports 2 vulnerabilities (1 low, 1 high), not addressed (out of scope).

## Task 2, call 3
- Step 3: ran `ng add angular-eslint` (added eslint.config.js, lint target in angular.json, devDeps). Set .prettierrc printWidth to 120 (kept singleQuote and the existing html/angular parser override). Added npm script "lint"; "build" already existed. `npx ng lint` passes with no errors.

## Task 2, call 4
- Step 4: configured angular.json (leaflet png assets, leaflet/markercluster/styles.scss styles in order, development fileReplacements to environment.local.ts, optimization off, sourceMap on). Project name, prefix, SCSS, budgets and defaults were already right. `ng build` (production) and `ng lint` pass. The development build needs environment.ts/environment.local.ts (Step 5; local is gitignored, so dev builds only work where it exists).

## Task 2, call 5
- Step 5: wrote src/environments/environment.ts exactly as given and environment.local.ts from the worker's SUPABASE_URL/SUPABASE_ANON_KEY. Verified `git status --short -uall` lists only environment.ts (not the local file) and `git check-ignore` prints the local path. `ng lint` and `ng build` pass.

## Task 2, call 6
- Step 6: rewrote src/index.html (title "Campsite Finder", Google Fonts preconnects and stylesheet, rest as the generator had it). `ng lint` and `ng build` pass.

## Task 2, call 7
- Step 7: wrote src/styles.scss verbatim from the step (524 lines, no code fences). `ng lint` and `ng build` pass.

## Task 2, call 8
- Step 8: wrote user.model.ts, supabase.service.ts (client, readonly session signal, ready, isAuthenticated, onSignOut, signOut, resets also run on SIGNED_OUT) and user.service.ts (profile signal, loadProfile reads own users row, resets on sign-out). `ng lint` and `ng build` pass.

## Task 2, call 9
- Step 9: wrote src/app/core/guards/auth.guard.ts and admin.guard.ts (both await supabase.ready; admin loads the profile if null, non-admin goes to /). `ng lint` and `ng build` pass.

## Task 2, call 10
- Step 10: wrote app.config.ts (zone change detection, router, async animations, PrimeNG Aura + license); main.ts already matched. The Angular 22 scaffold is zoneless and had no zone.js, so "keep the default zone.js polyfill" had nothing to keep: installed zone.js and added `"polyfills": ["zone.js"]` to the build options in angular.json. `ng lint` and `ng build` pass.

## Task 2, call 11
- Step 11: wrote app.ts (injects SupabaseService/UserService; effect loads the profile when session() is non-null), app.html (nav per step; Account/Admin/Sign out when signed in, Sign in otherwise) and app.scss verbatim. Links: /favorites, /trips, /about, /account, /admin, /login. `ng lint` and `ng build` pass (bundle budget warning only, pre-existing). No raw colors in app.html/app.ts; button uses rt-btn classes that exist in styles.scss.

## Task 2, call 12
- Step 12: wrote app.routes.ts (all lazy; guards on favorites/trips/trips/:id/account/admin; placeholders for Finder and auth routes; about; `**` → 404), features/placeholder ("Coming soon"), features/not-found, features/about (html/ts/scss verbatim). `ng lint` and `ng build` pass (bundle budget warning pre-existing).

## Task 2, call 13
- Step 13: `ng lint` and `ng build` clean, dist index.html exists. Served on 4201: `/` and `/about` both return index with one `<app-root`. Server stopped. environment.ts has no supabase.co or key. Re-read spec 2: routes, guards, session, nav and changes #1, #3, #4, #5 are in place. Gaps: none (no theme in the profile, by design: no dark mode). Only the Account/Admin pages and auth pages are placeholders for later tasks.

## Task 2, call 14
- Step 14: worktree clean; git commit would have nothing to commit. Confirmed the step files (package.json, angular.json, eslint.config.js, src/...) appear in `git log main..HEAD --stat` via checkpoint commits. Step treated as done.

TASK 2 COMPLETE

## Task 3, call 1
- Step 1: wrote src/app/features/auth/auth.scss verbatim from the step (68 lines). `ng lint` passes.

## Task 3, call 2
- Step 2: wrote features/auth/login.component.{ts,html} (not routed yet; Step 5 does routes). Sign in per spec 4 with ?reset=done notice, suspension check (read failure → friendly message + signOut via SupabaseService), safe returnUrl. `ng lint` and `ng build` pass; no raw colors.

## Task 3, call 3
- Step 3: wrote signup.component.{ts,html} (not routed yet). Display name trimmed; button disabled while submitting or any field empty/blank name; session returned → `/`, else "Check your email to verify your account." replaces the form. `ng lint` and `ng build` pass.

## Task 3, call 4
- Step 4: wrote forgot-password.component.{ts,html} and reset-password.component.{ts,html} (not routed yet) with the spec's exact texts. Forgot shows the same notice on any success and only a request error otherwise. Reset awaits `ready`, then has checking/invalid/suspended/ready states; suspended or failed read signs out via `SupabaseService.signOut()`; save checks the passwords match, calls `updateUser`, signs out via the service, and goes to `/login?reset=done`. `ng lint` and `ng build` pass.

## Task 3, call 5
- Step 5: authGuard/adminGuard now redirect to /login?returnUrl=<state.url>; added guestGuard (awaits ready, signed in → /); login/signup routes use real components with guestGuard, forgot/reset routes use real components. `ng lint` and `ng build` pass.

## Task 3, call 6
- Step 7: worktree clean; nothing to commit. Confirmed the auth files, guards and app.routes.ts appear in `git log main..HEAD --stat` via checkpoint commits. Step treated as done.

TASK 3 COMPLETE

## Task 4, call 1
- Step 1: added updateDisplayName (users row, auth metadata, then profile signal), updatePassword and deleteAccount (delete-account function, then SupabaseService.signOut) to UserService. All throw on error so the page can show messages. `ng lint` and `ng build` pass.

## Task 4, call 2
- Step 2: wrote features/account/account.component.{ts,html} (not routed yet; Step 3). Display name, password and delete cards with spec texts, inline styles verbatim minus theme rules, last-admin hint appended on failed delete when role is admin, no theme. Success lines use rt-notice, errors rt-error. No raw colors; `ng lint` and `ng build` pass.

## Task 4, call 3
- Step 3: account route now lazy-loads AccountComponent with authGuard. `ng lint` and `ng build` pass.

## Task 4, call 4
- Step 4: `ng lint` and `ng build` pass (budget warning pre-existing). grep for "theme" in account and user.service finds nothing. Re-read spec 5: all three cards, exact texts, last-admin hint, no Theme card match.

## Task 4, call 5
- Step 5: worktree clean; nothing to commit. Confirmed the account component and UserService files appear in `git log main..HEAD --stat` via checkpoint commits. Step treated as done.

TASK 4 COMPLETE

## Task 3, call 7
- Step 6: `ng lint` passes and `ng build` succeeds. Pat password login returns an access_token (count 1); Sam `users.suspended` is `t`. Re-read spec 4 and grepped every exact text (headings, buttons, notices, reset states, errors): all present. Gaps: none.

TASK 3 COMPLETE

## Task 5, call 1
- Step 1: added campground.model.ts, trip.model.ts and CampgroundsService (getNearest pages with `.range()` and sends no `result_limit`; getByIds, getParkCodes (paged, distinct, sorted), getParkNames, searchByName with `\`, `%`, `_` escaped). `Coordinates` exported. `ng lint` and `ng build` pass (budget warning pre-existing).

## Task 5, call 2
- Step 2: wrote FavoritesService (signals, loadFavoriteIds, toggleFavorite, updateNote with `.select()` and "No matching favorite to update", onSignOut reset) and TripsService (all spec 7 methods; createTrip deletes the new trip if the stops insert fails; reorderStops calls `reorder_trip_stops`; onSignOut clears `trips`). app.ts session effect also calls `loadFavoriteIds()` (errors swallowed so the effect never throws). `ng lint` and `ng build` pass.

## Task 5, call 3
- Step 3: added `hasLocation(c)` to campground.model.ts and `app-campground-detail-panel` (input `campground`; description via `[innerHTML]`; Reserve only when `reservationUrl` set; Directions hidden when no location, falls back to the Google Maps dir URL). Inline styles verbatim. No raw colors; `ng lint` and `ng build` pass (budget warning pre-existing).

## Task 5, call 4
- Step 4: added shared/ui/favorite-toggle (`app-favorite-toggle`, input `campgroundId`). Renders only when signed in; `rt-icon-btn favorite-button`, heart SVG filled when in `favoriteIds`, title/aria-pressed, `stopPropagation()` on click. It only reads `favoriteIds` (no per-heart load, change #1). Toggle errors are swallowed. `ng lint` and `ng build` pass.

## Task 5, call 5
- Step 5: added shared/ui/add-to-trip (`app-add-to-trip`, input `campgroundId`, output `done`). On init it loads trips and the trips containing the campground; one button per trip (disabled with " (added)"), "New trip name" input + "Create & Add" (or Enter, blank does nothing); the three spec error texts; emits `done` after a successful add/create. Inline styles verbatim. No stopPropagation on the panel (lint forbids a click handler on a div), so the card in Step 6 must stop clicks in the panel from toggling the card. `ng lint` and `ng build` pass.

## Task 5, call 6
- Step 6: added shared/ui/campground-table (`app-campground-table`; inputs campgrounds, selected, showDistance, showNotes, notes, planMode, planSelected; outputs selectedChange, noteChange, planToggle). Plain `rt-scroll-list` with `@for`, `content-visibility: auto` on cards, no CDK virtual scroll; `npm uninstall @angular/cdk-experimental` done. External `selected` expands the card and scrolls it in via `afterNextRender`. Only one add-to-trip panel open at a time (`pickerId` signal); the panel sits outside `.card-main`, so its clicks don't toggle the card. Notes keep a draft while typing and emit on blur (blank → null). No extra :host height rule needed. Step 7 must add the `openPickerFor` input (set `pickerId`) to this component. `ng lint`, `ng build` and `ngc --noEmit` pass.

## Task 5, call 7
- Step 7: added shared/ui/campground-map (`app-campground-map`; inputs campgrounds, selectedId, ordered, searchLocation, allowLocationPick; outputs viewDetails, addToTrip, locationPick) with the verbatim scss. Cluster uses `chunkedLoading`; popups are plain DOM ("View details ▸", and "Add to trip…" only when signed in); right-click (`contextmenu`) pick popup with "Search from here"; no-location campgrounds get no marker/route point and keep stop numbers from the full list; marker click and selection use max(12, current zoom) plus `zoomToShowLayer`. Added `openPickerFor` input to `app-campground-table`. `ng lint`, `ng build` and `ngc --noEmit` pass (map isn't imported by any page yet, so it isn't in the bundle). Not exercised in a browser.

## Task 5, call 8
- Step 8: `ng lint` passes; `ng build` succeeds (initial-bundle budget warning only, no error). Paging check prints 1000. grep for cdk-virtual/scrollToIndex/cdk-experimental finds nothing; `contextmenu` found in campground-map.component.ts:93. Re-read spec 3 Changes #1–#4 against the implementation: all covered.

## Task 5, call 9
- Step 9: worktree clean; nothing to commit. Confirmed the services, models and shared components appear in `git log main..HEAD --stat` via checkpoint commits. Step treated as done.

TASK 5 COMPLETE

## Task 6, call 1
- Step 1: added GeolocationService (10s timeout, spec 3's exact messages, unknown codes fall back to the "could not be determined" text; `checkPermissionState` returns 'unsupported' on a throw) and FinderStateService (memory first, then `sessionStorage['campsite-finder.finder']`, spec 3 validation, storage errors swallowed). `ng lint` and `ng build` pass (budget warning pre-existing).
- Note: Step 2 was already ticked in task.md, but `src/app/features/finder/` doesn't exist yet, so no Finder logic is in the tree. Step 3 should create finder.component.ts with the Step 2 logic (constants, `loading`/`updating`, Where picker, Reset filters) along with the template.

## Task 6, call 2
- Step 3: Step 2's logic was missing from the tree (see call 1 note), so I wrote it together with the template: `features/finder/finder.component.ts` + `.html` (no `styleUrl` yet; Step 4 adds `finder.component.scss` and must add `styleUrl: './finder.component.scss'`). Logic: constants, first-load-only `loading` and `updating` signals, single grouped Where multiselect (region group header is a button via the `#group` template that toggles the region's states), Park multiselect with the NPS-only `rt-notice`, radius segmented control, Reset filters (disabled at starting values, one search from the current location), saved-state restore on open, request counter so stale responses are ignored. The manual panel is one `ng-template` (no `@if`); the map tip uses `[hidden]` on its context value. `addToTrip` sets selection and `openPickerFor`. `ng lint`, `ng build` and `ngc --noEmit` pass; no raw colors. Not yet routed (Step 5), so not exercised in a browser.

## Task 6, call 3
- Step 4: wrote `finder.component.scss` verbatim from task.md (134 lines) and added `styleUrl: './finder.component.scss'` to finder.component.ts. `ng lint` and `ng build` pass (budget warning pre-existing; the Finder isn't routed yet, Step 5).

## Task 6, call 4
- Step 5: `app.routes.ts` `''` now lazy-loads `FinderComponent` (placeholder still used by other routes). `ng lint` and `ng build` pass (leaflet.markercluster non-ESM warning only).

## Task 6, call 5
- Step 6: `ng lint` passes; `ng build` succeeds (leaflet.markercluster non-ESM warning only). Re-read spec 3 against the code: every exact text found (4 location messages + unsupported in geolocation.service.ts; blocked help, "Finding campgrounds near you...", manual panel labels/help/tip, "Search this location", "Use my device location", "Change location", "nearest first" in the template; "Unable to load nearby campgrounds." in finder.component.ts). Region/State labels ("All regions" etc.) are absent by design: change #7 replaces them with one "Where" picker ("All states"/"{n} states"). No gaps. Not exercised in a browser.

## Task 6, call 6
- Step 7: worktree clean; Finder files (features/finder, geolocation and finder-state services, route) appear in `git log main..HEAD --stat` via checkpoint commits. Treated as done.

TASK 6 COMPLETE

## Task 7, call 1
- Step 1: created `features/favorites/favorites.component.ts` + `.html` (styles verbatim, inline). Favorites shown = loaded campgrounds filtered by `favoriteIds` (change #1); empty text, load error + "Try again", note error, plan mode with tick order, Save Trip → `/trips/{id}`. `ng lint` and `ng build` pass; no raw colors; not exercised in a browser.
- Note: Step 2 was ticked but `fitToCampgrounds` was missing from the map, so I added it (input; `fitBounds` with 32px padding when true, as in ordered mode). I also routed `favorites` to the component (Step 3's work) in `app.routes.ts`; Step 3 only needs checking.

## Task 7, call 2
- Step 3: checked `app.routes.ts`: `favorites` lazy-loads `FavoritesComponent` with `authGuard` (added in call 1). Nothing more to change.

## Task 7, call 3
- Step 4: `ng lint` and `ng build` pass (leaflet.markercluster non-ESM warning only). Re-read spec 6 Favorites and changes #1–#4 against the component: header/Plan a trip button, planner hint/name/Save Trip/error, load error + Try again, "Tap the heart" empty text, note error above list, `fitToCampgrounds` on the map, route with authGuard. No gaps. Not exercised in a browser.

## Task 7, call 4
- Step 5: worktree clean; favorites files appear in `git log main..HEAD --stat` via checkpoint commits. Treated as done.

TASK 7 COMPLETE

## Task 8, call 1
- Step 1: added `TripsService.loadAllStops(tripIds)`: one `trip_stops` select (`in trip_id`, `order by position`), one `getByIds` for the distinct campgrounds; returns a Map with an entry (possibly empty) per trip id. `ng lint` and `ng build` pass.
- Note: Step 2 is ticked but `src/app/features/trips/` doesn't exist, so the Trips list component isn't in the tree. Step 3 (or a later call) must create `trips-list.component.ts/.html` with Step 2's structure and styles, as happened in Tasks 6 and 7.

## Task 8, call 2
- Step 3: created `features/trips/trips-list.component.ts/.html` (missing from call 1's Step 2: postcards, inline delete confirmation, load error + Try again, delete error) and `trip-detail.component.ts/.html` (not found vs load error, ordered map, rename with Cancel, inline delete confirm, optimistic move via `reorderStops` with re-read on failure, remove, add from favorites not in the trip). Styles verbatim, inline.
- Also routed `trips` and `trips/:id` to the real components with `authGuard` in `app.routes.ts` (Step 4's work), so ticked Step 4 too. `ng lint` and `ng build` pass; no `confirm(` in src/app. Not exercised in a browser.

## Task 8, call 3
- Step 5: `ng lint` and `ng build` pass (leaflet.markercluster non-ESM warning only); `grep "confirm("` in src/app finds nothing. Re-read spec 7 and changes #3, #5–#8, #10 against trips-list and trip-detail: all texts, inline delete confirmation, rename Cancel, reorder via `reorderStops`, load error + Try again present. Not exercised in a browser.

## Task 8, call 4
- Step 6: worktree clean; trips list and detail components, `trips.service.ts` and routes appear in `git log main..HEAD --stat` via checkpoint commits. Treated as done.

TASK 8 COMPLETE

## Task 9, call 1
- Step 1: created `admin-user.model.ts`, `campground-attribute.model.ts`, and `admin-users.service.ts`, `admin-stats.service.ts`, `campground-attributes.service.ts`. Edge functions go through one private `invoke` helper (FunctionsHttpError → `Error(await error.context.text() || error.message)`). Users sort newest first and update in place after each change. `ng lint` and `ng build` pass. Not exercised against the database.
- Note: Step 2 is ticked but `features/admin/` doesn't exist, and Step 3 (route → AdminComponent) is unchecked: the admin route is still a placeholder. A later call must create `admin.component.ts/.html` (Step 2's structure and styles, spec 8 changes #1–#4, including the `%`/`_` escape in the campground search) before Step 3.

## Task 9, call 2
- Step 3: created `features/admin/admin.component.ts/.html` (stats pills, role=tab Users / Campground Attributes, invite form, users table with "You" row, role select, suspend, edit, inline delete confirm, attributes autocomplete + table + add row; styles verbatim inline; plain-English errors for "last admin" / "not authorized"; stats refresh after delete; search uses `CampgroundsService.searchByName`, which escapes `%`/`_`). Routed `admin` → `AdminComponent` with `adminGuard` and removed the placeholder helper from `app.routes.ts`. `ng lint` and `ng build` pass; no raw colors. Not exercised in a browser.
- Note: `features/placeholder/` still exists on disk; Step 4 says to delete it (it's ticked already, so check that in the next call).

## Task 10, call 1 — ended without completing a step (worker failed, exit code 0) at 2026-11-15 02:17 UTC

## Task 10, call 2
- Step 1: red check ran first (FAIL 1–4, PASS 5, exit 1). Then made the five edits in `campground-table.component.ts` only (MAX_SCROLL_PASSES, scrollRun/clickedId, second effect, toggleCard, revealCard/scrollCardToTop/scrollAreaOf). Verified: `ng lint` clean, production build OK, `scroll-check.mjs` PASSED 5 of 5, `app-check.sh` passed.

## Task 10, call 3
- Step 2: verified. `ng lint` clean, production build OK, `scroll-check.mjs` PASSED 5 of 5 (exit 0), one `scrollIntoView(`, all five marker strings found once, only `campground-table.component.ts` changed besides task.md/activity.md, `app-check.sh` ends "CONSOLE CHECK PASSED". Spec 3 change #12 re-read against the code: consistent.

## Task 10, call 4
- Step 3: Commit. Nothing left to commit; `campground-table.component.ts` is in checkpoint 53762f4 (`git log main..HEAD --stat`). Step treated as done.

TASK 10 COMPLETE

## Task 10, ratify
What I ran (the task's Step 2, as written, on this branch):
- npx ng lint: "All files pass linting."
- npx ng build --configuration production,local: "Application bundle generation complete", no errors.
- node ralphloop/scroll-check.mjs dist/campsite-finder/browser: PASS 1-5, "SCROLL CHECK PASSED: 5 of 5.", exit 0.
  - Cases 1-3 land at offBy 0.
  - At 1400px the scroller is the list, and main and the page stay at 0.
  - At 390px the scroller is main.app-main, and the page stays at 0.
  - Case 4 (the last card) ends at the end of the list with the card fully in view.
  - Case 5 (a click in the list) moves the list 28px, the same as main.
- grep: scrollIntoView( appears once, and each of the five required strings appears once.
- git diff against the merge base, without task.md and activity.md: only campground-table.component.ts.
- bash ralphloop/app-check.sh: ends with "CONSOLE CHECK PASSED: 15 page loads, no console errors."

What I checked by reading the code:
- The component diff matches Step 1's five code blocks line for line. Nothing else in the file changed: no template or style changes, and content-visibility and contain-intrinsic-size are untouched.
- Review focus 1 (a one-shot scroll passing for the fix): it isn't one. The code makes repeated correction passes, finds the right scroller, and keeps a separate path for clicks in the list.
- Review focus 2 (scrolling the wrong element): scrollAreaOf walks up from the list to the nearest element that can scroll, and the 390px case confirms that's main.
- Review focus 3 (more than one file): ralphloop/scroll-check.mjs is unchanged from main. Nothing under supabase/, vercel.json, scripts/ or src/environments/ changed. No new tests, and no console output silenced.
- The scroll-run counter stops an older selection's passes when a newer one starts. Both users of the component (Finder and Favorites) bind [selected], so a click in the list always comes back through the effect, which clears clickedId. It can't be left set.
- The task touches no database code or access rules. I made no database calls and changed nothing in the database or the repo, apart from the gitignored environment.local.ts and dist/ that app-check writes anyway.

Worth a look by hand: the plan's own note says a busy map (still zooming while the passes run) wasn't re-probed with the two-calm-passes stop rule. It's on the QC list.
RATIFIED: Task 10

## Task 11, call 1
- Step 1: red check ran as expected (FAIL 1–6, PASS 7, exit 1). Then edited src/styles.scss (tokens, `--rt-teal-deep`, Archivo, four color-mix lines) and src/index.html (title, font link).
- Verified: ng lint passes; production build OK; header-check now PASS 6 and 7, with 1–5 still failing (Steps 2–3 cover the header and titles); app-check.sh console check passed.
- Note: no python in the worker; use node for scripted edits.

## Task 11, call 2
- Step 2: replaced app.html and app.scss with the plan's blocks (extracted by script from task.md, so verbatim). Verified: ng lint passes; production build OK; header-check now PASS 2, 4, 5, 6, 7; FAIL 1 (titles) and 3 (About page's "Campsite Finder") remain for Step 3; app-check.sh console check passed.

## Task 11, call 3
- Step 3: created brand-title.strategy.ts, wired TitleStrategy in app.config.ts, replaced app.routes.ts (titles on all routes but Finder), changed About eyebrow. Code extracted by script from task.md.
- Verified: ng lint clean; app-check.sh console check passed; header-check PASSED 7 of 7.

## Task 11, call 4
- Step 4: ran every check as written. ng lint clean; production build OK; header-check PASSED 7 of 7 (exit 0); colour greps as expected (no matches in app files; only the blue marker's rgba/hex in styles.scss); no "campsite finder|work sans|--fo-" in src/; badge sha256 unchanged; the diff lists exactly the eight expected files; git status clean; app-check.sh ends "CONSOLE CHECK PASSED: 15 page loads".
- Style self-check: shell-only change, tokens used throughout, no one-off colors.

## Task 11, call 5
- Step 5: Commit. The step's files (styles.scss, index.html, app.html, app.scss, app.config.ts, app.routes.ts, brand-title.strategy.ts, about.component.html) are already in the checkpoint commits (`git log main..HEAD --stat`), and `git status` is clean, so there was nothing to commit. Treated as done.
TASK 11 COMPLETE

## Task 11, ratify
What I ran (on this branch's final state):
- Step 4, word for word: `ng lint` (All files pass linting), `ng build -c production,local` (it built; the only warning is the existing leaflet.markercluster CommonJS one), `header-check.mjs`: PASS 1-7, "HEADER CHECK PASSED: 7 of 7.", exit 0. Hex/rgb grep on the shell files: no matches. The 'campsite finder|work sans|--fo-' grep on src/: no matches. styles.scss rgba(): one line only, rgba(37, 99, 235, 0.4). Hex outside :root: the three current-location marker lines only (two #2563eb, one #fff). Badge sha256 409eb7e5…d584, unchanged. The whole-tree diff against the merge base lists exactly the eight planned files. git status shows only the activity.md placeholder. `bash ralphloop/app-check.sh` ends with "CONSOLE CHECK PASSED: 15 page loads, no console errors."
- Verbatim check: I pulled every code block out of task-section.md with a script and diffed each against the repo. app.html, app.scss, brand-title.strategy.ts, app.routes.ts and the styles.scss :root block all match exactly. The edits to index.html, app.config.ts, about.component.html and the four color-mix lines in styles.scss are exactly the ones the plan lists, and nothing else in those files changed.
- What I tried to break:
  - Behavior or route drift: with the `title:` lines removed, app.routes.ts is identical to main's, so guards, paths and lazy loads are unchanged. In app.html only the brand link and the section label changed; the nav links, the session/admin conditionals and Sign out are unchanged.
  - Contrast, tap size, fit and tokens (review focus 1-3): header-check cases 4-7 pass on the production build.
  - Scope (review focus 4): no changes under supabase/, vercel.json, scripts/ or config.toml. environment.ts is still empty, environment.local.ts isn't tracked, no spec files, no new features, no private details.
  - task.md: the diff only ticks Task 11's five boxes.
- Not run: Step 1's red check. src/ already differs from main, so the plan itself says to skip it. The plan's own notes record that main's build fails cases 1-6.
- For the person merging: the QC items are visual (Archivo body text, the warmer cream, the deeper red, phone wrapping). Check them in the browser as listed.
- Cleanup: I rewrote the gitignored environment.local.ts from $SUPABASE_URL/$SUPABASE_ANON_KEY and rebuilt dist/ (both gitignored). I wrote nothing to the database and changed nothing in the repo.
RATIFIED: Task 11

## Task 12, call 1
- Step 1: red check run first (src matched main): FAIL 1-5, PASS 6, "MAP CHECK FAILED: 5 of 6.", exit 1, as expected. Created map-size.service.ts verbatim from the plan.
- Verified: ng lint clean; app-check.sh console check passed (15 page loads).

## Task 12, call 2
- Step 2: replaced campground-map.component.ts with the plan's block and made the four styles.scss edits and the app.scss insert (all extracted by script from task.md, so verbatim).
- Verified: ng lint passes; production build OK; app-check.sh ends "CONSOLE CHECK PASSED: 15 page loads". The pages don't bind the layout class until Step 3, so map-check isn't expected to pass yet.

## Task 12, call 3
- Step 3: in Finder, Favorites and Trip detail, bound `[class.rt-map-layout--max]="mapSize.maximized()"` on the layout div, added the MapSizeService import and `mapSize` field, and made Finder's `viewDetails` call `mapSize.reduce()` first (scripted edit).
- Verified: ng lint clean; app-check.sh "CONSOLE CHECK PASSED: 15 page loads"; map-check.mjs PASSED 6 of 6 (exit 0).

## Task 12, call 4
- Step 4 (Verify): ng lint clean; production build OK; map-check 6 of 6, scroll-check 5 of 5, header-check 7 of 7 (all exit 0); colour greps as expected (none, 1, 3); the ten-file diff list matches; no uncommitted app files; app-check.sh "CONSOLE CHECK PASSED: 15 page loads". No new code, so the style self-check is unchanged from Step 3.

## Task 12, call 5
- Step 5 (Commit): checkpoint commits already hold all ten files (confirmed in `git log main..HEAD --stat`); nothing to commit, no empty commit made. Step ticked.

TASK 12 COMPLETE

## Task 12, ratify
What I ran: every Step 4 check, exactly as written. `npx ng lint` passed ("All files pass linting."). `ng build -c production,local` succeeded with no errors. `map-check.mjs` passed 6 of 6, `scroll-check.mjs` 5 of 5 and `header-check.mjs` 7 of 7. The color greps gave: no matches and grep exit 1 on the three files, 1 `rgba()` in styles.scss, and 3 hex values outside `--rt-` tokens. The merge-base `git diff --name-only` (task.md and activity.md excluded) listed exactly the ten planned files. `git status --porcelain` showed nothing beyond the read-only activity.md, which was already marked modified at the start. `bash ralphloop/app-check.sh` ended "CONSOLE CHECK PASSED: 15 page loads, no console errors." The committed environment.ts is still empty. I didn't rerun Step 1's red check: `src/` no longer matches main, so the plan says to skip it.

Diff review: I extracted the plan's verbatim code from the task section and diffed it against the files. campground-map.component.ts and map-size.service.ts are identical to the plan. The styles.scss edits (four), the app.scss block, the three `[class.rt-map-layout--max]` bindings, the three `inject(MapSizeService)` lines and Finder's `reduce()` in `viewDetails()` all match the plan's wording. The only change to task.md is the five ticked step boxes. Nothing under supabase/, and no change to vercel.json, scripts/ or config.toml. No tests or check scripts were touched. No catch blocks were emptied beyond the plan's two sessionStorage guards, which the plan gives verbatim. No private details. Nothing beyond spec 3 change #13.

What I tried to break: I wrote my own Playwright probe (scratch under /tmp, its own serveSpa, closed afterwards) against the production build, signed in as pat at 390px.
- Trip detail: maximizing took the map frame from 380 to 590px inside the 622px `.app-main`. Nothing scrolled sideways, `.rt-side` was hidden, and the tooltip changed to "Show list".
- Favorites in the same tab opened already maximized (the setting is remembered), and reducing it there worked.
- With the setting still on, I visited /about, /account and /trips. On each, `.app-main` had `container-type: normal` and the full 622px height, and content rendered (/account still scrolls: scrollHeight 685). So size containment doesn't leak to pages without a map.
- On the Finder, I went from 390px to 1280px and then pressed Enter on the focused switch. The list hid, sessionStorage held '1', and the URL didn't change (no '#' navigation).
- The probe saw no console errors.
All writes were browser-side only (sessionStorage). Nothing was written to the database.

For the person merging: as spec 3 accepts (D9), maximizing also hides each page's title row (Rename/Delete on a trip, "Plan a trip" on Favorites), since those live in `.rt-side`. Worth a look in QC on a phone, together with the scroll into view.

RATIFIED: Task 12

## Task 13, call 1
- Step 1: red check run first (src matched main): FAIL 1-7, PASS 8, "STATE CHECK FAILED: 7 of 8.", exit 1, as expected. Added `retired: boolean` to the Campground model and `retired: row.retired === true` in `toCampground`.
- Verified: ng lint clean; production build OK; app-check.sh "CONSOLE CHECK PASSED: 15 page loads".

## Task 13, call 2
- Step 2: added `agenciesVersion?` to FinderSnapshot; in finder.component.ts added STATE to AGENCIES, AGENCIES_VERSION = 2, the upgrade of older saved snapshots in ngOnInit, and saving agenciesVersion. (Scripted with node; no python here. The first app-check run hit transient ERR_NETWORK_CHANGED errors before edits applied; the rerun passed.)
- Verified: ng lint clean; app-check.sh "CONSOLE CHECK PASSED: 15 page loads".

## Task 13, call 3
- Step 3: scripted edits (exact-match, each applied once): "No longer listed" tag, disabled + `plusTitle` on the add-to-trip and plan-check buttons in the table; OSM attribution link and `!c.retired` guard on the popup's add button in the map; "Visit website" for STATE in the detail panel; `.rt-icon-btn` disabled style in styles.scss.
- Verified: ng lint clean; app-check.sh "CONSOLE CHECK PASSED: 15 page loads".
