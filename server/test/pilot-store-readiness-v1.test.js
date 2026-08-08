import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");

test("Super Admin pilot readiness is tenant and store scoped",()=>{
  assert.match(route,/companies\/:companyId\/stores\/:storeId\/pilot-readiness/);
  assert.match(route,/where:\{id:req\.params\.companyId\}/);
  assert.match(route,/stores:\{where:\{id:req\.params\.storeId\}/);
});

test("readiness checks mandatory pilot modules, credentials, manager and mail",()=>{
  assert.match(route,/requiredModules=\["CORE","STORE_MODE","CASH_CONTROL","PILOT_REPORT"\]/);
  assert.match(route,/"pinHash" IS NOT NULL/);
  assert.match(route,/"role"='MANAGER'/);
  assert.match(route,/getMailStatus\(\)/);
  assert.match(route,/to_regclass\('public\."CashShiftSession"'\)/);
});

test("readiness is read only and keeps RBS outside the pilot flow",()=>{
  assert.match(route,/Παράλληλη μη φορολογική λειτουργία — καμία εντολή προς RBS/);
  assert.match(ui,/Ο έλεγχος είναι μόνο ανάγνωσης/);
  assert.match(ui,/δεν επικοινωνεί με RBS\/ταμειακή/);
});
