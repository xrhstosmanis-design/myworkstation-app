#!/bin/sh
# Scheduled every five minutes. Full backup retains the original eight UTC slots.
set -eu
here="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
case "$(date -u +%H:%M)" in
  00:00|03:00|06:00|09:00|12:00|15:00|18:00|21:00) "$here/run-backup.sh" ;;
esac
python3 "$here/lifecycle/worker.py"
if [ "${ASSISTANT_HISTORY_CLEANUP_ENABLED:-}" = "true" ]; then
  exec python3 "$here/history/cleanup.py"
fi
