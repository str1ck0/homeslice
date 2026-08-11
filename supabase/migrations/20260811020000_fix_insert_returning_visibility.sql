-- ============================================================================
-- Make INSERT ... RETURNING work for rows you have just created.
--
-- Postgres evaluates the SELECT policy on rows returned by RETURNING. The
-- group SELECT policy was "visible if you are a member", but when create_group
-- inserts the group the creator is not a member yet — the membership row is
-- written on the following line. So the insert itself succeeded and the
-- RETURNING was refused, with an error that misleadingly blames the WITH CHECK.
--
-- The old schema hit this exact wall three times (006_fix_house_insert_policy,
-- 008_fix_houses_insert_simple, 010_fix_houses_insert_for_real). The durable
-- fix is to say what we actually mean: you can always see a group you created,
-- and you can always see your own membership rows.
-- ============================================================================

drop policy if exists groups_select on public.groups;

create policy groups_select on public.groups
  for select to authenticated
  using (
    id in (select public.my_group_ids())
    -- Covers the RETURNING of a freshly created group, before the creator's
    -- membership row exists.
    or created_by = public.current_profile_id()
  );

drop policy if exists group_members_select on public.group_members;

create policy group_members_select on public.group_members
  for select to authenticated
  using (
    group_id in (select public.my_group_ids())
    -- my_group_ids() is STABLE and may be evaluated from a snapshot taken
    -- before this row existed, so name the self case explicitly.
    or profile_id = public.current_profile_id()
  );

notify pgrst, 'reload schema';
