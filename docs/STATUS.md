# Homeslice — where things stand

_Last updated: 12 August 2026._

**Live:** https://homeslice-liam-stricklands-projects.vercel.app
**Repo:** `master` at `8eecbae`, clean.
**Database:** Supabase project `zwnhbhymjaqjpuxfcbam` (eu-west-1), active.
**Tests:** 105 unit + 29 integration, all passing.

---

## What works today

The core Splitwise loop is done and has been used by two real people.

- **Auth** — password, magic link, password reset.
- **Friends** — add by username or email; people who haven't signed up become
  placeholders you can split with immediately and who inherit the history when
  they register. Sharing an expense auto-creates the friendship.
- **Usernames** — claimable on Account, case-insensitive, unique.
- **Groups** — create, join by invite code, free-text label, add existing
  friends or new placeholders, delete. No type enum: every group can do
  everything, and no currency either — a group runs in as many currencies as
  your trip does.
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

## Next up — everything here is "you cannot undo a mistake"

Daily use is blocked less by missing features than by the fact that nothing
structural can be corrected once entered. Deleting a group was one of these and
is now fixed; the rest are the same shape and should go together.

1. **Remove a member from a group, and leave a group yourself.** `left_at`
   exists on `group_members` and is read everywhere; nothing ever writes it. Add
   the wrong person — or a typo'd placeholder — and they are in that group
   permanently.
2. **Rename a group.** No update path exists at all. "Euro 26" versus
   "Euro 2026" has to be fixed by deleting and starting over.
3. **Edit your profile.** Account shows your default currency as plain text and
   offers no way to change it, nor your display name, nor an avatar. Wrong
   default currency means every new expense starts wrong.
4. **Remove a friend.** `friendships` rows are only ever inserted.
5. **Search and filter** on expenses — the first thing that hurts once a group
   has fifty of them.
6. **Hide settled-up friends and groups** behind a "show N settled" toggle.

Then, in rough order: **user-created categories** · a **debt-simplification
toggle** (`groups.simplify_debts` is read at settle-up time but nothing sets it)
· **multi-payer UI** (the service handles it; the form offers one payer and
refuses to *edit* a multi-payer expense rather than silently flattening it) ·
**recurring expenses** (schema and date maths in `src/core/recurrence.ts` are
done and tested; needs UI, a cron route, and RLS policies — the table has none)
· **CI** · **house-admin layer** · **comments, CSV export, charts** ·
**App Store** via Capacitor, see §7 of the implementation plan.

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

`DELETE ... RETURNING` on `groups` was checked against the real database for the
same trap and is fine — the row is still visible to `groups_select` while it is
being deleted, which is what lets a refused delete be told apart from a
successful one. There's a test pinning that.

**`setBusy(false)` is not a double-submit guard.** State updates are
asynchronous, so a second submit fired before React re-renders reads the stale
value and goes through — and `disabled={busy}` only takes effect after that
re-render too. Nineteen identical "Euro 26" groups came from exactly this. Use a
`useRef`, which updates immediately. Fixed in the group form, the expense form
and the settle form; `AuthForm`, `reset-password`, `AddFriendButton` and
`UsernameField` still have the pattern, deliberately, because a repeat there is
idempotent or harmless.

**A successful Server Action that redirects has not navigated yet** when its
promise settles. Leave the button disabled rather than restoring it, or it comes
back to life over a page that is still loading.

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

There are currently **no groups** — the nineteen accidental "Euro 26" duplicates
were deleted on 12 August. Two non-group expenses exist between @stricko and
@lizzardwizzard.
