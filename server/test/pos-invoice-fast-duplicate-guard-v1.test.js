import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url),"utf8");
const legacyClient=fs.readFileSync(new URL("../../client/src/components/store/StoreSupplierInvoiceFast.jsx",import.meta.url),"utf8");
const transactions=fs.readFileSync(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");
const intake=fs.readFileSync(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");

test("POS invoice checks the exact uploaded file before any payment",()=>{
  assert.match(client,/fast-duplicate-check[\s\S]{0,300}dataUrl:fileDataUrl/);
  const duplicateCheck=client.indexOf('fast-duplicate-check');
  const paymentWrite=client.indexOf('/api/transactions/stores/');
  assert.ok(duplicateCheck>=0&&paymentWrite>duplicateCheck,"duplicate check must precede supplier payment");
  assert.match(route,/createHash\("sha256"\)/);
  assert.match(route,/FROM "DocumentAttachment" a[\s\S]*a\."checksum"=\$\{checksum\}/);
  assert.match(route,/code:"DUPLICATE_INVOICE_FILE"/);
  assert.match(route,/Δεν έγινε νέα πληρωμή ή πίστωση/);
});

test("an incomplete AI job is resumed without a second upload or payment",()=>{
  assert.match(route,/resumable:true,resumeJobId:attachments\[0\]\.jobId/);
  assert.match(route,/paymentTransactionId:paymentByInvoice\[0\]\?\.id\|\|paymentByFile\[0\]\?\.id\|\|null/);
  assert.match(route,/ORDER BY t\."occurredAt" ASC LIMIT 1/);
  assert.match(route,/existingJobs\[0\]\?\.id\|\|id\(\)/);
  assert.match(route,/force:true,additionalPageJobIds/);
  assert.match(route,/paymentTransactionId:source\.paymentTransactionId\|\|null/);
});

test("POS invoice blocks an existing supplier payment even when no purchase draft exists",()=>{
  assert.match(route,/FROM "StoreTransaction" t[\s\S]*t\."type"='SUPPLIER_PAYMENT'/);
  assert.match(route,/t\."attachmentChecksum"=\$\{checksum\}/);
  assert.match(route,/POSITION\(\$\{documentToken\}/);
  assert.match(route,/code:"DUPLICATE_INVOICE_PAYMENT"/);
});

test("invoice payment uniqueness is enforced centrally across users, POS and stores",()=>{
  assert.match(client,/invoiceDocumentNumber:documentNumber\.trim\(\)/);
  assert.match(legacyClient,/invoiceDocumentNumber:documentNumber\.trim\(\)\|\|null/);
  assert.match(transactions,/invoiceDocumentNumber:z\.string/);
  assert.match(transactions,/StoreTransaction_active_invoice_payment_unique/);
  assert.match(transactions,/\("companyId","invoicePaymentKey"\)/);
  assert.match(transactions,/supplier-invoice-payment:\$\{invoicePaymentKey\}/);
  assert.match(transactions,/pg_advisory_xact_lock/);
  assert.match(transactions,/code:"DUPLICATE_INVOICE_PAYMENT"/);
  assert.match(transactions,/ORDER BY t\."occurredAt" ASC LIMIT 1/);
  assert.doesNotMatch(transactions,/invoicePaymentKey=.*actor/);
  assert.doesNotMatch(transactions,/invoicePaymentKey=.*store\.id/);
});

test("background intake cannot create a second supplier invoice payment",()=>{
  assert.match(intake,/StoreTransaction_active_invoice_payment_unique/);
  assert.match(intake,/supplier-invoice-payment:\$\{invoicePaymentKey\}/);
  assert.match(intake,/const sameInvoice=.*invoicePaymentKey===invoicePaymentKey/);
  assert.match(intake,/Η πληρωμή του τιμολογίου \$\{body\.documentNumber\} υπάρχει ήδη/);
  assert.match(intake,/"invoiceDocumentNumber","invoicePaymentKey"/);
});

test("invoice number uniqueness applies across every store in the company",()=>{
  assert.match(route,/WHERE d\."companyId"=\$\{companyId\} AND d\."supplierId"=\$\{supplierId\}/);
  assert.match(route,/WHERE o\."companyId"=\$\{companyId\} AND o\."supplierId"=\$\{supplierId\}/);
  assert.doesNotMatch(route,/WHERE d\."companyId"=\$\{companyId\} AND d\."storeId"=\$\{storeId\}/);
  assert.doesNotMatch(route,/WHERE o\."companyId"=\$\{companyId\} AND o\."storeId"=\$\{storeId\}/);
});
