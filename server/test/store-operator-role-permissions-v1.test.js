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
  assert.match(auth,/const permissions=storeRuntimePermissions/);
  assert.match(auth,/id:operator\.id/);
  assert.match(auth,/fullName:operator\.displayName/);
  assert.match(auth,/role:operator\.role,permissions/);
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
  assert.match(ledger,/const permissions=req\.user\?\.permissions\|\|\[\]/);
  assert.match(ledger,/permissions\.includes\("STORE_LEDGER"\)/);
  assert.match(cash,/permissions\?\.includes\("CASH_CONTROL"\)/);
});

test("BackOffice supplier and same-shift payment permissions are enforced before store transaction creation",()=>{
  assert.match(auth,/function enforceStorePaymentPermissions/);
  assert.match(auth,/type==="SUPPLIER_PAYMENT"&&!permissions\.includes\("SUPPLIER_PAYMENT"\)/);
  assert.match(auth,/paymentSource==="CASH_SHIFT"/);
  assert.match(auth,/!permissions\.includes\("SAME_SHIFT_PAYMENTS"\)/);
  assert.match(auth,/if\(!enforceStorePaymentPermissions\(req,res,permissions\)\)return/);
});

test("legacy login token permissions are overwritten by current BackOffice permissions",()=>{
  assert.match(operators,/function operatorPermissions\(role\)/);
  assert.match(auth,/const permissions=storeRuntimePermissions/);
  assert.match(auth,/id:operator\.id/);
  assert.match(auth,/fullName:operator\.displayName/);
  assert.match(auth,/role:operator\.role,permissions/);
});
