import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const ui=await readFile(new URL("../../client/src/components/store/StorePosPaymentsModal.jsx",import.meta.url),"utf8");
const route=await readFile(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");

test("negative other expense is a negative payment that returns money to shift cash",()=>{
  assert.match(ui,/Επιστροφή χρημάτων \/ αρνητικό έξοδο/);
  assert.match(ui,/Αρνητική πληρωμή/);
  assert.match(ui,/amount:supplierRefund\?-amount:amount/);
  assert.match(ui,/paymentSource="CASH_SHIFT"/);
  assert.match(ui,/Δεν αφορά προμηθευτή/);
  assert.match(route,/body\.amount<0/);
  assert.match(route,/OTHER_EXPENSE/);
  assert.match(route,/CASH_SHIFT/);
});
