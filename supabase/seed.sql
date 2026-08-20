-- ---------------------------------------------------------------------------
-- Development seed. Runs after every `supabase db reset`, local stack only.
--
-- Invented people, invented money. Nothing here is copied from production and
-- nothing should be: this database is reset on a whim, several agents share
-- it, and its service-role key sits in four .env.local files. Real financial
-- records have no business in it.
--
-- The shapes below are chosen, not arbitrary. Between them they cover every
-- case the app has ever got wrong: two currencies inside one group, a split
-- with two payers, all five split types, a backdated expense, a soft-deleted
-- expense and a soft-deleted payment, an edited expense with a real change
-- record, and a friend who is exactly settled up. If you add a feature that
-- needs a new shape, add it here rather than typing it in by hand — the point
-- of a seed is that `db reset` gives everyone the same interesting database.
--
-- Every login is <name>@homeslice.test with the password "password123".
-- ---------------------------------------------------------------------------

-- --- 1. People --------------------------------------------------------------
-- Inserting into auth.users fires handle_new_auth_user, which creates the
-- profile. The identities row is what makes password sign-in work; without it
-- GoTrue accepts the user but refuses the login.

create or replace function pg_temp.seed_user(p_email text, p_name text)
returns uuid language plpgsql as $$
declare
  new_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    p_email, crypt('password123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    json_build_object('display_name', p_name)::jsonb,
    '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    new_id::text, new_id,
    json_build_object('sub', new_id::text, 'email', p_email, 'email_verified', true)::jsonb,
    'email', now(), now(), now()
  );

  return new_id;
end;
$$;

select pg_temp.seed_user('devin@homeslice.test', 'Devin');
select pg_temp.seed_user('ada@homeslice.test',   'Ada');
select pg_temp.seed_user('bo@homeslice.test',    'Bo');
select pg_temp.seed_user('cleo@homeslice.test',  'Cleo');

-- Fixed profile ids so tests and hand-written SQL can name a person. Nothing
-- references profiles yet at this point, so the renumbering is free.
update public.profiles set id = '11111111-1111-4111-8111-111111111111', default_currency = 'EUR'
 where email = 'devin@homeslice.test';
update public.profiles set id = '22222222-2222-4222-8222-222222222222', default_currency = 'EUR'
 where email = 'ada@homeslice.test';
update public.profiles set id = '33333333-3333-4333-8333-333333333333', default_currency = 'EUR'
 where email = 'bo@homeslice.test';
update public.profiles set id = '44444444-4444-4444-8444-444444444444', default_currency = 'ZAR'
 where email = 'cleo@homeslice.test';

-- profile_a < profile_b is a check constraint, and the ids above are ordered.
insert into public.friendships (profile_a, profile_b) values
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'),
  ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333'),
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444'),
  ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');

-- --- 2. A group -------------------------------------------------------------

insert into public.groups (id, name, label, currency, invite_code, created_by) values
  ('55555555-5555-4555-8555-555555555555', 'Lisbon 2026', 'trip', 'EUR', 'LISBON',
   '11111111-1111-4111-8111-111111111111');

insert into public.group_members (group_id, profile_id, role) values
  ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222', 'member'),
  ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333', 'member');

-- --- 3. Expenses ------------------------------------------------------------
-- Amounts are integer cents and every split sums to its total exactly. If you
-- edit one, check the arithmetic: nothing validates a seed.

create or replace function pg_temp.seed_expense(
  p_id uuid, p_group uuid, p_by uuid, p_description text, p_cents bigint,
  p_currency text, p_days_ago int, p_split text, p_category text,
  p_deleted boolean default false
) returns uuid language plpgsql as $$
begin
  insert into public.expenses (
    id, group_id, created_by, description, amount_cents, currency,
    category_id, expense_date, split_type, deleted_at
  ) values (
    p_id, p_group, p_by, p_description, p_cents, p_currency,
    (select id from public.categories where name = p_category),
    current_date - p_days_ago, p_split,
    case when p_deleted then now() - interval '2 hours' else null end
  );
  return p_id;
end;
$$;

-- Equal, one payer. The ordinary case.
select pg_temp.seed_expense('a0000001-0000-4000-8000-000000000001',
  '55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111',
  'Airbnb, three nights', 42000, 'EUR', 9, 'equal', 'Travel');
insert into public.expense_participants (expense_id, profile_id, paid_cents, owed_cents) values
  ('a0000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 42000, 14000),
  ('a0000001-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 0, 14000),
  ('a0000001-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 0, 14000);

-- Shares 2:1:1, with the odd cents landing on the two largest fractions.
select pg_temp.seed_expense('a0000002-0000-4000-8000-000000000002',
  '55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333',
  'Groceries for the flat', 6743, 'EUR', 8, 'shares', 'Groceries');
insert into public.expense_participants (expense_id, profile_id, paid_cents, owed_cents, split_weight) values
  ('a0000002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 0, 3371, 2),
  ('a0000002-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 0, 1686, 1),
  ('a0000002-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 6743, 1686, 1);

-- Two payers. The service handles this; the create form does not, and the edit
-- form refuses rather than flattening it. Keep one around to test that refusal.
select pg_temp.seed_expense('a0000003-0000-4000-8000-000000000003',
  '55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111',
  'Dinner at Ramiro', 12000, 'EUR', 7, 'exact', 'Dining out');
insert into public.expense_participants (expense_id, profile_id, paid_cents, owed_cents) values
  ('a0000003-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 8000, 4000),
  ('a0000003-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 4000, 4000),
  ('a0000003-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 0, 4000);

-- A second currency inside the same group. There is a test for this; there
-- should be a fixture for it too.
select pg_temp.seed_expense('a0000004-0000-4000-8000-000000000004',
  '55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222',
  'Airport transfer', 45000, 'ZAR', 6, 'equal', 'Transport');
insert into public.expense_participants (expense_id, profile_id, paid_cents, owed_cents) values
  ('a0000004-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 0, 15000),
  ('a0000004-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 45000, 15000),
  ('a0000004-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333', 0, 15000);

-- Percent: 50 / 25 / 25.
select pg_temp.seed_expense('a0000005-0000-4000-8000-000000000005',
  '55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111',
  'Museum tickets', 3000, 'EUR', 5, 'percent', 'Entertainment');
insert into public.expense_participants (expense_id, profile_id, paid_cents, owed_cents, split_weight) values
  ('a0000005-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 3000, 1500, 50),
  ('a0000005-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 0, 750, 25),
  ('a0000005-0000-4000-8000-000000000005', '33333333-3333-4333-8333-333333333333', 0, 750, 25);

-- Edited after the fact, with the change record to match.
select pg_temp.seed_expense('a0000006-0000-4000-8000-000000000006',
  '55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333',
  'Wine shop', 4400, 'EUR', 4, 'equal', 'Groceries');
insert into public.expense_participants (expense_id, profile_id, paid_cents, owed_cents) values
  ('a0000006-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 0, 1467),
  ('a0000006-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222', 0, 1467),
  ('a0000006-0000-4000-8000-000000000006', '33333333-3333-4333-8333-333333333333', 4400, 1466);

-- Backdated: dated last week, entered this morning. This is the case that made
-- Recent stop sorting by expense_date — the balance moves and, ordered by the
-- date on the expense, nothing visible moves with it.
select pg_temp.seed_expense('a0000007-0000-4000-8000-000000000007',
  '55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222',
  'Pastéis de Belém', 950, 'EUR', 6, 'equal', 'Dining out');
insert into public.expense_participants (expense_id, profile_id, paid_cents, owed_cents) values
  ('a0000007-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 0, 317),
  ('a0000007-0000-4000-8000-000000000007', '22222222-2222-4222-8222-222222222222', 950, 317),
  ('a0000007-0000-4000-8000-000000000007', '33333333-3333-4333-8333-333333333333', 0, 316);

-- Soft-deleted, so Recent has something struck through to draw.
select pg_temp.seed_expense('a0000008-0000-4000-8000-000000000008',
  '55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111',
  'Taxi (entered twice)', 2500, 'EUR', 3, 'equal', 'Transport', true);
insert into public.expense_participants (expense_id, profile_id, paid_cents, owed_cents) values
  ('a0000008-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 2500, 834),
  ('a0000008-0000-4000-8000-000000000008', '22222222-2222-4222-8222-222222222222', 0, 833),
  ('a0000008-0000-4000-8000-000000000008', '33333333-3333-4333-8333-333333333333', 0, 833);

-- Outside any group: a straight split between two friends. Adjustment split —
-- equal, except Ada took the better seat and R100 of it with her.
select pg_temp.seed_expense('a0000009-0000-4000-8000-000000000009',
  null, '11111111-1111-4111-8111-111111111111',
  'Concert tickets', 90000, 'ZAR', 12, 'adjustment', 'Entertainment');
insert into public.expense_participants (expense_id, profile_id, paid_cents, owed_cents, split_weight) values
  ('a0000009-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111', 90000, 40000, 0),
  ('a0000009-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222', 0, 50000, 10000);

select pg_temp.seed_expense('a000000a-0000-4000-8000-00000000000a',
  null, '22222222-2222-4222-8222-222222222222',
  'Coffee', 700, 'EUR', 2, 'equal', 'Dining out');
insert into public.expense_participants (expense_id, profile_id, paid_cents, owed_cents) values
  ('a000000a-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 0, 350),
  ('a000000a-0000-4000-8000-00000000000a', '22222222-2222-4222-8222-222222222222', 700, 350);

-- Cleo's only expense, settled to the cent below, so the friends list has a
-- "settled up" row and not only debts.
select pg_temp.seed_expense('a000000b-0000-4000-8000-00000000000b',
  null, '11111111-1111-4111-8111-111111111111',
  'Lunch', 24000, 'ZAR', 14, 'equal', 'Dining out');
insert into public.expense_participants (expense_id, profile_id, paid_cents, owed_cents) values
  ('a000000b-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111', 24000, 12000),
  ('a000000b-0000-4000-8000-00000000000b', '44444444-4444-4444-8444-444444444444', 0, 12000);

-- --- 4. Payments ------------------------------------------------------------

insert into public.settlements
  (id, group_id, from_profile, to_profile, amount_cents, currency, method, settled_on, created_by, deleted_at)
values
  ('b0000001-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555',
   '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   20000, 'EUR', 'EFT', current_date - 1, '22222222-2222-4222-8222-222222222222', null),
  ('b0000002-0000-4000-8000-000000000002', null,
   '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   30000, 'ZAR', 'cash', current_date - 3, '11111111-1111-4111-8111-111111111111', null),
  -- Settles Cleo exactly.
  ('b0000003-0000-4000-8000-000000000003', null,
   '44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111',
   12000, 'ZAR', 'SnapScan', current_date - 10, '44444444-4444-4444-8444-444444444444', null),
  -- Undone, so a struck-through payment has somewhere to appear too.
  ('b0000004-0000-4000-8000-000000000004', '55555555-5555-4555-8555-555555555555',
   '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
   5000, 'EUR', 'cash', current_date - 2, '33333333-3333-4333-8333-333333333333',
   now() - interval '5 hours');

-- --- 5. The record ----------------------------------------------------------
-- Recent activity orders on these, so their timestamps are what decides the
-- order of the dashboard rather than the dates above.

insert into public.expense_events (expense_id, actor_id, kind, changes, created_at) values
  ('a0000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'added', '{}', now() - interval '9 days'),
  ('a0000002-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'added', '{}', now() - interval '8 days'),
  ('a0000003-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'added', '{}', now() - interval '7 days'),
  ('a0000004-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'added', '{}', now() - interval '6 days'),
  ('a0000005-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'added', '{}', now() - interval '5 days'),
  ('a0000006-0000-4000-8000-000000000006', '33333333-3333-4333-8333-333333333333', 'added', '{}', now() - interval '4 days'),
  ('a0000006-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'updated',
   array['Amount changed from €38.00 to €44.00', 'Who paid changed'], now() - interval '90 minutes'),
  -- Dated six days back, entered this morning.
  ('a0000007-0000-4000-8000-000000000007', '22222222-2222-4222-8222-222222222222', 'added', '{}', now() - interval '3 hours'),
  ('a0000008-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 'added', '{}', now() - interval '3 days'),
  ('a0000008-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 'deleted', '{}', now() - interval '2 hours'),
  ('a0000009-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111', 'added', '{}', now() - interval '12 days'),
  ('a000000a-0000-4000-8000-00000000000a', '22222222-2222-4222-8222-222222222222', 'added', '{}', now() - interval '2 days'),
  ('a000000b-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111', 'added', '{}', now() - interval '14 days');

insert into public.settlement_events (settlement_id, actor_id, kind, changes, created_at) values
  ('b0000001-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'added', '{}', now() - interval '1 day'),
  ('b0000002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'added', '{}', now() - interval '3 days'),
  ('b0000003-0000-4000-8000-000000000003', '44444444-4444-4444-8444-444444444444', 'added', '{}', now() - interval '10 days'),
  ('b0000004-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333', 'added', '{}', now() - interval '2 days'),
  ('b0000004-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'deleted', '{}', now() - interval '5 hours');
