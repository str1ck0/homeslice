-- ============================================================================
-- Give existing auth users a profile.
--
-- The baseline migration dropped public.profiles, but auth.users is managed by
-- Supabase and was untouched — correctly, since those are real logins. The
-- handle_new_auth_user trigger only fires on INSERT, so accounts that already
-- existed would sign in successfully and then find no profile row, which
-- breaks every screen in the app.
--
-- Idempotent: safe to re-run, and it will pick up any account that somehow
-- misses the signup trigger in future.
-- ============================================================================

insert into public.profiles (auth_user_id, display_name, email)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data->>'display_name', ''),
    nullif(u.raw_user_meta_data->>'username', ''),
    split_part(u.email, '@', 1)
  ),
  u.email
from auth.users u
where not exists (
  select 1 from public.profiles p where p.auth_user_id = u.id
);
