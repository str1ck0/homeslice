-- ---------------------------------------------------------------------------
-- A payment is a ledger entry, not a silent adjustment.
--
-- Settling up already moved everyone's balance, but the row that did it was
-- invisible: no screen listed it, opened it, edited it or undid it. So the
-- friend you paid saw their R2,223.16 quietly disappear with nothing anywhere
-- saying you had paid it, or when, or how. That is the one thing this app must
-- never do — a balance nobody can explain is worse than no balance at all.
--
-- Recording a payment and adding an expense are the same act seen from two
-- sides, so they get the same rules:
--
--   * either party may edit or undo it, not only whoever typed it in (the
--     20260813 shared-expense reasoning applies unchanged — the person who was
--     paid is exactly as entitled to correct the amount as the person paying);
--   * every add, edit and undo is recorded in an append-only table, so a
--     payment can be changed but never changed quietly.
-- ---------------------------------------------------------------------------

-- --- 1. Reaching a settlement ----------------------------------------------

-- SECURITY DEFINER for the same reason can_access_expense is: the events
-- policy below needs to ask about the settlement, and asking directly from a
-- policy would re-enter the settlements policy.
create or replace function public.can_access_settlement(target_settlement uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.settlements s
     where s.id = target_settlement
       and (
         s.from_profile = public.current_profile_id()
         or s.to_profile = public.current_profile_id()
         or s.created_by = public.current_profile_id()
         or (s.group_id is not null and s.group_id in (select public.my_group_ids()))
       )
  );
$$;

-- --- 2. Either party may correct or undo it ---------------------------------

drop policy if exists settlements_update on public.settlements;

create policy settlements_update on public.settlements
  for update to authenticated
  using (
    from_profile = public.current_profile_id()
    or to_profile = public.current_profile_id()
    or created_by = public.current_profile_id()
    or (group_id is not null and public.is_group_admin(group_id))
  )
  with check (
    from_profile = public.current_profile_id()
    or to_profile = public.current_profile_id()
    or created_by = public.current_profile_id()
    or (group_id is not null and public.is_group_admin(group_id))
  );

drop policy if exists settlements_delete on public.settlements;

-- Undo is a soft delete (an update of deleted_at), so this hard-delete policy
-- is a backstop rather than the path the app takes. Kept in step with update so
-- the two cannot disagree.
create policy settlements_delete on public.settlements
  for delete to authenticated
  using (
    from_profile = public.current_profile_id()
    or to_profile = public.current_profile_id()
    or created_by = public.current_profile_id()
    or (group_id is not null and public.is_group_admin(group_id))
  );

-- --- 3. The record ----------------------------------------------------------

create table public.settlement_events (
  id            uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  actor_id      uuid not null references public.profiles(id),
  kind          text not null,
  -- Already-formatted lines: "Amount changed from R2,223.16 to R7,500.00".
  -- Written by the service, not a trigger, because saying it in money needs the
  -- currency formatting the rest of the app uses, and that lives in TypeScript
  -- next to the tests that pin it.
  changes       text[] not null default '{}',
  created_at    timestamptz not null default now(),
  constraint settlement_event_kind check (kind in ('added', 'updated', 'deleted', 'restored'))
);

create index settlement_events_settlement_idx
  on public.settlement_events(settlement_id, created_at);

alter table public.settlement_events enable row level security;

-- Readable by anyone who can see the payment it belongs to — which, by the
-- select policy on settlements, means both people in it.
create policy settlement_events_select on public.settlement_events
  for select to authenticated
  using (public.can_access_settlement(settlement_id));

-- Writable only as yourself, and only about a payment you can reach. There is
-- deliberately no update or delete policy: the history is append-only.
create policy settlement_events_insert on public.settlement_events
  for insert to authenticated
  with check (
    actor_id = public.current_profile_id()
    and public.can_access_settlement(settlement_id)
  );

comment on table public.settlement_events is
  'Append-only record of who recorded, edited or undid a payment, and what changed.';

notify pgrst, 'reload schema';
