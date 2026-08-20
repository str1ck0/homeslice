# Databases — which one you are talking to

_Set up 20 August 2026._

There are two. **Development is a Supabase stack running on this machine.
Production is the hosted project real people use.** Everything in this repo
defaults to the local one; reaching production is something you type on
purpose.

Before this existed, all four checkouts pointed at production. Integration
tests ran against it — which is why the live project has thirteen profiles
behind four real logins — and a migration applied from any worktree hit the
database serving the app.

---

## Day to day

```bash
supabase start                 # once per boot, from the main checkout
npm run dev                    # main checkout, port 3000
npm test                       # unit, no database
npm run test:integration       # hits the local stack, ~2s
```

`supabase start` is only needed once. All four checkouts share the one stack —
worktrees isolate code, never data.

| Service | URL |
| --- | --- |
| API | http://127.0.0.1:54321 |
| Postgres | postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| Studio | http://127.0.0.1:54323 |
| Mailpit — every email the app sends | http://127.0.0.1:54324 |

The anon and service-role keys in `.env.local` are the standard local demo
keys. They are identical on every machine that has ever run Supabase locally
and they authenticate nothing beyond 127.0.0.1. Do not treat them as secrets,
and do not be alarmed that they are legible.

## Signing in locally

Four seeded logins, all `password123`:

| Email | Name | Notes |
| --- | --- | --- |
| devin@homeslice.test | Devin | the one to sign in as; in the group, owed money |
| ada@homeslice.test | Ada | in the group, owes money |
| bo@homeslice.test | Bo | in the group |
| cleo@homeslice.test | Cleo | not in the group, exactly settled up |

Magic links work too — they land in Mailpit at :54324 rather than a real inbox.
Note that `supabase auth admin generate_link` produces an *implicit-flow* link
whose token arrives in the URL fragment, and `/auth/callback` expects a PKCE
`?code=`. Use the app's own "Email me a link" and take the link out of Mailpit.

## Resetting

```bash
supabase db reset
```

Drops the database, replays every migration in order, then applies
`supabase/seed.sql`. Takes about twenty seconds and is the normal way to undo
an experiment. Nothing in the local database is worth keeping.

Run it from the **main checkout**. The agent worktrees are branched from an
older commit and do not have `supabase/config.toml` or the seed until they
rebase onto master.

## The seed

`supabase/seed.sql` — invented people, invented money, nothing copied from
production. The shapes in it are chosen rather than arbitrary: two currencies
inside one group, two payers on one expense, all five split types, a backdated
expense, a soft-deleted expense, a soft-deleted payment, an edited expense with
a real change record, and a friend who is exactly settled up. Between them they
cover every case this app has previously got wrong.

If you build something that needs a new shape, add it to the seed rather than
typing it in by hand. The value of a seed is that `db reset` gives every agent
the same interesting database.

## Running against production on purpose

Rare, and it should feel rare.

```bash
cp .env.local .env.local.bak      # main checkout only
cp .env.prod.local .env.local
npm run dev
mv .env.local.bak .env.local      # and put it back
```

`.env.prod.local` holds the hosted credentials. Next.js does not load that
filename under any `NODE_ENV`, which is the point — `.env.production.local`
would be picked up by a local `next build` and quietly bake production into a
client bundle.

Read-only questions do not need any of that:

```bash
./scripts/db-query.sh --prod "select count(*) from expenses;"
```

## The guards, and what they are guarding against

**`npm run test:integration` refuses to run against anything but 127.0.0.1**
unless `I_REALLY_MEAN_PRODUCTION=yes` is set. These tests create users, write
rows, and probe RLS by attempting things that are supposed to fail. Against the
hosted project they did all of that to real records.

**`scripts/db-query.sh` defaults to local** and prints a line naming the project
before it touches production. It used to default to production with no way to
say otherwise.

Neither guard stops a determined mistake. They exist so that the careless path
is the safe one.

## Migrations

Write the file into `supabase/migrations/`, then:

```bash
supabase db reset          # local: replays everything from zero, including yours
npm run test:integration   # local: proves RLS still holds
```

Replaying from zero is the part that matters. It is how
`20260820000000_explicit_grants.sql` was found: the thirteen migrations before
it did not grant `anon` or `authenticated` a single privilege on a single
table, and every one of them worked in production anyway, because production
had picked up those grants from how it was built. A rebuild from the migration
files alone produced an app that could not read its own tables — and reported
it as a permissions error that looks exactly like an RLS bug.

**Production's migration history was adopted on 20 August.**
`supabase_migrations.schema_migrations` now exists there with all fourteen
versions recorded, matching local exactly. Before that it did not exist at all
— every migration had been applied by hand through the Management API — so
`supabase db push` would have tried to replay everything from scratch.

`statements` is null on those fourteen rows, deliberately: they were not
applied by the CLI, and the one table meant to be the record should not claim
otherwise. The CLI compares on `version`, which is what matters.

**The CLI cannot connect to production passwordlessly, and this is not fixable
from here.** `supabase link` succeeds, but any command that actually opens a
connection (`migration list --linked`, `db push`) first tries to refresh a
`cli_login_postgres` role and fails:

```
permission denied to alter role
Only roles with the CREATEROLE attribute and the ADMIN option on role
"cli_login_postgres" may alter this role.
```

That role was created on 2 December 2025 and has been expired since. It was
granted by `supabase_admin` **without admin option for `postgres`**:

| role_granted | granted_to | admin_option | grantor |
| --- | --- | --- | --- |
| postgres | cli_login_postgres | false | supabase_admin |

The Management API runs as `postgres`, which has `CREATEROLE` but is not
superuser — so under PostgreSQL 16+ rules it can neither alter nor drop that
role. Only `supabase_admin` can, and nothing in this repo reaches it. Fixing it
properly means Supabase support, or recreating the project.

Use the password path instead, which skips the login-role bootstrap:

```bash
supabase migration list --linked -p '<database password>'
supabase db push --linked -p '<database password>' --dry-run
```

Or apply to production the way everything so far has been:

```bash
./scripts/db-query.sh --prod -f supabase/migrations/<file>.sql
./scripts/db-diff.sh                                # confirm local still matches
npx supabase gen types typescript --project-id zwnhbhymjaqjpuxfcbam > src/types/database.types.ts
```

Note the CLI upgrade moved where link state lives: 2.62 wrote
`supabase/.temp/linked-project.json`, 2.115 reads `supabase/.temp/project-ref`.
Both are present now.

## Proving local still matches production

```bash
./scripts/db-diff.sh
```

Asks both databases the same introspection question and diffs the answers.
Silence means the migration files reproduce production exactly. Read-only
against both. Worth running after any migration lands on production.

762 objects, identical, on 20 August: columns, policies, indexes, functions,
triggers, constraints, **privileges**, storage buckets and storage policies.
Privileges are in there because the first version of this check left them out
and cheerfully reported "identical" about a local database the app could not
read a single table from.

## Backups

```bash
./scripts/backup-prod.sh
```

Writes every row of production's public schema as JSON to
`~/homeslice-backups/<timestamp>/`, outside the repo so it cannot be committed
by accident. Passwordless, through the Management API.

It is a safety net, not a restorable dump: no `auth.users`, no storage objects,
no schema. For one of those you need the database password and
`supabase db dump --linked -f dump.sql`.

**This is the only backup that exists.** Checked in the dashboard on 20 August:
the project is on the Free plan, and *"Free Plan does not include project
backups"* — no scheduled backups, no point-in-time recovery. Nothing is
catching a mistake except this script, so run it before anything that writes to
production, and occasionally when nothing is happening at all.

Finding the settings that say so, since the dashboard has moved them: they are
under **Database → Backups** in the left sidebar, not Project Settings. Same
for the database password, which lives under **Database → Settings** and is not
viewable after creation — only resettable.
