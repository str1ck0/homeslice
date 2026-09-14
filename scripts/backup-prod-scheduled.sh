#!/usr/bin/env bash
# The unattended wrapper around backup-prod.sh: run it, prune old ones, log.
#
# Installed as a launchd agent by scripts/install-backup-schedule.sh. Run it by
# hand any time — it is the same backup, just with housekeeping attached.
#
# launchd starts jobs with almost no environment, so PATH is set explicitly
# below. Without it, python3 and curl are not found and every scheduled run
# fails silently, which is the worst possible failure mode for a backup.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

OUT_DIR="${HOMESLICE_BACKUP_DIR:-$HOME/homeslice-backups}"
LOG="$OUT_DIR/backup.log"
KEEP="${HOMESLICE_BACKUP_KEEP:-30}"

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

say() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }

# Hours since the newest complete snapshot, or 9999 when there is none.
hours_since_last_snapshot() {
  local newest then_s
  newest="$(cd "$OUT_DIR" && ls -1 | grep -E '^[0-9]{8}-[0-9]{6}$' | sort -r | head -1)"
  [ -z "$newest" ] && { echo 9999; return; }
  then_s="$(date -j -f '%Y%m%d-%H%M%S' "$newest" +%s)"
  echo $(( ($(date +%s) - then_s) / 3600 ))
}

# A failed attempt is not worth interrupting anyone for — the next hour retries.
# A day and a half with no snapshot is.
notify_if_stale() {
  local age
  age="$(hours_since_last_snapshot)"
  if [ "$age" -ge 36 ]; then
    /usr/bin/osascript -e "display notification \"Newest snapshot is ${age}h old. Check ~/homeslice-backups/backup.log\" with title \"Homeslice backups are failing\"" 2>/dev/null || true
  fi
}

# launchd runs this hourly; the goal is one snapshot a day. Hourly is what lets a
# failed attempt recover the same day rather than the next.
if ls -1 "$OUT_DIR" | grep -qE "^$(date +%Y%m%d)-[0-9]{6}$"; then
  exit 0
fi

say "starting scheduled backup"

# launchd runs a missed job the instant the Mac wakes, before Wi-Fi has
# reconnected. Every failure from 4 to 14 September was exactly that — "Could
# not resolve host: api.supabase.com" — and with one attempt a day, each cost a
# whole day of backups. So wait for the network first, ten minutes at most.
waited=0
until curl -s -o /dev/null --max-time 5 https://api.supabase.com/; do
  if [ "$waited" -ge 600 ]; then
    say "no network after ${waited}s — will try again next hour"
    notify_if_stale
    exit 1
  fi
  sleep 15
  waited=$((waited + 15))
done
[ "$waited" -gt 0 ] && say "network up after ${waited}s"

if output="$(./scripts/backup-prod.sh 2>&1)"; then
  dest="$(printf '%s' "$output" | sed -n 's/^Snapshot written to //p' | tail -1)"
  # Count the files rather than parse the output: backup-prod.sh writes the
  # table name to stdout and its "→ PRODUCTION" notice to stderr, so with 2>&1
  # the two interleave mid-line and no pattern over the text is trustworthy.
  tables="$(ls -1 "$dest"/*.json 2>/dev/null | wc -l | tr -d ' ')"
  rows="$(python3 -c "
import glob, json, sys
print(sum(len(json.load(open(f))) for f in glob.glob(sys.argv[1] + '/*.json')))
" "$dest" 2>/dev/null || echo '?')"
  say "ok — $dest ($tables tables, $rows rows)"
else
  status=$?
  say "FAILED (exit $status)"
  printf '%s\n' "$output" | sed 's/^/    /' >> "$LOG"
  # The only notification in the whole app, and deliberately not about money.
  notify_if_stale
  exit "$status"
fi

# --- prune ------------------------------------------------------------------
# Keep the most recent $KEEP snapshots. At ~130K each that is trivial disk, so
# the limit exists to keep the directory readable rather than to save space.
# env-* directories are credential copies, not snapshots, and are never pruned.
pruned=0
while read -r old; do
  [ -z "$old" ] && continue
  rm -rf "$OUT_DIR/$old"
  pruned=$((pruned + 1))
done < <(cd "$OUT_DIR" && ls -1 | grep -E '^[0-9]{8}-[0-9]{6}$' | sort -r | tail -n +"$((KEEP + 1))")

[ "$pruned" -gt 0 ] && say "pruned $pruned old snapshot(s), keeping $KEEP"

exit 0
