import assert from "node:assert/strict";
import fs from "node:fs";

const read=path=>fs.readFileSync(new URL(`../../${path}`,import.meta.url),"utf8");

const ci=read(".github/workflows/ci.yml");
const packageJson=read("package.json");
const serverPackage=read("server/package.json");
const observerInstaller=read("tools/windows-rbs-observer/Install-Observer.ps1");
const observer=read("tools/windows-rbs-observer/Observer.ps1");
const windowsPreflight=read("tools/windows-kat-preflight/Preflight-KAT.ps1");
const backupVerify=read("server/src/patch-pilot-backup-verify.js");

for(const flow of [
  "live-operator-permissions-flow.mjs",
  "operator-shift-close-audit-flow.mjs",
  "close-shift-permission-separation-flow.mjs",
  "eftpos-shift-close-flow.mjs",
  "pos-to-shift-backoffice-flow.mjs",
  "kat-pos-regression-flow.mjs",
  "kat-final-volume-regression-flow.mjs",
  "multi-pos-shift-isolation-flow.mjs",
  "kat-online-ordering-flow.mjs",
  "kat-preparation-milk-stock-flow.mjs",
  "kat-windows-preflight-source-invariants.mjs"
]) assert.ok(ci.includes(flow),`CI is missing required KAT gate: ${flow}`);

for(const patch of [
  "patch-close-shift-client-permission.js",
  "patch-kat-offline-catalog.js",
  "patch-kat-offline-sale-queue.js"
]) assert.ok(packageJson.includes(patch),`Root build is missing required patch: ${patch}`);

for(const patch of [
  "patch-close-shift-permission.js",
  "patch-multi-pos-shifts.js",
  "patch-multi-pos-close-guard.js",
  "patch-pilot-backup-verify.js"
]) assert.ok(serverPackage.includes(patch),`Server start is missing required patch: ${patch}`);

assert.match(observerInstaller,/READ_ONLY/);
assert.match(observerInstaller,/ProtectedData/);
assert.match(observerInstaller,/robocopy/);
assert.match(observer,/pending-metadata/);
assert.match(observer,/payloadHash/);
assert.doesNotMatch(observer,/Invoke-Expression|Start-Process\s+[^\n]*Kiosk|Remove-Item\s+[^\n]*(?:_km|Kiosk Manager|CapDriverService|capture)/i);

assert.match(windowsPreflight,/SOFTWARE PREFLIGHT READY/);
assert.match(windowsPreflight,/\/api\/health/);
assert.doesNotMatch(windowsPreflight,/Remove-Item|Set-Service|Stop-Service|Start-Service|schtasks\.exe\s+\/Create|reg\.exe\s+add|Invoke-Expression/i);

assert.match(backupVerify,/DRY_RUN_ONLY/);
assert.match(backupVerify,/mutatedDatabase:false/);
assert.match(backupVerify,/secretsRestored:false/);
assert.match(backupVerify,/sha256/);

console.log("KAT pre-install software readiness invariants passed");
