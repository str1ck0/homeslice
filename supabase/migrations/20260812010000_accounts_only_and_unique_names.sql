-- ---------------------------------------------------------------------------
-- Everyone has an account, and your name is your handle.
--
-- Two decisions land together because each one simplifies the other.
--
-- 1. Placeholders are gone. A profile without a login could only ever be
--    reunited with its owner by matching an email address recorded at the time
--    — and the form that created them made the email optional, so the promise
--    quietly did not hold for anyone added by name alone. Rather than harden a
--    mechanism nobody wanted, using Homeslice now means having an account.
--
-- 2. `username` is gone too. Nobody claimed one, because it was a second
--    identity to invent with no visible payoff. Instead `display_name` is
--    unique, and is both what people see and what people type to add you.
--    Spaces and capitals are allowed — "Liam Strickland", "Liam S", "Stricko"
--    are all fine — so it stops feeling like a database key.
--
-- Making the shown name the unique one is what stops two people ever looking
-- identical in a group, which is the failure mode of the model this replaces:
-- Splitwise shows you two indistinguishable "Sam Smith"s precisely because its
-- display name carries no uniqueness at all.
--
-- Safe to run as written: the database currently holds four profiles, all with
-- logins, no placeholders and no usernames.
-- ---------------------------------------------------------------------------

-- --- 1. Name normalisation -------------------------------------------------
-- Uniqueness and lookup both ignore case and collapse runs of whitespace, so
-- "Liam  Strickland" cannot coexist with "liam strickland". The stored value
-- keeps whatever capitalisation was typed.

create or replace function public.normalise_name(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(btrim(value), '\s+', ' ', 'g'));
$$;

comment on function public.normalise_name(text) is
  'Case- and whitespace-insensitive form of a name, used for uniqueness and lookup.';

-- --- 2. Placeholders are gone ----------------------------------------------

drop function if exists public.add_placeholder_member(uuid, text, text);

-- Nobody inserts a profile directly any more; the signup trigger does it.
drop policy if exists profiles_insert_placeholder on public.profiles;

-- `created_by` recorded who invented a placeholder, and `claimed_at` recorded
-- when its owner arrived. Neither can happen now.
alter table public.profiles drop column if exists created_by;
alter table public.profiles drop column if exists claimed_at;

alter table public.profiles alter column auth_user_id set not null;

-- --- 3. The name is the handle ---------------------------------------------

alter table public.profiles drop constraint if exists username_format;
alter table public.profiles drop column if exists username;

alter table public.profiles
  add constraint display_name_length
  check (char_length(btrim(display_name)) between 2 and 40);

create unique index profiles_name_unique_idx
  on public.profiles (public.normalise_name(display_name));

drop function if exists public.set_username(text);

-- --- 4. Signup ---------------------------------------------------------------
-- No claiming branch left, but a new obligation: the name has to be unique, and
-- the fallback is the local part of an email address, so two people at
-- different domains called sam@ would collide and the signup would fail. A
-- suffix is appended until the name is free.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wanted text;
  candidate text;
  suffix int := 1;
begin
  wanted := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
    split_part(new.email, '@', 1)
  );

  -- The check constraint wants at least two characters.
  if char_length(wanted) < 2 then
    wanted := wanted || '.' || substr(new.id::text, 1, 4);
  end if;
  wanted := left(wanted, 40);

  candidate := wanted;
  while exists (
    select 1 from public.profiles
     where public.normalise_name(display_name) = public.normalise_name(candidate)
  ) loop
    suffix := suffix + 1;
    candidate := left(wanted, 37) || ' ' || suffix;
  end loop;

  insert into public.profiles (auth_user_id, display_name, email)
  values (new.id, candidate, new.email);

  return new;
end;
$$;

-- --- 5. Adding a friend by name ---------------------------------------------
-- The old signature took an identifier plus a name and would invent a
-- placeholder when it found nobody. There is nobody to invent now: either the
-- name belongs to an account or there is nothing to add.

drop function if exists public.add_friend(text, text);

create or replace function public.add_friend(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
  friend_id uuid;
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

  insert into public.friendships (profile_a, profile_b, status)
  values (least(me, friend_id), greatest(me, friend_id), 'accepted')
  on conflict (profile_a, profile_b) do update set status = 'accepted';

  return friend_id;
end;
$$;

-- --- 6. Helpers that referred to placeholders -------------------------------

create or replace function public.can_view_profile(target_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
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
    );
$$;

-- Same as before minus the "a placeholder you created" clause, which can no
-- longer be true.
create or replace function public.add_group_member(
  p_group_id   uuid,
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
  existing_left_at timestamptz;
begin
  me := public.current_profile_id();
  if me is null then
    raise exception 'You need to be signed in';
  end if;

  if not exists (
    select 1 from public.group_members
     where group_id = p_group_id and profile_id = me and left_at is null
  ) then
    raise exception 'You are not a member of that group';
  end if;

  if not exists (
    select 1 from public.friendships f
     where f.status = 'accepted'
       and ((f.profile_a = me and f.profile_b = p_profile_id)
         or (f.profile_b = me and f.profile_a = p_profile_id))
  ) and not exists (
    select 1 from public.group_members mine
      join public.group_members theirs on theirs.group_id = mine.group_id
     where mine.profile_id = me and mine.left_at is null
       and theirs.profile_id = p_profile_id and theirs.left_at is null
  ) then
    raise exception 'Add them as a friend first';
  end if;

  select left_at into existing_left_at
    from public.group_members
   where group_id = p_group_id and profile_id = p_profile_id;

  if found then
    if existing_left_at is not null then
      update public.group_members
         set left_at = null, joined_at = now()
       where group_id = p_group_id and profile_id = p_profile_id;
    end if;
    return p_profile_id;
  end if;

  insert into public.group_members (group_id, profile_id, role)
  values (p_group_id, p_profile_id, 'member');

  return p_profile_id;
end;
$$;

-- --- 7. Renaming yourself ----------------------------------------------------
-- A friendlier error than the raw unique-violation text, which names the index.

create or replace function public.rename_me(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
  clean text;
begin
  me := public.current_profile_id();
  if me is null then
    raise exception 'You need to be signed in';
  end if;

  clean := regexp_replace(btrim(p_name), '\s+', ' ', 'g');

  if char_length(clean) < 2 or char_length(clean) > 40 then
    raise exception 'Your name needs to be between 2 and 40 characters';
  end if;

  if exists (
    select 1 from public.profiles
     where public.normalise_name(display_name) = public.normalise_name(clean)
       and id <> me
  ) then
    raise exception '% is taken — try something else', clean;
  end if;

  update public.profiles set display_name = clean where id = me;

  return clean;
end;
$$;
