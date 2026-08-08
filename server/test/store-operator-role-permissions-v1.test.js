import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const operators=fs.readFileSync(new URL("../src/routes/store-operators.js",import.meta.url),"utf8");
const ledger=fs.readFileSync(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");
const cash=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../../client/src/components/store/StoreTransactionsPanel.jsx",import.meta.url),"utf8");

test("manager and employee Store Mode tokens receive explicit different permissions",()=>{
  assert.match(operators,/function operatorPermissions\(role\)/);
  assert.match(operators,/STORE_LEDGER_REVIEW/);
  assert.match(operators,/TRANSACTION_REVERSAL/);
  assert.match(operators,/role==="MANAGER"/);
});

test("Store Mode manager is never treated as an unrestricted Backoffice manager",()=>{
  assert.match(ledger,/tokenType!=="STORE_OPERATOR"&&\["OWNER","ADMIN","MANAGER"\]/);
  assert.match(cash,/tokenType!=="STORE_OPERATOR"&&\["OWNER","ADMIN","MANAGER"\]/);
});

test("manager reviews store transactions while employee remains limited to own entries",()=>{
  assert.match(ledger,/permissions\?\.includes\("STORE_LEDGER_REVIEW"\)/);
  assert.match(ledger,/permissions\?\.includes\("TRANSACTION_REVERSAL"\)/);
  assert.match(ledger,/access:\{canReviewStoreLedger,canReverse\}/);
  assert.match(ui,/Συναλλαγές καταστήματος/);
  assert.match(ui,/Ακύρωση με αιτιολογία/);
});
