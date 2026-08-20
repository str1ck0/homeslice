#!/usr/bin/env bash
# Compare the local stack's schema against production's.
#
#   ./scripts/db-diff.sh
#
# Both databases are asked the same introspection question and the answers are
# diffed. Silence means the migration files reproduce production exactly.
#
# This is the check that would have caught the missing grants years earlier
# than it did: a fingerprint of columns and policies alone said the two were
# identical while the app could not read a single table locally, so privileges
# are in here too. If you find another category of thing that can drift, add it
# to the query rather than remembering to look.
#
# Read-only against both. It never writes anything anywhere.
set -euo pipefail

cd "$(dirname "$0")/.."

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cat > "$work/introspect.sql" <<'SQL'
select string_agg(line, E'\n' order by line) as fingerprint from (
  select 'COLUMN  ' || table_name || '.' || column_name || ' ' || data_type ||
         coalesce(' default=' || column_default, '') || ' null=' || is_nullable as line
    from information_schema.columns where table_schema = 'public'
  union all
  select 'POLICY  ' || tablename || ' :: ' || policyname || ' :: ' || cmd
    from pg_policies where schemaname = 'public'
  union all
  select 'INDEX   ' || indexname || ' :: ' || indexdef
    from pg_indexes where schemaname = 'public'
  union all
  select 'FUNC    ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  union all
  select 'TRIGGER ' || c.relname || ' :: ' || t.tgname
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
  union all
  select 'CONSTR  ' || conrelid::regclass::text || ' :: ' || conname || ' :: ' || pg_get_constraintdef(c.oid)
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public'
  union all
  select 'GRANT   ' || grantee || ' ' || table_name || ' ' || privilege_type
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon','authenticated','service_role')
  union all
  select 'BUCKET  ' || id || ' public=' || public::text from storage.buckets
  union all
  select 'SPOLICY ' || tablename || ' :: ' || policyname || ' :: ' || cmd
    from pg_policies where schemaname = 'storage'
) t;
SQL

psql "${SUPABASE_LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}" \
  -At -f "$work/introspect.sql" | sort > "$work/local.txt"

./scripts/db-query.sh --prod -f "$work/introspect.sql" \
  | python3 -c "
import json, sys
print(json.load(sys.stdin)[0]['fingerprint'] or '')" | sort > "$work/prod.txt"

echo "local: $(grep -c . "$work/local.txt") objects   production: $(grep -c . "$work/prod.txt") objects"

if diff "$work/local.txt" "$work/prod.txt"; then
  echo "✓ identical — the migrations reproduce production"
else
  echo
  echo "✗ drift. '<' is local only, '>' is production only."
  exit 1
fi
