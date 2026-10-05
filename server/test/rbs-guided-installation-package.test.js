import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {buildRbsGuidedInstallationPackage} from "../src/services/rbs-guided-installation-package.js";
import {buildRbsInstallationPackage} from "../src/services/rbs-installation-package.js";

const options={store:{id:"store-guided",companyId:"company",name:"Διαδόχου ' $(bad) Παύλου"},
  settings:{storeId:"store-guided",companyId:"company",terminalPos:"POS-01",workFolder:"C:\\CAP Folder",cashCode:"4",cardCode:"8",deviceToken:"secret-must-not-export"},
  apiBase:"https://unit.test",revision:"guided-test"};
test("guided double-click package preserves the exact credential-free legacy preparation",async()=>{
  const guided=await buildRbsGuidedInstallationPackage(options),legacy=await buildRbsInstallationPackage(options);
  assert.equal(guided.fileName,"MyWorkStation-Remote-Setup-POS-01.cmd");
  assert.equal(guided.containsCredentials,false);assert.equal(guided.startsWriterAutomatically,false);
  assert.match(guided.script,/^@echo off\r\n/);assert.ok(!/[^\x00-\x7f]/.test(guided.script),"cmd header/payload must be ASCII without BOM");
  assert.ok(!guided.script.includes(options.store.name));assert.ok(!guided.script.includes("secret-must-not-export"));
  const payloads=[...guided.script.matchAll(/FromBase64String\('([^']+)'\)/g)].map(m=>m[1]);
  assert.equal(Buffer.from(payloads[0],"base64").toString("utf8"),legacy.script);
  const files=JSON.parse(Buffer.from(payloads[1],"base64").toString("utf8"));
  assert.deepEqual(Object.keys(files).sort(),["Connector-Tools.ps1","Guided-Setup.ps1","Start-Connector.ps1"]);
  for(const [name,encoded] of Object.entries(files)){
    const content=Buffer.from(encoded,"base64");assert.equal(content.subarray(0,3).toString("hex"),"efbbbf","Windows PowerShell Greek requires UTF8 BOM");
    const source=await readFile(new URL(`../../tools/windows-rbs-capdriver-v1/${name}`,import.meta.url),"utf8");
    assert.equal(content.toString("utf8").replace(/^\uFEFF/,""),source.replace(/^\uFEFF/,""));
  }
  await assert.rejects(buildRbsGuidedInstallationPackage({...options,settings:{...options.settings,companyId:"foreign"}}),/ρυθμίσεις/);
  await assert.rejects(buildRbsGuidedInstallationPackage({...options,apiBase:"http://unit.test"}),/HTTPS/);
});
