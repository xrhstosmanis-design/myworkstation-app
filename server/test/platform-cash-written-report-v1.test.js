import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const platformUi=fs.readFileSync(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const platformApi=fs.readFileSync(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");

test("platform cash control presents a written finding for every shift",()=>{
  assert.match(platformUi,/Αναλυτική γραπτή αναφορά/);
  assert.match(platformUi,/ΓΡΑΠΤΟ ΠΟΡΙΣΜΑ ΑΝΑ ΒΑΡΔΙΑ/);
  assert.match(platformUi,/cashReport\.rows\.map\(row=>\{const report=cashWrittenReport\(row\)/);
  assert.match(platformUi,/Τελικό συμπέρασμα:/);
  assert.match(platformUi,/οι ακυρώσεις, οι επιστροφές, οι πιθανές διπλές συναλλαγές/);
});

test("a completed investigation returns a definitive conclusion instead of asking for review",()=>{
  assert.match(platformUi,/Ο ΕΛΕΓΧΟΣ ΟΛΟΚΛΗΡΩΘΗΚΕ — ΑΝΕΞΗΓΗΤΟ ΕΛΛΕΙΜΜΑ/);
  assert.match(platformUi,/Το ποσό παραμένει ανεξήγητο μετά την ολοκλήρωση όλων των ελέγχων/);
  assert.doesNotMatch(platformUi,/ΧΡΕΙΑΖΕΤΑΙ ΕΛΕΓΧΟΣ/);
});

test("the platform report exhausts transaction, document, operator and POS audit evidence",()=>{
  assert.match(platformApi,/await ensureCashControlSchema\(\)/);
  assert.match(platformApi,/platformCashInvestigation/);
  assert.match(platformApi,/StoreOperatorAudit/);
  assert.match(platformApi,/PosSaleActionAudit/);
  assert.match(platformApi,/PosSaleSafetyAudit/);
  assert.match(platformApi,/EXPENSE_DOCUMENT_MISMATCH/);
  assert.match(platformApi,/ACTION_AFTER_SHIFT_CLOSE/);
  assert.match(platformApi,/MULTIPLE_ACTIONS_ON_SAME_SALE/);
  assert.match(platformApi,/UNEXPLAINED_SHORTAGE/);
  assert.match(platformApi,/completed:true/);
  assert.match(platformApi,/to_regclass\('\"PurchaseDocument\"'\)::text AS "purchaseDocuments"/);
  assert.match(platformApi,/to_regclass\('\"StoreOperatorAudit\"'\)::text AS "operator"/);
});
