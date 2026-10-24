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
# Build once on ralph, from the repo root:
#   docker build -t campsites-claude-worker:latest -f ralphloop/worker.Dockerfile .
#
# Rebuild whenever this file changes or dependencies need bumping — it's
# not tied to any one task's code, just the toolchain every task needs.

FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      postgresql-client \
      curl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /workspace
