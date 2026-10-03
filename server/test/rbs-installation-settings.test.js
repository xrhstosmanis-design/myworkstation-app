import test from "node:test";
import assert from "node:assert/strict";
import {rbsInstallationSettingsSchema,readRbsInstallationSettings} from "../src/services/rbs-installation-settings.js";
import {buildRbsInstallationPackage} from "../src/services/rbs-installation-package.js";
import {resolveRbsCapDriverV1PaymentCode} from "../src/rbs-capdriver-v1.js";

const form={terminalPos:"POS-01",cashCode:"4",cardCode:"8",deliveryCode:"",workFolder:"C:\\capture",confirmed:true};
test("new stores require explicit confirmed payment codes; single STORE never invents Delivery",()=>{
  for(const paymentMethod of ["CASH","CARD"])assert.throws(()=>resolveRbsCapDriverV1PaymentCode({storeId:"new-store",paymentMethod}),/επιβεβαιωθεί/);
  const settings=rbsInstallationSettingsSchema.parse(form);
  assert.equal(resolveRbsCapDriverV1PaymentCode({storeId:"new-store",paymentMethod:"CASH",settings}),"4");
  assert.equal(resolveRbsCapDriverV1PaymentCode({storeId:"new-store",paymentMethod:"CARD",settings}),"8");
  assert.throws(()=>resolveRbsCapDriverV1PaymentCode({storeId:"new-store",paymentMethod:"CARD",operationChannel:"DELIVERY_DELAYED",settings}),/επιβεβαιωθεί/);
  for(const patch of [{confirmed:false},{cashCode:"6/CR"},{cardCode:"4"},{cardCode:"04"},{workFolder:"relative"},{workFolder:"C:\\capture\nother"}])assert.equal(rbsInstallationSettingsSchema.safeParse({...form,...patch}).success,false);
});
test("absence of saved installation settings is read-only",async()=>{
  const db={$queryRaw:async()=>[{settings:null}],$executeRawUnsafe:()=>assert.fail("read must not create a table")};
  assert.equal(await readRbsInstallationSettings(db,{companyId:"company",storeId:"store",terminalPos:"POS-01"}),null);
});
test("stale equipment settings fail closed rather than falling back",async()=>{
  let calls=0;const db={$queryRaw:async()=>++calls===1?[{settings:"present"}]:calls===2?[]:[{exists:1}]};
  await assert.rejects(readRbsInstallationSettings(db,{companyId:"company",storeId:"store",terminalPos:"POS-01"}),/αντιστοίχιση/);
});
test("downloadable installer round-trips Greek store names without executable interpolation or secrets",async()=>{
  const store={id:"new-store",companyId:"company",name:"Διαδόχου ' $(bad) Παύλου"};
  const settings={...form,storeId:store.id,companyId:store.companyId,deviceToken:"must-not-be-exported",confirmedBy:"private-user"};
  const result=await buildRbsInstallationPackage({store,settings,apiBase:"https://unit.test",revision:"revision-test"});
  assert.equal(result.containsCredentials,false);assert.ok(!result.script.includes("must-not-be-exported"));assert.ok(!result.script.includes("private-user"));assert.ok(!result.script.includes(store.name));
  const encoded=result.script.match(/FromBase64String\('([^']+)'\)/)[1];
  const config=JSON.parse(Buffer.from(encoded,"base64").toString("utf8"));assert.equal(config.storeName,store.name);assert.equal(config.workFolder,"C:\\capture");assert.equal(config.storeId,store.id);
  const filesEncoded=[...result.script.matchAll(/FromBase64String\('([^']+)'\)/g)][1][1];
  const files=JSON.parse(Buffer.from(filesEncoded,"base64").toString("utf8"));assert.deepEqual(Object.keys(files).sort(),["Pair.ps1","Test-Connection.ps1","Writer.ps1"].sort());
  for(const url of ["http://unit.test","https://user:pass@unit.test","https://unit.test/path"])await assert.rejects(buildRbsInstallationPackage({store,settings,apiBase:url}),/HTTPS/);
  await assert.rejects(buildRbsInstallationPackage({store,settings:{...settings,storeId:"other-store"},apiBase:"https://unit.test"}),/ρυθμίσεις/);
});
