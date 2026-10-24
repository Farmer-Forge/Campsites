#!/bin/bash
# ==============================================================================
# DEV SEED: the dev admin login, the app's starter data, then its sample data. Safe to run any time.
# ==============================================================================
# Runs ralphloop/seed-dev.sql (the Forge core's dev admin) and then, if it exists,
# ralphloop/seed-app.sql (the app's starter categories) and ralphloop/seed-sample.sql
# (the app's sample users and items, for reviewers), through the worker image's
# psql, since ralph's host has no psql of its own. The dev login it guarantees is
# admin@mygear.test / mygear-admin, in the app's default units (defaultUnits in
# src/config/app.json, once Task 2 has created it).
#
# Run ON ralph, as the claude account, from the repo root:
#   ./ralphloop/seed-dev.sh
# chain.sh runs it after every merge; review.sh runs it before starting the app;
# reset-and-rerun.md runs it right after a database reset.
#
# Test-only override: RALPH_SUPABASE_ENV.
# ==============================================================================

set -euo pipefail

IMAGE="campsites-claude-worker:latest"
SUPABASE_ENV="${RALPH_SUPABASE_ENV:-$HOME/.secrets/campsites-supabase.env}"

fail() { echo -e "\033[31m[Error] $*\033[0m" >&2; exit 1; }

[ -f ralphloop/task.md ] && [ -e .git ] || fail "Run this from the repo root, e.g. ./ralphloop/seed-dev.sh"
[ -f "$SUPABASE_ENV" ] || fail "$SUPABASE_ENV not found (Task 1's Supabase values)."

DATABASE_URL=$(set -a; . "$SUPABASE_ENV"; echo "${DATABASE_URL:-}")
[ -n "$DATABASE_URL" ] || fail "DATABASE_URL is not set in $SUPABASE_ENV."

ARGS=(-v ON_ERROR_STOP=1)
UNITS=$(jq -r '.defaultUnits // empty' src/config/app.json 2>/dev/null || true)
[ -n "$UNITS" ] && ARGS+=(-v "default_units=$UNITS")
ARGS+=(-f ralphloop/seed-dev.sql)
[ -f ralphloop/seed-app.sql ] && ARGS+=(-f ralphloop/seed-app.sql)
[ -f ralphloop/seed-sample.sql ] && ARGS+=(-f ralphloop/seed-sample.sql)

docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$PWD:$PWD" -w "$PWD" "$IMAGE" \
    psql "$DATABASE_URL" "${ARGS[@]}"
