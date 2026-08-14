import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ui=fs.readFileSync(new URL("../../client/src/components/store/StoreTransactionsPanel.jsx",import.meta.url),"utf8");
const route=fs.readFileSync(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");

test("active shift UI is read-only and does not embed payment evidence entry controls",()=>{
  assert.match(ui,/Συναλλαγές βάρδιας/);
  assert.match(ui,/Κινήσεις ενεργής βάρδιας/);
  assert.match(ui,/Εμφανίζονται μόνο οι κινήσεις της ενεργής βάρδιας/);
  assert.doesNotMatch(ui,/Με παραστατικό από AI Reader/);
  assert.doesNotMatch(ui,/purchaseDocumentId/);
  assert.doesNotMatch(ui,/CASH_SHIFT/);
});

test("existing transaction backend remains the payment and AI Reader evidence authority",()=>{
  assert.match(route,/evidenceMode:z\.enum\(\["DOCUMENT","NO_DOCUMENT"\]\)/);
  assert.match(route,/purchaseDocumentId:z\.string/);
  assert.match(route,/paymentSource:z\.enum\(\["CASH_SHIFT","EXTERNAL"\]\)/);
  assert.match(route,/idempotencyKey:z\.string/);
  assert.match(route,/"PurchaseDocument"/);
  assert.match(route,/"CashShiftSession"/);
});
