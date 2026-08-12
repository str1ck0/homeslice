# Homeslice — where things stand

_Last updated: 12 August 2026._

**Live:** https://homeslice-liam-stricklands-projects.vercel.app
**Repo:** `master`, clean.
**Database:** Supabase project `zwnhbhymjaqjpuxfcbam` (eu-west-1), active.
**Tests:** 105 unit + 45 integration, all passing.

---

## What works today

The core Splitwise loop is done and has been used by two real people.

- **Auth** — password, magic link, password reset.
- **Identity** — one name per person, and it does both jobs: what everyone sees
  and what someone types to add you. Unique, ignoring case and extra spaces, so
  two people can never look identical in a group. Spaces and capitals are fine —
  "Liam Strickland", "Liam S" and "Stricko" are all valid. Changeable on Account,
  where a clash says "Stricko is taken" rather than a database error.
- **Friends** — add by name. Everyone has an account: there are no placeholder
  people, and a name that belongs to nobody is a miss rather than a new profile.
  Sharing an expense auto-creates the friendship.
- **Groups** — create, rename, join by invite code, free-text label, add
  friends, remove members, leave, delete. No type enum: every group can do
  everything, and no currency either — a group runs in as many currencies as
  your trip does.
- **Expenses** — payer, five split types (equal, exact, percent, shares,
  adjustment) with a live preview, category, date, multiple photos, edit, delete.
- **Balances** — per person, per group, per currency, with breakdown lines
  ("you owe Sam R878.91 in Cape Town"). No currency conversion, ever.
- **Settle up** — from a group or a friend, with the outstanding amount
  pre-filled.
- **Photos** — people and groups have avatars, compressed and centre-cropped
  square in the browser before upload. Expenses carry as many receipt photos as
  you like. Replacing or removing a photo deletes the file it replaced.
- **PWA** — installable, icons, safe-area handling, mobile-first bottom nav.

## What is deliberately not built

- **Activity feed.** Cut — you don't use Splitwise's.
- **Email notifications and debt reminders.** Cut on purpose.
- **Phone numbers.** Cut. Your name is how people find you; email is only for
  signing in.
- **Contacts picker.** `navigator.contacts` is Chrome-on-Android only; Safari
  has never shipped it, so on iOS it would be a button that does nothing.
- **Placeholder people.** Removed on 12 August. A profile without a login could
  only be reunited with its owner by an email recorded when it was created, and
  the form made that email optional — so anyone added by name alone could never
  claim their history. Using Homeslice now means having an account. The cost,
  stated plainly: you cannot record a split with someone until they have signed
  up, so on a trip everyone installs before the first dinner goes in.

## Undo — done

Daily use was blocked less by missing features than by the fact that nothing
structural could be corrected once entered. That whole cluster is now closed:
groups can be **renamed** and **deleted**, members **removed**, groups **left**,
friends **removed**, and your **display name and default currency** edited.

Removing anyone is refused while they are unsettled, in that group or with you.
That check lives in the service layer, not in SQL, so the money maths stays in
`src/core` where it is tested — it is a guard against an honest mistake, and RLS
is what actually decides who may write the row. Removal sets `left_at` rather
than deleting: expenses and the balances that came from them survive.

Leaving as the last admin promotes the longest-standing remaining member, so a
group can never end up with nobody able to rename or delete it.

## Next up

1. **Search and filter** on expenses — the first thing that hurts once a group
   has fifty of them.
2. **Hide settled-up friends and groups** behind a "show N settled" toggle.
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
and the settle form; `AuthForm` and `reset-password` still have the pattern,
deliberately, because a repeat there is idempotent or harmless.

**A successful Server Action that redirects has not navigated yet** when its
promise settles. Leave the button disabled rather than restoring it, or it comes
back to life over a page that is still loading.

**Two image buckets, two different rules — a deliberate split, agreed on
12 August.**

`receipts` and `documents` are **private**. Members reach a receipt through
`/api/expense-images/[id]`, which checks access as the signed-in user and then
mints a ten-minute signed URL with the service role. A receipt shows what you
bought and where you were, and a lease agreement is worse, so neither may sit
behind a guessable public URL.

`avatars` is **public**. The reasoning, so nobody has to re-derive it: avatars
appear dozens to a page in member and friend lists, and routing each through a
signed-URL redirect would cost an extra request per face on exactly the screens
that need to feel instant. What holds instead is that paths are unguessable
UUIDs under the uploader's auth id, and writes are restricted to your own
folder. The exposure is real but small — someone who obtains a URL can view
that photo, and it stays viewable until the file is replaced or removed.

The line between them is sensitivity, not convenience: a face someone chose to
show the people they split with, versus a record of where they were and what
they spent. If that judgement ever changes, avatars can move behind the same
route receipts use; the picker and the storage layout would not need to.

Before 12 August every avatar **write** policy was scoped to the bucket alone —
including the two named "own" — so any signed-in user could overwrite or delete
anybody's photo. Two integration tests now hold that line.

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

Four real logins exist: `liam.strickland96@gmail.com`, `lisbethpurrucker@gmail.com`,
`howzit@gooi.me`, `bookings@wezlew.com` — named stricko, lizzardwizzard, Kiki and
Wezlew. Those names are now the identity: unique, and what you type to add
someone. Profiles were backfilled after the rebuild.

No groups exist; the nineteen accidental "Euro 26" duplicates were deleted on
12 August. Two non-group expenses exist between stricko and lizzardwizzard.
