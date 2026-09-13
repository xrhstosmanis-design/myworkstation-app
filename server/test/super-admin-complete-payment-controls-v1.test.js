import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/platform-super-admin-analytics-details.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/SuperAdminChecksAnalytics.jsx",import.meta.url),"utf8");

test("COMPLETE payment controls are limited to an active COMPLETE or PREMIUM package",()=>{
  assert.match(route,/const CHECK_PACKAGE_LEVELS=\{BASIC_CHECK:0,COMPLETE_CHECK:1,PREMIUM_CHECK:2\}/);
  assert.match(route,/complete:level>=CHECK_PACKAGE_LEVELS\.COMPLETE_CHECK/);
  assert.match(route,/packageAccess\.complete\?await completePaymentControls/);
});

test("COMPLETE controls inspect active payments without mutating them",()=>{
  assert.match(route,/t\."reversedAt" IS NULL AND t\."type" IN \('SUPPLIER_PAYMENT','OTHER_EXPENSE'\)/);
  assert.match(route,/t\."attachmentData" IS NULL/);
  assert.match(route,/PAYMENT_WITHOUT_EVIDENCE/);
  assert.match(route,/POTENTIAL_DUPLICATE_SUPPLIER_PAYMENT/);
  assert.match(route,/JOIN "CashShiftSession" s ON s\."id"=t\."sessionId"/);
  assert.match(route,/GROUP BY t\."sessionId",t\."supplierId",t\."amount",DATE\(t\."occurredAt"\),st\."name"/);
  assert.match(route,/JSON_AGG\(JSON_BUILD_OBJECT\(/);
  assert.match(route,/'transactionId',t\."id",'occurredAt',t\."occurredAt"/);
  assert.match(route,/evidence:\{transactions:/);
  assert.match(route,/readOnly:true/);
});

test("Super Admin screen explains and renders the COMPLETE findings",()=>{
  assert.match(ui,/COMPLETE · Πληρωμές και παραστατικά/);
  assert.match(ui,/Χωρίς παραστατικό/);
  assert.match(ui,/Πιθανές διπλές πληρωμές/);
  assert.match(ui,/Αποδεικτικά στοιχεία κινήσεων/);
  assert.match(ui,/Αναγνωριστικό κίνησης/);
  assert.match(ui,/Δεν βρέθηκε συνημμένο παραστατικό/);
  assert.match(ui,/Δεν βρέθηκαν πληρωμές χωρίς παραστατικό/);
});
