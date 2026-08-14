import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");
const ownerUi=fs.readFileSync(new URL("../../client/src/components/cloud/OwnerPaymentQuickActions.jsx",import.meta.url),"utf8");

test("modern external owner payments are persisted without a CashShiftSession",()=>{
  assert.match(route,/const externalPayment=isPayment&&!legacyPayment&&body\.paymentSource==="EXTERNAL"/);
  assert.match(route,/if\(externalPayment\)[\s\S]*?\$\{store\.id\},\$\{null\},\$\{body\.type\}/);
  assert.match(route,/else\{[\s\S]*?shift\."id"[\s\S]*?shift\."status"='OPEN'/);
});

test("external owner payments do not require an active shift in the BackOffice form",()=>{
  assert.match(ownerUi,/const requiresShift=active\?\.type==="TRANSFER_AMOUNT"\|\|form\.paymentSource==="CASH_SHIFT"/);
  assert.match(ownerUi,/disabled=\{busy\|\|\(requiresShift&&!ledger\?\.openSession\)\}/);
});
