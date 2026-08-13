import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/sales-journal-v1.js",import.meta.url),"utf8");

test("sales journal is tenant/store/date scoped and returns real item/payment detail",()=>{
  assert.match(route,/"companyId"=\$\{req\.user\.companyId\}/);
  assert.match(route,/\$\{storeId\}::text IS NULL/);
  assert.match(route,/s\."occurredAt">=\$\{from\}/);
  assert.match(route,/json_build_object\(/);
  assert.match(route,/'description',l\."description"/);
  assert.match(route,/'quantity',l\."quantity"/);
  assert.match(route,/FROM "Payment" p WHERE p\."saleId"=s\."id"/);
  assert.match(route,/LEFT JOIN "Employee" e/);
  assert.match(route,/LEFT JOIN "Customer" cu/);
  assert.match(route,/JOIN "Store" st/);
});
