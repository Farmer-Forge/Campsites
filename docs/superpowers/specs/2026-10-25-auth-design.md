# Auth pages (sign in, sign up, forgot and reset password) — Design

Status: **draft for Shawn's review** (2026-10-25). Spec 4 of the roadmap.

Last updated: 2026-10-25

## What this is

The four auth pages, as V1 has them (`features/auth/` at `v1.0`).
- They share one stylesheet, `auth.scss` (68 lines), carried over verbatim like the other styles.
- Each page is a centered auth card: an `auth-header` with a heading, then an `auth-body` with the form.
- Supabase Auth does the work (spec 1, **Auth**).
- All sign-outs go through the app's one sign-out routine (spec 2, **Changes from V1**, #4).

## Sign in (`/login`)

- **Heading:** "Sign In".
- **Fields:** Email (`type=email`), Password. Below them:
  - a "Forgot password?" link → `/forgot-password`;
  - a **"Sign In"** button (cherry), disabled while submitting;
  - a link, "Need an account? Sign up" → `/signup`.
- **Notice:** "Password updated. Sign in with your new password." when the URL has `?reset=done`.
- **Submit:**
  1. `signInWithPassword({ email, password })`. On error, show Supabase's message.
  2. Read the user's own `users.suspended`.
     - If that read fails: sign out and show its message.
     - If suspended: sign out and show **"This account has been suspended."**
  3. Go to `/`.

## Sign up (`/signup`)

- **Heading:** "Sign Up".
- **Fields:** Display name, Email, Password; a **"Sign Up"** button; a link, "Already have an account? Sign in" → `/login`.
- **Submit:**
  1. `signUp({ email, password, options: { data: { display_name } } })`. On error, show Supabase's message.
  2. Otherwise, replace the form with **"Check your email to verify your account."**
- The `users` row comes from the sign-up trigger (spec 1). It takes `display_name` from the metadata, or the part of the email before `@` when the metadata has none.

## Forgot password (`/forgot-password`)

- **Heading:** "Reset Password".
- **Help text:** "Enter your account email and we'll send you a link to choose a new password."
- **Field:** Email. **"Send reset link"** is disabled while submitting or while the email is empty. A "Back to sign in" link → `/login`.
- **Submit:** `resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })`.
  - On success, **whether or not the email has an account:** "If an account exists for that email, we've sent a reset link. Check your inbox (and spam folder)." The page must never reveal who's registered.
  - Only a failed request, such as Supabase's email rate limit, shows an error, with Supabase's message.

## Reset password (`/reset-password`)

The emailed link lands here. supabase-js reads the one-time token from the URL as it starts and signs the user in with a recovery session.

- **Heading:** "New Password".
- **States:**
  - **checking:** "Checking your reset link..."
  - **invalid** (no session: the link expired, was used, or the page was opened directly): "This reset link is invalid or has expired. Reset links work once and only for a limited time.", with a link "Send a new reset link" → `/forgot-password`.
  - **suspended:** after reading the user's own `users.suspended`, if the read fails or the user is suspended, sign out and show "This account has been suspended." A reset link must not become a way around a suspension.
  - **ready:** New password and Confirm password (`autocomplete=new-password`), and **"Save new password"**, disabled while submitting or while empty.
- **Save:**
  - If the passwords differ: "Passwords do not match."
  - Otherwise `auth.updateUser({ password })`. On error, show its message, or "Could not update password. Please try again."
  - On success, sign out and go to `/login?reset=done`, so the new password is proven by a real sign-in.

## Local testing notes (for Task 1, not app behavior)

- **Local email goes to Mailpit,** at the stack's `inbucket` port 54324 on Ralph. Nothing is really sent.
- **Email confirmations are off locally** (`config.toml`), so a local sign-up is signed in at once.
- **`site_url` and `additional_redirect_urls` in `supabase/config.toml` point at `127.0.0.1:3000`,** from V1, so local reset links won't return to the review app. Task 1 sets them to the review app's address (`http://192.168.1.188:4200`). That's local configuration, not the schema contract.

## Proposed changes from V1 (Claude's suggestions, pending Shawn's OK)

1. **Come back where you were.**
   - When `authGuard` or `adminGuard` sends someone to `/login`, it adds `?returnUrl=<the page>`.
   - After a successful sign-in, the app goes there instead of always `/`. It accepts only app-relative paths (starting with a single `/`), so it can't be used to redirect off-site.
2. **Signed-in users skip the auth forms.** Opening `/login` or `/signup` while signed in goes to `/`.
3. **Sign up says the right thing.**
   - If `signUp` returns a session (email confirmation is off, as locally), the user is signed in, so go to `/`.
   - If it returns no session (confirmation is on), show "Check your email to verify your account." as V1 does.
   - V1 showed the "check your email" message in both cases.
4. **Sign up needs all three fields.** "Sign Up" stays disabled while submitting, or while any field is empty or the display name is only spaces, matching the other forms. The display name is trimmed. In V1, a blank display name could be saved as `''`.
5. **Friendlier sign-in failure.** If the suspension check's read fails, show "Something went wrong signing in. Please try again." instead of the raw database message.

## Out of scope

- Other sign-in methods (magic links, social logins), MFA, and changing your own email address (only admins can, through the admin page).
- Production auth settings (email confirmation, SMTP, redirect URLs). They're set by hand when V1.1 gets its own cloud project.
