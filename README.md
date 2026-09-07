# Homeslice

A self-hosted expense splitter, built to replace Splitwise due to its free-tier limits. It is in daily use, and the expense
history in it is real money.

The interesting parts are not the features — there are plenty of Splitwise
clones. They are the places where getting it *nearly* right is worse than not
building it, and this README leads with those, because they are what the code
is actually about.

---

## What it does

- **Expenses** with five split types — equally, exact amounts, percentages,
  shares, and plus/minus adjustments — and any number of payers per expense.
- **Balances** per person, per group, per currency. No currency conversion,
  ever: a trip through Portugal and Spain runs in as many currencies as it runs
  in, and a stale exchange rate applied to a three-month-old debt is a fight
  waiting to happen.
- **Settling up**, from a group or a friend, with the outstanding amount filled
  in.
- **Groups** — invite codes, free-text labels, join, leave, rename, delete —
  and expenses that belong to no group at all, for a straight split between two
  people.
- **Receipts**, as many photos per expense as you like, compressed in the
  browser and stored privately behind signed URLs.
- **Shared editing with an append-only record.** Anyone in an expense may
  correct it; nobody may edit the record of having corrected it.
- **Search and filter** across every list, and **restore** for a deleted
  expense or payment.
- **Installable PWA** — mobile-first, bottom nav, safe-area handling.

## What it deliberately does not do

Written down because "not built yet" and "decided against" are different
things, and a reader cannot tell them apart from the outside.

No email notifications or debt reminders. No phone numbers — your display name
is how people find you, and email is only for signing in. No activity feed as
its own screen; what exists instead is a Recent list ordered by when somebody
last *touched* a thing rather than by the date written on it, because
backdating an expense used to move a balance with nothing visible moving
alongside it. And no placeholder people: a profile without a login could never
be reunited with its owner, so using Homeslice means having an account.

`docs/STATUS.md` has the full list, with the reasoning behind each.

---

## Five decisions worth reading the code for

**Money is integer cents, everywhere.** Never floats. Split `$10.00` three ways
in JavaScript and you get three of `3.333…`, which sum to `9.999…`; a cent
vanishes and the expense no longer balances. Every split function in
`src/core/split.ts` returns an integer array summing to *exactly* the total,
with a documented remainder rule — one cent each to the first N participants,
ordered by profile id, so it is deterministic rather than merely close. The
tests cover a single cent split among seven people.

**Never format money or dates with `toLocaleString`.** Node and Chrome disagree:
`en-ZA` renders 123450 cents as `R1,234.50` under Node and `R 1 234,50` in
Chrome, so the same expense rendered on the server and in the browser is a
hydration mismatch. `src/core/money.ts` and `src/core/time.ts` assemble the
strings by hand. This was found three separate times, each in a file sitting
next to a hand-rolled formatter whose comment explained why not to.

**A relative time in a client component needs the server's clock passed in.**
"2 hours ago" is computed once during the server render and again on hydration.
A row that crosses a boundary in between — "59 min ago", then "an hour ago" — is
a mismatch caused by nothing but time passing. The same class of bug as the
above, arrived at from a different direction.

**RLS is a real security boundary, not decoration.** The browser holds an anon
key and talks to Postgres directly, so every policy is the only thing standing
between a user and somebody else's financial history. There is an integration
suite that asserts a non-member can read nothing and write nothing. Two traps
are written down in `docs/STATUS.md` after being hit twice each — chiefly that
`INSERT … RETURNING` fails when the SELECT policy cannot see the new row.

**Expense history is append-only, and that is a product decision.** Anyone in an
expense may change it, because Sam telling you the beers were €5 and not €3
should not mean asking Sam to go and fix it. The record of who changed what has
select and insert policies and deliberately no update or delete. The app is a
ledger, not an auditor: if somebody edits to cheat a friend, that is a problem
between them, and a visible one.

---

## Stack

Next.js 15 (App Router, Server Components, Server Actions) · React 18 ·
TypeScript · Tailwind · Supabase (Postgres, Auth, Storage, RLS) · Vercel.

Domain logic lives in `src/core/` as pure TypeScript — no React, no Next, no
Supabase imports. That is where the real test coverage is, and it is what would
port unchanged to a native client.

```
src/core/       split, balances, money, time, payers, search, recurrence
src/server/     services, Zod-validated, wrapped thinly by Server Actions
supabase/       migrations and a development seed
docs/           STATUS.md (what exists), DATABASE.md (which database)
```

## Running it

Development runs against a local Supabase stack in Docker. Nothing points at
production without a deliberate flag.

```bash
supabase start     # once per boot; needs Docker running
npm install
npm run dev
```

`supabase/seed.sql` creates four invented people and a deliberately awkward set
of expenses — two currencies in one group, a two-payer split, all five split
types, a backdated entry, a soft-deleted expense and a soft-deleted payment.
Every login is `<name>@homeslice.test` with the password `password123`.

```bash
npm test                   # unit, over src/core
npm run typecheck
npm run test:integration    # against the local stack, ~2s
```

A green typecheck has repeatedly meant nothing in this repo. The integration
suite and a browser are what count.

---

## Status

Built and in daily use. The Splitwise core is done; recurring expenses, CSV
export, charts and the house-admin layer are not. `docs/STATUS.md` is the
honest account of what exists, what was cut, and why — it outranks
`docs/IMPLEMENTATION_PLAN.md`, which is a record of the original design and is
marked where reality diverged from it.

## Licence

No licence granted. Public so it can be read, not so it can be reused.
