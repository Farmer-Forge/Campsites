# Account page — Design

Status: **approved by Shawn 2026-10-25**, including its proposed changes from V1. Spec 5 of the roadmap.

Last updated: 2026-10-25

## What this is

`/account` (`authGuard`), as V1 has it (`features/account/` at `v1.0`), minus the dark-mode card, which V1.1 drops (spec 2, **Changes from V1**, #2).
- The layout is `rt-content`, capped at 720px wide with 20px gaps.
- The title is "Account" (`rt-title`), followed by page cards (`rt-page-card`).
- The page's inline styles are carried over verbatim, minus the theme toggle's styles.

**On open:** load the profile (`UserService.loadProfile()`) and fill in the display name.

## Display name card

- **Heading:** "Display name". One required text input.
- **"Save Name"** (cherry, with shadow) is disabled while saving or while the name is only spaces.
- **Save:** `updateDisplayName(name.trim())`. This updates the user's own `users.display_name` and the auth user's metadata `display_name`.
  - Success: "Display name updated."
  - Failure: "Could not update display name. Please try again."

## Password card

- **Heading:** "Password". "New password" and "Confirm password" sit side by side, wrapping under 200px each.
- **"Update Password"** is disabled while saving or while the new password is empty.
- **Save:**
  - If they differ: "Passwords do not match."
  - Otherwise `auth.updateUser({ password })`.
    - Success: clear both fields and show "Password updated."
    - Failure: show the error's message, or "Could not update password. Please try again."
- Supabase enforces the minimum length (6, as in `config.toml`), and its message is shown as is.

## Delete Account card (danger zone)

- **Look:** a cherry border with no shadow, and a cherry heading "Delete Account".
- **"Delete Account"** (`rt-btn--danger-outline`) asks to confirm:
  - "Delete your account? This cannot be undone."
  - **Cancel**, or **"Yes, delete my account"** (cherry), which is disabled while deleting.
- **Confirm:**
  1. Call the `delete-account` edge function. It deletes the caller's auth user, and the database cascades to their profile, favorites, trips and stops.
  2. Sign out through the one sign-out routine, then go to `/`.
  3. Failure: "Could not delete account. Please try again." and the button comes back.

## Gone in V1.1

- **The Theme card** ("Dark mode" switch). See spec 2.

## Proposed changes from V1 (Claude's suggestions, approved by Shawn 2026-10-25)

1. **Tell the last admin why deleting failed.** V1.1's database refuses to delete the last active admin (spec 1, **Fixes** #4). The edge function then fails, and the user would only see "Could not delete account." So for a user whose `role` is `admin`, a failed delete adds: "If you're the only admin, make another user an admin first." It's a hint, not a check: the app can't count admins, because users read only their own row. Nothing changes in the edge function.

## Out of scope

- Changing your own email (admins do it, on the admin page), MFA, data export.
