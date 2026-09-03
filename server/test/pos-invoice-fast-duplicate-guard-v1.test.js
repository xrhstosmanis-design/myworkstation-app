import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url),"utf8");

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

test("POS invoice blocks an existing supplier payment even when no purchase draft exists",()=>{
  assert.match(route,/FROM "StoreTransaction" t[\s\S]*t\."type"='SUPPLIER_PAYMENT'/);
  assert.match(route,/t\."attachmentChecksum"=\$\{checksum\}/);
  assert.match(route,/POSITION\(\$\{documentToken\}/);
  assert.match(route,/code:"DUPLICATE_INVOICE_PAYMENT"/);
});

test("invoice number uniqueness applies across every store in the company",()=>{
  assert.match(route,/WHERE d\."companyId"=\$\{companyId\} AND d\."supplierId"=\$\{supplierId\}/);
  assert.match(route,/WHERE o\."companyId"=\$\{companyId\} AND o\."supplierId"=\$\{supplierId\}/);
  assert.doesNotMatch(route,/WHERE d\."companyId"=\$\{companyId\} AND d\."storeId"=\$\{storeId\}/);
  assert.doesNotMatch(route,/WHERE o\."companyId"=\$\{companyId\} AND o\."storeId"=\$\{storeId\}/);
});
