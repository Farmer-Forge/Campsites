# Create New Project (Ralph Wiggum loop project)

Checklist for kicking off a new project that will be built via the Ralph
Wiggum loop (`doloop.sh` + Claude Code) on an existing server (e.g. `ralph`).
Assumes that server's one-time setup is already done — see
[create-new-server.md](create-new-server.md). If it isn't, do that first.

## Step 1: Create the GitHub repo

- [ ] Private repo, default branch `main`.
- [ ] Branch protection on `main` is likely unavailable without GitHub Pro
      on a private repo (confirmed true for MyGear via `gh api` returning
      403). Treat it as **not enforced** — the loop's own one-task-per-PR
      discipline is the real backstop, not GitHub.

## Step 2: Generate a fresh, repo-scoped GitHub PAT

- [ ] Fine-grained PAT, scoped to **only this repo**.
- [ ] Permissions: Contents (read/write), Pull requests (read/write). Nothing
      else.
- [ ] **Never reuse a PAT across projects** — a leak or bug in one project's
      loop should never be able to touch another project's repo.
- [ ] Never paste the token into a chat session if avoidable — if you do
      (as happened for MyGear), treat it as exposed and rotate it once
      installed.

Store it as `RALPH_GH_TOKEN` in `~/.secrets/<project-name>-ralph-loop.env`
per the convention in create-new-server.md — never commit it, never put it
in `.bashrc`.

## Step 3: Clone the repo on the server

```bash
mkdir -p ~/projects
cd ~/projects
git clone https://github.com/<you>/<Repo>.git <ProjectName>
```

## Step 4: Provision the project's own local Supabase dev stack

This is the "Task 1"-equivalent step in every project so far — **manual and
interactive**, never run by the unattended loop, because it benefits from a
human confirming the server's actual current state as they go (existing
projects' ports, etc.).

- [ ] `supabase init` inside the project's canonical clone.
- [ ] Set a project identifier in `supabase/config.toml` distinct from every
      other project already on this server, and check its default ports
      against what other projects already claim (`docker ps`, or their own
      `supabase/config.toml` files).
- [ ] `supabase start`.
- [ ] Record `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`,
      `DATABASE_URL` from `supabase status`.

**This stack is local-dev-only.** It's never exposed beyond the server's own
network, so the CLI's default demo JWT secret/keys are fine to leave as-is —
there's nothing to regenerate here. Real, unique production credentials come
later, if/when this project provisions Supabase Cloud as its actual
production backend (MyGear's Task 9 is the template for that step, deferred
until the MVP is otherwise finished — not part of the initial loop run).

## Step 5: Adapt `doloop.sh` and write `task.md`

- [ ] Copy `doloop.sh`, `loop-lib.sh` and `tests/` from an existing
      project's `ralphloop/` (e.g. MyGear's), and make sure the server has
      `jq` (`sudo apt install jq`). In `doloop.sh`, update: `REPO`, worktree paths
      (`~/projects/<ProjectName>-worktrees/`), and the base branch (`main`).
- [ ] **Start `task.md` from the Forge core plan** (`forge/core-plan.md`,
      decided 2026-10-01; spec `docs/superpowers/specs/2026-10-01-forge-core-design.md`).
      Copy it, then:
      - fill in its **App identity** block (the app's `src/config/app.json`:
        name, purpose, default units, and the words it uses for items,
        collections, category groups and categories);
      - decide on core Task 7's **optional admin item browser** (Steps 9–11:
        admins see item counts per category and the most recent items, names
        only, read-only). Keep it for most apps; it changes the privacy
        promise, so set `privacyNote` in App identity to say admins can see
        item names. Leave it out by deleting Steps 9–11 and the Verify and QC
        lines marked *optional*, and keep the default `privacyNote`;
      - write the app's `ralphloop/seed-app.sql` (its category groups,
        starter categories, fields with unit kinds, and options; MyGear's is
        the worked example);
      - optionally write `ralphloop/seed-sample.sql` (sample users and items,
        so reviewers see the app with data in it; MyGear's is the worked
        example). `seed-dev.sh` runs it when it exists;
      - append the app's own tasks, numbered from 8, after core Task 7.
        They extend the core through its extension points and never edit a
        core file (MyGear's Tasks 8–9 are the worked example).

      Keep it a checkbox-tracked, task-by-task plan, and call out **Out of
      Scope** items explicitly rather than letting scope grow
      mid-implementation.
- [ ] Any task that touches real, public-facing infrastructure (a
      production cloud project, a paid service, anything Task 9 in MyGear's
      plan represents) must be marked deferred/manual, with a matching
      refusal check added to `doloop.sh` — the loop should stop cleanly if
      it ever reaches that task, not attempt real-infrastructure
      provisioning unattended.
- [ ] **Install Tailwind CSS v4 (`@tailwindcss/vite`) plus a real design
      system in the scaffold task** — not just inline utility classes.
      MyGear's working reference (copy the pattern, not necessarily the
      exact values): `docs/superpowers/Design.MD` (color/spacing/typography
      tokens, button variants, component patterns) +
      `docs/superpowers/style-task.md` (the enforcement rules — read
      Design.MD first, use the shared primitives, self-check before every
      commit, escalate a genuinely new pattern into Design.MD *and*
      `components/ui/` together) + a `src/components/ui/*` primitive
      library (`Button`, `Input`, `Select`, `Textarea`, `Card`, `Alert`,
      `EmptyState`, `Spinner` at minimum) that every later task imports
      instead of writing its own markup. `doloop.sh`'s own worker prompt
      should reference `style-task.md` directly for any UI-touching step,
      not rely on the worker finding it buried in `task.md`'s prose.
      Learned the hard way on MyGear: an installed-but-unused Tailwind
      dependency doesn't help, and even utility classes need real
      enforcement or they drift per-component; a first pass without a real
      component library had to be redone in full once a proper design
      system existed.
- [ ] **Follow the Forge database conventions:** `forge/db-conventions.md`
      (the core model of a thing plus a thing type: `user_types`, `item_types`
      in `item_type_groups`, `collection_types`; plural table names; foreign
      keys named after the full table they reference; types referred to by
      key; `profiles` is the one Supabase-convention exception). Database
      names stay generic, and the app's on-screen words come from
      `src/config/app.json`. `doloop.sh`'s worker prompt points at it for
      every SQL step. Extend core tables (a column, a type row, an item type)
      before inventing a parallel table: MyGear's vehicles are items of
      type `vehicle`.
- [ ] **Give exactly one component ownership of persistent navigation** —
      the first auth-guard component the plan introduces (an
      `Outlet`-wrapping `<RequireAuth />` or equivalent), not any individual
      page. Every later task's own page snippets must NOT import or render
      nav themselves. On MyGear, nav ended up on some pages and not others
      because each task's snippet had to remember it independently — fixed
      by moving it into the guard component that already wraps every
      authenticated route exactly once.
- [ ] **Plan defaults — every project's `task.md` starts with these**
      (decided 2026-09-27; MyGear's iteration 3 spec, section 7, is the
      worked example):
      - **Full CRUD on every model** unless Shawn explicitly exempts it,
        with one shared confirmation dialog for every delete that says
        what else is affected.
      - **An admin area:** an admin home (links to every admin tool, plus
        counts) and user management through admin-checked Postgres
        `SECURITY DEFINER` functions, with self-lockout and last-admin
        guards. User management is full CRUD on users and their profiles
        (added 2026-10-01):
        - **Add a user:** email, display name, role, and a temporary
          password the admin hands over (no email service yet, so no
          invite flow). The browser can't create Supabase Auth accounts
          with normal permissions, so an `admin_create_user(...)` function
          inserts the `auth.users` + `auth.identities` rows. That's the same
          insert the dev seed (`seed-dev.sql`) already proves works,
          including GoTrue's token columns set to `''`, never NULL.
        - **Edit a user's profile** (display name, role), **disable/enable**,
          and **delete** (with counts of what goes with them, and Disable
          offered instead).
      - **A welcome home page** that says in a few sentences what the app
        is for (signed out: plus sign in / sign up; signed in: "welcome
        back" and quick links).
      - **`int` identity ids**, except where Supabase Auth forces `uuid`
        (`profiles.id`, every `user_id`). Reference data also gets a
        natural unique `key` that code and seeds use.
      - **Delete rule of thumb:** block when it's shared, cascade when the
        children mean nothing without the parent, unlink peers — enforced
        in the database, asked about in the UI.
      - **Protect columns users mustn't change with column-level grants**
        (MyGear's first two runs let any user set their own `role` to
        admin through the API, because an owner "update own profile"
        policy covers every column).
      - **A dev seed from day one**, idempotent, so no task ever waits
        for a person to sign up: the core's `ralphloop/seed-dev.sql` (the
        default dev admin login) and the app's `ralphloop/seed-app.sql`
        (starter reference data), both run by `seed-dev.sh`.
      - **The Forge core's data model** (decided 2026-10-01, built by
        `forge/core-plan.md`):
        - `profiles` is for authorization only (`id`, `role`); everything
          about the person lives in `user_details`, including six optional
          data points (country/region, units, experience, age band,
          found-via, contact consent with its timestamp) asked once in a
          skippable welcome step;
        - generic, admin-managed `category_groups` → `categories` →
          `category_fields` → `field_options`, plus `items` and
          `collections` of items;
        - **units stored one way:** numeric fields with a unit kind are
          stored in metric and shown in each user's units, converted only
          in `src/data/units.js`;
        - **the extension rule:** apps add their own tables and columns in
          their own migrations, and hook their screens in through
          `src/config/extensions.js`. They never copy or edit core tables
          or files;
        - **`src/config/app.json`** holds the app's name, purpose and
          vocabulary, so no page hard-codes them.
      - **Verification hygiene:** test accounts only via a helper script,
        test reference data with a `TEST ` prefix, cleaned up before and
        after every check; checks are API-level (`curl`/`psql`).
      - **A "QC (for Shawn, in the browser)" list at the end of every
        task** — `chain.sh` gathers them into the QC checklist.

## Step 6: Kick off

- [ ] Do the Step 4 provisioning task by hand first (interactive SSH
      session, e.g. from a WSL Claude Code session — see
      create-new-server.md for the account/key setup that makes this
      possible).
- [ ] Then run `doloop.sh` once per task. It does exactly one task, opens a
      PR, and stops — review and squash-merge before re-running for the next
      task. If it stops early (a usage limit past its 8-hour retry budget, a
      failure, a reboot), just re-run it: it resumes at the next unchecked
      step from its last checkpoint commit.
      To run the remaining tasks unattended instead (no review between
      tasks), start `ralphloop/chain.sh` in tmux; copy it along with
      `doloop.sh`, plus `review.sh` (browser QC at `http://<server-ip>:5173`;
      see `reviewing-a-loop-project.md` for the one-time firewall rule) and
      `seed-dev.sql`/`seed-dev.sh` (and write the app's own `seed-app.sql`). When a chain finishes it leaves
      `../<Project>-qc-checklist.md` next to the clone.
- [ ] Keep `task.md` to loop work only. Anything the loop must never run
      (real, billed, public-facing infrastructure — MyGear's production
      deploy) goes in its own plan under `docs/`, not as a refused task.
- [ ] If you ever need to reset the project to retry some tasks after
      fixing the loop or the plan — without losing git history or redoing
      real infrastructure — follow `ralphloop/reset-and-rerun.md`. Copy
      that file into each new project alongside `doloop.sh`.

## Step 7: Containerize the loop's `claude -p` invocation

Implemented for MyGear (`ralphloop/worker.Dockerfile`, `doloop.sh`) — repeat
for each new project rather than treating it as optional:

- [ ] Copy `worker.Dockerfile` from an existing project, adjust the image
      tag to `<project>-claude-worker:latest`.
- [ ] Build it on the server: `docker build -t <project>-claude-worker:latest -f ralphloop/worker.Dockerfile .`
- [ ] `doloop.sh`'s worker invocation mounts **two** things at their real
      host paths (not remapped): the task's worktree directory, and this
      repo's own `.git` folder. The second one is easy to miss — a git
      worktree's `.git` is just a pointer back to the canonical clone's
      `.git/worktrees/<name>/`, so without the canonical `.git` mounted at
      the same absolute path, every git command inside the container fails.
      Net effect: the container can see this one repo's full git history,
      but no other project, no Docker socket, and no GitHub token (push/PR
      stays in the outer script, which never passes `RALPH_GH_TOKEN` into
      the container).
- [ ] Uses `--network host` so `psql`/`curl` inside the container can reach
      the local Supabase stack's published ports on the server. This means
      no network isolation from the rest of the LAN/internet — only
      filesystem/credential isolation. Full egress lockdown is a separate,
      more involved project if it's ever needed.
- [ ] Claude Code's own credentials (not GitHub's) need to be available to
      the container via an env file — see the open item below.

## Claude Code's own auth for the containerized worker

Resolved for ralph: `claude setup-token` (not `claude login`) issues a
long-lived (1 year), subscription-backed OAuth token as a single env var —
`CLAUDE_CODE_OAUTH_TOKEN` — no directory mounts needed. Ties usage to the
existing Claude subscription rather than separate Console API billing.

- [ ] Build the project's worker image first (`docker build ...`, see Step 7
      above) — `claude setup-token` needs to run *inside* a container built
      from the same image the loop will actually use.
- [ ] Run it interactively and capture the printed OAuth URL:
      `docker run --rm -i mygear-claude-worker:latest claude setup-token`
      (plain `docker logs <name>` on a backgrounded run works if a direct
      TTY isn't available — reattaching later to paste the code back in is
      unreliable through nested SSH/tmux layers; if it's not a fully local
      terminal, expect to redo this by hand rather than fight the relay).
- [ ] Visit the URL, authorize, and get the callback code.
- [ ] Paste the code back into the same still-running process (needs a
      real local terminal — `ssh` in directly and `docker attach
      <container-name>`, don't try to relay the paste through another
      layer).
- [ ] **Watch for terminal word-wrap corrupting the printed token** — long
      tokens can visually break across lines, and a wrapped line looks like
      a separate stray token. Copy the whole thing as one unbroken string.
- [ ] Store it in `~/.secrets/claude-code-auth.env` in **plain**
      `KEY=value` form (`docker run --env-file` does not understand shell
      `export` syntax or quoted values — unlike `RALPH_GH_TOKEN`'s file,
      which is `source`d as bash and does use `export`).

## Lessons learned from MyGear's first real loop run (2026-09-20)

Real bugs found running the actual loop for the first time, not caught by
review alone — worth checking for in any `doloop.sh` copied from before this
date (MyGear's own copy is already fixed; diff against it):

- **`find_current_task()`'s `sed | grep -q` raced with `set -o pipefail`.**
  `grep -q` exits the instant it sees a match, which can SIGPIPE the
  still-writing `sed`; pipefail then reports that non-zero as the whole
  pipeline's status even though grep matched — intermittently (~1 in 5 runs
  here) skipping a task that still has unchecked steps, straight to a later
  one. Fixed by switching to `grep -c` (always reads to EOF, so `sed` exits
  clean). Reproduce with a tight loop before trusting any copy of this
  function.
- **`task.md`'s checkbox state was never actually committed, ever.** The
  outer script's end-of-run commit only targeted `activity.md`, and even
  that check used `git diff` against a file that starts every run
  *untracked* — `git diff` silently ignores untracked files, so it never
  fired either. Every worktree removal discarded both files' state, so a
  "completed" task's checkboxes reverted to unchecked on `main`, and the
  next run wasted a full pass re-verifying already-correct files. Fix:
  `git add` both files unconditionally, then commit if the *staged* diff is
  non-empty (`git add` catches new-untracked files; a pre-check with `git
  diff` doesn't).
- **Auto-stash (tried two ways — every step, then once on resume) both
  destroyed real progress instead of protecting against anything real.**
  Removed entirely. A worktree resuming with in-progress, uncommitted steps
  is the expected steady state, not leftover junk; each step just rewrites
  its own files idempotently, so a genuinely interrupted call gets redone
  naturally on the next pass.
- **Final `git worktree remove` needs `--force`.** It fails on every
  successful task from here on, since `node_modules/`/`.env.local` are
  always present and untracked (though gitignored) by the time a task
  finishes.
- **The worker container had no access to Task 1's Supabase values at
  all** (only `CLAUDE_AUTH_ENV` was ever wired in) — any step touching
  `.env.local` or running a migration hits this immediately. Fix: a second
  `--env-file` for `~/.secrets/<project>-supabase.env`.

**Seed a real admin account during Task 1, don't leave it for a later
task's manual step.** MyGear's plan had "promote your own account to
admin" as a mid-task step, which blocks the *entire* autonomous run on
Shawn manually opening a browser and signing up — expensive when it happens
hours into an unattended run. Next project: have Task 1 (or a dedicated
early step) seed a real admin account directly via SQL
(`auth.users`/`profiles`) or the GoTrue admin API, using Shawn's real email
and a generated password recorded in `~/.secrets/`, so no task ever blocks
waiting for a human to use the running app just to create an account.

**Reaching the dev server from off-box needs two things, not one.** Running
`vite --host` in a container on `--network host` makes the page itself
reachable, but `VITE_SUPABASE_URL` in `.env.local` was `http://127.0.0.1:PORT`
— correct from inside the container (shares ralph's network namespace) but
means "the browser's own machine" to anyone loading the page from off-box,
so every API call fails even though the page loads. Direct LAN access was
also blocked by ralph's firewall (unconfirmed which rule — `claude` has no
`sudo` to check `ufw`). Workaround used: SSH tunnels for both ports (`-L
5173:localhost:5173` and `-L <supabase-port>:localhost:<supabase-port>`)
from the machine with browser access, then loading `http://localhost:5173`.
Next project: decide up front whether local-dev Supabase URLs should be a
LAN address (works cross-machine, needs the firewall opened once) or
`127.0.0.1` (needs a tunnel every time) — don't discover this mid-task.

## Running as non-root inside the container

`claude --dangerously-skip-permissions` refuses to run as root/sudo — a
real safety check by the CLI itself, not a workaround. Since the image
doesn't bake in a fixed user, `doloop.sh` passes
`--user "$(id -u):$(id -g)"` (matching the host account's own UID/GID, so
bind-mounted file ownership lines up) plus `-e HOME=/tmp` (an arbitrary
numeric UID has no passwd entry, so `$HOME` needs setting explicitly to
somewhere writable). Nothing project-specific here — this applies to every
project's worker image the same way.
