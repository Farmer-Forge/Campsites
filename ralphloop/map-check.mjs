// MAP CHECK — task.md Task 12 (spec 3, change #13: the map maximize / reduce switch).
// Loads the app's production build in headless Chromium and checks six cases:
//   1. The switch is on every map page (Finder, Favorites, Trip detail): one .map-size-toggle,
//      in Leaflet's top-right corner, aria-pressed "false", labelled "Enlarge map", icon
//      pi-window-maximize, list showing; and on each page it maximizes (list hidden, map full width).
//   2. 1280px, Finder: the switch hides the list and the map takes the full width of the layout
//      (and at least 300px more than before); Leaflet's size follows its container; the map's
//      zoom doesn't change and its center moves 2 pixels at most; the switch now says "Show list" (aria-pressed "true").
//      Switching back restores the list and the map's width (within 2px), center and zoom.
//   3. 390px, Finder: the same switch hides the list and the map grows at least 100px taller
//      (it takes the height of the scrolling area under the header): the map fits that area, is
//      scrolled fully into view, and nothing scrolls sideways (page or .app-main); switching back
//      restores its height (within 2px).
//   4. While maximized, "View details ▸" in a map popup brings the list back with that
//      campground's card open and its top in view (at 1280px and 390px); as the admin,
//      "Add to trip…" does the same with the trip picker open.
//   5. Remembered for the tab: after a reload the map is still maximized, and Favorites opened in
//      the same tab is maximized too; a new tab starts with the list showing.
//   6. No console errors or uncaught page errors on any page load.
// One PASS or FAIL line per case. Exit 0 if all pass, 1 if any fails, 2 if the check itself
// couldn't run (usage, no build, sign-in, a page or the map didn't load, or the only console
// errors were network failures, net::ERR_…, which a rerun clears).
//
//   node ralphloop/map-check.mjs dist/campsite-finder/browser
//
// Needs the worker image (Playwright through NODE_PATH), the local stack (SUPABASE_URL,
// SUPABASE_ANON_KEY) and the dev seed (campgrounds near Minneapolis; Pat with a favorite and a
// trip; the admin). Map tiles are stubbed. Leaflet's map is reached by hooking window.L as the
// page loads (Map.addInitHook), as in scroll-check.mjs.
// Written by Lisa, 2026-11-21, and checked against builds of main (fails) and Task 12 (passes).
import { createRequire } from 'node:module';
import { serveSpa } from './serve-spa.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BUILD_DIR = process.argv[2];
const API = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
if (!BUILD_DIR || !API || !ANON) {
  console.error('usage: SUPABASE_URL=… SUPABASE_ANON_KEY=… node map-check.mjs <build dir>');
  process.exit(2);
}
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const HOME = { latitude: 44.98, longitude: -93.27 }; // Minneapolis
const ADMIN = { email: 'admin@campsites.test', password: 'campsites-admin' };
const CAMPER = { email: 'pat@campsites.test', password: 'campsites-pat' };
const WIDE = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const SETTLE_MS = 700;
const KEY = `sb-${new URL(API).hostname.split('.')[0]}-auth-token`;

// Captures Leaflet's map as it's created (window.__map), without touching the app's code.
const HOOK = () => {
  let real;
  Object.defineProperty(window, 'L', {
    configurable: true,
    get: () => real,
    set: (v) => {
      real = v;
      try {
        v.Map.addInitHook(function () {
          window.__map = this;
        });
      } catch {}
    },
  });
};

async function signIn({ email, password }) {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in as ${email} failed: HTTP ${res.status}`);
  const s = await res.json();
  s.expires_at ??= Math.floor(Date.now() / 1000) + s.expires_in;
  return s;
}

async function firstTripId(session) {
  const res = await fetch(`${API}/rest/v1/trips?select=id&order=id&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) throw new Error(`reading the camper's trips failed: HTTP ${res.status}`);
  const rows = await res.json();
  if (!rows[0]) throw new Error('the dev seed gives pat@campsites.test no trip');
  return rows[0].id;
}

const errors = []; // case 6

// A new browser context: its own storage, so its first page is a fresh tab.
async function newContext(browser, viewport, session) {
  const ctx = await browser.newContext({ viewport, geolocation: HOME, permissions: ['geolocation'] });
  await ctx.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG }));
  await ctx.addInitScript(HOOK);
  if (session) {
    await ctx.addInitScript(
      ([k, v]) => {
        if (!localStorage.getItem(k)) localStorage.setItem(k, v);
      },
      [KEY, JSON.stringify(session)],
    );
  }
  return ctx;
}

function watch(page, label) {
  page.on('pageerror', (e) => errors.push(`${label}: uncaught ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${label}: console ${m.text()}`);
  });
}

// Opens (or navigates the given page to) a map page and waits for the map and the switch.
async function open(ctxOrPage, base, path, label) {
  const page = ctxOrPage.newPage ? await ctxOrPage.newPage() : ctxOrPage;
  if (ctxOrPage.newPage) watch(page, label);
  await page.goto(base + path, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => !!window.__map && !!document.querySelector('.rt-map-frame'), null, { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
  return page;
}

// Runs in the page: the switch, the list column, the map frame and Leaflet's own view.
const LAYOUT = () => {
  const layout = document.querySelector('.rt-map-layout');
  const frame = document.querySelector('.rt-map-frame');
  const side = layout?.querySelector(':scope > .rt-side');
  const button = document.querySelector('.map-size-toggle');
  const main = document.querySelector('.app-main');
  const icon = button?.querySelector('.pi');
  const map = window.__map;
  const ls = layout ? getComputedStyle(layout) : null;
  const center = map?.getCenter();
  const size = map?.getSize();
  return {
    toggles: document.querySelectorAll('.map-size-toggle').length,
    topRight: !!button?.closest('.leaflet-top.leaflet-right'),
    pressed: button?.getAttribute('aria-pressed') ?? null,
    label: button?.getAttribute('aria-label') ?? null,
    sideShown: !!side && getComputedStyle(side).display !== 'none' && side.getBoundingClientRect().width > 0,
    frameW: Math.round(frame?.getBoundingClientRect().width ?? 0),
    frameH: Math.round(frame?.getBoundingClientRect().height ?? 0),
    layoutInnerW: layout ? Math.round(layout.clientWidth - parseFloat(ls.paddingLeft) - parseFloat(ls.paddingRight)) : 0,
    leafletFits: !!map && Math.abs(size.x - map.getContainer().clientWidth) <= 1 && Math.abs(size.y - map.getContainer().clientHeight) <= 1,
    center: center ? [center.lat, center.lng] : null,
    // The center in Leaflet's world pixels at this zoom, so drift is judged in pixels, not degrees.
    centerPx: center ? [map.project(center, map.getZoom()).x, map.project(center, map.getZoom()).y] : null,
    zoom: map?.getZoom() ?? null,
    icon: icon?.classList.contains('pi-window-minimize') ? 'minimize' : icon?.classList.contains('pi-window-maximize') ? 'maximize' : null,
    sideways: document.documentElement.scrollWidth > window.innerWidth || (!!main && main.scrollWidth > main.clientWidth),
    mainH: main?.clientHeight ?? 0,
    frameInView: !!frame && !!main && (() => {
      const f = frame.getBoundingClientRect();
      const m = main.getBoundingClientRect();
      return f.top >= m.top - 2 && f.bottom <= m.bottom + 2;
    })(),
  };
};

async function look(page) {
  return page.evaluate(LAYOUT);
}

// Clicks the switch. Without one (main's build) it measures as-is, so the cases FAIL, not ERROR.
async function flip(page) {
  if ((await page.locator('.map-size-toggle').count()) === 0) return look(page);
  await page.locator('.map-size-toggle').click();
  await page.waitForTimeout(SETTLE_MS);
  return look(page);
}

// Same zoom, and the center within 2 pixels (Leaflet rounds to whole pixels when it resizes).
const sameView = (a, b) =>
  !!a.centerPx && !!b.centerPx && a.zoom === b.zoom &&
  Math.abs(a.centerPx[0] - b.centerPx[0]) <= 2 && Math.abs(a.centerPx[1] - b.centerPx[1]) <= 2;
const reducedState = (s) => s.pressed === 'false' && s.label === 'Enlarge map' && s.icon === 'maximize' && s.sideShown;
const maximizedState = (s) => s.pressed === 'true' && s.label === 'Show list' && s.icon === 'minimize' && !s.sideShown;

// Opens the popup of the campground nearest home and clicks one of its buttons.
async function popupButton(page, text) {
  const name = await page.evaluate(async (home) => {
    const map = window.__map;
    let cluster = null;
    map.eachLayer((l) => {
      if (l.getLayers && l.zoomToShowLayer) cluster = l;
    });
    if (!cluster) throw new Error('no marker cluster on the map');
    const d = (ll) => (ll.lat - home.latitude) ** 2 + (ll.lng - home.longitude) ** 2;
    const m = cluster.getLayers().filter((x) => x.getPopup()).sort((a, b) => d(a.getLatLng()) - d(b.getLatLng()))[0];
    if (!m) throw new Error('no campground markers on the map');
    await new Promise((res) => cluster.zoomToShowLayer(m, res));
    m.openPopup();
    await new Promise((r) => setTimeout(r, 300));
    return document.querySelector('.leaflet-popup strong')?.textContent ?? null;
  }, HOME);
  await page.locator('.leaflet-popup .view-details-button', { hasText: text }).click();
  await page.waitForTimeout(2500);
  const card = await page.evaluate(() => {
    const c = document.querySelector('.campground-card.is-open');
    if (!c) return null;
    let view = { top: 0, bottom: window.innerHeight };
    for (let el = c.parentElement; el; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight) {
        view = el.getBoundingClientRect();
        break;
      }
    }
    const r = c.getBoundingClientRect();
    return {
      name: c.querySelector('.card-main')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      inView: r.top >= view.top - 2 && r.top < view.bottom,
      picker: !!c.querySelector('app-add-to-trip'),
    };
  });
  return { popup: name, card, after: await look(page) };
}

const results = {};
let broken = null;
let server = null;
let browser = null;
try {
  const served = await serveSpa(BUILD_DIR);
  server = served.server;
  const base = served.url;
  browser = await chromium.launch();
  const camper = await signIn(CAMPER);
  const trip = await firstTripId(camper);
  const admin = await signIn(ADMIN);

  // 1. The switch on every map page (a fresh tab each).
  {
    const one = [];
    for (const [path, session, label] of [['/', null, 'finder'], ['/favorites', camper, 'favorites'], [`/trips/${trip}`, camper, 'trip']]) {
      const ctx = await newContext(browser, WIDE, session);
      const page = await open(ctx, base, path, `case1 ${label}`);
      const before = await look(page);
      const max = await flip(page);
      one.push({ page: label, before, max });
      await ctx.close();
    }
    results[1] = one;
  }

  // 2. 1280px on the Finder: maximize, then reduce.
  {
    const ctx = await newContext(browser, WIDE, null);
    const page = await open(ctx, base, '/', 'case2');
    const before = await look(page);
    const max = await flip(page);
    const back = await flip(page);
    results[2] = { before, max, back };
    await ctx.close();
  }

  // 3. 390px on the Finder.
  {
    const ctx = await newContext(browser, PHONE, null);
    const page = await open(ctx, base, '/', 'case3');
    const before = await look(page);
    const max = await flip(page);
    const back = await flip(page);
    results[3] = { before, max, back };
    await ctx.close();
  }

  // 4. From the maximized map: "View details ▸" (signed out), "Add to trip…" (the admin).
  {
    const out = [];
    for (const [session, text, label, viewport] of [[null, 'View details', 'view', WIDE], [admin, 'Add to trip', 'add', WIDE], [null, 'View details', 'view 390px', PHONE]]) {
      const ctx = await newContext(browser, viewport, session);
      const page = await open(ctx, base, '/', `case4 ${label}`);
      const max = await flip(page);
      out.push({ text: `${text} (${viewport.width}px)`, max, ...(await popupButton(page, text)) });
      await ctx.close();
    }
    results[4] = out;
  }

  // 5. Remembered for the tab, not beyond it.
  {
    const ctx = await newContext(browser, WIDE, camper);
    const page = await open(ctx, base, '/', 'case5');
    const max = await flip(page);
    await open(page, base, '/', 'case5 reload');
    const reloaded = await look(page);
    await open(page, base, '/favorites', 'case5 favorites');
    const favorites = await look(page);
    const fresh = await open(ctx, base, '/', 'case5 new tab');
    const newTab = await look(fresh);
    results[5] = { max, reloaded, favorites, newTab };
    await ctx.close();
  }
} catch (e) {
  broken = e.message;
} finally {
  await browser?.close();
  server?.close();
}
if (!broken && errors.length > 0 && errors.every((e) => /net::ERR_/.test(e))) {
  broken = `only network errors in the console (rerun): ${errors.slice(0, 3).join('; ')}`;
}

if (broken) {
  console.log(`ERROR: ${broken}`);
  console.log('MAP CHECK COULD NOT RUN (see the ERROR line).');
  process.exit(2);
}

const CASES = [
  ['1 switch on every map page', () => {
    const bad = [];
    for (const { page, before, max } of results[1]) {
      if (!(before.toggles === 1 && before.topRight && reducedState(before))) bad.push(`${page}: ${JSON.stringify(before)}`);
      if (!maximizedState(max) || max.frameW < max.layoutInnerW - 2) bad.push(`${page} maximized: ${JSON.stringify(max)}`);
    }
    return [bad.length === 0, bad];
  }],
  ['2 maximize and reduce at 1280px', () => {
    const { before, max, back } = results[2];
    const bad = [];
    if (!reducedState(before)) bad.push(`before: ${JSON.stringify(before)}`);
    if (!maximizedState(max)) bad.push(`maximized state: pressed ${max.pressed}, label ${max.label}, list shown ${max.sideShown}`);
    if (max.frameW < max.layoutInnerW - 2 || max.frameW < before.frameW + 300) bad.push(`map ${before.frameW} → ${max.frameW}px, layout ${max.layoutInnerW}px`);
    if (!max.leafletFits) bad.push("Leaflet's size doesn't match its container after maximizing");
    if (!sameView(before, max)) bad.push(`view moved: ${JSON.stringify([before.center, before.zoom])} → ${JSON.stringify([max.center, max.zoom])}`);
    if (!reducedState(back) || Math.abs(back.frameW - before.frameW) > 2) bad.push(`after reducing: ${JSON.stringify(back)}`);
    if (!back.leafletFits || !sameView(before, back)) bad.push('after reducing: the view moved or Leaflet lost its size');
    return [bad.length === 0, bad];
  }],
  ['3 maximize and reduce at 390px', () => {
    const { before, max, back } = results[3];
    const bad = [];
    if (!reducedState(before)) bad.push(`before: ${JSON.stringify(before)}`);
    if (!maximizedState(max)) bad.push(`maximized state: pressed ${max.pressed}, list shown ${max.sideShown}`);
    if (max.frameH < before.frameH + 100) bad.push(`map height ${before.frameH} → ${max.frameH}px`);
    if (max.frameH > max.mainH) bad.push(`the map (${max.frameH}px) is taller than the scrolling area (${max.mainH}px)`);
    if (!max.frameInView) bad.push('the big map is not scrolled fully into view');
    if (max.sideways || back.sideways) bad.push('the page scrolls sideways');
    if (!max.leafletFits) bad.push("Leaflet's size doesn't match its container after maximizing");
    if (!reducedState(back) || Math.abs(back.frameH - before.frameH) > 2) bad.push(`after reducing: ${JSON.stringify(back)}`);
    return [bad.length === 0, bad];
  }],
  ['4 a popup action brings the list back', () => {
    const bad = [];
    for (const r of results[4]) {
      if (!maximizedState(r.max)) bad.push(`${r.text}: the switch didn't maximize first`);
      if (!reducedState(r.after)) bad.push(`${r.text}: list not back (${JSON.stringify(r.after)})`);
      if (!r.card) bad.push(`${r.text}: no open card`);
      else {
        if (!r.popup || !r.card.name.toUpperCase().includes(r.popup.toUpperCase().slice(0, 15))) bad.push(`${r.text}: opened "${r.card.name}", popup was "${r.popup}"`);
        if (!r.card.inView) bad.push(`${r.text}: the open card isn't in view`);
        if (r.text.startsWith('Add to trip') && !r.card.picker) bad.push('Add to trip: the trip picker isn\'t open');
      }
    }
    return [bad.length === 0, bad];
  }],
  ['5 remembered for the tab', () => {
    const { max, reloaded, favorites, newTab } = results[5];
    const bad = [];
    if (!maximizedState(max)) bad.push('the switch didn\'t maximize');
    if (!maximizedState(reloaded)) bad.push(`after a reload: ${JSON.stringify(reloaded)}`);
    if (!maximizedState(favorites)) bad.push(`Favorites in the same tab: ${JSON.stringify(favorites)}`);
    if (!reducedState(newTab)) bad.push(`a new tab: ${JSON.stringify(newTab)}`);
    return [bad.length === 0, bad];
  }],
  ['6 no console errors', () => [errors.length === 0, errors]],
];

let failed = 0;
for (const [name, judge] of CASES) {
  const [pass, detail] = judge();
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail.length ? `: ${detail.join('; ').slice(0, 600)}` : ''}`);
}
console.log(failed === 0 ? `MAP CHECK PASSED: ${CASES.length} of ${CASES.length}.` : `MAP CHECK FAILED: ${failed} of ${CASES.length}.`);
process.exit(failed === 0 ? 0 : 1);
