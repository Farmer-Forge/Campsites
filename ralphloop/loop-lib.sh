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

# restore_outside_task <before> <after> <task> — the worker may change
# task.md only inside its own task's section. Rebuilds <after> from
# <before> everywhere else (header, other tasks, notes), keeping <after>'s
# own section, and prints how many lines it had to put back (0 = none).
# Why: in ForgeDB's first chain run, ticking Task 3's "Step 9: Commit" also
# ticked Task 5's identical line; ratify caught it only at the end of the task.
restore_outside_task() {
    local before="$1" after="$2" num="$3" bs be as ae tmp n
    if ! read -r bs be < <(task_section_range "$before" "$num"); then echo 0; return; fi
    tmp=$(mktemp)
    if read -r as ae < <(task_section_range "$after" "$num"); then
        { sed -n "1,$((bs - 1))p" "$before"; sed -n "${as},${ae}p" "$after"; sed -n "$((be + 1)),\$p" "$before"; } > "$tmp"
    else
        cp "$before" "$tmp"   # the worker removed its own heading: put the whole file back
    fi
    n=$(diff "$tmp" "$after" | grep -c '^>' || true)
    if [ "$n" -gt 0 ]; then cat "$tmp" > "$after"; fi
    rm -f "$tmp"
    echo "$n"
}

# strip_fenced — stdin to stdout without code-fence lines or anything inside a
# fence (``` or ~~~, indented or not). A step is a "- [ ]" line in the plan's
# own text; a plan that quotes a checkbox line in a code block (a snippet for
# another file) must not create a step that can never be checked off.
strip_fenced() {
    awk '
        /^[ \t]*(```|~~~)/ {
            m = substr($0, match($0, /(```|~~~)/), 3)
            if (fence == "") { fence = m; next }
            if (m == fence) { fence = ""; next }
        }
        fence == "" { print }
    '
}

# count_unchecked_lines <task_file> <start> <end> — "- [ ]" steps in that line
# range, outside code fences.
count_unchecked_lines() {
    # grep -c, not -q — see find_current_task() in doloop.sh for the
    # pipefail/SIGPIPE reason.
    sed -n "${2},${3}p" "$1" | strip_fenced | grep -c '^- \[ \]' || true
}

# count_unchecked_all <task_file> — "- [ ]" steps left anywhere in the plan.
count_unchecked_all() {
    strip_fenced < "$1" | grep -c '^- \[ \]' || true
}

# count_unchecked <task_file> <task_num> — "- [ ]" steps left in that task.
count_unchecked() {
    local range
    range=$(task_section_range "$1" "$2") || { echo 0; return 0; }
    count_unchecked_lines "$1" "${range% *}" "${range#* }"
}

# first_unchecked_title <task_file> <task_num>
# The first unchecked step's bold title, e.g. "Step 7: Write `src/App.jsx`".
# Empty if every step is checked.
first_unchecked_title() {
    local range
    range=$(task_section_range "$1" "$2") || return 0
    sed -n "${range% *},${range#* }p" "$1" | strip_fenced | grep -m 1 '^- \[ \]' \
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

# ------------------------------------------------------------------------------
# The gate. After every step that ticks a box, doloop.sh runs
# `supabase db reset` then `supabase test db` from the task's worktree, on the
# host, then the dev seed and the app check (run_full_gate in doloop.sh). Only
# that result counts; the worker has no Supabase CLI and no Docker.
# ------------------------------------------------------------------------------

# gate_enabled <base_branch> — the gate runs only when the BASE branch has
# supabase/config.toml. It is read from git, not the worktree, so a worker
# can't switch the gate off by deleting the file.
gate_enabled() {
    git cat-file -e "$1:supabase/config.toml" 2>/dev/null
}

# gate_config_unchanged <worktree> <base_branch> — true if supabase/config.toml
# in the worktree (committed or not) is identical to the base branch's.
# `supabase db reset` acts on the containers named by the worktree's own
# project_id and ports, so a worker edit there could point the gate at another
# project's database (Campsites runs on the same host). The gate refuses to run
# if this is false.
gate_config_unchanged() {
    git -C "$1" diff --quiet "$2" -- supabase/config.toml
}

# run_gate <worktree> <logfile> <timeout_seconds> — returns 0 only if both
# commands pass within the time limit. Output (stdout and stderr) goes to
# <logfile>; a timeout is noted in it and returns 124.
run_gate() {
    local wt="$1" log="$2" secs="$3" rc=0
    # `supabase test db` creates a missing supabase/tests as root (it runs in
    # Docker), which the worker could then not write to. Create it ourselves.
    mkdir -p "$wt/supabase/tests"
    ( cd "$wt" && timeout "$secs" bash -c 'supabase db reset && supabase test db' ) < /dev/null > "$log" 2>&1 || rc=$?
    if [ "$rc" -eq 124 ]; then
        printf '\nGATE TIMEOUT: supabase db reset + supabase test db did not finish within %s seconds.\n' "$secs" >> "$log"
    fi
    return "$rc"
}

# gate_log_tail <logfile> [lines] — the end of a gate log, ANSI colours stripped.
gate_log_tail() {
    tail -n "${2:-30}" "$1" | sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g'
}

# The per-step retry counter lives in one small file (only one step is ever in
# flight): "<count><TAB><step title>". It survives a resume.
gate_attempts_get() {   # <file> <title> — prints the count so far (0 if none or another step)
    local n t
    if [ -f "$1" ] && IFS=$'\t' read -r n t < "$1" && [ "$t" = "$2" ]; then echo "$n"; else echo 0; fi
}
gate_attempts_set() { printf '%s\t%s\n' "$3" "$2" > "$1"; }   # <file> <title> <count>
gate_attempts_clear() { rm -f "$1"; }

# gate_note <step> <attempt> <max> <logfile> — paragraph added to the next
# worker prompt after a failed gate.
gate_note() {
    printf 'NOTE FROM THE LOOP: your previous attempt at "%s" was undone because the gate failed (attempt %s of %s). The gate is `supabase db reset` + `supabase test db` (on the host, from your worktree), the dev seed, then ralphloop/app-check.sh (lint, production build, headless console check). Output (last lines):\n%s\nYour work is still uncommitted in the worktree. Fix the cause, run your own checks again (bash ralphloop/app-check.sh for the app part), then tick the step. Never edit or remove an existing test, or silence a console error, to make it pass; if you believe a test is wrong, log BLOCKED instead.\n' \
        "$1" "$2" "$3" "$(gate_log_tail "$4" 30)"
}

# ------------------------------------------------------------------------------
# Ratify: one independent Opus call per task, after the last step and the gate,
# before the PR. See ratify-prompt.md and doloop.sh.
# ------------------------------------------------------------------------------

# duration_seconds <value> — "2700", "45m", "1h" or "30s" as seconds. Returns 1
# for anything else (or zero).
duration_seconds() {
    local v="$1" n
    [[ "$v" =~ ^([0-9]+)([smh]?)$ ]] || return 1
    n="${BASH_REMATCH[1]}"
    case "${BASH_REMATCH[2]}" in
        h) n=$(( n * 3600 )) ;;
        m) n=$(( n * 60 )) ;;
    esac
    [ "$n" -gt 0 ] || return 1
    echo "$n"
}

# md_section <file> <heading text> — the markdown section whose heading
# contains <heading text>, up to the next heading of the same or a higher
# level. Headings inside code fences don't count.
md_section() {
    awk -v pat="$2" '
        /^[ \t]*(```|~~~)/ { fence = !fence }
        !fence && /^#+[ \t]/ {
            match($0, /^#+/); lvl = RLENGTH
            if (on && lvl <= startlvl) on = 0
            if (!on && index($0, pat) > 0) { on = 1; startlvl = lvl }
        }
        on { print }
    ' "$1"
}

# review_focus_for_task <task_file> <task_num> — the Review Focus section, cut
# down to the list items that name this task ("Task N"). Plain text around the
# list is kept. Prints nothing if there is no such section.
review_focus_for_task() {
    local sec out
    sec=$(md_section "$1" "Review Focus")
    [ -n "$sec" ] || return 0
    out=$(awk -v n="$2" '
        function flush() { if (item != "" && item ~ pat) print item; item = "" }
        BEGIN { pat = "Task " n "([^0-9]|$)" }
        NR == 1 { print; next }
        /^([0-9]+[.)]|[-*]) / { flush(); item = $0; next }
        { if (item != "") item = item "\n" $0; else print }
        END { flush() }
    ' <<< "$sec")
    if [ "$(wc -l <<< "$out")" -le 1 ]; then
        out+=$'\n'"(No Review Focus item names Task $2.)"
    fi
    echo "$out"
}

# ratify_inputs <task_file> <task_num> <dir> <base_branch> <worktree> — writes
# what the ratifier is given into <dir>: task-section.md, review-focus.md,
# global-constraints.md and diff.patch (git diff <base>..HEAD, without
# activity.md: the worker's own log is deliberately withheld).
ratify_inputs() {
    local file="$1" num="$2" dir="$3" base="$4" wt="$5" range
    mkdir -p "$dir"
    range=$(task_section_range "$file" "$num") || range="1 0"
    sed -n "${range% *},${range#* }p" "$file" > "$dir/task-section.md"
    review_focus_for_task "$file" "$num" > "$dir/review-focus.md"
    [ -s "$dir/review-focus.md" ] || echo "(task.md has no Review Focus section.)" > "$dir/review-focus.md"
    md_section "$file" "Global Constraints" > "$dir/global-constraints.md"
    [ -s "$dir/global-constraints.md" ] || echo "(task.md has no Global Constraints section.)" > "$dir/global-constraints.md"
    git -C "$wt" diff "${base}..HEAD" -- . ':(exclude)ralphloop/activity.md' > "$dir/diff.patch"
}

# ratify_tree_state <worktree> — HEAD plus every changed or untracked path,
# as one string. The ratifier must change nothing in the repository (activity.md
# included: it sees an empty read-only file there, and its verdict goes to a
# separate output directory), so this must be identical before and after.
ratify_tree_state() {
    git -C "$1" rev-parse HEAD
    git -C "$1" status --porcelain
}

# ratify_mounts <canonical_root> <worktree> <log_file_relpath> <empty_file> <input_dir> <output_dir>
# The `-v` arguments of the ratify container, one per line (use mapfile):
#   - .git and the worktree, as for the worker;
#   - an EMPTY file mounted read-only over the worktree's activity.md, so the
#     worker's log is hidden by the filesystem, not by an instruction (a nested
#     file mount over the worktree mount; the real file must already exist);
#   - the inputs, read-only, at /ratify-input;
#   - an output directory at /ratify-output, the only place it can write.
ratify_mounts() {
    printf '%s\n' \
        "-v" "$1/.git:$1/.git" \
        "-v" "$2:$2" \
        "-v" "$4:$2/$3:ro" \
        "-v" "$5:/ratify-input:ro" \
        "-v" "$6:/ratify-output"
}

# ratify_log_details <verdict_file> <activity_log> <task_num> — appends the
# ratifier's write-up from its verdict file to the real log under
# "## Task N, ratify", without any result line (doloop.sh writes that itself,
# after judging the verdict). Capped, and a line the loop would read as a
# BLOCKED signal is defused, because this is text from a model.
ratify_log_details() {
    {
        printf '\n## Task %s, ratify\n' "$3"
        head -c 20000 "$1" 2>/dev/null \
            | grep -vE '^(RATIFIED|REJECTED): Task [0-9]+' \
            | sed 's/^BLOCKED:/BLOCKED (quoted):/' || true
    } >> "$2"
}

# ratify_result <activity_log> <lines_before> <task_num> — judges only the lines
# written after the call started (the log's line count was taken first), so a
# stale RATIFIED line from an earlier run can't pass. Prints one of:
#   RATIFIED | REJECTED: <reason> | NONE | AMBIGUOUS
ratify_result() {
    local new ok no
    new=$(tail -n +"$(( $2 + 1 ))" "$1" 2>/dev/null || true)
    ok=$(grep -cE "^RATIFIED: Task $3[[:space:]]*$" <<< "$new" || true)
    no=$(grep -cE "^REJECTED: Task $3: .+" <<< "$new" || true)
    if [ "$ok" -eq 1 ] && [ "$no" -eq 0 ]; then
        echo "RATIFIED"
    elif [ "$no" -eq 1 ] && [ "$ok" -eq 0 ]; then
        echo "REJECTED: $(grep -E "^REJECTED: Task $3: .+" <<< "$new" | sed -E "s/^REJECTED: Task $3: //")"
    elif [ "$ok" -eq 0 ] && [ "$no" -eq 0 ]; then
        echo "NONE"
    else
        echo "AMBIGUOUS"
    fi
}
