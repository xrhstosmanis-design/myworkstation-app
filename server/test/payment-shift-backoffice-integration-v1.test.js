import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [auth,invoice,ledger,cash,shiftUi,closeUi,myPayments,ownerRoute,ownerUi]=await Promise.all([
  read("../src/middleware/auth.js"),
  read("../src/routes/commerce-invoice-draft-approval.js"),
  read("../src/routes/store-transactions.js"),
  read("../src/routes/cash-control.js"),
  read("../../client/src/components/store/StoreTransactionsPanel.jsx"),
  read("../../client/src/components/store/StoreShiftClosePanel.jsx"),
  read("../../client/src/components/store/MyShiftEntriesPanel.jsx"),
  read("../src/routes/owner-payments.js"),
  read("../../client/src/components/commerce/installOwnerPaymentsSuite.js")
]);

test("BackOffice remains the runtime authority for Store operator payment and cash permissions",()=>{
  assert.match(auth,/LEFT JOIN "StoreOperatorProfile"/);
  assert.match(auth,/p\.permissions\?\.cash/);
  assert.match(auth,/p\.permissions\?\.supplierPayment/);
  assert.match(auth,/p\.permissions\?\.sameShiftPayments/);
  assert.match(auth,/p\.permissions\?\.shiftTransactionsPos/);
  assert.match(auth,/p\.permissions\?\.allShiftTransactionsPos/);
  assert.match(auth,/enforceStorePaymentPermissions/);
});

test("AI Reader confirmation remains DRAFT and stock changes only after explicit approval",()=>{
  assert.match(invoice,/INSERT INTO "PurchaseDocument"[\s\S]*'OCR_DRAFT','DRAFT'/);
  assert.match(invoice,/res\.status\(201\)\.json\(\{id:docId,status:"DRAFT",stockUpdated:false,awaitingApproval:true/);
  assert.match(invoice,/router\.post\("\/purchases\/:documentId\/approve"/);
  assert.match(invoice,/INSERT INTO "StockMovement"[\s\S]*'PURCHASE_APPROVAL'/);
  assert.match(invoice,/status:"APPROVED",stockUpdated:true/);
});

test("supplier payments and other expenses use one StoreTransaction and CashShiftSession contract",()=>{
  assert.match(ledger,/evidenceMode:z\.enum\(\["DOCUMENT","NO_DOCUMENT"\]\)/);
  assert.match(ledger,/purchaseDocumentId:z\.string/);
  assert.match(ledger,/paymentSource:z\.enum\(\["CASH_SHIFT","EXTERNAL"\]\)/);
  assert.match(ledger,/idempotencyKey:z\.string/);
  assert.match(ledger,/FROM "CashShiftSession" shift/);
  assert.match(ledger,/INSERT INTO "StoreTransaction"/);
  assert.match(ledger,/paymentId\(req\.user\.companyId,store\.id,paymentKey\)/);
});

test("Store shift transactions UI is active-shift read-only and does not duplicate payment entry",()=>{
  assert.match(shiftUi,/Κινήσεις ενεργής βάρδιας/);
  assert.match(shiftUi,/Αναμενόμενο/);
  assert.match(shiftUi,/openSession/);
  assert.doesNotMatch(shiftUi,/Με παραστατικό από AI Reader/);
  assert.doesNotMatch(shiftUi,/purchaseDocumentId/);
  assert.doesNotMatch(shiftUi,/ledger-submit/);
});

test("same-shift payments reduce the same authoritative expected-cash formula used at close",()=>{
  assert.match(ledger,/expensesTotal:deductedSupplierPayments\+deductedOtherExpenses/);
  assert.match(ledger,/row\.type===type&&row\.subtractFromShift/);
  assert.match(cash,/authoritativeShiftTotals/);
  assert.match(cash,/const expected=session\.openingOperational\+ledger\.cashSales\+ledger\.transferIn-ledger\.expenses/);
  assert.match(closeUi,/openingOperational\)\+n\(form\.cashSales\)-n\(form\.expenses\)/);
  assert.match(closeUi,/Αναμενόμενο λειτουργικό σύνολο/);
});

test("shift close requires real physical drawer count before the existing close endpoint",()=>{
  assert.match(closeUi,/Άνοιξε πρώτα το συρτάρι από το κουμπί της ταμειακής/);
  assert.match(closeUi,/countConfirmed/);
  assert.match(closeUi,/drawer:"",custody:"",coins:"",safe:""/);
  assert.match(closeUi,/\/api\/cash\/sessions\/\$\{data\.openSession\.id\}\/close/);
});

test("My Payments remains limited to the current operator payments and expenses of the active shift",()=>{
  assert.match(myPayments,/new Set\(\["SUPPLIER_PAYMENT","OTHER_EXPENSE"\]\)/);
  assert.match(myPayments,/const sessionId=result\.openSession\?\.id/);
  assert.match(myPayments,/paymentTypes\.has\(row\.type\)&&row\.sessionId===sessionId/);
  assert.match(myPayments,/const operatorId=String\(operator\?\.id\|\|""\)\.trim\(\)/);
  assert.match(myPayments,/String\(row\.actorId\|\|""\)\.trim\(\)===operatorId/);
  assert.doesNotMatch(myPayments,/row\.actorName[\s\S]*===own/);
  assert.match(myPayments,/Οι πληρωμές μου/);
  assert.match(myPayments,/Χωρίς παραστατικό · πλήρες audit/);
});

test("BackOffice owner audit recognizes AI Reader evidence, source, store, actor and shift session",()=>{
  assert.match(ownerRoute,/application\/vnd\.myworkstation\.purchase-document/);
  assert.match(ownerRoute,/purchaseDocumentId/);
  assert.match(ownerRoute,/evidenceMode:linkedPurchaseDocument\?"DOCUMENT"/);
  assert.match(ownerRoute,/paymentSource:row\.subtractFromShift\?"CASH_SHIFT":"EXTERNAL"/);
  assert.match(ownerRoute,/t\."sessionId"/);
  assert.match(ownerRoute,/st\."name" AS "storeName"/);
  assert.match(ownerRoute,/t\."actorName"/);
  assert.match(ownerUi,/AI Reader/);
  assert.match(ownerUi,/Από βάρδια/);
  assert.match(ownerUi,/Εξωτερική/);
  assert.match(ownerUi,/active\.filter\(row=>row\.evidenceMode==="NO_DOCUMENT"\)/);
});

test("the integrated flow keeps reversal and tenant-store isolation in the existing architecture",()=>{
  assert.match(ledger,/assertStoreAccess/);
  assert.match(ledger,/companyId/);
  assert.match(ledger,/reversedAt/);
  assert.match(ledger,/reversalReason/);
  assert.match(ownerRoute,/requireOwnerReport/);
});
