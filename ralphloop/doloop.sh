#!/bin/bash
# ==============================================================================
# RALPH WIGGUM LOOP MANAGER — worktree + PR per task
# ==============================================================================
# Runs ON ralph. Each invocation does exactly ONE task from task.md, start to
# finish, in its own git worktree/branch, then pushes and opens a PR against
# main and exits — it does NOT continue to the next task automatically.
# Shawn reviews and merges the PR, then re-runs this script for the next task.
#
# Why one task per run, not the whole plan: tasks depend on each other's
# output (Task N+1's worktree branches from main, which only has Task N's
# work once its PR is merged), and Shawn wants a review checkpoint after each
# task rather than a single end-of-run diff covering several tasks at once.
#
# The worker (one `claude -p` call per step) runs inside a throwaway Docker
# container built from worker.Dockerfile, not directly as the host `claude`
# account. Only this task's worktree and this repo's own .git folder (git
# worktrees share object storage with the canonical clone, so .git must be
# reachable at its real host path) are mounted in — no other project, no
# Docker socket, and RALPH_GH_TOKEN is never passed into the container since
# push/PR happens in this outer script only, after the container has exited.
# The container does get Task 1's local-dev Supabase values (SUPABASE_URL,
# SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET, DATABASE_URL) via SUPABASE_ENV —
# steps need them to write .env.local and run migrations — same local-only,
# demo-credential stack described in create-new-project.md, not production.
#
# Prerequisites:
# - RALPH_GH_TOKEN env var set to a fine-grained GitHub PAT scoped to just
#   this repo (Contents: read/write, Pull requests: read/write, nothing
#   else) — never Shawn's own gh auth or SSH key.
# - campsites-claude-worker:latest built from ralphloop/worker.Dockerfile (see
#   that file's header for the build command).
# - Claude Code's own credentials available at $CLAUDE_AUTH_ENV below, in a
#   chmod-600 env file (never in this repo).
# - Task 1's Supabase values (SUPABASE_URL, SUPABASE_ANON_KEY,
#   SUPABASE_JWT_SECRET, DATABASE_URL) available at $SUPABASE_ENV below, in a
#   chmod-600 env file (never in this repo) — local-dev-only credentials.
# - Task 1 (Supabase provisioning) is real infrastructure needing Shawn's own
#   judgment. This script refuses to run it (see the check below) and expects it
#   done by hand in an interactive session. Work the loop must never run at all
#   (like MyGear's production deploy) lives in its own plan outside task.md.
# - jq on this host (`sudo apt install jq`) — the worker's output is read as
#   JSON to spot usage limits. Not needed inside the worker image.
# - loop-lib.sh next to this script (sourced below; tested by
#   ralphloop/tests/run-tests.sh).
#
# Resuming: after every step the worker completes, this script commits a
# "Checkpoint: …" commit in the task's worktree and pushes the branch. So a
# usage limit, crash, reboot or plain Ctrl-C loses at most the step in
# progress — re-run this script and it picks up at the next unchecked step,
# telling the worker about any partial work the interrupted step left. Usage
# limits are waited out automatically (see the step loop). Spec:
# docs/superpowers/specs/2026-09-22-loop-resume-and-usage-limit-retry-design.md
#
# Model: every worker call uses claude-sonnet-5-5 unless RALPH_MODEL is set,
# e.g. RALPH_MODEL=claude-opus-5-5 ./ralphloop/doloop.sh
#
# Gate: after every step that ticks a box, this script checks the worktree
# itself, in three parts, stopping at the first that fails (run_full_gate):
#   1. database: `supabase db reset` then `supabase test db` from the task's
#      worktree, on the host (workers have neither the Supabase CLI nor
#      Docker). This resets Campsites' own local stack (54321-54327);
#   2. the dev seed again (seed-dev.sh): the reset emptied the data the review
#      app on 4200 and the app check log in with;
#   3. app: ralphloop/app-check.sh in the worker image: lint, the production
#      build (ng build -c production,local) and console-check.mjs, which
#      loads that build in headless Chromium and fails on any console error.
#      (Closes the QC gap behind #38: QC had only ever run a dev build.)
# The gate's scripts come from this checkout, never the worktree. Only the
# gate's result counts. A failed gate unticks the step and the worker retries
# it with the output; after 3 failed attempts at one step the task's PR is
# opened as a draft flagged as failing and this script exits 1, so chain.sh
# stops. It runs only if the base branch has supabase/config.toml.
# RALPH_GATE_TIMEOUT (seconds, default 900) limits each part.
#
# Ratify: once every step is checked off and the gate has passed (also on the
# resume path, where every step was already checked off), one more `claude -p`
# call runs in the worker container on claude-opus-5-5 (RALPH_RATIFY_MODEL)
# with ralphloop/ratify-prompt.md. It re-runs the task's verification, tries to
# break each acceptance criterion and reads the diff for unrequested code, then
# writes its write-up and exactly one line, RATIFIED: Task N or REJECTED: Task N:
# <why>, to /ratify-output/verdict.md. This script judges that file and appends
# the details and the line to activity.md itself. The ratifier is given the
# diff, the task's section, the Review Focus items that name the task and the
# Global Constraints (read-only, in /ratify-input). The worker's activity.md is
# hidden by a mount: an empty read-only file is bind-mounted over it, so the
# real log is never touched during the call (a crash can't truncate it).
# Rejected, no verdict line, or anything in the repository changed: stop with
# exit 1 like BLOCKED (no final push, no PR, worktree kept). The verdict file
# starts empty for every call, so an old line can't count. The call is limited to RATIFY_TIMEOUT
# (default 45m; seconds, or a number with s/m/h): on a timeout the container is
# killed and the run stops with a "RATIFY TIMEOUT: Task N" line. Usage limits
# use the same waiting as worker calls.
#
# Test-only overrides (all default to the real values): RALPH_WORKER_STUB,
# RALPH_RATIFY_STUB, RALPH_RATIFY_MODEL, RALPH_APP_CHECK_STUB, RALPH_SEED_SCRIPT,
# RALPH_WAIT_SCALE, RALPH_PUSH_URL, RALPH_SKIP_PR, RALPH_MAX_STEPS,
# RALPH_LIMIT_BUDGET_SECONDS, RALPH_CLAUDE_AUTH_ENV, RALPH_SUPABASE_ENV.

set -euo pipefail

REPO="Farmer-Forge/Campsites"
BASE_BRANCH="main"
TASK_FILE="ralphloop/task.md"
LOG_FILE="ralphloop/activity.md"
CANONICAL_ROOT="$(pwd)"
WORKTREE_ROOT="$(cd .. && pwd)/Campsites-worktrees"
MAX_STEPS_PER_TASK="${RALPH_MAX_STEPS:-30}"
CLAUDE_WORKER_IMAGE="campsites-claude-worker:latest"
# Every worker call runs on Sonnet (Shawn, 2026-10-26). RALPH_MODEL overrides it
# for a run (an alias such as "opus", or a full id); chain.sh passes it through.
WORKER_MODEL="${RALPH_MODEL:-claude-sonnet-5-5}"
CLAUDE_AUTH_ENV="${RALPH_CLAUDE_AUTH_ENV:-$HOME/.secrets/claude-code-auth.env}"
SUPABASE_ENV="${RALPH_SUPABASE_ENV:-$HOME/.secrets/campsites-supabase.env}"
# Usage limits and throttling are waited out, up to this much total waiting
# per run (8h — longer than any 5-hour reset; a weekly limit stops instead).
LIMIT_BUDGET_SECONDS="${RALPH_LIMIT_BUDGET_SECONDS:-28800}"
GATE_TIMEOUT_SECONDS="${RALPH_GATE_TIMEOUT:-900}"
MAX_GATE_ATTEMPTS=3
RATIFY_MODEL="${RALPH_RATIFY_MODEL:-claude-opus-5-5}"
LOOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # this checkout's ralphloop/, never the worktree's
RATIFY_PROMPT_FILE="${LOOP_DIR}/ratify-prompt.md"
SEED_SCRIPT="${RALPH_SEED_SCRIPT:-${LOOP_DIR}/seed-dev.sh}"
THROTTLE_WAIT_SECONDS=120
MAX_THROTTLE_RETRIES=5
MAX_NO_PROGRESS_CALLS=3

source "$(dirname "${BASH_SOURCE[0]}")/loop-lib.sh"

if ! RATIFY_TIMEOUT_SECONDS=$(duration_seconds "${RATIFY_TIMEOUT:-45m}"); then
    echo -e "\033[31m[Error] RATIFY_TIMEOUT='${RATIFY_TIMEOUT:-}' is not a duration. Use seconds, or a number with s, m or h (default 45m).\033[0m"
    exit 1
fi

if [ -z "${RALPH_GH_TOKEN:-}" ]; then
    echo -e "\033[31m[Error] RALPH_GH_TOKEN is not set. Export the fine-grained PAT before running.\033[0m"
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo -e "\033[31m[Error] jq is not installed on this host. The loop reads the worker's JSON output to spot usage limits: sudo apt install jq\033[0m"
    exit 1
fi

PUSH_URL="${RALPH_PUSH_URL:-https://x-access-token:${RALPH_GH_TOKEN}@github.com/${REPO}.git}"

if [ ! -f "$TASK_FILE" ]; then
    echo -e "\033[31m[Error] $TASK_FILE not found! Run this from the Campsites repo root on ralph.\033[0m"
    exit 1
fi

if [ ! -f "$CLAUDE_AUTH_ENV" ]; then
    echo -e "\033[31m[Error] $CLAUDE_AUTH_ENV not found. Claude Code needs its own credentials available to the worker container before this can run.\033[0m"
    exit 1
fi

if [ ! -f "$SUPABASE_ENV" ]; then
    echo -e "\033[31m[Error] $SUPABASE_ENV not found. Steps that need Task 1's Supabase values (.env.local, migrations) require this file before running.\033[0m"
    exit 1
fi

# ------------------------------------------------------------------------------
# Find the first task (by heading) that still has an unchecked step.
# Prints "<line_number>\t<task_num>\t<task_name>" or nothing if none remain.
# ------------------------------------------------------------------------------
find_current_task() {
    local heading_lines
    heading_lines=$(grep -n '^## Task [0-9]\+:' "$TASK_FILE" | cut -d: -f1)
    if [ -z "$heading_lines" ]; then
        return 1
    fi
    local lines_arr=($heading_lines)
    local total=${#lines_arr[@]}
    local file_len
    file_len=$(wc -l < "$TASK_FILE")

    local i start end
    for ((i = 0; i < total; i++)); do
        start=${lines_arr[i]}
        if (( i + 1 < total )); then
            end=$(( lines_arr[i+1] - 1 ))
        else
            end=$file_len
        fi
        # grep -c, not -q: -q exits the moment it sees the first match,
        # which under `set -o pipefail` can SIGPIPE the still-writing `sed`
        # before it finishes — pipefail then reports sed's non-zero (from
        # the signal) as the pipeline's status even though grep matched,
        # intermittently and incorrectly skipping a task that still has
        # unchecked steps. -c always reads sed's output to completion, so
        # sed exits 0 and there's nothing for pipefail to misreport.
        local match_count
        # count_unchecked_lines (loop-lib.sh) skips checkbox lines quoted
        # inside code fences.
        match_count=$(count_unchecked_lines "$TASK_FILE" "$start" "$end")
        if [ "${match_count:-0}" -gt 0 ]; then
            local heading_line task_num task_name
            heading_line=$(sed -n "${start}p" "$TASK_FILE")
            task_num=$(echo "$heading_line" | sed -E 's/^## Task ([0-9]+):.*/\1/')
            task_name=$(echo "$heading_line" | sed -E 's/^## Task [0-9]+: (.*)$/\1/')
            printf '%s\t%s\t%s\n' "$start" "$task_num" "$task_name"
            return 0
        fi
    done
    return 1
}

TASK_INFO=$(find_current_task || true)
if [ -z "$TASK_INFO" ]; then
    echo -e "\033[32m✅ No unchecked steps remain anywhere in $TASK_FILE — nothing to do.\033[0m"
    exit 0
fi

TASK_NUM=$(echo "$TASK_INFO" | cut -f2)
TASK_NAME=$(echo "$TASK_INFO" | cut -f3)
BRANCH_NAME="ralph-loop/task-${TASK_NUM}"
WORKTREE_DIR="${WORKTREE_ROOT}/task-${TASK_NUM}"
WORKTREE_LOG="${WORKTREE_DIR}/${LOG_FILE}"

echo -e "\033[34m🚀 Starting Ralph Wiggum Loop — Task ${TASK_NUM}: ${TASK_NAME}\033[0m"
echo "🤖 Worker model: ${WORKER_MODEL}"

if [ "$TASK_NUM" = "1" ]; then
    echo -e "\033[31m🛑 STOPPED: Task 1 (Supabase provisioning) is not run by this script — see the header comment. Check it off by hand in an interactive session first, then re-run.\033[0m"
    exit 1
fi

# ------------------------------------------------------------------------------
# Set up (or resume) this task's worktree and branch, forked from main.
# ------------------------------------------------------------------------------
mkdir -p "$WORKTREE_ROOT"
RESUMED_WORKTREE=0
if [ -d "$WORKTREE_DIR" ]; then
    RESUMED_WORKTREE=1
else
    LS_RC=2   # 2 = "no such branch on the remote", git ls-remote --exit-code's own code
    if ! git show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
        LS_RC=0
        git ls-remote --exit-code "$PUSH_URL" "refs/heads/${BRANCH_NAME}" >/dev/null 2>&1 || LS_RC=$?
        # Anything but 0 (found) or 2 (not found) means the remote couldn't be
        # asked at all. Starting fresh then would redo the whole task on top of
        # checkpoints that may already be on GitHub, and every push would bounce.
        if [ "$LS_RC" != "0" ] && [ "$LS_RC" != "2" ]; then
            echo -e "\033[31m🛑 STOPPED: couldn't reach the remote to check for an existing ${BRANCH_NAME} (git ls-remote exit ${LS_RC}) — a network problem, or RALPH_GH_TOKEN is wrong or expired. Nothing was started; fix that and re-run.\033[0m"
            exit 1
        fi
    fi
    if [ "$LS_RC" = "0" ]; then
        # A checkpoint branch exists on the remote but not here (worktree or
        # disk lost, fresh clone). Resume from it — but only if it was branched
        # from the current main; an older one is left over from an earlier run
        # (e.g. before a reset) and resuming it would bring back stale work.
        git fetch -q "$PUSH_URL" "+refs/heads/${BRANCH_NAME}:refs/ralph/incoming" >/dev/null 2>&1 \
            || { echo -e "\033[31m[Error] Couldn't fetch ${BRANCH_NAME} from the remote.\033[0m"; exit 1; }
        if ! git merge-base --is-ancestor "$BASE_BRANCH" refs/ralph/incoming; then
            git update-ref -d refs/ralph/incoming
            # A finished task waiting in an open PR looks exactly like this
            # once main has moved on — never tell anyone to delete that one.
            OPEN_PR=""
            if [ "${RALPH_SKIP_PR:-0}" != "1" ]; then
                OPEN_PR=$(GH_TOKEN="$RALPH_GH_TOKEN" gh pr list --repo "$REPO" --head "$BRANCH_NAME" --state open --json url -q '.[0].url' 2>/dev/null || true)
            fi
            if [ -n "$OPEN_PR" ]; then
                echo -e "\033[31m🛑 STOPPED: Task ${TASK_NUM} is already finished and waiting in ${OPEN_PR}. Squash-merge that PR, git pull here, then re-run for the next task. Don't delete its branch.\033[0m"
            else
                echo -e "\033[31m🛑 STOPPED: ${BRANCH_NAME} exists on the remote, doesn't contain the current ${BASE_BRANCH}, and has no open PR — it's left over from an earlier run. Delete that branch on GitHub to start the task fresh (or merge ${BASE_BRANCH} into it to keep its work), then re-run.\033[0m"
            fi
            exit 1
        fi
        git branch "$BRANCH_NAME" refs/ralph/incoming
        git update-ref -d refs/ralph/incoming
        echo "📥 Resuming Task ${TASK_NUM} from its checkpoint branch on the remote."
    fi
    if git show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
        git worktree add "$WORKTREE_DIR" "$BRANCH_NAME"
    else
        git worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" "$BASE_BRANCH"
    fi
fi
touch "$WORKTREE_LOG"

GATE_ON=0
if gate_enabled "$BASE_BRANCH"; then
    GATE_ON=1
    echo "🧪 Gate: on (db reset + test db, dev seed, then lint, production build and console check, after every step)."
else
    echo "🧪 Gate: off (no supabase/config.toml on ${BASE_BRANCH})."
fi
GATE_FLAGGED=0
# The gate's app check needs Playwright in the worker image. An image built
# before 2026-11-14 doesn't have it, and every step would fail the gate; stop
# now with the fix instead.
if [ "$GATE_ON" = "1" ] && [ -z "${RALPH_APP_CHECK_STUB:-}" ] \
    && ! docker run --rm "$CLAUDE_WORKER_IMAGE" node -e "require('playwright')" >/dev/null 2>&1; then
    echo -e "\033[31m[Error] ${CLAUDE_WORKER_IMAGE} has no Playwright, which the gate's app check needs. Rebuild it from the repo root: docker build -t ${CLAUDE_WORKER_IMAGE} - < ralphloop/worker.Dockerfile\033[0m"
    exit 1
fi

git -C "$WORKTREE_DIR" config user.name "Ralph Loop"
git -C "$WORKTREE_DIR" config user.email "ralph-loop@users.noreply.github.com"

# node_modules is gitignored, so every fresh worktree starts without it —
# every task from Task 3 onward independently rediscovered this and ran
# `npm install` itself before it could lint, wasting the same setup work
# every single time. Do it once, up front, if there's a package.json to
# install for (there won't be one yet the very first time Task 2's own
# worktree is created, since writing package.json is Task 2's own Step 1).
if [ -f "$WORKTREE_DIR/package.json" ] && [ ! -d "$WORKTREE_DIR/node_modules" ]; then
    echo "📦 Installing dependencies for this worktree..."
    docker run --rm \
        --network host \
        --user "$(id -u):$(id -g)" \
        -e HOME=/tmp \
        -v "${WORKTREE_DIR}:${WORKTREE_DIR}" \
        -w "${WORKTREE_DIR}" \
        "$CLAUDE_WORKER_IMAGE" \
        npm install
fi

# ------------------------------------------------------------------------------
# Inner loop: one claude -p worker per unchecked step, scoped to this task.
#
# No auto-stash here, on resume or per-step: work in progress stays in the
# worktree, and resuming a worktree in that state is the expected steady
# state, not leftover junk to sweep away. After each step the worker
# completes, this script commits it as a "Checkpoint: …" commit and pushes
# the branch — so at any moment the only uncommitted changes are the partial
# work of the step in progress, and an interrupted step's next attempt is
# told exactly what they are (see resume_note in loop-lib.sh). Each step is
# idempotent (it (re)writes specific files to a known-correct content), so
# redoing it on top of partial state is safe — no stash needed. (Tried
# auto-stashing both ways — every call and once on resume — and both
# destroyed real progress rather than protecting against anything real.)
# ------------------------------------------------------------------------------
CALLS_DIR="${WORKTREE_ROOT}/task-${TASK_NUM}.calls"   # outside the worktree, so no git add can pick it up
mkdir -p "$CALLS_DIR"
WT_TASK_FILE="${WORKTREE_DIR}/${TASK_FILE}"
WORKTREE_DIR_ABS="$(cd "$WORKTREE_DIR" && pwd)"

STEP=1   # worker calls that count toward MAX_STEPS_PER_TASK
CALL=$(( $(find "$CALLS_DIR" -name 'call-*.jsonl' | wc -l) ))   # every call, across reruns
WAITED=0               # seconds spent waiting on limits/throttling this run
LIMIT_STREAK=0
THROTTLE_STREAK=0
NO_PROGRESS_STREAK=0
GATE_ATTEMPTS_FILE="${CALLS_DIR}/gate-attempts"

# wait_or_stop <seconds> <reason> — sleep before retrying the same step,
# unless that would push this run past LIMIT_BUDGET_SECONDS; then stop cleanly.
wait_or_stop() {
    if ! within_budget "$WAITED" "$1" "$LIMIT_BUDGET_SECONDS"; then
        echo -e "\n\033[31m🛑 STOPPED: ${2} — waiting another $(fmt_duration "$1") would pass this run's $(fmt_duration "$LIMIT_BUDGET_SECONDS") retry budget. Worktree and checkpoints are kept; re-run this script once the limit has reset and it resumes at the same step.\033[0m"
        exit 1
    fi
    WAITED=$(( WAITED + $1 ))
    echo -e "\033[36m⏸  ${2} — retrying Task ${TASK_NUM} at $(date -u -d "@$(( $(date +%s) + $1 ))" '+%H:%M UTC') (in $(fmt_duration "$1")).\033[0m"
    ralph_sleep "$1"
}

RESUME_NOTE=""
if [ "$RESUMED_WORKTREE" = "1" ] && [ -n "$(git -C "$WORKTREE_DIR" status --short)" ]; then
    RESUME_NOTE=$(resume_note "$WORKTREE_DIR" "a previous doloop.sh run stopped partway through this step")
fi

SKIP_WORKERS=0
if [ "$(count_unchecked "$WT_TASK_FILE" "$TASK_NUM")" -eq 0 ]; then
    echo -e "\033[32m✔ Every step of Task ${TASK_NUM} is already checked off on ${BRANCH_NAME} — skipping straight to publishing.\033[0m"
    SKIP_WORKERS=1
fi

# refuse_changed_config — the gate resets the database named by the worktree's
# own supabase/config.toml, so it won't run if that file differs from the base
# branch's. Stops like BLOCKED: exit 1, no push, no PR, worktree kept.
refuse_changed_config() {
    if gate_config_unchanged "$WORKTREE_DIR_ABS" "$BASE_BRANCH"; then return 0; fi
    printf '\nGATE REFUSED: supabase/config.toml differs from %s (Task %s, call %s)\n' "$BASE_BRANCH" "$TASK_NUM" "$CALL" >> "$WORKTREE_LOG"
    echo -e "\n\033[31m🛑 STOPPED: the worktree's supabase/config.toml differs from ${BASE_BRANCH}. The gate resets the database named by that file's project_id and ports, so it won't run (another project shares this host). Nothing was pushed and no PR was opened; the worktree is kept at ${WORKTREE_DIR}. Look at \`git -C ${WORKTREE_DIR} diff ${BASE_BRANCH} -- supabase/config.toml\`, undo the change there (a real config change belongs on ${BASE_BRANCH}, made by hand), remove the GATE REFUSED line from ${LOG_FILE}, then re-run this script.\033[0m"
    exit 1
}

# run_app_check <worktree> <log> <secs> — the gate's app part: this checkout's
# app-check.sh in the worker image (mounted read-only at /ralph-loop), in the
# worktree, appending to <log>. Named, so a timeout can remove the container.
run_app_check() {
    if [ -n "${RALPH_APP_CHECK_STUB:-}" ]; then
        ( cd "$1" && timeout "$3" bash "$RALPH_APP_CHECK_STUB" ) < /dev/null >> "$2" 2>&1
        return
    fi
    local name rc=0
    name="campsites-appcheck-${TASK_NUM}-$(date -u '+%Y%m%d-%H%M%S')"
    timeout -k 5 "$3" docker run --rm --name "$name" \
        --network host \
        --user "$(id -u):$(id -g)" \
        -e HOME=/tmp \
        -v "${1}:${1}" \
        -v "${LOOP_DIR}:/ralph-loop:ro" \
        -w "$1" \
        --env-file "$SUPABASE_ENV" \
        "$CLAUDE_WORKER_IMAGE" \
        bash /ralph-loop/app-check.sh < /dev/null >> "$2" 2>&1 || rc=$?
    if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
        docker rm -f "$name" >/dev/null 2>&1 || true
        printf '\nGATE TIMEOUT: the app check did not finish within %s seconds.\n' "$3" >> "$2"
    fi
    return "$rc"
}

# run_full_gate <worktree> <log> <secs> — the whole gate (see the header):
# database, dev seed, app; stops at the first part that fails. All output goes
# to <log>; returns the failing part's exit code.
run_full_gate() {
    local rc=0
    run_gate "$1" "$2" "$3" || return $?
    printf '\n== gate: dev seed (seed-dev.sh)\n' >> "$2"
    ( cd "$CANONICAL_ROOT" && RALPH_SUPABASE_ENV="$SUPABASE_ENV" timeout "$3" bash "$SEED_SCRIPT" ) < /dev/null >> "$2" 2>&1 || rc=$?
    if [ "$rc" -ne 0 ]; then
        printf '\nGATE: the dev seed failed (exit %s).\n' "$rc" >> "$2"
        return "$rc"
    fi
    printf '\n== gate: app check (lint, production build, console check)\n' >> "$2"
    run_app_check "$1" "$2" "$3"
}

# run_worker <prompt> <call_log> — one worker call; returns its exit code.
# All output (stream-json, one JSON object per line) goes to <call_log>.
run_worker() {
    if [ -n "${RALPH_WORKER_STUB:-}" ]; then
        (cd "$WORKTREE_DIR_ABS" && RALPH_WORKER_MODEL="$WORKER_MODEL" bash "$RALPH_WORKER_STUB" "$1") > "$2" 2>&1
        return
    fi
    docker run --rm \
        --network host \
        --user "$(id -u):$(id -g)" \
        -e HOME=/tmp \
        -v "${CANONICAL_ROOT}/.git:${CANONICAL_ROOT}/.git" \
        -v "${WORKTREE_DIR_ABS}:${WORKTREE_DIR_ABS}" \
        -w "${WORKTREE_DIR_ABS}" \
        --env-file "$CLAUDE_AUTH_ENV" \
        --env-file "$SUPABASE_ENV" \
        "$CLAUDE_WORKER_IMAGE" \
        claude -p "$1" --model "$WORKER_MODEL" --dangerously-skip-permissions --output-format stream-json --verbose \
        > "$2" 2>&1
}

# run_ratify <prompt> <call_log> <container_name> — the ratify call, limited to
# RATIFY_TIMEOUT_SECONDS; returns its exit code (124 or 137 = timed out). The
# container gets a name so a timeout can `docker kill` it: killing the
# `docker run` client alone leaves the container running.
run_ratify() {
    if [ -n "${RALPH_RATIFY_STUB:-}" ]; then
        # No container here: RALPH_RATIFY_ACTIVITY_VIEW is what activity.md
        # would look like from inside one (the empty file), for the stub to read.
        (cd "$WORKTREE_DIR_ABS" && RALPH_RATIFY_MODEL="$RATIFY_MODEL" RALPH_RATIFY_INPUT_DIR="$RAT_DIR" \
            RALPH_RATIFY_OUTPUT_DIR="$RAT_OUT" RALPH_RATIFY_ACTIVITY_VIEW="$RAT_EMPTY" \
            timeout -k 5 "$RATIFY_TIMEOUT_SECONDS" bash "$RALPH_RATIFY_STUB" "$1") > "$2" 2>&1
        return
    fi
    local mounts
    mapfile -t mounts < <(ratify_mounts "$CANONICAL_ROOT" "$WORKTREE_DIR_ABS" "$LOG_FILE" "$RAT_EMPTY" "$RAT_DIR" "$RAT_OUT")
    timeout -k 5 "$RATIFY_TIMEOUT_SECONDS" docker run --rm --name "$3" \
        --network host \
        --user "$(id -u):$(id -g)" \
        -e HOME=/tmp \
        "${mounts[@]}" \
        -w "${WORKTREE_DIR_ABS}" \
        --env-file "$CLAUDE_AUTH_ENV" \
        --env-file "$SUPABASE_ENV" \
        "$CLAUDE_WORKER_IMAGE" \
        claude -p "$1" --model "$RATIFY_MODEL" --dangerously-skip-permissions --output-format stream-json --verbose \
        > "$2" 2>&1
}

while [ "$SKIP_WORKERS" = "0" ] && [ "$STEP" -le "$MAX_STEPS_PER_TASK" ]; do
    CALL=$((CALL + 1))
    echo -e "\n\033[33m🔄 --- Task ${TASK_NUM}, worker call ${STEP} of ${MAX_STEPS_PER_TASK} (log: call-${CALL}) ---\033[0m"

    if grep -q "^BLOCKED:" "$WORKTREE_LOG" 2>/dev/null; then
        echo -e "\n\033[31m🛑 STOPPED: A previous call flagged a step as BLOCKED. Check $WORKTREE_LOG, resolve it, remove the BLOCKED line, then re-run this script.\033[0m"
        exit 1
    fi

    RALPH_PROMPT=$(cat <<EOF
You are the worker agent in an autonomous Ralph Wiggum loop, running inside a
dedicated git worktree for ONE task only: Task ${TASK_NUM} (${TASK_NAME}) from
'${TASK_FILE}'. Your state memory is managed externally via '${TASK_FILE}'
(the plan, checkbox-tracked) and '${LOG_FILE}' (append-only call log).

CORE OBJECTIVES:
1. Read '${TASK_FILE}' and find the FIRST unchecked step (a line starting
   with "- [ ]", outside code blocks — a "- [ ]" line inside a fenced code
   block is quoted text, never a step) WITHIN Task ${TASK_NUM}'s own section only. Do not work on
   any other task's steps, even if you finish Task ${TASK_NUM} early or
   notice unchecked steps elsewhere — this worktree only merges Task
   ${TASK_NUM}'s changes.
2. Read '${LOG_FILE}' to understand what previous calls did, what failed,
   and lessons learned.
3. Work exclusively on that ONE step. Do not try to solve multiple steps at
   once.
4. NEVER call any mcp__claude_ai_Supabase__* tool, and never run
   supabase link, supabase db push or supabase functions deploy. This
   project's database is the local Supabase stack on ralph; production
   must never be touched. Use psql "\$DATABASE_URL" exactly as the step
   describes.
   NEVER create or edit anything under 'supabase/migrations/' or
   'supabase/functions/': they are a fixed contract copied from V1.
   Never run DDL against the database either (create, alter or drop;
   grant or revoke; create or drop policy): only the reads and seed
   writes a step describes. If a step seems to need a schema or
   edge-function change, follow rule 6 (BLOCKED) instead. SQL you write
   in seeds uses the existing schema's names as they are.
5. Do NOT run git push, gh pr create, or any other step that publishes this
   branch — that happens after this script's inner loop finishes, not from
   within a step.
6. If a step genuinely requires Shawn's judgment or explicit approval (a
   decision only he can make, not just "this is hard") and isn't already
   covered by rule 4: do not guess or proceed. Append a line to
   '${LOG_FILE}' starting with "BLOCKED: " explaining exactly what you need
   from Shawn, and stop without modifying '${TASK_FILE}'.
7. Run this step's own validation (manual verification instructions as
   written, linter, local builds) to confirm it's actually done.
8. If this step touches UI (writes or modifies an Angular component's
   .ts, .html or .scss), follow 'docs/superpowers/style-task.md' before
   marking it done: read 'docs/superpowers/Design.md' first if you
   haven't this session, use the existing 'src/app/shared/ui/*'
   component or shared rt-* class for anything that has one (never a
   one-off button/input style), and run its self-check list before
   step 9 below. If you genuinely need a pattern Design.md doesn't have,
   add it to Design.md AND the matching shared/ui file in this same
   step — never improvise inline.
9. If the step passes validation:
   - Change its checkbox from "- [ ]" to "- [x]" in '${TASK_FILE}'.
   - Append a short entry to '${LOG_FILE}' under a
     "## Task ${TASK_NUM}, call ${CALL}" heading: what you did, what you
     verified, anything worth remembering for later steps in this task.
   - If this step is this task's own "Commit" step, run the git add/commit
     exactly as written in that step (a local commit in this worktree —
     never push). Otherwise leave changes uncommitted for now.
10. If no unchecked steps remain in Task ${TASK_NUM}'s section, append the
    exact line "TASK ${TASK_NUM} COMPLETE" to '${LOG_FILE}' (a file write,
    the same way BLOCKED is signaled above — the outer script greps this
    file, not your stdout).
11. Checkpoint commits: after every step you complete, this loop commits the
    worktree for you ("Checkpoint: ..." commits). So when you reach this
    task's own "Commit" step, its files are usually already committed and
    git commit reports "nothing to commit". That is expected: confirm the
    step's files appear in \`git log ${BASE_BRANCH}..HEAD --stat\`, and if they
    do, treat the Commit step as done (check it off as in rule 9). Do not
    create an empty commit, and do not amend, squash or rewrite the
    checkpoint commits.
12. The gate: after each step you tick, this loop checks your worktree
    itself: \`supabase db reset\` and \`supabase test db\` on the host, the
    dev seed again, then ralphloop/app-check.sh (lint, the production build
    \`ng build --configuration production,local\`, and a headless Chromium
    check that loads that build and fails on ANY console error). If any part
    fails, your step is undone (unticked) and the next call gets the output.
    You can't run the two supabase commands (no Supabase CLI or Docker
    here), but run \`bash ralphloop/app-check.sh\` yourself before you tick
    a step that changes the app; pg_prove against \$DATABASE_URL runs the
    pgTAP tests. Never edit or remove an existing test, and never silence a
    console error, to get a pass: fix the cause. Never edit
    supabase/config.toml: the gate refuses to run if it differs from
    ${BASE_BRANCH}, and the loop stops.
EOF
)
    if [ -n "$RESUME_NOTE" ]; then
        RALPH_PROMPT+=$'\n\n'"$RESUME_NOTE"
    fi
    RALPH_PROMPT+=$'\n\nExecute your next step now:'
    RESUME_NOTE=""

    BEFORE_UNCHECKED=$(count_unchecked "$WT_TASK_FILE" "$TASK_NUM")
    BEFORE_TITLE=$(first_unchecked_title "$WT_TASK_FILE" "$TASK_NUM")
    cp "$WT_TASK_FILE" "${CALLS_DIR}/task-before-${CALL}.md"   # to undo ticks if the gate fails
    CALL_LOG="${CALLS_DIR}/call-${CALL}.jsonl"

    RC=0
    run_worker "$RALPH_PROMPT" "$CALL_LOG" || RC=$?
    print_call_result "$CALL_LOG"

    # The worker may change task.md only inside this task's own section. Put
    # back anything else (e.g. a tick that matched another task's identical
    # step line) before progress is counted, the gate runs or anything commits.
    OUTSIDE=$(restore_outside_task "${CALLS_DIR}/task-before-${CALL}.md" "$WT_TASK_FILE" "$TASK_NUM")
    if [ "$OUTSIDE" -gt 0 ]; then
        printf '\nRESTORED: Task %s, call %s changed %s line(s) of task.md outside its own section; they were put back.\n' \
            "$TASK_NUM" "$CALL" "$OUTSIDE" >> "$WORKTREE_LOG"
        echo -e "\033[33m⚠️  The worker changed task.md outside Task ${TASK_NUM}'s section; put back ${OUTSIDE} line(s).\033[0m"
    fi

    # Checkpoint whatever this call completed, whatever else happened to it —
    # a call can finish its step and still end on a usage limit.
    AFTER_UNCHECKED=$(count_unchecked "$WT_TASK_FILE" "$TASK_NUM")
    PROGRESSED=0
    if [ "$AFTER_UNCHECKED" -lt "$BEFORE_UNCHECKED" ]; then
        if [ "$GATE_ON" = "1" ]; then
            refuse_changed_config
            GATE_LOG="${CALLS_DIR}/gate-${CALL}.log"
            echo "🧪 Gate: db reset + test db, dev seed, then lint, production build and console check…"
            GATE_RC=0
            run_full_gate "$WORKTREE_DIR_ABS" "$GATE_LOG" "$GATE_TIMEOUT_SECONDS" || GATE_RC=$?
            if [ "$GATE_RC" -eq 0 ]; then
                gate_attempts_clear "$GATE_ATTEMPTS_FILE"
                echo "✔ Gate passed."
            else
                GATE_TRIES=$(( $(gate_attempts_get "$GATE_ATTEMPTS_FILE" "$BEFORE_TITLE") + 1 ))
                gate_attempts_set "$GATE_ATTEMPTS_FILE" "$BEFORE_TITLE" "$GATE_TRIES"
                printf '\n## Task %s, call %s — GATE FAILED: %s (attempt %s/%s)\n~~~\n%s\n~~~\n' \
                    "$TASK_NUM" "$CALL" "$BEFORE_TITLE" "$GATE_TRIES" "$MAX_GATE_ATTEMPTS" "$(gate_log_tail "$GATE_LOG" 30)" >> "$WORKTREE_LOG"
                # Unticks every box this call ticked: the step isn't done.
                cp "${CALLS_DIR}/task-before-${CALL}.md" "$WT_TASK_FILE"
                AFTER_UNCHECKED=$BEFORE_UNCHECKED
                if [ "$GATE_TRIES" -lt "$MAX_GATE_ATTEMPTS" ]; then
                    echo -e "\033[33m⚠️  Gate failed (attempt ${GATE_TRIES} of ${MAX_GATE_ATTEMPTS}) — step undone, retrying. Log: ${GATE_LOG}\033[0m"
                    # Not counted toward MAX_STEPS_PER_TASK or the no-progress streak.
                    RESUME_NOTE=$(gate_note "$BEFORE_TITLE" "$GATE_TRIES" "$MAX_GATE_ATTEMPTS" "$GATE_LOG")
                    continue
                fi
                echo -e "\033[31m🛑 Gate failed ${MAX_GATE_ATTEMPTS} times on '${BEFORE_TITLE}' — committing the work as it stands and opening a PR flagged as failing. Log: ${GATE_LOG}\033[0m"
                checkpoint_commit "$WORKTREE_DIR" "Checkpoint (GATE FAILED): Task ${TASK_NUM} — ${BEFORE_TITLE}"
                push_branch_quietly "$WORKTREE_DIR" "$PUSH_URL" "$BRANCH_NAME"
                gate_attempts_clear "$GATE_ATTEMPTS_FILE"   # a rerun after a human fix gets fresh attempts
                GATE_FLAGGED=1
                break
            fi
        fi
        PROGRESSED=1
        CHECKPOINT_MSG="Checkpoint: Task ${TASK_NUM} — ${BEFORE_TITLE}"
        if [ $(( BEFORE_UNCHECKED - AFTER_UNCHECKED )) -gt 1 ]; then
            CHECKPOINT_MSG+=" (+$(( BEFORE_UNCHECKED - AFTER_UNCHECKED - 1 )) more)"
        fi
        checkpoint_commit "$WORKTREE_DIR" "$CHECKPOINT_MSG"
        push_branch_quietly "$WORKTREE_DIR" "$PUSH_URL" "$BRANCH_NAME"
    fi

    # Done means every step of this task is checked off — whatever else
    # happened to the call (its work is already checkpointed), so a usage
    # limit on the last step doesn't mean waiting hours for nothing. Not the
    # worker's "TASK N COMPLETE" line: activity.md can still carry that line
    # from an earlier run of the same task (after a reset), which once ended
    # a rerun after a single step.
    if [ "$AFTER_UNCHECKED" -eq 0 ]; then
        break
    fi

    VERDICT=$(classify_call "$CALL_LOG" "$RC")
    case "$VERDICT" in
        usage_limit)
            # Retries don't count toward MAX_STEPS_PER_TASK — no step was attempted to completion.
            LIMIT_STREAK=$((LIMIT_STREAK + 1))
            THROTTLE_STREAK=0
            log_call_ended "$WORKTREE_LOG" "$TASK_NUM" "$CALL" "usage limit"
            wait_or_stop "$(limit_wait_seconds "$(call_resets_at "$CALL_LOG")" "$(date +%s)" "$LIMIT_STREAK")" "Usage limit hit"
            RESUME_NOTE=$(resume_note "$WORKTREE_DIR" "usage limit")
            continue
            ;;
        throttled)
            THROTTLE_STREAK=$((THROTTLE_STREAK + 1))
            log_call_ended "$WORKTREE_LOG" "$TASK_NUM" "$CALL" "server throttling, not the usage limit"
            if [ "$THROTTLE_STREAK" -gt "$MAX_THROTTLE_RETRIES" ]; then
                echo -e "\n\033[31m🛑 STOPPED: the API kept throttling requests (${MAX_THROTTLE_RETRIES} retries in a row). Check ${CALL_LOG}, then re-run this script — it resumes at the same step.\033[0m"
                exit 1
            fi
            wait_or_stop "$THROTTLE_WAIT_SECONDS" "Server throttling (not the usage limit)"
            RESUME_NOTE=$(resume_note "$WORKTREE_DIR" "server throttling")
            continue
            ;;
        other_failure)
            log_call_ended "$WORKTREE_LOG" "$TASK_NUM" "$CALL" "worker failed, exit code ${RC}"
            echo -e "\n\033[31m🛑 STOPPED: worker call failed (exit code ${RC}) and it wasn't a usage limit. Last lines of ${CALL_LOG}:\033[0m"
            tail -n 20 "$CALL_LOG"
            echo "Worktree and checkpoints are kept at ${WORKTREE_DIR}. Fix the cause, then re-run this script — it resumes at the same step."
            exit 1
            ;;
    esac
    LIMIT_STREAK=0
    THROTTLE_STREAK=0

    if grep -q "^BLOCKED:" "$WORKTREE_LOG" 2>/dev/null; then
        echo -e "\n\033[31m🛑 STOPPED: This call flagged a step as BLOCKED. Check $WORKTREE_LOG, resolve it, remove the BLOCKED line, then re-run this script.\033[0m"
        exit 1
    fi

    if [ "$PROGRESSED" = "1" ]; then
        NO_PROGRESS_STREAK=0
    else
        NO_PROGRESS_STREAK=$((NO_PROGRESS_STREAK + 1))
        log_call_ended "$WORKTREE_LOG" "$TASK_NUM" "$CALL" "no step was checked off"
        if [ "$NO_PROGRESS_STREAK" -ge "$MAX_NO_PROGRESS_CALLS" ]; then
            echo -e "\n\033[31m🛑 STOPPED: ${MAX_NO_PROGRESS_CALLS} worker calls in a row finished without checking off a step (no progress). Check ${CALLS_DIR} and ${WORKTREE_LOG}, then re-run this script.\033[0m"
            exit 1
        fi
    fi

    STEP=$((STEP + 1))
done

if [ "$SKIP_WORKERS" = "0" ] && [ "$STEP" -gt "$MAX_STEPS_PER_TASK" ]; then
    echo -e "\n\033[31m🛑 STOPPED: Reached the per-task safety limit of $MAX_STEPS_PER_TASK worker calls without finishing Task ${TASK_NUM}. Worktree left in place at $WORKTREE_DIR for inspection.\033[0m"
    exit 1
fi

# ------------------------------------------------------------------------------
# Ratify: an independent Opus call judges the finished task before anything is
# pushed for review. Skipped when the gate gave up on this task (its PR is
# opened flagged as failing instead).
# ------------------------------------------------------------------------------
if [ "$GATE_FLAGGED" != "1" ]; then
    stop_ratify() {   # <reason for activity.md> <message for the terminal>
        printf '\nRATIFY STOPPED: Task %s: %s\n' "$TASK_NUM" "$1" >> "$WORKTREE_LOG"
        echo -e "\n\033[31m🛑 STOPPED: ${2} Nothing further was pushed and no PR was opened; the worktree is kept at ${WORKTREE_DIR}. Ratify log: ${RAT_LOG:-n/a}\033[0m"
        exit 1
    }

    # On the resume path no step ran in this process, so the local database may
    # not be this branch's: put it there (and prove it) before ratify looks.
    if [ "$SKIP_WORKERS" = "1" ] && [ "$GATE_ON" = "1" ]; then
        refuse_changed_config
        echo "🧪 Gate before ratify (resume path): db reset + test db, dev seed, app check…"
        RESUME_GATE_LOG="${CALLS_DIR}/gate-resume.log"
        if ! run_full_gate "$WORKTREE_DIR_ABS" "$RESUME_GATE_LOG" "$GATE_TIMEOUT_SECONDS"; then
            printf '\n## Task %s — GATE FAILED before ratify (resume path)\n~~~\n%s\n~~~\n' "$TASK_NUM" "$(gate_log_tail "$RESUME_GATE_LOG" 30)" >> "$WORKTREE_LOG"
            echo -e "\n\033[31m🛑 STOPPED: the gate fails on this branch as it stands (log: ${RESUME_GATE_LOG}). Nothing was pushed and no PR was opened; the worktree is kept at ${WORKTREE_DIR}.\033[0m"
            exit 1
        fi
    fi

    echo -e "\033[34m🔎 Ratify: ${RATIFY_MODEL} judges Task ${TASK_NUM} (limit $(fmt_duration "$RATIFY_TIMEOUT_SECONDS")).\033[0m"
    RAT_DIR="${CALLS_DIR}/ratify-input"
    RAT_OUT="${CALLS_DIR}/ratify-output"
    RAT_EMPTY="${CALLS_DIR}/ratify-empty-activity.md"
    rm -rf "$RAT_DIR" "$RAT_OUT"
    mkdir -p "$RAT_OUT"
    : > "$RAT_EMPTY"
    ratify_inputs "$WT_TASK_FILE" "$TASK_NUM" "$RAT_DIR" "$BASE_BRANCH" "$WORKTREE_DIR_ABS"
    RAT_NAME="campsites-ratify-${TASK_NUM}-$(date -u '+%Y%m%d-%H%M%S')"
    shopt -u patsub_replacement 2>/dev/null || true   # a task name with & is not a match reference
    RAT_PROMPT=$(<"$RATIFY_PROMPT_FILE")
    RAT_PROMPT=${RAT_PROMPT//@TASK_NUM@/$TASK_NUM}
    RAT_PROMPT=${RAT_PROMPT//@TASK_NAME@/$TASK_NAME}
    RAT_PROMPT=${RAT_PROMPT//@TASK_FILE@/$TASK_FILE}
    RAT_PROMPT=${RAT_PROMPT//@LOG_FILE@/$LOG_FILE}
    RAT_PROMPT=${RAT_PROMPT//@BASE_BRANCH@/$BASE_BRANCH}

    RAT_LIMIT_STREAK=0
    RAT_THROTTLE_STREAK=0
    RAT_LOG=""
    while true; do
        # Not a worker step: it doesn't count toward MAX_STEPS_PER_TASK.
        CALL=$((CALL + 1))
        RAT_LOG="${CALLS_DIR}/ratify-${CALL}.jsonl"
        # A fresh, empty verdict file for every call, so nothing old can count
        # (retro M3). The real log isn't touched while the ratifier runs.
        rm -f "$RAT_OUT/verdict.md"
        RAT_STATE_BEFORE=$(ratify_tree_state "$WORKTREE_DIR_ABS")
        RAT_RC=0
        run_ratify "$RAT_PROMPT" "$RAT_LOG" "$RAT_NAME" || RAT_RC=$?

        if [ "$RAT_RC" -eq 124 ] || [ "$RAT_RC" -eq 137 ]; then
            if [ -z "${RALPH_RATIFY_STUB:-}" ]; then
                docker kill "$RAT_NAME" >/dev/null 2>&1 || true
                docker rm -f "$RAT_NAME" >/dev/null 2>&1 || true
            fi
            printf '\nRATIFY TIMEOUT: Task %s\n' "$TASK_NUM" >> "$WORKTREE_LOG"
            echo -e "\n\033[31m🛑 STOPPED: ratify ran past its $(fmt_duration "$RATIFY_TIMEOUT_SECONDS") limit (RATIFY_TIMEOUT) and was killed, container ${RAT_NAME} included. This is a timeout, not a rejection. Nothing further was pushed and no PR was opened; the worktree is kept at ${WORKTREE_DIR}. Log: ${RAT_LOG}. Re-run this script to ratify again.\033[0m"
            exit 1
        fi

        if [ "$(ratify_tree_state "$WORKTREE_DIR_ABS")" != "$RAT_STATE_BEFORE" ]; then
            stop_ratify "it changed files in the repository" "ratify changed files in the repository (the log is hidden from it and its verdict has its own directory, so it has no reason to), so its verdict can't be trusted. Look at \`git -C ${WORKTREE_DIR} status\`."
        fi
        print_call_result "$RAT_LOG"

        case "$(classify_call "$RAT_LOG" "$RAT_RC")" in
            usage_limit)
                RAT_LIMIT_STREAK=$((RAT_LIMIT_STREAK + 1))
                RAT_THROTTLE_STREAK=0
                log_call_ended "$WORKTREE_LOG" "$TASK_NUM" "$CALL" "ratify: usage limit"
                wait_or_stop "$(limit_wait_seconds "$(call_resets_at "$RAT_LOG")" "$(date +%s)" "$RAT_LIMIT_STREAK")" "Usage limit hit (ratify)"
                continue
                ;;
            throttled)
                RAT_THROTTLE_STREAK=$((RAT_THROTTLE_STREAK + 1))
                log_call_ended "$WORKTREE_LOG" "$TASK_NUM" "$CALL" "ratify: server throttling"
                if [ "$RAT_THROTTLE_STREAK" -gt "$MAX_THROTTLE_RETRIES" ]; then
                    stop_ratify "the API kept throttling requests" "the API kept throttling the ratify call (${MAX_THROTTLE_RETRIES} retries in a row)."
                fi
                wait_or_stop "$THROTTLE_WAIT_SECONDS" "Server throttling (ratify)"
                continue
                ;;
            other_failure)
                tail -n 20 "$RAT_LOG"
                stop_ratify "the ratify call failed (exit ${RAT_RC})" "the ratify call failed (exit code ${RAT_RC}) and it wasn't a usage limit."
                ;;
        esac
        break
    done

    # The loop, not the ratifier, writes the real log: its write-up, then the line.
    RAT_VERDICT=$(ratify_result "$RAT_OUT/verdict.md" 0 "$TASK_NUM")
    ratify_log_details "$RAT_OUT/verdict.md" "$WORKTREE_LOG" "$TASK_NUM"
    case "$RAT_VERDICT" in
        RATIFIED)
            printf 'RATIFIED: Task %s\n' "$TASK_NUM" >> "$WORKTREE_LOG"
            echo -e "\033[32m✅ RATIFIED: Task ${TASK_NUM}.\033[0m"
            ;;
        REJECTED:*)
            printf 'REJECTED: Task %s: %s\n' "$TASK_NUM" "${RAT_VERDICT#REJECTED: }" >> "$WORKTREE_LOG"
            echo -e "\n\033[31m🛑 STOPPED: ratify REJECTED Task ${TASK_NUM}:${RAT_VERDICT#REJECTED:}\n   Details are under '## Task ${TASK_NUM}, ratify' in ${LOG_FILE} in the worktree. Nothing further was pushed and no PR was opened; the worktree is kept at ${WORKTREE_DIR}. The fix goes into task.md on ${BASE_BRANCH} (amended, then approved), the task's branch and worktree are reset, and the task reruns. Nobody hand-edits code in the worktree.\033[0m"
            exit 1
            ;;
        NONE)
            stop_ratify "no result line" "ratify wrote no RATIFIED/REJECTED line for Task ${TASK_NUM} to its verdict file."
            ;;
        *)
            stop_ratify "more than one result line" "ratify wrote more than one result line for Task ${TASK_NUM}."
            ;;
    esac
fi

# ------------------------------------------------------------------------------
# Task complete: push the branch and open a PR. This is the ONLY point in the
# whole run where anything leaves the worktree — no step does this itself.
# ------------------------------------------------------------------------------
if [ "$GATE_FLAGGED" = "1" ]; then
    echo -e "\033[31m📤 Task ${TASK_NUM} did NOT pass the gate — pushing ${BRANCH_NAME} and opening a PR flagged as failing.\033[0m"
else
    echo -e "\033[34m📤 Task ${TASK_NUM} complete — pushing ${BRANCH_NAME} and opening a PR.\033[0m"
fi

# `git add` (not `git diff`) here on purpose: activity.md starts each run as
# a brand-new untracked file, and `git diff` silently ignores untracked
# files, so checking diff first never detected it and this never committed —
# task.md's checkbox state (what find_current_task() relies on for every
# future invocation) was being silently discarded with the worktree every
# single run. Staging both first and checking the *staged* diff catches new
# and modified files alike.
git -C "$WORKTREE_DIR" add "$TASK_FILE" "$LOG_FILE"
if ! git -C "$WORKTREE_DIR" diff --cached --quiet; then
    git -C "$WORKTREE_DIR" commit -m "Log Task ${TASK_NUM} progress in task.md/activity.md"
fi

# Output discarded: git could echo the token-bearing URL in an error.
git -C "$WORKTREE_DIR" push -q "$PUSH_URL" "$BRANCH_NAME" >/dev/null 2>&1 \
    || { echo -e "\033[31m[Error] Pushing ${BRANCH_NAME} failed. Worktree kept at ${WORKTREE_DIR}; re-run this script to retry.\033[0m"; exit 1; }

if [ "${RALPH_SKIP_PR:-0}" = "1" ]; then
    echo "(RALPH_SKIP_PR=1 — not opening a PR.)"
else
    # A rerun after the task already finished (before its PR was merged)
    # reuses the open PR instead of failing to create a duplicate.
    PR_TITLE="Task ${TASK_NUM}: ${TASK_NAME}"
    PR_BODY="Autonomous Ralph Loop run for Task ${TASK_NUM} of \`ralphloop/task.md\`. Worker model: \`${WORKER_MODEL}\`. See \`${LOG_FILE}\` in this branch for the per-step activity log. Ratified by \`${RATIFY_MODEL}\` (see \`## Task ${TASK_NUM}, ratify\` in the log). Merge with **Squash and merge** — the Checkpoint commits are per-step progress, not history for main."
    if [ "$GATE_FLAGGED" = "1" ]; then
        PR_TITLE="⚠️ GATE FAILING — ${PR_TITLE}"
        PR_BODY="## ⚠️ This task did NOT pass the gate. Do not merge.

The gate (\`supabase db reset\` + \`supabase test db\`, the dev seed, then \`app-check.sh\`: lint, production build, console check) failed ${MAX_GATE_ATTEMPTS} times in a row on the step **${BEFORE_TITLE}**. That step is left unchecked in \`task.md\`. The loop stopped, and \`chain.sh\` refuses to merge this PR.

Last lines of the final gate run:

~~~
$(gate_log_tail "$GATE_LOG" 40)
~~~

${PR_BODY}"
    fi
    # A rerun after the task already finished (before its PR was merged)
    # reuses the open PR instead of failing to create a duplicate; its title
    # is brought up to date (a fixed task loses the failing flag).
    PR_URL=$(GH_TOKEN="$RALPH_GH_TOKEN" gh pr list --repo "$REPO" --head "$BRANCH_NAME" --state open --json url -q '.[0].url' 2>/dev/null || true)
    if [ -z "$PR_URL" ]; then
        # A failing task's PR is opened as a draft, so GitHub itself won't offer
        # a merge. (If drafts aren't available for this repo, fall back to a
        # normal PR: chain.sh still refuses it by its title.)
        DRAFT_FLAG=()
        if [ "$GATE_FLAGGED" = "1" ]; then DRAFT_FLAG=(--draft); fi
        PR_URL=$(GH_TOKEN="$RALPH_GH_TOKEN" gh pr create "${DRAFT_FLAG[@]}" \
            --repo "$REPO" \
            --base "$BASE_BRANCH" \
            --head "$BRANCH_NAME" \
            --title "$PR_TITLE" \
            --body "$PR_BODY" || true)
        if [ -z "$PR_URL" ] && [ "$GATE_FLAGGED" = "1" ]; then
            PR_URL=$(GH_TOKEN="$RALPH_GH_TOKEN" gh pr create \
                --repo "$REPO" --base "$BASE_BRANCH" --head "$BRANCH_NAME" \
                --title "$PR_TITLE" --body "$PR_BODY")
        elif [ -z "$PR_URL" ]; then
            echo -e "\033[31m[Error] Creating the PR failed. The branch is pushed; re-run this script to retry.\033[0m"; exit 1
        fi
    else
        GH_TOKEN="$RALPH_GH_TOKEN" gh pr edit "$PR_URL" --repo "$REPO" --title "$PR_TITLE" --body "$PR_BODY" >/dev/null 2>&1 || true
        # Back to a draft if it is failing now; ready for review again once fixed.
        if [ "$GATE_FLAGGED" = "1" ]; then
            GH_TOKEN="$RALPH_GH_TOKEN" gh pr ready "$PR_URL" --repo "$REPO" --undo >/dev/null 2>&1 || true
        else
            GH_TOKEN="$RALPH_GH_TOKEN" gh pr ready "$PR_URL" --repo "$REPO" >/dev/null 2>&1 || true
        fi
    fi
    echo -e "\033[32m✅ PR: ${PR_URL}\033[0m"
    if [ "$GATE_FLAGGED" != "1" ]; then
        echo "Review it, use Squash and merge, then re-run this script for the next task."
    fi
fi

if [ "$GATE_FLAGGED" = "1" ]; then
    echo -e "\n\033[31m🛑 STOPPED: Task ${TASK_NUM} failed the gate. The worktree and call logs are kept at ${WORKTREE_DIR} and ${CALLS_DIR}. Look at the PR, fix the cause (the failing step is still unchecked), then re-run this script — it resumes at that step.\033[0m"
    exit 1
fi

# --force: only ever needed here because of gitignored build/local-secret
# leftovers (node_modules/, .env.local) that git treats as untracked — the
# task's real tracked changes are already committed and pushed by this point.
git worktree remove --force "$WORKTREE_DIR"
# The branch lives on in the remote and the PR. Drop the local copy and the
# call logs, so a later rerun of this task (e.g. after a reset) can't pick
# up stale work.
git branch -q -D "$BRANCH_NAME"
rm -rf "$CALLS_DIR"
