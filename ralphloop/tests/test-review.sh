# Tests for review.sh — sourced by run-tests.sh. A fake `docker`
# (tests/docker-stub/docker) records calls instead of running anything.

# review_sandbox — a canonical-clone-shaped dir with a package.json and a
# fake Supabase secrets file. Sets SB.
review_sandbox() {
    sandbox "$ONE_TASK_PLAN"
    echo '{"name":"app"}' > "$SB/Campsites/package.json"
    printf 'SUPABASE_URL=http://127.0.0.1:54331\nSUPABASE_ANON_KEY=anon123\nSUPABASE_JWT_SECRET=jwt\nDATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54332/postgres\n' > "$SB/supabase.env"
    mkdir -p "$SB/Campsites/supabase"
    printf '[api]\nport = 54331\n\n[studio]\nenabled = true\nport = 54333\n' > "$SB/Campsites/supabase/config.toml"
}

# run_review — run review.sh in the sandbox with the fake docker. Sets OUT, RC.
run_review() {
    RC=0
    OUT=$(cd "$SB/Campsites" && env \
        PATH="$HERE/docker-stub:$PATH" \
        RALPH_DOCKER_LOG="$SB/docker.log" \
        RALPH_SUPABASE_ENV="$SB/supabase.env" \
        RALPH_REVIEW_HOST=10.9.8.7 \
        RALPH_REVIEW_WAIT_SECONDS=0 \
        RALPH_SEED_SCRIPT="$HERE/seed-stub.sh" \
        ${EXTRA_ENV:-} \
        bash "$LOOP_DIR/review.sh" 2>&1) || RC=$?
}

docker_calls() { cat "$SB/docker.log" 2>/dev/null; }

test_review_starts_app_for_the_lan() {
    review_sandbox; run_review
    assert_eq "exits 0" "$RC" 0
    local envf="$SB/Campsites/src/environments/environment.local.ts" env
    env=$(cat "$envf" 2>/dev/null)
    assert_contains "points the app at the LAN address" "$env" "supabaseUrl: 'http://10.9.8.7:54331'"
    assert_contains "carries the anon key" "$env" "supabaseAnonKey: 'anon123'"
    assert_contains "is a development environment" "$env" "production: false"
    assert_eq "environment.local.ts is private" "$(stat -c %a "$envf" 2>/dev/null)" 600
    assert_contains "installs packages" "$(docker_calls)" "npm install"
    assert_contains "starts the container, surviving reboots" "$(docker_calls)" "run -d --name campsites-dev --restart unless-stopped"
    assert_contains "serves Angular on all interfaces" "$(docker_calls)" "npx ng serve --host 0.0.0.0 --port 4200"
    assert_contains "prints the app URL" "$OUT" "http://10.9.8.7:4200"
    assert_contains "prints the dev login" "$OUT" "admin@campsites.test / campsites-admin"
    assert_contains "prints the Studio URL" "$OUT" "http://10.9.8.7:54333"
    assert_contains "prints the one-time firewall command" "$OUT" "sudo ufw allow from 10.9.8.0/24 to any port 4200 proto tcp"
}

test_review_replaces_the_old_container() {
    review_sandbox; run_review
    local calls; calls=$(docker_calls)
    assert_contains "removes any old container first" "$(head -n 2 <<< "$calls")" "rm -f campsites-dev"
}

test_review_skips_install_when_packages_unchanged() {
    review_sandbox; run_review; run_review
    assert_eq "second run exits 0" "$RC" 0
    assert_eq "npm install ran once" "$(grep -c 'npm install' "$SB/docker.log")" 1
    assert_eq "container started twice" "$(grep -c 'run -d' "$SB/docker.log")" 2
}

test_review_reinstalls_when_package_json_changes() {
    review_sandbox; run_review
    touch -d '+2 minutes' "$SB/Campsites/package.json"
    run_review
    assert_eq "npm install ran again" "$(grep -c 'npm install' "$SB/docker.log")" 2
}

test_review_refuses_without_an_app() {
    review_sandbox; rm "$SB/Campsites/package.json"; run_review
    assert_eq "stops" "$RC" 1
    assert_contains "explains" "$OUT" "Nothing to review yet"
    assert_eq "no docker calls" "$(docker_calls)" ""
}

test_review_runs_the_seed_first() {
    review_sandbox; run_review
    assert_contains "seeds the dev login and starter data" "$OUT" "seed stub: ran"
}

test_review_seed_failure_only_warns() {
    review_sandbox; EXTRA_ENV="RALPH_SEED_STUB_FAIL=1" run_review
    assert_eq "still starts the app" "$RC" 0
    assert_contains "warns" "$OUT" "seed failed"
}
