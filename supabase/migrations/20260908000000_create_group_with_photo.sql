-- ---------------------------------------------------------------------------
-- A group can be given its photo at creation, not only afterwards.
--
-- The create form had name and label; the photo lived under group settings,
-- reachable once the group existed. Nothing needed it to be that way — the
-- avatar upload happens browser-to-storage under the uploader's own auth id,
-- so the file can exist before the group does and only the URL needs a row to
-- land on. This adds that URL as an optional argument.
--
-- The old signature is dropped first rather than left as an overload: with
-- every argument defaulted, PostgREST could not tell the two apart and would
-- refuse the call as ambiguous.
-- ---------------------------------------------------------------------------

drop function if exists public.create_group(text, text, text, char(3), text);

create or replace function public.create_group(
  p_name       text,
  p_label      text default null,
  p_icon       text default null,
  p_currency   char(3) default 'ZAR',
  p_address    text default null,
  p_avatar_url text default null
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

  insert into public.groups (name, label, icon, currency, address, avatar_url, created_by)
  values (trim(p_name), nullif(trim(p_label), ''), p_icon, p_currency,
          nullif(trim(p_address), ''), nullif(trim(p_avatar_url), ''), me)
  returning id into new_group_id;

  insert into public.group_members (group_id, profile_id, role)
  values (new_group_id, me, 'admin');

  return new_group_id;
end;
$$;

notify pgrst, 'reload schema';
