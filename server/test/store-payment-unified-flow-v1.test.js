import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");

test("payments reuse PurchaseDocument from the existing OCR approval flow",()=>{
  assert.match(route,/evidenceMode:z\.enum\(\["DOCUMENT","NO_DOCUMENT"\]\)/);
  assert.match(route,/FROM "PurchaseDocument"/);
  assert.match(route,/"companyId"=\$\{req\.user\.companyId\}/);
  assert.match(route,/"storeId"=\$\{store\.id\}/);
  assert.match(route,/"status" IN \('DRAFT','APPROVED'\)/);
  assert.doesNotMatch(route,/createWorker|tesseract|recognize\(/i);
});

test("no-document payments require a reason and retain normal audit fields",()=>{
  assert.match(route,/body\.description\.trim\(\)\.length<3/);
  assert.match(route,/αιτιολογία\/περιγραφή είναι υποχρεωτική/);
  assert.match(route,/"sessionId"/);
  assert.match(route,/"actorId","actorName"/);
  assert.match(route,/"occurredAt"/);
});

test("cash-shift source automatically drives the existing shift deduction",()=>{
  assert.match(route,/paymentSource:z\.enum\(\["CASH_SHIFT","EXTERNAL"\]\)/);
  assert.match(route,/body\.paymentSource==="CASH_SHIFT"/);
  assert.match(route,/expensesTotal:deductedSupplierPayments\+deductedOtherExpenses/);
});

test("new and legacy payment submissions are protected from duplicate persistence",()=>{
  assert.match(route,/idempotencyKey:z\.string/);
  assert.match(route,/function paymentId\(companyId,storeId,key\)/);
  assert.match(route,/paymentKey=isPayment\?\(body\.idempotencyKey\|\|legacyAttachment\?\.checksum\)/);
  assert.match(route,/const id=isPayment\?paymentId\(req\.user\.companyId,store\.id,paymentKey\):crypto\.randomUUID\(\)/);
  assert.match(route,/ίδια πληρωμή έχει ήδη καταχωρηθεί/);
});
