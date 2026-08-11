-- ============================================================================
-- Atomic expense writes.
--
-- supabase-js sends each insert as a separate HTTP request, so writing an
-- expense and then its participants would be two transactions. If the second
-- failed we would be left with an expense that has no participants — an
-- expense that exists but cannot be balanced or attributed to anyone.
--
-- These functions do both inserts in one transaction. Split maths still lives
-- in TypeScript (src/core/split.ts) where it is unit-tested; the caller passes
-- the already-computed rows in and Postgres guarantees they land together.
--
-- SECURITY INVOKER (the default) so RLS still applies to every statement.
-- ============================================================================

create or replace function public.create_expense(
  p_group_id      uuid,
  p_description   text,
  p_amount_cents  bigint,
  p_currency      char(3),
  p_expense_date  date,
  p_split_type    text,
  p_category_id   uuid,
  p_note          text,
  p_participants  jsonb
)
returns uuid
language plpgsql
as $$
declare
  new_expense_id uuid;
  me uuid;
begin
  me := public.current_profile_id();
  if me is null then
    raise exception 'You need to be signed in to add an expense';
  end if;

  insert into public.expenses (
    group_id, created_by, description, amount_cents, currency,
    expense_date, split_type, category_id, note
  )
  values (
    p_group_id, me, p_description, p_amount_cents, p_currency,
    coalesce(p_expense_date, current_date), p_split_type, p_category_id, p_note
  )
  returning id into new_expense_id;

  insert into public.expense_participants (
    expense_id, profile_id, paid_cents, owed_cents, split_weight
  )
  select
    new_expense_id,
    (row->>'profile_id')::uuid,
    coalesce((row->>'paid_cents')::bigint, 0),
    coalesce((row->>'owed_cents')::bigint, 0),
    nullif(row->>'split_weight', '')::numeric
  from jsonb_array_elements(p_participants) as row;

  -- The deferred invariant trigger fires here, at commit: if payments or
  -- shares do not total the expense amount, the whole thing rolls back.
  return new_expense_id;
end;
$$;

create or replace function public.update_expense(
  p_expense_id    uuid,
  p_description   text,
  p_amount_cents  bigint,
  p_currency      char(3),
  p_expense_date  date,
  p_split_type    text,
  p_category_id   uuid,
  p_note          text,
  p_participants  jsonb
)
returns uuid
language plpgsql
as $$
begin
  -- Replace the participant set wholesale. Simpler and less error-prone than
  -- diffing, and the deferred trigger judges the final state at commit.
  delete from public.expense_participants where expense_id = p_expense_id;

  insert into public.expense_participants (
    expense_id, profile_id, paid_cents, owed_cents, split_weight
  )
  select
    p_expense_id,
    (row->>'profile_id')::uuid,
    coalesce((row->>'paid_cents')::bigint, 0),
    coalesce((row->>'owed_cents')::bigint, 0),
    nullif(row->>'split_weight', '')::numeric
  from jsonb_array_elements(p_participants) as row;

  update public.expenses
     set description  = p_description,
         amount_cents = p_amount_cents,
         currency     = p_currency,
         expense_date = coalesce(p_expense_date, expense_date),
         split_type   = p_split_type,
         category_id  = p_category_id,
         note         = p_note
   where id = p_expense_id;

  if not found then
    raise exception 'Expense not found, or you do not have permission to edit it';
  end if;

  return p_expense_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Creating a placeholder person and adding them to a group in one step.
--
-- SECURITY DEFINER because the caller needs to insert a profile row for
-- somebody else, which the profiles policy deliberately does not allow in
-- general. Scoped tightly: it can only ever create an unclaimed placeholder,
-- and only in a group the caller actually belongs to.
-- ---------------------------------------------------------------------------

create or replace function public.add_placeholder_member(
  p_group_id     uuid,
  p_display_name text,
  p_email        text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
  new_profile_id uuid;
begin
  me := public.current_profile_id();
  if me is null then
    raise exception 'You need to be signed in';
  end if;

  if p_group_id is not null
     and not exists (
       select 1 from public.group_members
        where group_id = p_group_id and profile_id = me and left_at is null
     )
  then
    raise exception 'You are not a member of that group';
  end if;

  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'A name is required';
  end if;

  insert into public.profiles (display_name, email, created_by)
  values (trim(p_display_name), nullif(trim(p_email), ''), me)
  returning id into new_profile_id;

  if p_group_id is not null then
    insert into public.group_members (group_id, profile_id, role)
    values (p_group_id, new_profile_id, 'member');
  end if;

  return new_profile_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Creating a group and making the creator its first admin, atomically.
-- ---------------------------------------------------------------------------

create or replace function public.create_group(
  p_name     text,
  p_label    text default null,
  p_icon     text default null,
  p_currency char(3) default 'ZAR',
  p_address  text default null
)
returns uuid
language plpgsql
as $$
declare
  me uuid;
  new_group_id uuid;
begin
  me := public.current_profile_id();
  if me is null then
    raise exception 'You need to be signed in to create a group';
  end if;

  insert into public.groups (name, label, icon, currency, address, created_by)
  values (trim(p_name), nullif(trim(p_label), ''), p_icon, p_currency,
          nullif(trim(p_address), ''), me)
  returning id into new_group_id;

  insert into public.group_members (group_id, profile_id, role)
  values (new_group_id, me, 'admin');

  return new_group_id;
end;
$$;
