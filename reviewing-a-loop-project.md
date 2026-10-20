# Reviewing a Ralph Wiggum Loop Project

Three separate things to review after (or during) a loop run, and how to
reach each one — written generically since this applies to any project
built with this template, not just MyGear.

## 1. Code

Don't SSH into the loop server to read code. `git pull` in your own local
clone — whatever machine/IDE you actually work in — and read it the normal
way, or review history via `git log` / the GitHub PR list.

Every task's work lands as its own PR before merging to `main`. The normal
mode is: review that PR's diff on GitHub, then **Squash and merge** it (or
ask the agent to). Each PR carries one "Checkpoint" commit per step, which
is progress tracking, not history worth keeping on main. Do this
before the next task starts — that's the loop's built-in checkpoint,
one task at a time. Letting the agent merge every PR immediately and chain
straight through several tasks unattended (as happened for MyGear's Tasks
2–8) is an explicit opt-in for a given session, not the default. That
opt-in is now a script, `ralphloop/chain.sh`, which squash-merges each task's
PR, pulls, and runs the next task until Task 9 or any stop (see its header) — say so
each time you want it, since the checkpoint is what keeps mistakes from
compounding across tasks.

## 2. Interface

Check the running app from a browser anywhere on your home network (for
MyGear: **http://192.168.1.188:5173** from Bart). On the loop server, as the
loop account, from the repo root:

```bash
./ralphloop/review.sh
```

Sign in with the dev login the seed guarantees: `admin@mygear.test` /
`mygear-admin` (an admin). When a `chain.sh` run finishes it also writes
`../MyGear-qc-checklist.md` — every task's "QC" list, in order: what to try.

It serves the clone's current `main` in a throwaway container (same image the
loop's worker uses, so no Node install on the server), writes `.env.local`
pointed at the server's LAN address rather than `127.0.0.1` (so the page's
Supabase calls work from another machine too), installs packages only when
they changed, and prints the URLs. It's safe to re-run any time. The container
restarts itself after a reboot and picks up new code as `main` moves — re-run
`review.sh` after a task adds packages. `chain.sh` runs it as its last step.
Stop it with `docker rm -f <project>-dev`.

**Once per server**, as yourself (the loop account deliberately has no
`sudo`), let the LAN reach the dev port through the firewall — Supabase's own
ports already get through because Docker publishes them past `ufw`:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 5173 proto tcp
```

## 3. Database

Task 1's `supabase status` (rerun it any time to get current values) prints
everything needed. Two ways in:

- **Supabase Studio** (browser GUI, easiest for casual browsing): open
  `http://<server-ip>:<studio-port>` directly (MyGear:
  http://192.168.1.188:54333) — `review.sh` prints it.
- **Direct Postgres** (psql, DBeaver, TablePlus, etc.): connect to
  `postgresql://postgres:postgres@<server-ip>:<db-port>/postgres`
  — standard local-Supabase-CLI demo credentials. Fine to leave as-is per
  `create-new-project.md`: this stack is local-dev-only, never exposed
  beyond the server's own network.

## Open items worth solving before the next project

- (done 2026-09-24) Direct LAN access: it was `ufw` blocking the dev port
  (Docker-published Supabase ports bypass it). The one-time rule above fixes
  it; no tunnels needed.
- (done 2026-09-24) `ralphloop/review.sh` — see section 2.
