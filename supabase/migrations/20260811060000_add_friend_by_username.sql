-- ============================================================================
-- Add friends by username or email.
--
-- A username is the nicer thing to hand someone — it is short, it is not
-- personal data, and it does not change when someone switches email provider.
-- Email stays supported because it is the only way to reach someone who has
-- not signed up yet: a username belongs to an account, so it cannot be used
-- to create a placeholder.
--
-- Replaces the two-argument add_friend added earlier today. Nothing outside
-- this repo calls it, so dropping the old signature is safe; it exists only so
-- the parameter can be renamed from p_email to the more honest p_identifier.
-- ============================================================================

drop function if exists public.add_friend(text, text);

create or replace function public.add_friend(
  p_identifier   text,
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
  identifier text;
  looks_like_email boolean;
begin
  me := public.current_profile_id();
  if me is null then
    raise exception 'You need to be signed in';
  end if;

  identifier := nullif(trim(p_identifier), '');
  looks_like_email := identifier is not null and position('@' in identifier) > 0;

  if identifier is null and coalesce(trim(p_display_name), '') = '' then
    raise exception 'Enter a username or email, or just a name';
  end if;

  if looks_like_email then
    select id into friend_id
      from public.profiles
     where lower(email) = lower(identifier)
     order by (auth_user_id is null), created_at
     limit 1;
  elsif identifier is not null then
    -- Usernames are case-insensitive to look up, however they were typed in.
    select id into friend_id
      from public.profiles
     where lower(username) = lower(ltrim(identifier, '@'))
     limit 1;

    if friend_id is null then
      raise exception 'No one on Homeslice has the username %. Check the spelling, or add them by email instead.',
        ltrim(identifier, '@');
    end if;
  end if;

  if friend_id is null then
    -- An email nobody is using yet: create a placeholder so they can be split
    -- with immediately and claim the history when they sign up.
    if coalesce(trim(p_display_name), '') = '' then
      raise exception 'Nobody is using that email yet — add a name so they can be added anyway';
    end if;

    insert into public.profiles (display_name, email, created_by)
    values (trim(p_display_name), lower(identifier), me)
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
-- Claiming a username.
--
-- Uniqueness is already enforced by the column constraint, but a raw unique
-- violation is not something to show a person. This turns it into a plain
-- sentence, and treats "taken by you" as success rather than an error.
-- ---------------------------------------------------------------------------

create or replace function public.set_username(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
  wanted text;
  holder uuid;
begin
  me := public.current_profile_id();
  if me is null then
    raise exception 'You need to be signed in';
  end if;

  wanted := nullif(trim(ltrim(p_username, '@')), '');

  if wanted is null then
    update public.profiles set username = null where id = me;
    return null;
  end if;

  if wanted !~ '^[a-zA-Z0-9_.]{2,30}$' then
    raise exception 'Usernames can be 2 to 30 letters, numbers, dots or underscores';
  end if;

  select id into holder from public.profiles where lower(username) = lower(wanted);

  if holder is not null and holder <> me then
    raise exception 'The username % is already taken', wanted;
  end if;

  update public.profiles set username = wanted where id = me;
  return wanted;
end;
$$;

-- Case-insensitive uniqueness: without this, "Sam" and "sam" are two people.
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

notify pgrst, 'reload schema';
