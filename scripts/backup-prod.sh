#!/usr/bin/env bash
# Snapshot every row of the production public schema to JSON.
#
#   ./scripts/backup-prod.sh
#
# Passwordless: it goes through the Management API the same way db-query.sh
# does, using the token already in the macOS keychain. That is also its limit —
# it captures the public schema only. It does not capture auth.users, storage
# objects, or the schema itself, so it is a safety net for the irreplaceable
# part (who spent what) rather than a restorable dump. For one of those:
#
#   supabase db dump --linked -f dump.sql        # needs the database password
#
# Output lands OUTSIDE the repo on purpose. A backup of real financial records
# is exactly the file an agent should not be able to commit by accident.
set -euo pipefail

cd "$(dirname "$0")/.."

OUT_DIR="${HOMESLICE_BACKUP_DIR:-$HOME/homeslice-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$OUT_DIR/$STAMP"
mkdir -p "$DEST"
chmod 700 "$OUT_DIR" "$DEST"

TABLES="$(./scripts/db-query.sh --prod "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name;" \
  | python3 -c "import json,sys; print(' '.join(r['table_name'] for r in json.load(sys.stdin)))")"

for table in $TABLES; do
  printf '%-24s' "$table"
  ./scripts/db-query.sh --prod "select coalesce(json_agg(t), '[]'::json) as rows from public.${table} t;" \
    > "$DEST/${table}.json"
  python3 -c "
import json, sys
rows = json.load(open('$DEST/${table}.json'))[0]['rows']
json.dump(rows, open('$DEST/${table}.json', 'w'), indent=2, default=str)
print(len(rows), 'rows')
"
done

echo
echo "Snapshot written to $DEST"
