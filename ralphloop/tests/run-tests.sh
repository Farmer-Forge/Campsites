#!/usr/bin/env bash
# ==============================================================================
# Tests for doloop.sh and loop-lib.sh. No test framework on purpose (one
# hasn't been chosen yet) — plain bash with a few assert helpers. Needs bash,
# git and jq, so run on ralph (WSL has no jq): ralphloop/tests/run-on-ralph.sh
#
#   bash ralphloop/tests/run-tests.sh            # everything
#   bash ralphloop/tests/run-tests.sh classify   # only test_* names containing "classify"
# ==============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOOP_DIR="$(dirname "$HERE")"
source "$LOOP_DIR/loop-lib.sh"

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  ✗ $1"; }
assert_eq() {
    if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 — expected [$3], got [$2]"; fi
}
assert_contains() {
    if grep -qF -- "$3" <<< "$2"; then ok "$1"; else bad "$1 — [$3] not found in: $(head -c 400 <<< "$2")"; fi
}
assert_not_contains() {
    if grep -qF -- "$3" <<< "$2"; then bad "$1 — [$3] was found"; else ok "$1"; fi
}

for f in "$HERE"/test-*.sh; do source "$f"; done

ONLY="${1:-}"
for t in $(declare -F | awk '{print $3}' | grep '^test_'); do
    if [ -z "$ONLY" ] || [[ "$t" == *"$ONLY"* ]]; then
        echo "$t"
        "$t"
    fi
done

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
