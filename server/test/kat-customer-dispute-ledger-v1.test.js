import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const customers=await readFile(new URL("../src/routes/customer-control-v2.js",import.meta.url),"utf8");
const pos=await readFile(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");
const cash=await readFile(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const sales=await readFile(new URL("../src/routes/kiosk-reports-sales-v4.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/installCustomerControlSuiteV2.js",import.meta.url),"utf8");

test("customer dispute ledger supports exact date and time filters and printable movements",()=>{
  assert.match(customers,/req\.query\.from/);
  assert.match(customers,/req\.query\.to/);
  assert.match(customers,/x\."at">=\$\{from\}/);
  assert.match(ui,/type="datetime-local" data-ledger-from/);
  assert.match(ui,/type="datetime-local" data-ledger-to/);
  assert.match(ui,/Εκτύπωση κινήσεων/);
  assert.match(ui,/window\.print\(\)/);
});

test("ledger exposes item quantity price store method operator debit payment and running balance",()=>{
  assert.match(customers,/STRING_AGG\(CONCAT\(sl\."quantity",' × ',sl\."description",' @ ',sl\."unitPrice"/);
  for(const label of ["Είδη","Κατάστημα","Τρόπος","Χρέωση","Πληρωμή","Υπόλοιπο","Χειριστής / σημείωση"])assert.match(ui,new RegExp(label));
  assert.match(customers,/runningBalance/);
});

test("credit sale changes stock and customer ledger but is excluded from collected turnover",()=>{
  assert.match(pos,/"transactionMode","operationChannel","audience"\) VALUES.*creditAmount>0\?"CREDIT":"NORMAL".*body\.operationChannel/s);
  assert.match(pos,/UPDATE "StoreProduct" sp SET "currentStock"/);
  assert.match(pos,/'SALE_CREDIT'/);
  assert.match(customers,/COALESCE\(s\."transactionMode",'NORMAL'\)<>'CREDIT'/);
  assert.match(sales,/COALESCE\(sa\."transactionMode",'NORMAL'\)<>'CREDIT'/);
});

test("cash and card balance receipts link to the active shift and central events",()=>{
  assert.match(pos,/CUSTOMER_RECEIPT_CASH/);
  assert.match(pos,/CUSTOMER_RECEIPT_CARD/);
  assert.match(pos,/CUSTOMER_BALANCE_PAYMENT/);
  assert.match(pos,/sessionId:shift\.id/);
  assert.match(cash,/CUSTOMER_RECEIPT_CASH/);
  assert.match(cash,/CUSTOMER_RECEIPT_CARD/);
});
