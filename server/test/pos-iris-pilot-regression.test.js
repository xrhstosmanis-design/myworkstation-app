import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const panel=await readFile(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");
const posRoute=await readFile(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");
const cashControl=await readFile(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const auditUi=await readFile(new URL("../../client/src/components/commerce/installKioskReportsAuditV2.js",import.meta.url),"utf8");
const shiftModal=await readFile(new URL("../../client/src/components/store/StoreShiftTransactionsModal.jsx",import.meta.url),"utf8");
const storeTransactions=await readFile(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");
const transactionsPanel=await readFile(new URL("../../client/src/components/store/StoreTransactionsPanel.jsx",import.meta.url),"utf8");

test("pilot IRIS is an explicit online POS checkout route",()=>{
  assert.match(panel,/if\(action==="IRIS"\)return checkout\("IRIS"\)/);
  assert.match(panel,/className="iris" onClick=\{\(\)=>standardAction\("IRIS"\)\}/);
  assert.match(panel,/p\.method==="IRIS"\?"IRIS"/);
  assert.match(panel,/Offline: επιτρέπεται μόνο πώληση ΜΕΤΡΗΤΩΝ\. Κάρτα\/IRIS/);
});

test("pilot IRIS keeps a separate ledger type while retaining electronic shift totals",()=>{
  assert.match(posRoute,/if\(irisAmount>0\).*'SALE_IRIS'/);
  assert.match(posRoute,/IRIS \(ΠΙΛΟΤΙΚΟ\)/);
  assert.match(cashControl,/'SALE_CARD','SALE_IRIS','CUSTOMER_RECEIPT_CARD'/);
  assert.match(storeTransactions,/cardSales:sum\("SALE_CARD"\)\+sum\("SALE_IRIS"\)\+sum\("CUSTOMER_RECEIPT_CARD"\),\s*irisSales:sum\("SALE_IRIS"\)/);
  assert.match(auditUi,/SALE_IRIS:"Πληρωμή IRIS \(πιλοτικό\)"/);
  assert.match(shiftModal,/\["SALE_CASH","SALE_CARD","SALE_IRIS"\]/);
});


test("active shift displays card, IRIS and their combined total separately",()=>{
  assert.match(transactionsPanel,/<span>Κάρτες<\/span><strong>\{money\(Number\(summary\.cardSales\|\|0\)-Number\(summary\.irisSales\|\|0\)\)\}<\/strong>/);
  assert.match(transactionsPanel,/<span>IRIS<\/span><strong>\{money\(summary\.irisSales\)\}<\/strong>/);
  assert.match(transactionsPanel,/className="card-iris-total"><span>Σύνολο καρτών \+ IRIS<\/span><strong>\{money\(summary\.cardSales\)\}<\/strong>/);
});
