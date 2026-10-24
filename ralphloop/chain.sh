#!/bin/bash
# ==============================================================================
# CHAIN MODE — run doloop.sh task after task, unattended.
# ==============================================================================
# doloop.sh does exactly one task per run and stops at a PR so a person can
# review it. This wrapper takes the person out of that cycle: it squash-merges
# each finished task's PR, updates main, and runs doloop.sh again — until
# doloop.sh finishes without opening a PR (nothing left — the normal end), or
# stops on its own (BLOCKED, a failure or a used-up usage-limit budget).
#
# Trade-off, chosen explicitly by Shawn (2026-09-22): no review between tasks
# — review the whole result at the end instead. Because nobody looks before a
# merge any more, chain mode refuses to auto-merge a PR that changes the
# loop's own files (anything under ralphloop/ except task.md/activity.md, or
# .github/): those would run on ralph, outside the worker container, next
# round. Spec: docs/superpowers/specs/2026-09-22-loop-chain-design.md
#
# Run ON ralph, as the claude account, from the repo root, inside tmux:
#   set -a; source ~/.secrets/campsites-ralph-loop.env; set +a
#   ./ralphloop/chain.sh
# Safe to start while a doloop.sh run is already going in this clone — it
# waits for that run to finish first. Only one chain runs per clone (a lock
# file next to the clone). Everything is also appended to ../Campsites-chain.log.
#
# When it finishes normally, its last step runs review.sh, which starts the app
# on this server for browser QC at http://<server LAN IP>:5173.
#
# After every merge it also runs seed-dev.sh (dev admin login + starter data).
#
# On a normal finish it also writes ../Campsites-qc-checklist.md: every task's
# "QC (for Shawn…)" list from task.md, in order.
#
# Test-only overrides: RALPH_PUSH_URL, RALPH_POLL_SECONDS, RALPH_RETRY_SECONDS,
# RALPH_REVIEW_SCRIPT, RALPH_SEED_SCRIPT, RALPH_QC_FILE (plus everything doloop.sh accepts, which passes
# straight through to it).
# ==============================================================================

set -euo pipefail

REPO="Farmer-Forge/Campsites"
BASE_BRANCH="main"

if [ ! -f ralphloop/task.md ] || [ ! -e .git ]; then
    echo -e "\033[31m[Error] Run this from the repo root (the canonical clone), e.g. ./ralphloop/chain.sh\033[0m"
    exit 1
fi
if [ -z "${RALPH_GH_TOKEN:-}" ]; then
    echo -e "\033[31m[Error] RALPH_GH_TOKEN is not set. Export the fine-grained PAT before running.\033[0m"
    exit 1
fi

CANONICAL_ROOT="$(pwd -P)"
DOLOOP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/doloop.sh"
REVIEW="${RALPH_REVIEW_SCRIPT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/review.sh}"
SEED="${RALPH_SEED_SCRIPT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/seed-dev.sh}"
CHAIN_LOG="$(cd .. && pwd)/Campsites-chain.log"
LOCK_FILE="$(cd .. && pwd)/Campsites-chain.lock"
QC_FILE="${RALPH_QC_FILE:-$(cd .. && pwd)/Campsites-qc-checklist.md}"
PUSH_URL="${RALPH_PUSH_URL:-https://x-access-token:${RALPH_GH_TOKEN}@github.com/${REPO}.git}"
POLL_SECONDS="${RALPH_POLL_SECONDS:-30}"
RETRY_SECONDS="${RALPH_RETRY_SECONDS:-60}"
MAX_ROUNDS=20
export GIT_TERMINAL_PROMPT=0   # never hang on a credentials prompt inside tmux

exec > >(tee -a "$CHAIN_LOG") 2>&1

# Messages go to stderr so they reach the terminal/log even from inside $(...).
say()  { echo -e "\033[35m⛓  [$(date '+%Y-%m-%d %H:%M %Z')] $*\033[0m" >&2; }
stop() { say "$1"; exit "${2:-1}"; }

# finish <message> — the normal end: start the app for browser QC, then stop
# with exit 0. A review-app problem is only a warning — the tasks are merged.
# write_qc_checklist — gather every task's "QC (for Shawn…)" list from task.md,
# in task order and verbatim, into QC_FILE for Shawn's end-of-run review.
write_qc_checklist() {
    {
        echo "# Campsites QC checklist"
        echo
        echo "Generated $(date '+%Y-%m-%d %H:%M %Z') by chain.sh from ralphloop/task.md."
        echo "Sign in with the dev login: admin@campsites.test / campsites-admin."
        awk '
            /^## Task [0-9]+:/ { task = substr($0, 4); inqc = 0; next }
            /^\*\*QC \(for Shawn/ {
                print ""
                print "### " task
                rest = $0
                sub(/^\*\*QC \(for Shawn[^*]*\*\*[ ]*/, "", rest)
                if (rest != "") print rest
                inqc = 1
                next
            }
            inqc && (/^---$/ || /^## /) { inqc = 0; next }
            inqc { print }
        ' ralphloop/task.md
    } > "$QC_FILE"
}

finish() {
    say "$1"
    write_qc_checklist
    say "QC checklist: ${QC_FILE}"
    say "Last step: starting the app for browser QC…"
    bash "$REVIEW" || say "⚠️  The review app didn't start — run ./ralphloop/review.sh by hand to see why."
    exit 0
}
gh_()  { GH_TOKEN="$RALPH_GH_TOKEN" GH_PROMPT_DISABLED=1 gh "$@"; }

# retry <what> <command...> — up to 3 tries, RETRY_SECONDS apart. GitHub
# sometimes refuses a merge for a few seconds right after a PR is created,
# and one network blip shouldn't end an overnight run.
retry() {
    local what="$1" n=1
    shift
    until "$@"; do
        if [ "$n" -ge 3 ]; then return 1; fi
        say "⚠️  ${what} failed (try ${n}/3) — retrying in ${RETRY_SECONDS}s…"
        sleep "$RETRY_SECONDS"
        n=$((n + 1))
    done
}

# doloop_running_here — true while a doloop.sh started in THIS clone is
# running (another clone's loop, e.g. a test sandbox, doesn't count).
doloop_running_here() {
    local pid
    for pid in $(pgrep -f 'doloop\.sh' || true); do
        if [ "$(readlink "/proc/${pid}/cwd" 2>/dev/null)" = "$CANONICAL_ROOT" ]; then
            return 0
        fi
    done
    return 1
}

# open_task_prs — "<number> <branch>" per open PR from a ralph-loop/task-N
# branch of this repo (not a fork) into main.
open_task_prs() {
    gh_ pr list --repo "$REPO" --state open --limit 200 \
        --json number,headRefName,baseRefName,isCrossRepository \
        -q '.[] | select(.headRefName | startswith("ralph-loop/task-")) | select(.isCrossRepository | not) | select(.baseRefName == "main") | "\(.number) \(.headRefName)"'
}

# update_main — fast-forward local main from GitHub via the token URL (the
# clone's own origin may need credentials nobody is there to type).
update_main() {
    git fetch -q "$PUSH_URL" "$BASE_BRANCH" >/dev/null 2>&1 || return 1
    git merge -q --ff-only FETCH_HEAD >/dev/null   # errors shown: local paths only, no token
}

# unchecked_on_main — "- [ ]" steps left in task.md on the checked-out main.
unchecked_on_main() {
    grep -c '^- \[ \]' ralphloop/task.md || true
}

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    stop "🛑 Chain not started: another chain.sh is already running for this clone (lock: ${LOCK_FILE})."
fi

CURRENT_BRANCH="$(git symbolic-ref --short -q HEAD || true)"
if [ "$CURRENT_BRANCH" != "$BASE_BRANCH" ]; then
    stop "🛑 Chain not started: this clone is on '${CURRENT_BRANCH:-a detached HEAD}', not ${BASE_BRANCH}. Run: git switch ${BASE_BRANCH}, then re-run chain.sh."
fi

say "Chain started in ${CANONICAL_ROOT} (log: ${CHAIN_LOG})"

if doloop_running_here; then
    say "Waiting for the doloop.sh run already in progress here to finish…"
    while doloop_running_here; do sleep "$POLL_SECONDS"; done
    say "That run has finished — taking over."
fi

ROUND=0
while :; do
    ROUND=$((ROUND + 1))
    if [ "$ROUND" -gt "$MAX_ROUNDS" ]; then
        stop "🛑 Chain stopped: ${MAX_ROUNDS} rounds without finishing — something is going round in circles. Check the log."
    fi

    # 1. Merge the finished task's PR, if there is one.
    retry "Updating ${BASE_BRANCH}" update_main \
        || stop "🛑 Chain stopped: couldn't fast-forward ${BASE_BRANCH} from GitHub (network, token, or local changes in the way — see any error above)."
    UNCHECKED_BEFORE=$(unchecked_on_main)
    MERGED=""
    PRS=$(retry "Listing open PRs" open_task_prs) \
        || stop "🛑 Chain stopped: couldn't list open PRs on GitHub (network, or RALPH_GH_TOKEN)."
    if [ "$(grep -c . <<< "$PRS" || true)" -gt 1 ]; then
        stop "🛑 Chain stopped: more than one open ralph-loop PR — merge or close the extras by hand, then re-run chain.sh:
${PRS}"
    fi
    if [ -n "$PRS" ]; then
        PR_NUM="${PRS%% *}"
        PR_BRANCH="${PRS#* }"
        CHANGED=$(retry "Reading PR #${PR_NUM}'s files" gh_ pr diff "$PR_NUM" --repo "$REPO" --name-only) \
            || stop "🛑 Chain stopped: couldn't read PR #${PR_NUM}'s changed files from GitHub."
        FORBIDDEN=$(grep -E '^(ralphloop/|\.github/)' <<< "$CHANGED" | grep -vxE 'ralphloop/(task|activity)\.md' || true)
        if [ -n "$FORBIDDEN" ]; then
            stop "🛑 Chain stopped: PR #${PR_NUM} changes the loop's own files, which chain mode never auto-merges (they would run on ralph next round). Review it by hand:
${FORBIDDEN}"
        fi
        say "Squash-merging PR #${PR_NUM} (${PR_BRANCH})…"
        retry "Merging PR #${PR_NUM}" gh_ pr merge "$PR_NUM" --repo "$REPO" --squash \
            || stop "🛑 Chain stopped: merging PR #${PR_NUM} failed (a conflict, or GitHub refused). Merge it by hand, then re-run chain.sh."
        # Output discarded: git could echo the token-bearing URL in an error.
        git push -q "$PUSH_URL" --delete "$PR_BRANCH" >/dev/null 2>&1 \
            || say "⚠️  Couldn't delete ${PR_BRANCH} on GitHub — harmless, delete it by hand later."
        MERGED="PR #${PR_NUM} (${PR_BRANCH})"
    fi

    # 2. Update main, so doloop.sh sees the merged task as done (skipping this
    #    is what produced the duplicate Task 2 PRs #9/#10).
    retry "Updating ${BASE_BRANCH}" update_main \
        || stop "🛑 Chain stopped: couldn't fast-forward ${BASE_BRANCH} from GitHub (network, token, or local changes in the way — see any error above)."
    if [ "$(git rev-parse HEAD)" != "$(git rev-parse FETCH_HEAD)" ]; then
        stop "🛑 Chain stopped: local ${BASE_BRANCH} doesn't match GitHub's after updating (local commits?). Sort out ${CANONICAL_ROOT}, then re-run chain.sh."
    fi

    # Keep the dev login and starter data in place as each task adds tables
    # (seed-dev.sql is idempotent). A failure is only a warning: the loop can go on.
    bash "$SEED" || say "⚠️  Dev seed failed — run ./ralphloop/seed-dev.sh by hand to see why."
    # Every merge must check off at least one more step on main. One that
    # doesn't would send the chain round in circles on the same task. (A task
    # split across two PRs is fine — each still checks steps off.)
    if [ -n "$MERGED" ] && [ "$(unchecked_on_main)" -ge "$UNCHECKED_BEFORE" ]; then
        stop "🛑 Chain stopped: merging ${MERGED} didn't check off any steps on ${BASE_BRANCH} — continuing would go round in circles. Look at that PR before re-running."
    fi

    # 3. One task — unless someone started a doloop.sh by hand meanwhile.
    if doloop_running_here; then
        stop "🛑 Chain stopped: another doloop.sh is running in this clone (started by hand?). Two at once would collide — let it finish, then re-run chain.sh."
    fi
    say "Round ${ROUND}: running doloop.sh…"
    set +e
    bash "$DOLOOP"
    RC=$?
    set -e
    if [ "$RC" -ne 0 ]; then
        stop "🛑 Chain stopped: doloop.sh exited ${RC} — its last message above says why. Fix that, then re-run chain.sh; it resumes where doloop.sh left off." "$RC"
    fi

    # 4. A clean run that opened no PR means there was nothing left to do.
    PRS=$(retry "Listing open PRs" open_task_prs) \
        || stop "🛑 Chain stopped: couldn't list open PRs on GitHub (network, or RALPH_GH_TOKEN)."
    if [ -z "$PRS" ]; then
        finish "✅ Chain finished: doloop.sh opened no PR — nothing left to run."
    fi
done
