// SCROLL CHECK — task.md Task 10 (spec 3, change #12; docs/next-loop-bugs.md, bug 5).
// Loads the app's production build in headless Chromium, on the Finder with "Miles: All"
// (list order = distance order), and checks five cases:
//   1. 1400px: the map popup of the campground ~75% down the list → "View details ▸";
//   2. 1400px, signed in as the admin: the same campground → "Add to trip…" (the trip picker opens);
//   3. 390px (phone): case 1 again;
//   4. 1400px: the LAST campground in the list → "View details ▸";
//   5. 1400px: a click on the 4th card in the list itself.
// Cases 1–3: the opened card's top lands within 2px of the top of the element that scrolls
// the list (inside its top padding); at 1400px that element is the list and nothing else moved.
// Case 4: the card's top lands there too, or, if the list can't scroll that far, the list is
// scrolled to its end with the card fully in view. Case 5: a list click keeps the old scroll
// (only as far as needed): the list moves less than 100px and the card stays fully in view.
// One PASS or FAIL line per case. Exit 0 if all pass, 1 if any fails, 2 if the check itself
// couldn't run (usage, sign-in, page or map didn't load).
//
//   node ralphloop/scroll-check.mjs dist/campsite-finder/browser
//
// Needs the worker image (Playwright through NODE_PATH), the local stack (SUPABASE_URL,
// SUPABASE_ANON_KEY) and the dev seed (4,900 campgrounds, the admin login). Map tiles are
// stubbed. Leaflet's map is reached by hooking window.L as the page loads (Map.addInitHook).
// Written by Lisa, 2026-11-14, and checked against builds of main (fails) and Task 10 (passes).
import { createRequire } from 'node:module';
import { serveSpa } from './serve-spa.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BUILD_DIR = process.argv[2];
const API = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
if (!BUILD_DIR || !API || !ANON) {
  console.error('usage: SUPABASE_URL=… SUPABASE_ANON_KEY=… node scroll-check.mjs <build dir>');
  process.exit(2);
}
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const HOME = { latitude: 44.98, longitude: -93.27 }; // Minneapolis
const ADMIN = { email: 'admin@campsites.test', password: 'campsites-admin' };
const WIDE = { width: 1400, height: 900 };
const PHONE = { width: 390, height: 844 };

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

// Opens the Finder with "Miles: All" and returns the page.
async function openFinder(browser, viewport, who, base) {
  const ctx = await browser.newContext({ viewport, geolocation: HOME, permissions: ['geolocation'] });
  await ctx.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG }));
  await ctx.addInitScript(HOOK);
  if (who) {
    const key = `sb-${new URL(API).hostname.split('.')[0]}-auth-token`;
    const session = JSON.stringify(await signIn(who));
    await ctx.addInitScript(
      ([k, v]) => {
        if (!localStorage.getItem(k)) localStorage.setItem(k, v);
      },
      [key, session],
    );
  }
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') page.errors.push(m.text());
  });
  await page.goto(base + '/', { waitUntil: 'load' });
  return page;
}

// Measures the open card against the element that scrolls the list.
const MEASURE = () => {
  const card = document.querySelector('.campground-card.is-open');
  if (!card) return { found: false };
  const list = card.parentElement;
  let scroller = document.scrollingElement;
  let target = 0;
  for (let el = list; el; el = el.parentElement) {
    const s = getComputedStyle(el);
    if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight) {
      scroller = el;
      target = el.getBoundingClientRect().top + parseFloat(s.paddingTop);
      break;
    }
  }
  const view = scroller === document.scrollingElement
    ? { top: 0, bottom: window.innerHeight }
    : scroller.getBoundingClientRect();
  const r = card.getBoundingClientRect();
  const main = document.querySelector('main');
  return {
    found: true,
    index: [...list.children].indexOf(card),
    name: card.querySelector('.card-main')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60),
    offBy: Math.round(r.top - target),
    fullyInView: r.top >= view.top - 2 && r.bottom <= view.bottom + 2,
    atEnd: scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2,
    scroller: scroller === list ? 'list' : scroller.tagName.toLowerCase(),
    scrollTop: Math.round(scroller.scrollTop),
    mainScrollTop: Math.round(main?.scrollTop ?? 0),
    pageScrollTop: Math.round(document.scrollingElement.scrollTop),
    picker: !!card.querySelector('app-add-to-trip'),
  };
};

async function waitForAll(page) {
  await page.waitForSelector('.campground-card', { timeout: 30000 });
  await page.locator('button', { hasText: /^\s*All\s*$/ }).last().click();
  await page.waitForFunction(() => document.querySelectorAll('.campground-card').length > 2000, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
}

// Map case: open the popup of the campground at `at` (0..1 of the distance order, or 'last').
async function mapCase(browser, base, { viewport, who, button, at }) {
  const page = await openFinder(browser, viewport, who, base);
  await waitForAll(page);
  const popup = await page.evaluate(
    async ([home, at]) => {
      const map = window.__map;
      if (!map) throw new Error('no Leaflet map found (window.L hook)');
      let cluster = null;
      map.eachLayer((l) => {
        if (l.getLayers && l.zoomToShowLayer) cluster = l;
      });
      const rad = (d) => (d * Math.PI) / 180;
      const dist = (ll) =>
        Math.asin(Math.sqrt(Math.sin(rad(ll.lat - home.latitude) / 2) ** 2 +
          Math.cos(rad(home.latitude)) * Math.cos(rad(ll.lat)) * Math.sin(rad(ll.lng - home.longitude) / 2) ** 2));
      const ms = cluster.getLayers().filter((m) => m.getPopup()).sort((a, b) => dist(a.getLatLng()) - dist(b.getLatLng()));
      const m = at === 'last' ? ms[ms.length - 1] : ms[Math.floor(ms.length * at)];
      await new Promise((res) => cluster.zoomToShowLayer(m, res));
      m.openPopup();
      await new Promise((r) => setTimeout(r, 300));
      return document.querySelector('.leaflet-popup strong')?.textContent ?? null;
    },
    [HOME, at],
  );
  await page.locator('.leaflet-popup .view-details-button', { hasText: button }).click();
  await page.waitForTimeout(2500);
  const r = await page.evaluate(MEASURE);
  r.errors = page.errors;
  r.popup = popup;
  await page.context().close();
  return r;
}

// List case: click the 4th card in the list itself.
async function listCase(browser, base) {
  const page = await openFinder(browser, WIDE, null, base);
  await waitForAll(page);
  const before = await page.evaluate(() => Math.round(document.querySelector('.rt-scroll-list').scrollTop));
  await page.locator('.campground-card').nth(3).locator('.card-main').click();
  await page.waitForTimeout(2500);
  const r = await page.evaluate(MEASURE);
  r.moved = r.scrollTop - before;
  r.errors = page.errors;
  await page.context().close();
  return r;
}

const sameName = (r) => !!r.popup && (r.name ?? '').toUpperCase().includes(r.popup.toUpperCase().slice(0, 15));
const wideStill = (r) => r.scroller === 'list' && r.mainScrollTop === 0 && r.pageScrollTop === 0;

const CASES = [
  ['1 View details, 75%, 1400px', (b, u) => mapCase(b, u, { viewport: WIDE, who: null, button: 'View details', at: 0.75 }),
    (r) => sameName(r) && Math.abs(r.offBy) <= 2 && wideStill(r)],
  ['2 Add to trip, 75%, 1400px, admin', (b, u) => mapCase(b, u, { viewport: WIDE, who: ADMIN, button: 'Add to trip', at: 0.75 }),
    (r) => sameName(r) && Math.abs(r.offBy) <= 2 && wideStill(r) && r.picker],
  ['3 View details, 75%, 390px', (b, u) => mapCase(b, u, { viewport: PHONE, who: null, button: 'View details', at: 0.75 }),
    (r) => sameName(r) && Math.abs(r.offBy) <= 2],
  ['4 View details, last, 1400px', (b, u) => mapCase(b, u, { viewport: WIDE, who: null, button: 'View details', at: 'last' }),
    (r) => sameName(r) && wideStill(r) && (Math.abs(r.offBy) <= 2 || (r.atEnd && r.fullyInView))],
  ['5 list click, 4th card, 1400px', (b, u) => listCase(b, u),
    (r) => r.index === 3 && Math.abs(r.moved) < 100 && r.fullyInView && wideStill(r)],
];

const { server, url } = await serveSpa(BUILD_DIR);
const browser = await chromium.launch();
let failed = 0;
let broken = false;
try {
  for (const [name, run, ok] of CASES) {
    let r;
    try {
      r = await run(browser, url);
    } catch (e) {
      broken = true;
      console.log(`ERROR ${name}: ${e.message}`);
      continue;
    }
    const pass = r.found && r.errors.length === 0 && ok(r);
    if (!pass) failed += 1;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(r)}`);
  }
} finally {
  await browser.close();
  server.close();
}
if (broken) {
  console.log('SCROLL CHECK COULD NOT RUN (see ERROR lines).');
  process.exit(2);
}
console.log(failed === 0 ? `SCROLL CHECK PASSED: ${CASES.length} of ${CASES.length}.` : `SCROLL CHECK FAILED: ${failed} of ${CASES.length}.`);
process.exit(failed === 0 ? 0 : 1);
