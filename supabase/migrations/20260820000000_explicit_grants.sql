-- ---------------------------------------------------------------------------
-- Privileges the app has always depended on and no migration ever created.
--
-- Found on 20 August 2026, the first time this migration set was replayed
-- against an empty database: every query failed with "permission denied for
-- table profiles". Production has these grants as a side effect of how it was
-- built — objects created through the dashboard's SQL editor pick up default
-- privileges that a migration run does not — and nothing ever wrote them down.
-- So the thirteen migration files did not, in fact, describe production: a
-- rebuild from them alone produced an app that could not read its own tables,
-- and the failure points at RLS, which is not the cause.
--
-- Applying this to production is a no-op; it already has every grant below.
--
-- Granting broadly to anon and authenticated looks alarming and is the normal
-- Supabase posture. RLS is the security boundary here, not the grant: every
-- table in this schema has row level security enabled with policies, and
-- rls.integration.test.ts asserts a non-member can read and write nothing.
-- Narrowing these would not add security — it would only put local and
-- production back out of step, which is the bug this file exists to close.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;

-- And whatever a later migration adds, so this does not have to be remembered.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines to anon, authenticated, service_role;

notify pgrst, 'reload schema';
