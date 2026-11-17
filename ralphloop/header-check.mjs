// HEADER CHECK — task.md Task 11 (spec 2, change #6: Forge Outdoors · Campsites).
// Loads the app's production build in headless Chromium and checks the rebranded header:
//   1. Tab titles: "Campsites · Forge Outdoors" on the Finder; "<page> · Campsites · Forge Outdoors"
//      on titled pages (About Us, Sign in after the guard's redirect, Page not found, Admin, Trip).
//   2. Brand: one link to "/" holding the badge (loaded from /forge-outdoors-badge.svg, 60px wide,
//      40px on a phone) and the wordmark "Forge Outdoors"; the section label "Campsites".
//   3. The old name: "Campsite Finder" appears nowhere on the Finder or the About page.
//   4. Contrast: every nav link, user pill, nav button and the section label is at least 4.5:1
//      against its own solid background, at rest, and each main link on hover (1280px).
//      A translucent background can't be judged and fails.
//   5. Tap size: every nav link and user pill is at least 44px tall.
//   6. Brand tokens and font: the --rt-* values on :root match the brand pack, the body font is
//      Archivo, and the declared web fonts include Archivo and not Work Sans.
//   7. Fit: at 390px nothing scrolls sideways (page or header); at 1280px the header is one
//      row (at most 100px tall), signed out and signed in as the admin (the most items).
// Pages: signed out at 1280px and 390px (/, plus /about, /favorites, /no-such-page for titles),
// the admin on /trips at 1280px and 390px and on /admin, the camper on their first trip.
// One PASS or FAIL line per case. Exit 0 if all pass, 1 if any fails, 2 if the check itself
// couldn't run (usage, sign-in, a page or the Google fonts didn't load).
//
//   node ralphloop/header-check.mjs dist/campsite-finder/browser
//
// Needs the worker image (Playwright through NODE_PATH), the local stack (SUPABASE_URL,
// SUPABASE_ANON_KEY) and the dev seed's logins. Map tiles are stubbed; Google Fonts load for real.
// Written by Lisa, 2026-11-16, and checked against builds of main (fails 1–6) and Task 11 (passes).
import { createRequire } from 'node:module';
import { serveSpa } from './serve-spa.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BUILD_DIR = process.argv[2];
const API = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
if (!BUILD_DIR || !API || !ANON) {
  console.error('usage: SUPABASE_URL=… SUPABASE_ANON_KEY=… node header-check.mjs <build dir>');
  process.exit(2);
}
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const ADMIN = { email: 'admin@campsites.test', password: 'campsites-admin' };
const CAMPER = { email: 'pat@campsites.test', password: 'campsites-pat' };
const WIDE = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const SUFFIX = 'Campsites · Forge Outdoors';
// The brand pack's values (spec 2, change #6). --rt-mustard was already right.
const TOKENS = {
  '--rt-teal': '#2f8f89',
  '--rt-teal-deep': '#1f6b66',
  '--rt-cherry': '#c8402a',
  '--rt-cherry-dark': '#9a2e1d',
  '--rt-ink': '#2b2420',
  '--rt-cream': '#f5ead6',
  '--rt-mustard': '#e8a93a',
};
const MIN_CONTRAST = 4.5;
const MIN_TAP = 43.5; // 44px, less half a pixel of rounding
const STORAGE_KEY = `sb-${new URL(API).hostname.split('.')[0]}-auth-token`;

async function signIn({ email, password }) {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in as ${email} failed: HTTP ${res.status}`);
  const session = await res.json();
  if (!session.expires_at) session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
  return session;
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

async function newContext(browser, session) {
  const context = await browser.newContext();
  await context.route(/\.tile\.openstreetmap\.org\//, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG }),
  );
  if (session) {
    await context.addInitScript(
      ([key, value]) => {
        if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value);
      },
      [STORAGE_KEY, JSON.stringify(session)],
    );
  }
  return context;
}

// Runs in the page: everything the cases judge, measured once the page and its fonts settle.
const MEASURE = () => {
  const parse = (s) => {
    const m = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(s.trim());
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
  };
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratioOf = (el) => {
    const fg = parse(getComputedStyle(el).color);
    if (!fg || fg[3] !== 1) return null;
    for (let e = el; e; e = e.parentElement) {
      const bg = parse(getComputedStyle(e).backgroundColor);
      if (!bg) return null;
      if (bg[3] === 0) continue;
      if (bg[3] !== 1) return null; // translucent: can't judge
      const [a, b] = [lum(fg), lum(bg)];
      return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
    }
    return null;
  };
  const nav = document.querySelector('.app-nav');
  if (!nav) return { noNav: true };
  const items = [...nav.querySelectorAll('.nav-link, .nav-pill, button, .section-label')].map((el) => ({
    text: el.textContent.trim(),
    link: el.matches('.nav-link, .nav-pill'),
    ratio: ratioOf(el),
    height: Math.round(el.getBoundingClientRect().height * 10) / 10,
  }));
  const brands = nav.querySelectorAll('a.brand');
  const brand = brands[0];
  const img = brand?.querySelector('img.brand-badge');
  const rootStyle = getComputedStyle(document.documentElement);
  return {
    path: location.pathname,
    title: document.title,
    items,
    brand: {
      count: brands.length,
      href: brand?.getAttribute('href') ?? null,
      badgeLoaded: !!img && img.complete && img.naturalWidth > 0 && new URL(img.src).pathname === '/forge-outdoors-badge.svg',
      badgeWidth: img ? Math.round(img.getBoundingClientRect().width) : null,
      wordmark: brand?.querySelector('.wordmark')?.textContent.trim() ?? null,
      label: nav.querySelector('.section-label')?.textContent.trim() ?? null,
    },
    oldName: /campsite finder/i.test(document.body.innerText) || /campsite finder/i.test(document.title),
    tokens: Object.fromEntries(
      ['--rt-teal', '--rt-teal-deep', '--rt-cherry', '--rt-cherry-dark', '--rt-ink', '--rt-cream', '--rt-mustard'].map(
        (k) => [k, rootStyle.getPropertyValue(k).trim().toLowerCase()],
      ),
    ),
    bodyFont: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, '').trim(),
    // The production build inlines the Google Fonts CSS, so read the declared faces, not a <link>.
    fontFamilies: [...new Set([...document.fonts].map((f) => f.family.replace(/["']/g, '')))],
    overflow: document.documentElement.scrollWidth > window.innerWidth || nav.scrollWidth > nav.clientWidth,
    navHeight: Math.round(nav.getBoundingClientRect().height),
    fontsFailed: [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family),
    scriptLoaded: [...document.fonts].some((f) => /Yellowtail/.test(f.family) && f.status === 'loaded'),
  };
};

const seen = {}; // label → MEASURE() result (+ hover ratios)
const errors = [];

async function look(ctx, base, label, path, viewport, { hover = false } = {}) {
  const page = await ctx.newPage();
  try {
    await page.setViewportSize(viewport);
    await page.goto(base + path, { waitUntil: 'load', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const m = await page.evaluate(MEASURE);
    if (m.noNav) throw new Error('no .app-nav on the page');
    if (m.fontsFailed.length) throw new Error(`fonts failed to load: ${m.fontsFailed.join(', ')}`);
    if (!m.scriptLoaded) throw new Error('Yellowtail never loaded: Google Fonts unreachable, layout cannot be judged');
    if (hover) {
      // Hover each main link in turn and re-measure it (MEASURE reads computed styles live).
      m.hover = [];
      const links = page.locator('.app-nav .nav-link');
      const n = await links.count();
      for (let i = 0; i < n; i++) {
        await links.nth(i).hover();
        await page.waitForTimeout(100);
        const r = await page.evaluate(MEASURE);
        m.hover.push(r.items.filter((it) => it.link)[i]);
      }
      await page.mouse.move(5, viewport.height - 5);
    }
    seen[label] = m;
  } catch (e) {
    errors.push(`${label} (${path}): ${e.message}`);
  } finally {
    await page.close();
  }
}

const { server, url: base } = await serveSpa(BUILD_DIR);
const browser = await chromium.launch();
try {
  let ctx = await newContext(browser, null);
  await look(ctx, base, 'anon-wide', '/', WIDE, { hover: true });
  await look(ctx, base, 'anon-phone', '/', PHONE);
  await look(ctx, base, 'anon-about', '/about', WIDE);
  await look(ctx, base, 'anon-favorites', '/favorites', WIDE);
  await look(ctx, base, 'anon-404', '/no-such-page', WIDE);
  await ctx.close();

  ctx = await newContext(browser, await signIn(ADMIN));
  await look(ctx, base, 'admin-wide', '/trips', WIDE);
  await look(ctx, base, 'admin-phone', '/trips', PHONE);
  await look(ctx, base, 'admin-admin', '/admin', WIDE);
  await ctx.close();

  const camper = await signIn(CAMPER);
  const trip = await firstTripId(camper);
  ctx = await newContext(browser, camper);
  await look(ctx, base, 'camper-trip', `/trips/${trip}`, WIDE);
  await ctx.close();
} catch (e) {
  errors.push(`setup: ${e.message}`);
} finally {
  await browser.close();
  server.close();
}

if (errors.length) {
  for (const e of errors) console.log(`ERROR ${e}`);
  console.log('HEADER CHECK COULD NOT RUN (see ERROR lines).');
  process.exit(2);
}

const CASES = [
  [
    '1 titles',
    () => {
      const want = {
        'anon-wide': ['/', SUFFIX],
        'anon-about': ['/about', `About Us · ${SUFFIX}`],
        'anon-favorites': ['/login', `Sign in · ${SUFFIX}`],
        'anon-404': ['/no-such-page', `Page not found · ${SUFFIX}`],
        'admin-admin': ['/admin', `Admin · ${SUFFIX}`],
        'camper-trip': [null, `Trip · ${SUFFIX}`],
      };
      const bad = Object.entries(want)
        .filter(([k, [path, title]]) => seen[k].title !== title || (path && seen[k].path !== path))
        .map(([k]) => `${k}: "${seen[k].title}" on ${seen[k].path}`);
      return [bad.length === 0, bad];
    },
  ],
  [
    '2 brand',
    () => {
      const bad = [];
      for (const [k, w] of [['anon-wide', 60], ['anon-phone', 40]]) {
        const b = seen[k].brand;
        if (b.count !== 1 || b.href !== '/' || !b.badgeLoaded || Math.abs(b.badgeWidth - w) > 1 || b.wordmark !== 'Forge Outdoors' || b.label !== 'Campsites')
          bad.push(`${k}: ${JSON.stringify(b)} (badge should be ${w}px)`);
      }
      return [bad.length === 0, bad];
    },
  ],
  [
    '3 old name',
    () => {
      const bad = ['anon-wide', 'anon-about'].filter((k) => seen[k].oldName);
      return [bad.length === 0, bad];
    },
  ],
  [
    '4 contrast',
    () => {
      const bad = [];
      const minCount = { 'anon-wide': 6, 'anon-phone': 6, 'admin-wide': 8, 'admin-phone': 8, 'admin-admin': 8 };
      for (const [k, n] of Object.entries(minCount)) {
        if (seen[k].items.length < n) bad.push(`${k}: only ${seen[k].items.length} header items, expected ${n}`);
        for (const it of seen[k].items)
          if (it.ratio === null || it.ratio < MIN_CONTRAST) bad.push(`${k} "${it.text}": ${it.ratio}`);
      }
      for (const it of seen['anon-wide'].hover)
        if (!it || it.ratio === null || it.ratio < MIN_CONTRAST) bad.push(`anon-wide hover "${it?.text}": ${it?.ratio}`);
      return [bad.length === 0, bad];
    },
  ],
  [
    '5 tap size',
    () => {
      const bad = [];
      for (const k of ['anon-wide', 'anon-phone', 'admin-wide', 'admin-phone'])
        for (const it of seen[k].items) if (it.link && it.height < MIN_TAP) bad.push(`${k} "${it.text}": ${it.height}px`);
      return [bad.length === 0, bad];
    },
  ],
  [
    '6 tokens and font',
    () => {
      const m = seen['anon-wide'];
      const bad = Object.entries(TOKENS)
        .filter(([k, v]) => m.tokens[k] !== v)
        .map(([k, v]) => `${k} is "${m.tokens[k]}", want ${v}`);
      if (m.bodyFont !== 'Archivo') bad.push(`body font is ${m.bodyFont}`);
      if (!m.fontFamilies.includes('Archivo') || m.fontFamilies.includes('Work Sans'))
        bad.push(`declared fonts: ${m.fontFamilies.join(', ')} (want Archivo, not Work Sans)`);
      return [bad.length === 0, bad];
    },
  ],
  [
    '7 fit',
    () => {
      const bad = ['anon-phone', 'admin-phone'].filter((k) => seen[k].overflow).map((k) => `${k}: scrolls sideways`);
      for (const k of ['anon-wide', 'admin-wide'])
        if (seen[k].navHeight > 100) bad.push(`${k}: header ${seen[k].navHeight}px tall (wrapped)`);
      return [bad.length === 0, bad];
    },
  ],
];

let failed = 0;
for (const [name, judge] of CASES) {
  const [pass, detail] = judge();
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail.length ? `: ${detail.join('; ')}` : ''}`);
}
console.log(failed === 0 ? `HEADER CHECK PASSED: ${CASES.length} of ${CASES.length}.` : `HEADER CHECK FAILED: ${failed} of ${CASES.length}.`);
process.exit(failed === 0 ? 0 : 1);
