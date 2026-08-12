-- ---------------------------------------------------------------------------
-- Adding an existing person to a group.
--
-- Until now the only way to grow a group was add_placeholder_member, which
-- always creates a brand new profile. Adding someone you are already friends
-- with was impossible from the UI, and doing it by hand would have made a
-- second, duplicate person with none of their history.
--
-- Security definer for the same reason add_placeholder_member is: the insert
-- writes a group_members row for somebody other than the caller, and the
-- membership checks below are the real authorisation.
-- ---------------------------------------------------------------------------

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

  -- You can only add people you actually know: a friend, someone you created
  -- as a placeholder, or someone already in another group with you. Without
  -- this, a member could add any profile id they managed to guess.
  if not exists (
    select 1 from public.friendships f
     where f.status = 'accepted'
       and ((f.profile_a = me and f.profile_b = p_profile_id)
         or (f.profile_b = me and f.profile_a = p_profile_id))
  ) and not exists (
    select 1 from public.profiles p
     where p.id = p_profile_id and p.created_by = me
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
    -- Already in the group: nothing to do. Previously left: let them back in
    -- rather than failing on the (group_id, profile_id) unique constraint.
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

comment on function public.add_group_member(uuid, uuid) is
  'Add an existing profile (a friend, a placeholder you made, or someone from another shared group) to a group you are in.';
