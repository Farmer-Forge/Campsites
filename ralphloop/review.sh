#!/bin/bash
# ==============================================================================
# REVIEW — start (or refresh) the app on this server for browser QC.
# ==============================================================================
# Serves the canonical clone's current main with Angular's dev server
# (ng serve) at http://<this server's LAN IP>:4200, so the app can be checked from a browser anywhere on the home
# network (e.g. Bart) — no SSH tunnels. GitHub stays the source of truth for
# the code; this is only for looking at it running.
#
# Idempotent — run it any time: it rewrites
# src/environments/environment.local.ts (the app's local settings; the
# development configuration swaps it in for environment.ts), installs packages only
# when package.json/package-lock.json changed, and (re)starts the review
# container. The container restarts on its own after a reboot, and the dev
# server picks up new code by itself as main moves (e.g. as chain.sh merges
# tasks); re-run this after a task adds packages. chain.sh runs it as its
# last step.
#
# Run ON the server, as the claude account, from the repo root:
#   ./ralphloop/review.sh
# Stop it when done: docker rm -f campsites-dev
#
# Test-only overrides: RALPH_REVIEW_HOST, RALPH_REVIEW_WAIT_SECONDS,
# RALPH_SUPABASE_ENV, RALPH_SEED_SCRIPT.
# ==============================================================================

set -euo pipefail

CONTAINER="campsites-dev"
IMAGE="campsites-claude-worker:latest"
PORT=4200
SUPABASE_ENV="${RALPH_SUPABASE_ENV:-$HOME/.secrets/campsites-supabase.env}"
WAIT_SECONDS="${RALPH_REVIEW_WAIT_SECONDS:-60}"

fail() { echo -e "\033[31m[Error] $*\033[0m" >&2; exit 1; }

[ -f ralphloop/task.md ] && [ -e .git ] || fail "Run this from the repo root, e.g. ./ralphloop/review.sh"
[ -f package.json ] || { echo "Nothing to review yet — there's no package.json on this branch (the app's scaffold task hasn't been merged)."; exit 1; }
[ -f "$SUPABASE_ENV" ] || fail "$SUPABASE_ENV not found (Task 1's Supabase values)."

# This server's address on the home network: the source address it would use
# to reach the internet.
HOST="${RALPH_REVIEW_HOST:-$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit } }')}"
[ -n "$HOST" ] || fail "Couldn't work out this server's LAN address. Set RALPH_REVIEW_HOST and re-run."

# The app's settings — Task 1's values, but with Supabase's address changed
# from 127.0.0.1 (which only means "this server" from inside it) to the LAN
# address, so a browser on another machine can reach it too.
(
    set -a
    # shellcheck disable=SC1090
    . "$SUPABASE_ENV"
    set +a
    API_PORT="${SUPABASE_URL##*:}"
    API_PORT="${API_PORT%%/*}"
    umask 077
    mkdir -p src/environments
    printf "export const environment = {\n  production: false,\n  supabaseUrl: 'http://%s:%s',\n  supabaseAnonKey: '%s',\n};\n" \
        "$HOST" "$API_PORT" "$SUPABASE_ANON_KEY" > src/environments/environment.local.ts
)
chmod 600 src/environments/environment.local.ts

# Make sure the dev login (admin@campsites.test / campsites-admin) and starter data exist.
SEED="${RALPH_SEED_SCRIPT:-$(dirname "${BASH_SOURCE[0]}")/seed-dev.sh}"
bash "$SEED" || echo "⚠️  Dev seed failed — run ./ralphloop/seed-dev.sh by hand to see why."

# Install packages only when they changed since the last install.
STAMP="node_modules/.review-installed"
if [ ! -f "$STAMP" ] || [ package.json -nt "$STAMP" ] \
    || { [ -f package-lock.json ] && [ package-lock.json -nt "$STAMP" ]; }; then
    echo "📦 Installing packages…"
    docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp \
        -v "$PWD:$PWD" -w "$PWD" "$IMAGE" npm install
    mkdir -p node_modules
    touch "$STAMP"
fi

# (Re)start the dev server. --restart unless-stopped brings it back after a reboot.
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" --restart unless-stopped --network host \
    --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD:$PWD" -w "$PWD" \
    "$IMAGE" npx ng serve --host 0.0.0.0 --port "$PORT" >/dev/null

if [ "$WAIT_SECONDS" -gt 0 ]; then
    READY=0
    for ((i = 0; i < WAIT_SECONDS; i++)); do
        if curl -s -o /dev/null "http://localhost:${PORT}/"; then READY=1; break; fi
        sleep 1
    done
    if [ "$READY" != "1" ]; then
        docker logs --tail 20 "$CONTAINER" 2>&1 || true
        fail "The app didn't come up on port ${PORT} within ${WAIT_SECONDS}s — see the container log above."
    fi
fi

STUDIO_PORT=$(awk '/^\[studio\]/ { s = 1; next } /^\[/ { s = 0 } s && /^port *=/ { print $3; exit }' supabase/config.toml 2>/dev/null || true)
echo -e "\033[32m✅ Review app running: http://${HOST}:${PORT}\033[0m"
echo "   Dev login: admin@campsites.test / campsites-admin"
if [ -n "$STUDIO_PORT" ]; then
    echo "   Supabase Studio (database): http://${HOST}:${STUDIO_PORT}"
fi
echo "   If a browser elsewhere on the network can't reach the app, open the port once — as yourself, not claude (it has no sudo):"
echo "   sudo ufw allow from ${HOST%.*}.0/24 to any port ${PORT} proto tcp"
