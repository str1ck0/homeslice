#!/usr/bin/env bash
# Install (or remove) the daily production backup as a launchd agent.
#
#   ./scripts/install-backup-schedule.sh            # install, runs daily at 13:00
#   ./scripts/install-backup-schedule.sh --at 09:30 # a different time
#   ./scripts/install-backup-schedule.sh --status   # is it loaded? when did it last run?
#   ./scripts/install-backup-schedule.sh --uninstall
#
# launchd rather than cron, for two reasons that matter here: a laptop is
# usually asleep at any given scheduled moment, and launchd runs a missed job
# on wake where cron simply skips it. It also runs inside the user's login
# session, which is what gives it access to the keychain token the backup needs.
#
# The consequence, stated plainly: backups happen when you are logged in. If
# the Mac is off or logged out for a week, there are no backups for that week.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.str1ck0.homeslice.backup"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
HOUR=13
MINUTE=0

case "${1:-}" in
  --uninstall)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Removed $LABEL. Existing backups in ~/homeslice-backups are untouched."
    exit 0
    ;;
  --status)
    if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
      echo "loaded: $LABEL"
      launchctl print "gui/$(id -u)/$LABEL" | grep -E 'state|last exit code|runs =' | sed 's/^/  /'
    else
      echo "not loaded. Install with: ./scripts/install-backup-schedule.sh"
    fi
    echo
    echo "Recent log lines:"
    tail -5 "${HOMESLICE_BACKUP_DIR:-$HOME/homeslice-backups}/backup.log" 2>/dev/null | sed 's/^/  /' \
      || echo "  (no log yet)"
    exit 0
    ;;
  --at)
    HOUR="${2%%:*}"
    MINUTE="${2##*:}"
    # Strip a leading zero so 09 is nine and not an invalid octal literal.
    HOUR=$((10#$HOUR)); MINUTE=$((10#$MINUTE))
    ;;
esac

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>$REPO/scripts/backup-prod-scheduled.sh</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>$HOUR</integer>
    <key>Minute</key><integer>$MINUTE</integer>
  </dict>

  <key>WorkingDirectory</key>
  <string>$REPO</string>

  <key>StandardOutPath</key>
  <string>$HOME/homeslice-backups/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/homeslice-backups/launchd.err.log</string>

  <key>ProcessType</key>
  <string>Background</string>
  <key>LowPriorityIO</key>
  <true/>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

printf 'Installed %s — daily at %02d:%02d.\n' "$LABEL" "$HOUR" "$MINUTE"
echo "  script: $REPO/scripts/backup-prod-scheduled.sh"
echo "  log:    ~/homeslice-backups/backup.log"
echo
echo "Run it once now to check it works:"
echo "  launchctl kickstart -p gui/$(id -u)/$LABEL"
