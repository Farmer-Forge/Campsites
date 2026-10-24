# Resetting a Ralph Loop project for a clean rerun

When to use this: you've run some or all of a project's tasks, found real
problems (in the loop, the plan, or the app), fixed them, and want to
validate the fixes by rerunning from a clean slate — without losing git
history or redoing infrastructure that's already provisioned correctly.

## Decide scope first

Two decisions, made explicitly before touching anything (MyGear's own
precedent, 2026-09-22):

1. **Which task is the "keep from here" boundary.** Usually the last task
   that's real, manually-provisioned infrastructure (MyGear: Task 1 —
   Supabase CLI provisioning on the server, done by hand, never touched by
   the loop). Reset to *right after* that task, not before it — redoing
   real infra provisioning isn't the point of this.
2. **Keep git history. Do not force-push or rewrite it.** A reset is
   ordinary new commits (remove the built app's files, uncheck the
   affected tasks in `task.md`), not history surgery. This keeps every
   PR, every bug-fix commit to `doloop.sh`, and the audit trail intact,
   and avoids three real problems a rewrite causes: every other clone of
   the repo diverges and needs a hard reset instead of a plain pull,
   already-merged PRs end up looking orphaned, and any running dev
   container tied to the old history needs more careful handling.
   **Exception:** a truly new project with no history worth keeping yet
   can just start over from an empty repo — that's not this procedure.

## Checklist

1. **On your own machine** (not the loop server): remove the files the
   affected tasks created — check each task's own "Files:" list in
   `task.md` for the exact set, don't guess — via `git rm -r <paths>`.
   Reset those tasks' checkboxes in `task.md` back to `- [ ]`, **and delete
   those tasks' entries from `ralphloop/activity.md`** — stale notes mislead
   the worker, and (before `doloop.sh` was fixed to go by checkboxes alone) a
   leftover "TASK N COMPLETE" line ended MyGear's rerun of Task 3 after one step. Commit as a
   plain, clearly-labeled commit (e.g. "Reset Tasks 2-8 for clean rerun")
   and push.
   Also delete any leftover `ralph-loop/task-N` branches for the reset
   tasks: on GitHub (`git push origin --delete ralph-loop/task-N`) and on
   the loop server (`git branch -D ralph-loop/task-N`, plus any
   `Campsites-worktrees/task-N*` folders). `doloop.sh` pushes checkpoint
   commits as it goes, so an interrupted task leaves its branch on GitHub.
   `doloop.sh` refuses to resume a branch that predates the reset, but
   deleting them first is cleaner.
   Leave `ralphloop/`, `docs/`, and any repo-root Forge docs
   untouched — those are exactly what you fixed and want the rerun to use.
2. **On the loop server:** `git pull` the reset commit into the canonical
   clone.
3. **Reset the local dev database.** If the affected tasks' migrations
   were removed in step 1, `supabase db reset` (or stop/start the stack)
   naturally leaves the database at whatever the *remaining* migrations
   produce — i.e. exactly the "keep from here" boundary's state, no manual
   table-dropping needed. Then run `./ralphloop/seed-dev.sh` so the dev
   admin login (`admin@campsites.test` / `campsites-admin`) exists again before
   the rerun starts — the reset deletes every account. (It runs the core
   `seed-dev.sql` and then the app's `seed-app.sql`; each part waits until
   its tables exist, and `chain.sh` re-runs both after every merge.)
4. **Stop/remove any review containers** whose mounted volume is the
   canonical clone (e.g. a `<project>-dev` container started per
   `reviewing-a-loop-project.md`) — they'll break the instant the files
   under them disappear. Recreate fresh once the rerun reaches a reviewable
   point again.
5. **Verify before kicking off the loop**: confirm `task.md` now shows the
   first unchecked step at the intended boundary task, and that the
   removed tasks' files are actually gone from the working tree (`git
   status` clean, no stray untracked build artifacts like `node_modules`
   or Vite's `.vite/` cache left over from the old build — these aren't touched by git and need
   manual cleanup only where they'd otherwise contradict the reset, e.g. a
   `node_modules` for a `package.json` that no longer exists).
6. **Run `doloop.sh` as normal.** It picks up the first task past the
   boundary exactly as if that task had never run.

## Confirm before executing

Every step above that touches the loop server or the database is a real,
somewhat destructive action (even without rewriting git history). Confirm
the exact scope (which tasks, which files, which commit message) with
whoever asked for the reset before running any of it — don't infer scope
from a general "reset the project" request.
