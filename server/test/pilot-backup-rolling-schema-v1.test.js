import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");

test("pilot safety backup probes every optional commercial table independently",()=>{
  assert.match(route,/to_regclass\('public\."Product"'\)::text AS "product"/);
  assert.match(route,/to_regclass\('public\."ProductCategory"'\)::text AS "category"/);
  assert.match(route,/to_regclass\('public\."ProductBarcode"'\)::text AS "barcode"/);
  assert.match(route,/to_regclass\('public\."StoreProduct"'\)::text AS "storeProduct"/);
  assert.match(route,/to_regclass\('public\."Supplier"'\)::text AS "supplier"/);
  assert.match(route,/const categories=available\.category\?/);
  assert.match(route,/const suppliers=available\.supplier\?/);
});

test("pilot safety backup declares which optional sections were available",()=>{
  assert.match(route,/completeness:\{/);
  assert.match(route,/productCatalog:Boolean\(available\.product\)/);
  assert.match(route,/barcodes:Boolean\(available\.barcode\)/);
  assert.match(route,/suppliers:Boolean\(available\.supplier\)/);
});
