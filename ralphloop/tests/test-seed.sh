# Tests for seed-dev.sh — sourced by run-tests.sh. The fake `docker`
# (tests/docker-stub/docker) records the call instead of running psql. The SQL
# itself is checked against Postgres separately (see the iteration-4 plan PR).

seed_sandbox() {
    sandbox "$ONE_TASK_PLAN"
    printf 'DATABASE_URL=postgresql://u:p@127.0.0.1:54332/postgres\n' > "$SB/supabase.env"
}

# run_seed [DIR] — run seed-dev.sh from DIR (default: the sandbox clone). Sets OUT, RC.
run_seed() {
    RC=0
    OUT=$(cd "${1:-$SB/Campsites}" && env \
        PATH="$HERE/docker-stub:$PATH" \
        RALPH_DOCKER_LOG="$SB/docker.log" \
        RALPH_SUPABASE_ENV="$SB/supabase.env" \
        bash "$LOOP_DIR/seed-dev.sh" 2>&1) || RC=$?
}

test_seed_runs_psql_in_the_worker_image() {
    seed_sandbox; run_seed
    assert_eq "exits 0" "$RC" 0
    assert_contains "runs the worker image's psql on the seed file" "$(cat "$SB/docker.log" 2>/dev/null)" \
        "campsites-claude-worker:latest psql postgresql://u:p@127.0.0.1:54332/postgres -v ON_ERROR_STOP=1 -f ralphloop/seed-dev.sql"
}

test_seed_needs_the_env_file() {
    seed_sandbox; rm "$SB/supabase.env"; run_seed
    assert_eq "stops" "$RC" 1
    assert_contains "says what's missing" "$OUT" "not found"
}

test_seed_needs_the_repo_root() {
    seed_sandbox; run_seed "$SB"
    assert_eq "stops" "$RC" 1
    assert_contains "says where to run it" "$OUT" "Run this from the repo root"
}

test_seed_runs_the_app_seed_after_the_core_seed() {
    seed_sandbox; : > "$SB/Campsites/ralphloop/seed-app.sql"; run_seed
    assert_eq "exits 0" "$RC" 0
    assert_contains "core seed, then app seed, in one psql call" "$(cat "$SB/docker.log" 2>/dev/null)" \
        "-f ralphloop/seed-dev.sql -f ralphloop/seed-app.sql"
}

test_seed_without_app_seed_runs_only_the_dev_seed() {
    seed_sandbox; run_seed
    assert_eq "exits 0" "$RC" 0
    assert_not_contains "no app seed when there is none" "$(cat "$SB/docker.log" 2>/dev/null)" "seed-app.sql"
}

test_seed_runs_the_sample_seed_last() {
    seed_sandbox
    : > "$SB/Campsites/ralphloop/seed-app.sql"; : > "$SB/Campsites/ralphloop/seed-sample.sql"
    run_seed
    assert_eq "exits 0" "$RC" 0
    assert_contains "core, app, then sample seed, in one psql call" "$(cat "$SB/docker.log" 2>/dev/null)" \
        "-f ralphloop/seed-dev.sql -f ralphloop/seed-app.sql -f ralphloop/seed-sample.sql"
}
