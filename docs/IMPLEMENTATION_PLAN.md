# Homeslice — Implementation Plan

**Goal:** a free, self-hosted replacement for Splitwise with full feature parity, wrapped in a sharehouse-admin product. Web and installable PWA are done; **the App Store is now the priority.**

> **Read `docs/STATUS.md` first.** It is the record of what the code does.
> This plan was written on 11 August 2026, before any of it was built, and
> revised on 1 September 2026 to say what actually happened and to put the App
> Store ahead of the remaining feature work. Where this document and STATUS.md
> disagree, STATUS.md wins.
>
> The architecture sections (§2) and the money rules (§4) held up and are
> unchanged apart from marked corrections. The data model (§3) has four
> decisions that were reversed by choice, each marked **REVERSED** in place.
> The milestones (§5) have been rewritten around the new priority.

**Status (1 September 2026):** built, deployed and in daily use by four real
people. The Splitwise core is done — expenses with all five split types,
per-currency balances, settle-up, shared editing with an append-only record,
receipts, search, restore. 131 unit and 64 integration tests pass. Development
runs against a local Supabase stack; production is the hosted project
`zwnhbhymjaqjpuxfcbam`, backed up nightly. The rebuild described in the original
version of this paragraph happened in August and is finished.

**What now stands between this and an App Store listing** is §7, and it is
mostly not app code: two hard compliance gates (in-app account deletion and a
privacy policy) that do not exist yet, the HTTP half of §2.3 that was never
built, and an Apple Developer account nobody has bought.

---

## 1. Product model — one kind of group, fully capable

Splitwise has *friends* and *groups*; expenses can belong to a group or to nobody (a straight 1-on-1 between friends). Homeslice needs both.

**Decision: one generic `groups` table. Every group has every capability.**

There is no type enum and no feature gating. Any group can hold expenses, balances, notes, documents and presence. The creator writes a free-text `label` describing what the group is — "Sharehouse", "Ski trip 2026", "Mum & Dad" — which drives display only and is never checked in code. A suggestion list appears in the UI as a convenience; it is not enforced anywhere.

The earlier draft gated features behind a `type` discriminator. That was wrong: a trip group wants a document vault for booking confirmations, a couple wants one for insurance policies, and any rule about which type gets which feature would have been invented rather than discovered. Clutter is a UI problem, so the UI solves it — Expenses and Balances are always primary; Notes, Documents and Presence are present but never in the way.

Creating a group is **optional**. A brand-new user can add a friend and split a dinner without ever touching a group. `expenses.group_id` is nullable; that single nullable column is what makes groups optional.

Homeslice still earns its name through the house-admin layer — documents (lease agreements, inventories), structured house info (wifi password, alarm code, landlord contact, bin day), notes and presence. That layer is simply available to everyone rather than locked to a type, and it remains the differentiator over a plain splitter.

---

## 2. Architecture decisions

These are the calls that are expensive to reverse, so they get made now.

### 2.1 Server-side rendering and auth

Adopt `@supabase/ssr`. Sessions move from `localStorage` to cookies, which makes them readable in Server Components, Route Handlers and middleware. Add `middleware.ts` to redirect unauthenticated requests before any HTML is sent — no more auth flash, no more client-side redirect after render.

### 2.2 Domain logic lives in framework-free modules

`src/core/` contains **pure TypeScript** — no React, no Next, no Supabase imports:

```
src/core/
  money.ts            # integer-cent arithmetic, formatting
  split.ts            # equal / exact / percent / shares / adjustment → per-person cents
  balances.ts         # net balances, pairwise edges, per-currency
  simplify.ts         # greedy debt simplification
  recurrence.ts       # next-occurrence date calculation
```

Two reasons. First, this is where every money bug will live, and pure functions are trivially unit-testable with no database. Second, when we build the native app, this directory ports across unchanged — it is the shared core between web and mobile.

### 2.3 Mutations go through a service layer exposed two ways

```
src/server/services/expenses.ts   ← the actual logic, Zod-validated
        ├── exposed as Server Actions   (web app calls these)
        └── exposed as Route Handlers   (/api/... — native app calls these)
```

This matters for the App Store path. Server Actions are the nicer developer experience for the web, but a React Native client can't call them — it needs HTTP. Writing the logic once in a service module and putting two thin adapters on top means the native app never forces a rewrite. Skipping this now is the single most likely cause of a painful rewrite in six months.

> **HALF BUILT — and this is the half the App Store needs.** The service layer
> is real: `src/server/services/` holds ten modules and every one of the twenty
> Server Actions in `src/app/actions.ts` is a thin wrapper that calls a service,
> revalidates a path and returns a result. The logic is not trapped in the
> actions.
>
> The Route Handler adapter was never written. `src/app/api/` contains exactly
> one route — `expense-images/[id]`, which mints a signed URL for a private
> receipt — and no mutation is reachable over HTTP.
>
> So the insurance was bought but never collected. The good news is that the
> expensive part was the separation, and it held: adding `/api` handlers is
> writing thin wrappers against services that already exist and are already
> tested. It is now a task in M6 rather than a rewrite.

### 2.4 Money is integer cents, always

`amount_cents BIGINT`. Never floats. The current code does `expense.amount / expense.split_with.length` in JavaScript — split $10.00 three ways and you get $3.333…, three of which sum to $9.999…. A cent vanishes. Every split function returns an integer array whose sum is *exactly* the total, with a documented, deterministic remainder rule (see §4).

### 2.5 Multi-currency without exchange rates

Each expense carries its own currency. Balances are tracked and displayed **per currency** — "you owe Sam €20 and R150" — with no automatic conversion. This is exactly what Splitwise does, and it avoids the whole problem of which day's FX rate applies to a debt that's three months old. A group has a default currency for convenience only.

### 2.6 Mobile-first UI from the first commit

Bottom tab navigation, thumb-reachable primary actions, full-screen sheets instead of centered desktop modals. This is not polish for later; a desktop-shaped UI retrofitted to mobile is the most common reason a wrapped web app gets rejected from the App Store.

The mobile-first half of this happened and is the reason §7 is plausible at all:
bottom nav, sheets, safe-area handling, one control size throughout.

> **REVERSED — shadcn/ui was never adopted.** The original text called for it
> here. The UI is hand-rolled Tailwind and has not suffered for it; the
> component library would have been a dependency to tune rather than a problem
> solved. Nothing in §7 depends on it, and adopting it now would be a rewrite of
> working screens for no reviewer-visible gain.

### 2.7 Soft deletes

`deleted_at` on expenses and settlements. Splitwise lets you restore a deleted expense and shows deletions in the activity feed; both need the row to survive.

### 2.8 Constrain a value only when it changes what the program does

The default is free text. A dropdown of someone else's words is a small insult to the user, and every fixed list becomes a migration the first time reality doesn't fit it.

**Free text, user-defined, or optional:** group label, settlement method (and it can be left blank), note categories, expense categories (seeded defaults plus your own), document titles.

**Constrained, deliberately:** `expenses.split_type`, because its value selects which split function runs. `recurrence_rules.frequency`, because its value selects which date calculation runs. `group_members.role`, because its value decides who may delete other people's things. `friendships.status`, because it gates whether a connection is active. In each of these a typo is a bug rather than a label, which is exactly the line: constrain behaviour, never vocabulary.

---

## 3. Data model

Full DDL sketch for the consolidated baseline migration. Replaces all 20 files currently in `supabase/migrations/`.

> **This section is the sketch, not the schema.** The baseline migration was
> written from it and has since been joined by thirteen more. For the schema as
> it actually is, read `src/types/database.types.ts`, which is generated from
> the live database, or run `./scripts/db-diff.sh`. The four **REVERSED** notes
> below are the places where the sketch and the schema disagree on purpose.

### 3.1 Identity — placeholder people (REVERSED)

> **REVERSED on 12 August — there are no placeholder people, and no usernames.**
>
> A profile without a login could only ever be reunited with its owner through
> an email recorded when it was created, and the form made that email optional.
> So anyone added by name alone could never claim their history: the feature
> promised something it could not deliver. Using Homeslice means having an
> account. The cost, stated plainly, is that you cannot record a split with
> someone until they have signed up — on a trip, everyone installs before the
> first dinner goes in.
>
> `username` went at the same time. One unique display name does both jobs: what
> everyone sees, and what you type to add somebody. Unique ignoring case and
> extra spaces, so two people can never look identical in a group.
>
> `profiles.id` stayed decoupled from `auth.users.id` even so. Nothing now
> depends on the decoupling, but it costs nothing and undoing it would touch
> every foreign key in the schema.
>
> The DDL below is kept for the reasoning around it, not as a description of
> the table.

```sql
-- Decoupled from auth.users so we can create people who haven't signed up yet.
create table profiles (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,  -- NULL = placeholder
  username      text unique,
  display_name  text not null,
  email         text,                     -- used to claim a placeholder on signup
  avatar_url    text,
  default_currency char(3) not null default 'ZAR',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

This is a meaningful change from the old schema, where `profiles.id` was the `auth.users` id. Decoupling is what makes **placeholder members** possible — you add "Mum" to a group by name, split expenses with her immediately, and when she eventually signs up with a matching email the placeholder is claimed and the history is hers. Splitwise has this and it's essential for family use where not everyone will bother registering.

```sql
create table friendships (
  id          uuid primary key default gen_random_uuid(),
  profile_a   uuid not null references profiles(id) on delete cascade,
  profile_b   uuid not null references profiles(id) on delete cascade,
  status      text not null default 'accepted',   -- pending | accepted | blocked
  created_at  timestamptz not null default now(),
  check (profile_a < profile_b),          -- canonical ordering, prevents duplicate pairs
  unique (profile_a, profile_b)
);
```

Friendships are auto-created when two people share an expense, matching Splitwise's behaviour.

### 3.2 Groups

```sql
create table groups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  label          text,                            -- free text: "Sharehouse", "Ski trip", anything
  icon           text,                            -- emoji or icon key, user's choice
  avatar_url     text,
  currency       char(3) not null default 'ZAR',  -- REVERSED: a suggestion only, see below
  invite_code    text unique not null,            -- crypto-random, not Math.random
  address        text,
  simplify_debts boolean not null default false,
  created_by     uuid references profiles(id) on delete set null,
  archived_at    timestamptz,
  created_at     timestamptz not null default now()
);

create table group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role       text not null default 'member',      -- admin | member
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  unique (group_id, profile_id)
);
```

> **REVERSED — a group has no meaningful currency.** The column survives, but
> only as a suggested default for the next expense typed into that group. It is
> never used to convert, total or constrain anything. A trip through Portugal
> and Spain runs in as many currencies as it runs in, and a group that insisted
> on one would be lying about the balances. Per-currency balances (§2.5) made
> the group-level currency redundant the moment they worked.

Leaving is `left_at`, not a delete: the expenses somebody was part of, and the
balances that came out of them, have to survive their leaving. Removal is
refused while they are unsettled, and the last admin leaving promotes the
longest-standing remaining member so a group can never be left unadministered.

### 3.3 Expenses — the part that was structurally missing

```sql
create table expenses (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid references groups(id) on delete cascade,   -- NULL = non-group expense
  created_by    uuid not null references profiles(id),
  description   text not null,
  amount_cents  bigint not null check (amount_cents > 0),
  currency      char(3) not null,
  category_id   text references categories(id),
  expense_date  date not null default current_date,
  split_type    text not null default 'equal',   -- equal|exact|percent|shares|adjustment
  note          text,
  recurrence_id uuid references recurrence_rules(id) on delete set null,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One row per person per expense. Handles multiple payers for free.
create table expense_participants (
  expense_id   uuid not null references expenses(id) on delete cascade,
  profile_id   uuid not null references profiles(id) on delete cascade,
  paid_cents   bigint not null default 0,   -- what this person put in
  owed_cents   bigint not null default 0,   -- what this person's share is
  split_weight numeric,                     -- the % or share count as entered, for edit round-trip
  primary key (expense_id, profile_id)
);
```

`expense_participants` is the heart of the rebuild. The old schema recorded `created_by` (who typed it in) and `split_with[]` (who shares it) but never **who paid** — which is why balances were mathematically impossible. Here, one person's net contribution to an expense is `paid_cents - owed_cents`, and multi-payer expenses ("Sam covered R400 and I covered R200") fall out for free with no extra structure.

Expenses carry **multiple images**, not one:

```sql
create table expense_images (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references expenses(id) on delete cascade,
  image_url   text not null,
  sort_order  int not null default 0,
  uploaded_by uuid references profiles(id),
  created_at  timestamptz not null default now()
);
```

The earlier draft had a single `receipt_url TEXT` column on `expenses`, which can only ever hold one image. A table instead means as many photos per expense as you like — the receipt, the basket, the itemised second page — in a defined order. Stored in a **private** bucket served through signed URLs, since a receipt shows what you bought and where you were.

A trigger enforces the invariant on every write:

```
SUM(paid_cents) = SUM(owed_cents) = expenses.amount_cents
```

If that ever fails, balances are wrong, so it is checked in the database rather than trusted from the client.

Note that the old `expense_payments` table is dropped. It was written to on every expense and **never read anywhere in the app** — `ExpensesTab.tsx:222` was its only reference, and its `paid` flag was set to `false` and never flipped.

```sql
create table settlements (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid references groups(id) on delete cascade,   -- NULL = non-group
  from_profile  uuid not null references profiles(id),
  to_profile    uuid not null references profiles(id),
  amount_cents  bigint not null check (amount_cents > 0),
  currency      char(3) not null,
  method        text,                       -- free text, optional: "EFT", "cash", "SnapScan", blank
  note          text,
  settled_on    date not null default current_date,
  created_by    uuid not null references profiles(id),
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  check (from_profile <> to_profile)
);
```

### 3.4 Supporting tables

```sql
create table categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  icon       text,
  color      text,
  created_by uuid references profiles(id) on delete cascade,  -- NULL = system default
  group_id   uuid references groups(id) on delete cascade,    -- NULL = available everywhere
  created_at timestamptz not null default now()
);
-- Seeded defaults (created_by NULL): Groceries, Rent, Utilities, Dining out,
-- Transport, Entertainment, Household, Travel, Health, Gifts, General.
-- Users add their own with a name and icon; a group can have its own set.

create table expense_comments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  body text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table activity_events (       -- populated by triggers, powers the feed
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  actor_id uuid references profiles(id),
  type text not null,                -- expense.created | expense.updated | settlement.created | ...
  expense_id uuid, settlement_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  template jsonb not null,           -- the expense to clone
  frequency text not null,           -- daily|weekly|fortnightly|monthly|quarterly|yearly
  interval int not null default 1,
  next_run_on date not null,
  end_on date,
  active boolean not null default true
);

create table push_subscriptions (...);   -- optional Web Push, M4 only
```

All of these were created in the baseline migration. Three are used:
`categories` (seeded, not yet user-extensible), `expense_images`, and
`recurrence_rules` only as a schema — nothing reads or writes it, and **it has
no RLS policies at all**, which has to be fixed before anything does.

`activity_events` was superseded before it was ever populated: the feed arrived
instead as `expense_events` and `settlement_events`, which record who changed
what on a specific row and are what Recent sorts by. `expense_comments`,
`documents`, `notes`, `note_images`, `member_presence` and `push_subscriptions`
are empty and have no screens — see M3 and M4.

### 3.5 House-admin features — available to every group

`notes` and `notes_images` are retained, re-scoped to `group_id`, with the fixed five-category list replaced by free-text categories. `member_presence` retained. New:

```sql
create table documents (             -- lease agreements, inventories, warranties
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  title text not null, file_url text not null,
  mime_type text, size_bytes bigint,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
```

Private Supabase storage bucket with signed URLs — a lease agreement must not sit behind a public URL like the current avatars bucket does.

### 3.6 RLS strategy

The previous attempt produced eight debug/reset SQL files because policies recursed (a `house_members` policy that queries `house_members`). The fix already discovered — `SECURITY DEFINER` helper functions — is right and gets carried forward, written once and cleanly:

```sql
create function my_profile_id() returns uuid ...        -- auth.uid() → profiles.id
create function my_group_ids() returns setof uuid ...   -- groups I belong to
```

Every policy is expressed in terms of these. **Every policy gets an automated test** (§6.3) — this is the security boundary for other people's financial data, so it is verified rather than assumed.

---

## 4. Money rules

These get written down because they are the source of the subtle bugs.

**Equal split.** `base = floor(total / n)`, `remainder = total - base × n`. The remainder is distributed one cent each to the first `remainder` participants, ordered by profile id. Deterministic, and the sum is always exactly the total.

**Percent and shares.** Largest-remainder method: compute each exact share, floor it, then hand the leftover cents to whoever has the largest fractional part. Guarantees the sum matches and distributes error fairly.

**Exact amounts.** Validated to sum to the total; the form blocks submission otherwise, showing the running difference like Splitwise does.

**Adjustment.** A person's fixed +/- amount is applied first, and the balance splits equally among the rest.

**Net balance** for person *p* in currency *c*:

```
net(p) = Σ (paid_cents − owed_cents) over expenses in c
       + Σ settlements where p is payer
       − Σ settlements where p is payee
```

Positive means they are owed money.

**Pairwise balances** ("you owe Sam R240") are derived per expense: within each expense, allocate each creditor's surplus across the debtors proportionally to their deficits, producing directed edges. Sum those edges across all expenses and settlements. This is what lets the UI show a specific person rather than only a group total.

**Debt simplification** is a greedy min-cash-flow pass over the net balances: repeatedly match the largest creditor with the largest debtor. Opt-in per group via `groups.simplify_debts`, matching Splitwise.

---

## 5. Milestones

The numbers below are kept because STATUS.md and the commit messages refer to
them. What has changed is the **order**: M5 was the last milestone and is now
the next one. M3 and M4 move behind it.

| | | |
|---|---|---|
| **M0** Foundation | done, three deliberate omissions | Aug |
| **M1** Core splitter | done; three items open | Aug |
| **M2** Daily driver | partial — search, restore, per-expense history | Aug–Sep |
| **M5** → **App Store** | **next** | §7 |
| **M4** PWA hardening | mostly absorbed into M5 | after |
| **M3** House-admin layer | deferred | after |

The reason for the reorder: M3 and M4 are features for people who already have
the app, and four people already have it as a PWA. M5 is what puts it in front
of anyone else, and its long pole is not code — it is an Apple Developer account
with an approval lag and two compliance gates that have to be built and
reviewed. Starting that clock first is free; everything in M3 and M4 can be
built while it runs.

### M0 — Foundation · **DONE**

Supabase project, one baseline migration (since joined by thirteen more), seeded
categories, three storage buckets, generated types, cookie auth and middleware
are all in place.

Three items were not done, each a choice rather than an oversight:

- **shadcn/ui** was never adopted — see §2.6.
- **Playwright** was never installed, so there are no end-to-end tests. §6.4 is
  entirely unbuilt.
- **GitHub Actions CI** does not exist. Nothing runs on push but a person.

Not in the original M0 and done anyway, because the work demanded it:

- **A local Supabase stack for development** (20 August). Before that, all four
  checkouts and the integration suite pointed at production, which is why the
  live project carries thirteen profiles behind four real logins. See
  `docs/DATABASE.md`.
- **`20260820000000_explicit_grants.sql`.** Not one of the first thirteen
  migrations granted `anon` or `authenticated` a single privilege on a single
  table. Production had those grants by accident of how it was built, so
  everything worked there and a from-zero replay produced an app that could not
  read its own tables. Only replaying from zero could have found it.
- **`./scripts/db-diff.sh`**, comparing 762 schema objects between local and
  production, privileges included.
- **Nightly production backups** via a launchd agent. The Supabase free plan
  includes no scheduled backups and no point-in-time recovery, so the JSON
  snapshot is the only copy that exists.

### M1 — The core splitter · **DONE**

Past the "I can cancel Splitwise" bar and in daily use. Auth (password, magic
link, reset), profiles with avatars and a default currency, friends, groups,
expense create/edit/delete with all five split types, multiple receipt photos,
per-currency balances, settle-up, mobile-first PWA shell, and the unit suite
over `src/core/`.

Beyond the original list: **shared editing** with an append-only per-expense
record of who changed what, and the whole **undo** cluster — rename and delete a
group, remove a member, leave, remove a friend, edit your own name and currency.

**The multi-payer UI shipped on 1 September**, closing the third of these. Two
M1 items remain open, and neither blocks M5.

1. **User-created categories.** The seeded ones exist; adding your own does not.
2. **Debt-simplification toggle.** `groups.simplify_debts` is read at settle-up
   and nothing writes it. `src/core/simplify.ts` is built and tested.

### M2 — Daily driver · **PARTIAL**

Shipped:

- **Search and filter** on all three lists plus the home screen. Matching lives
  in `src/core/search.ts` with tests, because it turned out to have rules: words
  match from their start, and accents fold both ways so "pasteis" finds
  "Pastéis de Belém".
- **Restore a deleted expense or payment.**
- **The activity feed, sideways.** The plan's dedicated feed screen was cut;
  what arrived instead is `expense_events` / `settlement_events` and the Recent
  list on the dashboard, ordered by when somebody last touched a thing rather
  than by the date written on it. That ordering is not cosmetic — backdating an
  expense used to bury it below everything newer, so the balance moved and
  nothing visible moved with it, which reads as an arithmetic bug.

Untouched: comments on expenses (`expense_comments` exists as a table; hang them
off `expense_events`), recurring expenses (schema and the date maths in
`src/core/recurrence.ts` are done and tested — needs UI, a cron route, and RLS
policies, since the table has none), CSV export, monthly summaries and charts.

*Still cut, still on purpose: email notifications and debt-reminder nudges.*

### M5 — App Store · **NEXT**

Substance and reasoning are in §7, which has been rewritten. The sequence:

**M5a — start the clock (do first, it is mostly waiting).**
Enrol in the Apple Developer Program ($99/year, individual enrolment, identity
verification can take days). Reserve the bundle id and the app name in App Store
Connect.

**M5b — the two compliance gates.** Neither exists today and neither is
optional; see §7.2. In-app account deletion, and a published privacy policy with
App Privacy answers to match.

**M5c — the HTTP adapter.** Route Handlers over the existing services, per §2.3.
This is what lets a native client — Capacitor today, Expo if we ever fall back —
call the same server logic. Thin wrappers over tested code.

**M5d — native capability, and the app-feel work.** Push, camera, haptics,
share sheet — the Guideline 4.2 mitigations — plus **optimistic UI on expense
creation**, pulled forward from M4 for the same reason.

**M5e — Capacitor shell, TestFlight, submit.**

### M4 — PWA hardening · **AFTER, AND MOSTLY ABSORBED**

Decided 1 September: **optimistic UI is in, and it moves into M5** as part of
making the app feel native under review. Web Push is superseded by native push,
install prompts are dropped for iOS, and the offline read cache is the one item
that genuinely waits until after submission. The reasoning, item by item:

- **Web Push** → becomes **native** push in M5d. Web Push on iOS requires the
  user to have installed the PWA to the home screen and is a second
  implementation of the same feature; the native path is the one worth building.
  Scope unchanged from the original: real events only — somebody added an
  expense involving you, somebody settled up — opt-in, never a reminder.
  `push_subscriptions` exists as a table and is unused.
- **Optimistic UI on expense creation** → **confirmed, and pulled into M5d.** A
  wrapped web app feels like a website mostly at the moment you tap Save and
  wait, and that is exactly what a reviewer notices. It is also the only one of
  the four that the four existing users would feel tomorrow.
- **Offline read cache** → genuinely after, and the only one of the four that
  is. There is no service worker at all today; the PWA is a manifest and icons.
  It is real work, it touches every data path, and a reviewer opening the app
  on a desk with wifi will never see it. §7.4 has the longer reasoning.
- **Install prompts** → drop for iOS. Native install replaces them.

### M3 — House-admin layer · **DEFERRED**

Documents vault with signed URLs, structured house info (wifi, alarm code,
landlord, bin day, meter readings), notes revamp with free-text categories,
presence, optional chore rotation.

The `documents`, `notes`, `note_images` and `member_presence` tables were all
created in the baseline migration and none has a screen. This is the
differentiator over a plain splitter and it is still wanted — it is deferred
because it does not help an app get listed, not because it stopped mattering.

### Later — itemised expenses and receipt scanning

Your grocery case: you buy R850 of shopping, R120 of it is yours alone, and today you'd do that arithmetic in your head before typing a total. The fix is to let an expense be composed of line items you tick in or out.

```sql
create table expense_items (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references expenses(id) on delete cascade,
  description  text not null,
  amount_cents bigint not null,
  quantity     numeric default 1,
  included     boolean not null default true,
  sort_order   int not null default 0
);
```

When items exist, `expenses.amount_cents` becomes the sum of the included ones and the field goes read-only; when they don't, nothing changes. That's why it can be added later without disturbing anything built before it — and it's worth noting the itemisation half is useful **on its own, before any scanning exists**, since it replaces the mental arithmetic either way.

Scanning then just becomes a way to populate those rows from a photo you've already uploaded. On the "free service" question, the honest tradeoff when we get there: **Tesseract.js** is genuinely free and runs entirely in the browser with no server cost or privacy question, but it is mediocre on crumpled thermal receipts and will need correcting often enough to annoy. A **vision model** costs a fraction of a cent per receipt and is dramatically more accurate. I'd suggest trying Tesseract first since it's free and the fallback is simply typing, then reassessing once you've scanned a few real receipts.

---

## 6. Testing strategy

You asked for this explicitly, and it's the right instinct — the moment other people's money is in the system, a rounding bug or a leaky RLS policy stops being a nuisance.

**Where this landed: 6.1, 6.2 and 6.3 are built and are the reason this app is
trusted with real money — 131 unit and 64 integration tests, all passing. 6.4
(Playwright) and 6.5 (CI) were never built, and §7.5 argues they should be
before an App Store submission rather than after.**

### 6.1 Unit tests — `src/core/` (Vitest) · **BUILT**

The highest-value tests in the project, and they need no database.

- Every split type: sums exactly to the total, for adversarial amounts (1 cent among 7 people, R0.03 among 4, huge values, 2-person, 20-person).
- Remainder distribution is deterministic and fair.
- Percent splits that don't sum to 100 are rejected; exact splits that don't sum to the total are rejected.
- Balance netting: a closed loop of expenses and settlements returns everyone to zero.
- Pairwise allocation sums to the net balance for every person.
- Debt simplification preserves every net balance and never increases the transaction count.
- Recurrence: month-end handling (31 Jan + 1 month), leap years, DST boundaries.

Property-based tests where it pays: generate random expense sets, assert the invariant that all balances sum to zero.

### 6.2 Integration tests — services against a local database · **BUILT**

`supabase start` gives a real Postgres in Docker. Test the service layer for real: create expense → participants written correctly → invariant trigger holds → balance view returns the expected numbers. Includes concurrent-edit and soft-delete-restore paths.

### 6.3 RLS policy tests — the security suite · **BUILT**

For every table, assert as an authenticated non-member that SELECT returns zero rows and INSERT/UPDATE/DELETE are rejected. Explicitly cover: a user outside a group cannot read its expenses, cannot join without a valid invite code, cannot edit someone else's expense, cannot read another house's documents, and cannot escalate themselves to admin. These run in CI on every push and are the reason we can be relaxed about the client holding an anon key.

### 6.4 End-to-end — Playwright · **NOT BUILT**

The critical journeys: sign up → create a house → invite → add an expense with an uneven split → verify both people see the correct balance → settle up → verify zero. Plus the non-group friend flow, and a mobile-viewport pass.

### 6.5 CI · **NOT BUILT**

GitHub Actions on every push: typecheck → lint → unit → integration + RLS (against a Supabase service container) → Playwright on PRs. Vercel preview deploy per branch.

---

## 7. The App Store path

This is now the active milestone, so it gets the detail it did not need in
August.

**Recommendation, unchanged: ship the PWA (done), wrap it with Capacitor, keep
`src/core/` framework-free as insurance.** Capacitor puts the existing web app
in a native shell — one codebase, weeks not months. The fallback if it proves
too limiting is Expo/React Native, which reuses `src/core/`, the Supabase schema
and the `/api` routes, leaving only the UI to rebuild. That fallback stays cheap
only if §2.2 and §2.3 are honoured; §2.2 was, §2.3 was half-honoured, and M5c
closes the gap.

### 7.1 The architectural tension, and why it is smaller than it looks

Capacitor either bundles a static export — which would cost us Server Components
and Server Actions, and this app leans hard on both — or loads the hosted URL,
which is what Apple scrutinises under Guideline 4.2.

The §2.3 service layer defuses this, and it defuses it more cheaply than
expected: the twenty Server Actions are already thin wrappers over
`src/server/services/`, so the logic is not trapped in them. Adding Route
Handlers is new files calling existing tested functions, not a refactor of
working code.

The realistic shape is the hosted URL plus a bundled app shell — splash, icons,
offline fallback, tab chrome — so that first paint comes from the binary rather
than the network, with native capability layered on top. That is what separates
"an app" from "a bookmark" in review.

### 7.2 The two hard gates — neither exists today

These are not polish. Both are grounds for rejection on submission, and the
first one has real design weight in this app.

**In-app account deletion (Guideline 5.1.1(v)).** Any app that lets you create
an account must let you delete it from inside the app. `/account` currently
offers name, default currency, avatar and sign out. There is nothing to build on.

This is a genuinely hard problem here, and worth thinking about before writing
code rather than after. Homeslice's history is append-only, shared, and other
people's balances are computed from it. Deleting the row is not available: if
your profile vanishes, every expense you were part of loses a participant, every
`SUM(paid) = SUM(owed) = amount` invariant on those rows breaks, and three other
people's balances silently change to numbers that were never true. Apple's
requirement is that the account is deleted, not that the ledger is falsified.

The shape that satisfies both is almost certainly the one that already exists
for leaving a group: sever the login, tombstone the person, keep the rows.
`profiles.auth_user_id` is already nullable and already decoupled from
`auth.users` — the decoupling that lost its original purpose when placeholder
people were removed turns out to be exactly what this needs. Delete the
`auth.users` row, null the link, redact the email, replace the display name with
a stable "Deleted user", drop the avatar file, and leave every expense and
settlement intact. The same unsettled-balance guard that blocks removing a
member from a group applies: you cannot walk away from money that is owed, and
telling somebody that is a better answer than either falsifying their balance or
refusing them the deletion outright.

That needs deciding, not just building. It is the first real task in M5b.

**A privacy policy.** Required at submission as a URL, and the App Privacy
questionnaire has to match what the app actually collects. No such page exists
— `src/app/` has no privacy or terms route. The content is short and honest:
email for sign-in, display name, avatar, and the expenses you type in; stored in
Supabase in eu-west-1; not sold, not shared, no third-party analytics; here is
how to delete it, which is the gate above. Ship it as a route in the app so the
URL is stable.

**Not required, worth knowing:** Sign in with Apple is only mandatory if you
offer third-party social login. Homeslice offers email/password and magic link,
so it does not apply. If Google sign-in is ever added, it does.

### 7.3 Guideline 4.2 — Minimum Functionality

The rejection risk for any wrapped web app. The mitigations were baked into the
plan from M1 and most are already true:

- **A mobile-native-feeling UI** rather than a responsive desktop layout —
  bottom nav, sheets, safe-area handling, one control size. **Done.**
- **Real native capability use:** push, camera for receipt capture, haptics,
  share sheet, biometric unlock. **M5d.** Camera is the most valuable of these
  and the easiest to demonstrate, since photographing a receipt is already a
  core flow that currently goes through a file picker.
- **App-shell assets bundled in the binary** rather than every screen loaded
  from the network. **M5e.**

### 7.4 Which is to say — "PWA hardening" in plain terms

The M4 label was never explained, so: it means making the installed web app
behave like software rather than a page that needs a connection.

- **Offline read cache.** A service worker storing the last-seen balances and
  expenses so opening the app in a basement shows yesterday's numbers instead of
  an error. There is no service worker at all today — the PWA is a manifest and
  icons, which is enough to install but nothing more. Read-only is the whole
  scope; offline *writes* would mean queued mutations reconciling against
  balances other people have moved in the meantime, which is a distributed
  systems problem this app does not need.
- **Optimistic UI on expense creation.** Show the expense in the list the
  instant Save is tapped, reconcile when the server answers, roll back visibly
  if it fails. This is most of the difference between "app" and "website".
- **Install prompts.** Catching `beforeinstallprompt` on Android to offer
  installation at a sensible moment. iOS never fires it, and native install
  replaces it entirely — hence dropped in M5.
- **Web Push.** Browser notifications for real events. Superseded by native
  push, which works without the user having installed anything first.

Of the four, optimistic UI helps the App Store submission, native push replaces
Web Push, install prompts get dropped, and the offline cache is the one that
genuinely waits.

### 7.5 Cost and timing

$99/year for the Apple Developer Program, and identity verification can take
days — which is why M5a is first and is mostly waiting. Google Play is a $25
one-off if Android follows. Nothing else in M5 costs money.

Two things worth doing before submission that are not gates: **Playwright** over
the critical journeys (§6.4, never built) and **CI** (§6.5, never built).
Submitting a build that only a person has ever tested, to a review process that
takes days per round trip, is how one typo becomes a fortnight.

## 8. Decisions made for you (flag anything you'd change)

Each is marked with how it actually turned out.

1. **One generic groups table, no type enum, no feature gating** — every group can do everything, and `label` is free text. *(Revised from the first draft at your request; you were right.)* **HELD.**
2. **Per-currency balances, no FX conversion** — Splitwise's approach, avoids stale-exchange-rate arguments. **HELD**, and it is what made the group-level currency redundant.
3. **Profiles decoupled from `auth.users`** so placeholder people can be split with before they sign up. Bigger change than it looks, but retrofitting it later would touch every expense row. **HALF.** Placeholder people are gone (§3.1); the decoupling stayed, and §7.2 is about to give it a second purpose it was not designed for.
4. **Staying on Next.js 15 / React 18** for now. Next 16 and React 19 are an optional later upgrade; not worth the risk today. **HELD** — still 15.5 / 18.3, and still not worth doing mid-App-Store push.
5. **shadcn/ui** for components, so M1 has a decent-looking mobile UI without hand-rolling everything. **REVERSED** — see §2.6.
6. **Magic-link sign-in added alongside email/password** — materially lower friction when inviting family who won't want another password. **HELD**, and it keeps Sign in with Apple out of scope (§7.2).
7. **Free text by default, constrained only where the value drives behaviour** — see §2.8 for the line and why three columns stay on the constrained side of it. **HELD**, and it is the rule that survived best.
8. **Multiple images per expense via `expense_images`**, replacing the single `receipt_url` column, in a private bucket with signed URLs. **HELD.** The public/private split between `avatars` and `receipts` was argued out on 12 August; the reasoning is in STATUS.md.

Decisions taken since, which belong in this list:

9. **Anyone in an expense may edit it; nobody may edit the record of having edited it.** The app is a ledger, not an auditor — Sam telling you the beers were €5 should not mean asking Sam to go and change it. `expense_events` has select and insert policies and deliberately no update or delete.
10. **Development is a local Supabase stack, production is the hosted project** (20 August). See `docs/DATABASE.md`. Worktrees isolate code, never data.
11. **Money and dates are formatted by hand, never with `toLocaleString`.** Node and Chrome disagree, and the same value rendered on the server and in the browser is a hydration mismatch. `src/core/money.ts` and `src/core/time.ts` assemble the strings themselves.

## 9. Honest note on timing

*The original note said M0 plus M1 in one afternoon was ambitious, and guessed
that the rarer split types, pairwise-balance polish and debt simplification
would be what slipped. It took about three weeks, all five split types landed,
and debt simplification is the one thing on that list still unfinished — the
maths is written and tested, the toggle to turn it on is not.*

For M5, the honest version:

- **M5a is waiting, not working.** Apple's identity verification takes as long
  as it takes. Start it before anything else.
- **M5b is the real work**, and account deletion is the part with a design
  question rather than a task list — §7.2. Expect it to take longer than it
  looks, because getting it wrong means falsifying somebody's balance.
- **M5c and M5d are ordinary.** Thin wrappers over tested services, and
  Capacitor plugins with documented APIs.
- **M5e is where the schedule goes to die.** Review is days per round trip, and
  4.2 rejections are a judgement call rather than a checklist. Budget for two
  rejections and be pleasantly surprised. This is the argument for doing §6.4
  and §6.5 first: a typo caught by CI costs minutes, and the same typo caught by
  a reviewer costs a week.

The thing most likely to go wrong is not on this list: it is that M3 and M4 are
more fun than compliance work, and the compliance work is what the milestone
actually is.
