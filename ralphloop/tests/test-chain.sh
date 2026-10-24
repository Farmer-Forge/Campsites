# End-to-end tests of chain.sh — sourced by run-tests.sh. Same sandbox as
# test-doloop.sh (bare "origin" + canonical clone), plus a fake `gh`
# (tests/gh-stub/gh) that keeps PRs in a file and really squash-merges them
# into the sandbox origin. Nothing touches GitHub, Docker or a real claude call.

CHAIN_PLAN=$(cat <<'EOF'
# Chain practice plan
## Task 1: Already provisioned
- [x] **Step 1: Done by hand**
## Task 2: First task
- [ ] **Step 1: Two-a**
- [ ] **Step 2: Two-b**
## Task 3: Second task
- [ ] **Step 1: Three-a**
- [ ] **Step 2: Three-b**
EOF
)

ONE_TASK_PLAN=$(cat <<'EOF'
# One-task plan
## Task 1: Already provisioned
- [x] **Step 1: Done by hand**
## Task 2: Only task
- [ ] **Step 1: The one thing**
EOF
)

# run_chain ACTION... — run chain.sh (or $CHAIN_TARGET, e.g. doloop.sh) in the
# sandbox with the stub worker and the fake gh. Sets OUT and RC.
run_chain() {
    if ! loop_supports_stub; then
        RC=127; OUT="refusing to run: doloop.sh has no RALPH_WORKER_STUB support"; return
    fi
    printf '%s\n' "$@" > "$SB/actions"
    mkdir -p "$SB/gh"
    RC=0
    # shellcheck disable=SC2086  # EXTRA_ENV is deliberately word-split into KEY=VALUE args
    OUT=$(cd "$SB/Campsites" && env \
        PATH="$HERE/gh-stub:$PATH" \
        RALPH_GH_STUB_DIR="$SB/gh" \
        RALPH_GH_STUB_ORIGIN="$SB/origin.git" \
        RALPH_GH_TOKEN=dummy \
        RALPH_WORKER_STUB="$HERE/stub-worker.sh" \
        RALPH_STUB_ACTIONS="$SB/actions" \
        RALPH_STUB_PROMPTS_DIR="$SB/prompts" \
        RALPH_PUSH_URL="$SB/origin.git" \
        RALPH_WAIT_SCALE=0 \
        RALPH_POLL_SECONDS=1 \
        RALPH_RETRY_SECONDS=0 \
        RALPH_REVIEW_SCRIPT="$HERE/review-stub.sh" \
        RALPH_SEED_SCRIPT="$HERE/seed-stub.sh" \
        RALPH_QC_FILE="$SB/qc-checklist.md" \
        RALPH_CLAUDE_AUTH_ENV="$SB/claude-auth.env" \
        RALPH_SUPABASE_ENV="$SB/supabase.env" \
        ${EXTRA_ENV:-} \
        bash "$LOOP_DIR/${CHAIN_TARGET:-chain.sh}" 2>&1) || RC=$?
}

main_subjects()  { git -C "$SB/origin.git" log --format=%s main; }
main_task_md()   { git -C "$SB/origin.git" show main:ralphloop/task.md; }
remote_branches() { git -C "$SB/origin.git" for-each-ref --format='%(refname:short)' refs/heads/; }

test_chain_runs_every_task_then_finishes() {
    sandbox "$CHAIN_PLAN"; run_chain tick tick tick tick
    assert_eq "exits 0 at the normal end" "$RC" 0
    assert_contains "says nothing is left" "$OUT" "Chain finished: doloop.sh opened no PR — nothing left to run"
    assert_contains "task 2 squash-merged into main" "$(main_subjects)" "Task 2: First task (#1)"
    assert_contains "task 3 squash-merged into main" "$(main_subjects)" "Task 3: Second task (#2)"
    assert_contains "main has task 3 fully checked" "$(main_task_md)" "- [x] **Step 2: Three-b**"
    assert_not_contains "merged branches deleted on the remote" "$(remote_branches)" "ralph-loop/"
    assert_contains "log file written" "$(cat "$SB/Campsites-chain.log" 2>/dev/null)" "Squash-merging PR #2"
    assert_eq "canonical clone pulled up to origin main" "$(git -C "$SB/Campsites" rev-parse main)" "$(git -C "$SB/origin.git" rev-parse main)"
    assert_contains "starts the review app as its last step" "$OUT" "review stub: started"
}

test_chain_merges_already_open_pr_first() {
    sandbox "$CHAIN_PLAN"
    CHAIN_TARGET=doloop.sh run_chain tick tick
    assert_eq "plain doloop.sh run opened task 2's PR" "$RC" 0
    assert_contains "doloop.sh's real gh pr create path ran" "$OUT" "PR: https://github.com/stub/repo/pull/1"
    run_chain tick tick
    assert_eq "chain exits 0" "$RC" 0
    assert_contains "merged the open PR before running anything" "$(head -n 3 <<< "$OUT")" "Squash-merging PR #1 (ralph-loop/task-2)"
    assert_contains "then ran and merged task 3" "$(main_subjects)" "Task 3: Second task (#2)"
}

test_chain_stops_when_doloop_stops() {
    sandbox "$CHAIN_PLAN"; run_chain tick fail
    assert_eq "exits with doloop.sh's code" "$RC" 1
    assert_contains "says the chain stopped" "$OUT" "Chain stopped: doloop.sh exited 1"
    assert_not_contains "nothing merged" "$(main_subjects)" "(#"
    assert_not_contains "no review app on a failed run" "$OUT" "review stub: started"
}

test_chain_waits_for_running_doloop() {
    sandbox "$CHAIN_PLAN"
    (cd "$SB/Campsites" && exec -a doloop.sh sleep 3) &
    local fake=$!
    sleep 0.3
    run_chain tick tick tick tick
    wait "$fake" 2>/dev/null || true
    assert_contains "waited for the run in progress" "$OUT" "Waiting for the doloop.sh run already in progress"
    assert_eq "then finished normally" "$RC" 0
}

test_chain_ignores_doloop_in_other_clones() {
    sandbox "$CHAIN_PLAN"
    local elsewhere; elsewhere=$(mktemp -d)
    (cd "$elsewhere" && exec -a doloop.sh sleep 3) &
    local fake=$!
    sleep 0.3
    run_chain tick tick tick tick
    kill "$fake" 2>/dev/null || true; wait "$fake" 2>/dev/null || true
    assert_not_contains "didn't wait on another clone's run" "$OUT" "Waiting for"
    assert_eq "finished" "$RC" 0
}

test_chain_stops_if_a_merge_makes_no_progress() {
    sandbox "$CHAIN_PLAN"
    EXTRA_ENV="RALPH_GH_STUB_NOOP_MERGE=1" run_chain tick tick tick tick
    assert_eq "stops" "$RC" 1
    assert_contains "explains the lack of progress" "$OUT" "didn't check off any steps"
}

test_chain_ends_when_no_pr_opened() {
    sandbox "$ONE_TASK_PLAN"; run_chain tick
    assert_eq "exits 0" "$RC" 0
    assert_contains "says nothing is left" "$OUT" "nothing left to run"
    assert_contains "starts the review app as its last step" "$OUT" "review stub: started"
    assert_contains "the one task was merged" "$(main_subjects)" "Task 2: Only task (#1)"
}

test_chain_refuses_pr_touching_loop_files() {
    sandbox "$CHAIN_PLAN"; run_chain tick tick-loopfile
    assert_eq "stops" "$RC" 1
    assert_contains "explains why" "$OUT" "changes the loop's own files"
    assert_contains "names the file" "$OUT" "ralphloop/sneaky.sh"
    assert_not_contains "merged nothing" "$(main_subjects)" "(#"
}

test_chain_refuses_pr_touching_schema_contract() {
    sandbox "$CHAIN_PLAN"; run_chain tick tick-schemafile
    assert_eq "stops" "$RC" 1
    assert_contains "explains why" "$OUT" "the schema contract"
    assert_contains "names the migration" "$OUT" "supabase/migrations/0019_sneaky.sql"
    assert_contains "names the edge function" "$OUT" "supabase/functions/sneaky/index.ts"
    assert_not_contains "merged nothing" "$(main_subjects)" "(#"
}

test_chain_refuses_pr_with_local_config_the_worker_committed() {
    sandbox "$CHAIN_PLAN"; run_chain tick tick-commit-localenv
    assert_eq "stops" "$RC" 1
    assert_contains "explains why" "$OUT" "local settings"
    assert_contains "names the file" "$OUT" "src/environments/environment.local.ts"
    assert_not_contains "merged nothing" "$(main_subjects)" "(#"
}

test_chain_refuses_when_not_on_main() {
    sandbox "$CHAIN_PLAN"
    git -C "$SB/Campsites" checkout -q -b some-other-branch
    run_chain tick tick tick tick
    assert_eq "stops" "$RC" 1
    assert_contains "says it's not on main" "$OUT" "not main"
    assert_eq "never called the worker" "$(exists "$SB/prompts/prompt-1.txt")" no
}

test_chain_refuses_second_chain() {
    sandbox "$CHAIN_PLAN"
    (flock 9; sleep 3) 9>"$SB/Campsites-chain.lock" &
    local holder=$!
    sleep 0.3
    run_chain tick tick tick tick
    kill "$holder" 2>/dev/null || true; wait "$holder" 2>/dev/null || true
    assert_eq "stops" "$RC" 1
    assert_contains "says another chain is running" "$OUT" "another chain.sh is already running"
    assert_eq "never called the worker" "$(exists "$SB/prompts/prompt-1.txt")" no
}

test_chain_retries_transient_merge_failure() {
    sandbox "$CHAIN_PLAN"
    EXTRA_ENV="RALPH_GH_STUB_FAIL_ONCE=pr_merge" run_chain tick tick tick tick
    assert_eq "still finishes" "$RC" 0
    assert_contains "said it was retrying" "$OUT" "retrying"
    assert_contains "task 2 merged on the retry" "$(main_subjects)" "Task 2: First task (#1)"
}

test_chain_finishes_a_task_split_across_two_prs() {
    sandbox "$CHAIN_PLAN"
    # Task 2's first PR holds only Step 1 (what happened to MyGear's Task 3):
    CHAIN_TARGET=doloop.sh run_chain tick fail
    (cd "$SB/Campsites" && PATH="$HERE/gh-stub:$PATH" RALPH_GH_STUB_DIR="$SB/gh" RALPH_GH_STUB_ORIGIN="$SB/origin.git" \
        gh pr create --repo x --base main --head ralph-loop/task-2 --title "Task 2: First task" --body partial >/dev/null)
    git -C "$SB/Campsites" worktree remove --force "$SB/Campsites-worktrees/task-2"
    git -C "$SB/Campsites" branch -q -D ralph-loop/task-2
    run_chain tick tick tick
    assert_eq "finishes" "$RC" 0
    assert_not_contains "no false loop alarm" "$OUT" "didn't check off any steps"
    assert_contains "partial PR merged first" "$(main_subjects)" "Task 2: First task (#1)"
    assert_contains "rest of task 2 merged next" "$(main_subjects)" "Task 2: First task (#2)"
    assert_contains "then task 3" "$(main_subjects)" "Task 3: Second task (#3)"
}

test_chain_runs_the_seed_after_each_merge() {
    sandbox "$CHAIN_PLAN"; run_chain tick tick tick tick
    assert_eq "finishes" "$RC" 0
    assert_eq "seed ran every round (3 rounds here)" "$(grep -c 'seed stub: ran' <<< "$OUT")" 3
}

test_chain_seed_failure_only_warns() {
    sandbox "$CHAIN_PLAN"
    EXTRA_ENV="RALPH_SEED_STUB_FAIL=1" run_chain tick tick tick tick
    assert_eq "still finishes" "$RC" 0
    assert_contains "warns" "$OUT" "seed failed"
}

QC_PLAN=$(cat <<'EOF'
# QC plan
## Task 1: Already provisioned
- [x] **Step 1: Done by hand**

---

## Task 2: First task
- [ ] **Step 1: Two-a**

**QC (for Shawn, in the browser):**
- Open `/gear` and click *Add gear*.
- Check [the link](http://example.com) and **bold** text survive.

---

## Task 3: Second task
- [ ] **Step 1: Three-a**

**QC (for Shawn, in the browser):** nothing to click yet.

---

## After Task 3: notes
Not a task.
EOF
)

test_chain_writes_the_qc_checklist_on_finish() {
    sandbox "$QC_PLAN"; run_chain tick tick
    assert_eq "finishes" "$RC" 0
    local qc; qc=$(cat "$SB/qc-checklist.md" 2>/dev/null)
    assert_contains "task 2 heading" "$qc" "### Task 2: First task"
    assert_contains "task 2 bullet verbatim" "$qc" '- Open `/gear` and click *Add gear*.'
    assert_contains "link and bold verbatim" "$qc" '- Check [the link](http://example.com) and **bold** text survive.'
    assert_contains "one-line QC text kept" "$qc" "nothing to click yet."
    assert_not_contains "stops at the task's end" "$qc" "Not a task."
    assert_eq "tasks in order" "$(grep -n '^### Task' <<< "$qc" | cut -d: -f2- | tr '\n' '|')" "### Task 2: First task|### Task 3: Second task|"
    assert_contains "says where it is" "$OUT" "QC checklist:"
}

test_chain_no_qc_checklist_when_stopped() {
    sandbox "$QC_PLAN"; run_chain tick fail
    assert_eq "stops" "$RC" 1
    assert_eq "no checklist for an unfinished run" "$(exists "$SB/qc-checklist.md")" no
}
