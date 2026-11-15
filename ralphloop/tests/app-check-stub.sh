#!/usr/bin/env bash
# Stand-in for the gate's app check (RALPH_APP_CHECK_STUB) — doloop.sh runs it
# in the worktree instead of `docker run … app-check.sh`. Records
# "<worktree dir name>" per call in $RALPH_APP_CHECK_LOG and pops one result
# per call from $RALPH_APP_CHECK_RESULTS (default: pass): pass | fail.
set -euo pipefail
echo "$(basename "$PWD")" >> "${RALPH_APP_CHECK_LOG:?}"
if [ -n "${RALPH_SUPABASE_LOG:-}" ]; then echo "$(basename "$PWD") app-check" >> "$RALPH_SUPABASE_LOG"; fi
RES="${RALPH_APP_CHECK_RESULTS:?}"
NEXT=$(head -n 1 "$RES" 2>/dev/null || true)
sed -i 1d "$RES" 2>/dev/null || true
if [ "${NEXT:-pass}" = fail ]; then
    echo "CONSOLE CHECK FAILED: 1 problem(s) on 12 page load(s):"
    echo "  - [anonymous] /: uncaught error: TypeError: L.markerClusterGroup is not a function"
    exit 1
fi
echo "CONSOLE CHECK PASSED: 12 page loads, no console errors."
