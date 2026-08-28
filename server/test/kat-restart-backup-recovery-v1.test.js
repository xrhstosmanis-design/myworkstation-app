import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(repo,file),"utf8");
const route=read("server/src/routes/platform-admin.js"),ui=read("client/src/components/platform/PlatformAdminApp.jsx"),installer=read("tools/windows-kat-preflight/Install-KAT.ps1"),recovery=read("tools/windows-kat-preflight/Recover-KAT.ps1"),dryLauncher=read("tools/windows-kat-preflight/RECOVER_KAT_DRY_RUN.cmd"),manifest=JSON.parse(read("tools/windows-kat-preflight/package-manifest.json")),deploy=read(".github/workflows/deploy-render.yml");

test("backup captures schema and exact application revision in its checksum",()=>{
  assert.match(route,/revision:\{app:String\(process\.env\.RENDER_GIT_COMMIT/);
  assert.match(route,/schema:"MYWORKSTATION_PILOT_SAFETY_BACKUP_V1"/);
  assert.match(route,/crypto\.createHash\("sha256"\)\.update\(serialized\)/);
  assert.match(installer,/appRevision=\[string\]\$health\.revision/);
});

test("restore verification produces a non-mutating recovery report and exact next action",()=>{
  const verify=route.slice(route.indexOf('pilot-backup/verify'),route.indexOf('router.put("/companies/:companyId/stores/:storeId/store-mode-manager'));
  assert.match(verify,/dryRunResult:"PASSED"/);assert.match(verify,/rollbackCheckpointRequired:true/);assert.match(verify,/nextManualAction:/);
  assert.match(verify,/mutatedDatabase:false/);assert.match(verify,/secretsRestored:false/);
  assert.doesNotMatch(verify,/DELETE FROM|TRUNCATE|DROP TABLE/);
  assert.match(ui,/report\.backupSchemaRevision/);assert.match(ui,/report\.backupAppRevision/);assert.match(ui,/report\.nextManualAction/);
});

test("Windows recovery dry-run validates state without changing the shortcut",()=>{
  assert.match(recovery,/param\(\[switch\]\$DryRun\)/);assert.match(recovery,/if\(!\$DryRun\)\{/);
  assert.match(recovery,/State SHA-256/);assert.match(recovery,/Previous shortcut SHA-256/);assert.match(recovery,/DRY_RUN_PASSED/);
  assert.match(dryLauncher,/Recover-KAT\.ps1" -DryRun/);assert.match(dryLauncher,/NO SHORTCUT CHANGE/);
});

test("recovery package manifest verifies every updated file",()=>{
  for(const entry of manifest.files){const bytes=fs.readFileSync(path.join(repo,"tools/windows-kat-preflight",entry.name));assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),entry.sha256,entry.name)}
  assert.ok(manifest.files.some(entry=>entry.name==="RECOVER_KAT_DRY_RUN.cmd"));
});

test("deployment preserves a rollback checkpoint before an exact-revision restart",()=>{
  const capture=deploy.indexOf("Capture rollback checkpoint"),preserve=deploy.indexOf("Preserve rollback checkpoint"),trigger=deploy.indexOf("Trigger Render deployment"),wait=deploy.indexOf("Wait for exact production revision");
  assert.ok(capture>=0&&preserve>capture&&trigger>preserve&&wait>trigger);
  assert.match(deploy,/h\.revision===process\.env\.EXPECTED_REVISION/);
});
