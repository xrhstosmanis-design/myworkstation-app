import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const pos=await readFile(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");
const customers=await readFile(new URL("../src/routes/customer-control-v2.js",import.meta.url),"utf8");
const posUi=await readFile(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");
const customerUi=await readFile(new URL("../../client/src/components/commerce/installCustomerControlSuiteV2.js",import.meta.url),"utf8");
const cashControl=await readFile(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const storeTransactions=await readFile(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");

test("POS credit requires a named customer and enforces the stored credit limit under lock",()=>{
  assert.match(pos,/paymentMethod:z\.enum\(\["CASH","CARD","IRIS","CREDIT","MIXED"\]\)/);
  assert.match(pos,/Η πίστωση απαιτεί ονομαστικό πελάτη/);
  assert.match(pos,/FROM "Customer".*FOR UPDATE/);
  assert.match(pos,/nextBalance-limit/);
  assert.match(pos,/Η πίστωση υπερβαίνει το διαθέσιμο όριο/);
  assert.match(posUi,/>ΠΙΣΤΩΣΗ<\/button>/);
});

test("credit sale updates customer balance and writes an immutable ledger entry",()=>{
  assert.match(pos,/"balance"="balance"\+\$\{creditAmount\}/);
  assert.match(pos,/'SALE_CREDIT'/);
  assert.match(pos,/Πίστωση από πώληση POS/);
  assert.match(pos,/CustomerLedger/);
});

test("partial receipt reduces balance and reports customer email outcome after commit",()=>{
  assert.match(customers,/"balance"="balance"-\$\{b\.amount\}/);
  assert.match(customers,/const updated=await owned\(companyId,c\.id\)/);
  assert.match(customers,/await sendBalanceEmail\(updated/);
  assert.match(customers,/Customer receipt balance email failed/);
  assert.match(customerUi,/στάλθηκε email στον πελάτη/);
  assert.match(customerUi,/Δεν υπάρχει email στην καρτέλα πελάτη/);
});

test("POS employee sees balance and receives cash or card payments into the active shift",()=>{
  assert.match(pos,/customer-balance-payment/);
  assert.match(pos,/method:z\.enum\(\["CASH","CARD"\]\)/);
  assert.match(pos,/POS_CUSTOMER_RECEIPT/);
  assert.match(pos,/CUSTOMER_RECEIPT_CASH/);
  assert.match(pos,/CUSTOMER_RECEIPT_CARD/);
  assert.match(posUi,/ΠΛΗΡΩΜΗ ΥΠΟΛΟΙΠΟΥ/);
  assert.match(posUi,/Υπόλοιπο \$\{euro\(customer\.balance\)\}/);
  assert.match(posUi,/CARD για κάρτα ή CASH για μετρητά/);
  assert.match(cashControl,/IN \('SALE_CASH','CUSTOMER_RECEIPT_CASH'\)/);
  assert.match(cashControl,/IN \('SALE_CARD','SALE_IRIS','CUSTOMER_RECEIPT_CARD'\)/);
  assert.match(storeTransactions,/sum\("SALE_CASH"\)\+sum\("CUSTOMER_RECEIPT_CASH"\)/);
  assert.match(storeTransactions,/sum\("SALE_CARD"\)\+sum\("SALE_IRIS"\)\+sum\("CUSTOMER_RECEIPT_CARD"\)/);
});
