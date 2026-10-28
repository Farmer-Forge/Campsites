# Admin page and About page — Design

Status: **approved by Shawn 2026-10-25**, including its proposed changes from V1. Specs 8 and 9 of the roadmap.

Last updated: 2026-10-25

## What this is

`/admin` (`adminGuard`) and `/about` (public), as V1 has them (`features/admin/`, `features/about/`, and `core/services/admin-users.service.ts`, `admin-stats.service.ts`, `campground-attributes.service.ts` at `v1.0`). Page styles are carried over verbatim.

The data side is in spec 1:
- the admin-guarded RPCs;
- the admin edge functions;
- `campground_attributes`;
- the V1.1 fixes: a suspended admin isn't an admin, and there's always one active admin.

## Admin (`/admin`)

Layout: `rt-content admin`, with the title "Admin".

### Stats

On open, `get_admin_stats()` loads. The stats show as two stat pills: **Favorites** (the total across all users) and **Trips** (the total). If it fails, show the error's message, or "Could not load site stats."

### Tabs

**Users** (the default) and **Campground Attributes**, as `role=tab` buttons with `aria-selected`.

### Users tab

**Invite form:**
- Email (required) and "Display name (optional)", plus **"Invite User"** (cherry).
- It calls the `admin-invite-user` edge function, which has Supabase email an invite.
- A blank email does nothing. On success it clears the form and reloads the list.

**Users table** (`rt-table` in `rt-table-card`), filled from `get_users_for_admin()`, newest first. The columns are Email, Display Name, Role, Suspended, Created and the row actions:
- **Role:** a PrimeNG select, User / Moderator / Admin, styled as a pill (`role-admin` when admin). Changing it calls `admin_update_user_role`; on error, show the message and reload the list.
- **Suspended:** a teal text button, "Suspend" or "Unsuspend". It calls `admin_set_user_suspended`.
- **Created:** the `date` pipe.
- **Row actions:**
  - **Edit** makes the email and display name editable inputs, with Cancel / **Save**.
    - Save calls `admin_update_user_display_name` if the name changed, then the `admin-update-user-email` edge function if the email changed. The email changes immediately, with no confirmation email.
  - **Delete** shows Cancel / **"Yes, delete"**, which calls the `admin-delete-account` edge function. That function refuses your own account ("Use the self-service delete-account function to delete your own account").

**Errors:** every action shows its error above the table. Edge-function errors show the function's response text. V1 falls back to messages such as "Could not update role." and "Could not delete user." The table updates in place after each successful change; only invites reload it.

### Campground Attributes tab

Free-form notes that admins keep on a campground (type, name, value). **Nothing outside this tab shows them.**
- **Find a campground:** a PrimeNG autocomplete, "Search campgrounds by name". It matches names `ilike %query%` and returns at most 20; `forceSelection` is on.
- **Picking one** loads its attributes, oldest first.
- **Table:** Type, Name, Value and actions.
  - **Edit** makes the three fields editable inputs, with Cancel / **Save**. An empty value is saved as null.
  - **Delete** removes the attribute immediately.
- **Footer row:** Type, Name and Value inputs, plus **Add** (mustard). Type and name are required; an empty value is saved as null.
- **Errors:** shown above, with fallbacks such as "Could not add attribute."

## About (`/about`)

- **A hero section:** the eyebrow "Campsite Finder", the heading "About Us", and the tagline "Because it sounded fun."
- **Contact:** "Questions, bugs, or ideas? Reach the admin at admin@Farmer-Forge.com." The address is a `mailto:` link. (Shawn, 2026-10-27; V1 showed his personal address.)
- The page has its own SCSS (`about.component.scss`, 58 lines), carried over verbatim.

## Proposed changes from V1 (Claude's suggestions, approved by Shawn 2026-10-25)

1. **Your own row says "You".** On the signed-in admin's own row, the role select, Suspend and Delete are replaced by "You" (`rt-notice`). The database refuses those changes anyway, so V1 showed raw errors such as "cannot modify your own role". Edit stays.
2. **Plain-English errors** for the database's known refusals:
   - "cannot remove the last admin" → "There must always be at least one active admin."
   - "not authorized" → "You no longer have admin access."
   - Anything else shows as V1 does.
3. **Stats refresh after deleting a user,** since their favorites and trips go with them.
4. **Campground search treats `%` and `_` literally.** They're escaped before the `ilike`, so searching "50%" doesn't match everything.

## Questions for Shawn (not proposals)

*Approved 2026-10-25 without changes to these, so V1.1 keeps V1's behavior on both: attributes stay admin-only, and the About page keeps the address.*

- **Campground attributes are only ever visible to admins.** That's V1 as built, so V1.1 keeps it. Showing them in the Finder's detail panel would be a new feature for the V1.2 list, if you want it there.
- **The About page's address** *(answered 2026-10-27)*: it's `admin@Farmer-Forge.com`, not V1's personal address.

## Out of scope

- New admin tools: moderator powers (later), audit logs, bulk actions, editing campgrounds themselves.
- The animated About scene that V1's redesign dropped.
