import assert from "node:assert/strict";
import fs from "node:fs";

const read=path=>fs.readFileSync(path,"utf8");
const install=read("tools/windows-rbs-observer/Install-Observer.ps1");
const preflight=read("tools/windows-rbs-observer/Preflight-Observer.ps1");
const observer=read("tools/windows-rbs-observer/Observer.ps1");

for(const path of ["C:\\_km","C:\\Kiosk Manager","C:\\CapDriverService","C:\\capture"]){
  assert.ok(install.includes(path),`Installer no longer protects ${path}`);
}
assert.ok(install.includes("robocopy"),"Installer lost pre-change backup");
assert.ok(install.indexOf("robocopy")<install.indexOf("/api/cloud/v1/pair"),"Pairing now happens before protected-folder backup");
assert.ok(install.includes('observerMode="READ_ONLY"'),"Installer no longer declares read-only observer mode");
assert.ok(install.includes('commandsEnabled=$false'),"Installer unexpectedly enables commands");
assert.ok(install.includes("ProtectedData]::Protect"),"Pairing token is no longer DPAPI-protected");
assert.ok(install.includes("DataProtectionScope]::LocalMachine"),"Pairing token is not protected for LocalMachine service use");
assert.ok(install.includes("/SC ONSTART")&&install.includes("/RU SYSTEM"),"Observer startup task is no longer SYSTEM/ONSTART");

assert.ok(preflight.includes("/api/health"),"KAT preflight no longer checks MyWorkStation health");
assert.ok(preflight.includes("Observation path"),"KAT preflight no longer validates capture path");
assert.ok(preflight.includes("Free disk"),"KAT preflight no longer checks disk capacity");
assert.ok(preflight.includes("READ ONLY / NO FISCAL COMMANDS"),"KAT preflight lost read-only safety declaration");

assert.ok(observer.includes("FileSystemWatcher"),"Observer no longer watches capture files");
assert.ok(observer.includes("Get-SharedHash"),"Observer no longer hashes captured files");
assert.ok(observer.includes("payloadHash")&&observer.includes("byteLength"),"Observer metadata integrity fields are missing");
assert.ok(observer.includes("pending-metadata"),"Observer offline metadata spool is missing");
assert.ok(!/Set-Content[^\n]*(?:_km|Kiosk Manager|CapDriverService|capture)/i.test(observer),"Observer appears to write inside protected fiscal folders");
assert.ok(!/Remove-Item[^\n]*(?:_km|Kiosk Manager|CapDriverService|capture)/i.test(observer),"Observer appears to delete inside protected fiscal folders");

console.log("KAT Windows RBS observer safety invariants passed");
