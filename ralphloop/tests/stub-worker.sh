#!/usr/bin/env bash
# ==============================================================================
# Stand-in for the worker's `claude -p` call in doloop.sh's end-to-end tests
# (ralphloop/tests/test-doloop.sh). doloop.sh runs it via RALPH_WORKER_STUB,
# in the task's worktree, with the prompt as $1. Each call pops one action
# from $RALPH_STUB_ACTIONS and prints stream-json lines shaped like the real
# CLI's (spec section B6).
# ==============================================================================
set -euo pipefail

PROMPTS_DIR="${RALPH_STUB_PROMPTS_DIR:?}"
ACTIONS="${RALPH_STUB_ACTIONS:?}"
# The task number comes from the prompt ("for ONE task only: Task N (…"), so
# one test run can move across tasks; RALPH_STUB_TASK overrides it.
T="${RALPH_STUB_TASK:-$(grep -o 'for ONE task only: Task [0-9]*' <<< "$1" | grep -o '[0-9]*$' || true)}"
T="${T:-2}"
TASK_FILE="ralphloop/task.md"
LOG="ralphloop/activity.md"

N=$(( $(find "$PROMPTS_DIR" -name 'prompt-*.txt' | wc -l) + 1 ))
printf '%s\n' "$1" > "$PROMPTS_DIR/prompt-$N.txt"

ACTION=$(head -n 1 "$ACTIONS")
sed -i '1d' "$ACTIONS"

result() {  # result <is_error true|false> <api_error_status|null> <text>
    local subtype=success
    if [ "$1" = true ]; then subtype=error_during_execution; fi
    printf '{"type":"result","subtype":"%s","is_error":%s,"api_error_status":%s,"result":"%s"}\n' "$subtype" "$1" "$2" "$3"
}

rejected() {  # rejected <seconds until reset>
    printf '{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":%s,"rateLimitType":"five_hour"}}\n' $(( $(date +%s) + $1 ))
}

tick() {  # check off the first unchecked step in Task $T, as a real step would
    local start end line left
    start=$(grep -n "^## Task ${T}:" "$TASK_FILE" | cut -d: -f1)
    end=$(awk -v s="$start" 'NR > s && /^## Task [0-9]+:/ { print NR - 1; exit }' "$TASK_FILE")
    end=${end:-$(wc -l < "$TASK_FILE")}
    line=$(awk -v s="$start" -v e="$end" 'NR >= s && NR <= e && /^- \[ \]/ { print NR; exit }' "$TASK_FILE")
    sed -i "${line}s/^- \[ \]/- [x]/" "$TASK_FILE"
    echo "work from call $N" > "stub-file-$N.txt"
    printf '\n## Task %s, call %s\nStub completed a step.\n' "$T" "$N" >> "$LOG"
    left=$(sed -n "${start},${end}p" "$TASK_FILE" | grep -c '^- \[ \]' || true)
    if [ "$left" -eq 0 ]; then echo "TASK $T COMPLETE" >> "$LOG"; fi
}

echo '{"type":"system","subtype":"init"}'
case "$ACTION" in
    tick)          tick; result false null "Did a step."; exit 0 ;;
    tick2)         tick; tick; result false null "Did two steps."; exit 0 ;;
    tick-loopfile) tick; echo 'echo pwned' > ralphloop/sneaky.sh
                   result false null "Did a step (and touched the loop)."; exit 0 ;;
    tick-schemafile) tick; mkdir -p supabase/migrations supabase/functions/sneaky
                   echo 'drop table campgrounds;' > supabase/migrations/0019_sneaky.sql
                   echo 'export {};' > supabase/functions/sneaky/index.ts
                   result false null "Did a step (and touched the schema)."; exit 0 ;;
    tick-commit-localenv) tick; mkdir -p src/environments
                   echo "export const environment = {};" > src/environments/environment.local.ts
                   git add -f src/environments/environment.local.ts && git commit -q -m "worker's own commit"
                   result false null "Did a step (and committed the local environment file itself)."; exit 0 ;;
    tick-limit)    tick; rejected 3600; result true 429 "Usage limit reached"; exit 1 ;;
    noop)          result false null "Looked around, did nothing."; exit 0 ;;
    blocked)       echo "BLOCKED: stub needs Shawn" >> "$LOG"; result false null "Blocked."; exit 0 ;;
    secret-tick)   echo "SECRET=1" > .env.local
                   mkdir -p node_modules/x; echo x > node_modules/x/i.js
                   tick; result false null "Did a step."; exit 0 ;;
    limit)         rejected 3600; result true 429 "Usage limit reached"; exit 1 ;;
    limit-exit0)   rejected 3600; result true 429 "Usage limit reached"; exit 0 ;;
    limit-far)     rejected 10800; result true 429 "Usage limit reached"; exit 1 ;;
    limit-text)    result true null "You've hit your limit · resets 3pm"; exit 1 ;;
    partial-limit) echo "half done" > partial-work.txt
                   rejected 3600; result true 429 "Usage limit reached"; exit 1 ;;
    throttle)      result true 429 "Server is temporarily limiting requests (not your usage limit)"; exit 1 ;;
    fail)          result true 401 "Invalid API key"; exit 1 ;;
    partial-fail)  echo "half done" > partial-work.txt
                   result true 401 "Invalid API key"; exit 1 ;;
    *)             echo "stub-worker: no action scripted for call $N (got '$ACTION')" >&2; exit 99 ;;
esac
