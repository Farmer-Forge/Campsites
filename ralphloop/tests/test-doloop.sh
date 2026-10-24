# End-to-end tests of doloop.sh with a stub worker — sourced by run-tests.sh.
# Each scenario builds a throwaway sandbox: a bare "origin" repo standing in
# for GitHub, plus a canonical clone whose main has a 3-step practice Task 2.
# Nothing touches GitHub, Docker, ~/projects/Campsites, or a real claude call.

PRACTICE_TASK=$(cat <<'EOF'
# Practice plan
## Task 1: Already provisioned
- [x] **Step 1: Done by hand**
## Task 2: Practice task
- [ ] **Step 1: Write `first.txt`** — the first thing
- [ ] **Step 2: Second thing**
- [ ] **Step 3: Commit**
## Task 3: Later task
- [ ] **Step 1: Not reached in these tests**
EOF
)

# sandbox [PLAN] — sets SB and builds $SB/origin.git + $SB/Campsites (main = PLAN,
# default the practice plan above).
sandbox() {
    SB=$(mktemp -d)
    git init -q --bare "$SB/origin.git"
    git -C "$SB/origin.git" symbolic-ref HEAD refs/heads/main
    git clone -q "$SB/origin.git" "$SB/Campsites" 2>/dev/null
    git -C "$SB/Campsites" symbolic-ref HEAD refs/heads/main
    git -C "$SB/Campsites" config user.name T
    git -C "$SB/Campsites" config user.email t@t
    mkdir -p "$SB/Campsites/ralphloop" "$SB/prompts"
    printf '%s\n' "${1:-$PRACTICE_TASK}" > "$SB/Campsites/ralphloop/task.md"
    git -C "$SB/Campsites" add -A
    git -C "$SB/Campsites" commit -q -m "practice plan"
    git -C "$SB/Campsites" push -q origin main
    : > "$SB/claude-auth.env"
    : > "$SB/supabase.env"
}

# Refuse to run a doloop.sh that can't be pointed at the stub — it would make
# real claude calls with the real credentials.
loop_supports_stub() { grep -q 'RALPH_WORKER_STUB' "$LOOP_DIR/doloop.sh"; }

# run_loop ACTION... — run doloop.sh in the sandbox, the stub doing one action
# per worker call. Sets OUT (all output) and RC. EXTRA_ENV adds KEY=VALUE pairs.
run_loop() {
    if ! loop_supports_stub; then
        RC=127
        OUT="refusing to run: doloop.sh has no RALPH_WORKER_STUB support yet, so it would make real claude calls"
        return
    fi
    printf '%s\n' "$@" > "$SB/actions"
    RC=0
    # shellcheck disable=SC2086  # EXTRA_ENV is deliberately word-split into KEY=VALUE args
    OUT=$(cd "$SB/Campsites" && env \
        RALPH_GH_TOKEN=dummy \
        RALPH_WORKER_STUB="$HERE/stub-worker.sh" \
        RALPH_STUB_ACTIONS="$SB/actions" \
        RALPH_STUB_PROMPTS_DIR="$SB/prompts" \
        RALPH_STUB_TASK=2 \
        RALPH_PUSH_URL="$SB/origin.git" \
        RALPH_SKIP_PR=1 \
        RALPH_WAIT_SCALE=0 \
        RALPH_CLAUDE_AUTH_ENV="$SB/claude-auth.env" \
        RALPH_SUPABASE_ENV="$SB/supabase.env" \
        ${EXTRA_ENV:-} \
        bash "$LOOP_DIR/doloop.sh" 2>&1) || RC=$?
}

branch_subjects() { git -C "$SB/origin.git" log --format=%s refs/heads/ralph-loop/task-2 2>/dev/null; }
branch_file()     { git -C "$SB/origin.git" show "refs/heads/ralph-loop/task-2:$1" 2>/dev/null; }
prompt()          { cat "$SB/prompts/prompt-$1.txt" 2>/dev/null; }
exists()          { if [ -e "$1" ]; then echo yes; else echo no; fi; }

test_loop_happy_path() {
    sandbox; run_loop tick tick tick
    assert_eq "exits 0" "$RC" 0
    local s; s=$(branch_subjects)
    assert_contains "checkpoint subject keeps backticks verbatim" "$s" 'Checkpoint: Task 2 — Step 1: Write `first.txt`'
    assert_contains "checkpoint for step 3" "$s" "Checkpoint: Task 2 — Step 3: Commit"
    assert_contains "task.md fully checked on the pushed branch" "$(branch_file ralphloop/task.md)" "- [x] **Step 3: Commit**"
    assert_contains "stub's work reached the pushed branch" "$(git -C "$SB/origin.git" ls-tree --name-only refs/heads/ralph-loop/task-2)" "stub-file-3.txt"
    assert_eq "worktree removed" "$(exists "$SB/Campsites-worktrees/task-2")" no
    assert_eq "call logs removed" "$(exists "$SB/Campsites-worktrees/task-2.calls")" no
    assert_eq "local branch removed" "$(git -C "$SB/Campsites" branch --list ralph-loop/task-2)" ""
    assert_contains "prompt carries the checkpoint rule" "$(prompt 1)" "Checkpoint commits"
    assert_contains "prompt numbers the call" "$(prompt 1)" "## Task 2, call 1"
}

test_loop_double_tick() {
    sandbox; run_loop tick2 tick
    assert_eq "exits 0" "$RC" 0
    assert_contains "one checkpoint names the first step and the extra" "$(branch_subjects)" 'Step 1: Write `first.txt` (+1 more)'
}

test_loop_never_commits_secrets() {
    sandbox; run_loop secret-tick tick tick
    assert_eq "exits 0" "$RC" 0
    local all; all=$(git -C "$SB/origin.git" log --name-only --format= refs/heads/ralph-loop/task-2)
    assert_not_contains "no .env.local in any commit" "$all" ".env.local"
    assert_not_contains "no node_modules in any commit" "$all" "node_modules"
}

test_loop_failure_stops_then_resumes() {
    sandbox; run_loop tick partial-fail
    assert_eq "stops with exit 1" "$RC" 1
    assert_contains "says it stopped on a worker failure" "$OUT" "STOPPED: worker call"
    assert_eq "worktree kept" "$(exists "$SB/Campsites-worktrees/task-2")" yes
    assert_contains "step 1's checkpoint was pushed before the stop" "$(branch_subjects)" 'Step 1: Write `first.txt`'
    run_loop tick tick
    assert_eq "rerun finishes" "$RC" 0
    assert_contains "rerun's first prompt points at the partial work" "$(prompt 3)" "partial-work.txt"
    assert_contains "the failure is in the activity log" "$(branch_file ralphloop/activity.md)" "ended without completing a step"
}

test_loop_resumes_from_remote_branch() {
    sandbox; run_loop tick fail
    git -C "$SB/Campsites" worktree remove --force "$SB/Campsites-worktrees/task-2"
    git -C "$SB/Campsites" branch -q -D ralph-loop/task-2
    run_loop tick tick
    assert_eq "finishes" "$RC" 0
    assert_contains "says it resumed from the remote" "$OUT" "Resuming Task 2 from its checkpoint branch"
    assert_contains "step 1's checkpoint survived" "$(branch_subjects)" 'Step 1: Write `first.txt`'
}

test_loop_refuses_stale_remote_branch() {
    sandbox
    git -C "$SB/Campsites" push -q origin main:refs/heads/ralph-loop/task-2
    echo x > "$SB/Campsites/newer.txt"
    git -C "$SB/Campsites" add newer.txt
    git -C "$SB/Campsites" commit -q -m newer
    git -C "$SB/Campsites" push -q origin main
    run_loop tick tick tick
    assert_eq "stops" "$RC" 1
    assert_contains "explains the leftover branch" "$OUT" "left over from an earlier run"
    assert_eq "never called the worker" "$(exists "$SB/prompts/prompt-1.txt")" no
}

test_loop_rerun_after_finish() {
    sandbox; run_loop tick tick tick
    run_loop
    assert_eq "second run exits 0" "$RC" 0
    assert_contains "skips straight to publishing" "$OUT" "already checked off"
    assert_eq "no extra worker call" "$(exists "$SB/prompts/prompt-4.txt")" no
}

test_loop_blocked_still_stops() {
    sandbox; run_loop blocked
    assert_eq "stops with exit 1" "$RC" 1
    assert_contains "says BLOCKED" "$OUT" "BLOCKED"
}

test_loop_usage_limit_retries_same_step() {
    sandbox; run_loop tick partial-limit tick tick
    assert_eq "exits 0" "$RC" 0
    assert_contains "announces the wait" "$OUT" "Usage limit hit — retrying Task 2 at"
    assert_contains "retry prompt explains the interruption" "$(prompt 3)" "interrupted (usage limit)"
    assert_contains "retry prompt lists the partial work" "$(prompt 3)" "partial-work.txt"
    assert_contains "activity log records it" "$(branch_file ralphloop/activity.md)" "ended without completing a step (usage limit)"
}

test_loop_limits_dont_use_up_step_budget() {
    sandbox; EXTRA_ENV="RALPH_MAX_STEPS=3" run_loop tick limit limit-exit0 tick tick
    assert_eq "3 real steps + 2 limit hits fit under a 3-call cap" "$RC" 0
    assert_not_contains "no safety-limit stop" "$OUT" "safety limit"
}

test_loop_throttle_retries() {
    sandbox; run_loop tick throttle tick tick
    assert_eq "exits 0" "$RC" 0
    assert_contains "says it's throttling, not the limit" "$OUT" "Server throttling (not the usage limit)"
}

test_loop_limit_text_fallback() {
    sandbox; run_loop tick limit-text tick tick
    assert_eq "exits 0" "$RC" 0
    assert_contains "treated as a usage limit" "$OUT" "Usage limit hit"
}

test_loop_budget_exhausted() {
    sandbox; run_loop limit-far limit-far limit-far
    assert_eq "stops with exit 1" "$RC" 1
    assert_contains "explains the budget" "$OUT" "retry budget"
}

test_loop_no_progress_guard() {
    sandbox; run_loop noop noop noop
    assert_eq "stops with exit 1" "$RC" 1
    assert_contains "explains why" "$OUT" "without checking off a step (no progress)"
}

test_loop_other_failure_message() {
    sandbox; run_loop fail
    assert_eq "stops with exit 1" "$RC" 1
    assert_contains "says it wasn't a limit" "$OUT" "STOPPED: worker call failed (exit code 1) and it wasn't a usage limit"
}

test_loop_stops_when_remote_unreachable() {
    sandbox
    EXTRA_ENV="RALPH_PUSH_URL=$SB/no-such-remote.git" run_loop tick tick tick
    assert_eq "stops" "$RC" 1
    assert_contains "says it couldn't reach the remote" "$OUT" "couldn't reach the remote"
    assert_eq "never called the worker" "$(exists "$SB/prompts/prompt-1.txt")" no
}

test_loop_stale_branch_message_mentions_open_pr_check() {
    sandbox
    git -C "$SB/Campsites" push -q origin main:refs/heads/ralph-loop/task-2
    echo x > "$SB/Campsites/newer.txt"
    git -C "$SB/Campsites" add newer.txt
    git -C "$SB/Campsites" commit -q -m newer
    git -C "$SB/Campsites" push -q origin main
    run_loop tick
    assert_eq "stops" "$RC" 1
    assert_contains "only calls it leftover when there's no open PR" "$OUT" "has no open PR"
    assert_not_contains "no delete command to paste blindly" "$OUT" "git push origin --delete"
}

test_loop_ignores_stale_complete_line_from_earlier_run() {
    sandbox
    printf '## Task 2, call 1\nOld run.\nTASK 2 COMPLETE\n' > "$SB/Campsites/ralphloop/activity.md"
    git -C "$SB/Campsites" add ralphloop/activity.md
    git -C "$SB/Campsites" commit -q -m "old run's activity log"
    git -C "$SB/Campsites" push -q origin main
    run_loop tick tick tick
    assert_eq "exits 0" "$RC" 0
    assert_contains "did every step before publishing" "$(branch_file ralphloop/task.md)" "- [x] **Step 3: Commit**"
    assert_eq "three worker calls, not one" "$(exists "$SB/prompts/prompt-3.txt")" yes
}

test_loop_last_step_then_limit_publishes_without_waiting() {
    sandbox; run_loop tick tick tick-limit
    assert_eq "exits 0" "$RC" 0
    assert_not_contains "no pointless wait" "$OUT" "Usage limit hit"
    assert_contains "all steps on the branch" "$(branch_file ralphloop/task.md)" "- [x] **Step 3: Commit**"
}

test_loop_runs_a_task_numbered_9() {
    sandbox "$(printf '%s\n' '# Nine plan' '## Task 1: Already provisioned' '- [x] **Step 1: Done by hand**' '## Task 9: Admin area' '- [ ] **Step 1: Build it**')"
    EXTRA_ENV="RALPH_STUB_TASK=9" run_loop tick
    assert_eq "exits 0" "$RC" 0
    assert_not_contains "no stale Task 9 refusal" "$OUT" "STOPPED: Task 9"
    assert_contains "task 9's checkpoint reached the branch" "$(git -C "$SB/origin.git" log --format=%s refs/heads/ralph-loop/task-9 2>/dev/null)" "Checkpoint: Task 9 — Step 1: Build it"
}

test_prompt_carries_campsites_rules() {
    sandbox; run_loop tick tick tick
    local p; p=$(prompt 1)
    assert_contains "forbids editing migrations" "$p" "supabase/migrations/"
    assert_contains "forbids supabase link" "$p" "supabase link"
    assert_contains "points UI steps at the style rules" "$p" "docs/superpowers/style-task.md"
    assert_contains "points UI steps at the shared components" "$p" "src/app/shared/ui/"
    assert_not_contains "no React leftovers" "$p" ".jsx"
}
