#!/usr/bin/env bash
set -euo pipefail
# Strict gate before any Docker/DB/fixture activity; all credentials are test-only.
node --input-type=module -e "import {isolatedDestination} from './tools/pos-capacity/runner.mjs'; isolatedDestination(process.env)"
test "$MWS_CAPACITY_MODE" = priority20
test "$MWS_CAPACITY_OUTPUT" = /tmp/mws-capacity20
MWS_CAPACITY_DB_CPUS="${MWS_CAPACITY_DB_CPUS:-0.10}"
case "$MWS_CAPACITY_DB_CPUS" in 0.10|0.50|2.00) ;; *) echo "Unsupported isolated DB CPU model" >&2; exit 1 ;; esac
MWS_CAPACITY_APP_CPUS="${MWS_CAPACITY_APP_CPUS:-0.15}"
case "$MWS_CAPACITY_APP_CPUS" in 0.15|1.00) ;; *) echo "Unsupported isolated APP CPU model" >&2; exit 1 ;; esac
mkdir -p "$MWS_CAPACITY_OUTPUT"
MONITOR_PID=''
cleanup() {
  if [ -n "$MONITOR_PID" ]; then kill "$MONITOR_PID" 2>/dev/null || true; wait "$MONITOR_PID" 2>/dev/null || true; fi
  python3 tools/pos-capacity/resources.py state || true
  docker rm -f mws-capacity-app mws-capacity-db >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker pull postgres:18
docker pull node:20-bookworm
docker run -d --name mws-capacity-db --network host --cpus="$MWS_CAPACITY_DB_CPUS" --memory=256m --memory-swap=256m \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=isolated-only -e POSTGRES_DB=myworkstation_capacity20_test postgres:18 \
  -c shared_buffers=64MB -c work_mem=1654kB -c maintenance_work_mem=16MB \
  -c max_connections=103 -c max_parallel_workers_per_gather=1
for attempt in $(seq 1 120); do
  # initdb's temporary server accepts Unix sockets before final TCP readiness.
  if docker exec mws-capacity-db pg_isready -h 127.0.0.1 -U postgres -d myworkstation_capacity20_test >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec mws-capacity-db pg_isready -h 127.0.0.1 -U postgres -d myworkstation_capacity20_test
npm run prisma:push -w server
./node_modules/.bin/prisma db execute --file server/prisma/migrations/20260825130500_netlink_prepaid_storage/migration.sql --schema server/prisma/schema.prisma
./node_modules/.bin/prisma db execute --file server/prisma/migrations/20260826210000_netlink_fiscal_receipt_gate/migration.sql --schema server/prisma/schema.prisma
npm run seed -w server
docker run -d --name mws-capacity-app --network host --cpus="$MWS_CAPACITY_APP_CPUS" --memory=512m --memory-swap=512m \
  -v "$PWD:/app" -w /app -e NODE_ENV -e DATABASE_URL -e JWT_SECRET \
  -e INITIAL_ADMIN_EMAIL -e INITIAL_ADMIN_PASSWORD -e KAT_OWNER_EMAIL -e KAT_OWNER_NAME \
  -e MWS_E2E_TERMINAL_OVERRIDE=1 -e PORT=8080 node:20-bookworm npm run start -w server
python3 tools/pos-capacity/resources.py monitor &
MONITOR_PID=$!
node --input-type=module <<'NODE'
import {setTimeout as delay} from 'node:timers/promises';
for(let attempt=0;attempt<600;attempt++){
  try{const r=await fetch('http://127.0.0.1:8080/api/health',{signal:AbortSignal.timeout(2000),redirect:'error'});if(r.ok&&(await r.json()).ok===true)process.exit(0)}catch{}
  await delay(1000);
}
throw new Error('Isolated capped app startup failed');
NODE
python3 tools/pos-capacity/resources.py manifest
node server/e2e/pos-capacity-flow.mjs
python3 tools/pos-capacity/resources.py state
