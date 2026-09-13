import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const route=await readFile(new URL("../src/routes/platform-super-admin-analytics-details.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/SuperAdminChecksAnalytics.jsx",import.meta.url),"utf8");
test("PREMIUM controls are gated, read-only and only indicate repeated variances",()=>{
  assert.match(route,/premium:level>=CHECK_PACKAGE_LEVELS\.PREMIUM_CHECK/);
  assert.match(route,/async function premiumVarianceControls/);
  assert.match(route,/HAVING COUNT\(\*\)>=2/);
  assert.match(route,/readOnly:true/);
  assert.match(ui,/PREMIUM · Επαναλαμβανόμενες αποκλίσεις/);
  assert.match(ui,/Δεν αποτελεί απόδοση ευθύνης/);
});
