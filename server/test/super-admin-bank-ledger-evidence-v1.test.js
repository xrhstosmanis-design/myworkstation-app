import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const analytics=await readFile(new URL("../../client/src/components/platform/SuperAdminChecksAnalytics.jsx",import.meta.url),"utf8");
const transactions=await readFile(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");

test("Super Admin analytics retrieves and renders bank-ledger evidence read-only",()=>{
  assert.match(analytics,/\/api\/transactions\/bank-ledger\/summary\$\{bankSuffix\}/);
  assert.match(analytics,/\/api\/transactions\/bank-ledger\/review\$\{bankSuffix\}/);
  assert.match(analytics,/Εκκρεμείς τραπεζικές εγγραφές που λήφθηκαν υπόψη/);
  assert.match(analytics,/Αναγνωριστικό τραπεζικής εγγραφής/);
  assert.match(transactions,/router\.get\("\/bank-ledger\/review",requireSuperAdminSettlementReview/);
  assert.match(transactions,/e\."status" IN \('PENDING_PROOF','PENDING_REVIEW','DISCREPANCY'\)/);
});
