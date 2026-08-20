# Homeslice — where things stand

_Last updated: 20 August 2026._

**Live:** https://homeslice-liam-stricklands-projects.vercel.app
**Repo:** `master`, plus three agent worktrees at `../homeslice-worktrees/`.
**Databases:** local Supabase stack for development; hosted project
`zwnhbhymjaqjpuxfcbam` (eu-west-1) for production. See `docs/DATABASE.md`.
**Tests:** 116 unit + 64 integration, all passing (integration now local, ~2s).

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
- **Shared editing** — anyone in an expense can edit or delete it, not just
  whoever typed it in, and every add, edit and delete is recorded on the expense
  with who did it and what changed. The record is append-only: a participant can
  correct the expense but cannot quietly rewrite the history of having done so.
  The reasoning, so it does not get "fixed" later: the app is a ledger, not an
  auditor. Sam telling you the beers were €5 and not €3 should not mean asking
  Sam to go and change it. If somebody edits to cheat a friend that is a problem
  between them — and a visible one.
- **Expenses** — adding one asks who it is with first, then the details:
  category, date, multiple photos, edit, delete. Who paid and how it splits are
  a single control, a sheet naming each common arrangement as a sentence with the
  money spelled out ("You paid, split equally — Sam owes you R411.50"), with the
  five split types and per-person tweaks behind "More options".
- **Balances** — per person, per group, per currency, with breakdown lines
  ("you owe Sam R878.91 in Cape Town"). No currency conversion, ever.
- **Settle up** — from a group or a friend, with the outstanding amount
  pre-filled.
- **Photos** — people and groups have avatars, compressed and centre-cropped
  square in the browser before upload. Expenses carry as many receipt photos as
  you like. Replacing or removing a photo deletes the file it replaced.
- **PWA** — installable, icons, safe-area handling, mobile-first bottom nav.

## What is deliberately not built

- **Activity feed as its own screen.** Still cut. What exists instead is
  Recent on the dashboard, which since 20 August is ordered by when somebody
  last touched a thing rather than by the date written on it. That ordering is
  not cosmetic: backdating an expense used to bury it below everything newer,
  so the balance moved and nothing visible moved with it, which reads as an
  arithmetic bug in the app. Deleted entries appear too, struck through and not
  clickable, for the same reason — a disappearing expense is the loudest
  unexplained balance change there is.
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

## Where this sits against the implementation plan

**M0 — Foundation: done, with three deliberate omissions.** Supabase project,
one baseline migration, seeded categories, three storage buckets, generated
types, cookie auth and middleware are all in place. Not done, and each is a
choice rather than an oversight: **shadcn/ui** was never adopted — the UI is
hand-rolled Tailwind and has not suffered for it; **Playwright** was never
installed, so there are no end-to-end tests; **GitHub Actions CI** does not
exist, so nothing runs on push but a person.

**M1 — The core splitter: effectively done.** Auth, profiles with avatars and a
default currency, friends, groups, expense create/edit/delete with all five
split types, multiple photos, per-currency balances, settle-up, mobile-first
PWA, and the unit suite over `src/core`. This is past the "I can cancel
Splitwise" bar and has been used by real people for two days.

Three M1 items remain unbuilt: **user-created categories** (the seeded ones
exist, adding your own does not), the **debt-simplification toggle**
(`groups.simplify_debts` is read at settle-up but nothing writes it), and the
**multi-payer UI** (the service handles several payers; the form offers one and
refuses to *edit* a multi-payer expense rather than flatten it silently).

**M2 — Daily driver: started sideways.** The plan's activity feed was cut, then
partly arrived anyway as the per-expense record and the Recent activity list on
the dashboard, which is as much feed as this app seems to want. Search and filter,
recurring expenses, CSV export and charts are untouched. Comments on expenses
are untouched, though `expense_events` is now the obvious place to hang them.

**M3 (house-admin), M4 (PWA hardening) and M5 (App Store): untouched.**

### Where the plan is now wrong

Read §3.1 and §8 of the implementation plan with these in mind — the code is
right and the plan is stale:

- **Placeholder people are gone** (12 August). The plan calls them essential;
  in practice the email-matching that made them claimable was optional at the
  point of creation, so the promise did not hold. Everyone has an account now.
- **Usernames are gone** (12 August). One unique display name does both jobs.
- **A group has no meaningful currency.** The column survives as a suggestion
  for the next expense; groups run in as many currencies as a trip does.
- **shadcn/ui was not used**, so §2.6's component decision never happened.

## Next up

1. **Search and filter** on expenses — the first thing that hurts once a group
   has fifty of them.
2. **Hide settled-up friends and groups** behind a "show N settled" toggle.
3. **Restore a deleted expense.** Deletion is already soft and recorded, and
   since 20 August a deleted expense is visible again — struck through, in
   Recent activity, saying who removed it and when. What it still has nowhere
   to go: `getExpense` filters `deleted_at is null`, so the row does not link
   anywhere and there is no screen to restore from. Splitwise puts a Restore
   button on exactly that struck-through card, and everything but the button
   now exists.

Then, in rough order: **user-created categories** · the **debt-simplification
toggle** · **multi-payer UI** · **comments on expenses** (hang them off
`expense_events`) · **recurring expenses** (schema and date maths in
`src/core/recurrence.ts` are done and tested; needs UI, a cron route, and RLS
policies — the table has none) · **CI** · **house-admin layer** · **CSV export
and charts** · **App Store** via Capacitor, see §7 of the plan.

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

**Expense history is append-only.** `expense_events` has select and insert
policies and deliberately no update or delete. Anyone in an expense may change
the expense; nobody may change the record of having changed it. If you add a way
to edit events, that guarantee is gone.

**Never format money with `toLocaleString`.** The runtime's locale data is not
the same everywhere: `en-ZA` renders 123450 cents as "R1,234.50" under Node and
"R 1 234,50" in Chrome, so the same expense looked different on a
server-rendered page and in a client component — and anything rendered both ways
risks a hydration mismatch. `formatCents` now assembles the string itself from
the integer cents: comma for thousands, full stop for decimals, symbol in front.
The money tests assert exact strings for that reason; the older ones checked
only that the output contained "234", which is how the drift went unnoticed.

**Dates are assembled by hand too, for the same reason as money.**
`src/core/time.ts` holds `MONTH_ABBR`, `formatDayMonth` and
`formatRelativeTime`; nothing in a list calls `toLocaleDateString`. `ExpenseRow`
did, and it was the last one — a server-rendered month name and a
browser-rendered one need not agree.

**Recent is sorted by `expense_events` / `settlement_events`, not by
`expense_date`.** `listRecentActivity` takes the newest event per row and
orders on that, falling back to the row's own `created_at` for anything written
before those tables existed (13 and 18 August). Sorting by the date on the
expense is what let a backdated entry move a balance invisibly. If you ever
make the record editable, this ordering becomes editable with it.

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

**There are two databases now, and development is the local one.** Set up
20 August; the whole story is in `docs/DATABASE.md`. Before that, all four
checkouts pointed at production and the integration suite wrote to it — which
is why the live project carries thirteen profiles behind four real logins.
`supabase start`, then `npm run dev`. `supabase db reset` replays every
migration from zero and applies `supabase/seed.sql`.

**The migrations did not describe production, and replaying them from zero is
what proved it.** Not one of the first thirteen granted `anon` or
`authenticated` a single privilege on a single table. Production has those
grants as a side effect of how it was built, so everything worked there; a
fresh database produced an app that could not read its own tables, reported as
a permissions error indistinguishable from an RLS bug.
`20260820000000_explicit_grants.sql` closes it, and `./scripts/db-diff.sh` now
compares 762 schema objects — privileges included — between local and
production.

**Production's migration history was adopted on 20 August**, along with the
grants migration itself (a proven no-op — 762 schema objects identical before
and after). `supabase_migrations.schema_migrations` now carries all fourteen
versions, matching local. `supabase db push` still needs a one-time
`supabase link`, which prompts for the database password.

Applying to production meanwhile:
`./scripts/db-query.sh --prod -f supabase/migrations/<file>.sql`, then
`./scripts/db-diff.sh`, then
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
