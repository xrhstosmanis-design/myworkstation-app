import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(repo,file),"utf8");
const installer=read("tools/windows-kat-preflight/Install-KAT.ps1");
const preflight=read("tools/windows-kat-preflight/Preflight-KAT.ps1");
const launcher=read("tools/windows-kat-preflight/INSTALL_KAT.cmd");
const guide=read("tools/windows-kat-preflight/README_KAT.txt");
const recovery=read("tools/windows-kat-preflight/Recover-KAT.ps1");
const recoveryLauncher=read("tools/windows-kat-preflight/RECOVER_KAT.cmd");
const manifest=JSON.parse(read("tools/windows-kat-preflight/package-manifest.json"));
const realChecklist=read("tools/windows-kat-preflight/KAT_REAL_TEST_CHECKLIST.txt");

test("Windows PowerShell 5 preflight does not use if as a parenthesized expression",()=>{
  assert.doesNotMatch(preflight,/\+=\s*\(if\s*\(/);
  assert.match(preflight,/https:\/\/myworkstation-app\.onrender\.com/);
});

test("KAT installer requires one exact HTTPS terminal activation URL",()=>{
  assert.match(installer,/Parameter\(Mandatory=\$true\).*StoreModeUrl/);
  assert.match(installer,/\$uri\.Scheme -ne "https"/);
  assert.match(installer,/AbsolutePath -notmatch '\^\/store\/\[\^\/\]\+\/\?\$'/);
  assert.match(installer,/terminal=\(\[A-Za-z0-9_-\]/);
  assert.match(installer,/activation=\(\[A-Za-z0-9_-\]/);
  assert.match(launcher,/set \/p "installUrl=Installation link:/);
  assert.match(launcher,/Start-Process -FilePath '%~f0' -Verb RunAs/);
  assert.match(launcher,/-StoreModeUrl "%installUrl%"/);
});

test("permanent shortcut and recovery state never retain the one-time activation secret",()=>{
  assert.match(installer,/\$canonicalStoreModeUrl/);
  assert.match(installer,/"URL="\+\$canonicalStoreModeUrl/);
  assert.match(installer,/storeModeUrl=\$canonicalStoreModeUrl/);
  assert.match(installer,/terminalPos=\$terminalPos/);
  assert.match(installer,/schemaVersion=2/);
  assert.match(installer,/Start-Process \$uri\.AbsoluteUri/);
});

test("read-only preflight must pass before the shortcut is written",()=>{
  const preflight=installer.indexOf("Preflight-KAT.ps1");
  const blocker=installer.indexOf("προέλεγχος έχει blockers");
  const shortcut=installer.indexOf("[InternetShortcut]");
  assert.ok(preflight>=0&&blocker>preflight&&shortcut>blocker);
  assert.match(installer,/if\(\$LASTEXITCODE -ne 0\)/);
});

test("installer verifies every packaged safety and recovery file before preflight",()=>{
  assert.equal(manifest.schemaVersion,1);
  assert.ok(manifest.files.length>=4);
  for(const entry of manifest.files){
    assert.match(entry.name,/^[A-Za-z0-9_.-]+$/);
    assert.match(entry.sha256,/^[a-f0-9]{64}$/);
    const actual=fs.readFileSync(path.join(repo,"tools/windows-kat-preflight",entry.name));
    const hash=crypto.createHash("sha256").update(actual).digest("hex");
    assert.equal(hash,entry.sha256,`${entry.name} does not match package manifest`);
  }
  const integrity=installer.indexOf("Get-FileHash");
  const preflightRun=installer.indexOf("& powershell.exe");
  assert.ok(integrity>=0&&preflightRun>integrity);
  assert.match(installer,/Package integrity: VERIFIED/);
});

test("installer backs up an existing shortcut and touches no fiscal software",()=>{
  assert.match(installer,/InstallerBackups/);
  assert.match(installer,/Copy-Item -LiteralPath \$shortcut/);
  assert.doesNotMatch(installer,/C:\\_km|C:\\Kiosk Manager|C:\\CapDriverService|schtasks|Set-Service|Stop-Service|Start-Service|reg\.exe/i);
  assert.match(installer,/NO RBS \/ NO KIOSK MANAGER \/ NO CAPDRIVER CHANGES/);
});

test("installer needs no developer tools credentials or observer activation",()=>{
  for(const source of [installer,launcher])assert.doesNotMatch(source,/\b(?:node|npm|git|password|pin)\b/i);
  assert.match(guide,/RBS Observer είναι ξεχωριστή τεχνική εγκατάσταση/);
  assert.match(installer,/Observer: NOT INSTALLED/);
});

test("recovery rebuilds only the validated Store Mode shortcut from installation state",()=>{
  assert.match(installer,/store-mode-installation\.json/);
  assert.match(installer,/schemaVersion=2/);
  assert.match(recovery,/store-mode-installation\.json/);
  assert.match(recovery,/@\(1,2\) -notcontains/);
  assert.match(recovery,/\$uri\.Scheme -ne "https"/);
  assert.match(recovery,/AbsolutePath -notmatch '\^\/store\/\[\^\/\]\+\/\?\$'/);
  assert.match(recovery,/\$uri\.Query/);
  assert.match(recovery,/RecoveryBackups/);
  assert.match(recoveryLauncher,/Recover-KAT\.ps1/);
});

test("recovery does not alter fiscal software services registry or scheduled tasks",()=>{
  for(const source of [recovery,recoveryLauncher]){
    assert.doesNotMatch(source,/C:\\_km|C:\\Kiosk Manager|C:\\CapDriverService|schtasks|Set-Service|Stop-Service|Start-Service|reg\.exe|Remove-Item/i);
  }
  assert.match(recovery,/NO RBS \/ NO KIOSK MANAGER \/ NO CAPDRIVER CHANGES/);
  assert.match(guide,/Αν δεν υπάρχει έγκυρο installation state, σταματά χωρίς αλλαγές/);
});

test("real KAT checklist separates software, offline, hardware/provider and recovery tests",()=>{
  assert.match(realChecklist,/HOME PC - SOFTWARE PILOT/);
  assert.match(realChecklist,/OFFLINE \/ ΔΥΟ POS/);
  assert.match(realChecklist,/KAT PC - HARDWARE \/ PROVIDERS/);
  assert.match(realChecklist,/EFTPOS αποτυχία: καμία πώληση, καμία μείωση stock/);
  assert.match(realChecklist,/Υπάρχουσα ακύρωση -4,80 EUR/);
  assert.match(realChecklist,/Netlink παραμένει σε αναμονή/);
  assert.match(realChecklist,/RECOVER_KAT\.cmd/);
  assert.match(realChecklist,/Δεν επαναλαμβάνουμε συναλλαγή στα τυφλά/);
  assert.match(guide,/KAT_REAL_TEST_CHECKLIST\.txt/);
});
