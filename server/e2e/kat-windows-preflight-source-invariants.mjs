import assert from "node:assert/strict";
import fs from "node:fs";

const read=path=>fs.readFileSync(new URL(`../../${path}`,import.meta.url),"utf8");
const ps=read("tools/windows-kat-preflight/Preflight-KAT.ps1");
const cmd=read("tools/windows-kat-preflight/PRECHECK_KAT.cmd");

for(const required of ["MyWorkStation API","Free disk","Supported browser","SOFTWARE PREFLIGHT READY","READ ONLY / NO INSTALLATION / NO FISCAL COMMANDS"]){
  assert.ok(ps.includes(required),`KAT preflight missing: ${required}`);
}
assert.ok(ps.includes("/api/health"),"KAT preflight must verify API health");
assert.ok(ps.includes("observer.config.json"),"KAT preflight must report Observer presence");
assert.doesNotMatch(ps,/Remove-Item|Set-Service|Stop-Service|Start-Service|schtasks\.exe\s+\/Create|reg\.exe\s+add|Invoke-Expression/i,"KAT preflight must remain non-destructive");
assert.ok(cmd.includes("Preflight-KAT.ps1"),"KAT launcher must call the official preflight");

console.log("KAT Windows pilot preflight safety invariants passed");
