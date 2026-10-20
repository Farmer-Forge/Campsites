# Forge database conventions

Loop instructions for every step that writes SQL: a migration, a seed, a function, a policy, or code that names a table or column.

**Why this file exists:** a database outlives every screen built on it, and unattended loop passes drift unless the rules are written down. These are the Forge's naming and design rules for Postgres/Supabase.
- Spec: `docs/superpowers/specs/2026-10-04-forge-data-model-and-naming-design.md`.
- When the rule isn't obvious, the reason is given.

## The core model (most apps start here)

```
user_types ─< profiles                                (profiles 1:1 auth.users)
                          auth.users ─ user_details    (the person)
item_type_groups ─< item_types ─< item_type_fields ─< item_type_field_options
                        │
auth.users ─< items >───┘
auth.users ─< collections >── collection_types
              collections ─< collection_items >─ items
auth.users ─< item_type_requests
```

**The pattern is a thing plus a thing type.**
- An **item type** is a class: it defines the fields an item has. An **item** is an object.
- An **item type group** is a folder of item types, just for organizing them.
- A **collection** is a user's own set of items (many-to-many).

Groups and collections are different things:

| | Groups | Collections |
|---|---|---|
| What they group | types | items |
| Owned by | admins | users |
| Relationship | each type is in exactly 1 group | an item can be in many collections |

**Database names are generic. Screen words come from `src/config/app.json`.** MyGear's database says `item_types`, and its screens say "Category".

## Before writing SQL

- [ ] Is there a core table for this already? Extend it (a column, or a row of reference data) instead of making a parallel table. *Example:* MyGear's vehicles are items of type `vehicle`, not a `vehicles` table.
- [ ] Is it a kind of thing that the code or admins branch on? Then it's a row in a `<entity>_types` table, not a new table.

## Names

- [ ] **Case and schema:** names are `snake_case`, SQL keywords are lowercase, and everything is in `public`.
- [ ] **Table names are plural:** `items`, `item_types`, `item_maintenance_entries`.
- [ ] **Child tables carry the parent's singular name as a prefix:** `item_type_fields` (fields of an item type), `collection_items`.
- [ ] **Join tables are `<parent singular>_<child plural>`:** `collection_items`.
- [ ] **Primary key:** `id int generated always as identity primary key`.
  - **Exception:** a table that's 1:1 with `auth.users` uses `user_id uuid primary key references auth.users(id) on delete cascade` (`user_details`).
- [ ] **Foreign key columns are the referenced table's full singular name plus `_id`:** `item_type_id`, `item_type_field_id`, `collection_type_id`.
  - Never a short form such as `field_id` or `group_id`.
  - *Why:* the column then says exactly which table it points at, with no guessing.
- [ ] **Owner column:** always `user_id uuid not null references auth.users(id) on delete cascade`, plus an index `<table>_user_id_idx`.
- [ ] **Booleans start with `is_` or `has_`:** `is_active`, `is_required`, `has_contact_consent`.
- [ ] **Timestamps and dates:** `_at` means `timestamptz` (`created_at`, `contact_consent_at`), and `_date` means `date` (`acquired_date`, `entry_date`).
- [ ] **Measured quantities end with their metric unit:** `_m`, `_g`, `_c`, `_l`. Money ends with its currency: `_usd`.
  - Values are always stored in metric (see the plan's Units constraint).
  - Values inside `items.field_values` carry no suffix; their field's `unit_kind` says the unit.
- [ ] **Small fixed sets that only code branches on are `text` + `check (col in (…))`:** `units`, `field_type`, `unit_kind`, `status`, `entry_type`. Don't create Postgres enum types.
- [ ] **Indexes:** `<table>_<cols>_idx`.
- [ ] **Triggers:** `<table>_<purpose>`. For example, `items_validate` and `collections_touch_updated_at`.
- [ ] **Constraints are left to Postgres to name** (`items_pkey`, `items_item_type_id_fkey`, `items_name_check`). Those names are predictable, so don't hand-name them (the T-SQL `PK_`/`FK_` habit isn't needed here).
- [ ] **Functions:** named verb first, `snake_case` (`is_admin()`, `touch_updated_at()`, `validate_item()`), with parameters prefixed `p_`.
  - Functions the browser calls that are admin-only start with `admin_`.
- [ ] **RLS policy names are plain-English sentences:** "users manage own items", "admins can add item_types".
- [ ] **Migration files:** `supabase/migrations/<YYYYMMDDHHMMSS>_<verb>_<thing>.sql`, e.g. `…_create_item_types.sql`. App migrations add the app's name: `…_mygear_item_maintenance_entries.sql`.

## Type tables

Every core entity's type is a table:

```sql
create table public.<entity>_types (
  id int generated always as identity primary key,
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
```

- [ ] **Refer to types by `key`, never `id`,** in code, seeds, URLs (`/items?type=kayak`) and function parameters (`p_user_type_key`).
  - *Why:* ids change after a reset and a re-seed, but keys don't.
  - Functions resolve a key to an id inside the database.
- [ ] **`key` never changes once created:** it's left out of the column grant.
- [ ] **Who manages them:**
  - **Admin-managed** (with screens): item types and their groups, fields and options.
  - **App-defined** (seeded by a migration or the app seed, read-only to everyone through the API): user types and collection types. The code branches on these keys.

## Every table

- [ ] **`created_at timestamptz not null default now()`** on every table.
- [ ] **`updated_at timestamptz not null default now()`** plus a `<table>_touch_updated_at` trigger (`execute function public.touch_updated_at()`) on every table that users edit.
- [ ] **RLS on every table**, no exceptions. The plan's Global Constraints → Database has the policy patterns.
- [ ] **Every foreign key has a comment** saying why it cascades, blocks or unlinks:
  - **block** when the parent is shared reference data;
  - **cascade** when the child means nothing without its parent;
  - **unlink** peers.
- [ ] **Columns users may not change** (`user_id`, type keys, a collection's type) are kept out of `grant update (…)`.

## The exception: `profiles`

`profiles` is Supabase's authorization bolt-on, so it keeps Supabase's naming: `id uuid` (= `auth.users.id`), not `user_id`.
- It holds only `user_type_id` and `created_at`.
- Everything about the person lives in `user_details`.
- No other table may break the rules above. If you think one should, stop and log `BLOCKED:` for Shawn.

## Self-check before marking a SQL step done

- [ ] No table name is singular, and no foreign key column is a short form (`field_id`, `group_id`, `category_id`).
- [ ] Every boolean starts with `is_` or `has_`, and every timestamp ends in `_at`.
- [ ] Every new table has `created_at`, RLS enabled, and its policies. User-edited tables also have `updated_at` and the touch trigger.
- [ ] Code, seeds and URLs refer to types by key.
