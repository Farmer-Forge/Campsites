# Tests for the database gate in doloop.sh — sourced by run-tests.sh. A fake
# `supabase` (tests/supabase-stub/supabase) answers `db reset` / `test db` from
# a scripted list, and the fake `gh` keeps PRs in a file. Needs the sandbox
# helpers from test-doloop.sh and test-chain.sh.

# gate_sandbox [PLAN] — a sandbox whose main has supabase/config.toml (so the
# gate is on), a scripted-results file and the env that points doloop.sh /
# chain.sh at the stubs. Sets SB and GATE_ENV.
gate_sandbox() {
    sandbox "${1:-}"
    mkdir -p "$SB/Campsites/supabase" "$SB/gh"
    printf 'project_id = "Campsites"\n' > "$SB/Campsites/supabase/config.toml"
    git -C "$SB/Campsites" add -A
    git -C "$SB/Campsites" commit -q -m "supabase config"
    git -C "$SB/Campsites" push -q origin main
    : > "$SB/results"; : > "$SB/appcheck-results"
    GATE_ENV="PATH=$HERE/supabase-stub:$HERE/gh-stub:$PATH RALPH_SUPABASE_LOG=$SB/supabase.log RALPH_SUPABASE_RESULTS=$SB/results RALPH_SEED_SCRIPT=$HERE/seed-stub.sh RALPH_APP_CHECK_STUB=$HERE/app-check-stub.sh RALPH_APP_CHECK_LOG=$SB/appcheck.log RALPH_APP_CHECK_RESULTS=$SB/appcheck-results RALPH_SKIP_PR=0 RALPH_GH_STUB_DIR=$SB/gh RALPH_GH_STUB_ORIGIN=$SB/origin.git"
}

# app_check_results RESULT... — script the next app-check results (pass|fail).
app_check_results() { printf '%s\n' "$@" > "$SB/appcheck-results"; }
app_check_calls() { cat "$SB/appcheck.log" 2>/dev/null; }

# gate_results RESULT... — script the next `db reset` results.
gate_results() { printf '%s\n' "$@" > "$SB/results"; }

supabase_calls() { cat "$SB/supabase.log" 2>/dev/null; }
count_calls()    { supabase_calls | grep -c -- "$1" || true; }
pr_lines()       { cat "$SB/gh/prs" 2>/dev/null; }

test_gate_runs_reset_then_test_from_the_worktree_after_each_step() {
    gate_sandbox; EXTRA_ENV="$GATE_ENV" run_loop tick tick tick
    assert_eq "exits 0" "$RC" 0
    assert_contains "says the gate is on" "$OUT" "Gate: on"
    assert_eq "reset ran after every step" "$(count_calls 'task-2 db reset')" 3
    assert_eq "test db ran after every step" "$(count_calls 'task-2 test db')" 3
    assert_eq "reset first, then test db" "$(supabase_calls | head -n 2 | tr '\n' '|')" "task-2 db reset|task-2 test db|"
    assert_contains "opened the normal PR" "$(pr_lines)" "open Task 2: Practice task"
    assert_not_contains "PR isn't flagged" "$(pr_lines)" "GATE FAILING"
    assert_eq "a passing task's PR is not a draft" "$(cat "$SB/gh/prs.drafts" 2>/dev/null)" ""
}

test_gate_is_off_without_a_supabase_config_on_main() {
    sandbox; mkdir -p "$SB/gh"; : > "$SB/results"
    EXTRA_ENV="PATH=$HERE/supabase-stub:$PATH RALPH_SUPABASE_LOG=$SB/supabase.log RALPH_SUPABASE_RESULTS=$SB/results" run_loop tick tick tick
    assert_eq "exits 0" "$RC" 0
    assert_contains "says the gate is off" "$OUT" "Gate: off"
    assert_eq "supabase never called" "$(supabase_calls)" ""
}

test_gate_failing_once_undoes_the_step_and_retries_with_the_output() {
    gate_sandbox; gate_results fail-test pass
    EXTRA_ENV="$GATE_ENV" run_loop tick tick tick tick
    assert_eq "exits 0" "$RC" 0
    assert_contains "logs the failed attempt" "$(branch_file ralphloop/activity.md)" "GATE FAILED: Step 1: Write \`first.txt\` (attempt 1/3)"
    assert_contains "logs the gate's output" "$(branch_file ralphloop/activity.md)" "not ok 1 - the attack test"
    assert_contains "next prompt carries the gate note" "$(prompt 2)" "the gate failed (attempt 1 of 3)"
    assert_contains "next prompt carries the output" "$(prompt 2)" "not ok 1 - the attack test"
    assert_eq "step 1 checkpointed once, after it passed" "$(branch_subjects | grep -c 'Step 1: Write')" 1
    assert_not_contains "no failed-gate checkpoint" "$(branch_subjects)" "GATE FAILED"
    assert_eq "four worker calls, not five" "$(exists "$SB/prompts/prompt-5.txt")" no
    assert_contains "task 2 fully checked on the branch" "$(branch_file ralphloop/task.md)" '- [x] **Step 3: Commit**'
}

test_gate_failing_three_times_opens_a_flagged_pr_and_stops() {
    gate_sandbox; gate_results fail-test fail-test fail-test
    EXTRA_ENV="$GATE_ENV" run_loop tick tick tick tick
    assert_eq "stops with exit 1" "$RC" 1
    assert_contains "says why" "$OUT" "Gate failed 3 times"
    assert_contains "says it stopped" "$OUT" "STOPPED: Task 2 failed the gate"
    assert_contains "PR is flagged in its title" "$(pr_lines)" "open ⚠️ GATE FAILING — Task 2: Practice task"
    assert_eq "and opened as a draft" "$(cat "$SB/gh/prs.drafts" 2>/dev/null)" 1
    assert_contains "work is committed as a failed checkpoint" "$(branch_subjects)" 'Checkpoint (GATE FAILED): Task 2 — Step 1: Write `first.txt`'
    assert_contains "the failing step is left unchecked" "$(branch_file ralphloop/task.md)" '- [ ] **Step 1: Write `first.txt`**'
    assert_eq "gate ran exactly three times" "$(count_calls 'test db')" 3
    assert_eq "no fourth worker call" "$(exists "$SB/prompts/prompt-4.txt")" no
    assert_eq "worktree kept for inspection" "$(exists "$SB/Campsites-worktrees/task-2")" yes
    assert_eq "gate logs kept" "$(ls "$SB/Campsites-worktrees/task-2.calls" | grep -c '^gate-.*\.log$')" 3
}

test_gate_failed_reset_skips_test_db() {
    gate_sandbox; gate_results fail-reset pass
    EXTRA_ENV="$GATE_ENV" run_loop tick tick tick tick
    assert_eq "exits 0" "$RC" 0
    assert_eq "four resets" "$(count_calls 'db reset')" 4
    assert_eq "test db only ran after a good reset" "$(count_calls 'test db')" 3
    assert_contains "the reset's output reached the next prompt" "$(prompt 2)" "reset exploded"
}

test_gate_timeout_counts_as_a_failure() {
    gate_sandbox; gate_results hang pass
    EXTRA_ENV="$GATE_ENV RALPH_GATE_TIMEOUT=1" run_loop tick tick tick tick
    assert_eq "exits 0" "$RC" 0
    assert_contains "the timeout is recorded" "$(branch_file ralphloop/activity.md)" "GATE TIMEOUT"
    assert_contains "counted as an attempt" "$(branch_file ralphloop/activity.md)" "(attempt 1/3)"
}

test_gate_retries_dont_use_up_the_step_limit_or_count_as_no_progress() {
    gate_sandbox; gate_results fail-test fail-test pass pass pass
    EXTRA_ENV="$GATE_ENV RALPH_MAX_STEPS=3" run_loop tick tick tick tick tick
    assert_eq "exits 0 although 5 calls ran with a limit of 3" "$RC" 0
    assert_contains "task 2 fully checked" "$(branch_file ralphloop/task.md)" '- [x] **Step 3: Commit**'
}

# The gate resets the database named by the worktree's own supabase/config.toml
# (project_id, ports), and Campsites shares this host, so a changed config
# means the gate must not run at all: stop like BLOCKED.
assert_gate_refused() {   # <what the worker did, for the message>
    assert_eq "stops with exit 1 ($1)" "$RC" 1
    assert_eq "the fake supabase was never called ($1)" "$(supabase_calls)" ""
    assert_contains "says why ($1)" "$OUT" "supabase/config.toml differs from main"
    assert_contains "worktree's activity.md has the GATE REFUSED line ($1)" \
        "$(cat "$SB/Campsites-worktrees/task-2/ralphloop/activity.md" 2>/dev/null)" "GATE REFUSED: supabase/config.toml differs from main"
    assert_eq "nothing pushed ($1)" "$(git -C "$SB/origin.git" branch --list 'ralph-loop/*')" ""
    assert_eq "no PR ($1)" "$(pr_lines)" ""
    assert_eq "worktree kept ($1)" "$(exists "$SB/Campsites-worktrees/task-2")" yes
}

test_gate_refuses_an_uncommitted_config_change() {
    gate_sandbox; EXTRA_ENV="$GATE_ENV" run_loop tick-editconfig tick tick
    assert_gate_refused "project_id edited, uncommitted"
}

test_gate_refuses_a_committed_config_change() {
    gate_sandbox; EXTRA_ENV="$GATE_ENV" run_loop tick-commitconfig tick tick
    assert_gate_refused "project_id edited and committed"
}

test_gate_refuses_a_deleted_config() {
    gate_sandbox; EXTRA_ENV="$GATE_ENV" run_loop tick-rmconfig tick tick
    assert_gate_refused "supabase/ deleted"
}

test_gate_refuses_on_a_later_step_too_and_resumes_once_the_config_is_restored() {
    gate_sandbox; EXTRA_ENV="$GATE_ENV" run_loop tick tick-editconfig tick
    assert_eq "stops" "$RC" 1
    assert_eq "the first step was gated, the second was refused" "$(count_calls 'db reset')" 1
    git -C "$SB/Campsites-worktrees/task-2" checkout -q main -- supabase/config.toml
    EXTRA_ENV="$GATE_ENV" run_loop tick tick
    assert_eq "rerun finishes once the config matches main again" "$RC" 0
}

test_gate_prompt_says_not_to_touch_the_config() {
    gate_sandbox; EXTRA_ENV="$GATE_ENV" run_loop tick tick tick
    assert_contains "worker is told" "$(prompt 1)" "Never edit"
    assert_contains "names the file" "$(prompt 1)" "supabase/config.toml"
}

test_gate_attempt_count_survives_a_resume() {
    gate_sandbox; gate_results fail-test fail-test
    EXTRA_ENV="$GATE_ENV" run_loop tick tick fail
    assert_eq "first run stops on the worker failure" "$RC" 1
    gate_results fail-test
    EXTRA_ENV="$GATE_ENV" run_loop tick
    assert_eq "third failed gate stops the rerun" "$RC" 1
    assert_contains "counted as attempt 3" "$OUT" "Gate failed 3 times"
    assert_contains "PR is flagged" "$(pr_lines)" "GATE FAILING"
}

test_gate_fixed_rerun_clears_the_failing_flag() {
    gate_sandbox; gate_results fail-test fail-test fail-test
    EXTRA_ENV="$GATE_ENV" run_loop tick tick tick
    assert_eq "flagged first" "$RC" 1
    gate_results pass pass pass
    EXTRA_ENV="$GATE_ENV" run_loop tick tick tick
    assert_eq "rerun finishes" "$RC" 0
    assert_not_contains "title no longer flagged" "$(pr_lines)" "GATE FAILING"
    assert_eq "no longer a draft" "$(cat "$SB/gh/prs.drafts" 2>/dev/null)" ""
    assert_contains "same PR, normal title" "$(pr_lines)" "open Task 2: Practice task"
    assert_eq "still one PR" "$(pr_lines | wc -l)" 1
}

test_gate_failure_stops_the_chain_and_it_never_merges_the_flagged_pr() {
    gate_sandbox "$CHAIN_PLAN"; gate_results fail-test fail-test fail-test
    EXTRA_ENV="$GATE_ENV" run_chain tick tick tick
    assert_eq "chain stops" "$RC" 1
    assert_contains "says doloop.sh stopped it" "$OUT" "doloop.sh exited 1"
    assert_not_contains "merged nothing" "$(main_subjects)" "(#"
    EXTRA_ENV="$GATE_ENV" run_chain
    assert_eq "a second chain run also stops" "$RC" 1
    assert_contains "refuses the flagged PR" "$OUT" "flagged as failing the gate"
    assert_not_contains "still merged nothing" "$(main_subjects)" "(#"
}

# --- Campsites: the dev seed and the app check run after the database part ---

test_gate_runs_seed_and_app_check_after_the_database_part() {
    gate_sandbox; EXTRA_ENV="$GATE_ENV" run_loop tick tick tick
    assert_eq "exits 0" "$RC" 0
    assert_eq "app check ran after every step, in the worktree" "$(app_check_calls | tr '\n' ' ')" "task-2 task-2 task-2 "
    assert_eq "order: database, seed (from the loop checkout), app (in the worktree)" "$(supabase_calls | head -n 4 | tr '\n' '|')" "task-2 db reset|task-2 test db|Campsites seed|task-2 app-check|"
}

test_gate_app_check_failing_once_undoes_the_step_and_retries() {
    gate_sandbox; app_check_results fail pass
    EXTRA_ENV="$GATE_ENV" run_loop tick tick tick tick
    assert_eq "exits 0" "$RC" 0
    assert_contains "logs the failed attempt" "$(branch_file ralphloop/activity.md)" "GATE FAILED: Step 1: Write \`first.txt\` (attempt 1/3)"
    assert_contains "next prompt carries the console error" "$(prompt 2)" "L.markerClusterGroup is not a function"
    assert_contains "next prompt names app-check.sh" "$(prompt 2)" "bash ralphloop/app-check.sh"
    assert_contains "task 2 fully checked on the branch" "$(branch_file ralphloop/task.md)" '- [x] **Step 3: Commit**'
}

test_gate_failing_database_part_skips_seed_and_app_check() {
    gate_sandbox; gate_results fail-reset pass
    EXTRA_ENV="$GATE_ENV" run_loop tick tick tick tick
    assert_eq "exits 0" "$RC" 0
    assert_eq "app check ran only for the 3 passing gates" "$(app_check_calls | wc -l | tr -d ' ')" 3
}

test_gate_seed_failure_fails_the_gate() {
    gate_sandbox
    EXTRA_ENV="$GATE_ENV RALPH_SEED_STUB_FAIL=1" run_loop tick tick tick tick
    assert_eq "exits 1 after 3 tries" "$RC" 1
    assert_contains "flagged PR" "$(pr_lines)" "GATE FAILING"
    assert_eq "app check never ran" "$(app_check_calls)" ""
}

test_gate_scripts_come_from_the_loop_checkout() {
    assert_contains "app check mounted read-only from LOOP_DIR" "$(grep -n 'ralph-loop' "$LOOP_DIR/doloop.sh")" '-v "${LOOP_DIR}:/ralph-loop:ro"'
    assert_contains "runs the mounted copy" "$(grep -n 'app-check.sh' "$LOOP_DIR/doloop.sh")" 'bash /ralph-loop/app-check.sh'
    assert_contains "seed from LOOP_DIR" "$(grep -n '^SEED_SCRIPT=' "$LOOP_DIR/doloop.sh")" '${LOOP_DIR}/seed-dev.sh'
}

test_worker_prompt_describes_the_gate() {
    gate_sandbox; EXTRA_ENV="$GATE_ENV" run_loop tick tick tick
    assert_contains "names the production build" "$(prompt 1)" "ng build --configuration production,local"
    assert_contains "never silence a console error" "$(prompt 1)" "never silence a"
}

test_gate_stops_early_when_the_image_has_no_playwright() {
    gate_sandbox
    # The real app check (no stub), with a fake docker whose `run` fails.
    local fake="$SB/fakedocker"; mkdir -p "$fake"
    printf '#!/usr/bin/env bash\nexit 1\n' > "$fake/docker"; chmod +x "$fake/docker"
    EXTRA_ENV="${GATE_ENV/RALPH_APP_CHECK_STUB=$HERE\/app-check-stub.sh /} PATH=$fake:$HERE/supabase-stub:$HERE/gh-stub:$PATH" run_loop tick tick tick
    assert_eq "exits 1" "$RC" 1
    assert_contains "says to rebuild the image" "$OUT" "has no Playwright, which the gate's app check needs"
    assert_eq "no worker ran" "$(exists "$SB/prompts/prompt-1.txt")" no
    assert_eq "supabase never called" "$(supabase_calls)" ""
}
