-- ---------------------------------------------------------------------------
-- Anyone in an expense can edit or delete it, and every change is recorded.
--
-- The old rule — only the person who typed it in, or a group admin — does not
-- match how people actually settle up. Sam tells you the beers were €5 and not
-- €3; you are both in the expense, you are both looking at the same number, and
-- having to ask the person who happened to enter it to go and fix it is
-- friction with no safety benefit. The app is a ledger, not an auditor: if
-- somebody edits an expense to cheat a friend, that is a problem between the
-- two of them, and one they can see, because:
--
-- `expense_events` keeps the receipt. Every add, edit and delete records who
-- did it and what changed, and it is append-only — no update or delete policy
-- exists, so a participant can rewrite the expense but never the history of
-- having done so. That is the honest trade: make correction easy, make it
-- impossible to do quietly.
-- ---------------------------------------------------------------------------

-- --- 1. Participants may edit and delete -----------------------------------

drop policy if exists expenses_update on public.expenses;

create policy expenses_update on public.expenses
  for update to authenticated
  using (
    created_by = public.current_profile_id()
    or public.is_expense_participant(id)
    or (group_id is not null and public.is_group_admin(group_id))
  )
  with check (
    created_by = public.current_profile_id()
    or public.is_expense_participant(id)
    or (group_id is not null and public.is_group_admin(group_id))
  );

drop policy if exists expenses_delete on public.expenses;

create policy expenses_delete on public.expenses
  for delete to authenticated
  using (
    created_by = public.current_profile_id()
    or public.is_expense_participant(id)
    or (group_id is not null and public.is_group_admin(group_id))
  );

-- --- 2. The record ----------------------------------------------------------

create table public.expense_events (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  actor_id    uuid not null references public.profiles(id),
  kind        text not null,
  -- Already-formatted lines: "Amount changed from €3.00 to €5.00". Written by
  -- the service rather than a trigger, because saying it in money needs the
  -- same currency formatting the rest of the app uses, and that lives in
  -- TypeScript next to the tests that pin it.
  changes     text[] not null default '{}',
  created_at  timestamptz not null default now(),
  constraint expense_event_kind check (kind in ('added', 'updated', 'deleted', 'restored'))
);

create index expense_events_expense_idx
  on public.expense_events(expense_id, created_at);

alter table public.expense_events enable row level security;

-- Readable by anyone who can see the expense it belongs to.
create policy expense_events_select on public.expense_events
  for select to authenticated
  using (public.can_access_expense(expense_id));

-- Writable only as yourself, and only about an expense you can reach. There is
-- deliberately no update or delete policy: the history is append-only.
create policy expense_events_insert on public.expense_events
  for insert to authenticated
  with check (
    actor_id = public.current_profile_id()
    and public.can_access_expense(expense_id)
  );

comment on table public.expense_events is
  'Append-only record of who added, edited or deleted an expense, and what changed.';

notify pgrst, 'reload schema';
