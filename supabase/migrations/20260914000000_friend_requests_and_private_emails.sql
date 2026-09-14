-- ---------------------------------------------------------------------------
-- Friends have to accept, and nobody can read anybody else's email address.
--
-- add_friend used to make an accepted friendship on the spot. Names are unique
-- and easy to guess, and sign-ups are open, so anyone on the internet could
-- type "stricko", become Liam's friend without him knowing, and then add an
-- expense saying he owed them R50,000 — which would land on his dashboard. The
-- same friendship made can_view_profile true, and profiles returned the whole
-- row, email included.
--
-- Now:
--
--   * add_friend sends a request, and the other person accepts it or it goes
--     nowhere. Asking someone who has already asked you counts as accepting.
--   * friendships cannot be written directly. Only the functions below can,
--     because they are the one place that knows who is allowed to accept.
--   * an expense or a payment may only name you if you have accepted the person
--     writing it (or whoever created it), or you are in its group. Without this
--     a request would be decoration: create_expense accepts any profile id.
--   * profiles.email is readable by nobody through the API. The app never shows
--     anyone else's, and your own comes from your session.
-- ---------------------------------------------------------------------------

-- --- 1. Who asked ------------------------------------------------------------

alter table public.friendships
  add column if not exists requested_by uuid references public.profiles(id) on delete cascade;

comment on column public.friendships.requested_by is
  'Who sent the request. Null on friendships from before requests existed (14 September 2026), all of which were accepted.';

-- Either person may still delete a row: that is declining a request,
-- withdrawing one, or removing a friend. friendships_delete stays as it was.
drop policy if exists friendships_insert on public.friendships;
drop policy if exists friendships_update on public.friendships;
revoke insert, update on public.friendships from anon, authenticated;

-- --- 2. Asking ---------------------------------------------------------------

create or replace function public.add_friend(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
  friend_id uuid;
  existing public.friendships%rowtype;
begin
  me := public.current_profile_id();
  if me is null then
    raise exception 'You need to be signed in';
  end if;

  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Enter their name';
  end if;

  select id into friend_id
    from public.profiles
   where public.normalise_name(display_name) = public.normalise_name(p_name);

  if friend_id is null then
    raise exception 'Nobody on Homeslice is called %', btrim(p_name);
  end if;

  if friend_id = me then
    raise exception 'That is you';
  end if;

  select * into existing
    from public.friendships
   where profile_a = least(me, friend_id) and profile_b = greatest(me, friend_id);

  if not found then
    insert into public.friendships (profile_a, profile_b, status, requested_by)
    values (least(me, friend_id), greatest(me, friend_id), 'pending', me);
  elsif existing.status = 'pending' and existing.requested_by is distinct from me then
    -- They asked first. Asking back is the same as saying yes.
    update public.friendships set status = 'accepted' where id = existing.id;
  end if;
  -- Already friends, or already asked: nothing to do, and not an error.

  return friend_id;
end;
$$;

-- --- 3. Answering ------------------------------------------------------------

create or replace function public.accept_friend(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
begin
  me := public.current_profile_id();
  if me is null then
    raise exception 'You need to be signed in';
  end if;

  -- requested_by = the other person is the whole rule: you cannot accept a
  -- request you sent.
  update public.friendships
     set status = 'accepted'
   where profile_a = least(me, p_profile_id)
     and profile_b = greatest(me, p_profile_id)
     and status = 'pending'
     and requested_by = p_profile_id;

  if not found then
    raise exception 'There is no friend request from them to accept';
  end if;
end;
$$;

-- --- 4. Nobody is put in your ledger by a stranger ---------------------------

-- May the person writing this row name p_profile in it?
--
-- Yes if it is themselves; if the profile is in the row's group (including
-- someone who has since left, so old expenses stay editable); or if the profile
-- has an accepted friendship with the writer or with whoever created the row.
-- The creator clause is what lets Ada edit a dinner Devin entered with Bo, when
-- Ada and Bo are not friends themselves.
create or replace function public.is_known_to_writer(
  p_profile uuid,
  p_group   uuid,
  p_creator uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (select public.current_profile_id() as id)
  select
    -- No profile means the service role, a migration or the seed.
    (select id from me) is null
    or p_profile = (select id from me)
    or (p_group is not null and exists (
          select 1 from public.group_members gm
           where gm.group_id = p_group and gm.profile_id = p_profile))
    or exists (
          select 1 from public.friendships f
           where f.status = 'accepted'
             and ((f.profile_a = p_profile and f.profile_b in ((select id from me), p_creator))
               or (f.profile_b = p_profile and f.profile_a in ((select id from me), p_creator))));
$$;

create or replace function public.check_participant_is_known()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent record;
begin
  select group_id, created_by into parent
    from public.expenses where id = new.expense_id;

  if not public.is_known_to_writer(new.profile_id, parent.group_id, parent.created_by) then
    raise exception 'You can only split with friends who have accepted your request, or people in the group';
  end if;

  return new;
end;
$$;

drop trigger if exists expense_participants_known on public.expense_participants;
create trigger expense_participants_known
  before insert or update of profile_id on public.expense_participants
  for each row execute function public.check_participant_is_known();

create or replace function public.check_settlement_parties_known()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  creator uuid;
begin
  creator := case when tg_op = 'UPDATE' then old.created_by else new.created_by end;

  if not public.is_known_to_writer(new.from_profile, new.group_id, creator)
     or not public.is_known_to_writer(new.to_profile, new.group_id, creator) then
    raise exception 'You can only record a payment with friends who have accepted your request, or people in the group';
  end if;

  return new;
end;
$$;

drop trigger if exists settlements_parties_known on public.settlements;
create trigger settlements_parties_known
  before insert or update of from_profile, to_profile, group_id on public.settlements
  for each row execute function public.check_settlement_parties_known();

-- --- 5. Email addresses are for signing in -----------------------------------

-- Every column but email. A new column on profiles has to be added here to be
-- readable at all, which is the right way round for a table of people.
revoke select on public.profiles from anon, authenticated;
grant select (id, auth_user_id, display_name, avatar_url, default_currency, created_at, updated_at)
  on public.profiles to authenticated;

notify pgrst, 'reload schema';
