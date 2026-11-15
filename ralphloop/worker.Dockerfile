# Image for the Ralph Wiggum loop's unattended worker (`claude -p` per step).
#
# Scoping rationale: doloop.sh runs this image with only two bind mounts —
# the current task's worktree directory and this repo's own .git folder
# (git worktrees share object storage with the canonical clone, so .git has
# to be reachable at its real host path for any git command inside the
# worktree to work at all). No other project's directory, no other
# project's secrets, and no Docker socket are ever mounted in, regardless
# of what the host `claude` account could otherwise reach.
#
# Build once on ralph. It needs no build context, so from Lisa it's:
#   ssh ralph 'docker build -t campsites-claude-worker:latest -' < ralphloop/worker.Dockerfile
# (or on ralph, from the repo root: docker build -t campsites-claude-worker:latest - < ralphloop/worker.Dockerfile)
#
# Campsites adds two things to MyGear's image: Deno, for the edge functions'
# tests (deno test supabase/functions), and NG_CLI_ANALYTICS=false, so the
# Angular CLI never stops an unattended run to ask about analytics.
#
# pg_prove (from libtap-parser-sourcehandler-pgtap-perl) lets workers run the
# pgTAP suite against $DATABASE_URL themselves. The host-side gate is what counts.
#
# Playwright (pinned) and its headless Chromium run the gate's console check
# (ralphloop/console-check.mjs, via app-check.sh): the production build in a
# real browser. Installed globally and found through NODE_PATH; the browser
# lives in /ms-playwright so any --user can use it. This is the loop's check,
# not app tests (those stay dropped, roadmap 2026-10-19).
#
# Rebuild whenever this file changes or dependencies need bumping — it's
# not tied to any one task's code, just the toolchain every task needs.

FROM node:22-slim

# postgresql-client-17 comes from the PGDG apt repo, not Debian's
# postgresql-client (15): pg_dump 15 refuses to dump the Postgres 17 server
# that Supabase runs ("aborting because of server version mismatch").
# jq: ratify-prompt.md tells the ratifier it has jq (adversary finding F18).
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      jq \
      curl \
      ca-certificates \
      gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && . /etc/os-release \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends \
      postgresql-client-17 \
      libtap-parser-sourcehandler-pgtap-perl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=denoland/deno:bin-2.9.5 /deno /usr/local/bin/deno

RUN npm install -g @anthropic-ai/claude-code

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_PATH=/usr/local/lib/node_modules
RUN npm install -g playwright@1.64.1 \
    && playwright install --with-deps --only-shell chromium \
    && chmod -R a+rX /ms-playwright \
    && rm -rf /var/lib/apt/lists/*

ENV NG_CLI_ANALYTICS=false

WORKDIR /workspace
