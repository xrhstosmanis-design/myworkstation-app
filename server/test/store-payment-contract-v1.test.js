import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");

test("payment evidence uses existing purchase documents",()=>{
  assert.match(source,/evidenceMode:z\.enum\(\["DOCUMENT","NO_DOCUMENT"\]\)/);
  assert.match(source,/FROM "PurchaseDocument"/);
  assert.match(source,/status" IN \('DRAFT','APPROVED'\)/);
});

test("payment source controls the existing shift deduction",()=>{
  assert.match(source,/paymentSource:z\.enum\(\["CASH_SHIFT","EXTERNAL"\]\)/);
  assert.match(source,/body\.paymentSource==="CASH_SHIFT"/);
  assert.match(source,/expensesTotal:deductedSupplierPayments\+deductedOtherExpenses/);
});

test("no-document mode requires a description and payment requests have a stable key",()=>{
  assert.match(source,/description\.trim\(\)\.length<3/);
  assert.match(source,/idempotencyKey:z\.string/);
  assert.match(source,/function paymentId\(companyId,storeId,key\)/);
});
