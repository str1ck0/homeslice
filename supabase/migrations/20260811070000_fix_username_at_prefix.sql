-- ============================================================================
-- "@sam" is a username, not an email address.
--
-- add_friend decided between username and email with `position('@' in ...) > 0`,
-- which is true for a handle written the way people actually write one. So
-- adding "@sam" looked for an email, found none, and tried to create a
-- placeholder — reporting "nobody is using that email yet" for a username that
-- existed all along.
--
-- The rule now: a leading @ means username, unambiguously. Only an @ *inside*
-- the string makes it an email.
-- ============================================================================

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
  is_handle boolean;
  looks_like_email boolean;
begin
  me := public.current_profile_id();
  if me is null then
    raise exception 'You need to be signed in';
  end if;

  identifier := nullif(trim(p_identifier), '');

  -- A leading @ is how people write a username, so treat it as decisive.
  is_handle := identifier is not null and left(identifier, 1) = '@';
  looks_like_email := identifier is not null
                      and not is_handle
                      and position('@' in identifier) > 1;

  if is_handle then
    identifier := ltrim(identifier, '@');
  end if;

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
    select id into friend_id
      from public.profiles
     where lower(username) = lower(identifier)
     limit 1;

    if friend_id is null then
      raise exception 'No one on Homeslice has the username %. Check the spelling, or add them by email instead.',
        identifier;
    end if;
  end if;

  if friend_id is null then
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

notify pgrst, 'reload schema';
