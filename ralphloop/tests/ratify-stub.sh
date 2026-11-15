#!/usr/bin/env bash
# ==============================================================================
# Stand-in for the ratify call (`claude -p` on Opus) in doloop.sh's tests —
# doloop.sh runs it via RALPH_RATIFY_STUB, in the task's worktree, with the
# prompt as $1. Each call pops one action from $RALPH_STUB_RATIFY_ACTIONS (the
# default, when the list is empty, is "ratified") and prints stream-json lines
# shaped like the real CLI's. It records the prompt, the model and a copy of the
# inputs it was given in $RALPH_STUB_PROMPTS_DIR. Its verdict goes to
# $RALPH_RATIFY_OUTPUT_DIR/verdict.md, never to the repository's activity.md.
# ==============================================================================
set -euo pipefail

PROMPTS_DIR="${RALPH_STUB_PROMPTS_DIR:?}"
ACTIONS="${RALPH_STUB_RATIFY_ACTIONS:-/nonexistent}"
# Where the loop wants the verdict (the container's /ratify-output).
VERDICT="${RALPH_RATIFY_OUTPUT_DIR:?}/verdict.md"
T="${RALPH_STUB_TASK:-$(grep -o 'Task [0-9]*' <<< "$1" | head -n 1 | grep -o '[0-9]*$' || true)}"
T="${T:-2}"

N=$(( $(find "$PROMPTS_DIR" -name 'ratify-prompt-*.txt' | wc -l) + 1 ))
printf '%s\n' "$1" > "$PROMPTS_DIR/ratify-prompt-$N.txt"
printf '%s\n' "${RALPH_RATIFY_MODEL:-}" > "$PROMPTS_DIR/ratify-model-$N.txt"
if [ -d "${RALPH_RATIFY_INPUT_DIR:-/nonexistent}" ]; then
    mkdir -p "$PROMPTS_DIR/ratify-input-$N"
    cp -r "$RALPH_RATIFY_INPUT_DIR"/. "$PROMPTS_DIR/ratify-input-$N/"
fi

ACTION=$(head -n 1 "$ACTIONS" 2>/dev/null || true)
sed -i '1d' "$ACTIONS" 2>/dev/null || true
ACTION="${ACTION:-ratified}"

result() {  # result <is_error true|false> <api_error_status|null> <text>
    local subtype=success
    if [ "$1" = true ]; then subtype=error_during_execution; fi
    printf '{"type":"result","subtype":"%s","is_error":%s,"api_error_status":%s,"result":"%s"}\n' "$subtype" "$1" "$2" "$3"
}
rejected_limit() {  # rejected_limit <seconds until reset>
    printf '{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":%s,"rateLimitType":"five_hour"}}\n' $(( $(date +%s) + $1 ))
}

echo '{"type":"system","subtype":"init"}'
case "$ACTION" in
    ratified)      printf 'Stub ratifier: looked, tried, found nothing.\nRATIFIED: Task %s\n' "$T" >> "$VERDICT"
                   result false null "Ratified."; exit 0 ;;
    rejected)      printf 'Stub ratifier found a hole.\nREJECTED: Task %s: the planted hole is open\n' "$T" >> "$VERDICT"
                   result false null "Rejected."; exit 0 ;;
    both)          printf 'RATIFIED: Task %s\nREJECTED: Task %s: and also not\n' "$T" "$T" >> "$VERDICT"
                   result false null "Confused."; exit 0 ;;
    none)          result false null "Looked around, wrote no verdict."; exit 0 ;;
    changesource)  echo "tampered by the ratifier" >> stub-file-1.txt
                   printf 'RATIFIED: Task %s\n' "$T" >> "$VERDICT"
                   result false null "Ratified (and edited a file)."; exit 0 ;;
    newfile)       echo "scratch" > ratifier-scratch.txt
                   printf 'RATIFIED: Task %s\n' "$T" >> "$VERDICT"
                   result false null "Ratified (and left a new file)."; exit 0 ;;
    commit)        echo "committed by the ratifier" > ratifier-commit.txt
                   git add ratifier-commit.txt && git commit -q -m "ratifier's own commit"
                   printf 'RATIFIED: Task %s\n' "$T" >> "$VERDICT"
                   result false null "Ratified (and committed)."; exit 0 ;;
    readlog)       # tries to read the worker's log, as seen from inside the container
                   { echo "activity.md as the ratifier sees it: $(wc -c < "${RALPH_RATIFY_ACTIVITY_VIEW:?}") bytes"
                     echo "RATIFIED: Task $T"; } >> "$VERDICT"
                   cp "${RALPH_RATIFY_ACTIVITY_VIEW}" "$PROMPTS_DIR/ratify-saw-activity-$N.txt"
                   result false null "Read the log, found it empty."; exit 0 ;;
    writereallog)  # a ratifier that writes the real log anyway (a container can't: it's mounted read-only)
                   printf 'RATIFIED: Task %s\n' "$T" >> ralphloop/activity.md
                   printf 'RATIFIED: Task %s\n' "$T" >> "$VERDICT"
                   result false null "Wrote the real log."; exit 0 ;;
    blockedtext)   printf 'BLOCKED: pretend the ratifier is a worker\nRATIFIED: Task %s\n' "$T" >> "$VERDICT"
                   result false null "Ratified, with a line that looks like a block."; exit 0 ;;
    sleep)         sleep 30; exit 0 ;;
    limit)         rejected_limit 3600; result true 429 "Usage limit reached"; exit 1 ;;
    fail)          exit 1 ;;
    *)             echo "ratify stub: unknown action $ACTION" >&2; exit 2 ;;
esac
