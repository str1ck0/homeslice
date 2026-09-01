# Homeslice

A Splitwise replacement, in daily use by four real people. Their expense
history is real money and cannot be regenerated.

## Read first

- `docs/STATUS.md` — what actually exists, and what was cut on purpose. It
  outranks `docs/IMPLEMENTATION_PLAN.md`, which is stale in several places and
  says so at the top.
- `docs/DATABASE.md` — which database you are talking to. Read it before
  running anything that writes.

## The database rule

**Development is the local Supabase stack. Production is the hosted project
real people use.** Two commands and you are running:

```bash
supabase start        # once per boot, from the main checkout
npm run dev
```

Everything defaults to local: `.env.local` in all four checkouts, the
integration suite, and `scripts/db-query.sh`. Production takes a deliberate
flag (`--prod`) or a deliberate file swap.

Do not point anything at production to "just check something". Read-only
questions have a supported path:

```bash
./scripts/db-query.sh --prod "select count(*) from expenses;"
```

Worktrees isolate code, never data — all four checkouts share the one local
stack. That is a database which exists to be thrown away, so the care needed is
coordination rather than caution: see **Sharing the machine with other agents**.

## Working here

```bash
npm test                   # unit, framework-free, no database
npm run typecheck
npm run test:integration   # local stack, ~2s
./scripts/db-diff.sh       # does local still match production?
```

A green typecheck has repeatedly meant nothing in this repo. Run the
integration suite, and open the app in a browser, before saying something
works.

## Sharing the machine with other agents

Several agents work here at once, in `../homeslice-worktrees/`. The worktrees
isolate code and nothing else: one Docker daemon, one Supabase stack, one set of
ports, one machine.

**Pass `-p` every time, and check which port you actually got.**

| checkout | port |
|---|---|
| main | 3000 |
| `agent-1` | 3001 |
| `agent-2` | 3002 |
| `agent-3` | 3003 |

Nothing configures these. The failure is quiet rather than loud — Next.js does
not stop when a port is taken, it moves over and mentions it once:

```
⚠ Port 3000 is in use by process 5609, using available port 3001 instead.
```

Miss that line and you spend an afternoon browser-testing another agent's
checkout while believing it is yours. It has happened. Read the port back out of
the startup output before you trust anything you see in a browser.

**Docker has to be running before Supabase is.** If OrbStack is not up,
`supabase status` fails at a layer below Supabase and says so in its own terms:

```
failed to connect to the docker API at unix:///Users/…/docker.sock
```

That is "the daemon is not running", not "the stack is broken". `open -a
OrbStack`, wait for it, then `supabase start` from the main checkout.

**"The stack is down" is true for about a minute.** Another agent may have
started it since you looked, and `supabase start` is run once per boot, so the
agent who needs it is often not the agent who starts it. Re-run `supabase
status` before you conclude anything, and certainly before you build around it —
an agent recently wrote a throwaway route to render components without signing
in, against a stack that had been up and healthy for twenty minutes. If it is
genuinely down, start it or say so. Do not route around it silently.

**One agent at a time for `supabase db reset` and `npm run test:integration`.**
Both write to the shared local database. A reset in one worktree wipes the data
another agent is halfway through verifying against, and the seed comes back
without the state they were looking at. Say you are about to, or ask.

## Things that will bite you

- **Money is integer cents everywhere.** Never floats. All split maths lives in
  `src/core/`, is framework-free, and is where the real test coverage is.
- **Never format money or dates with `toLocaleString`/`toLocaleDateString`.**
  Node and Chrome disagree, and the same value rendered on the server and in
  the browser becomes a hydration mismatch. Use `src/core/money.ts` and
  `src/core/time.ts`, which assemble the strings by hand.
- **A relative time in a client component needs the server's `now` passed in.**
  "2 hours ago" is computed at render and again at hydration; a row that
  crosses a boundary between the two mismatches. `ExpenseRow`, `SettlementRow`
  and `LedgerList` all take a `now` for this.
- **Client-side search must filter everything loaded, not everything shown.** A
  list that truncates has to stop truncating while a query is active, or it
  reports "no matches" about a row that is simply further down.
- **RLS is a real security boundary**, not decoration — the browser holds an
  anon key and talks to Postgres directly. Run the integration suite after
  touching any policy.
- **`setBusy(false)` is not a double-submit guard.** Use a `useRef`. Nineteen
  identical groups came from exactly this.
- **Expense and settlement history is append-only.** Anyone in an expense may
  change the expense; nobody may change the record of having changed it.

`docs/STATUS.md` has the longer list, with the reasoning behind each.
