#!/usr/bin/env bash
# ==============================================================================
# Helpers for doloop.sh — sourced, never run directly. Kept in their own file
# so each one can be tested alone (ralphloop/tests/) without Docker, GitHub or
# a real `claude` call. Needs bash, git and jq — jq on the host running
# doloop.sh, not inside the worker image.
#
# See docs/superpowers/specs/2026-09-22-loop-resume-and-usage-limit-retry-design.md
# for why each piece exists.
# ==============================================================================

# task_section_range <task_file> <task_num>
# Prints "<start> <end>": from the "## Task <num>:" heading to the line before
# the next "## Task N:" heading (or end of file). Returns 1 if there's no such task.
task_section_range() {
    local file="$1" num="$2" start end
    start=$(grep -n "^## Task ${num}:" "$file" | head -n 1 | cut -d: -f1 || true)
    [ -n "$start" ] || return 1
    end=$(awk -v s="$start" 'NR > s && /^## Task [0-9]+:/ { print NR - 1; exit }' "$file")
    [ -n "$end" ] || end=$(wc -l < "$file")
    echo "$start $end"
}

# count_unchecked <task_file> <task_num> — "- [ ]" steps left in that task.
count_unchecked() {
    local range
    range=$(task_section_range "$1" "$2") || { echo 0; return 0; }
    # grep -c, not -q — see find_current_task() in doloop.sh for the
    # pipefail/SIGPIPE reason.
    sed -n "${range% *},${range#* }p" "$1" | grep -c '^- \[ \]' || true
}

# first_unchecked_title <task_file> <task_num>
# The first unchecked step's bold title, e.g. "Step 7: Write `src/App.jsx`".
# Empty if every step is checked.
first_unchecked_title() {
    local range
    range=$(task_section_range "$1" "$2") || return 0
    sed -n "${range% *},${range#* }p" "$1" | grep -m 1 '^- \[ \]' \
        | sed -E 's/^- \[ \] (\*\*)?//; s/\*\*.*$//' || true
}

# _call_events <call_log> — the call log's JSON objects as one JSON array.
# The log is `claude -p --output-format stream-json --verbose` output (one
# object per line) mixed with any stderr; non-JSON lines are skipped.
_call_events() {
    local events
    # Captured, not `jq … || echo '[]'`: on a missing file jq still prints []
    # before failing, which would emit two arrays.
    events=$(jq -R -s -c '[split("\n")[] | (fromjson? // empty) | select(type == "object")]' "$1" 2>/dev/null) || events='[]'
    echo "$events"
}

# classify_call <call_log> <exit_code>
# Prints exactly one of:
#   success       — finished cleanly (exit 0, final result not an error)
#   usage_limit   — the Claude subscription usage limit stopped it
#   throttled     — a 429 that is NOT the usage limit (short-lived)
#   other_failure — anything else, including anything unrecognized
# Structured fields first (a "rejected" rate_limit_event; the result's
# api_error_status); the wording match is only a fallback. Spec: B2/B6.
LIMIT_TEXT_PATTERN='usage limit reached|hit your limit'
classify_call() {
    local verdict
    verdict=$(_call_events "$1" | jq -r --argjson rc "$2" --arg pat "$LIMIT_TEXT_PATTERN" '
        (map(select(.type == "rate_limit_event" and .rate_limit_info.status == "rejected")) | length > 0) as $rejected
        | (map(select(.type == "result")) | last) as $res
        | (($res.result // "") | test($pat; "i")) as $limit_text
        | if $res != null and ($res.is_error | not) and $rc == 0 then "success"
          elif $rejected then "usage_limit"
          elif $res != null and ($res.api_error_status // 0) == 429 then
              (if $limit_text then "usage_limit" else "throttled" end)
          elif $limit_text then "usage_limit"
          else "other_failure" end' 2>/dev/null || true)
    echo "${verdict:-other_failure}"
}

# call_resets_at <call_log> — epoch seconds when the rejected limit resets
# (from the last "rejected" rate_limit_event), or nothing if unknown.
call_resets_at() {
    _call_events "$1" | jq -r '
        map(select(.type == "rate_limit_event" and .rate_limit_info.status == "rejected")
            | .rate_limit_info.resetsAt // empty)
        | last // empty' 2>/dev/null || true
}

# print_call_result <call_log> — the worker's final message, as plain
# `claude -p` used to print it.
print_call_result() {
    _call_events "$1" | jq -r 'map(select(.type == "result")) | last | .result // "(no result message — see the call log)"' 2>/dev/null || true
}

# limit_wait_seconds <resets_at_or_empty> <now_epoch> <consecutive_limit_count>
# Sleep until 2 minutes after a known reset (at least 60s), else back off
# 15 / 30 / 60 minutes.
limit_wait_seconds() {
    local resets="$1" now="$2" streak="$3" wait
    if [ -n "$resets" ]; then
        wait=$(( resets - now + 120 ))
        if [ "$wait" -lt 60 ]; then wait=60; fi
        echo "$wait"
        return 0
    fi
    case "$streak" in
        1) echo 900 ;;
        2) echo 1800 ;;
        *) echo 3600 ;;
    esac
}

# within_budget <waited_so_far> <next_wait> <budget> — 0 if the next wait fits.
within_budget() {
    [ $(( $1 + $2 )) -le "$3" ]
}

# fmt_duration <seconds> — "2h05m", "15m", "45s".
fmt_duration() {
    local s="$1"
    if [ "$s" -ge 3600 ]; then
        printf '%dh%02dm' $(( s / 3600 )) $(( s % 3600 / 60 ))
    elif [ "$s" -ge 60 ]; then
        printf '%dm' $(( s / 60 ))
    else
        printf '%ds' "$s"
    fi
}

# ralph_sleep <seconds> — sleep, scaled by RALPH_WAIT_SCALE (tests set 0).
ralph_sleep() {
    local s=$(( $1 * ${RALPH_WAIT_SCALE:-1} ))
    if [ "$s" -gt 0 ]; then sleep "$s"; fi
}

# checkpoint_commit <worktree> <message>
# Commits everything the step changed except secrets and build output (including
# Angular's .angular/ cache and the local src/environments/environment.local.ts) —
# excluded here even if .gitignore is missing or wrong (e.g. early in a
# scaffold task, before its .gitignore step has run). .env.example is the one
# .env* file meant to be committed. No-op if nothing changed.
checkpoint_commit() {
    local wt="$1" msg="$2" bad
    git -C "$wt" add -A -- . \
        ':(exclude,glob)**/.env*' \
        ':(exclude,glob)**/node_modules/**' \
        ':(exclude,glob)**/dist/**' \
        ':(exclude,glob)**/.vite/**' \
        ':(exclude,glob)**/.angular/**' \
        ':(exclude,glob)**/environment.local.ts'
    if [ -f "$wt/.env.example" ]; then git -C "$wt" add -f -- .env.example; fi
    # Anything the worker staged itself bypasses the excludes above — unstage it.
    bad=$(git -C "$wt" diff --cached --name-only \
        | grep -E '(^|/)(\.env[^/]*$|node_modules/|dist/|\.vite/|\.angular/|environment\.local\.ts$)' \
        | grep -vE '(^|/)\.env\.example$' || true)
    if [ -n "$bad" ]; then
        while IFS= read -r p; do git -C "$wt" reset -q -- "$p"; done <<< "$bad"
    fi
    if git -C "$wt" diff --cached --quiet; then return 0; fi
    git -C "$wt" commit -q -m "$msg"
}

# push_branch_quietly <worktree> <push_url> <branch>
# Push HEAD to <branch>. On failure, warn and carry on — the commit is safe
# locally and goes up with the next push. Never prints git's own output,
# which could echo the token-bearing URL.
push_branch_quietly() {
    if ! git -C "$1" push -q "$2" "HEAD:refs/heads/$3" >/dev/null 2>&1; then
        echo "⚠️  Checkpoint push failed — kept locally, will go up with the next push."
    fi
    return 0
}

# log_call_ended <activity_log> <task_num> <call_num> <reason>
# Records a worker call that ended without completing a step, so the next
# call (which reads this log first) knows the previous attempt was cut off.
log_call_ended() {
    printf '\n## Task %s, call %s — ended without completing a step (%s) at %s\n' \
        "$2" "$3" "$4" "$(date -u '+%Y-%m-%d %H:%M UTC')" >> "$1"
}

# resume_note <worktree> <reason> — paragraph added to the next worker prompt
# after an interruption, pointing it at the partial work left behind.
resume_note() {
    local changes
    changes=$(git -C "$1" status --short)
    if [ -z "$changes" ]; then
        printf 'NOTE FROM THE LOOP: the previous call on this step was interrupted (%s) and left no uncommitted changes. Start the step fresh.\n' "$2"
        return 0
    fi
    printf 'NOTE FROM THE LOOP: the previous call on this step was interrupted (%s). Since the last checkpoint commit, the worktree has these uncommitted changes:\n%s\nInspect them first (git diff HEAD, and read any new untracked files), then either finish the step from where they leave off or redo it cleanly. Do not assume they are complete or correct.\n' "$2" "$changes"
}
