import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/kat-online-ordering.js",import.meta.url),"utf8");

test("online prepared drinks consume selected milk exactly once with an auditable movement",()=>{
  assert.match(route,/p\."sku" AS "productSku"/);
  assert.match(route,/"MWS-KAT-BEV-FREDDO-CAP":70/);
  assert.match(route,/ONLINE_MILK_SKU/);
  assert.match(route,/milkQty=Number\(line\.quantity\|\|0\)\*onlineMilkMl\(line\.productSku\)/);
  assert.match(route,/COALESCE\("currentStock",0\)-\$\{milkQty\}/);
  assert.match(route,/'ONLINE_ORDER_RECIPE'/);
  assert.match(route,/Γάλα modifier/);
});

test("online milk stock enforcement rejects missing or insufficient ingredient stock",()=>{
  assert.match(route,/Το επιλεγμένο γάλα της συνταγής/);
  assert.match(route,/Δεν υπάρχει αρκετό stock γάλακτος/);
  assert.match(route,/COALESCE\("currentStock",0\)>=\$\{milkQty\}/);
});
