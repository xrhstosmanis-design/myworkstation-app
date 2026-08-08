import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const owner=fs.readFileSync(new URL("../src/routes/owner-products.js",import.meta.url),"utf8");
const commerce=fs.readFileSync(new URL("../src/routes/commerce-v1.js",import.meta.url),"utf8");
const cash=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const ownerUi=fs.readFileSync(new URL("../../client/src/components/commerce/OwnerProductCenter.jsx",import.meta.url),"utf8");
const supplierUi=fs.readFileSync(new URL("../../client/src/components/commerce/SupplierPriceComparisonPanel.jsx",import.meta.url),"utf8");
const cashUi=fs.readFileSync(new URL("../../client/src/components/cloud/CashControlPanel.jsx",import.meta.url),"utf8");

test("bulk pricing is tenant scoped, selected and audited",()=>{
  assert.match(owner,/router\.post\("\/prices\/bulk"/);
  assert.match(owner,/productIds:z\.array/);
  assert.match(owner,/storeIds:z\.array/);
  assert.match(owner,/"companyId"=\$\{company\}/);
  assert.match(owner,/BULK_STORE_PRICE/);
  assert.match(ownerUi,/Μαζική αλλαγή τιμών με επιλογή προϊόντων/);
});

test("promotions accept barcode and Excel source-store fanout",()=>{
  assert.match(owner,/productByBarcode\(company,body\.barcode\)/);
  assert.match(owner,/\/promotions\/import-excel/);
  assert.match(owner,/sourceStoreId/);
  assert.match(owner,/targetStoreIds/);
  assert.match(ownerUi,/Δημιουργία πρώτα στο κατάστημα/);
  assert.match(ownerUi,/Αποστολή αντιγράφου και στα υπόλοιπα/);
});

test("supplier comparison ranks normalized approved purchase costs",()=>{
  assert.match(commerce,/supplier-price-comparison/);
  assert.match(commerce,/unitsPerPackage/);
  assert.match(commerce,/DENSE_RANK/);
  assert.match(commerce,/d\."companyId"=\$\{req\.user\.companyId\}/);
  assert.match(commerce,/d\."status"='APPROVED'/);
  assert.match(supplierUi,/ΦΘΗΝΟΤΕΡΟΣ/);
});

test("POS-EFTPOS variance only creates a review warning",()=>{
  assert.match(cash,/eftposTotal/);
  assert.match(cash,/cardVariance=ledger\.cardSales-body\.eftposTotal/);
  assert.match(cash,/authoritativeShiftTotals/);
  assert.match(cash,/findConsecutiveDuplicateSales/);
  assert.match(cash,/signature\(previous\)!==signature\(current\)/);
  assert.doesNotMatch(cash,/DELETE FROM "Sale"/);
  assert.doesNotMatch(cash,/UPDATE "Sale" SET "status"='CANCELLED'/);
  assert.match(cashUi,/Δεν έγινε αυτόματη ακύρωση ή αλλαγή συναλλαγής/);
  assert.match(cashUi,/label="Σύνολο EFTPOS"/);
});
