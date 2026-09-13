import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const analytics=await readFile(new URL("../../client/src/components/platform/SuperAdminChecksAnalytics.jsx",import.meta.url),"utf8");
const transactions=await readFile(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");

test("Super Admin analytics renders supplier-payment and other-expense evidence read-only",()=>{
  assert.match(analytics,/\/api\/transactions\/supplier-settlements\/review\$\{reviewSuffix\}/);
  assert.match(analytics,/\/api\/transactions\/other-expenses\/review\$\{reviewSuffix\}/);
  assert.match(analytics,/Εκκρεμείς πληρωμές προμηθευτών και λοιπά έξοδα/);
  assert.match(analytics,/Αναγνωριστικό πληρωμής/);
  assert.match(analytics,/Αναγνωριστικό ελέγχου/);
  assert.match(transactions,/router\.get\("\/supplier-settlements\/review",requireSuperAdminSettlementReview/);
  assert.match(transactions,/router\.get\("\/other-expenses\/review",requireSuperAdminSettlementReview/);
});
