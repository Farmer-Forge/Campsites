# Tests for ratify in doloop.sh — sourced by run-tests.sh. The ratify call is
# replaced by tests/ratify-stub.sh (RALPH_RATIFY_STUB) or, for the Docker
# command itself, by the fake `docker` with RALPH_RATIFY_STUB emptied.
# Needs the sandbox helpers from test-doloop.sh and test-gate.sh.

# ratify_actions ACTION... — script the next ratify calls (default: ratified).
ratify_actions() { printf '%s\n' "$@" > "$SB/ratify-actions"; }

# pr_env — env that lets doloop.sh open a PR through the fake gh.
pr_env() {
    mkdir -p "$SB/gh"
    echo "PATH=$HERE/gh-stub:$PATH RALPH_SKIP_PR=0 RALPH_GH_STUB_DIR=$SB/gh RALPH_GH_STUB_ORIGIN=$SB/origin.git"
}

rat_prompt()   { cat "$SB/prompts/ratify-prompt-$1.txt" 2>/dev/null; }
wt_log()       { cat "$SB/Campsites-worktrees/task-2/ralphloop/activity.md" 2>/dev/null; }
# After a stop: no PR, and the final "Log Task N progress" commit was never pushed.
assert_nothing_published() {
    assert_eq "no PR ($1)" "$(cat "$SB/gh/prs" 2>/dev/null)" ""
    assert_not_contains "final log commit not pushed ($1)" "$(branch_subjects)" "Log Task 2 progress"
    assert_eq "worktree kept ($1)" "$(exists "$SB/Campsites-worktrees/task-2")" yes
}

test_ratify_ratified_takes_the_pr_path() {
    sandbox; EXTRA_ENV="$(pr_env)" run_loop tick tick tick
    assert_eq "exits 0" "$RC" 0
    assert_eq "ratify ran once, after the three worker calls" "$(ls "$SB/prompts" | grep -c '^ratify-prompt-')" 1
    assert_eq "on Opus" "$(cat "$SB/prompts/ratify-model-1.txt")" "claude-opus-5-5"
    assert_contains "PR opened" "$(cat "$SB/gh/prs")" "open Task 2: Practice task"
    assert_contains "the RATIFIED line is on the pushed branch" "$(branch_file ralphloop/activity.md)" "RATIFIED: Task 2"
    assert_contains "says so" "$OUT" "RATIFIED: Task 2"
    assert_eq "worktree removed as before" "$(exists "$SB/Campsites-worktrees/task-2")" no
}

test_ratify_rejected_stops_like_blocked() {
    sandbox; ratify_actions rejected
    EXTRA_ENV="$(pr_env)" run_loop tick tick tick
    assert_eq "exits 1" "$RC" 1
    assert_contains "shows the reason" "$OUT" "ratify REJECTED Task 2: the planted hole is open"
    assert_contains "the REJECTED line is in the worktree's log" "$(wt_log)" "REJECTED: Task 2: the planted hole is open"
    assert_nothing_published "rejected"
}

test_ratify_without_a_result_line_stops() {
    sandbox; ratify_actions none
    EXTRA_ENV="$(pr_env)" run_loop tick tick tick
    assert_eq "exits 1" "$RC" 1
    assert_contains "says why" "$OUT" "wrote no RATIFIED/REJECTED line"
    assert_contains "recorded in the log" "$(wt_log)" "RATIFY STOPPED: Task 2: no result line"
    assert_nothing_published "no line"
}

test_ratify_two_result_lines_stop() {
    sandbox; ratify_actions both
    EXTRA_ENV="$(pr_env)" run_loop tick tick tick
    assert_eq "exits 1" "$RC" 1
    assert_contains "says why" "$OUT" "more than one result line"
    assert_nothing_published "both lines"
}

test_ratify_a_changed_source_file_stops() {
    sandbox; ratify_actions changesource
    EXTRA_ENV="$(pr_env)" run_loop tick tick tick
    assert_eq "exits 1" "$RC" 1
    assert_contains "says why" "$OUT" "ratify changed files in the repository"
    assert_nothing_published "edited file"
}

test_ratify_a_new_file_stops() {
    sandbox; ratify_actions newfile
    EXTRA_ENV="$(pr_env)" run_loop tick tick tick
    assert_eq "exits 1" "$RC" 1
    assert_contains "says why" "$OUT" "ratify changed files in the repository"
    assert_nothing_published "new file"
}

test_ratify_a_commit_stops() {
    sandbox; ratify_actions commit
    EXTRA_ENV="$(pr_env)" run_loop tick tick tick
    assert_eq "exits 1" "$RC" 1
    assert_contains "says why" "$OUT" "ratify changed files in the repository"
    assert_nothing_published "commit"
}

test_ratify_a_stale_ratified_line_does_not_count() {
    sandbox
    printf '## Task 2, ratify (an earlier run)\nRATIFIED: Task 2\n' > "$SB/Campsites/ralphloop/activity.md"
    git -C "$SB/Campsites" add -A; git -C "$SB/Campsites" commit -q -m "old run's log"; git -C "$SB/Campsites" push -q origin main
    ratify_actions none
    EXTRA_ENV="$(pr_env)" run_loop tick tick tick
    assert_contains "the stale line is really in the log" "$(wt_log)" "RATIFIED: Task 2"
    assert_eq "exits 1" "$RC" 1
    assert_contains "no new line, so it stops" "$OUT" "wrote no RATIFIED/REJECTED line"
    assert_nothing_published "stale line"
}

test_ratify_still_runs_on_the_skip_workers_path() {
    sandbox; ratify_actions rejected
    EXTRA_ENV="$(pr_env)" run_loop tick tick tick
    assert_eq "first run is rejected" "$RC" 1
    EXTRA_ENV="$(pr_env)" run_loop
    assert_eq "the rerun exits 0" "$RC" 0
    assert_contains "went straight to publishing" "$OUT" "skipping straight to publishing"
    assert_eq "ratify ran again on that path" "$(ls "$SB/prompts" | grep -c '^ratify-prompt-')" 2
    assert_eq "no further worker call" "$(exists "$SB/prompts/prompt-4.txt")" no
    assert_contains "PR opened after the second verdict" "$(cat "$SB/gh/prs")" "open Task 2: Practice task"
}

test_ratify_is_not_given_the_workers_log() {
    sandbox
    EXTRA_ENV="$(pr_env)" run_loop tick tick tick
    local dir="$SB/prompts/ratify-input-1"
    assert_eq "the inputs it gets" "$(ls "$dir" | tr '\n' ' ')" "diff.patch global-constraints.md review-focus.md task-section.md "
    assert_not_contains "no activity.md in the diff" "$(cat "$dir/diff.patch")" "activity.md"
    assert_contains "the diff has the task's work" "$(cat "$dir/diff.patch")" "stub-file-1.txt"
    assert_not_contains "the worker's log text isn't in the prompt" "$(rat_prompt 1)" "Stub completed a step"
    assert_contains "told the log is an empty read-only file" "$(rat_prompt 1)" "empty read-only file"
    assert_contains "told where the verdict goes" "$(rat_prompt 1)" "/ratify-output/verdict.md"
    assert_contains "told every command must finish" "$(rat_prompt 1)" "EVERY command must finish on its own"
    assert_contains "told to run nothing that listens" "$(rat_prompt 1)" "Run nothing that listens"
    assert_contains "told which line to write" "$(rat_prompt 1)" "RATIFIED: Task 2"
    assert_not_contains "no placeholders left" "$(rat_prompt 1)" "@TASK"
}

REVIEW_PLAN=$(cat <<'EOF'
# Plan with shared rules
## Global Constraints
- Every function sets search_path.
## Review Focus
The five inputs most likely to bite:
1. Task 2: a user setting their own is_admin at insert.
2. Task 3: a viewer checking an item off.
3. Task 2 and Task 3: the audit columns.
## Task 1: Already provisioned
- [x] **Step 1: Done by hand**
## Task 2: First
- [ ] **Step 1: Do it**
**Verify:** run the thing.
## Task 3: Second
- [ ] **Step 1: Later**
EOF
)

test_ratify_gets_only_this_tasks_sections() {
    sandbox "$REVIEW_PLAN"
    EXTRA_ENV="$(pr_env)" run_loop tick
    assert_eq "exits 0" "$RC" 0
    local dir="$SB/prompts/ratify-input-1"
    assert_contains "this task's section" "$(cat "$dir/task-section.md")" "## Task 2: First"
    assert_contains "its Verify text" "$(cat "$dir/task-section.md")" "run the thing."
    assert_not_contains "not the next task" "$(cat "$dir/task-section.md")" "Task 3"
    assert_contains "Review Focus item naming Task 2" "$(cat "$dir/review-focus.md")" "setting their own is_admin"
    assert_contains "an item naming both tasks" "$(cat "$dir/review-focus.md")" "audit columns"
    assert_not_contains "not the item for Task 3 only" "$(cat "$dir/review-focus.md")" "viewer checking"
    assert_contains "Global Constraints" "$(cat "$dir/global-constraints.md")" "search_path"
    assert_not_contains "Global Constraints stop at the next section" "$(cat "$dir/global-constraints.md")" "is_admin"
}

test_ratify_waits_out_a_usage_limit_and_asks_again() {
    sandbox; ratify_actions limit ratified
    EXTRA_ENV="$(pr_env)" run_loop tick tick tick
    assert_eq "exits 0" "$RC" 0
    assert_contains "waited" "$OUT" "Usage limit hit (ratify)"
    assert_eq "two ratify calls" "$(ls "$SB/prompts" | grep -c '^ratify-prompt-')" 2
    assert_eq "workers weren't repeated" "$(exists "$SB/prompts/prompt-4.txt")" no
    assert_contains "PR opened" "$(cat "$SB/gh/prs")" "open Task 2"
}

test_ratify_call_failure_stops() {
    sandbox; ratify_actions fail
    EXTRA_ENV="$(pr_env)" run_loop tick tick tick
    assert_eq "exits 1" "$RC" 1
    assert_contains "says why" "$OUT" "the ratify call failed"
    assert_nothing_published "call failed"
}

test_ratify_timeout_stops_with_its_own_line_not_a_rejection() {
    sandbox; ratify_actions sleep
    EXTRA_ENV="$(pr_env) RATIFY_TIMEOUT=1" run_loop tick tick tick
    assert_eq "exits 1" "$RC" 1
    assert_contains "says it's a timeout" "$OUT" "This is a timeout, not a rejection"
    assert_contains "distinct line in the log" "$(wt_log)" "RATIFY TIMEOUT: Task 2"
    assert_not_contains "not recorded as a rejection" "$(wt_log)" "REJECTED"
    assert_nothing_published "timeout"
}

test_ratify_timeout_kills_the_named_container() {
    sandbox
    EXTRA_ENV="$(pr_env) PATH=$HERE/docker-stub:$HERE/gh-stub:$PATH RALPH_RATIFY_STUB= RALPH_DOCKER_LOG=$SB/docker.log RALPH_DOCKER_STUB_RATIFY=hang RATIFY_TIMEOUT=1" run_loop tick tick tick
    assert_eq "exits 1" "$RC" 1
    assert_contains "distinct line in the log" "$(wt_log)" "RATIFY TIMEOUT: Task 2"
    local name; name=$(grep -o -- '--name campsites-ratify-2-[0-9-]*' "$SB/docker.log" | head -n 1 | cut -d' ' -f2)
    assert_contains "the container was named" "$name" "campsites-ratify-2-"
    assert_contains "and killed by that name" "$(cat "$SB/docker.log")" "kill $name"
    assert_contains "and removed" "$(cat "$SB/docker.log")" "rm -f $name"
    assert_nothing_published "docker timeout"
}

test_ratify_docker_command_shape() {
    sandbox
    EXTRA_ENV="$(pr_env) PATH=$HERE/docker-stub:$HERE/gh-stub:$PATH RALPH_RATIFY_STUB= RALPH_DOCKER_LOG=$SB/docker.log RALPH_DOCKER_STUB_RATIFY=ratified" run_loop tick tick tick
    assert_eq "exits 0" "$RC" 0
    # The prompt is multi-line, so the logged call spans several lines: use the whole log.
    local call; call=$(cat "$SB/docker.log")
    assert_contains "named for the task" "$call" "--name campsites-ratify-2-"
    assert_contains "worker image" "$call" "campsites-claude-worker:latest"
    assert_contains "Opus" "$call" "--model claude-opus-5-5"
    assert_contains "inputs mounted read-only" "$call" ":/ratify-input:ro"
    assert_contains "Claude credentials" "$call" "--env-file $SB/claude-auth.env"
    assert_contains "database values" "$call" "--env-file $SB/supabase.env"
    assert_not_contains "no GitHub token passed in" "$call" "RALPH_GH_TOKEN"
    assert_contains "activity.md is hidden by an empty read-only file mounted over it" "$call" "ratify-empty-activity.md:$SB/Campsites-worktrees/task-2/ralphloop/activity.md:ro"
    assert_contains "the verdict has its own writable directory" "$call" "ratify-output:/ratify-output"
}

test_ratify_timeout_must_be_a_duration() {
    sandbox
    EXTRA_ENV="RATIFY_TIMEOUT=soon" run_loop tick
    assert_eq "refuses to start" "$RC" 1
    assert_contains "says why" "$OUT" "RATIFY_TIMEOUT='soon' is not a duration"
    assert_eq "no worker call" "$(exists "$SB/prompts/prompt-1.txt")" no
}

test_ratify_is_skipped_when_the_gate_gave_up() {
    gate_sandbox; gate_results fail-test fail-test fail-test
    EXTRA_ENV="$GATE_ENV" run_loop tick tick tick
    assert_eq "exits 1 from the gate" "$RC" 1
    assert_eq "ratify never ran" "$(ls "$SB/prompts" | grep -c '^ratify-prompt-')" 0
}

test_ratify_on_the_skip_path_reruns_the_gate_first() {
    gate_sandbox; ratify_actions rejected
    EXTRA_ENV="$GATE_ENV" run_loop tick tick tick
    assert_eq "first run rejected" "$RC" 1
    assert_eq "three step gates so far" "$(count_calls 'db reset')" 3
    EXTRA_ENV="$GATE_ENV" run_loop
    assert_eq "rerun exits 0" "$RC" 0
    assert_eq "one more gate run before ratify" "$(count_calls 'db reset')" 4
}

test_ratify_does_not_run_when_the_gate_refuses_the_config() {
    gate_sandbox; ratify_actions rejected
    EXTRA_ENV="$GATE_ENV" run_loop tick tick tick
    sed -i 's/Campsites/Elsewhere/' "$SB/Campsites-worktrees/task-2/supabase/config.toml"
    EXTRA_ENV="$GATE_ENV" run_loop
    assert_eq "stops" "$RC" 1
    assert_contains "refused on the skip path too" "$OUT" "supabase/config.toml differs from main"
    assert_eq "ratify didn't run again" "$(ls "$SB/prompts" | grep -c '^ratify-prompt-')" 1
}

test_duration_seconds() {
    assert_eq "seconds" "$(duration_seconds 2700)" 2700
    assert_eq "minutes" "$(duration_seconds 45m)" 2700
    assert_eq "hours" "$(duration_seconds 1h)" 3600
    assert_eq "explicit seconds" "$(duration_seconds 30s)" 30
    assert_eq "zero is refused" "$(duration_seconds 0 || echo bad)" bad
    assert_eq "words are refused" "$(duration_seconds soon || echo bad)" bad
    assert_eq "empty is refused" "$(duration_seconds '' || echo bad)" bad
}

test_ratify_default_timeout_is_45_minutes() {
    assert_contains "doloop.sh defaults to 45m" "$(grep -n 'RATIFY_TIMEOUT:-' "$LOOP_DIR/doloop.sh")" 'RATIFY_TIMEOUT:-45m'
}

test_ratify_result_judges_only_new_lines() {
    local f; f=$(mktemp)
    printf 'old\nRATIFIED: Task 2\n' > "$f"
    assert_eq "stale line only" "$(ratify_result "$f" 2 2)" NONE
    printf 'RATIFIED: Task 2\n' >> "$f"
    assert_eq "a new line counts" "$(ratify_result "$f" 2 2)" RATIFIED
    assert_eq "another task's line doesn't" "$(ratify_result "$f" 2 3)" NONE
    printf 'REJECTED: Task 2: bad grant\n' >> "$f"
    assert_eq "both is ambiguous" "$(ratify_result "$f" 2 2)" AMBIGUOUS
    printf 'REJECTED: Task 4: bad grant on profile\n' > "$f"
    assert_eq "a rejection carries its reason" "$(ratify_result "$f" 0 4)" "REJECTED: bad grant on profile"
    rm -f "$f"
}

test_ratify_hides_the_workers_log_with_an_empty_file() {
    sandbox; ratify_actions readlog
    EXTRA_ENV="$(pr_env)" run_loop tick tick tick
    assert_eq "exits 0" "$RC" 0
    assert_eq "what the ratifier saw at activity.md is empty" "$(wc -c < "$SB/prompts/ratify-saw-activity-1.txt")" 0
    assert_contains "its own note says so" "$(branch_file ralphloop/activity.md)" "activity.md as the ratifier sees it: 0 bytes"
    assert_contains "the real log still has the worker's entries" "$(branch_file ralphloop/activity.md)" "Stub completed a step"
}

test_ratify_the_loop_writes_the_real_log_details_then_the_line() {
    sandbox
    EXTRA_ENV="$(pr_env)" run_loop tick tick tick
    assert_eq "exits 0" "$RC" 0
    local log; log=$(branch_file ralphloop/activity.md)
    assert_eq "exactly one RATIFIED line" "$(grep -c '^RATIFIED: Task 2$' <<< "$log")" 1
    assert_contains "the loop added the heading" "$log" "## Task 2, ratify"
    local h d r
    h=$(grep -n '^## Task 2, ratify' <<< "$log" | cut -d: -f1)
    d=$(grep -n 'Stub ratifier: looked' <<< "$log" | cut -d: -f1)
    r=$(grep -n '^RATIFIED: Task 2$' <<< "$log" | cut -d: -f1)
    assert_eq "heading, then write-up, then the line" "$(( h < d && d < r ? 1 : 0 ))" 1
    assert_eq "the worker's three entries are intact" "$(grep -c '^## Task 2, call' <<< "$log")" 3
}

test_ratify_a_ratifier_that_writes_the_real_log_is_caught() {
    sandbox; ratify_actions writereallog
    EXTRA_ENV="$(pr_env)" run_loop tick tick tick
    assert_eq "exits 1" "$RC" 1
    assert_contains "says why" "$OUT" "ratify changed files in the repository"
    assert_nothing_published "wrote the log"
}

test_ratify_text_from_the_model_cant_fake_a_block() {
    sandbox; ratify_actions blockedtext
    EXTRA_ENV="$(pr_env)" run_loop tick tick tick
    assert_eq "exits 0" "$RC" 0
    assert_eq "no line the loop would read as BLOCKED" "$(branch_file ralphloop/activity.md | grep -c '^BLOCKED:')" 0
    assert_contains "kept, defused" "$(branch_file ralphloop/activity.md)" "BLOCKED (quoted): pretend the ratifier is a worker"
}

test_ratify_the_real_log_is_not_touched_while_the_ratifier_runs() {
    sandbox; ratify_actions sleep
    EXTRA_ENV="$(pr_env) RATIFY_TIMEOUT=1" run_loop tick tick tick
    assert_eq "timed out" "$RC" 1
    local log; log=$(wt_log)
    assert_eq "only the loop's timeout line follows the worker's entries" "$(grep -c '^## Task 2, ratify' <<< "$log")" 0
    assert_contains "the worker's entries are intact" "$log" "Stub completed a step"
    assert_contains "and the timeout line was added by the loop" "$log" "RATIFY TIMEOUT: Task 2"
}

# The mounts, for real: with the real worker image, activity.md reads as empty,
# can't be written, the real file is untouched, and the output directory works.
test_ratify_mounts_hide_the_log_in_a_real_container() {
    if ! docker image inspect campsites-claude-worker:latest >/dev/null 2>&1; then
        ok "skipped: campsites-claude-worker:latest isn't built here"; return
    fi
    local d wt out empty mounts got
    d=$(mktemp -d); wt="$d/wt"; out="$d/out"; empty="$d/empty"
    mkdir -p "$wt/ralphloop" "$d/in" "$d/repo/.git" "$out"
    echo "WORKER SECRET" > "$wt/ralphloop/activity.md"; : > "$empty"
    mapfile -t mounts < <(ratify_mounts "$d/repo" "$wt" ralphloop/activity.md "$empty" "$d/in" "$out")
    got=$(docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp "${mounts[@]}" -w "$wt" campsites-claude-worker:latest sh -c '
        echo "bytes=$(wc -c < ralphloop/activity.md)"
        echo "grep=$(grep -c SECRET ralphloop/activity.md)"
        if echo hacked >> ralphloop/activity.md 2>/dev/null; then echo "write=allowed"; else echo "write=refused"; fi
        if echo x > /ratify-input/y 2>/dev/null; then echo "input=writable"; else echo "input=read-only"; fi
        echo "RATIFIED: Task 9" > /ratify-output/verdict.md' 2>&1)
    assert_contains "reads as empty" "$got" "bytes=0"
    assert_contains "the secret isn't visible" "$got" "grep=0"
    assert_contains "can't be written" "$got" "write=refused"
    assert_contains "inputs are read-only" "$got" "input=read-only"
    assert_eq "the real log is untouched" "$(cat "$wt/ralphloop/activity.md")" "WORKER SECRET"
    assert_eq "the verdict reached the host" "$(cat "$out/verdict.md")" "RATIFIED: Task 9"
    rm -rf "$d"
}
