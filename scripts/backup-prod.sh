#!/usr/bin/env bash
# Snapshot production into ~/homeslice-backups: every row, every login, every photo.
#
#   ./scripts/backup-prod.sh
#
# Each snapshot directory holds:
#
#   <table>.json            every row of every public table — who spent what
#   auth_users.json         every login: its id, its email, when it signed up
#   auth_identities.json    how each login signs in
#   storage_objects.json    which photos existed at that moment
#
# and alongside the snapshots, ~/homeslice-backups/storage/ is one mirror of
# every photo ever uploaded. It is shared rather than copied into each snapshot
# because a photo never changes once uploaded, and it never deletes: a photo
# removed from the app stays in the mirror, so any snapshot's
# storage_objects.json can still be matched to files.
#
# Why the logins. profiles.auth_user_id points at a login, and logins live in a
# table Supabase keeps to itself. Without them, a restore meant everyone
# signing up again and someone working out which new login belonged to which
# old profile. With them, the logins go back in under their original ids and
# every profile is already attached.
#
# What is deliberately left out: password hashes and sign-in tokens. This lands
# on a laptop, and a hash is worth more to whoever takes the laptop than it is
# to a restore. After a restore people use "Email me a link" or reset their
# password; nothing about their money depends on the old one.
#
# Rows and logins go through the Management API with the keychain token, the
# same way db-query.sh does. Photos need the service-role key, which is read
# from .env.prod.local and never printed or passed on a command line. None of
# this is the schema; for a restorable dump of that:
#
#   supabase db dump --linked -f dump.sql        # needs the database password
#
# Output lands OUTSIDE the repo on purpose. A backup of real financial records
# is exactly the file an agent should not be able to commit by accident.
set -euo pipefail

cd "$(dirname "$0")/.."

OUT_DIR="${HOMESLICE_BACKUP_DIR:-$HOME/homeslice-backups}"
MIRROR="$OUT_DIR/storage"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$OUT_DIR/$STAMP"
ENV_FILE=.env.prod.local

# Built under a .partial name and renamed only once everything has been
# written. A half-finished snapshot must never be indistinguishable from a
# complete one: the scheduled wrapper prunes by keeping the N most recent
# directories, so a run of failures would otherwise evict good backups and
# leave empty ones in their place.
WORK="$DEST.partial"
HEADERS=""
rm -rf "$WORK"
mkdir -p "$WORK" "$MIRROR"
chmod 700 "$OUT_DIR" "$WORK" "$MIRROR"
trap 'rm -rf "$WORK"; [ -n "$HEADERS" ] && rm -f "$HEADERS"' EXIT

# Run a select on production and write its rows to a file as a JSON array.
save_query() {
  local label="$1" sql="$2" file="$3"
  printf '%-24s' "$label"
  ./scripts/db-query.sh --prod "select coalesce(json_agg(t), '[]'::json) as rows from (${sql}) t;" > "$file"
  python3 - "$file" <<'PY'
import json, sys
path = sys.argv[1]
rows = json.load(open(path))[0]['rows']
json.dump(rows, open(path, 'w'), indent=2, default=str)
print(len(rows), 'rows')
PY
}

# --- rows -------------------------------------------------------------------

TABLES="$(./scripts/db-query.sh --prod "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name;" \
  | python3 -c "import json,sys; print(' '.join(r['table_name'] for r in json.load(sys.stdin)))")"

for table in $TABLES; do
  save_query "$table" "select * from public.${table}" "$WORK/${table}.json"
done

# --- logins -----------------------------------------------------------------

save_query auth_users \
  "select id, email, created_at, updated_at, email_confirmed_at, last_sign_in_at,
          raw_app_meta_data, raw_user_meta_data
     from auth.users order by created_at" \
  "$WORK/auth_users.json"

save_query auth_identities \
  "select id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at
     from auth.identities order by created_at" \
  "$WORK/auth_identities.json"

# --- photos -----------------------------------------------------------------

save_query storage_objects \
  "select bucket_id, name, (metadata->>'size')::bigint as size, metadata->>'mimetype' as mimetype,
          created_at, updated_at
     from storage.objects order by bucket_id, name" \
  "$WORK/storage_objects.json"

if [ ! -f "$ENV_FILE" ]; then
  echo "No $ENV_FILE, so the photos cannot be downloaded. See docs/DATABASE.md." >&2
  exit 1
fi

SUPABASE_URL="$(sed -n 's/^NEXT_PUBLIC_SUPABASE_URL=//p' "$ENV_FILE" | tr -d "\"'")"
SERVICE_KEY="$(sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p' "$ENV_FILE" | tr -d "\"'")"
if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_KEY" ]; then
  echo "$ENV_FILE is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." >&2
  exit 1
fi

# The key goes to curl in a header file (-H @file) rather than as an argument:
# arguments are visible to every process on the machine through ps. printf is a
# shell builtin, so writing the file does not expose it either.
HEADERS="$(umask 077 && mktemp)"
printf 'Authorization: Bearer %s\napikey: %s\n' "$SERVICE_KEY" "$SERVICE_KEY" > "$HEADERS"
unset SERVICE_KEY

printf '%-24s' photos
python3 - "$WORK/storage_objects.json" "$MIRROR" "$SUPABASE_URL" "$HEADERS" <<'PY'
import json, os, subprocess, sys, urllib.parse

listing, mirror, base, headers = sys.argv[1:5]
fetched = kept = 0

for obj in json.load(open(listing)):
    # Names look like "<uploader auth id>/<uuid>.jpg". Refuse anything that
    # could write outside the mirror.
    rel = os.path.normpath(os.path.join(obj['bucket_id'], obj['name']))
    if rel.startswith('..') or os.path.isabs(rel):
        sys.exit(f"refusing an object name that leaves the mirror: {obj['bucket_id']}/{obj['name']}")

    dest = os.path.join(mirror, rel)
    size = obj['size']
    if os.path.exists(dest) and size is not None and os.path.getsize(dest) == size:
        kept += 1
        continue

    os.makedirs(os.path.dirname(dest), exist_ok=True)
    url = '{}/storage/v1/object/{}/{}'.format(
        base.rstrip('/'), urllib.parse.quote(obj['bucket_id']), urllib.parse.quote(obj['name']))
    partial = dest + '.partial'
    subprocess.run(['curl', '-sS', '--fail', '-H', '@' + headers, '-o', partial, url], check=True)

    if size is not None and os.path.getsize(partial) != size:
        os.remove(partial)
        sys.exit(f"{rel} downloaded as {os.path.getsize(partial)} bytes, expected {size}")
    os.replace(partial, dest)
    fetched += 1

print(f"{fetched} downloaded, {kept} already mirrored")
PY

rm -f "$HEADERS"
HEADERS=""

# Everything is written, so this is a real snapshot now. Clear the trap first
# or the rename target is deleted on the way out.
trap - EXIT
rm -rf "$DEST"
mv "$WORK" "$DEST"

echo
echo "Snapshot written to $DEST"
echo "Photos mirrored in $MIRROR"
