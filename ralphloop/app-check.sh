#!/usr/bin/env bash
# ==============================================================================
# APP CHECK — the app half of the loop's gate (doloop.sh runs it after the
# database half). Runs INSIDE the worker image, in a task's worktree, with the
# loop's env file (SUPABASE_URL, SUPABASE_ANON_KEY). doloop.sh runs the copy in
# the loop's own checkout (mounted read-only at /ralph-loop), never the
# worktree's, so a worker can't change the check that judges it.
#
# 1. Writes the gitignored src/environments/environment.local.ts (the same
#    command as task.md's Global Constraints).
# 2. npm ci, only if node_modules is missing.
# 3. npm run lint.
# 4. ng build --configuration production,local: the optimized bundle users
#    get, pointed at the local stack (angular.json's "local" configuration
#    only swaps in environment.local.ts).
# 5. console-check.mjs on that build: headless Chromium, fails on any console
#    error.
#
# Workers can run it themselves before ticking a step:
#   bash ralphloop/app-check.sh
# Skips (exit 0) on a branch with no package.json yet.
# ==============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="dist/campsite-finder/browser"

if [ ! -f package.json ]; then
    echo "app check: skipped (no package.json on this branch yet)."
    exit 0
fi
: "${SUPABASE_URL:?app check: SUPABASE_URL is not set (the loop passes its env file)}"
: "${SUPABASE_ANON_KEY:?app check: SUPABASE_ANON_KEY is not set (the loop passes its env file)}"

mkdir -p src/environments && printf "export const environment = {\n  production: false,\n  supabaseUrl: '%s',\n  supabaseAnonKey: '%s',\n};\n" "$SUPABASE_URL" "$SUPABASE_ANON_KEY" > src/environments/environment.local.ts

if [ ! -d node_modules ]; then
    echo "== app check: npm ci (no node_modules yet)"
    npm ci --no-audit --no-fund
fi

echo "== app check: lint"
npm run lint

echo "== app check: production build (ng build --configuration production,local)"
rm -rf "$BUILD_DIR"
npx ng build --configuration production,local

echo "== app check: console check"
node "$HERE/console-check.mjs" "$BUILD_DIR"
