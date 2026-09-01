import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/platform-super-admin-analytics-details.js",import.meta.url),"utf8");
const analytics=await readFile(new URL("../../client/src/components/platform/SuperAdminChecksAnalytics.jsx",import.meta.url),"utf8");

test("analytics findings expose the latest valid cash-control review",()=>{
  for(const field of ["reviewId","reviewDecision","reviewAmount","reviewNote","reviewedBy","reviewedAt","reviewValid","recheckRequired","reviewStatus","reviewLabel"]){
    assert.match(route,new RegExp(field));
  }
  assert.match(route,/LEFT JOIN LATERAL[^]*?FROM "CashControlReview"/);
  assert.match(route,/reviewSnapshotJson/);
  assert.match(route,/pendingFindingCount/);
  assert.match(route,/reviewedFindingCount/);
});

test("Platform Super Admin can append a review without changing financial records",()=>{
  assert.match(route,/router\.post\("\/super-admin-analytics\/sessions\/:sessionId\/reviews"/);
  for(const decision of ["EXPLANATION","CONFIRMED_SHORTAGE","REVIEWED_NO_CHANGE"])assert.match(route,new RegExp(decision));
  assert.match(route,/INSERT INTO "CashControlReview"/);
  assert.match(route,/event:"SUPER_ADMIN_ANALYTICS_FINDING_REVIEWED"/);
  assert.match(route,/financialDataMutated:false/);
  assert.doesNotMatch(route,/UPDATE "CashShiftSession"/);
  assert.doesNotMatch(route,/UPDATE "StoreTransaction"/);
  assert.doesNotMatch(route,/UPDATE "BankLedger"/);
});

test("analytics UI shows pending progress and an auditable confirmation form",()=>{
  for(const label of ["Εκκρεμή συμβάντα","Επιβεβαίωση αυτόματου ελέγχου","Καταχωρισμένη εξήγηση","Επιβεβαιωμένο έλλειμμα","Ελεγμένο χωρίς αλλαγή","Παρατήρηση (προαιρετική)","Επιβεβαίωση ελέγχου","Τελευταίος έλεγχος"]){
    assert.ok(analytics.includes(label),`Missing UI label: ${label}`);
  }
  assert.match(analytics,/\/api\/platform\/super-admin-analytics\/sessions\/\$\{encodeURIComponent\(finding\.sessionId\)\}\/confirmation/);
  assert.match(analytics,/finding\.reviewValid===true/);
  assert.match(analytics,/finding\.recheckRequired===true/);
  assert.match(analytics,/Δεν αλλάζει ποσά, ταμείο, POS–EFTPOS, τράπεζα ή απόθεμα/);
});

test("review submission remains tenant scoped and requires a closed shift",()=>{
  assert.match(route,/s\."companyId"=\$\{body\.companyId\}/);
  assert.match(route,/s\."storeId"=\$\{body\.storeId\}/);
  assert.match(route,/session\.status!=="CLOSED"/);
  assert.match(route,/Η βάρδια δεν έχει έλλειμμα μετρητών για επιβεβαίωση/);
  assert.match(route,/note:z\.string\(\)\.trim\(\)\.min\(5\)\.max\(1000\)/);
});
