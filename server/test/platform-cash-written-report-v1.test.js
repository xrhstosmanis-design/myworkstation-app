import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const platformUi=fs.readFileSync(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const platformApi=fs.readFileSync(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");

test("cash report date formatter cannot be shadowed by the selected date state",()=>{
  assert.match(platformUi,/const cashReportDateLabel=value=>/);
  assert.match(platformUi,/cashReportDateLabel\(cashReport\.date\)/);
  assert.doesNotMatch(platformUi,/const cashReportDate=value=>/);
});

test("platform cash control presents only concise suspicious events for every shift",()=>{
  assert.match(platformUi,/Συνολική αναφορά ελέγχου ταμείου/);
  assert.match(platformUi,/Πραγματική ανάλυση/);
  assert.match(platformUi,/Ανάλυση ανά βάρδια/);
  assert.match(platformUi,/Τελικό αποτέλεσμα καταστήματος/);
  assert.match(platformUi,/Οι κανονικές κινήσεις δεν εμφανίζονται/);
  assert.match(platformUi,/cashEventTime\(finding\.at\)/);
  assert.doesNotMatch(platformUi,/Αναλυτική γραπτή αναφορά/);
});

test("a completed investigation returns a definitive conclusion instead of asking for review",()=>{
  assert.match(platformUi,/Ο ΕΛΕΓΧΟΣ ΟΛΟΚΛΗΡΩΘΗΚΕ — ΑΝΕΞΗΓΗΤΟ ΕΛΛΕΙΜΜΑ/);
  assert.match(platformUi,/Ανεξήγητο έλλειμμα/);
  assert.doesNotMatch(platformUi,/ΧΡΕΙΑΖΕΤΑΙ ΕΛΕΓΧΟΣ/);
});

test("the platform report exhausts transaction, document, operator and POS audit evidence",()=>{
  assert.match(platformApi,/await ensureCashControlSchema\(\)/);
  assert.match(platformApi,/platformCashInvestigation/);
  assert.match(platformApi,/StoreOperatorAudit/);
  assert.match(platformApi,/PosSaleActionAudit/);
  assert.match(platformApi,/PosSaleSafetyAudit/);
  assert.match(platformApi,/EXPENSE_DOCUMENT_MISMATCH/);
  assert.match(platformApi,/documentTotal/);
  assert.match(platformApi,/ACTION_AFTER_SHIFT_CLOSE/);
  assert.match(platformApi,/MULTIPLE_ACTIONS_ON_SAME_SALE/);
  assert.match(platformApi,/UNEXPLAINED_SHORTAGE/);
  assert.match(platformApi,/completed:true/);
  assert.match(platformApi,/Promise\.allSettled/);
  assert.match(platformApi,/AUDIT_SOURCE_UNAVAILABLE/);
  assert.match(platformApi,/jsonb_typeof\(s\."duplicateReviewJson"\)='array'/);
  assert.match(platformApi,/to_regclass\('\"PurchaseDocument\"'\)::text AS "purchaseDocuments"/);
  assert.match(platformApi,/to_regclass\('\"StoreOperatorAudit\"'\)::text AS "operator"/);
});

test("daily report filters by store and flags near-offset variances through the second next shift",()=>{
  assert.match(platformUi,/Κατάστημα<select value=\{cashStoreId\}/);
  assert.match(platformUi,/Καθαρή διαφορά/);
  assert.match(platformApi,/storeId:z\.string\(\)\.trim\(\)\.optional/);
  assert.match(platformApi,/SHIFT_VARIANCE_OFFSET/);
  assert.match(platformApi,/ordered\.slice\(index\+1,index\+3\)/);
  assert.match(platformApi,/if\(ratio<\.8\|\|ratio>1\)continue/);
  assert.match(platformApi,/suspiciousAction/);
});

test("Petroupoli follows the same difference-only rule as Estia and Galatsi",()=>{
  assert.match(platformApi,/\["ΕΣΤΙΑ","ΠΕΤΡΟΥΠΟΛΗ","ΓΑΛΑΤΣΙ"\]/);
  assert.doesNotMatch(platformApi,/ΜΙΝΙ ΜΑΡΚΕΤ ΠΕΤΡΟΥΠΟΛΗ ΕΕ/);
  assert.match(platformApi,/mode:differenceOnly\?"DIFFERENCE_ONLY":"FULL"/);
  assert.match(platformApi,/posEftposEnabled:!differenceOnly/);
});

test("written findings include the exact reversal question and payment causes",()=>{
  assert.match(platformUi,/Έχουν πάρει τα χρήματα;/);
  assert.match(platformUi,/CARD_RECORDED_CASH_PAID/);
  assert.match(platformUi,/EFTPOS_CONFIRMED_AS_FAILED/);
  assert.match(platformUi,/CASH_TRANSFER_DIFFERENCE/);
});
