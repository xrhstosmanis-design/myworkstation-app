import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/store/StoreTransactionsPanel.jsx",import.meta.url),"utf8");

test("legacy supplier payments and other expenses keep protected photo compatibility",()=>{
  assert.match(route,/needsPhoto=body\.type==="SUPPLIER_PAYMENT"\|\|body\.type==="OTHER_EXPENSE"/);
  assert.match(route,/Η φωτογραφία παραστατικού είναι υποχρεωτική/);
  assert.match(route,/image\\\/\(\?:jpeg\|png\|webp\)/);
  assert.match(route,/bytes\.length>1200000/);
  assert.match(route,/attachmentChecksum/);
  assert.match(route,/ADD COLUMN IF NOT EXISTS "supplierId"/);
  assert.match(route,/"supplierId",\s*"supplierName"/);
});

test("store operators only receive and open their own transactions",()=>{
  assert.match(route,/req\.user\.tokenType!=="STORE_OPERATOR"/);
  assert.match(route,/"actorId"=\$\{req\.user\.id\}/);
  assert.match(route,/row\.actorId!==req\.user\.id/);
  assert.match(route,/Μπορείς να δεις μόνο τα δικά σου παραστατικά/);
});

test("my transactions query reads from the protected ledger table",()=>{
  assert.match(route,/SELECT "id","companyId","storeId"[\s\S]*FROM "StoreTransaction"[\s\S]*"actorId"=\$\{req\.user\.id\}/);
});

test("store UI exposes AI Reader evidence choices and my payments",()=>{
  assert.match(client,/Με παραστατικό από AI Reader/);
  assert.match(client,/Χωρίς παραστατικό/);
  assert.match(client,/purchaseDocumentId/);
  assert.match(client,/Οι πληρωμές και συναλλαγές μου/);
  assert.match(client,/Προβολή φωτογραφίας/);
  assert.doesNotMatch(client,/capture="environment"/);
});

test("payments reduce the shift only after an explicit cashier source choice",()=>{
  assert.match(route,/ADD COLUMN IF NOT EXISTS "subtractFromShift" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(route,/subtractFromShift:z\.coerce\.boolean\(\)\.optional\(\)\.default\(false\)/);
  assert.match(route,/row\.type===type&&row\.subtractFromShift/);
  assert.match(route,/recordedExpensesTotal:supplierPayments\+otherExpenses/);
  assert.match(route,/expensesTotal:deductedSupplierPayments\+deductedOtherExpenses/);
  assert.match(client,/paymentSource/);
  assert.match(client,/CASH_SHIFT/);
  assert.match(client,/EXTERNAL/);
  assert.match(client,/Από τα μετρητά της ίδιας βάρδιας/);
  assert.match(client,/Εξωτερική πληρωμή/);
});

test("open shift totals use every transaction and not only the recent UI list",()=>{
  assert.match(route,/ORDER BY "occurredAt" DESC LIMIT 80/);
  assert.match(route,/SELECT "type","amount","subtractFromShift","reversedAt"[\s\S]*WHERE "sessionId"=\$\{openSession\.id\}/);
  assert.match(route,/"storeId"=\$\{store\.id\} AND "companyId"=\$\{req\.user\.companyId\}/);
  assert.doesNotMatch(route,/const sessionRows=openSession\?recent\.filter/);
});
