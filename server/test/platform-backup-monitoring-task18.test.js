import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/backup-monitor.js",import.meta.url),"utf8");
const index=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const platform=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const job=await readFile(new URL("../../ops/backup/run-backup.sh",import.meta.url),"utf8");
const render=await readFile(new URL("../../render.yaml",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");

test("task 18 schedules one off-site encrypted backup every three hours",()=>{
  assert.match(render,/name: myworkstation-db-backup/);
  assert.match(render,/schedule: "0 \*\/3 \* \* \*"/);
  assert.match(render,/S3_BUCKET_NAME/);
  assert.match(job,/pg_dump --format=custom/);
  assert.match(job,/--sse AES256/);
  assert.match(job,/get-bucket-versioning/);
  assert.match(job,/get-bucket-encryption/);
});

test("restore dry-run inspects the archive without connecting pg_restore to a database",()=>{
  assert.match(job,/pg_restore --list "\$archive"/);
  assert.doesNotMatch(job,/pg_restore[^\n]*(?:DATABASE_URL|--dbname|--host)/);
  assert.doesNotMatch(job,/(?:DROP DATABASE|TRUNCATE|psql[^\n]*DATABASE_URL)/i);
  assert.match(job,/rm -f "\$archive" "\$toc"/);
});

test("backup monitor is signed, replay-bounded and exposes only Super Admin status",()=>{
  assert.match(route,/createHmac\("sha256",secret\)/);
  assert.match(route,/5\*60\*1000/);
  assert.match(route,/timingSafeEqual/);
  assert.match(route,/PlatformBackupRun/);
  assert.match(index,/app\.use\("\/api\/system\/backup-monitor",backupMonitorRoutes\)/);
  assert.match(platform,/router\.get\("\/backup-monitoring"/);
  assert.match(ui,/data-backup-monitoring="true"/);
  assert.match(ui,/Απαιτείται εξωτερική ρύθμιση/);
});

test("successful monitoring requires checksum size and passed archive dry-run",()=>{
  assert.match(route,/status==="SUCCEEDED"&&\(!checksum\|\|sizeBytes<1\|\|dryRunStatus!=="PASSED"\)/);
  assert.match(route,/status:failed\?"FAILED":overdue\?"OVERDUE":"OK"/);
  assert.doesNotMatch(route,/password|AWS_SECRET_ACCESS_KEY|DATABASE_URL/);
});
