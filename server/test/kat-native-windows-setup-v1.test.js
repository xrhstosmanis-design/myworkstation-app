import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../../tools/windows-kat-setup-exe/MyWorkStationSetup.cs",import.meta.url),"utf8");
const workflow=fs.readFileSync(new URL("../../.github/workflows/build-kat-windows-setup.yml",import.meta.url),"utf8");

test("native setup accepts only the production activation URL",()=>{
  assert.match(source,/myworkstation-app\.onrender\.com/);
  assert.match(source,/activation=\[A-Za-z0-9_-\]/);
  assert.match(source,/UriSchemeHttps/);
});

test("native setup stores no activation token and uses no PowerShell",()=>{
  assert.match(source,/uri\.GetLeftPart\(UriPartial\.Authority\) \+ uri\.AbsolutePath/);
  assert.doesNotMatch(source,/powershell|ExecutionPolicy|ProcessStartInfo\("cmd/i);
  assert.match(source,/link\.Clear\(\)/);
});

test("Windows runner compiles a GUI exe and publishes checksum evidence",()=>{
  assert.match(workflow,/target:winexe/);
  assert.match(workflow,/MyWorkStation_Setup\.exe/);
  assert.match(workflow,/Get-FileHash/);
  assert.match(workflow,/actions\/upload-artifact@v4/);
});
