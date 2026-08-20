#!/usr/bin/env bash
# Run SQL against a Homeslice database.
#
#   ./scripts/db-query.sh "select count(*) from profiles;"          # local stack
#   ./scripts/db-query.sh -f supabase/migrations/<file>.sql         # local stack
#   ./scripts/db-query.sh --prod "select count(*) from profiles;"   # production
#
# The default is the LOCAL stack. It used to be production, and there was no
# way to say "local" at all — which is how integration tests came to leave nine
# stray profiles in the live project. Reaching production is now something you
# type on purpose, and the script says so before it does it.
#
# Production goes through the Management API using the access token the Supabase
# CLI stored in the macOS keychain, so there is no password anywhere. The CLI
# wraps the token with go-keyring's base64 prefix, which is why it is unwrapped
# below. Local goes through psql against 127.0.0.1:54322.
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET=local
if [ "${1:-}" = "--prod" ]; then
  TARGET=prod
  shift
elif [ "${1:-}" = "--local" ]; then
  shift
fi

# Anything this script creates goes in scratch/ and is cleaned up on exit.
# A file passed with -f belongs to the caller and is never touched: an earlier
# version of this cleanup listed "$sql_file" unconditionally and deleted the
# migration it had just applied.
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

if [ "${1:-}" = "-f" ]; then
  sql_file="$2"
else
  sql_file="$scratch/query.sql"
  printf '%s' "${1:?usage: db-query.sh [--local|--prod] \"<sql>\" | -f <file>}" > "$sql_file"
fi

if [ "$TARGET" = local ]; then
  exec psql "${SUPABASE_LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}" \
    -v ON_ERROR_STOP=1 -f "$sql_file"
fi

# --- production ------------------------------------------------------------

PROJECT_REF="${SUPABASE_PROJECT_REF:-zwnhbhymjaqjpuxfcbam}"
echo "→ PRODUCTION (${PROJECT_REF}). Real people's records." >&2

raw="$(security find-generic-password -s 'Supabase CLI' -w)"
token="${raw#go-keyring-base64:}"
if [ "$token" != "$raw" ]; then
  token="$(printf '%s' "$token" | base64 -d)"
fi

payload="$scratch/payload.json"
python3 -c "
import json, sys
print(json.dumps({'query': open(sys.argv[1]).read()}))
" "$sql_file" > "$payload"

curl -sS -X POST \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  --data @"$payload"
