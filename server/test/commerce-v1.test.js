import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {moduleCatalog} from "../src/services/module-catalog.js";

test("Commerce V1 sale route is explicitly non fiscal",async()=>{
  const source=await fs.readFile(new URL("../src/routes/commerce-v1.js",import.meta.url),"utf8");
  assert.match(source,/fiscalStatus[^\n]*NON_FISCAL|NON_FISCAL/);
  assert.ok(!source.includes("FISCAL_OK"));
  assert.ok(!source.includes("issueReceipt"));
});

test("Commerce V1 ready modules are activatable while technical modules stay locked",()=>{
  for(const key of ["INVENTORY","POS","SALES_ANALYTICS","SHIFT_HANDOVER"]){
    assert.equal(moduleCatalog.find(m=>m.key===key)?.commercialReady,true,`${key} must be pilot-ready`);
  }
  for(const key of ["AI_READER","CONNECTOR_RBS","REMOTE_SUPPORT"]){
    assert.equal(moduleCatalog.find(m=>m.key===key)?.commercialReady,false,`${key} must remain locked`);
  }
});

test("Commerce Hub contains visible non-fiscal warning",async()=>{
  const source=await fs.readFile(new URL("../../client/src/components/commerce/CommerceHub.jsx",import.meta.url),"utf8");
  assert.match(source,/ΜΗ ΦΟΡΟΛΟΓΙΚΗ ΛΕΙΤΟΥΡΓΙΑ PILOT/);
  assert.match(source,/Kiosk Manager\/RBS/);
});
