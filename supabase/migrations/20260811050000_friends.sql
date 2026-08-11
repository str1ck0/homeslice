-- ============================================================================
-- Adding a friend.
--
-- Needs SECURITY DEFINER because of a chicken-and-egg problem: the profiles
-- SELECT policy only shows you people you already share a group, expense or
-- friendship with — which is correct, and means you cannot look someone up by
-- email to befriend them in the first place.
--
-- Scoped tightly rather than opened up: this function only ever returns a
-- profile id you are being connected to, creates a friendship you are party
-- to, and never exposes the wider user table to search.
-- ============================================================================

create or replace function public.add_friend(
  p_email        text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
  friend_id uuid;
  clean_email text;
begin
  me := public.current_profile_id();
  if me is null then
    raise exception 'You need to be signed in';
  end if;

  clean_email := lower(nullif(trim(p_email), ''));

  if clean_email is null and coalesce(trim(p_display_name), '') = '' then
    raise exception 'Enter a name or an email address';
  end if;

  if clean_email is not null then
    -- Prefer a real account over a placeholder if both somehow exist.
    select id into friend_id
      from public.profiles
     where lower(email) = clean_email
     order by (auth_user_id is null), created_at
     limit 1;
  end if;

  if friend_id is null then
    if coalesce(trim(p_display_name), '') = '' then
      raise exception 'Nobody is using that email yet — add a name so they can be added anyway';
    end if;

    insert into public.profiles (display_name, email, created_by)
    values (trim(p_display_name), clean_email, me)
    returning id into friend_id;
  end if;

  if friend_id = me then
    raise exception 'That is you';
  end if;

  insert into public.friendships (profile_a, profile_b, status)
  values (least(me, friend_id), greatest(me, friend_id), 'accepted')
  on conflict (profile_a, profile_b) do update set status = 'accepted';

  return friend_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sharing an expense with someone implies you know them, so friendships are
-- created automatically. This is what makes non-group expenses feel effortless
-- rather than requiring you to befriend somebody first.
-- ---------------------------------------------------------------------------

create or replace function public.link_expense_participants_as_friends()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.friendships (profile_a, profile_b, status)
  select distinct
    least(a.profile_id, b.profile_id),
    greatest(a.profile_id, b.profile_id),
    'accepted'
  from public.expense_participants a
  join public.expense_participants b
    on a.expense_id = b.expense_id
   and a.profile_id < b.profile_id
  where a.expense_id = new.expense_id
  on conflict (profile_a, profile_b) do nothing;

  return null;
end;
$$;

drop trigger if exists expense_participants_befriend on public.expense_participants;

create constraint trigger expense_participants_befriend
  after insert on public.expense_participants
  deferrable initially deferred
  for each row execute function public.link_expense_participants_as_friends();

notify pgrst, 'reload schema';
