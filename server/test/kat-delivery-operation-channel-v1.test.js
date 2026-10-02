import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pos=fs.readFileSync(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");
const panel=fs.readFileSync(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");

test("RBS issuance is limited to the enabled counter checkout path",()=>{
  assert.match(pos,/operationChannel:z\.enum\(\["COUNTER","DELIVERY_DELAYED"\]\)/);
  assert.match(pos,/"operationChannel" TEXT NOT NULL DEFAULT 'COUNTER'/);
  assert.match(pos,/"transactionMode","operationChannel","audience"\) VALUES/);
  assert.match(pos,/capDriverV1Eligible=!offlineOrigin&&!body\.onlineOrderId&&!body\.tableOrderId&&body\.operationChannel==="COUNTER"&&\["CASH","CARD"\]\.includes\(body\.paymentMethod\)/);
  assert.match(pos,/if\(capDriverV1Active\)\{/);
  assert.match(pos,/rbsCapDriverSaleFiscalStatus\(approvedFiscalRequest\)/);
});

test("POS exposes an explicit, safely reset delivery-delayed choice",()=>{
  assert.match(panel,/ΚΑΝΟΝΙΚΗ ΠΩΛΗΣΗ/);
  assert.match(panel,/DELIVERY \/ ΕΤΕΡΟΧΡΟΝΙΣΜΕΝΗ/);
  assert.match(panel,/setOperationChannel\("COUNTER"\)/);
  assert.match(panel,/operationChannel,items:cart\.map/);
});
