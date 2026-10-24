#!/usr/bin/env bash
# Stand-in for seed-dev.sh in chain.sh/review.sh tests (RALPH_SEED_SCRIPT). Prints a
# marker, and fails when RALPH_SEED_STUB_FAIL=1 (to prove a seed failure only warns).
echo "seed stub: ran"
[ "${RALPH_SEED_STUB_FAIL:-0}" != "1" ]
