#!/bin/sh
set -eu
# Keep a default/manual container invocation as the original full backup.
if [ "${1:-}" = "/backup/run-jobs.sh" ]; then
  shift
  exec /backup/run-jobs.sh "$@"
fi
exec /backup/run-backup.sh "$@"
