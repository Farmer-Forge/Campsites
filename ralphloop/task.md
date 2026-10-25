# Campsite Finder V1.1 Implementation Plan

> **For the loop:** `ralphloop/doloop.sh` (or `ralphloop/chain.sh`) works through this file task by task, one worker call per unchecked `- [ ]` step, one PR per task. Task 1 is manual infrastructure and stays checked. Tasks 2–9 build the app.
>
> **Specs (binding, all approved by Shawn):** read the one a task names before its first step.
> - `docs/superpowers/specs/2026-10-24-schema-contract-design.md` (spec 1: the database you build on, unchanged);
> - `2026-10-24-app-shell-design.md` (2);
> - `2026-10-25-finder-design.md` (3);
> - `2026-10-25-auth-design.md` (4);
> - `2026-10-25-account-design.md` (5);
> - `2026-10-25-favorites-trips-design.md` (6, 7);
> - `2026-10-25-admin-about-design.md` (8, 9).
>
> **Each spec's "Changes from V1" section wins over its V1 description.** Every UI step follows `docs/superpowers/style-task.md` (worker prompt rule 8).

**Goal:** Campsite Finder V1.1. It's V1's Angular + PrimeNG + Supabase app rebuilt from specs, with the same look and behavior, plus the security fixes and behavior changes the specs list. It runs against the local Supabase stack on Ralph and is reviewed at http://192.168.1.188:4200.

**Architecture:** An Angular 22 standalone SPA talking directly to Supabase (Postgres + Auth + RLS, plus six edge functions) through `@supabase/supabase-js`, with no app server.
- **Root-provided services** in `src/app/core/services/` hold the session and per-user state as signals.
- **Pages** live in `src/app/features/<feature>/`, and shared pieces in `src/app/shared/ui/`.
- **The database is fixed** (spec 1): this plan never writes SQL migrations.

**Tech Stack:** Angular 22.x (standalone, signals, `@if`/`@for`), PrimeNG 22 (Aura), `@angular/cdk` + `@angular/cdk-experimental` 22 (virtual scroll), Leaflet 1.9 + `@bluehalo/ngx-leaflet` 22 + markercluster, `@supabase/supabase-js` ^2.112.3, TypeScript ~6.0, `angular-eslint`, Prettier.

## Global Constraints

Every task's requirements implicitly include this section.

**Never**
- **Never edit `supabase/migrations/`, `supabase/functions/`, `supabase/tests/` or `deno.lock`,** and never run DDL against the database (worker prompt rule 4). If a step seems to need a schema or edge-function change, write a `BLOCKED:` line (rule 6).
- **Never commit `src/environments/environment.local.ts`.** Never put a URL or key in `src/environments/environment.ts`.
- **No `*.spec.ts` files, no test runner, no `ng test`.** Unit tests are dropped (Shawn, 2026-10-19).
- **Never serve the app on port 4200**; the review app owns it. Use `--port 4201`.

**Every step's checks** (run them before ticking the box, worker prompt rule 7):
- `npx ng lint`: no errors (from Task 2, Step 3 onward);
- `npx ng build`: succeeds, with no budget errors (from Task 2, Step 2 onward).
- Steps that change UI also run `style-task.md`'s self-check.

**Local settings.** Before running `ng serve`, write the gitignored local environment from the worker's own variables:
```bash
mkdir -p src/environments && printf "export const environment = {\n  production: false,\n  supabaseUrl: '%s',\n  supabaseAnonKey: '%s',\n};\n" "$SUPABASE_URL" "$SUPABASE_ANON_KEY" > src/environments/environment.local.ts
```

**Data**
- Use only the tables, RPCs and edge functions in spec 1, with exactly those names.
- Local data comes from the seed. The dev logins:

  | Account | Password | Who |
  |---|---|---|
  | `admin@campsites.test` | `campsites-admin` | admin |
  | `pat@campsites.test` | `campsites-pat` | camper with favorites and a trip |
  | `sam@campsites.test` | `campsites-sam` | suspended |
- Reach the database only with `psql "$DATABASE_URL"`, for reads.

**Styles**
- **Copy each "verbatim" style block exactly as given.** That's how V1.1 matches V1's look.
- **New elements the specs add use existing `rt-*` classes.** If one truly needs a new class, add it to `src/styles.scss` and `docs/superpowers/Design.md` in the same step.

**Code shape**
- Standalone components with `inject()`, signals for state, and the new control flow.
- One root-provided service per concern.
- Component prefix `app`; files are `name.component.ts` / `.html`, with styles as each step says.

**Commits:** each task's last step is "Commit". The loop has already checkpointed the step commits, so follow worker prompt rule 11.

**QC lists:** each task ends with a **"QC (for Shawn, in the browser)"** list of plain bullets. `chain.sh` collects them into the end-of-run checklist.

---

## Task 1: Local Supabase stack on Ralph (by hand)

Done by Shawn and Claude in interactive sessions (2026-10-23 to 2026-10-25). The loop never runs this task.

- [x] **Step 1: Start the stack.** `supabase start` in `~/projects/Campsites` on Ralph, from migrations `0001–0020`, on ports 54320–54329.
- [x] **Step 2: Write the secrets file.** `~/.secrets/campsites-supabase.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, `DATABASE_URL`).
- [x] **Step 3: Seed.** `./ralphloop/seed-dev.sh`: the dev admin, 4,900 campgrounds and 117 parks from the production backup, and the sample users Pat and Sam.
- [x] **Step 4: Local auth URLs.** `supabase/config.toml` points `site_url` and the reset redirect URLs at the review app (`http://192.168.1.188:4200`) and worker steps (`http://127.0.0.1:4201`).

---

## Task 2: Scaffold and app shell (spec 2), plus the About page (spec 9)

Read spec 2 in full, including **Changes from V1**, and spec 9's About section.

**Files:**
- Create: `package.json`, `package-lock.json`, `angular.json`, `tsconfig.json`, `tsconfig.app.json`, `.editorconfig`, `eslint.config.js`, `.prettierrc`
- Modify: `.gitignore` (keep every existing line; add Angular's)
- Create: `public/favicon.ico`, `src/index.html`, `src/main.ts`, `src/styles.scss`
- Create: `src/environments/environment.ts`
- Create: `src/app/app.ts`, `app.html`, `app.scss`, `app.config.ts`, `app.routes.ts`
- Create: `src/app/core/services/supabase.service.ts`, `user.service.ts`
- Create: `src/app/core/models/user.model.ts`
- Create: `src/app/core/guards/auth.guard.ts`, `admin.guard.ts`
- Create: `src/app/features/not-found/not-found.component.ts`
- Create: `src/app/features/about/about.component.ts`, `.html`, `.scss`
- Create: `src/app/features/placeholder/placeholder.component.ts` (temporary; later tasks replace each route that uses it)

**Interfaces (later tasks rely on these exact names):**
- `SupabaseService` (root):
  - `client: SupabaseClient`;
  - `session: Signal<Session | null>`;
  - `ready: Promise<void>`, resolved once the startup `getSession()` returns;
  - `isAuthenticated: boolean` (getter);
  - `onSignOut(reset: () => void): void`, which registers a per-user reset;
  - `signOut(): Promise<void>`, which calls `client.auth.signOut()` and then runs every registered reset.

  The resets also run on an `onAuthStateChange` `SIGNED_OUT` event. A reset must be safe to run twice.
- `UserService` (root):
  - `profile: Signal<UserProfile | null>`, where `UserProfile` is `{ id: string; displayName: string; role: 'user' | 'moderator' | 'admin' }`;
  - `loadProfile(): Promise<void>`, which reads the user's own `users` row (`id, display_name, role`) and sets `null` when signed out;
  - it registers `onSignOut(() => profile.set(null))`.

  It does **not** read or write `theme`. Task 4 adds the account methods.
- `authGuard`, `adminGuard`: functional `CanActivateFn`s. Both `await inject(SupabaseService).ready` first.
- `PlaceholderComponent` (`app-placeholder`): shows "Coming soon" in `rt-content`. It's only for routes whose pages aren't built yet.

- [ ] **Step 1: Generate the workspace and bring it into the repo.**
  ```bash
  cd /tmp && rm -rf scaffold && mkdir scaffold && cd scaffold
  npx --yes @angular/cli@22 new campsite-finder --skip-git --skip-tests --style=scss --ssr=false --routing --defaults --interactive=false
  ```
  - **Copy into the repo root:** `angular.json`, `package.json`, `tsconfig.json`, `tsconfig.app.json`, `.editorconfig`, `public/` and `src/`, all from `/tmp/scaffold/campsite-finder/`.
  - **Don't copy:** `README.md`, `.gitignore` or `node_modules`.
  - **Then `.gitignore`:** add Angular's entries to the repo's `.gitignore`, keeping every line already in it.
  - **Then the test tooling:** remove any test target, `tsconfig.spec.json` and test dependency the generator added. There are no tests in this project.
  - **Verify:** `git status --short` shows only the files listed above plus `.gitignore`; nothing under `supabase/` or `ralphloop/` changed.
- [ ] **Step 2: Install the dependencies.**
  - **Runtime:** `npm install primeng@^22.0.0 @primeuix/themes@^3.0.0 primeicons@^8.0.0 @supabase/supabase-js@^2.112.3 leaflet@^1.9.4 leaflet.markercluster@^1.5.3 @bluehalo/ngx-leaflet@^22.0.0 @bluehalo/ngx-leaflet-markercluster@^22.0.0 @angular/animations@^22 @angular/cdk@^22 @angular/cdk-experimental@^22`
  - **Dev:** `npm install -D @types/leaflet@^1.9.22 @types/leaflet.markercluster@^1.5.6 prettier@^3.8.1`
  - **Verify:**
    - `npx ng build` succeeds;
    - every `@angular/*` package in `package.json` has the same major version (22).
- [ ] **Step 3: Add lint.**
  - Run `npx ng add angular-eslint --skip-confirmation`.
  - Add a `.prettierrc` with `{ "singleQuote": true, "printWidth": 120 }`.
  - Add npm scripts: `"lint": "ng lint"` and `"build": "ng build"`. Keep `start` / `ng`.
  - **Verify:** `npx ng lint` reports no errors.
- [ ] **Step 4: Configure `angular.json`** (spec 2, **Project setup**):
  - project name `campsite-finder`, prefix `app`, SCSS;
  - `assets`: `{ "glob": "**/*", "input": "public" }` and `{ "glob": "*.png", "input": "node_modules/leaflet/dist/images", "output": "/" }`;
  - `styles`, in this order: `node_modules/leaflet/dist/leaflet.css`, `node_modules/leaflet.markercluster/dist/MarkerCluster.css`, `node_modules/leaflet.markercluster/dist/MarkerCluster.Default.css`, `src/styles.scss`;
  - production budgets: `initial` 500kB warning / 1MB error; `anyComponentStyle` 4kB warning / 8kB error;
  - `development`: `fileReplacements` `src/environments/environment.ts` → `src/environments/environment.local.ts`; `optimization: false`; `sourceMap: true`;
  - `build` defaults to `production`, `serve` to `development`.
- [ ] **Step 5: Write the environments.**
  - `src/environments/environment.ts`, exactly:
    ```ts
    export const environment = { production: true, supabaseUrl: '', supabaseAnonKey: '' };
    ```
  - Write `environment.local.ts` with the Global Constraints command.
  - **Verify:**
    - `git status --short` doesn't list `environment.local.ts`;
    - `git check-ignore src/environments/environment.local.ts` prints the path.
- [ ] **Step 6: Write `src/index.html`.**
  - `lang="en"`, `<meta charset="utf-8">`, `<title>Campsite Finder</title>`, `<base href="/">`, the viewport meta, and `<link rel="icon" type="image/x-icon" href="favicon.ico">`;
  - preconnects to `https://fonts.googleapis.com` and `https://fonts.gstatic.com` (crossorigin);
  - the stylesheet `https://fonts.googleapis.com/css2?family=Yellowtail&family=Alfa+Slab+One&family=Work+Sans:wght@400;500;600;700&display=swap`;
  - `<body><app-root></app-root></body>`.
- [ ] **Step 7: Write `src/styles.scss`, verbatim** (V1's global stylesheet; it imports `primeicons`):
  ```scss
@import "primeicons/primeicons.css";

/* '50s road-trip design tokens — see docs/design/Campsite01/README.md */
:root {
  --rt-paper: #f3e9d2;
  --rt-card: #fbf4e4;
  --rt-cream: #fff6e3;
  --rt-ink: #2b2522;
  --rt-teal: #2f8f8a;
  --rt-cherry: #c63a2f;
  --rt-cherry-dark: #9e2a21;
  --rt-mustard: #e8a93a;
  --rt-mustard-dark: #d4952a;
  --rt-sand: #e7dcc2;

  --rt-script: 'Yellowtail', cursive;
  --rt-display: 'Alfa Slab One', serif;
  --rt-body: 'Work Sans', system-ui, sans-serif;
}

html,
body {
  margin: 0;
  height: 100%;
}

body {
  background: var(--rt-paper);
  color: var(--rt-ink);
  font-family: var(--rt-body);
  font-size: 15px;
  line-height: 1.5;
}

a {
  color: var(--rt-cherry);
}

a:hover {
  color: var(--rt-cherry-dark);
}

:focus-visible {
  outline: 3px solid var(--rt-mustard);
  outline-offset: 2px;
}

.leaflet-container {
  font: inherit;
}

/* ---------- Type ---------- */

.rt-title {
  margin: 0;
  font-family: var(--rt-display);
  font-weight: 400;
  font-size: 40px;
  line-height: 1;
  color: var(--rt-cherry);
}

.rt-list-title {
  margin: 0;
  font-family: var(--rt-display);
  font-weight: 400;
  font-size: 30px;
  line-height: 1.1;
  color: var(--rt-cherry);
}

.rt-heading {
  margin: 0;
  font-family: var(--rt-display);
  font-weight: 400;
  font-size: 18px;
}

.rt-label {
  font-family: var(--rt-display);
  font-size: 14px;
  letter-spacing: 0.04em;
}

.rt-notice {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--rt-teal);
}

.rt-error {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--rt-cherry);
}

/* ---------- Buttons ---------- */

.rt-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  line-height: 1.3;
  padding: 8px 18px;
  border-radius: 999px;
  border: 2px solid var(--rt-ink);
  background: var(--rt-cream);
  color: var(--rt-ink);
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
  transition: background-color 0.1s;

  &:hover {
    color: var(--rt-ink);
    background: #f0e5cc;
  }

  &:active:not(:disabled) {
    transform: translate(2px, 2px);
    box-shadow: none;
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}

.rt-btn--shadow {
  box-shadow: 2px 2px 0 var(--rt-ink);
}

.rt-btn--sm {
  font-size: 13px;
  padding: 6px 14px;
}

.rt-btn--cherry {
  background: var(--rt-cherry);
  color: var(--rt-cream);

  &:hover:not(:disabled) {
    background: var(--rt-cherry-dark);
    color: var(--rt-cream);
  }
}

.rt-btn--mustard {
  background: var(--rt-mustard);
  color: var(--rt-ink);

  &:hover:not(:disabled) {
    background: var(--rt-mustard-dark);
  }
}

.rt-btn--danger-outline {
  border-color: var(--rt-cherry);
  background: transparent;
  color: var(--rt-cherry);

  &:hover:not(:disabled) {
    background: rgba(198, 58, 47, 0.08);
    color: var(--rt-cherry-dark);
  }
}

/* Borderless text buttons (admin row actions, location controls) */
.rt-text-btn {
  font: inherit;
  font-weight: 700;
  font-size: 13px;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  color: var(--rt-ink);

  &:hover {
    text-decoration: underline;
  }
}

.rt-text-btn--teal {
  color: var(--rt-teal);
}

.rt-text-btn--cherry {
  color: var(--rt-cherry);
}

/* 40px round icon buttons (favorite heart, add-to-trip plus) */
.rt-icon-btn {
  width: 40px;
  height: 40px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 2px solid var(--rt-ink);
  border-radius: 50%;
  background: var(--rt-cream);
  color: var(--rt-ink);
  cursor: pointer;

  &:hover {
    background: #f0e5cc;
  }

  &.is-active {
    background: var(--rt-ink);
    color: var(--rt-cream);
  }
}

/* ---------- Inputs ---------- */

.rt-input {
  min-width: 0;
  box-sizing: border-box;
  font: inherit;
  font-size: 15px;
  padding: 9px 14px;
  border: 2px solid var(--rt-ink);
  border-radius: 10px;
  background: var(--rt-cream);
  color: var(--rt-ink);

  &::placeholder {
    color: rgba(43, 37, 34, 0.55);
  }
}

.rt-input--sm {
  font-size: 14px;
  padding: 7px 12px;
}

select.rt-input {
  font-size: 14px;
  font-weight: 600;
}

/* ---------- Cards & panels ---------- */

.rt-page-card {
  border: 3px solid var(--rt-ink);
  border-radius: 16px;
  background: var(--rt-card);
  box-shadow: 5px 5px 0 var(--rt-ink);
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rt-message {
  border: 2px solid var(--rt-ink);
  border-radius: 14px;
  background: var(--rt-cream);
  padding: 12px 16px;
  font-size: 15px;
}

.rt-message--error {
  border-color: var(--rt-cherry);
  color: var(--rt-cherry);
  font-weight: 600;
}

.rt-dashed-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 2px dashed var(--rt-ink);
  border-radius: 14px;
  background: var(--rt-cream);
}

.rt-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
}

.rt-tag--teal {
  background: var(--rt-teal);
  color: var(--rt-cream);
}

.rt-tag--outline {
  border: 1.5px solid var(--rt-ink);
}

/* ---------- Page scaffolds ---------- */

/* Scrolling content page (Trips, Account, Admin) */
.rt-content {
  padding: 40px 32px;
  box-sizing: border-box;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Map + list page (Finder body, Favorites, Trip detail) */
.rt-map-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(380px, 500px);
  gap: 24px;
  padding: 24px 32px 32px;
  box-sizing: border-box;
}

.rt-map-frame {
  border: 4px solid var(--rt-ink);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 6px 6px 0 var(--rt-ink);
  min-height: 0;
}

.rt-side {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 14px;
}

.rt-scroll-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 2px 8px 8px 2px;
}

@media (max-width: 900px) {
  .rt-map-layout {
    flex: none;
    grid-template-columns: minmax(0, 1fr);
    padding: 16px;
  }

  .rt-map-frame {
    height: 45vh;
  }

  .rt-scroll-list {
    overflow: visible;
  }

  .rt-content {
    padding: 24px 16px;
  }
}

/* ---------- Data tables (admin) ---------- */

.rt-table-card {
  border: 3px solid var(--rt-ink);
  border-radius: 16px;
  background: var(--rt-card);
  overflow: auto;
}

.rt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;

  th {
    background: var(--rt-ink);
    color: var(--rt-cream);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: left;
    padding: 12px 18px;
  }

  td {
    padding: 12px 18px;
    border-top: 2px dashed var(--rt-ink);
    vertical-align: middle;
  }

  tfoot td {
    border-top: 3px solid var(--rt-ink);
    background: var(--rt-cream);
  }

  .rt-input {
    width: 100%;
    font-size: 14px;
    padding: 7px 10px;
    border-radius: 8px;
    background: var(--rt-card);
  }
}

.rt-row-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  white-space: nowrap;
}

/* ---------- PrimeNG restyles (multiselect, select, autocomplete) ---------- */

.p-multiselect,
.p-select,
.p-autocomplete .p-autocomplete-input {
  font-family: var(--rt-body);
  border: 2px solid var(--rt-ink) !important;
  border-radius: 10px !important;
  background: var(--rt-cream) !important;
  color: var(--rt-ink);
  box-shadow: none !important;
}

.p-multiselect-label,
.p-select-label {
  color: var(--rt-ink) !important;
  font-size: 14px;
  font-weight: 600;
  padding: 6px 4px 6px 14px !important;
}

.p-multiselect-label.p-placeholder,
.p-select-label.p-placeholder {
  color: var(--rt-ink) !important;
}

.p-multiselect-dropdown,
.p-select-dropdown {
  color: var(--rt-ink) !important;
}

.p-autocomplete .p-autocomplete-input {
  font-size: 15px;
  padding: 9px 14px;
}

.p-multiselect-overlay,
.p-select-overlay,
.p-autocomplete-overlay {
  border: 2px solid var(--rt-ink) !important;
  border-radius: 10px !important;
  background: var(--rt-cream) !important;
  box-shadow: 3px 3px 0 var(--rt-ink) !important;
  font-family: var(--rt-body);
}

.p-multiselect-option.p-multiselect-option-selected,
.p-select-option.p-select-option-selected {
  background: var(--rt-sand) !important;
  color: var(--rt-ink) !important;
}

.p-checkbox-checked .p-checkbox-box {
  background: var(--rt-teal) !important;
  border-color: var(--rt-teal) !important;
}

/* ---------- Leaflet ---------- */

.trip-stop-marker {
  background: var(--rt-cherry);
  color: var(--rt-cream);
  border: 2px solid var(--rt-ink);
  box-sizing: border-box;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
}

.view-details-button {
  display: block;
  margin: 0.35rem 0;
  padding: 0;
  border: none;
  background: none;
  color: #2563eb;
  font-weight: 600;
  cursor: pointer;
}

.view-details-button:hover {
  text-decoration: underline;
}

.current-location-marker {
  background: #2563eb;
  border: 3px solid #fff;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.4);
}
  ```
- [ ] **Step 8: Write the core services and model** (Interfaces above; spec 2, **Session and the signed-in user** and **Changes from V1**, #1 and #4).
  - **`SupabaseService`:**
    - `createClient(environment.supabaseUrl, environment.supabaseAnonKey)`;
    - in the constructor, start `client.auth.getSession()`, set `session`, then resolve `ready`;
    - subscribe to `onAuthStateChange`, keeping `session` in step. On a `SIGNED_OUT` event, run the resets.
  - **`UserService`,** as in Interfaces.
  - **Verify:** lint and build.
- [ ] **Step 9: Write the guards** (spec 2, **Routes and guards**, and **Changes from V1**, #1).
  - **`authGuard`:** `await supabase.ready`. If there's a session, allow; otherwise return `router.parseUrl('/login')`. (Task 3 adds `returnUrl`.)
  - **`adminGuard`:**
    1. `await supabase.ready`. No session → `/login`.
    2. If `userService.profile()` is null, `await userService.loadProfile()`.
    3. `role === 'admin'` → allow; otherwise → `/`.
- [ ] **Step 10: Write `app.config.ts` and `main.ts`.**
  - **Providers:** `provideZoneChangeDetection({ eventCoalescing: true })`, `provideRouter(routes)`, `provideAnimationsAsync()`, and `providePrimeNG({ theme: { preset: Aura }, license: 'eyJpZCI6ImVhYWFjMzJhLWZkMDMtNDg3ZC04ZDc2LTk5NjEyMWE0YTZhZCIsInByb2R1Y3QiOiJwcmltZXVpIiwidGllciI6ImNvbW11bml0eSIsInR5cGUiOiJkZXYiLCJpYXQiOjE3ODY5MTgxMDIsImV4cCI6MTgxODQ1NDEwMn0.88HB7YEVupCudlmHZqsUboqAM8zFUvmTATmlLJcK3s637mD0fYpaSrgqXaTjzWzyLXz0gptt4nZbqi2l9FF8Bg' })`. Aura comes from `@primeuix/themes/aura`; the license string is V1's PrimeUI community license, committed by Shawn's decision (spec 2, **Decided**).
  - **`main.ts`:** `bootstrapApplication(App, appConfig)`. Keep the default `zone.js` polyfill.
- [ ] **Step 11: Write the root component and the nav** (spec 2, **Nav bar**). Use these class names; `app.scss` styles them.
  - **Template:**
    - `<nav class="app-nav">`, containing:
      - `<a class="wordmark" routerLink="/">Campsite Finder</a>`;
      - `<div class="nav-main">` with four `<a class="nav-link">` links: Finder (`/`, `routerLinkActive="active"` with `{ exact: true }`), Favorites, Trips, About Us. Each has `routerLinkActive="active"`.
      - `<div class="nav-user">`:
        - **signed in:** `<a class="nav-pill">` Account; Admin, only when `profile()?.role === 'admin'`; then `<button type="button" class="rt-btn rt-btn--mustard rt-btn--shadow sign-out-button">Sign out</button>`, which calls `supabase.signOut()`;
        - **signed out:** `<a class="nav-pill" routerLink="/login">Sign in</a>`.
    - Then `<main class="app-main"><router-outlet /></main>`.
  - **Behavior:** an `effect` loads the profile whenever `session()` becomes non-null.
  - **`app.scss`, verbatim:**
    ```scss
:host {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-nav {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 24px;
  min-width: 0;
  min-height: 76px;
  padding: 12px 32px;
  box-sizing: border-box;
  background: var(--rt-teal);
  border-bottom: 4px solid var(--rt-ink);
}

.wordmark {
  font-family: var(--rt-script);
  font-size: 40px;
  line-height: 1;
  color: var(--rt-cream);
  text-shadow: 3px 3px 0 var(--rt-cherry);
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    color: var(--rt-cream);
  }
}

.nav-main {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.nav-link {
  padding: 8px 16px;
  border-radius: 999px;
  color: var(--rt-cream);
  font-weight: 700;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    color: var(--rt-cream);
    background: rgba(255, 246, 227, 0.15);
  }

  &.active {
    background: var(--rt-cream);
    color: var(--rt-ink);
  }
}

.nav-user {
  margin-left: auto;
  display: flex;
  gap: 10px;
  align-items: center;
}

.nav-pill {
  padding: 6px 16px;
  border: 2px solid var(--rt-cream);
  border-radius: 999px;
  color: var(--rt-cream);
  font-weight: 700;
  font-size: 14px;
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    color: var(--rt-cream);
    background: rgba(255, 246, 227, 0.15);
  }

  &.active {
    background: var(--rt-cream);
    color: var(--rt-ink);
  }
}

.app-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

@media (max-width: 900px) {
  .app-nav {
    padding: 12px 16px;
  }

  .wordmark {
    font-size: 34px;
  }
}
    ```
- [ ] **Step 12: Write the routes, the 404 page, the placeholder and the About page.**
  - **`app.routes.ts`:** the table in spec 2, **Routes and guards**, every route lazy (`loadComponent`).
    - The Finder, favorites, trips, trips/:id, account, admin, login, signup, forgot-password and reset-password routes point at `PlaceholderComponent` for now, with their guards already in place.
    - `about` → `AboutComponent`.
    - `**` → `NotFoundComponent`.
  - **`NotFoundComponent`:** spec 2, **Changes from V1**, #3. Inside `rt-content`, an `rt-page-card` with an `rt-title` "Page not found", the line "That page isn't on the map.", and `<a class="rt-btn rt-btn--cherry" routerLink="/">Back to the Finder</a>`.
  - **`AboutComponent`** (spec 9):
    - `<section class="about-hero">`: a `<div class="eyebrow">` "Campsite Finder", `<h1>` "About Us", and `<p class="tagline">` "Because it sounded fun.";
    - then `<section class="contact"><p>`: "Questions, bugs, or ideas? Reach the admin at " + a `mailto:` link to `shawnpfarmer@gmail.com` (`adminEmail` field) + ".".
    - **`about.component.scss`, verbatim:**
      ```scss
:host {
  display: block;
}

.about-hero {
  background: var(--rt-cherry);
  border-bottom: 4px solid var(--rt-ink);
  padding: 88px 32px 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;

  h1 {
    margin: 0;
    font-family: var(--rt-script);
    font-weight: 400;
    font-size: clamp(64px, 14vw, 120px);
    line-height: 1;
    color: var(--rt-cream);
    text-shadow: 5px 5px 0 var(--rt-ink);
  }
}

.eyebrow {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--rt-cream);
}

.tagline {
  margin: 0;
  font-family: var(--rt-display);
  font-size: clamp(20px, 4vw, 28px);
  color: var(--rt-ink);
  background: var(--rt-mustard);
  border: 3px solid var(--rt-ink);
  border-radius: 999px;
  padding: 10px 28px;
  box-shadow: 4px 4px 0 var(--rt-ink);
}

.contact {
  padding: 48px 32px;
  display: flex;
  justify-content: center;

  p {
    margin: 0;
    max-width: 640px;
    font-size: 18px;
    line-height: 1.6;
    text-align: center;
  }
}
      ```
- [ ] **Step 13: Verify.**
  1. `npx ng lint` and `npx ng build` are clean; `test -f dist/campsite-finder/browser/index.html`.
  2. Write `environment.local.ts`.
  3. Run `npx ng serve --port 4201` in the background, wait for "Application bundle generation complete", then check:
     - `curl -s http://127.0.0.1:4201/ | grep -c '<app-root'` prints `1`;
     - `curl -s http://127.0.0.1:4201/about` returns the same index (it's an SPA).
  4. Stop the server.
  5. `grep -rn "supabase.co\|eyJhbGci" src/environments/environment.ts` finds nothing.
  6. Re-read spec 2: every item under **Routes and guards**, **Session**, **Nav bar** and **Changes from V1** #1, #3, #4 and #5 is done. List any gap in `activity.md`.
- [ ] **Step 14: Commit.**
  ```bash
  git add package.json package-lock.json angular.json tsconfig.json tsconfig.app.json .editorconfig eslint.config.js .prettierrc .gitignore public src
  git commit -m "Task 2: Angular scaffold and app shell (nav, routes, guards, session), About and 404 pages"
  ```

**QC (for Shawn, in the browser):** open http://192.168.1.188:4200 (run `./ralphloop/review.sh` on Ralph first if the chain didn't).
- The tab says "Campsite Finder". The teal nav shows the script wordmark, the Finder / Favorites / Trips / About Us pills, and "Sign in" on the right.
- About Us matches V1's About page: the cherry hero, the mustard tagline pill, and your email link.
- `/no-such-page` shows "Page not found" with "Back to the Finder".
- Favorites, Trips and Sign in show "Coming soon" for now. Favorites and Trips go there through the sign-in redirect.

---

## Task 3: Auth pages (spec 4)

Read spec 4 in full, including **Proposed changes from V1** (approved).

**Files:**
- Create: `src/app/features/auth/auth.scss`
- Create: `login.component.ts/.html`, `signup.component.ts/.html`, `forgot-password.component.ts/.html`, `reset-password.component.ts/.html` (in `src/app/features/auth/`)
- Create: `src/app/core/guards/guest.guard.ts`
- Modify: `src/app/core/guards/auth.guard.ts`, `admin.guard.ts`, `src/app/app.routes.ts`

**Interfaces:**
- `guestGuard`: awaits `ready`; signed in → `/`.
- Login reads the `returnUrl` and `reset` query parameters.

- [ ] **Step 1: Write `auth.scss`, verbatim.** Every auth page uses it with `styleUrl: './auth.scss'`.
  ```scss
.auth-page {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 64px 32px;
}

.auth-card {
  width: 100%;
  max-width: 420px;
  border: 3px solid var(--rt-ink);
  border-radius: 18px;
  background: var(--rt-card);
  box-shadow: 6px 6px 0 var(--rt-ink);
  overflow: hidden;
}

.auth-header {
  background: var(--rt-teal);
  border-bottom: 3px solid var(--rt-ink);
  padding: 20px 24px;

  h1 {
    margin: 0;
    font-family: var(--rt-script);
    font-weight: 400;
    font-size: 44px;
    line-height: 1;
    color: var(--rt-cream);
    text-shadow: 3px 3px 0 var(--rt-cherry);
  }
}

.auth-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.auth-submit {
  font-size: 15px;
  padding: 11px 18px;
  box-shadow: 3px 3px 0 var(--rt-ink);
}

.auth-help {
  margin: 0;
  font-size: 14px;
}

.auth-forgot {
  align-self: flex-end;
  margin-top: -4px;
  font-size: 13px;
  font-weight: 600;
}

.auth-switch {
  font-size: 14px;
  font-weight: 600;
}

@media (max-width: 900px) {
  .auth-page {
    padding: 32px 16px;
  }
}
  ```
  **Page structure** (each page):
  ```html
  <div class="auth-page"><form class="auth-card" (ngSubmit)="…"><div class="auth-header"><h1>…</h1></div><div class="auth-body">…</div></form></div>
  ```
  - inputs are `rt-input`;
  - the submit button is `rt-btn rt-btn--cherry auth-submit`;
  - messages are `rt-notice` / `rt-error`;
  - links are `auth-switch`, with `auth-forgot` for "Forgot password?";
  - help text is `auth-help`.
- [ ] **Step 2: Sign in.** Spec 4, **Sign in**, plus changes #1 and #5.
  - Every sign-out goes through `SupabaseService.signOut()`.
  - After success, go to `returnUrl` only if it starts with `/` but not `//`; otherwise go to `/`.
- [ ] **Step 3: Sign up.** Spec 4, **Sign up**, plus changes #3 and #4. The display name is trimmed. If `signUp` returns a session, go to `/`; otherwise show the check-your-email notice.
- [ ] **Step 4: Forgot password and reset password,** exactly as spec 4 describes them, with the exact texts. Reset's sign-outs go through `SupabaseService.signOut()`.
- [ ] **Step 5: Guards and routes** (change #1 and #2).
  - **`authGuard` and `adminGuard`:** send signed-out users to `router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })`.
  - **`guestGuard`** on `login` and `signup`.
  - **Routes:** point the four auth routes at the real components.
- [ ] **Step 6: Verify.**
  1. Lint and build.
  2. Check the dev logins against the local Auth API:
     - `curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $SUPABASE_ANON_KEY" -H 'Content-Type: application/json' -d '{"email":"pat@campsites.test","password":"campsites-pat"}' | grep -c access_token` prints `1`;
     - Sam's `users.suspended` is `t`: `psql "$DATABASE_URL" -Atc "select suspended from public.users join auth.users using (id) where email='sam@campsites.test'"`.
  3. Re-read spec 4 and list any gap in `activity.md`.
- [ ] **Step 7: Commit.** `git commit -m "Task 3: sign in, sign up, forgot and reset password"`

**QC (for Shawn, in the browser):**
- Sign in as Pat. Favorites still says "Coming soon", but you're signed in: Account appears in the nav and Sign out works.
- Sign in as Sam: "This account has been suspended."
- Signed out, open http://192.168.1.188:4200/trips: you're sent to sign in, then back to `/trips` afterwards.
- Signed in, `/login` sends you to the Finder.
- Forgot password with your own test address: the notice appears. The email lands in Mailpit at http://192.168.1.188:54324, and its link opens the "New Password" page.

---

## Task 4: Account page (spec 5)

Read spec 5.

**Files:**
- Create: `src/app/features/account/account.component.ts`, `.html`
- Modify: `src/app/core/services/user.service.ts`, `src/app/app.routes.ts`

**Interfaces:** `UserService` gains:
- `updateDisplayName(name: string): Promise<void>`: updates the `users` row and the auth metadata, then the signal;
- `updatePassword(password: string): Promise<void>`;
- `deleteAccount(): Promise<void>`: the `delete-account` edge function, then `SupabaseService.signOut()`.

- [ ] **Step 1: `UserService` account methods,** as in Interfaces (spec 2, **Session**). No theme methods.
- [ ] **Step 2: The Account page.** Spec 5: the display name card, the password card and the delete card with its confirm step, with the exact texts, plus change #1 (the last-admin hint). There is **no** Theme card.
  - **Structure:**
    - `<div class="rt-content">` with `<h1 class="rt-title">Account</h1>`;
    - each card is `rt-page-card` with an `rt-heading`;
    - the buttons are `card-action`;
    - the password inputs sit in `password-row`;
    - the delete card is `rt-page-card danger-zone`, with `confirm-text` and `confirm-actions`.
  - **Inline `styles`, verbatim from V1, minus the theme toggle's rules** (`.theme-row`, `.theme-toggle`, `.track`, `.track.is-on` and `.knob`; already removed below):
    ```scss
.rt-content {
  max-width: 720px;
  gap: 20px;
}
.card-action {
  align-self: flex-start;
}
.password-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}
.danger-zone {
  border-color: var(--rt-cherry);
  box-shadow: none;
}
.danger-zone .rt-heading {
  color: var(--rt-cherry);
}
.confirm-text {
  margin: 0;
}
.confirm-actions {
  display: flex;
  gap: 8px;
}
    ```
- [ ] **Step 3: Route.** Point `account` at `AccountComponent` (`authGuard`).
- [ ] **Step 4: Verify.**
  - Lint and build.
  - `grep -n "theme" src/app/features/account src/app/core/services/user.service.ts -r` finds nothing.
  - Re-read spec 5.
- [ ] **Step 5: Commit.** `git commit -m "Task 4: account page (display name, password, delete account)"`

**QC (for Shawn, in the browser):**
- As Pat, change the display name: "Display name updated." It survives a refresh.
- Mismatched passwords: "Passwords do not match."
- No Dark mode card.
- Delete as the admin (the only active admin): the delete fails with the "only admin" hint.

---

## Task 5: Campground data and the shared pieces (spec 3: Data, Shared pieces, Changes 1–4)

Read spec 3 in full. This task builds the services and the five shared components the Finder, Favorites and Trips use. No page uses them until Task 6.

**Files:**
- Create: `src/app/core/models/campground.model.ts`, `trip.model.ts`
- Create: `src/app/core/services/campgrounds.service.ts`, `favorites.service.ts`, `trips.service.ts`
- Create: in `src/app/shared/ui/`: `campground-map/campground-map.component.ts` + `.scss`; `campground-table/campground-table.component.ts`; `campground-detail-panel/campground-detail-panel.component.ts`; `favorite-toggle/favorite-toggle.component.ts`; `add-to-trip/add-to-trip.component.ts`
- Modify: `src/app/app.ts` (load favorites with the profile)

**Interfaces:**
- **`Campground`:** `{ id, parkCode: string | null, name, description, lat, lng, agency, state: string | null, amenities: Record<string, unknown>, fees: unknown[], reservationUrl, directionsUrl, images: unknown[], contact: unknown, distanceMeters: number }`.
- **`Coordinates`:** `{ lat: number; lng: number }`, exported from `campgrounds.service.ts`.
- **`Trip`:** `{ id, name, createdAt }`. **`TripStop`:** `{ stopId, campground: Campground }`.
- **`CampgroundsService`:**
  - `getNearest(coords, agencies: string[], maxDistanceMeters: number, states?: string[], parks?: string[]): Promise<Campground[]>`, which **does not send `result_limit`** (spec 3, Changes #8) and pages with `.range()` 1,000 at a time;
  - `getByIds(ids, agencies?)`, `getParkCodes()`, `getParkNames()`, `searchByName(query)`.
- **`FavoritesService`:**
  - `favoriteIds: Signal<Set<string>>`, `favoriteNotes: Signal<Map<string, string | null>>`;
  - `loadFavoriteIds()`, `toggleFavorite(id)`, `updateNote(id, note)`, as spec 3 describes;
  - registers an `onSignOut` reset that clears both signals.
- **`TripsService`:** the methods in spec 7's TripsService table. `reorderStops` calls `rpc('reorder_trip_stops', { p_trip_id, p_stop_ids })`. `createTrip` deletes the new trip if inserting its stops fails (spec 7, change #9). It registers an `onSignOut` reset that clears `trips`.
- **Components:** the inputs and outputs in spec 3, **Shared pieces**, with these selectors: `app-campground-map`, `app-campground-table`, `app-campground-detail-panel`, `app-favorite-toggle`, `app-add-to-trip`.

- [ ] **Step 1: Models and `CampgroundsService`** (spec 3, **Data it uses**, and spec 1's RPCs). `searchByName` escapes `%` and `_` before `ilike` (spec 8, change #4).
- [ ] **Step 2: `FavoritesService` and `TripsService`,** as in Interfaces. In `app.ts`, the session effect also calls `favorites.loadFavoriteIds()` (spec 3, change #1).
- [ ] **Step 3: `app-campground-detail-panel`** (spec 3: the expanded detail; the description is rendered with `[innerHTML]`).
  - **Structure:**
    - `<div class="campground-detail-panel">` with `<div class="description" [innerHTML]>`;
    - `<div class="links">` with Reserve (`rt-btn rt-btn--cherry rt-btn--shadow`) and Directions (`rt-btn`), both `target="_blank" rel="noopener"`.
  - **Inline styles, verbatim:**
    ```scss
.campground-detail-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  cursor: default;
}

.description {
  font-size: 15px;
  line-height: 1.5;
  text-wrap: pretty;
  overflow-wrap: anywhere;
}

.description :first-child {
  margin-top: 0;
}

.description :last-child {
  margin-bottom: 0;
}

.links {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
    ```
- [ ] **Step 4: `app-favorite-toggle`** (spec 3, plus change #1: the heart only reads `favoriteIds`).
  - It renders only when signed in, as `<button class="rt-icon-btn favorite-button">` with the heart SVG (24×24 viewBox, path `M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z`, `fill` set to `currentColor` when favorited, otherwise `none`, stroke-width 2).
  - Clicking calls `stopPropagation()`.
  - **Inline styles, verbatim:**
    ```scss
.favorite-button {
  color: var(--rt-cherry);
}
    ```
- [ ] **Step 5: `app-add-to-trip`** (spec 3, with its exact texts).
  - **Structure:**
    - `<div class="add-to-trip-panel">` with `<div class="rt-label">ADD TO TRIP</div>`;
    - `<div class="trip-options">` of `rt-btn rt-btn--sm trip-option` buttons;
    - `<div class="add-to-trip-new">` with an `rt-input rt-input--sm` and a "Create &amp; Add" `rt-btn rt-btn--sm rt-btn--cherry`;
    - an `rt-error`.
  - **Inline styles, verbatim:**
    ```scss
.add-to-trip-panel {
  margin: 0 14px 14px;
  padding: 12px;
  border: 2px dashed var(--rt-ink);
  border-radius: 12px;
  background: var(--rt-cream);
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: default;
}
.rt-label {
  font-size: 13px;
}
.trip-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.trip-option:disabled {
  background: var(--rt-sand);
  opacity: 1;
}
.add-to-trip-new {
  display: flex;
  gap: 8px;
}
.add-to-trip-new .rt-input {
  flex: 1;
  background: var(--rt-card);
}
    ```
- [ ] **Step 6: `app-campground-table`,** virtual-scrolled (spec 3, **Campground card list**, plus change #2).
  - **The viewport:** `<cdk-virtual-scroll-viewport autosize class="rt-scroll-list">`, using `ScrollingModule` from `@angular/cdk/scrolling` and `CdkAutoSizeVirtualScroll` from `@angular/cdk-experimental/scrolling`, with `*cdkVirtualFor` over the campgrounds (`trackBy` id). The viewport must fill the side column (flex: 1; min-height: 0).
  - **A selection from outside** expands that card and calls `viewport.scrollToIndex(index, 'smooth')`.
  - **Card structure:**
    - `<div class="campground-card" [class.is-open]>`, containing `<div class="card-main">`, which holds, in order:
      - in plan mode, `button.plan-check` (`is-checked`), with the check SVG `M20 6 9 17l-5-5`;
      - with distances on, `div.distance-badge` with `span.badge-top` and `span.badge-sub` "MI";
      - `div.card-text` with `div.campground-name-link` and `div.tags` (agency `rt-tag rt-tag--teal`, park code `rt-tag rt-tag--outline`);
      - `<app-favorite-toggle>`;
      - when signed in, `button.rt-icon-btn.add-to-trip-toggle` (`is-active`), with the plus SVG `M5 12h14` + `M12 5v14`.
    - Then, as they apply:
      - `<app-add-to-trip>`;
      - in notes mode, `div.note-row > input.note-input` ("Add a note");
      - the expanded detail, `div.detail` (`indented` when distances are on), containing `<app-campground-detail-panel>`.
  - **Inline styles, verbatim** (the `:host` block keeps the list filling its column):
    ```scss
:host {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.campground-card {
  flex: none;
  border: 2px solid var(--rt-ink);
  border-radius: 14px;
  background: var(--rt-card);
  box-shadow: 3px 3px 0 var(--rt-ink);
}
.campground-card.is-open {
  background: var(--rt-cream);
}
.card-main {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 12px 14px;
  cursor: pointer;
}
.distance-badge {
  width: 58px;
  height: 58px;
  flex: none;
  box-sizing: border-box;
  border-radius: 50%;
  background: var(--rt-mustard);
  border: 2px solid var(--rt-ink);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
  gap: 2px;
}
.badge-top {
  font-family: var(--rt-display);
  font-size: 16px;
}
.badge-sub {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
}
.card-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.campground-name-link {
  font-weight: 700;
  font-size: 17px;
  line-height: 1.3;
}
.tags {
  display: flex;
  gap: 6px;
}
.plan-check {
  width: 28px;
  height: 28px;
  flex: none;
  padding: 0;
  border: 2px solid var(--rt-ink);
  border-radius: 8px;
  background: var(--rt-cream);
  color: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.plan-check.is-checked {
  background: var(--rt-teal);
  color: var(--rt-cream);
}
.note-row {
  padding: 0 14px 12px;
}
.note-input {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  font-size: 14px;
  padding: 7px 12px;
  border: none;
  border-bottom: 2px dotted var(--rt-ink);
  background: transparent;
  color: var(--rt-ink);
}
.detail {
  padding: 2px 14px 16px;
}
.detail.indented {
  padding-left: 86px;
}
@media (max-width: 900px) {
  .detail.indented {
    padding-left: 14px;
  }
}
    ```
    The viewport takes the `rt-scroll-list` class. If the virtual viewport needs `display:block` or a height rule, add it under `:host` in this block, and say so in `activity.md`.
- [ ] **Step 7: `app-campground-map`** (spec 3, **Campground map**, plus changes #3 and #4).
  - **Markers:** Leaflet's default icons use `imagePath = ''` with `marker-icon.png`, `marker-icon-2x.png` and `marker-shadow.png`. The marker cluster gets `{ chunkedLoading: true }`.
  - **Popup buttons** are plain DOM with class `view-details-button`.
  - **The new popup action "Add to trip…"** (signed in only) emits a new output, `addToTrip(id)`. The list's parent uses it to select that card and open its add-to-trip panel. Add a matching input to `app-campground-table`: `openPickerFor: string | null`, which opens that card's panel.
  - **Map size:** a `ResizeObserver` calls `invalidateSize()`.
  - **`campground-map.component.scss`, verbatim:**
    ```scss
:host {
  display: block;
  height: 100%;
}

.campground-map {
  height: 100%;
  min-height: 300px;
  width: 100%;
}
    ```
- [ ] **Step 8: Verify.**
  - Lint and build. The production build stays under the 1 MB initial-budget error; it may warn.
  - Paging check against the local RPC: `curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/nearest_campgrounds" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" -H 'Content-Type: application/json' -H 'Range: 0-999' -d '{"user_lat":39.8,"user_lng":-98.6,"max_distance_m":20038000}' | grep -o '"id"' | wc -l` prints `1000`. That proves the 1,000-row cap that paging handles.
  - Re-read spec 3's **Shared pieces** and Changes #1–#4.
- [ ] **Step 9: Commit.** `git commit -m "Task 5: campground, favorites and trips services; shared map, card list, detail panel, heart and add-to-trip"`

**QC (for Shawn, in the browser):** nothing new to see yet. These pieces first appear on the Finder (Task 6).

---

## Task 6: The Finder page (spec 3)

Read spec 3 in full: the page, the filter bar, how a search runs, the location messages, saved state, and Changes #5–#8.

**Files:**
- Create: `src/app/core/services/geolocation.service.ts`, `finder-state.service.ts`
- Create: `src/app/features/finder/finder.component.ts`, `.html`, `.scss`
- Modify: `src/app/app.routes.ts` (`''` → `FinderComponent`)

**Interfaces:**
- **`GeolocationService`:** `getCurrentPosition(): Promise<Coordinates>` (10s timeout, spec 3's exact messages) and `checkPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'>`.
- **`FinderStateService`:** `snapshot(): FinderSnapshot | null` and `save(snapshot)`, with key `campsite-finder.finder` in `sessionStorage` and the validation in spec 3.
  - `FinderSnapshot` is `{ location: Coordinates; agencies: string[]; states: string[]; regions: string[]; parks: string[] | null; nearMeEnabled: boolean; radiusMiles: number }`.

- [ ] **Step 1: `GeolocationService` and `FinderStateService`,** exactly as spec 3 describes, including every message text and validation rule.
- [ ] **Step 2: The Finder's logic** (spec 3, **How a search runs** and **Saved state**).
  - **Constants:** 1609.34 m per mile; "Show all" is 20,038,000 m; the five agencies; radius choices `[null, 25, 50, 100, 250]`; the region→state table.
  - **Change #5:** a `loading` state for the first load only, and an `updating` signal for reloads.
  - **Change #7:** the single **Where** picker.
- [ ] **Step 3: The Finder's template.** Class structure:
  - **Filter bar:** `div.filter-bar` holds `div.filter-group` blocks:
    - the agency group: `span.rt-label` "AGENCY", then `button.chip` (`is-on`, `aria-pressed`) per agency;
    - the PrimeNG multiselect group: **Where**, grouped by region, with filter and labels as in change #7; then **Park**, shown when there are park codes, with the change #6 note `rt-notice` "Park filter shows NPS campgrounds only" when not all parks are selected;
    - `div.filter-group.radius-group`: `span.rt-label` "MILES FROM ME" + `div.segmented` of buttons (`is-on`).
  - **Body:**
    - `div.rt-map-layout` holds `div.rt-map-frame` (`<app-campground-map>` with `[allowLocationPick]="true"`) and `div.rt-side`, which holds, in order:
      - `div.list-header`: `h1.rt-list-title` "{n} campground(s)", `span.nearest` "nearest first", and "Updating…" while `updating()`;
      - `div.location-controls`: two `rt-text-btn rt-text-btn--teal` buttons;
      - `div.device-location-error`;
      - the manual panel (`rt-dashed-panel` > `form.manual-location` + `p.manual-location-help`, and `.map-pick-help` for the tip);
      - `<app-campground-table>`.
    - `div.status-area` for the first load and the error state.
  - **The map's `addToTrip` output** sets the selection and the table's `openPickerFor` (spec 3, change #4).
- [ ] **Step 4: `finder.component.scss`, verbatim from V1:**
  ```scss
:host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.filter-bar {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px 24px;
  padding: 16px 32px;
  border-bottom: 2px dashed var(--rt-ink);
}

.filter-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.radius-group {
  margin-left: auto;
}

.chip {
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: 5px 12px;
  border-radius: 999px;
  border: 2px solid var(--rt-ink);
  background: var(--rt-cream);
  color: var(--rt-ink);
  cursor: pointer;

  &.is-on {
    background: var(--rt-ink);
    color: var(--rt-cream);
  }
}

.segmented {
  display: flex;
  border: 2px solid var(--rt-ink);
  border-radius: 999px;
  overflow: hidden;
  background: var(--rt-cream);

  button {
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    padding: 5px 12px;
    border: none;
    background: transparent;
    color: var(--rt-ink);
    cursor: pointer;

    &.is-on {
      background: var(--rt-cherry);
      color: var(--rt-cream);
    }
  }
}

.list-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.nearest {
  font-size: 14px;
  font-weight: 600;
}

.location-controls {
  display: flex;
  gap: 16px;
  margin-top: -6px;
}

.device-location-error {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-area {
  padding: 24px 32px;
  max-width: 720px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.manual-location {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  .rt-input {
    flex: 1;
    min-width: 160px;
  }
}

.manual-location-help {
  margin: 0;
  font-size: 14px;
}

@media (max-width: 900px) {
  :host {
    flex: none;
  }

  .filter-bar {
    padding: 12px 16px;
  }

  .radius-group {
    margin-left: 0;
  }

  .status-area {
    padding: 16px;
  }
}
  ```
  V1 had two multiselects (region + state) in a `filter-group`; the single Where picker uses the same group. The "Updating…" text uses `span.nearest`'s style. The park note is `rt-notice`.
- [ ] **Step 5: Route.** `''` → `FinderComponent`.
- [ ] **Step 6: Verify.**
  - Lint and build.
  - Re-read spec 3 end to end. Check every exact text: the location messages, blocked help, manual panel help, labels, "Finding campgrounds near you...", and "Unable to load nearby campgrounds.". List any gap in `activity.md`.
- [ ] **Step 7: Commit.** `git commit -m "Task 6: the Finder page (filters, map and list, location, saved search)"`

**QC (for Shawn, in the browser):** use the Finder at http://192.168.1.188:4200. The browser will ask for your location; Ralph's campgrounds are the full production set.
- Allow location: the map centers on you at about a 100-mile view, and the list shows "{n} campgrounds · nearest first" with mustard distance badges.
- Toggle agency chips, the Where picker (ticking a region ticks its states) and Park: the list updates **without blanking**, and "Updating…" shows meanwhile. Picking a few parks shows the NPS-only note.
- Miles **All**: the whole country. Scrolling stays smooth (virtual list), and the map stays responsive (chunked markers).
- Click a card: it expands with the description, Reserve (when there is a URL) and Directions.
- Right-click the map → "Search from here". Change location → the manual lat/lng panel.
- Go to About and back: your search and filters are kept, with no location prompt. Refresh: they're still kept.
- Signed in as Pat: hearts are filled on Pat's favorites; + opens the add-to-trip panel. A marker popup's "Add to trip…" opens that card's panel.
- Block location in the browser: the blocked help appears, and the manual panel works.

---

## Task 7: Favorites (spec 6)

Read the Favorites section and Proposed changes #1–#4 in `2026-10-25-favorites-trips-design.md`.

**Files:**
- Create: `src/app/features/favorites/favorites.component.ts`, `.html`
- Modify: `src/app/shared/ui/campground-map/campground-map.component.ts` (add `fitToCampgrounds: boolean` input, change #4), `src/app/app.routes.ts`

- [ ] **Step 1: The Favorites page** (spec 6, with the exact texts and the plan-a-trip flow), plus changes #1–#4.
  - **Change #1:** unfavoriting removes the card.
  - **Change #2:** the "Tap the heart" empty text.
  - **Change #3:** the load error with "Try again".
  - **Change #4:** the map fits the favorites.
  - **Structure:**
    - `div.rt-map-layout` > `div.rt-map-frame` (map) + `div.rt-side`;
    - in the side: `div.favorites-header` (`h1.rt-list-title` "Favorites" + `button.rt-btn.rt-btn--shadow.plan-button`, `rt-btn--mustard` when not planning);
    - the planner, `div.rt-dashed-panel.trip-planner` (`div.planner-hint`, `div.planner-row`), then `p.empty`, then the card list with notes and plan mode.
  - **Inline styles, verbatim:**
    ```scss
:host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.favorites-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.plan-button {
  margin-left: auto;
}
.planner-hint {
  font-size: 14px;
  font-weight: 600;
}
.planner-row {
  display: flex;
  gap: 8px;
}
.planner-row .rt-input {
  flex: 1;
  background: var(--rt-card);
}
.empty {
  margin: 0;
}
@media (max-width: 900px) {
  :host {
    flex: none;
  }
}
    ```
- [ ] **Step 2: Map `fitToCampgrounds`.** When it's true and the campgrounds change, `fitBounds` them with 32px padding, the same as ordered mode.
- [ ] **Step 3: Route.** `favorites` → `FavoritesComponent` (`authGuard`).
- [ ] **Step 4: Verify.** Lint and build. Re-read spec 6.
- [ ] **Step 5: Commit.** `git commit -m "Task 7: favorites page (notes, plan a trip)"`

**QC (for Shawn, in the browser):**
- As Pat: three favorites, one with a note. The map fits them.
- Edit a note, refresh: it's kept.
- Unheart one: it disappears.
- "Plan a trip", tick two, name it, Save: you land on the new trip.

---

## Task 8: Trips list and Trip detail (spec 7)

Read the Trips list and Trip detail sections and Proposed changes #3 and #5–#10 in `2026-10-25-favorites-trips-design.md`.

**Files:**
- Create: `src/app/features/trips/trips-list.component.ts`, `.html`; `trip-detail.component.ts`, `.html`
- Modify: `src/app/core/services/trips.service.ts` (`loadAllStops(tripIds): Promise<Map<string, TripStop[]>>` in two requests, change #5), `src/app/app.routes.ts`

- [ ] **Step 1: `TripsService.loadAllStops`.** One `trip_stops` select for all the given trip ids (`order by position`), then one `getByIds` for every campground. Returns the stops per trip.
- [ ] **Step 2: The Trips list** (spec 7, plus changes #3, #6 and #7).
  - **Structure:**
    - `div.rt-content` with `h1.rt-title` "Trips", then `p.empty`;
    - `div.postcards` of `article.postcard`, each holding:
      - `a.postcard-header` (`span.greetings` "Greetings from", `span.trip-name`);
      - `div.postcard-body` (`div.stop-count`, the route line);
      - `div.postcard-footer` ("Created …", `a.rt-btn.rt-btn--sm.rt-btn--mustard.open`, the Delete `rt-btn rt-btn--sm rt-btn--danger-outline`).
    - The change #6 inline confirmation replaces `confirm()`: inside the postcard footer, the text "Delete this trip? This cannot be undone." with **Cancel** / **"Yes, delete this trip"** (`rt-btn rt-btn--sm rt-btn--cherry`).
  - **Inline styles, verbatim:**
    ```scss
.rt-content {
  max-width: 1100px;
}
.empty {
  margin: 0;
  font-size: 16px;
}
.postcards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}
.postcard {
  border: 3px solid var(--rt-ink);
  border-radius: 16px;
  background: var(--rt-card);
  box-shadow: 5px 5px 0 var(--rt-ink);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.postcard-header {
  display: flex;
  flex-direction: column;
  padding: 18px 20px;
  background: var(--rt-teal);
  color: var(--rt-cream);
  border-bottom: 3px solid var(--rt-ink);
  text-decoration: none;
}
.postcard-header:hover {
  color: var(--rt-cream);
}
.greetings {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.trip-name {
  font-family: var(--rt-script);
  font-size: 36px;
  line-height: 1.1;
  text-shadow: 2px 2px 0 var(--rt-cherry);
  overflow-wrap: anywhere;
}
.postcard-body {
  padding: 14px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
}
.stop-count {
  font-weight: 600;
}
.postcard-footer {
  margin-top: auto;
  padding: 12px 20px;
  border-top: 2px dashed var(--rt-ink);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.open {
  margin-left: auto;
}
    ```
- [ ] **Step 3: Trip detail** (spec 7, plus changes #3, #6, #8 and #10).
  - **Structure:**
    - not found: `div.rt-content` with `a.back-link` "‹ All trips";
    - otherwise `div.rt-map-layout` > the map (ordered) + `div.rt-side`, holding:
      - `div.trip-header` (`a.back-link`; `div.rename-row` while renaming, now with **Cancel**; `h1.rt-list-title`; `div.meta-row` with `span.meta`, `button.rt-btn.rt-btn--sm.rename`, and Delete trip);
      - `p.rt-error`;
      - `div.rt-scroll-list` of `div.stop-card` (`is-open`) > `div.card-main` (`div.stop-badge` with `span.badge-top` and `span.badge-sub` "STOP"; `div.card-text`; `div.reorder` with two buttons using SVG paths `m18 15-6-6-6 6` and `m6 9 6 6 6-6`; Remove), plus `div.detail` with the detail panel;
      - `div.add-stop` (`select.rt-input` + Add, `rt-btn rt-btn--mustard`).
    - The inline delete confirmation sits in `div.meta-row`.
  - **Inline styles, verbatim:**
    ```scss
:host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.back-link {
  align-self: flex-start;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--rt-teal);
  text-decoration: none;
}
.trip-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rename-row {
  display: flex;
  gap: 8px;
}
.rename-row .rt-input {
  flex: 1;
  font-size: 18px;
  padding: 8px 14px;
}
.meta-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.meta {
  font-size: 14px;
  font-weight: 600;
  margin-right: auto;
}
.stop-card {
  flex: none;
  border: 2px solid var(--rt-ink);
  border-radius: 14px;
  background: var(--rt-card);
  box-shadow: 3px 3px 0 var(--rt-ink);
}
.stop-card.is-open {
  background: var(--rt-cream);
}
.card-main {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 12px 14px;
  cursor: pointer;
}
.stop-badge {
  width: 58px;
  height: 58px;
  flex: none;
  box-sizing: border-box;
  border-radius: 50%;
  background: var(--rt-cherry);
  color: var(--rt-cream);
  border: 2px solid var(--rt-ink);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
  gap: 2px;
}
.badge-top {
  font-family: var(--rt-display);
  font-size: 17px;
}
.badge-sub {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
}
.card-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.campground-name-link {
  font-weight: 700;
  font-size: 17px;
  line-height: 1.3;
}
.tags {
  display: flex;
  gap: 6px;
}
.reorder {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.reorder button {
  width: 30px;
  height: 24px;
  padding: 0;
  border: 2px solid var(--rt-ink);
  border-radius: 6px;
  background: var(--rt-cream);
  color: var(--rt-ink);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.reorder button:disabled {
  opacity: 0.3;
  cursor: default;
}
.detail {
  padding: 2px 14px 16px 86px;
}
.add-stop {
  display: flex;
  gap: 8px;
  padding-top: 14px;
  border-top: 2px dashed var(--rt-ink);
}
.add-stop .rt-input {
  flex: 1;
}
@media (max-width: 900px) {
  :host {
    flex: none;
  }
  .detail {
    padding-left: 14px;
  }
}
    ```
- [ ] **Step 4: Routes.** `trips` and `trips/:id` → the real components (`authGuard`).
- [ ] **Step 5: Verify.**
  - Lint and build.
  - Re-read spec 7.
  - `grep -rn "window.confirm\|confirm(" src/app` finds nothing.
- [ ] **Step 6: Commit.** `git commit -m "Task 8: trips list (postcards) and trip detail (route map, reorder, add and remove stops)"`

**QC (for Shawn, in the browser):**
- As Pat: the "Sample road trip" postcard with "2 stops" and the route.
- Open it: numbered cherry markers joined by a line.
- Move a stop down: the order is kept after a refresh.
- Add a favorite as a stop; remove one.
- Rename, then Cancel; rename, then Save.
- Delete asks inline, not in a browser pop-up.

---

## Task 9: Admin page (spec 8)

Read the Admin section and Proposed changes #1–#3 in `2026-10-25-admin-about-design.md`. Remember spec 1's V1.1 fixes: a suspended admin isn't an admin, and there's always one active admin.

**Files:**
- Create: `src/app/core/models/admin-user.model.ts`, `campground-attribute.model.ts`
- Create: `src/app/core/services/admin-users.service.ts`, `admin-stats.service.ts`, `campground-attributes.service.ts`
- Create: `src/app/features/admin/admin.component.ts`, `.html`
- Modify: `src/app/app.routes.ts`

**Interfaces:**
- **`AdminUser`:** `{ id, email, displayName, role, suspended, createdAt }`.
- **`AdminUsersService`:** `users` signal; `loadUsers`, `updateRole`, `setSuspended`, `updateDisplayName`, `updateEmail`, `inviteUser`, `deleteUser`.
  - Edge functions go through one helper. On a `FunctionsHttpError`, it throws `Error(await error.context.text() || error.message)`.
- **`AdminStatsService`:** `stats` signal `{ favoritesCount, tripsCount }`; `loadStats`.
- **`CampgroundAttributesService`:** `attributes` signal; `loadForCampground`, `addAttribute`, `updateAttribute`, `deleteAttribute`.

- [ ] **Step 1: The three services and models,** as above (spec 8, spec 1's RPCs and edge functions).
- [ ] **Step 2: The Admin page** (spec 8, with the exact texts), plus changes #1–#3: "You" on your own row, plain-English errors, and stats refreshing after a delete.
  - **Structure:**
    - `div.rt-content.admin` with `h1.rt-title` "Admin";
    - `div.admin-stats` of `div.admin-stat` (`span.admin-stat-value.favorites` / `.trips`, `span.admin-stat-label`);
    - `div.tabs` of `button.tab` (`active`), then `div.tab-panel`, holding:
      - **Users:** `form.add-user-form`, then `div.rt-table-card > table.rt-table.users-table`. The role is a `p-select` with `class="role-pill"` and `[class.role-admin]`. Email cells are `td.email`. Actions sit in `div.rt-row-actions`.
      - **Attributes:** `p-autocomplete.campground-search`, then `table.rt-table` with `td.attr-name` and the `tfoot` add row.
  - **Inline styles, verbatim:**
    ```scss
.admin {
  max-width: 1200px;
}
.admin-stats {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.admin-stat {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 22px 14px 14px;
  border: 3px solid var(--rt-ink);
  border-radius: 999px;
  background: var(--rt-card);
  box-shadow: 4px 4px 0 var(--rt-ink);
}
.admin-stat-value {
  width: 64px;
  height: 64px;
  box-sizing: border-box;
  border-radius: 50%;
  border: 2px solid var(--rt-ink);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--rt-display);
  font-size: 22px;
}
.admin-stat-value.favorites {
  background: var(--rt-mustard);
}
.admin-stat-value.trips {
  background: var(--rt-teal);
  color: var(--rt-cream);
}
.admin-stat-label {
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.tabs {
  display: flex;
  gap: 6px;
  border-bottom: 3px solid var(--rt-ink);
  margin-bottom: -8px;
}
.tab {
  font: inherit;
  font-weight: 700;
  font-size: 15px;
  padding: 10px 20px;
  border: 3px solid var(--rt-ink);
  border-bottom: none;
  border-radius: 12px 12px 0 0;
  margin-bottom: -3px;
  cursor: pointer;
  background: var(--rt-sand);
  color: var(--rt-ink);
}
.tab.active {
  background: var(--rt-card);
  padding-bottom: 13px;
}
.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.add-user-form {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.add-user-form .rt-input {
  flex: 1;
  min-width: 200px;
}
.users-table {
  min-width: 860px;
}
.email,
.attr-name {
  font-weight: 600;
}
:host ::ng-deep .role-pill {
  border-radius: 999px !important;
  border-width: 1.5px !important;
}
:host ::ng-deep .role-pill .p-select-label {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 0 3px 10px !important;
}
:host ::ng-deep .role-pill.role-admin {
  background: var(--rt-mustard) !important;
}
:host ::ng-deep .campground-search {
  max-width: 480px;
  width: 100%;
}
:host ::ng-deep .campground-search .p-autocomplete-input {
  width: 100%;
}
    ```
- [ ] **Step 3: Route.** `admin` → `AdminComponent` (`adminGuard`).
- [ ] **Step 4: Verify.**
  - Lint and build.
  - `grep -rn "PlaceholderComponent" src/app/app.routes.ts` finds nothing. Every page is now real, so delete `src/app/features/placeholder/`.
  - Re-read spec 8.
- [ ] **Step 5: Commit.** `git commit -m "Task 9: admin page (stats, users, campground attributes); remove the placeholder"`

**QC (for Shawn, in the browser):**
- As the admin: the stats pills; Users lists admin, Pat and Sam.
- Your own row shows "You", not role, Suspend or Delete.
- Unsuspend Sam: Sam can now sign in.
- Make Pat a Moderator, then a User again.
- Invite a test address: the invite email lands in Mailpit (http://192.168.1.188:54324).
- Attributes tab: search "Yellowstone", pick a campground, add, edit and delete an attribute.

---

## Out of Scope (this plan)

- V1.1's own Supabase cloud project, its Vercel site, and production settings (by hand, later, when V1.1 is ready).
- Unit and end-to-end tests (dropped).
- Any change to the database, edge functions or their tests.
- V1.2 ideas: showing campground attributes to users, moderator powers, a dark palette, and a fix for the rows with no `state`.
