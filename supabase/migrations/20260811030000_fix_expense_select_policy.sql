-- ============================================================================
-- Stop the expenses SELECT policy from looking itself up.
--
-- expenses_select called can_access_expense(id), which re-queries public.expenses.
-- A row inserted by the *current* command is not visible to a subquery running
-- under that command's snapshot, so when create_expense did
-- `insert ... returning id`, the policy could not see the row it was being
-- asked about and denied it.
--
-- A row-level policy should be expressed in terms of the row's own columns
-- wherever possible. Group membership and created_by are both available
-- directly on the row, and only the participant check needs a lookup — which
-- reads a *different* table, so no self-reference and no snapshot problem.
-- ============================================================================

create or replace function public.is_expense_participant(target_expense uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.expense_participants ep
     where ep.expense_id = target_expense
       and ep.profile_id = public.current_profile_id()
  );
$$;

drop policy if exists expenses_select on public.expenses;

create policy expenses_select on public.expenses
  for select to authenticated
  using (
    -- Evaluated against the row's own columns, so a freshly inserted row is
    -- visible to its own RETURNING clause.
    created_by = public.current_profile_id()
    or (group_id is not null and group_id in (select public.my_group_ids()))
    or public.is_expense_participant(id)
  );

drop policy if exists expenses_update on public.expenses;

create policy expenses_update on public.expenses
  for update to authenticated
  using (
    created_by = public.current_profile_id()
    or (group_id is not null and public.is_group_admin(group_id))
  )
  with check (
    created_by = public.current_profile_id()
    or (group_id is not null and public.is_group_admin(group_id))
  );

notify pgrst, 'reload schema';
