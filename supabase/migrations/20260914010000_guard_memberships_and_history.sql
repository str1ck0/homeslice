-- ---------------------------------------------------------------------------
-- Memberships change only the ways the app changes them, and the ledger cannot
-- be deleted from a browser.
--
-- Three holes, each proven against the local stack on 14 September:
--
-- 1. Anyone signed in could add themselves to any group whose id they knew,
--    as admin. group_members_insert only asked whether the row was for you, and
--    group ids are in every group URL.
-- 2. Any member could make themselves admin. group_members_update let you edit
--    your own row and never looked at what you changed — and a removed member
--    could clear their own left_at and walk straight back in.
-- 3. Anyone in an expense could DELETE it outright, and its expense_events went
--    with it by cascade: the append-only record, gone in one request. The same
--    for payments, and an admin deleting a group took every expense in it.
--
-- Now:
--
--   * a membership is created only by create_group, join_group_by_code or
--     add_group_member, each of which checks who is asking;
--   * a member may leave, and change nothing else about their own row;
--   * expenses and payments cannot be deleted through the API at all. The app
--     has only ever soft-deleted them (deleted_at), which is what lets Restore
--     exist;
--   * a group with any history cannot be deleted. The app archives it instead.
--
-- A real deletion is still possible, on purpose and by hand, as the database
-- owner: see "Deleting something for real" in docs/DATABASE.md.
-- ---------------------------------------------------------------------------

-- --- 1. Joining ---------------------------------------------------------------

drop policy if exists group_members_insert on public.group_members;
revoke insert on public.group_members from anon, authenticated;

-- create_group inserted the creator's admin row as the caller, relying on the
-- policy just dropped. Making the caller admin of the group it has just created
-- is the one legitimate case, so the function runs as its owner instead.
--
-- `extensions` is on the path because inserting a group runs the invite_code
-- default, generate_invite_code(), which calls pgcrypto's gen_random_bytes —
-- and pgcrypto lives there. With `public` alone every group creation fails
-- with "function gen_random_bytes does not exist".
alter function public.create_group(text, text, text, char(3), text, text)
  security definer set search_path = public, extensions;

-- --- 2. Changing a membership -------------------------------------------------

create or replace function public.guard_membership_update()
returns trigger
language plpgsql
as $$
begin
  -- Only requests from the API are policed. join_group_by_code and
  -- add_group_member run as their owner and have already checked who is
  -- asking (rejoining with an invite code clears left_at, legitimately); the
  -- service role and migrations are trusted too. Not SECURITY DEFINER, or
  -- current_user would always be the owner and this would police nothing.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.group_id is distinct from old.group_id
     or new.profile_id is distinct from old.profile_id
     or new.joined_at is distinct from old.joined_at then
    raise exception 'A membership cannot be moved to another group or person';
  end if;

  if public.is_group_admin(old.group_id) then
    return new;
  end if;

  -- Not an admin: the one thing you may do to your own row is leave.
  if new.role is distinct from old.role then
    raise exception 'Only a group admin can change who is an admin';
  end if;

  if old.left_at is not null and new.left_at is null then
    raise exception 'To come back, use the invite code or ask someone in the group to add you';
  end if;

  return new;
end;
$$;

drop trigger if exists group_members_guard on public.group_members;
create trigger group_members_guard
  before update on public.group_members
  for each row execute function public.guard_membership_update();

-- --- 3. The ledger stays ------------------------------------------------------

drop policy if exists expenses_delete on public.expenses;
drop policy if exists settlements_delete on public.settlements;
revoke delete on public.expenses, public.settlements from anon, authenticated;

-- Soft-deleted rows count. They are still history, Restore still works on them,
-- and deleting the group would take them for good.
create or replace function public.group_has_history(target_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.expenses where group_id = target_group)
      or exists (select 1 from public.settlements where group_id = target_group);
$$;

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete to authenticated
  using (public.is_group_admin(id) and not public.group_has_history(id));

-- --- 4. Receipts are photos ---------------------------------------------------

-- The same ceiling avatars have had since 12 August. Without it a signed-in
-- user could fill the free plan's 1 GB with anything at all. HEIC is allowed
-- because compressImage passes through what a browser cannot decode.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif',
                                  'image/heic', 'image/heif']
 where id = 'receipts';

notify pgrst, 'reload schema';
