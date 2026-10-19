#!/usr/bin/env bash
set -Eeuo pipefail
# Do not accept copied production configuration. The runtime validates these
# inherited values before any DB is opened; it never prints their contents.
node --input-type=module -e '
  const forbidden = Object.keys(process.env).some(k => process.env[k] && (/^(DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL|JWT_SECRET|PGHOST|PGHOSTADDR|PGPORT|PGDATABASE|PGUSER|PGPASSWORD|PGPASSFILE|PGOPTIONS|PGSERVICE|PGSERVICEFILE|PGSSLMODE|PGSSLROOTCERT)$/.test(k) || /(?:DATABASE|POSTGRES|SUPABASE).*(?:URL|KEY|PASSWORD)$/i.test(k) || /^(SMTP_|SENDGRID_|MAILGUN_|NETLINK_|RBS_|MYDATA_|STRIPE_|OPENAI_API_KEY|AZURE_OPENAI_|VAPID_PRIVATE)/i.test(k)));
  if (forbidden) { console.error("Inherited credentials or database configuration are forbidden in this laboratory."); process.exit(1); }
'
export DATABASE_URL='postgresql://whlab_runtime@127.0.0.1:5432/wholesale_lab?schema=public&connection_limit=4&pool_timeout=10'
export LAB_BOOT_NONCE="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
LAB_PGDATA="$(mktemp -d /tmp/wholesale-lab.XXXXXX)"
LAB_NODE_PID=''
shutdown() {
  trap - TERM INT EXIT
  if [[ -n "$LAB_NODE_PID" ]]; then kill -TERM "$LAB_NODE_PID" 2>/dev/null || true; wait "$LAB_NODE_PID" 2>/dev/null || true; fi
  pg_ctl -D "$LAB_PGDATA" -m fast -w stop >/dev/null 2>&1 || true
}
trap shutdown TERM INT EXIT
initdb -D "$LAB_PGDATA" -U whlab_runtime --auth-local=trust --auth-host=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null
pg_ctl -D "$LAB_PGDATA" -l /tmp/wholesale-lab-postgres.log -o '-h 127.0.0.1 -p 5432 -c unix_socket_directories=/tmp -c shared_buffers=16MB -c max_connections=12 -c work_mem=1MB -c maintenance_work_mem=16MB -c max_wal_size=64MB -c min_wal_size=32MB -c log_statement=none' -w start >/dev/null
createdb -h 127.0.0.1 -U whlab_runtime wholesale_lab
node /app/ops/wholesale-lab/runtime.mjs --initialize &
LAB_NODE_PID=$!
wait "$LAB_NODE_PID"
