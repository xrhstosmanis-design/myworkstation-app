import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(repo,file),"utf8");
const route=read("server/src/routes/platform-admin.js");
const ui=read("client/src/components/platform/PlatformAdminApp.jsx");

test("pilot backup verification is permanent source and remains dry run",()=>{
  assert.match(route,/PILOT_BACKUP_RESTORE_VERIFY_V1/);
  assert.match(route,/actual!==expected/);
  assert.match(route,/mode:"DRY_RUN_ONLY"/);
  assert.match(route,/mutatedDatabase:false/);
  assert.match(route,/secretsRestored:false/);
  const verify=route.slice(route.indexOf('pilot-backup/verify'),route.indexOf('router.put("/companies/:companyId/stores/:storeId/store-mode-manager'));
  assert.doesNotMatch(verify,/INSERT INTO|UPDATE "|DELETE FROM|upsert|createMany/);
});

test("Super Admin can select and verify the downloaded JSON",()=>{
  assert.match(ui,/const verifyPilotBackup=async event/);
  assert.match(ui,/file\.size>10\*1024\*1024/);
  assert.match(ui,/JSON\.parse\(await file\.text\(\)\)/);
  assert.match(ui,/pilot-backup\/verify/);
  assert.match(ui,/accept="application\/json,\.json"/);
  assert.match(ui,/Έλεγχος αρχείου backup/);
});
