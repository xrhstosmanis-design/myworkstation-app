import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const panel=await readFile(new URL("../../client/src/components/store/MyShiftEntriesPanel.jsx",import.meta.url),"utf8");
const modal=await readFile(new URL("../../client/src/components/store/StoreShiftTransactionsModal.jsx",import.meta.url),"utf8");

test("my payments read from the existing transaction overview and filter to payment rows",()=>{
  assert.match(panel,/\/api\/transactions\/stores\/\$\{store\.id\}\/overview/);
  assert.match(panel,/SUPPLIER_PAYMENT/);
  assert.match(panel,/OTHER_EXPENSE/);
  assert.match(panel,/paymentTypes\.has\(row\.type\)/);
  assert.match(panel,/Οι πληρωμές μου/);
  assert.match(panel,/Χωρίς παραστατικό · πλήρες audit/);
});

test("my payments remain read-only and are mounted in the existing shift modal",()=>{
  assert.doesNotMatch(panel,/method:\s*"POST"/);
  assert.match(modal,/import MyShiftEntriesPanel/);
  assert.match(modal,/<MyShiftEntriesPanel api=\{api\} store=\{store\} operator=\{operator\}\/>/);
});
