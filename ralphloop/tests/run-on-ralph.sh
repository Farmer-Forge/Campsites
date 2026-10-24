#!/usr/bin/env bash
# Copies this working copy's ralphloop/ to ~/looptest-campsites on ralph and runs the
# tests there (ralph has jq; WSL doesn't). The tests only ever touch throwaway
# temp directories — never ~/projects/Campsites. Run from anywhere in the repo:
#   bash ralphloop/tests/run-on-ralph.sh [test-name-filter]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
tar -cf - ralphloop | ssh -i ~/.ssh/ralph_claude -o BatchMode=yes claude@192.168.1.188 \
    "rm -rf ~/looptest-campsites && mkdir -p ~/looptest-campsites && tar -xf - -C ~/looptest-campsites && bash ~/looptest-campsites/ralphloop/tests/run-tests.sh ${1:-}"
