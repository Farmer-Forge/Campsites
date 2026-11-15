// CONSOLE CHECK — loads the app's production build in headless Chromium and
// fails on any console error, uncaught page error or failed request to the
// app's own files. Part of the loop's gate (app-check.sh), and runnable by
// hand in the worker image:
//
//   node ralphloop/console-check.mjs dist/campsite-finder/browser
//
// Why: the review app used to run a development build, so a crash that only
// happens in the optimized bundle (the #38 map crash) reached users. This
// check runs the bundle users get, against the local Supabase stack
// (SUPABASE_URL, SUPABASE_ANON_KEY from the loop's env file), with the dev
// seed's logins (ralphloop/seed-dev.sh). Map tiles are stubbed with a blank
// image so the check never calls OpenStreetMap; every other request is real.
//
// Needs the worker image: Playwright is installed globally there and found
// through NODE_PATH.
import { createRequire } from 'node:module';
import { serveSpa } from './serve-spa.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BUILD_DIR = process.argv[2];
const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!BUILD_DIR || !SUPABASE_URL || !ANON_KEY) {
  console.error('usage: SUPABASE_URL=… SUPABASE_ANON_KEY=… node console-check.mjs <build dir>');
  process.exit(2);
}

// The dev seed's accounts (ralphloop/seed-dev.sql, task.md Global Constraints).
const ADMIN = { email: 'admin@campsites.test', password: 'campsites-admin' };
const CAMPER = { email: 'pat@campsites.test', password: 'campsites-pat' };

const PUBLIC_PATHS = ['/', '/about', '/login', '/signup', '/forgot-password', '/reset-password', '/no-such-page'];
const ADMIN_PATHS = ['/', '/favorites', '/trips', '/account', '/admin'];
const CAMPER_PATHS = ['/favorites', '/trips']; // plus /trips/<pat's first trip>

const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const SETTLE_MS = 1500;

const problems = [];
let pagesChecked = 0;

// supabase-js keeps the session in localStorage under sb-<first label of the
// API host>-auth-token (e.g. sb-127-auth-token for http://127.0.0.1:54321).
const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

async function signIn({ email, password }) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in as ${email} failed: HTTP ${res.status} ${await res.text()}`);
  const session = await res.json();
  if (!session.expires_at) session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
  return session;
}

async function firstTripId(session) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trips?select=id&order=id&limit=1`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0]?.id ?? null;
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

async function visit(context, base, path, who, { mustStay = false } = {}) {
  const page = await context.newPage();
  const where = `[${who}] ${path}`;
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`${where}: console error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`${where}: uncaught error: ${err.stack || err.message}`));
  page.on('requestfailed', (req) => {
    if (req.url().startsWith(base)) problems.push(`${where}: request failed: ${req.url()} (${req.failure()?.errorText})`);
  });
  try {
    await page.goto(base + path, { waitUntil: 'load', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    if (path === '/') {
      // The map's right-click popup is where #38 showed up.
      const map = await page.$('.leaflet-container');
      if (map) {
        await map.click({ button: 'right' }).catch((e) => problems.push(`${where}: couldn't right-click the map: ${e.message}`));
      }
    }
    await page.waitForTimeout(SETTLE_MS);
    if (mustStay) {
      const landed = new URL(page.url()).pathname;
      if (landed !== path) problems.push(`${where}: ended on ${landed}, not ${path} (the login didn't take?)`);
    }
  } catch (err) {
    problems.push(`${where}: didn't load: ${err.message}`);
  }
  pagesChecked += 1;
  await page.close();
}

const { server, url: base } = await serveSpa(BUILD_DIR);
const browser = await chromium.launch();
try {
  let ctx = await newContext(browser, null);
  for (const p of PUBLIC_PATHS) await visit(ctx, base, p, 'anonymous');
  await ctx.close();

  const admin = await signIn(ADMIN);
  ctx = await newContext(browser, admin);
  for (const p of ADMIN_PATHS) await visit(ctx, base, p, 'admin', { mustStay: true });
  await ctx.close();

  const camper = await signIn(CAMPER);
  const trip = await firstTripId(camper);
  ctx = await newContext(browser, camper);
  for (const p of CAMPER_PATHS) await visit(ctx, base, p, 'camper', { mustStay: true });
  if (trip !== null) await visit(ctx, base, `/trips/${trip}`, 'camper', { mustStay: true });
  else problems.push('[camper] the dev seed gives pat@campsites.test no trip, so /trips/<id> was not checked');
  await ctx.close();
} catch (err) {
  problems.push(`console check failed to run: ${err.stack || err.message}`);
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.log(`CONSOLE CHECK FAILED: ${problems.length} problem(s) on ${pagesChecked} page load(s):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log(`CONSOLE CHECK PASSED: ${pagesChecked} page loads, no console errors.`);
