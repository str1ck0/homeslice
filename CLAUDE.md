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

Worktrees isolate code, never data. All four checkouts share the one local
stack, so `supabase db reset` and `npm run test:integration` still want one
agent at a time — but against a database that exists to be thrown away.

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

Ports: main checkout 3000, `agent-1` 3001, `agent-2` 3002, `agent-3` 3003.
Nothing configures these — pass `-p` at run time or two agents fight over 3000.

## Things that will bite you

- **Money is integer cents everywhere.** Never floats. All split maths lives in
  `src/core/`, is framework-free, and is where the real test coverage is.
- **Never format money or dates with `toLocaleString`/`toLocaleDateString`.**
  Node and Chrome disagree, and the same value rendered on the server and in
  the browser becomes a hydration mismatch. Use `src/core/money.ts` and
  `src/core/time.ts`, which assemble the strings by hand.
- **RLS is a real security boundary**, not decoration — the browser holds an
  anon key and talks to Postgres directly. Run the integration suite after
  touching any policy.
- **`setBusy(false)` is not a double-submit guard.** Use a `useRef`. Nineteen
  identical groups came from exactly this.
- **Expense and settlement history is append-only.** Anyone in an expense may
  change the expense; nobody may change the record of having changed it.

`docs/STATUS.md` has the longer list, with the reasoning behind each.
