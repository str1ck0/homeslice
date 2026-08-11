#!/usr/bin/env bash
# Run SQL against the linked Supabase project via the Management API.
#
#   ./scripts/db-query.sh "select count(*) from profiles;"
#   ./scripts/db-query.sh -f supabase/migrations/20260811000000_baseline.sql
#
# Uses the access token the Supabase CLI already stored in the macOS keychain,
# so there is no password to keep anywhere. The CLI wraps the token with
# go-keyring's base64 prefix, which is why it is unwrapped below.
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-zwnhbhymjaqjpuxfcbam}"

raw="$(security find-generic-password -s 'Supabase CLI' -w)"
token="${raw#go-keyring-base64:}"
if [ "$token" != "$raw" ]; then
  token="$(printf '%s' "$token" | base64 -d)"
fi

if [ "${1:-}" = "-f" ]; then
  sql_file="$2"
else
  sql_file="$(mktemp)"
  trap 'rm -f "$sql_file"' EXIT
  printf '%s' "${1:?usage: db-query.sh \"<sql>\" | -f <file>}" > "$sql_file"
fi

payload="$(mktemp)"
trap 'rm -f "$payload"' EXIT
python3 -c "
import json, sys
print(json.dumps({'query': open(sys.argv[1]).read()}))
" "$sql_file" > "$payload"

curl -sS -X POST \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  --data @"$payload"
