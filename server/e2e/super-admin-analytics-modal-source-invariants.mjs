import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const center=readFileSync(new URL("../../client/src/components/platform/SuperAdminAnalyticsCenter.jsx",import.meta.url),"utf8");

assert.match(app,/SuperAdminAnalyticsCenter/);
assert.match(app,/setShowSuperAdminAnalytics\(true\)/);
assert.doesNotMatch(app,/runSuperAdminAnalytics/);
assert.doesNotMatch(app,/analyticsResult/);
assert.match(center,/Ιδιοκτήτης \/ εταιρεία/);
assert.match(center,/type="date"/);
assert.match(center,/super-admin-analytics\/execute/);
assert.match(center,/bank-ledger\/summary/);
assert.match(center,/Read-only λειτουργία/);
assert.match(center,/καμία επιβεβαίωση, διόρθωση, χρέωση/i);

console.log("Super Admin analytics modal source invariants: OK");
