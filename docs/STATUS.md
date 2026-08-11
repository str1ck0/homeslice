# Homeslice — where things stand

_Last updated: 11 August 2026, end of first rebuild day._

**Live:** https://homeslice-liam-stricklands-projects.vercel.app
**Repo:** `master` at `7553ccd`, clean, pushed, auto-deploying from GitHub.
**Database:** Supabase project `zwnhbhymjaqjpuxfcbam` (eu-west-1), active.
**Tests:** 105 unit + 17 integration, all passing.

---

## What works today

The core Splitwise loop is done and has been used by two real people.

- **Auth** — password, magic link, password reset.
- **Friends** — add by username or email; people who haven't signed up become
  placeholders you can split with immediately and who inherit the history when
  they register. Sharing an expense auto-creates the friendship.
- **Usernames** — claimable on Account, case-insensitive, unique.
- **Groups** — create, join by invite code, free-text label, invite placeholders.
  No type enum: every group can do everything.
- **Expenses** — payer, five split types (equal, exact, percent, shares,
  adjustment) with a live preview, category, date, multiple photos, edit, delete.
- **Balances** — per person, per group, per currency, with breakdown lines
  ("you owe Sam R878.91 in Cape Town"). No currency conversion, ever.
- **Settle up** — from a group or a friend, with the outstanding amount
  pre-filled.
- **PWA** — installable, icons, safe-area handling, mobile-first bottom nav.

## What is deliberately not built

- **Activity feed.** Cut — you don't use Splitwise's.
- **Email notifications and debt reminders.** Cut on purpose.
- **Phone numbers.** Cut. Username is primary, email is the fallback.
- **Contacts picker.** `navigator.contacts` is Chrome-on-Android only; Safari
  has never shipped it, so on iOS it would be a button that does nothing.

## Next up, roughly in order

1. **Recurring expenses** — schema (`recurrence_rules`) and the date maths
   (`src/core/recurrence.ts`, tested) already exist. Needs a UI and a Vercel
   cron hitting a route that generates due expenses.
2. **Search and filter** on expenses.
3. **Multi-payer UI.** The service handles it; the form offers one payer and
   refuses to *edit* a multi-payer expense rather than silently flattening it.
4. **Hide settled-up friends and groups** behind a "show N settled" toggle.
5. **CI** — GitHub Actions running typecheck, lint, unit and RLS tests.
6. **House-admin layer** — documents vault (lease agreements), structured house
   info, notes revamp, presence.
7. **Comments, CSV export, charts.**
8. **App Store** via Capacitor. See §7 of the implementation plan.

---

## Things worth knowing before changing anything

**Money is integer cents everywhere.** Never floats. All split maths lives in
`src/core/`, is framework-free, and is where the real test coverage is. If you
change how a split works, the tests there are the safety net.

**Balances are scoped by group.** `calculateScopedPairwiseDebts` keeps a debt
attributed to where it arose, so settling up in one group cannot discharge a
debt from another. There's a test for exactly that.

**RLS is a real security boundary**, not decoration — the browser holds an anon
key and talks to Postgres directly. `src/server/__tests__/rls.integration.test.ts`
asserts a non-member can't read or write anything. Run it after touching any
policy: `npm run test:integration`.

**Two RLS traps already hit, twice each — don't re-introduce them:**
1. `INSERT ... RETURNING` fails if the SELECT policy can't see the new row.
   Policies must cover the row's own creator.
2. A SELECT policy must not re-query its own table via a function; a row
   inserted by the current command is invisible to that subquery.

**Applying migrations:** `./scripts/db-query.sh -f supabase/migrations/<file>.sql`.
It reads the Supabase token from the macOS keychain, so there's no password
anywhere. Regenerate types afterwards:
`npx supabase gen types typescript --project-id zwnhbhymjaqjpuxfcbam > src/types/database.types.ts`

**`vercel ls` lags.** It has twice shown no deployment when one existed. Trust
the API (`/v6/deployments`) instead — Git auto-deploy does work.

**Node 20 is aging.** supabase-js warns it's deprecated and needs a WebSocket
shim in tests. Vercel runs Node 22+, so production is fine.

**Old deployments are public.** Deployment protection is off, so every past
deployment — including December's — is reachable at its immutable URL. They'll
error against the new schema. Worth deleting at some point.

**Supabase Site URL** must point at the production alias, not a specific
deployment. It was pinned to a December build, which is why password reset
landed on the old app.

## Accounts

Four real logins exist: `liam.strickland96@gmail.com` (@stricko),
`lisbethpurrucker@gmail.com` (@lizzardwizzard), `howzit@gooi.me` (Kiki),
`bookings@wezlew.com` (Wezlew). Profiles were backfilled after the rebuild.
