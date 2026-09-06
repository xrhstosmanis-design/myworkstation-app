import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {buildFiscalDryRunEnvelope,canonicalJson,fiscalEnvelopeHash,validateFiscalDryRun} from "../src/fiscal-bridge-dry-run.js";

const route=fs.readFileSync(new URL("../src/routes/fiscal-bridge-dry-run.js",import.meta.url),"utf8");
const index=fs.readFileSync(new URL("../src/index.js",import.meta.url),"utf8");
const moduleAccess=fs.readFileSync(new URL("../src/middleware/module-access.js",import.meta.url),"utf8");

const sale={id:"sale-1",source:"POS",status:"COMPLETED",fiscalStatus:"NON_FISCAL",subtotal:10,discount:0,total:10,occurredAt:"2026-09-05T10:00:00.000Z"};
const lines=[{id:"line-1",productId:"product-1",description:"ΝΕΡΟ",quantity:2,unitPrice:5,discount:0,vatRate:13,lineTotal:10}];
const payments=[{method:"CASH",amount:10}];
const paymentRoute={terminalPos:"POS1",channel:"COUNTER",fiscalDeviceCode:"RBS1",eftposDeviceCode:"01A",role:"STORE"};

test("dry-run envelope is deterministic and explicitly non-executing",()=>{
  const first=buildFiscalDryRunEnvelope({sale,lines,payments,route:paymentRoute});
  const second=buildFiscalDryRunEnvelope({sale:{...sale},lines:[{...lines[0]}],payments:[{...payments[0]}],route:{...paymentRoute}});
  assert.equal(first.mode,"DRY_RUN");
  assert.equal(first.externalExecution,false);
  assert.equal(first.idempotencyKey,"fiscal-dry-run:sale-1:mws-v1");
  assert.equal(canonicalJson(first),canonicalJson(second));
  assert.equal(fiscalEnvelopeHash(first),fiscalEnvelopeHash(second));
  assert.match(fiscalEnvelopeHash(first),/^[a-f0-9]{64}$/);
});

test("validation blocks totals, route and already-fiscal sales",()=>{
  assert.equal(validateFiscalDryRun({sale,lines,payments,route:paymentRoute,terminalPos:"POS1"}).ok,true);
  const failed=validateFiscalDryRun({sale:{...sale,fiscalStatus:"ISSUED"},lines,payments:[{method:"CASH",amount:9}],route:paymentRoute,terminalPos:"POS2"});
  assert.deepEqual(failed.errors,["SALE_NOT_NON_FISCAL","TERMINAL_ROUTE_MISMATCH","PAYMENT_TOTAL_MISMATCH"]);
});

test("dry-run accepts generic laboratory terminal identifiers",()=>{
  assert.equal(validateFiscalDryRun({sale,lines,payments,route:{...paymentRoute,terminalPos:"LAB-POS-01"},terminalPos:"LAB-POS-01"}).ok,true);
  assert.match(route,/terminalPos:z\.string\(\)/);
  assert.doesNotMatch(route,/z\.enum\(\["POS1","POS2"\]\)/);
});

test("HTTP contract is tenant-scoped, gated and cannot issue a fiscal command",()=>{
  assert.match(index,/fiscalBridgeDryRunRoutes/);
  assert.match(route,/FISCAL_BRIDGE_TEST_MODE/);
  assert.match(route,/confirmNoFiscalExecution:z\.literal\(true\)/);
  assert.match(route,/"companyId"=\$\{store\.companyId\}/);
  assert.match(route,/externalExecution:false,fiscalIssuance:false,capDriverWrite:false,rbsWrite:false/);
  assert.match(route,/ON CONFLICT \("companyId","storeId","saleId","schemaVersion"\) DO NOTHING/);
  assert.doesNotMatch(route,/INSERT INTO "FiscalDocument"|UPDATE "Sale"|Invoke-|child_process|exec\(/);
});

test("Platform Super Admin screen is protected, fail closed and uses eligible NON_FISCAL sales",()=>{
  const screen=fs.readFileSync(new URL("../../client/src/components/platform/FiscalBridgeDryRunCenter.jsx",import.meta.url),"utf8");
  const platform=fs.readFileSync(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
  assert.match(route,/new Set\(\["SUPER_ADMIN","OWNER","ADMIN"\]\)/);
  assert.match(route,/s\."status"='COMPLETED' AND s\."fiscalStatus"='NON_FISCAL'/);
  assert.match(route,/isSuperAdmin\(user\)\?\{\}:\{companyId:user\.companyId\}/);
  assert.match(screen,/status\?\.externalExecution===false/);
  assert.match(screen,/status\?\.fiscalIssuance===false/);
  assert.match(screen,/status\?\.capDriverWrite===false/);
  assert.match(screen,/status\?\.rbsWrite===false/);
  assert.match(screen,/confirmNoFiscalExecution:true/);
  assert.match(platform,/Fiscal DRY RUN/);
  assert.match(moduleAccess,/return Boolean\(moduleKey\)&&isPlatformSuperAdmin\(user\)/);
});
