import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const cash=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../../client/src/components/cloud/CashControlPanel.jsx",import.meta.url),"utf8");
const catalog=fs.readFileSync(new URL("../src/services/module-catalog.js",import.meta.url),"utf8");
const moduleAccess=fs.readFileSync(new URL("../src/middleware/module-access.js",import.meta.url),"utf8");
const platform=fs.readFileSync(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const platformUi=fs.readFileSync(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const mail=fs.readFileSync(new URL("../src/services/mail.js",import.meta.url),"utf8");

test("automatic cash control aggregates every closed terminal in the Greek business date",()=>{
  assert.match(cash,/\/stores\/:storeId\/daily-summary/);
  assert.match(cash,/AT TIME ZONE 'Europe\/Athens'/);
  assert.match(cash,/"status"='CLOSED'/);
  assert.match(cash,/POS_EFTPOS/);
  assert.match(cash,/DUPLICATE_REVIEW/);
});

test("super admin receives all-store reports by Greek date, POS and shift",()=>{
  assert.match(platform,/\/cash-control\/daily/);
  assert.match(platform,/JOIN "Company"/);
  assert.match(platform,/JOIN "Store"/);
  assert.doesNotMatch(platform,/JOIN "CompanyModule" m[^\n]*CASH_CONTROL/);
  assert.match(platform,/s\."terminalPos"/);
  assert.match(platform,/s\."shiftLabel"/);
  assert.match(platformUi,/Κάθε κατάστημα ξεχωριστά · ανά ημέρα, POS και βάρδια/);
  assert.match(platform,/stores:\[\.\.\.byStore\.values\(\)\]/);
  assert.match(platformUi,/Συνολικό έλλειμμα/);
  assert.match(platform,/fromTime/);
  assert.match(platform,/toTime/);
  assert.match(platformUi,/Ώρα από/);
  assert.match(platformUi,/Ώρα έως/);
  assert.match(platformUi,/athensTime\(row\.closedAt\)/);
});

test("super admin exports shortages for a selected date range and optional store",()=>{
  assert.match(platform,/cash-control\/shortages/);
  assert.match(platform,/s\."variance"<0/);
  assert.match(platform,/BETWEEN \$\{range\.from\}::date AND \$\{range\.to\}::date/);
  assert.match(platform,/totalShortage/);
  assert.match(platform,/byOperator/);
  assert.match(platform,/range\.operator/);
  assert.match(platformUi,/Excel ελλειμμάτων όλων/);
  assert.match(platformUi,/downloadShortages\(store\)/);
  assert.match(platformUi,/Όλοι οι χειριστές/);
});

test("daily control reconciles expenses with their evidence and document totals",()=>{
  assert.match(cash,/NO_DOCUMENT/);
  assert.match(cash,/AMOUNT_MISMATCH/);
  assert.match(cash,/application\/vnd\.myworkstation\.purchase-document/);
  assert.match(cash,/"totalGross" AS "documentTotal"/);
});

test("session investigation exhausts transaction and audit evidence without auto-clearing a shortage",()=>{
  assert.match(cash,/\/sessions\/:sessionId\/investigation/);
  assert.match(cash,/StoreOperatorAudit/);
  assert.match(cash,/PosSaleActionAudit/);
  assert.match(cash,/PosSaleSafetyAudit/);
  assert.match(cash,/EXPENSE_WITHOUT_DOCUMENT/);
  assert.match(cash,/POS_EFTPOS_DIFFERENCE/);
  assert.match(cash,/CASH_SHORTAGE/);
  assert.match(cash,/confirmedExplanations=validReviews\.filter/);
  assert.match(cash,/Κανένα ύποπτο εύρημα δεν μειώνει αυτόματα τη διαφορά/);
  assert.match(cash,/ACTION_AFTER_SHIFT_CLOSE/);
  assert.match(cash,/ACTION_WITHOUT_ORIGINAL_SALE/);
  assert.match(cash,/MULTIPLE_ACTIONS_ON_SAME_SALE/);
  assert.match(cash,/ACTION_BY_DIFFERENT_OPERATOR/);
  assert.match(cash,/AMOUNT_MATCHES_CASH_DIFFERENCE/);
  assert.match(cash,/REPEATED_AUDIT_AMOUNT/);
  assert.match(ui,/Πλήρης έλεγχος/);
  assert.match(ui,/Τελική ανεξήγητη διαφορά/);
});

test("cash control remains an independently licensed commercial module",()=>{
  assert.match(catalog,/key:"CASH_CONTROL",name:"Αυτόματος Έλεγχος Ταμείων"/);
  assert.match(catalog,/key:"CASH_CONTROL"[^\n]*monthlyPriceEur:75/);
  const defaults=catalog.slice(catalog.indexOf("export const planDefaults"));
  assert.doesNotMatch(defaults,/PILOT:\[[^\]]*CASH_CONTROL/);
  assert.doesNotMatch(defaults,/BASIC:\[[^\]]*CASH_CONTROL/);
  assert.doesNotMatch(defaults,/PRO:\[[^\]]*CASH_CONTROL/);
  assert.doesNotMatch(defaults,/ENTERPRISE:\[[^\]]*CASH_CONTROL/);
  assert.match(ui,/ΣΗΜΕΡΙΝΟΣ ΑΥΤΟΜΑΤΟΣ ΕΛΕΓΧΟΣ/);
  assert.match(ui,/Έξοδα χωρίς σωστό παραστατικό/);
});

test("platform super admin always has cash control while customers still require the paid module",()=>{
  assert.match(moduleAccess,/moduleKey==="CASH_CONTROL"&&isPlatformSuperAdmin\(user\)/);
  assert.match(moduleAccess,/platformRole==="SUPER_ADMIN"/);
  assert.match(moduleAccess,/superAdminBypass:true/);
  assert.match(moduleAccess,/if\(!state\.activeModules\.includes\(moduleKey\)\)return res\.status\(403\)/);
});

test("super admin manually previews and emails each store report to its owners",()=>{
  assert.match(platform,/cash-control\/stores\/:storeId\/email-preview/);
  assert.match(platform,/cash-control\/stores\/:storeId\/send-email/);
  assert.match(platform,/CASH_CONTROL_REPORT_EMAIL_SENT/);
  assert.match(mail,/sendCashControlDailyReportEmail/);
  assert.match(mail,/Η αναφορά στάλθηκε χειροκίνητα από τον Super Admin/);
  assert.match(cash,/MANUAL_SEND_REQUIRED/);
  assert.doesNotMatch(cash,/sendCashShiftClosedEmail/);
  assert.match(platformUi,/Προεπισκόπηση & email/);
  assert.match(platformUi,/previewAndSendCashReport/);
  assert.match(platform,/cash-control\/stores\/:storeId\/send-preview/);
  assert.match(platform,/CASH_CONTROL_REPORT_PREVIEW_SENT/);
  assert.match(platformUi,/Δοκιμή στο email μου/);
  assert.match(platformUi,/Εκτύπωση αναφοράς/);
  assert.match(platform,/readyToSend/);
  assert.match(platform,/CASH_CONTROL_RECHECK_REQUIRED/);
  assert.match(platform,/r\."createdAt">=mv\."lastMovementAt"/);
  assert.match(platformUi,/Κάνε επανέλεγχο πριν την αποστολή/);
});

test("automatic report preserves legacy store and delivery continuity rules",()=>{
  assert.match(cash,/CashControlStoreRule/);
  assert.match(cash,/ΕΣΤΙΑ/);
  assert.match(cash,/ΠΕΤΡΟΥΠΟΛΗ/);
  assert.match(cash,/ΓΑΛΑΤΣΙ/);
  assert.match(cash,/DIFFERENCE_ONLY/);
  assert.match(cash,/deliveryTerminalPattern/);
  assert.match(cash,/OPENING_CONTINUITY/);
  assert.match(cash,/DELIVERY_TO_DELIVERY/);
  assert.match(cash,/SAME_POS_ONLY/);
  assert.match(cash,/varianceConsidered/);
  assert.match(cash,/recalculatedAt/);
  assert.match(ui,/κανόνας: μόνο Διαφορά και POS–EFTPOS/);
});

test("manager review is audited and only confirmed explanations reduce the unexplained difference",()=>{
  assert.match(cash,/CashControlReview/);
  assert.match(cash,/EXPLANATION/);
  assert.match(cash,/CONFIRMED_SHORTAGE/);
  assert.match(cash,/confirmedExplanations=validReviews\.filter/);
  assert.match(cash,/Μόνο Ιδιοκτήτης ή Διαχειριστής/);
  assert.match(ui,/Καταχώριση εξήγησης/);
  assert.match(ui,/Οριστικοποίηση ελλείμματος/);
  assert.match(ui,/Ελέγχθηκε από/);
});

test("later expenses, documents or reversals invalidate the old result and require recheck",()=>{
  assert.match(cash,/snapshotJson/);
  assert.match(cash,/reviewSnapshot/);
  assert.match(cash,/recheckRequired/);
  assert.match(cash,/RECHECK_REQUIRED/);
  assert.match(cash,/validReviews=reviews\.filter\(row=>sameSnapshot/);
  assert.match(ui,/ΑΠΑΙΤΕΙΤΑΙ ΕΠΑΝΕΛΕΓΧΟΣ/);
  assert.match(ui,/Οι παλιές εξηγήσεις διατηρούνται στο ιστορικό/);
});
