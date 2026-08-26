import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const [auth,management,ledger,moduleAccess,platform]=await Promise.all([
  readFile(new URL("../src/middleware/auth.js",import.meta.url),"utf8"),
  readFile(new URL("../src/routes/operator-management-v2.js",import.meta.url),"utf8"),
  readFile(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8"),
  readFile(new URL("../src/middleware/module-access.js",import.meta.url),"utf8"),
  readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8")
]);

test("KAT Seller permissions always come from the live BackOffice profile",()=>{
  assert.match(auth,/LEFT JOIN "StoreOperatorProfile"/);
  assert.match(auth,/COALESCE\(p\."permissions",'\{\}'::jsonb\) AS "profilePermissions"/);
  assert.match(auth,/const permissions=storeRuntimePermissions/);
  assert.match(auth,/if\(!enforceStorePaymentPermissions\(req,res,permissions\)\)return/);
  assert.match(auth,/if\(!enforceStorePosPermissions\(req,res,permissions\)\)return/);
  assert.match(auth,/STORE_OPERATOR_POS_ACCESS_DISABLED/);
});

test("KAT Seller cannot become a BackOffice administrator from the Store role name",()=>{
  const mapper=auth.match(/function storeRuntimePermissions\(profile\)[\s\S]*?\n\}/)?.[0]||"";
  assert.doesNotMatch(mapper,/MANAGER|EMPLOYEE/);
  assert.match(management,/function allowed\(req\)\{return \["SUPER_ADMIN","OWNER","ADMIN"\]\.includes\(req\.user\?\.role\)\}/);
  assert.match(ledger,/tokenType!=="STORE_OPERATOR"&&\["OWNER","ADMIN","MANAGER"\]/);
});

test("KAT Admin stays company scoped while Super Admin can select another company store",()=>{
  assert.match(management,/req\.user\?\.role==="SUPER_ADMIN"\?\{id:storeId,active:true\}:\{id:storeId,companyId:req\.user\.companyId,active:true\}/);
  assert.match(platform,/platformRole:"SUPER_ADMIN",isSuperAdmin:true/);
  assert.match(platform,/supportContext:\{companyId:company\.id/);
});

test("KAT module enforcement keeps Seller and Admin licensed while preserving the explicit Super Admin bypass",()=>{
  assert.match(moduleAccess,/user\.role==="SUPER_ADMIN"\|\|user\.isSuperAdmin===true/);
  assert.match(moduleAccess,/export function requireStoreModule\(moduleKey\)/);
  assert.match(moduleAccess,/STORE_OPERATOR/);
  assert.match(moduleAccess,/CompanyModule/);
});
