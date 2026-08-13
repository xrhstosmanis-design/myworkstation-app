import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const auth=fs.readFileSync(new URL("../src/middleware/auth.js",import.meta.url),"utf8");
const operators=fs.readFileSync(new URL("../src/routes/store-operators.js",import.meta.url),"utf8");
const ledger=fs.readFileSync(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");
const cash=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");

test("Store Mode runtime permissions come from the current BackOffice operator profile",()=>{
  assert.match(auth,/LEFT JOIN "StoreOperatorProfile"/);
  assert.match(auth,/profilePermissions/);
  assert.match(auth,/permissions:storeRuntimePermissions/);
  assert.match(auth,/p\.permissions\?\.cash/);
  assert.match(auth,/p\.permissions\?\.shiftTransactionsPos/);
  assert.match(auth,/p\.permissions\?\.allShiftTransactionsPos/);
  assert.match(auth,/p\.permissions\?\.supplierPayment/);
  assert.match(auth,/p\.permissions\?\.sameShiftPayments/);
});

test("Store Mode role names do not grant live cash or ledger permissions",()=>{
  const runtimeMapper=auth.match(/function storeRuntimePermissions\(profile\)[\s\S]*?\n\}/)?.[0]||"";
  assert.doesNotMatch(runtimeMapper,/MANAGER|EMPLOYEE/);
  assert.match(auth,/posAccess===false/);
  assert.match(auth,/STORE_OPERATOR_POS_ACCESS_DISABLED/);
});

test("Store Mode operator is never treated as an unrestricted BackOffice manager",()=>{
  assert.match(ledger,/tokenType!=="STORE_OPERATOR"&&\["OWNER","ADMIN","MANAGER"\]/);
  assert.match(cash,/tokenType!=="STORE_OPERATOR"&&\["OWNER","ADMIN","MANAGER"\]/);
});

test("existing cash and ledger routes consume live permissions",()=>{
  assert.match(ledger,/permissions\?\.includes\("STORE_LEDGER"\)/);
  assert.match(ledger,/permissions\?\.includes\("STORE_LEDGER_REVIEW"\)/);
  assert.match(cash,/permissions\?\.includes\("CASH_CONTROL"\)/);
});

test("legacy login token permissions are not the authority after authentication",()=>{
  assert.match(operators,/function operatorPermissions\(role\)/);
  assert.match(auth,/req\.user=\{\.\.\.payload,permissions:storeRuntimePermissions/);
});
