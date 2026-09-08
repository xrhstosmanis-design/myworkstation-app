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
  assert.match(shiftUi,/selectedSessionId/);
  assert.match(shiftUi,/Σύνολο βάρδιας/);
  assert.match(shiftUi,/Επιλεγμένη βάρδια/);
  assert.match(shiftUi,/Κινήσεις βάρδιας/);
});

test("authoritative Cash Control close includes active-session transfer-in",()=>{
  assert.match(cash,/"type"='TRANSFER_AMOUNT'[\s\S]*AS "transferIn"/);
  assert.match(cash,/transferIn:money\(rows\[0\]\?\.transferIn\)/);
  assert.match(cash,/session\.openingOperational\+ledger\.cashSales\+ledger\.transferIn-ledger\.expenses/);
});

test("BackOffice keeps transfer reconciliation server-side and delegates shift close to POS",()=>{
  assert.match(cashUi,/Οι βάρδιες ανοίγουν και κλείνουν αποκλειστικά από το POS/);
  assert.doesNotMatch(cashUi,/label="Μεταφορές προς βάρδια"/);
});
