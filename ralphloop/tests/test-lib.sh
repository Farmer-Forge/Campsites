# Unit tests for ralphloop/loop-lib.sh — sourced by run-tests.sh.

FIXTURE_TASK=$(cat <<'EOF'
# Plan
## Task 1: Infra
- [x] **Step 1: Done already**
## Task 2: Scaffold
- [x] **Step 1: Write `package.json`**
- [ ] **Step 2: Modify `src/App.jsx`** — add routes
- [ ] **Step 3: Commit**
## Task 3: Auth
- [ ] **Step 1: Something else**
EOF
)

task_file() { local f; f=$(mktemp); printf '%s\n' "$FIXTURE_TASK" > "$f"; echo "$f"; }

# call_log LINE... — writes a fake worker call log, prints its path
call_log() { local f; f=$(mktemp); printf '%s\n' "$@" > "$f"; echo "$f"; }

new_repo() {
    local d; d=$(mktemp -d)
    git -C "$d" init -q -b main
    git -C "$d" config user.name T
    git -C "$d" config user.email t@t
    git -C "$d" commit -q --allow-empty -m init
    echo "$d"
}

RES_OK='{"type":"result","subtype":"success","is_error":false,"result":"done"}'
RES_429_LIMIT='{"type":"result","subtype":"error_during_execution","is_error":true,"api_error_status":429,"result":"Usage limit reached"}'
RES_429_THROTTLE='{"type":"result","subtype":"error_during_execution","is_error":true,"api_error_status":429,"result":"Server is temporarily limiting requests (not your usage limit)"}'
RES_401='{"type":"result","subtype":"error_during_execution","is_error":true,"api_error_status":401,"result":"Invalid API key"}'
RES_UNKNOWN='{"type":"result","subtype":"error_during_execution","is_error":true,"result":"Something new went wrong"}'
RES_TEXT_LIMIT='{"type":"result","subtype":"error_during_execution","is_error":true,"result":"You'"'"'ve hit your limit · resets 3pm"}'
EV_REJECTED='{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1790000000,"rateLimitType":"five_hour"}}'
EV_ALLOWED='{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1790000000,"rateLimitType":"five_hour"}}'

test_count_unchecked() {
    local f; f=$(task_file)
    assert_eq "task 2 has 2 unchecked" "$(count_unchecked "$f" 2)" "2"
    assert_eq "task 1 has 0 unchecked" "$(count_unchecked "$f" 1)" "0"
    assert_eq "last task is counted to end of file" "$(count_unchecked "$f" 3)" "1"
    assert_eq "missing task counts 0" "$(count_unchecked "$f" 9)" "0"
}

test_first_unchecked_title() {
    local f; f=$(task_file)
    assert_eq "strips checkbox, bold and trailing prose" "$(first_unchecked_title "$f" 2)" 'Step 2: Modify `src/App.jsx`'
    assert_eq "empty when nothing unchecked" "$(first_unchecked_title "$f" 1)" ""
}

test_classify_call() {
    assert_eq "clean result is success" "$(classify_call "$(call_log "$EV_ALLOWED" "$RES_OK")" 0)" success
    assert_eq "rejected event + error is usage_limit" "$(classify_call "$(call_log "$EV_REJECTED" "$RES_429_LIMIT")" 1)" usage_limit
    assert_eq "rejected event with exit 0 is still usage_limit" "$(classify_call "$(call_log "$EV_REJECTED" "$RES_429_LIMIT")" 0)" usage_limit
    assert_eq "rejected event but clean finish is success" "$(classify_call "$(call_log "$EV_REJECTED" "$RES_OK")" 0)" success
    assert_eq "429 without limit wording is throttled" "$(classify_call "$(call_log "$RES_429_THROTTLE")" 1)" throttled
    assert_eq "limit wording alone is usage_limit" "$(classify_call "$(call_log "$RES_TEXT_LIMIT")" 1)" usage_limit
    assert_eq "401 is other_failure" "$(classify_call "$(call_log "$RES_401")" 1)" other_failure
    assert_eq "unknown error text is other_failure" "$(classify_call "$(call_log "$RES_UNKNOWN")" 1)" other_failure
    assert_eq "clean result but non-zero exit is other_failure" "$(classify_call "$(call_log "$RES_OK")" 1)" other_failure
    assert_eq "exit 0 but no result line is other_failure" "$(classify_call "$(call_log '{"type":"system","subtype":"init"}')" 0)" other_failure
    assert_eq "no JSON at all is other_failure" "$(classify_call "$(call_log 'docker: Error response from daemon')" 125)" other_failure
    assert_eq "stderr noise around the JSON is ignored" "$(classify_call "$(call_log 'a warning' "$RES_OK" 'trailing noise')" 0)" success
    assert_eq "missing log is other_failure" "$(classify_call /nonexistent/call.jsonl 1)" other_failure
}

test_call_resets_at() {
    assert_eq "reads resetsAt from the rejected event" "$(call_resets_at "$(call_log "$EV_ALLOWED" "$EV_REJECTED" "$RES_429_LIMIT")")" 1790000000
    assert_eq "empty when only allowed events" "$(call_resets_at "$(call_log "$EV_ALLOWED" "$RES_OK")")" ""
}

test_print_call_result() {
    assert_eq "prints the final result text" "$(print_call_result "$(call_log "$RES_OK")")" "done"
    assert_contains "says so when there is none" "$(print_call_result "$(call_log 'noise')")" "no result message"
}

test_limit_wait_seconds() {
    assert_eq "waits until 2 min after the reset" "$(limit_wait_seconds 10000 7000 1)" 3120
    assert_eq "a reset already past still waits 60s" "$(limit_wait_seconds 7000 9000 1)" 60
    assert_eq "no reset time: 1st backoff 15m" "$(limit_wait_seconds '' 0 1)" 900
    assert_eq "2nd backoff 30m" "$(limit_wait_seconds '' 0 2)" 1800
    assert_eq "later backoffs 60m" "$(limit_wait_seconds '' 0 5)" 3600
}

test_within_budget() {
    if within_budget 0 28800 28800; then ok "exactly at the budget fits"; else bad "exactly at the budget fits"; fi
    if within_budget 20000 9000 28800; then bad "over the budget is refused"; else ok "over the budget is refused"; fi
}

test_fmt_duration() {
    assert_eq "hours" "$(fmt_duration 7500)" "2h05m"
    assert_eq "minutes" "$(fmt_duration 900)" "15m"
    assert_eq "seconds" "$(fmt_duration 45)" "45s"
}

test_ralph_sleep_scale_zero() {
    local start; start=$(date +%s)
    RALPH_WAIT_SCALE=0 ralph_sleep 5
    assert_eq "scale 0 doesn't sleep" "$(( $(date +%s) - start < 2 ))" 1
}

test_checkpoint_commit() {
    local r files before; r=$(new_repo)
    echo code > "$r/app.js"
    echo SECRET=1 > "$r/.env.local"
    echo KEY= > "$r/.env.example"
    mkdir -p "$r/node_modules/x" "$r/sub/.vite" "$r/dist"
    echo x > "$r/node_modules/x/i.js"; echo c > "$r/sub/.vite/c"; echo d > "$r/dist/d.js"
    echo SECRET=2 > "$r/sub/.env"
    checkpoint_commit "$r" "Checkpoint: test"
    files=$(git -C "$r" show --name-only --format= HEAD)
    assert_contains "commits normal files" "$files" "app.js"
    assert_contains "commits .env.example" "$files" ".env.example"
    assert_not_contains "never commits .env.local" "$files" ".env.local"
    assert_not_contains "never commits a nested .env" "$files" "sub/.env"
    assert_not_contains "never commits node_modules" "$files" "node_modules"
    assert_not_contains "never commits .vite" "$files" ".vite"
    assert_not_contains "never commits dist" "$files" "dist/"
    assert_eq "uses the message" "$(git -C "$r" log -1 --format=%s)" "Checkpoint: test"
    before=$(git -C "$r" rev-parse HEAD)
    checkpoint_commit "$r" "Checkpoint: nothing"
    assert_eq "no-op when nothing changed" "$(git -C "$r" rev-parse HEAD)" "$before"
    git -C "$r" add -f .env.local
    echo more >> "$r/app.js"
    checkpoint_commit "$r" "Checkpoint: pre-staged"
    assert_not_contains "unstages a secret the worker staged itself" "$(git -C "$r" show --name-only --format= HEAD)" ".env.local"
}

test_checkpoint_never_commits_angular_cache_or_local_environment() {
    local r files; r=$(new_repo)
    echo code > "$r/app.ts"
    mkdir -p "$r/.angular/cache" "$r/src/environments"
    echo c > "$r/.angular/cache/x"
    echo "export const environment = {};" > "$r/src/environments/environment.local.ts"
    checkpoint_commit "$r" "Checkpoint: angular"
    files=$(git -C "$r" show --name-only --format= HEAD)
    assert_contains "commits normal files" "$files" "app.ts"
    assert_not_contains "never commits the Angular cache" "$files" ".angular/"
    assert_not_contains "never commits the local environment file" "$files" "environment.local.ts"
    r=$(new_repo)
    echo code > "$r/app.ts"
    mkdir -p "$r/.angular/cache" "$r/src/environments"
    echo c > "$r/.angular/cache/x"
    echo "export const environment = {};" > "$r/src/environments/environment.local.ts"
    git -C "$r" add -f src/environments/environment.local.ts .angular/cache/x
    checkpoint_commit "$r" "Checkpoint: pre-staged angular"
    files=$(git -C "$r" show --name-only --format= HEAD)
    assert_not_contains "unstages a local environment file the worker staged itself" "$files" "environment.local.ts"
    assert_not_contains "unstages an Angular cache file the worker staged itself" "$files" ".angular/"
}

test_push_branch_quietly() {
    local r bare out; r=$(new_repo); bare=$(mktemp -d); git init -q --bare "$bare"
    push_branch_quietly "$r" "$bare" "ralph-loop/task-2"
    assert_eq "pushes HEAD to the branch" "$(git -C "$bare" rev-parse refs/heads/ralph-loop/task-2)" "$(git -C "$r" rev-parse HEAD)"
    out=$(push_branch_quietly "$r" "/nonexistent/repo.git" "x"; echo "rc=$?")
    assert_contains "a failed push warns" "$out" "Checkpoint push failed"
    assert_contains "a failed push doesn't fail the caller" "$out" "rc=0"
}

test_log_call_ended() {
    local f; f=$(mktemp)
    log_call_ended "$f" 2 7 "usage limit"
    assert_contains "writes a heading the worker will read" "$(cat "$f")" "## Task 2, call 7 — ended without completing a step (usage limit) at "
}

test_resume_note() {
    local r n; r=$(new_repo)
    assert_contains "clean worktree says start fresh" "$(resume_note "$r" "usage limit")" "Start the step fresh"
    echo half > "$r/partial.txt"
    n=$(resume_note "$r" "usage limit")
    assert_contains "names the reason" "$n" "interrupted (usage limit)"
    assert_contains "lists the partial file" "$n" "partial.txt"
    assert_contains "points at git diff" "$n" "git diff HEAD"
}
