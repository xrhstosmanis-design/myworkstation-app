import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {reconcileInvoiceLines} from "../src/invoice-line-reconciliation.js";

test("header total wins when it equals the sum of net OCR lines",()=>{
  const lines=[
    {description:"TEREA YELLOW",netAmount:74.06,vatRate:100,grossAmount:1372.23},
    {description:"MARLBORO GOLD",netAmount:137.10,vatRate:100,grossAmount:2817.41},
    {description:"OTHER",netAmount:703.53,vatRate:0,grossAmount:703.53}
  ];
  const result=reconcileInvoiceLines(lines,914.69);
  assert.equal(result.strategy,"HEADER_TOTAL_EQUALS_NET");
  assert.equal(result.netTotal,914.69);
  assert.equal(result.grossTotal,914.69);
  assert.equal(result.difference,0);
  assert.deepEqual(result.normalizedLines.map(line=>line.vatRate),[0,0,0]);
  assert.deepEqual(result.normalizedLines.map(line=>line.grossAmount),[74.06,137.1,703.53]);
});

test("canonical VAT is rebuilt and non-canonical OCR VAT cannot inflate totals",()=>{
  const result=reconcileInvoiceLines([{netAmount:100,vatRate:24,grossAmount:999},{netAmount:50,vatRate:83,grossAmount:5000}],174);
  assert.equal(result.strategy,"NET_PLUS_CANONICAL_VAT");
  assert.equal(result.grossTotal,174);
  assert.deepEqual(result.normalizedLines.map(line=>line.grossAmount),[124,50]);
});

test("existing POS OCR drafts have an idempotent safe repair route",()=>{
  const source=fs.readFileSync(new URL("../src/routes/purchase-orders.js",import.meta.url),"utf8");
  assert.match(source,/\/:orderId\/reconcile-ocr-total/);
  assert.match(source,/Math\.abs\(headerTotal-netTotal\)>0\.05/);
  assert.match(source,/"grossAmount"="netAmount"/);
  assert.match(source,/found\.sourceType!=="POS_OCR_DRAFT"/);
});

test("supplier reading knowledge is global by VAT while product ids stay tenant-safe",()=>{
  const intake=fs.readFileSync(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");
  const posting=fs.readFileSync(new URL("../src/routes/purchase-order-posting-guard.js",import.meta.url),"utf8");
  const learning=fs.readFileSync(new URL("../src/invoice-learning-lab-bootstrap.js",import.meta.url),"utf8");
  const knowledge=fs.readFileSync(new URL("../src/lib/invoice-learning-product-knowledge.js",import.meta.url),"utf8");
  const profileTable=learning.match(/CREATE TABLE IF NOT EXISTS "SupplierInvoiceLearningProfile"[\s\S]*?\)`/u)?.[0]||"";
  assert.doesNotMatch(profileTable,/"companyId"|"storeId"/);
  assert.match(knowledge,/WHERE \(\$1<>'' AND "supplierTaxId"=\$1\)/);
  assert.match(intake,/FROM "SupplierProductMapping" WHERE "companyId"=\$\{companyId\} AND "supplierId"=\$\{supplierId\}/);
  assert.match(posting,/ON CONFLICT \("companyId","supplierId","productId"\) DO UPDATE/);
});
