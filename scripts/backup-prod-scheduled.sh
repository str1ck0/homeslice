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

say "starting scheduled backup"

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
  # A failed backup is worth interrupting someone for. This is the only
  # notification in the whole app, and it is deliberately not about money.
  /usr/bin/osascript -e 'display notification "Check ~/homeslice-backups/backup.log" with title "Homeslice backup failed"' 2>/dev/null || true
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
