import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const dir=new URL("../../tools/windows-rbs-observer/",import.meta.url);
const preflight=fs.readFileSync(new URL("Preflight-Observer.ps1",dir),"utf8");

test("observer preflight stays compatible with Windows PowerShell 5",()=>{
  assert.doesNotMatch(preflight,/\+=\s*\(if\s*\(/);
});
const observer=fs.readFileSync(new URL("Observer.ps1",dir),"utf8");
const installer=fs.readFileSync(new URL("Install-Observer.ps1",dir),"utf8");
test("Windows observer uploads metadata only",()=>{assert.match(observer,/payloadHash=\$meta\.hash/);assert.match(observer,/byteLength=\$meta\.length/);assert.doesNotMatch(observer,/payload=/);assert.doesNotMatch(observer,/ReadAllText|ReadAllBytes/)});
test("Windows observer durably queues metadata during temporary network loss",()=>{const start=observer.indexOf("function Send-ObservedFile"),capture=observer.slice(start,observer.indexOf('if(!(Test-Path -LiteralPath $ConfigPath))',start));assert.match(observer,/pending-metadata/);assert.match(capture,/Save-PendingMetadata \$event/);assert.match(capture,/Flush-PendingMetadata/);assert.ok(capture.indexOf("Save-PendingMetadata $event")<capture.indexOf("Flush-PendingMetadata"));assert.match(observer,/Remove-Item -LiteralPath \$file\.FullName -Force/);assert.match(observer,/REGISTER deferred/)});
test("Windows observer never sends fiscal commands",()=>{assert.doesNotMatch(observer,/issue|cancel|receipt|print/i);assert.match(observer,/direction="OUTBOUND"/)});
test("installer backs up protected KAT folders before installing",()=>{for(const path of ["C:\\_km","C:\\Kiosk Manager","C:\\CapDriverService","C:\\capture"])assert.ok(installer.includes(path));assert.ok(installer.indexOf("foreach($path in $protected)")<installer.indexOf("Copy-Item"))});
test("installer needs no Node Git or user password",()=>{assert.doesNotMatch(installer,/node|npm|git|password/i);assert.match(installer,/DataProtectionScope\]::LocalMachine/)});
test("USB preflight verifies the KAT PC without touching fiscal applications",()=>{assert.match(installer,/Preflight-Observer\.ps1/);assert.match(installer,/-ForInstall/);assert.match(preflight,/Observation path/);assert.match(preflight,/KAT protected folders/);assert.match(preflight,/Free disk/);assert.match(preflight,/\/api\/health/);assert.match(preflight,/READ ONLY \/ NO FISCAL COMMANDS/);assert.doesNotMatch(preflight,/Remove-Item|Copy-Item|Move-Item|schtasks\.exe/)});
