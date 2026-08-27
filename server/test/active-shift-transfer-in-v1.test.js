import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [ledger,cash,shiftUi,cashUi]=await Promise.all([
  read("../src/routes/store-transactions.js"),
  read("../src/routes/cash-control.js"),
  read("../../client/src/components/store/StoreTransactionsPanel.jsx"),
  read("../../client/src/components/cloud/CashControlPanel.jsx")
]);

test("active-shift overview exposes transfers separately from sales and expenses",()=>{
  assert.match(ledger,/transferIn:sum\("TRANSFER_AMOUNT"\)/);
  assert.match(ledger,/cashSales:sum\("SALE_CASH"\)/);
  assert.match(ledger,/expensesTotal:deductedSupplierPayments\+deductedOtherExpenses/);
});

test("active-shift expected cash adds transfer-in without mutating opening or cash sales",()=>{
  assert.match(shiftUi,/expected=opening\+Number\(summary\.cashSales\|\|0\)\+Number\(summary\.transferIn\|\|0\)-Number\(summary\.transferOut\|\|0\)-Number\(summary\.expensesTotal\|\|0\)/);
  assert.match(shiftUi,/Αρχικό ταμείο/);
  assert.match(shiftUi,/Πωλήσεις μετρητών/);
  assert.match(shiftUi,/Μεταφορές από βάρδια/);
});

test("authoritative Cash Control close includes active-session transfer-in",()=>{
  assert.match(cash,/TRANSFER_OUT[\s\S]*AS "transferOut"/);
  assert.match(cash,/transferIn:money\(rows\[0\]\?\.transferIn\)/);
  assert.match(cash,/session\.openingOperational\+ledger\.cashSales\+ledger\.transferIn-ledger\.transferOut-ledger\.expenses/);
});

test("Cash Control preview shows transfer-in and uses the same expected formula",()=>{
  assert.match(cashUi,/transferOut:"0"/);
  assert.match(cashUi,/ledgerSummary\?\.transferIn/);
  assert.match(cashUi,/opening\+number\(closeForm\.cashSales\)\+number\(closeForm\.transferIn\)-number\(closeForm\.transferOut\)-number\(closeForm\.expenses\)/);
  assert.match(cashUi,/label="Μεταφορές προς βάρδια"/);
});
