// SCROLL CHECK — task.md Task 10 (spec 3, change #12; docs/next-loop-bugs.md, bug 5).
// Loads the app's production build in headless Chromium and drives the real path: on the
// Finder with "Miles: All", it opens the map popup of the campground about 75% of the way
// down the list (list order = distance order) and clicks "View details ▸" (and, signed in as
// the admin, "Add to trip…"). Then it measures where the opened card landed: its top must sit
// within 2px of the top of the element that scrolls the list (inside its top padding), on a
// wide screen (1400px: the list scrolls, the page doesn't) and a phone (390px). One PASS or
// FAIL line per case; exit 0 only if all three pass.
//
//   node ralphloop/scroll-check.mjs dist/campsite-finder/browser
//
// Needs the worker image (Playwright through NODE_PATH), the local stack (SUPABASE_URL,
// SUPABASE_ANON_KEY) and the dev seed (4,900 campgrounds, the admin login). Map tiles are
// stubbed. Leaflet's map is reached by hooking window.L as the page loads (Map.addInitHook).
// Written and proven by Lisa, 2026-11-14: it fails on the code before Task 10 (cards land
// 4,497 / 7,492 / 12,925 px off) and passes on spec 3 change #12's code.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import { serveSpa } from './serve-spa.mjs';
const BUILD_DIR = process.argv[2];
const API = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY;
if (!BUILD_DIR || !API || !ANON) {
  console.error('usage: SUPABASE_URL=… SUPABASE_ANON_KEY=… node scroll-check.mjs <build dir>');
  process.exit(2);
}
const BLANK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const HOME = { latitude: 44.98, longitude: -93.27 }; // Minneapolis

const HOOK = () => {
  let real;
  Object.defineProperty(window, 'L', {
    configurable: true,
    get: () => real,
    set: (v) => {
      real = v;
      try { v.Map.addInitHook(function () { window.__map = this; }); } catch {}
    },
  });
};

async function signIn(email, password) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const s = await r.json();
  s.expires_at ??= Math.floor(Date.now() / 1000) + s.expires_in;
  return s;
}

async function run(base, { width, height, who, button }) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, geolocation: HOME, permissions: ['geolocation'] });
  await ctx.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG }));
  await ctx.addInitScript(HOOK);
  if (who) {
    const s = await signIn(who.email, who.password);
    const key = `sb-${new URL(API).hostname.split('.')[0]}-auth-token`;
    await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [key, JSON.stringify(s)]);
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForSelector('.campground-card', { timeout: 30000 });
  // Miles: All
  await page.locator('button', { hasText: /^\s*All\s*$/ }).last().click();
  await page.waitForFunction(() => document.querySelectorAll('.campground-card').length > 2000, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const total = await page.locator('.campground-card').count();

  // Pick the marker ~75% down the distance order (= list order) and open its popup.
  const name = await page.evaluate(async (home) => {
    const map = window.__map;
    let cluster = null;
    map.eachLayer((l) => { if (l.getLayers && l.zoomToShowLayer) cluster = l; });
    const R = (d) => (d * Math.PI) / 180;
    const dist = (ll) => {
      const a = Math.sin(R(ll.lat - home.latitude) / 2) ** 2 +
        Math.cos(R(home.latitude)) * Math.cos(R(ll.lat)) * Math.sin(R(ll.lng - home.longitude) / 2) ** 2;
      return Math.asin(Math.sqrt(a));
    };
    const ms = cluster.getLayers().filter((m) => m.getPopup()).sort((a, b) => dist(a.getLatLng()) - dist(b.getLatLng()));
    const m = ms[Math.floor(ms.length * 0.75)];
    await new Promise((res) => cluster.zoomToShowLayer(m, res));
    m.openPopup();
    await new Promise((r) => setTimeout(r, 300));
    return document.querySelector('.leaflet-popup strong')?.textContent;
  }, HOME);
  await page.locator('.leaflet-popup .view-details-button', { hasText: button }).click();
  await page.waitForTimeout(2000);

  const r = await page.evaluate(() => {
    const card = document.querySelector('.campground-card.is-open');
    const list = card?.parentElement;
    if (!card) return { found: false };
    let scroller = null, target = 0;
    for (let el = list; el; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight) {
        scroller = el; target = el.getBoundingClientRect().top + parseFloat(s.paddingTop); break;
      }
    }
    const listScrolls = scroller === list;
    const scrollerName = scroller ? `${scroller.tagName.toLowerCase()}.${[...scroller.classList].join('.')}` : 'page';
    const cards = [...list.querySelectorAll('.campground-card')];
    return {
      found: true,
      index: cards.indexOf(card),
      name: card.querySelector('.card-main')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60),
      offBy: Math.round(card.getBoundingClientRect().top - target),
      listScrolls,
      scrollerName,
      pageScrollTop: document.scrollingElement.scrollTop,
      pickerOpen: !!card.querySelector('app-add-to-trip, .add-to-trip, [class*="picker"]'),
    };
  });
  await browser.close();
  return { width, who: who?.email ?? 'anonymous', button, total, popup: name, ...r, errors: errors.slice(0, 3) };
}

const { server, url } = await serveSpa(BUILD_DIR);
const results = [];
try {
  results.push(await run(url, { width: 1400, height: 900, who: null, button: 'View details' }));
  results.push(await run(url, { width: 1400, height: 900, who: { email: 'admin@campsites.test', password: 'campsites-admin' }, button: 'Add to trip' }));
  results.push(await run(url, { width: 390, height: 844, who: null, button: 'View details' }));
} finally {
  server.close();
}
let ok = true;
for (const r of results) {
  const pass = r.found && Math.abs(r.offBy) <= 2 && r.name?.toUpperCase().includes((r.popup ?? '#').toUpperCase().slice(0, 15)) && r.errors.length === 0 &&
    (r.width < 900 || (r.pageScrollTop === 0 && r.listScrolls));
  ok &&= pass;
  console.log(pass ? 'PASS' : 'FAIL', JSON.stringify(r));
}
console.log(ok ? 'SCROLL CHECK PASSED: 3 of 3.' : 'SCROLL CHECK FAILED.');
process.exit(ok ? 0 : 1);
