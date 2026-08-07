import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/commerce-v1.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/commerce/SupplierManagementPanel.jsx",import.meta.url),"utf8");
const storeRoute=await readFile(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");

test("supplier detail is company scoped and returns purchases payments and costs",()=>{
  assert.match(route,/\/suppliers\/:supplierId\/detail/);
  assert.match(route,/"id"=\$\{req\.params\.supplierId\} AND "companyId"=\$\{req\.user\.companyId\}/);
  assert.match(route,/productCosts/);
  assert.match(route,/averagePieceCost/);
  assert.match(route,/estimatedBalance/);
});

test("supplier payments use stable supplier ids with legacy name fallback",()=>{
  assert.match(storeRoute,/supplierId:z\.string/);
  assert.match(storeRoute,/SELECT "id","name" FROM "Supplier"/);
  assert.match(route,/"supplierId"=\$\{supplier\.id\}/);
  assert.match(route,/LOWER\("supplierName"\)=LOWER/);
});

test("supplier card explains non-accounting balance and cost history",()=>{
  assert.match(client,/Ιστορικό αγορών/);
  assert.match(client,/Συνδεδεμένες πληρωμές/);
  assert.match(client,/Κόστος προϊόντων από αγορές/);
  assert.match(client,/όχι λογιστική επιβεβαίωση/);
});
