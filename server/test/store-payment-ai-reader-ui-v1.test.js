import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ui=fs.readFileSync(new URL("../../client/src/components/store/StoreTransactionsPanel.jsx",import.meta.url),"utf8");
const route=fs.readFileSync(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");

test("store payment UI uses the existing AI Reader PurchaseDocument contract",()=>{
  assert.match(ui,/Με παραστατικό από AI Reader/);
  assert.match(ui,/Χωρίς παραστατικό/);
  assert.match(ui,/purchaseDocumentId/);
  assert.match(ui,/evidenceMode/);
  assert.match(ui,/paymentSource/);
  assert.match(ui,/idempotencyKey/);
  assert.match(ui,/CASH_SHIFT/);
  assert.match(ui,/EXTERNAL/);
  assert.doesNotMatch(ui,/Φωτογραφία παραστατικού \*/);
});

test("existing transaction backend remains the payment authority",()=>{
  assert.match(route,/evidenceMode:z\.enum\(\["DOCUMENT","NO_DOCUMENT"\]\)/);
  assert.match(route,/purchaseDocumentId:z\.string/);
  assert.match(route,/paymentSource:z\.enum\(\["CASH_SHIFT","EXTERNAL"\]\)/);
  assert.match(route,/idempotencyKey:z\.string/);
  assert.match(route,/"PurchaseDocument"/);
  assert.match(route,/"CashShiftSession"/);
});
