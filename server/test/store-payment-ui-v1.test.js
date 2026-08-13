import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const panel=await readFile(new URL("../../client/src/components/store/StoreTransactionsPanel.jsx",import.meta.url),"utf8");

test("payment UI uses existing OCR purchase documents or explicit no-document mode",()=>{
  assert.match(panel,/evidenceMode/);
  assert.match(panel,/purchaseDocumentId/);
  assert.match(panel,/Με παραστατικό από AI Reader/);
  assert.match(panel,/Χωρίς παραστατικό/);
  assert.match(panel,/Η αιτιολογία είναι υποχρεωτική/);
});

test("payment UI explicitly declares whether cash leaves the active shift",()=>{
  assert.match(panel,/paymentSource/);
  assert.match(panel,/CASH_SHIFT/);
  assert.match(panel,/EXTERNAL/);
  assert.match(panel,/Από τα μετρητά της βάρδιας/);
  assert.match(panel,/Εξωτερική πληρωμή/);
});

test("payment UI sends an idempotency key and shows evidence state in my payments",()=>{
  assert.match(panel,/idempotencyKey/);
  assert.match(panel,/crypto\.randomUUID/);
  assert.match(panel,/Πρόχειρο\/εγκεκριμένο παραστατικό/);
  assert.match(panel,/Χωρίς παραστατικό · πλήρες audit/);
});
