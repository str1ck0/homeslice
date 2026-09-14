# Homeslice — where things stand

_Last updated: 1 September 2026._

**Live:** https://homeslice-liam-stricklands-projects.vercel.app
**Repo:** `master`, plus three agent worktrees at `../homeslice-worktrees/`.
**Databases:** local Supabase stack for development; hosted project
`zwnhbhymjaqjpuxfcbam` (eu-west-1) for production. See `docs/DATABASE.md`.
**Tests:** 159 unit + 65 integration, all passing (integration local, ~2s).

---

## What works today

The core Splitwise loop is done and has been used by two real people.

- **Auth** — password, magic link, password reset.
- **Identity** — one name per person, and it does both jobs: what everyone sees
  and what someone types to add you. Unique, ignoring case and extra spaces, so
  two people can never look identical in a group. Spaces and capitals are fine —
  "Liam Strickland", "Liam S" and "Stricko" are all valid. Changeable on Account,
  where a clash says "Stricko is taken" rather than a database error.
- **Friends** — add by name, and they accept. Everyone has an account: there
  are no placeholder people, and a name that belongs to nobody is a miss rather
  than a new profile. Adding someone sends a request (since 14 September); until
  they accept, nobody can put them in an expense or a payment, which the
  database enforces rather than the form. Asking someone who already asked you
  accepts. Sharing an expense still befriends the other people in it.
  Nobody can read anyone else's email address through the API.
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
  square in the browser before upload; a group can be given its photo on the
  create form or later under settings. Expenses carry as many receipt photos
  as you like. Replacing or removing a photo deletes the file it replaced.
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

Two M1 items remain unbuilt: **user-created categories** (the seeded ones
exist, adding your own does not) and the **debt-simplification toggle**
(`groups.simplify_debts` is read at settle-up but nothing writes it). The
**multi-payer UI** shipped on 1 September — see below.

**M2 — Daily driver: started sideways.** The plan's activity feed was cut, then
partly arrived anyway as the per-expense record and the Recent activity list on
the dashboard, which is as much feed as this app seems to want. Search and
filter shipped on 31 August, along with restoring a deleted expense or payment.
Recurring expenses, CSV export and charts are untouched. Comments on expenses
are untouched, though `expense_events` is now the obvious place to hang them.

**M3 (house-admin) and M4 (PWA hardening): untouched, and now deferred behind
M5.**

**M5 (App Store): the current priority.** See Next up.

### The plan was rewritten on 1 September

It used to be stale in four places and this section listed them. They are now
marked **REVERSED** in the plan itself, in the sections they belong to —
placeholder people and usernames (§3.1), a group's currency (§3.2), and
shadcn/ui (§2.6) — so there is no longer a list of corrections to carry in your
head while reading it.

Two things the rewrite turned up that were not previously written down anywhere:

- **§2.3 was only half built.** The service layer is real and every Server
  Action is a thin wrapper over it, but the Route Handler adapter was never
  written: `src/app/api/` holds one route, and it serves signed URLs for receipt
  images. No mutation is reachable over HTTP. The separation was the expensive
  part and it held, so this is now a task rather than a rewrite — but it is on
  the critical path for a native client.
- **`recurrence_rules` has no RLS policies at all.** Nothing reads or writes the
  table yet, so nothing is exposed today. It has to be fixed before anything
  does.

## Done on 1 September

**The multi-payer UI.** The service always handled several payers; the form
offered one, and rather than flatten a multi-payer expense down to its first
payer on save — quietly changing what everyone owed — it refused to edit one at
all. "Who paid?" in More options now has a **More than one paid** toggle: tick
whoever put money in, type what each of them put, and a running line underneath
says what is still unaccounted for or how far over the payments have gone. One
payer stays a dropdown and is never asked for an amount, because a sole payer
paid the total by definition.

The parsing and the adding-up live in `src/core/payers.ts` with tests, for the
same reason the split maths does: it decides what goes into
`expense_participants.paid_cents`, so it is money logic.

**Anyone in an expense can edit it — the edit page now agrees.** The detail page
had offered Edit to any participant since 13 August, and the RLS policy has
allowed it since then too, but `expenses/[id]/edit` still checked authorship
alone. A participant who was not the creator got an Edit button that bounced
them straight back to the expense. The page now applies the same
participant-or-creator rule the policy does, and that `settlements/[id]/edit`
already applied to a payment.

**The record now describes a change to what each payer put in.** Found while
testing the above: `describeChanges` compared only the *set* of payers, so
moving €80/€40 to €70/€50 between the same two people changed every balance on
the expense and appended nothing to the history. Until the form could edit a
multi-payer expense that change could not be made through the UI at all — so
enabling the UI is what made the gap reachable. `describeChanges` is now
exported and unit-tested, because an edit it fails to describe is an edit that
vanishes.

## Done since 20 August

**Search and filter** on all three lists — home, friend and group — and
**restore a deleted expense or payment**. Both shipped 31 August.

Matching lives in `src/core/search.ts` with tests, because it turned out to
have rules rather than being an `.includes()` call: words match from their
start (a substring search for "bo" matched "Lis**bo**n" and returned the whole
trip) and accents fold both ways, so "pasteis" finds "Pastéis de Belém". On a
trip through Portugal and Spain that second one is most of the descriptions.

Filtering is client-side over rows the page already loaded — all three pages
fetch everything anyway to compute balances. `LedgerList` is the one component;
the honest limit is written next to it, and the shape of the fix if it is ever
hit is a `.textSearch()` in the service rather than a rewrite.

Production is also **backed up daily** now, by a launchd agent — the Free plan
includes no scheduled backups and no point-in-time recovery, so the JSON
snapshot really is the only copy.

## Next up

**The App Store was considered and deferred on 1 September**, over the $99 a
year. It recurs, and a delisted app is a dead link on a CV at the worst
possible moment. This is a personal-use and portfolio project: four people who
already have it installed as a PWA, and readers who click a URL. §7 of the plan
is kept for if that changes.

1. **In-app account deletion.** Was an App Store gate (Guideline 5.1.1(v)) and
   survives the deferral on its own merit — see below, and note that it cannot
   be a delete.
2. **Optimistic UI on expense creation.** The one piece of "PWA hardening" the
   four people using this would actually feel.
3. **A custom domain** — `homeslice.liamstrickland.dev`. The distribution is a
   URL that works forever plus a PWA that installs to a home screen.

**A privacy policy has moved down**, not off. It was a submission artefact and
went with the submission.

**Account deletion is not a delete.** History here is append-only, shared, and
other people's balances are computed from it: if a profile vanishes, every
expense it was part of loses a participant, the `SUM(paid) = SUM(owed) = amount`
invariant breaks on those rows, and three other people's balances silently
change to numbers that were never true. Apple wants the account gone, not the
ledger falsified. The shape that satisfies both is the one leaving a group
already uses — sever the login, tombstone the person, keep the rows.
`profiles.auth_user_id` is already nullable and already decoupled from
`auth.users`; the decoupling that lost its purpose when placeholder people were
removed is exactly what this needs. The unsettled-balance guard applies too: you
cannot walk away from money that is owed.

Worth doing before submitting rather than after: **Playwright** over the
critical journeys and **CI**. Review is days per round trip, so a typo caught by
a reviewer costs a week.

Deferred behind all of that, in rough order: **hide settled-up friends and
groups** behind a "show N settled" toggle · **user-created categories** ·
**debt-simplification toggle** · **multi-payer UI** · **comments on expenses**
(hang them off `expense_events`) · **recurring expenses** (schema and date maths
in `src/core/recurrence.ts` are done and tested; needs UI, a cron route, and RLS
policies — the table has none) · **house-admin layer** · **CSV export and
charts**.

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
`src/core/time.ts` holds `MONTH_ABBR`, `formatDayMonth`, `formatLongDate`,
`formatFullDate` and `formatRelativeTime`; nothing calls `toLocaleDateString`.
`ExpenseRow` did, then the expense and settlement detail pages did — each one
found later than the last, each sitting next to a hand-rolled formatter whose
comment explained why not to.

**A relative time inside a client component needs the server's clock passed
in.** "2 hours ago" is computed once during the server render and again on
hydration; if the row crosses a boundary in between — "59 min ago" then "an
hour ago" — that is a hydration mismatch caused by nothing but time passing.
`ExpenseRow` and `SettlementRow` take an optional `now`, and `LedgerList`
threads one down from the page. Server components can leave it out. This is the
same class of bug as `toLocaleString`, arrived at from a different direction,
and it is the reason Recent could not simply be dropped into a client component.

**A client-side search must cover everything loaded, not everything rendered.**
Recent shows thirty rows and loads far more; searching only the visible thirty
would have answered "nothing matches" about an expense two screens down, which
is worse than having no search. `LedgerList` truncates only when unfiltered.

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
