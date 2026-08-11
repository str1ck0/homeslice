-- ============================================================================
-- Homeslice baseline schema
--
-- Replaces the 19 incremental migrations archived in supabase/migrations_archive/.
-- Those were written against a schema that could not express "who paid", which
-- made balances impossible; rather than patch them forward, this is a clean
-- rebuild. The old data was test data and is dropped deliberately.
--
-- Money is always a whole number of minor units (cents) in a BIGINT. Never a
-- float, never NUMERIC with a scale we have to remember to respect.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Tear down the previous schema
-- ---------------------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists
  public.member_presence,
  public.notes_images,
  public.notes,
  public.expense_payments,
  public.expenses,
  public.house_members,
  public.houses,
  public.profiles
cascade;

drop function if exists public.user_is_house_member(uuid, uuid) cascade;
drop function if exists public.user_house_ids(uuid) cascade;
drop function if exists public.update_updated_at_column() cascade;
drop function if exists public.handle_new_user() cascade;

-- ---------------------------------------------------------------------------
-- 1. Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Short, unambiguous invite codes. Excludes 0/O/1/I/L so they can be read
-- aloud without confusion, and uses gen_random_bytes rather than random() so
-- codes are not predictable from one another.
create or replace function public.generate_invite_code()
returns text language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..8 loop
    result := result || substr(alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % length(alphabet)), 1);
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Identity
--
-- profiles is deliberately NOT keyed on auth.users. A profile can exist with
-- auth_user_id NULL: that is a "placeholder" person, someone added to a group
-- by name who has not signed up. They can be split with immediately, and when
-- they later register with a matching email the placeholder is claimed and
-- their whole history comes with them.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id               uuid primary key default gen_random_uuid(),
  auth_user_id     uuid unique references auth.users(id) on delete set null,
  username         text unique,
  display_name     text not null,
  email            text,
  avatar_url       text,
  default_currency char(3) not null default 'ZAR',
  -- Who added this person, when they are a placeholder.
  created_by       uuid references public.profiles(id) on delete set null,
  claimed_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint username_format check (username is null or username ~ '^[a-zA-Z0-9_.]{2,30}$')
);

create index profiles_auth_user_id_idx on public.profiles(auth_user_id);
create index profiles_email_lower_idx on public.profiles(lower(email));

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- The current user's profile id. Used by nearly every policy below, so it is
-- STABLE (evaluated once per statement) rather than VOLATILE.
create or replace function public.current_profile_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles where auth_user_id = auth.uid() limit 1;
$$;

-- On signup, claim a matching placeholder if one exists; otherwise create a
-- fresh profile. Doing this in a trigger rather than the app means a profile
-- always exists by the time the client gets its session back.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  placeholder_id uuid;
begin
  select id into placeholder_id
    from public.profiles
   where auth_user_id is null
     and email is not null
     and lower(email) = lower(new.email)
   order by created_at
   limit 1;

  if placeholder_id is not null then
    update public.profiles
       set auth_user_id = new.id,
           claimed_at   = now(),
           display_name = coalesce(new.raw_user_meta_data->>'display_name', display_name)
     where id = placeholder_id;
  else
    insert into public.profiles (auth_user_id, display_name, email)
    values (
      new.id,
      coalesce(
        nullif(new.raw_user_meta_data->>'display_name', ''),
        split_part(new.email, '@', 1)
      ),
      new.email
    );
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create table public.friendships (
  id         uuid primary key default gen_random_uuid(),
  profile_a  uuid not null references public.profiles(id) on delete cascade,
  profile_b  uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'accepted',
  created_at timestamptz not null default now(),
  -- Canonical ordering means a friendship can only ever be stored one way.
  constraint friendship_ordered check (profile_a < profile_b),
  constraint friendship_status check (status in ('pending', 'accepted', 'blocked')),
  unique (profile_a, profile_b)
);

create index friendships_a_idx on public.friendships(profile_a);
create index friendships_b_idx on public.friendships(profile_b);

-- ---------------------------------------------------------------------------
-- 3. Groups
--
-- One generic kind of group. There is no type enum and no feature gating:
-- every group can hold expenses, notes, documents and presence. `label` is
-- free text the creator writes ("Sharehouse", "Ski trip") and is never
-- branched on in code.
-- ---------------------------------------------------------------------------

create table public.groups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  label          text,
  icon           text,
  avatar_url     text,
  currency       char(3) not null default 'ZAR',
  invite_code    text unique not null default public.generate_invite_code(),
  address        text,
  simplify_debts boolean not null default false,
  created_by     uuid references public.profiles(id) on delete set null,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger groups_touch before update on public.groups
  for each row execute function public.touch_updated_at();

create table public.group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member',
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  constraint group_member_role check (role in ('admin', 'member')),
  unique (group_id, profile_id)
);

create index group_members_group_idx on public.group_members(group_id);
create index group_members_profile_idx on public.group_members(profile_id);

-- SECURITY DEFINER so policies on group_members can call it without the
-- policy recursing into the table it is protecting. This is the specific trap
-- that produced eight debug migrations in the previous schema.
create or replace function public.my_group_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select gm.group_id
    from public.group_members gm
   where gm.profile_id = public.current_profile_id()
     and gm.left_at is null;
$$;

create or replace function public.is_group_admin(target_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members
     where group_id = target_group
       and profile_id = public.current_profile_id()
       and role = 'admin'
       and left_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Categories — seeded defaults plus whatever users invent
-- ---------------------------------------------------------------------------

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  icon       text,
  color      text,
  -- NULL created_by means a system default, visible to everyone.
  created_by uuid references public.profiles(id) on delete cascade,
  -- NULL group_id means available everywhere, not just in one group.
  group_id   uuid references public.groups(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index categories_created_by_idx on public.categories(created_by);
create index categories_group_idx on public.categories(group_id);

-- ---------------------------------------------------------------------------
-- 5. Recurring expense rules
-- ---------------------------------------------------------------------------

create table public.recurrence_rules (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  -- The expense to clone, stored as the same shape the create service accepts.
  template   jsonb not null,
  frequency  text not null,
  interval   int not null default 1,
  next_run_on date not null,
  end_on     date,
  last_run_on date,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint recurrence_frequency check (
    frequency in ('daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')
  ),
  constraint recurrence_interval check (interval >= 1)
);

create index recurrence_due_idx on public.recurrence_rules(next_run_on) where active;

-- ---------------------------------------------------------------------------
-- 6. Expenses
--
-- group_id is NULLABLE. A null group is a non-group expense — a straight split
-- between friends with no group involved. That one nullable column is what
-- makes creating a group optional.
-- ---------------------------------------------------------------------------

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid references public.groups(id) on delete cascade,
  created_by    uuid not null references public.profiles(id),
  description   text not null,
  amount_cents  bigint not null check (amount_cents > 0),
  currency      char(3) not null,
  category_id   uuid references public.categories(id) on delete set null,
  expense_date  date not null default current_date,
  split_type    text not null default 'equal',
  note          text,
  recurrence_id uuid references public.recurrence_rules(id) on delete set null,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Constrained because the value selects which split function runs; a typo
  -- here is a bug, not a label.
  constraint expense_split_type check (
    split_type in ('equal', 'exact', 'percent', 'shares', 'adjustment')
  )
);

create index expenses_group_idx on public.expenses(group_id) where deleted_at is null;
create index expenses_date_idx on public.expenses(expense_date desc);
create index expenses_created_by_idx on public.expenses(created_by);

create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

-- One row per person per expense. paid_cents is what they put in, owed_cents
-- is their share. Net contribution is the difference, and multi-payer
-- expenses ("Sam covered R400, I covered R200") need no extra structure.
create table public.expense_participants (
  expense_id   uuid not null references public.expenses(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  paid_cents   bigint not null default 0,
  owed_cents   bigint not null default 0,
  -- The percentage or share count as entered, so editing round-trips.
  split_weight numeric,
  primary key (expense_id, profile_id)
);

create index expense_participants_profile_idx on public.expense_participants(profile_id);

create table public.expense_images (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  storage_path text not null,
  sort_order  int not null default 0,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index expense_images_expense_idx on public.expense_images(expense_id, sort_order);

-- The invariant that keeps balances meaningful: an expense's payments and its
-- shares must each add up to its total. Checked in the database rather than
-- trusted from the client. DEFERRABLE so a multi-row insert is judged once, at
-- commit, instead of failing on the first row.
create or replace function public.check_expense_balances()
returns trigger language plpgsql as $$
declare
  target_expense uuid;
  total_cents bigint;
  sum_paid bigint;
  sum_owed bigint;
begin
  target_expense := coalesce(new.expense_id, old.expense_id);

  select amount_cents into total_cents
    from public.expenses where id = target_expense;

  -- Expense itself was deleted; nothing left to balance.
  if total_cents is null then
    return null;
  end if;

  select coalesce(sum(paid_cents), 0), coalesce(sum(owed_cents), 0)
    into sum_paid, sum_owed
    from public.expense_participants
   where expense_id = target_expense;

  if sum_paid <> total_cents then
    raise exception
      'Expense % does not balance: payments total % but the expense is %',
      target_expense, sum_paid, total_cents;
  end if;

  if sum_owed <> total_cents then
    raise exception
      'Expense % does not balance: shares total % but the expense is %',
      target_expense, sum_owed, total_cents;
  end if;

  return null;
end;
$$;

create constraint trigger expense_participants_balanced
  after insert or update or delete on public.expense_participants
  deferrable initially deferred
  for each row execute function public.check_expense_balances();

-- Changing the total has to re-check the same invariant.
create or replace function public.check_expense_total_balanced()
returns trigger language plpgsql as $$
declare
  sum_paid bigint;
  sum_owed bigint;
begin
  select coalesce(sum(paid_cents), 0), coalesce(sum(owed_cents), 0)
    into sum_paid, sum_owed
    from public.expense_participants
   where expense_id = new.id;

  -- No participants yet: the participant trigger will catch it at commit.
  if sum_paid = 0 and sum_owed = 0 then
    return null;
  end if;

  if sum_paid <> new.amount_cents or sum_owed <> new.amount_cents then
    raise exception
      'Expense % does not balance: payments %, shares %, total %',
      new.id, sum_paid, sum_owed, new.amount_cents;
  end if;

  return null;
end;
$$;

create constraint trigger expenses_total_balanced
  after update of amount_cents on public.expenses
  deferrable initially deferred
  for each row execute function public.check_expense_total_balanced();

-- SECURITY DEFINER breaks the policy cycle: the expenses policy needs to ask
-- about participants, and the participants policy needs to ask about expenses.
create or replace function public.can_access_expense(target_expense uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.expenses e
     where e.id = target_expense
       and (
         (e.group_id is not null and e.group_id in (select public.my_group_ids()))
         or exists (
           select 1 from public.expense_participants ep
            where ep.expense_id = e.id
              and ep.profile_id = public.current_profile_id()
         )
         or e.created_by = public.current_profile_id()
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. Settlements — money actually moving between two people
-- ---------------------------------------------------------------------------

create table public.settlements (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid references public.groups(id) on delete cascade,
  from_profile uuid not null references public.profiles(id),
  to_profile   uuid not null references public.profiles(id),
  amount_cents bigint not null check (amount_cents > 0),
  currency     char(3) not null,
  -- Free text and optional: "EFT", "cash", "SnapScan", or nothing at all.
  method       text,
  note         text,
  settled_on   date not null default current_date,
  created_by   uuid not null references public.profiles(id),
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint settlement_distinct_parties check (from_profile <> to_profile)
);

create index settlements_group_idx on public.settlements(group_id) where deleted_at is null;
create index settlements_from_idx on public.settlements(from_profile);
create index settlements_to_idx on public.settlements(to_profile);

-- ---------------------------------------------------------------------------
-- 8. Comments and activity
-- ---------------------------------------------------------------------------

create table public.expense_comments (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index expense_comments_expense_idx on public.expense_comments(expense_id);

create table public.activity_events (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid references public.groups(id) on delete cascade,
  actor_id      uuid references public.profiles(id) on delete set null,
  type          text not null,
  expense_id    uuid references public.expenses(id) on delete cascade,
  settlement_id uuid references public.settlements(id) on delete cascade,
  payload       jsonb,
  created_at    timestamptz not null default now()
);

create index activity_group_idx on public.activity_events(group_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 9. Group admin layer — notes, documents, presence
--
-- Available to every group, not gated behind a type.
-- ---------------------------------------------------------------------------

create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title      text not null,
  content    text not null default '',
  -- Free text: users pick their own vocabulary rather than ours.
  category   text,
  pinned     boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_group_idx on public.notes(group_id) where deleted_at is null;

create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

create table public.note_images (
  id           uuid primary key default gen_random_uuid(),
  note_id      uuid not null references public.notes(id) on delete cascade,
  storage_path text not null,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index note_images_note_idx on public.note_images(note_id, sort_order);

-- Lease agreements, inventories, warranties. Private bucket, signed URLs only.
create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  title        text not null,
  description  text,
  storage_path text not null,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index documents_group_idx on public.documents(group_id);

create table public.member_presence (
  group_id     uuid not null references public.groups(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  is_home      boolean not null default false,
  last_updated timestamptz not null default now(),
  primary key (group_id, profile_id)
);

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  keys       jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 10. Joining a group
--
-- Looking up a group by invite code has to work for someone who is not yet a
-- member, which a SELECT policy cannot express without exposing every group to
-- everyone. A SECURITY DEFINER function does the lookup and the insert as one
-- atomic, auditable operation instead.
-- ---------------------------------------------------------------------------

create or replace function public.join_group_by_code(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target_group uuid;
  me uuid;
begin
  me := public.current_profile_id();
  if me is null then
    raise exception 'You need to be signed in to join a group';
  end if;

  select id into target_group
    from public.groups
   where upper(invite_code) = upper(trim(code))
     and archived_at is null;

  if target_group is null then
    raise exception 'That invite code does not match any group';
  end if;

  insert into public.group_members (group_id, profile_id, role)
  values (target_group, me, 'member')
  on conflict (group_id, profile_id)
  do update set left_at = null;

  return target_group;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Row Level Security
--
-- The client holds an anon key and talks to Postgres directly, so these
-- policies are a real security boundary, not a formality. Every one of them is
-- covered by an automated test.
-- ---------------------------------------------------------------------------

alter table public.profiles             enable row level security;
alter table public.friendships          enable row level security;
alter table public.groups               enable row level security;
alter table public.group_members        enable row level security;
alter table public.categories           enable row level security;
alter table public.recurrence_rules     enable row level security;
alter table public.expenses             enable row level security;
alter table public.expense_participants enable row level security;
alter table public.expense_images       enable row level security;
alter table public.settlements          enable row level security;
alter table public.expense_comments     enable row level security;
alter table public.activity_events      enable row level security;
alter table public.notes                enable row level security;
alter table public.note_images          enable row level security;
alter table public.documents            enable row level security;
alter table public.member_presence      enable row level security;
alter table public.push_subscriptions   enable row level security;

-- --- profiles --------------------------------------------------------------
-- You can see someone if you share a group, are friends, share an expense,
-- created them as a placeholder, or it is you. Not every profile in the system.
create or replace function public.can_view_profile(target_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    target_profile = public.current_profile_id()
    or exists (
      select 1 from public.group_members mine
        join public.group_members theirs on mine.group_id = theirs.group_id
       where mine.profile_id = public.current_profile_id()
         and theirs.profile_id = target_profile
    )
    or exists (
      select 1 from public.friendships f
       where (f.profile_a = public.current_profile_id() and f.profile_b = target_profile)
          or (f.profile_b = public.current_profile_id() and f.profile_a = target_profile)
    )
    or exists (
      select 1 from public.expense_participants mine
        join public.expense_participants theirs on mine.expense_id = theirs.expense_id
       where mine.profile_id = public.current_profile_id()
         and theirs.profile_id = target_profile
    )
    or exists (
      select 1 from public.profiles p
       where p.id = target_profile and p.created_by = public.current_profile_id()
    );
$$;

create policy profiles_select on public.profiles
  for select to authenticated using (public.can_view_profile(id));

create policy profiles_update_own on public.profiles
  for update to authenticated using (auth_user_id = auth.uid());

-- Placeholders only: you may create a person who has no login, and you are
-- recorded as having created them.
create policy profiles_insert_placeholder on public.profiles
  for insert to authenticated
  with check (auth_user_id is null and created_by = public.current_profile_id());

-- --- friendships -----------------------------------------------------------
create policy friendships_select on public.friendships
  for select to authenticated
  using (profile_a = public.current_profile_id() or profile_b = public.current_profile_id());

create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (profile_a = public.current_profile_id() or profile_b = public.current_profile_id());

create policy friendships_update on public.friendships
  for update to authenticated
  using (profile_a = public.current_profile_id() or profile_b = public.current_profile_id());

create policy friendships_delete on public.friendships
  for delete to authenticated
  using (profile_a = public.current_profile_id() or profile_b = public.current_profile_id());

-- --- groups ----------------------------------------------------------------
create policy groups_select on public.groups
  for select to authenticated using (id in (select public.my_group_ids()));

create policy groups_insert on public.groups
  for insert to authenticated with check (created_by = public.current_profile_id());

create policy groups_update on public.groups
  for update to authenticated using (public.is_group_admin(id));

create policy groups_delete on public.groups
  for delete to authenticated using (public.is_group_admin(id));

-- --- group_members ---------------------------------------------------------
create policy group_members_select on public.group_members
  for select to authenticated using (group_id in (select public.my_group_ids()));

-- Adding yourself to a group you created, or an admin adding a placeholder.
create policy group_members_insert on public.group_members
  for insert to authenticated
  with check (
    profile_id = public.current_profile_id()
    or public.is_group_admin(group_id)
  );

create policy group_members_update on public.group_members
  for update to authenticated
  using (profile_id = public.current_profile_id() or public.is_group_admin(group_id));

create policy group_members_delete on public.group_members
  for delete to authenticated
  using (profile_id = public.current_profile_id() or public.is_group_admin(group_id));

-- --- categories ------------------------------------------------------------
create policy categories_select on public.categories
  for select to authenticated
  using (
    created_by is null
    or created_by = public.current_profile_id()
    or group_id in (select public.my_group_ids())
  );

create policy categories_insert on public.categories
  for insert to authenticated with check (created_by = public.current_profile_id());

create policy categories_update on public.categories
  for update to authenticated using (created_by = public.current_profile_id());

create policy categories_delete on public.categories
  for delete to authenticated using (created_by = public.current_profile_id());

-- --- expenses --------------------------------------------------------------
create policy expenses_select on public.expenses
  for select to authenticated using (public.can_access_expense(id));

create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (
    created_by = public.current_profile_id()
    and (group_id is null or group_id in (select public.my_group_ids()))
  );

create policy expenses_update on public.expenses
  for update to authenticated
  using (
    public.can_access_expense(id)
    and (created_by = public.current_profile_id()
         or (group_id is not null and public.is_group_admin(group_id)))
  );

create policy expenses_delete on public.expenses
  for delete to authenticated
  using (
    created_by = public.current_profile_id()
    or (group_id is not null and public.is_group_admin(group_id))
  );

-- --- expense_participants --------------------------------------------------
create policy expense_participants_select on public.expense_participants
  for select to authenticated using (public.can_access_expense(expense_id));

create policy expense_participants_write on public.expense_participants
  for all to authenticated
  using (public.can_access_expense(expense_id))
  with check (public.can_access_expense(expense_id));

-- --- expense_images --------------------------------------------------------
create policy expense_images_select on public.expense_images
  for select to authenticated using (public.can_access_expense(expense_id));

create policy expense_images_insert on public.expense_images
  for insert to authenticated with check (public.can_access_expense(expense_id));

create policy expense_images_delete on public.expense_images
  for delete to authenticated using (public.can_access_expense(expense_id));

-- --- settlements -----------------------------------------------------------
create policy settlements_select on public.settlements
  for select to authenticated
  using (
    from_profile = public.current_profile_id()
    or to_profile = public.current_profile_id()
    or (group_id is not null and group_id in (select public.my_group_ids()))
  );

create policy settlements_insert on public.settlements
  for insert to authenticated
  with check (
    created_by = public.current_profile_id()
    and (from_profile = public.current_profile_id()
         or to_profile = public.current_profile_id()
         or (group_id is not null and group_id in (select public.my_group_ids())))
  );

create policy settlements_update on public.settlements
  for update to authenticated using (created_by = public.current_profile_id());

create policy settlements_delete on public.settlements
  for delete to authenticated using (created_by = public.current_profile_id());

-- --- expense_comments ------------------------------------------------------
create policy expense_comments_select on public.expense_comments
  for select to authenticated using (public.can_access_expense(expense_id));

create policy expense_comments_insert on public.expense_comments
  for insert to authenticated
  with check (
    profile_id = public.current_profile_id() and public.can_access_expense(expense_id)
  );

create policy expense_comments_update on public.expense_comments
  for update to authenticated using (profile_id = public.current_profile_id());

create policy expense_comments_delete on public.expense_comments
  for delete to authenticated using (profile_id = public.current_profile_id());

-- --- activity_events -------------------------------------------------------
create policy activity_select on public.activity_events
  for select to authenticated
  using (
    (group_id is not null and group_id in (select public.my_group_ids()))
    or (expense_id is not null and public.can_access_expense(expense_id))
  );

create policy activity_insert on public.activity_events
  for insert to authenticated with check (actor_id = public.current_profile_id());

-- --- notes -----------------------------------------------------------------
create policy notes_select on public.notes
  for select to authenticated using (group_id in (select public.my_group_ids()));

create policy notes_insert on public.notes
  for insert to authenticated
  with check (
    group_id in (select public.my_group_ids())
    and created_by = public.current_profile_id()
  );

create policy notes_update on public.notes
  for update to authenticated using (group_id in (select public.my_group_ids()));

create policy notes_delete on public.notes
  for delete to authenticated
  using (created_by = public.current_profile_id() or public.is_group_admin(group_id));

create policy note_images_all on public.note_images
  for all to authenticated
  using (note_id in (select id from public.notes where group_id in (select public.my_group_ids())))
  with check (note_id in (select id from public.notes where group_id in (select public.my_group_ids())));

-- --- documents -------------------------------------------------------------
create policy documents_select on public.documents
  for select to authenticated using (group_id in (select public.my_group_ids()));

create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    group_id in (select public.my_group_ids())
    and uploaded_by = public.current_profile_id()
  );

create policy documents_delete on public.documents
  for delete to authenticated
  using (uploaded_by = public.current_profile_id() or public.is_group_admin(group_id));

-- --- member_presence -------------------------------------------------------
create policy presence_select on public.member_presence
  for select to authenticated using (group_id in (select public.my_group_ids()));

create policy presence_write on public.member_presence
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id() and group_id in (select public.my_group_ids()));

-- --- push_subscriptions ----------------------------------------------------
create policy push_subscriptions_all on public.push_subscriptions
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

-- ---------------------------------------------------------------------------
-- 12. Storage buckets
--
-- avatars is public because it is served in list views everywhere. receipts
-- and documents are private and reached through signed URLs: a receipt shows
-- what you bought and where you were, and a lease has your address on it.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('receipts', 'receipts', false),
  ('documents', 'documents', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_authenticated_write" on storage.objects;
drop policy if exists "private_media_read" on storage.objects;
drop policy if exists "private_media_write" on storage.objects;

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_authenticated_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars')
  with check (bucket_id = 'avatars');

-- Private buckets: access is granted per-object by the server issuing a signed
-- URL, so direct client reads are limited to objects the user uploaded.
create policy "private_media_read" on storage.objects
  for select to authenticated
  using (bucket_id in ('receipts', 'documents') and owner = auth.uid());

create policy "private_media_write" on storage.objects
  for all to authenticated
  using (bucket_id in ('receipts', 'documents') and owner = auth.uid())
  with check (bucket_id in ('receipts', 'documents'));

-- ---------------------------------------------------------------------------
-- 13. Seed the default categories
-- ---------------------------------------------------------------------------

insert into public.categories (name, icon, color, created_by, group_id) values
  ('Groceries',     'shopping-cart', '#16a34a', null, null),
  ('Rent',          'home',          '#2563eb', null, null),
  ('Utilities',     'zap',           '#f59e0b', null, null),
  ('Internet',      'wifi',          '#0891b2', null, null),
  ('Dining out',    'utensils',      '#e11d48', null, null),
  ('Transport',     'car',           '#7c3aed', null, null),
  ('Entertainment', 'film',          '#db2777', null, null),
  ('Household',     'sofa',          '#a16207', null, null),
  ('Travel',        'plane',         '#0284c7', null, null),
  ('Health',        'heart-pulse',   '#dc2626', null, null),
  ('Gifts',         'gift',          '#c026d3', null, null),
  ('General',       'receipt',       '#64748b', null, null);
