import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pos=fs.readFileSync(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");
const panel=fs.readFileSync(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");

test("RBS issuance includes standalone delayed CARD and retains protected exclusions",()=>{
  assert.match(pos,/operationChannel:z\.enum\(\["COUNTER","DELIVERY_DELAYED"\]\)/);
  assert.match(pos,/"operationChannel" TEXT NOT NULL DEFAULT 'COUNTER'/);
  assert.match(pos,/"transactionMode","operationChannel","audience"\) VALUES/);
  const eligible=new Function("body","offlineOrigin",`return (${pos.match(/const capDriverV1Eligible=([^;]+);/)[1]});`);
  assert.equal(eligible({operationChannel:"DELIVERY_DELAYED",paymentMethod:"CARD"},false),true);
  assert.equal(eligible({operationChannel:"DELIVERY_DELAYED",paymentMethod:"CASH"},false),false);
  assert.equal(eligible({operationChannel:"DELIVERY_DELAYED",paymentMethod:"CARD",onlineOrderId:"online"},false),false);
  assert.equal(eligible({operationChannel:"COUNTER",paymentMethod:"CARD",tableOrderId:"table"},false),false);
  assert.match(pos,/if\(capDriverV1Active\)\{/);
  assert.match(pos,/rbsCapDriverSaleFiscalStatus\(approvedFiscalRequest\)/);
});

test("POS exposes an explicit, safely reset delivery-delayed choice",()=>{
  assert.match(panel,/ΚΑΝΟΝΙΚΗ ΠΩΛΗΣΗ/);
  assert.match(panel,/DELIVERY \/ ΕΤΕΡΟΧΡΟΝΙΣΜΕΝΗ/);
  assert.match(panel,/setOperationChannel\("COUNTER"\)/);
  assert.match(panel,/operationChannel,items:activeCart\.map/);
});
