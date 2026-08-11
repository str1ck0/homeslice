# Homeslice — Implementation Plan

**Goal:** a free, self-hosted replacement for Splitwise with full feature parity, wrapped in a sharehouse-admin product. Web + installable PWA first, iOS/Android App Store later.

**Status:** the previous Supabase project (`zwnhbhymjaqjpuxfcbam`) no longer exists — DNS returns NXDOMAIN, so data, auth users, storage and the applied RLS state are all gone. `homeslice.vercel.app` still serves the frontend but every data call fails. We are rebuilding the backend from scratch, which is fortunate timing: it lets us fix the schema decisions that block cost-splitting without any migration pain.

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

### 2.4 Money is integer cents, always

`amount_cents BIGINT`. Never floats. The current code does `expense.amount / expense.split_with.length` in JavaScript — split $10.00 three ways and you get $3.333…, three of which sum to $9.999…. A cent vanishes. Every split function returns an integer array whose sum is *exactly* the total, with a documented, deterministic remainder rule (see §4).

### 2.5 Multi-currency without exchange rates

Each expense carries its own currency. Balances are tracked and displayed **per currency** — "you owe Sam €20 and R150" — with no automatic conversion. This is exactly what Splitwise does, and it avoids the whole problem of which day's FX rate applies to a debt that's three months old. A group has a default currency for convenience only.

### 2.6 Mobile-first UI from the first commit

Bottom tab navigation, thumb-reachable primary actions, full-screen sheets instead of centered desktop modals. Adopt **shadcn/ui** — Tailwind-based, components are copied into the repo rather than installed as a dependency, so they can be tuned freely. This is not polish for later; a desktop-shaped UI retrofitted to mobile is the most common reason a wrapped web app gets rejected from the App Store.

### 2.7 Soft deletes

`deleted_at` on expenses and settlements. Splitwise lets you restore a deleted expense and shows deletions in the activity feed; both need the row to survive.

### 2.8 Constrain a value only when it changes what the program does

The default is free text. A dropdown of someone else's words is a small insult to the user, and every fixed list becomes a migration the first time reality doesn't fit it.

**Free text, user-defined, or optional:** group label, settlement method (and it can be left blank), note categories, expense categories (seeded defaults plus your own), document titles.

**Constrained, deliberately:** `expenses.split_type`, because its value selects which split function runs. `recurrence_rules.frequency`, because its value selects which date calculation runs. `group_members.role`, because its value decides who may delete other people's things. `friendships.status`, because it gates whether a connection is active. In each of these a typo is a bug rather than a label, which is exactly the line: constrain behaviour, never vocabulary.

---

## 3. Data model

Full DDL sketch for the consolidated baseline migration. Replaces all 20 files currently in `supabase/migrations/`.

### 3.1 Identity — with placeholder people

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
  currency       char(3) not null default 'ZAR',
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

### M0 — Foundation *(target: today, ~2h)*

1. Create a new Supabase project; save credentials.
2. Delete all 20 files in `supabase/migrations/`, replace with a single `00001_baseline.sql`.
3. Seed categories. Create storage buckets: `avatars` (public), `receipts` (private), `documents` (private).
4. Generate `database.types.ts` from the live schema — deletes the hand-written file and removes the need for the `as never` casts scattered through every insert.
5. Wire env vars locally and in Vercel (`vercel login` first — the CLI is logged out and 10 major versions behind).
6. Install `@supabase/ssr`, `zod`, `date-fns`, `vitest`, `@playwright/test`; init shadcn/ui.
7. Add `middleware.ts` and cookie-based auth.
8. GitHub Actions: typecheck, lint, unit tests, RLS tests on every push.

**Exit criteria:** `npm run dev` boots, signup works end-to-end, CI is green, production deploy is live.

### M1 — The core splitter *(target: today, ~4-5h — this is the "I can cancel Splitwise" bar)*

- Auth: email/password + password reset (port existing), plus magic link.
- Profiles: display name, avatar, default currency.
- Friends: add by email or username; placeholder people added by name alone.
- Groups: create/join/leave, free-text label and icon, invite code, avatar.
- **Expense create/edit/delete**: description, amount, currency, date, category, payer(s) including multi-payer, and all five split types.
- **Multiple images per expense** — camera or library, compressed client-side, private bucket with signed URLs.
- Categories: seeded defaults plus user-created.
- **Balances**: overall dashboard ("you are owed R1,240 overall"), per-group, and pairwise per person.
- **Settle up**: record a payment, with the suggested amount pre-filled and a free-text method.
- Debt simplification toggle per group.
- Mobile-first shell with bottom tabs; **installable PWA** (manifest, icons, service worker).
- Full unit test suite over `src/core/`.

Image upload moved up from M2 — it's part of what makes an expense trustworthy when you're reconciling later, not a nice-to-have.

### M2 — Daily driver

Comments on expenses · activity feed · search and filter (by person, category, date range, amount) · recurring expense engine + Vercel cron · CSV export · monthly summaries and charts.

*Cut per your call: email notifications and debt-reminder nudges. The activity feed covers "what happened" without anything pestering anyone.*

### M3 — House-admin layer

Documents vault with signed URLs (lease agreements, inventories, warranties) · structured house info page (wifi, alarm code, landlord, bin day, meter readings) · notes revamp with free-text categories · presence · optional chore rotation.

### M4 — PWA hardening

Offline read cache · optimistic UI on expense creation · install prompts · Web Push for real events only (someone added an expense involving you, someone settled up) — opt-in, and never a reminder.

### M5 — App Store

Capacitor shell around the app (see §7) · native push, camera, haptics, share sheet · App Store and Play Store submission.

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

### 6.1 Unit tests — `src/core/` (Vitest)

The highest-value tests in the project, and they need no database.

- Every split type: sums exactly to the total, for adversarial amounts (1 cent among 7 people, R0.03 among 4, huge values, 2-person, 20-person).
- Remainder distribution is deterministic and fair.
- Percent splits that don't sum to 100 are rejected; exact splits that don't sum to the total are rejected.
- Balance netting: a closed loop of expenses and settlements returns everyone to zero.
- Pairwise allocation sums to the net balance for every person.
- Debt simplification preserves every net balance and never increases the transaction count.
- Recurrence: month-end handling (31 Jan + 1 month), leap years, DST boundaries.

Property-based tests where it pays: generate random expense sets, assert the invariant that all balances sum to zero.

### 6.2 Integration tests — services against a local database

`supabase start` gives a real Postgres in Docker. Test the service layer for real: create expense → participants written correctly → invariant trigger holds → balance view returns the expected numbers. Includes concurrent-edit and soft-delete-restore paths.

### 6.3 RLS policy tests — the security suite

For every table, assert as an authenticated non-member that SELECT returns zero rows and INSERT/UPDATE/DELETE are rejected. Explicitly cover: a user outside a group cannot read its expenses, cannot join without a valid invite code, cannot edit someone else's expense, cannot read another house's documents, and cannot escalate themselves to admin. These run in CI on every push and are the reason we can be relaxed about the client holding an anon key.

### 6.4 End-to-end — Playwright

The critical journeys: sign up → create a house → invite → add an expense with an uneven split → verify both people see the correct balance → settle up → verify zero. Plus the non-group friend flow, and a mobile-viewport pass.

### 6.5 CI

GitHub Actions on every push: typecheck → lint → unit → integration + RLS (against a Supabase service container) → Playwright on PRs. Vercel preview deploy per branch.

---

## 7. The App Store path

This changes decisions today, so it's worth being direct about the tradeoff.

**Recommendation: ship the PWA now, wrap it with Capacitor for the App Store in M5, keep `src/core/` framework-free as insurance.**

Capacitor puts the existing web app in a native shell — one codebase, weeks not months. The risk is **Apple App Store Guideline 4.2 (Minimum Functionality)**: a thin webview wrapper around a website gets rejected. The mitigations are things we want regardless, which is why they're baked into the plan from M1:

- A genuinely mobile-native-feeling UI (bottom tabs, sheets, gestures) rather than a responsive desktop layout — §2.6.
- Real native capability use: push notifications, camera for receipt capture, haptics, share sheet, biometric unlock.
- App-shell assets bundled in the binary rather than every screen loaded from the network.

There's one real architectural tension to name: Capacitor either bundles a static export (which would cost us Server Components and Server Actions) or loads the hosted URL (which is what Apple scrutinises). The service-layer decision in §2.3 defuses this — because every mutation is also reachable as a plain HTTP Route Handler, a bundled or native client can call the same server logic without a rewrite.

If Capacitor proves too limiting, the fallback is Expo/React Native, which reuses `src/core/`, the Supabase schema and the `/api` routes, leaving only the UI layer to rebuild. That fallback only stays cheap if §2.2 and §2.3 are honoured from the start — which is the argument for doing them now rather than later.

---

## 8. Decisions made for you (flag anything you'd change)

1. **One generic groups table, no type enum, no feature gating** — every group can do everything, and `label` is free text. *(Revised from the first draft at your request; you were right.)*
2. **Per-currency balances, no FX conversion** — Splitwise's approach, avoids stale-exchange-rate arguments.
3. **Profiles decoupled from `auth.users`** so placeholder people can be split with before they sign up. Bigger change than it looks, but retrofitting it later would touch every expense row.
4. **Staying on Next.js 15 / React 18** for now. Next 16 and React 19 are an optional later upgrade; not worth the risk today.
5. **shadcn/ui** for components, so M1 has a decent-looking mobile UI without hand-rolling everything.
6. **Magic-link sign-in added alongside email/password** — materially lower friction when inviting family who won't want another password.
7. **Free text by default, constrained only where the value drives behaviour** — see §2.8 for the line and why three columns stay on the constrained side of it.
8. **Multiple images per expense via `expense_images`**, replacing the single `receipt_url` column, in a private bucket with signed URLs.

## 9. Honest note on timing

M0 plus M1 in one afternoon is ambitious. M0 and the expense/balance/settle-up core are realistic; the parts most likely to slip past today are the rarer split types (shares, adjustment), pairwise-balance UI polish, and debt simplification. If time runs short I'll ship equal + exact splits with correct balances and settle-up — that alone replaces Splitwise for most real use — and finish the rest immediately after. I'll flag it as it happens rather than at the end.
