// STATE CHECK — judges Task 13 (spec 3, change #14: state-run and retired campgrounds) in a
// production build, against the local stack and the dev seed's three sample OSM campgrounds
// (ralphloop/seed-osm.sql). The loop's own file: workers never edit it.
//
//   1. Finder: a sixth agency chip STATE, on by default, after FWS; the live sample State
//      campgrounds are in the list with a STATE tag; the retired one isn't; turning STATE off
//      removes them and leaves the others.
//   2. Saved state: a snapshot saved before this change (no agenciesVersion) comes back with
//      STATE on, and the app then saves agenciesVersion 2; turning STATE off and reloading
//      keeps it off (the app's own save, not a hand-written snapshot).
//   3. Favorites (Pat): the retired favorite's card shows "No longer listed", its + is disabled
//      and greyed (opacity 0.45), and in "Plan a trip" its tick is disabled; live cards have no
//      such tag and enabled controls at full opacity. A live State card's panel link reads
//      "Visit website", a federal card's "Reserve on recreation.gov".
//   4. Favorites map: the retired campground's popup has "View details ▸" and no
//      "Add to trip…"; a live favorite's popup has both.
//   5. The map's attribution links to https://www.openstreetmap.org/copyright.
//   6. About: section.credits links to the copyright page and names the Open Database License.
//   7. Trip detail (Pat's trip): "Choose a favorite to add..." doesn't offer the retired
//      favorite, and still offers a live one; the retired stop's card shows "No longer listed"
//      and the live stops' cards don't.
//   8. No console errors on any page above.
// Exit 0 all pass, 1 a case fails, 2 the check couldn't run (no build, the stack or the seed
// missing, or only network errors in the console).
//
//   node ralphloop/state-check.mjs dist/campsite-finder/browser
//
// Needs the worker image (Playwright through NODE_PATH), the local stack (SUPABASE_URL,
// SUPABASE_ANON_KEY) and the dev seed including seed-osm.sql. Map tiles are stubbed. Leaflet's
// map is reached by hooking window.L as the page loads, as in map-check.mjs.
// Written by Lisa, 2026-11-26.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { serveSpa } from './serve-spa.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BUILD_DIR = process.argv[2];
const API = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
if (!BUILD_DIR || !API || !ANON) {
  console.error('usage: SUPABASE_URL=… SUPABASE_ANON_KEY=… node state-check.mjs <build dir>');
  process.exit(2);
}
if (!existsSync(`${BUILD_DIR}/index.html`)) {
  console.log(`ERROR no build at ${BUILD_DIR}`);
  process.exit(2);
}
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const HOME = { latitude: 44.98, longitude: -93.27 }; // Minneapolis
const CAMPER = { email: 'pat@campsites.test', password: 'campsites-pat' };
const WIDE = { width: 1280, height: 800 };
const SETTLE_MS = 700;
const KEY = `sb-${new URL(API).hostname.split('.')[0]}-auth-token`;
const FINDER_KEY = 'campsite-finder.finder';
const FEDERAL = ['NPS', 'USFS', 'BLM', 'USACE', 'FWS'];
const LIVE_A = 'osm:node/900000001'; // Sample Lake State Park
const LIVE_B = 'osm:way/900000002'; // Sample River State Forest Campground
const RETIRED = 'osm:node/900000003'; // Sample Bluff State Park, in Pat's favorites
const RETIRED_NAME = 'Sample Bluff State Park';
const RETIRED_AT = { lat: 46.4, lng: -93.9 };
const RETIRED_STOP = 'osm:node/900000004'; // Sample Pines State Forest Campground, a stop on Pat's trip
const RETIRED_STOP_NAME = 'Sample Pines State Forest Campground';
const COPYRIGHT = 'https://www.openstreetmap.org/copyright';

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

async function rest(path, session) {
  const res = await fetch(`${API}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${session?.access_token ?? ANON}` },
  });
  if (!res.ok) throw new Error(`reading ${path} failed: HTTP ${res.status}`);
  return res.json();
}

const errors = []; // case 8

async function newContext(browser, session) {
  const ctx = await browser.newContext({ viewport: WIDE, geolocation: HOME, permissions: ['geolocation'] });
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

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
}

async function openPage(ctx, base, path, label, waitFor) {
  const page = await ctx.newPage();
  watch(page, label);
  await page.goto(base + path, { waitUntil: 'load', timeout: 30000 });
  if (waitFor) await page.waitForFunction(waitFor, null, { timeout: 30000 });
  await settle(page);
  return page;
}

const FINDER_READY = () => !!window.__map && document.querySelectorAll('.campground-card').length > 0;
const MAP_READY = () => !!window.__map && !!document.querySelector('.rt-map-frame');

// Runs in the page: the agency chips, and which sample OSM cards the list holds.
const FINDER_LOOK = (ids) => {
  const chips = [...document.querySelectorAll('.filter-group .chip')]
    .map((b) => ({ text: b.textContent.trim(), on: b.getAttribute('aria-pressed') === 'true' }))
    .filter((c) => /^[A-Z]+$/.test(c.text));
  const card = (id) => document.querySelector(`.campground-card[data-id="${id}"]`);
  const tags = (id) => [...(card(id)?.querySelectorAll('.tags .rt-tag') ?? [])].map((t) => t.textContent.trim());
  return {
    chips,
    cards: Object.fromEntries(ids.map((id) => [id, !!card(id)])),
    tagsA: tags(ids[0]),
    total: document.querySelectorAll('.campground-card').length,
  };
};

async function finderLook(page) {
  return page.evaluate(FINDER_LOOK, [LIVE_A, LIVE_B, RETIRED]);
}

// Opens the popup of the marker at `at` (or, with no `at`, the live favorite's marker nearest
// home that isn't the retired one) and lists its buttons.
async function popupButtons(page, at) {
  return page.evaluate(
    async ([target, retiredAt]) => {
      const map = window.__map;
      let cluster = null;
      map.eachLayer((l) => {
        if (l.getLayers && l.zoomToShowLayer) cluster = l;
      });
      if (!cluster) throw new Error('no marker cluster on the map');
      const near = (ll, p) => Math.abs(ll.lat - p.lat) < 1e-6 && Math.abs(ll.lng - p.lng) < 1e-6;
      const markers = cluster.getLayers().filter((x) => x.getPopup());
      const m = target
        ? markers.find((x) => near(x.getLatLng(), target))
        : markers.find((x) => !near(x.getLatLng(), retiredAt));
      if (!m) return null;
      map.closePopup();
      await new Promise((res) => cluster.zoomToShowLayer(m, res));
      m.openPopup();
      await new Promise((r) => setTimeout(r, 300));
      const popup = document.querySelector('.leaflet-popup');
      return {
        name: popup?.querySelector('strong')?.textContent ?? null,
        buttons: [...(popup?.querySelectorAll('button') ?? [])].map((b) => b.textContent.trim()),
      };
    },
    [at ?? null, RETIRED_AT],
  );
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
  // The seed must hold the three sample OSM campgrounds and Pat's retired favorite.
  const seeded = await rest(`campgrounds?select=id&id=in.(${[LIVE_A, LIVE_B, RETIRED, RETIRED_STOP].map((i) => `"${i}"`).join(',')})`);
  if (seeded.length !== 4) throw new Error(`the dev seed has ${seeded.length} of the 4 sample OSM campgrounds (run seed-dev.sh)`);
  const camper = await signIn(CAMPER);
  const favs = await rest('favorites?select=campground_id', camper);
  if (!favs.some((f) => f.campground_id === RETIRED) || !favs.some((f) => f.campground_id === LIVE_A)) {
    throw new Error("the dev seed doesn't give Pat the sample State favorites");
  }
  // The seed's trip, by name (seed-sample.sql / seed-osm.sql), not whichever trip sorts first.
  const trips = await rest(`trips?select=id&name=eq.${encodeURIComponent('Sample road trip')}`, camper);
  if (trips.length !== 1) throw new Error(`the dev seed gives pat@campsites.test ${trips.length} trips named "Sample road trip"`);
  const stops = await rest(`trip_stops?select=campground_id&trip_id=eq.${trips[0].id}`, camper);
  if (!stops.some((st) => st.campground_id === RETIRED_STOP)) throw new Error("the dev seed doesn't put the retired stop on Pat's trip");

  // Case 1: the Finder, signed out, fresh tab.
  {
    const ctx = await newContext(browser, null);
    const page = await openPage(ctx, base, '/', 'case1 finder', FINDER_READY);
    const before = await finderLook(page);
    const stateChip = page.locator('.filter-group .chip', { hasText: /^\s*STATE\s*$/ });
    let after = null;
    if ((await stateChip.count()) === 1) {
      await stateChip.click();
      await page.waitForFunction((id) => !document.querySelector(`.campground-card[data-id="${id}"]`), LIVE_A, { timeout: 15000 }).catch(() => {});
      await settle(page);
      after = await finderLook(page);
    }
    results[1] = { before, after };

    // Case 5: the attribution on this map.
    results[5] = await page.evaluate((href) => {
      const a = document.querySelector(`.leaflet-control-attribution a[href="${href}"]`);
      return { link: !!a, text: a?.textContent?.trim() ?? null, all: document.querySelector('.leaflet-control-attribution')?.textContent?.trim() ?? null };
    }, COPYRIGHT);

    // Case 2: the snapshot the Finder saved, made "old" (no agenciesVersion, five agencies),
    // restored on reload; then the app's own save, STATE turned off, and another reload.
    const readSaved = () => page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) ?? 'null'), FINDER_KEY);
    const snap = await readSaved();
    if (!snap) throw new Error('the Finder saved no snapshot to sessionStorage');
    const old = { ...snap, agencies: [...FEDERAL] };
    delete old.agenciesVersion;
    await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [FINDER_KEY, JSON.stringify(old)]);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(FINDER_READY, null, { timeout: 30000 });
    await settle(page);
    const fromOld = await finderLook(page);
    const savedAfterOld = await readSaved();
    let fromV2 = null;
    let savedOff = null;
    const chip = page.locator('.filter-group .chip', { hasText: /^\s*STATE\s*$/ });
    if ((await chip.count()) === 1 && fromOld.chips.find((c) => c.text === 'STATE')?.on) {
      await chip.click();
      await page.waitForFunction(
        (k) => !(JSON.parse(sessionStorage.getItem(k) ?? 'null')?.agencies ?? ['STATE']).includes('STATE'),
        FINDER_KEY,
        { timeout: 15000 },
      ).catch(() => {});
      savedOff = await readSaved();
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(FINDER_READY, null, { timeout: 30000 });
      await settle(page);
      fromV2 = await finderLook(page);
    }
    results[2] = { fromOld, savedAfterOld, savedOff, fromV2 };
    await ctx.close();
  }

  // Cases 3 and 4: Favorites as Pat.
  {
    const ctx = await newContext(browser, camper);
    const page = await openPage(ctx, base, '/favorites', 'case3 favorites', () => !!window.__map && document.querySelectorAll('.campground-card').length > 0);
    const cardsNow = (inPlan) =>
      page.evaluate(
        ([retired, plan]) => {
          const card = (el) => {
            const plus = el.querySelector('.add-to-trip-toggle');
            const tick = el.querySelector('.plan-check');
            return {
              id: el.getAttribute('data-id'),
              tags: [...el.querySelectorAll('.tags .rt-tag')].map((t) => t.textContent.trim()),
              plus: plus ? plus.disabled : null,
              plusOpacity: plus ? Number(getComputedStyle(plus).opacity) : null,
              title: plus?.getAttribute('title') ?? null,
              tick: plan ? (tick ? tick.disabled : null) : undefined,
            };
          };
          const cards = [...document.querySelectorAll('.campground-card')].map(card);
          return { retired: cards.find((c) => c.id === retired) ?? null, live: cards.filter((c) => c.id !== retired) };
        },
        [RETIRED, inPlan],
      );
    const plain = await cardsNow(false);
    // The panel link of a live State card and of a federal one.
    const panelLink = async (id) => {
      const main = page.locator(`.campground-card[data-id="${id}"] .card-main`);
      if ((await main.count()) !== 1) return null;
      await main.click();
      await page.waitForTimeout(SETTLE_MS);
      const text = await page.evaluate(
        (cid) => document.querySelector(`.campground-card[data-id="${cid}"] .links a.rt-btn--cherry`)?.textContent?.trim() ?? null,
        id,
      );
      await main.click();
      await page.waitForTimeout(SETTLE_MS);
      return text;
    };
    // Federal cards: some have no reservation link at all (NPS sends ''), so open up to three.
    const federal = [];
    for (const c of plain.live.filter((x) => !x.id.startsWith('osm:')).slice(0, 3)) federal.push(await panelLink(c.id));
    const links = { state: await panelLink(LIVE_A), federal };
    await page.locator('.plan-button').click();
    await page.waitForTimeout(SETTLE_MS);
    const plan = await cardsNow(true);
    results[3] = { ...plain, links, plan };
    results[4] = { retired: await popupButtons(page, RETIRED_AT), live: await popupButtons(page, null) };
    await ctx.close();
  }

  // Case 6: About.
  {
    const ctx = await newContext(browser, null);
    const page = await openPage(ctx, base, '/about', 'case6 about', () => !!document.querySelector('.about-hero'));
    results[6] = await page.evaluate((href) => {
      const s = document.querySelector('section.credits');
      return { section: !!s, link: !!s?.querySelector(`a[href="${href}"]`), text: s?.textContent?.replace(/\s+/g, ' ').trim() ?? null };
    }, COPYRIGHT);
    await ctx.close();
  }

  // Case 7: Trip detail's "Choose a favorite to add..." list.
  {
    const ctx = await newContext(browser, camper);
    const page = await openPage(ctx, base, `/trips/${trips[0].id}`, 'case7 trip', MAP_READY);
    await page.waitForFunction(() => document.querySelectorAll('select[aria-label="Choose a favorite to add"] option').length > 0, null, { timeout: 15000 }).catch(() => {});
    results[7] = await page.evaluate(() => ({
      options: [...document.querySelectorAll('select[aria-label="Choose a favorite to add"] option')]
        .map((o) => o.textContent.trim())
        .filter((t) => !t.startsWith('Choose')),
      stops: [...document.querySelectorAll('.stop-card')].map((el) => ({
        name: el.querySelector('.campground-name-link')?.textContent?.trim() ?? '',
        tags: [...el.querySelectorAll('.rt-tag')].map((t) => t.textContent.trim()),
      })),
    }));
    await ctx.close();
  }
} catch (err) {
  broken = err;
} finally {
  await browser?.close();
  server?.close();
}

if (broken) {
  console.log(`ERROR ${broken.message}`);
  process.exit(2);
}

const verdicts = [];
const judge = (n, title, bad) => verdicts.push({ n, title, bad });

{
  const { before, after } = results[1];
  const bad = [];
  const names = before.chips.map((c) => c.text);
  if (JSON.stringify(names) !== JSON.stringify([...FEDERAL, 'STATE'])) bad.push(`chips are ${JSON.stringify(names)}, not the five federal ones then STATE`);
  if (!before.chips.find((c) => c.text === 'STATE')?.on) bad.push('STATE is not on by default');
  if (!before.cards[LIVE_A] || !before.cards[LIVE_B]) bad.push(`live sample State campgrounds missing from the list: ${JSON.stringify(before.cards)}`);
  if (before.cards[RETIRED]) bad.push('the retired campground is in the Finder list');
  if (!before.tagsA.includes('STATE')) bad.push(`the live State card's tags are ${JSON.stringify(before.tagsA)}`);
  if (!after) bad.push('no single STATE chip to click');
  else {
    if (after.cards[LIVE_A] || after.cards[LIVE_B]) bad.push('turning STATE off left State campgrounds in the list');
    if (after.total === 0) bad.push('turning STATE off emptied the list');
    if (after.chips.find((c) => c.text === 'STATE')?.on) bad.push('STATE still shows as on after clicking it');
  }
  judge(1, 'State chip on the Finder', bad);
}
{
  const { fromOld, savedAfterOld, savedOff, fromV2 } = results[2];
  const bad = [];
  const on = (look) => look?.chips.find((c) => c.text === 'STATE')?.on;
  if (!on(fromOld) || !fromOld.cards[LIVE_A]) bad.push(`an old snapshot did not come back with STATE on: ${JSON.stringify({ chips: fromOld.chips, cards: fromOld.cards })}`);
  if (savedAfterOld?.agenciesVersion !== 2 || !savedAfterOld?.agencies?.includes('STATE')) bad.push(`after restoring, the app saved ${JSON.stringify({ v: savedAfterOld?.agenciesVersion, agencies: savedAfterOld?.agencies })}`);
  if (!fromV2) bad.push('could not turn STATE off to test the version 2 snapshot');
  else {
    if (savedOff?.agenciesVersion !== 2 || savedOff?.agencies?.includes('STATE')) bad.push(`with STATE off the app saved ${JSON.stringify({ v: savedOff?.agenciesVersion, agencies: savedOff?.agencies })}`);
    if (on(fromV2) || fromV2.cards[LIVE_A]) bad.push('the app\'s own snapshot with STATE off came back with STATE on');
  }
  judge(2, 'saved state upgrade', bad);
}
{
  const { retired, live } = results[3];
  const bad = [];
  if (!retired) bad.push("the retired favorite's card is missing on Favorites");
  else {
    if (!retired.tags.includes('No longer listed')) bad.push(`retired card tags ${JSON.stringify(retired.tags)}`);
    if (retired.plus !== true) bad.push(`retired card's + disabled = ${retired.plus}`);
    if (retired.title !== "No longer listed: can't be added to a trip") bad.push(`retired card's + title ${JSON.stringify(retired.title)}`);
    if (!(retired.plusOpacity > 0.4 && retired.plusOpacity < 0.5)) bad.push(`retired card's + opacity ${retired.plusOpacity}`);
  }
  const { plan, links } = results[3];
  if (plan.retired?.tick !== true) bad.push(`in Plan a trip the retired card's tick disabled = ${plan.retired?.tick}`);
  for (const c of plan.live) if (c.tick !== false) bad.push(`in Plan a trip live card ${c.id} tick disabled = ${c.tick}`);
  if (links.state !== 'Visit website') bad.push(`a live State card's link reads ${JSON.stringify(links.state)}`);
  if (links.federal.length === 0) bad.push('no federal favorite to open');
  for (const t of links.federal) if (t !== null && t !== 'Reserve on recreation.gov') bad.push(`a federal card's link reads ${JSON.stringify(t)}`);
  if (live.length === 0) bad.push('no live favorite cards');
  for (const c of live) {
    if (c.tags.includes('No longer listed')) bad.push(`live card ${c.id} says No longer listed`);
    if (c.plus !== false) bad.push(`live card ${c.id} + disabled = ${c.plus}`);
    if (c.plusOpacity !== 1) bad.push(`live card ${c.id} + opacity ${c.plusOpacity}`);
  }
  judge(3, 'retired card on Favorites', bad);
}
{
  const { retired, live } = results[4];
  const bad = [];
  if (!retired) bad.push("no marker for the retired favorite on Favorites' map");
  else {
    if (retired.name !== RETIRED_NAME) bad.push(`opened popup ${JSON.stringify(retired.name)}`);
    if (!retired.buttons.includes('View details ▸')) bad.push(`retired popup buttons ${JSON.stringify(retired.buttons)}`);
    if (retired.buttons.includes('Add to trip…')) bad.push('the retired popup offers Add to trip…');
  }
  if (!live || !live.buttons.includes('Add to trip…') || !live.buttons.includes('View details ▸')) bad.push(`live popup buttons ${JSON.stringify(live?.buttons)}`);
  judge(4, 'retired popup on the map', bad);
}
{
  const r = results[5];
  judge(5, 'OSM attribution link', r.link && r.text === 'OpenStreetMap' ? [] : [`attribution ${JSON.stringify(r)}`]);
}
{
  const r = results[6];
  const bad = [];
  if (!r.section) bad.push('no section.credits on About');
  else {
    if (!r.link) bad.push('section.credits has no link to the OSM copyright page');
    if (!/Open Database License/.test(r.text ?? '')) bad.push(`credits text ${JSON.stringify(r.text)}`);
  }
  judge(6, 'About data credit', bad);
}
{
  const { options: opts, stops } = results[7];
  const bad = [];
  if (opts.includes(RETIRED_NAME)) bad.push('the retired favorite is offered for the trip');
  if (opts.length === 0) bad.push('no live favorite is offered for the trip');
  const rs = stops.find((st) => st.name === RETIRED_STOP_NAME);
  if (!rs) bad.push(`no stop card for ${RETIRED_STOP_NAME}`);
  else if (!rs.tags.includes('No longer listed')) bad.push(`the retired stop's tags ${JSON.stringify(rs.tags)}`);
  for (const st of stops) if (st.name !== RETIRED_STOP_NAME && st.tags.includes('No longer listed')) bad.push(`live stop ${st.name} says No longer listed`);
  judge(7, 'trip: add list and retired stop', bad);
}
{
  const real = errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
  if (errors.length > 0 && real.length === 0) {
    console.log(`ERROR only network errors in the console: ${errors.join(' | ')}`);
    process.exit(2);
  }
  judge(8, 'no console errors', real);
}

let failed = 0;
for (const v of verdicts) {
  if (v.bad.length === 0) console.log(`PASS ${v.n} ${v.title}`);
  else {
    failed++;
    console.log(`FAIL ${v.n} ${v.title}: ${v.bad.join('; ')}`);
  }
}
if (failed > 0) {
  console.log(`STATE CHECK FAILED: ${failed} of ${verdicts.length}.`);
  process.exit(1);
}
console.log(`STATE CHECK PASSED: all ${verdicts.length}.`);
