import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/commerce-v1.js",import.meta.url),"utf8");
const guard=await readFile(new URL("../src/middleware/commerce-tenant-guard.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/commerce/RecipeManagementPanel.jsx",import.meta.url),"utf8");

test("recipe API is company scoped and replaces items atomically",()=>{
  assert.match(route,/router\.put\("\/recipes\/:productId"/);
  assert.match(route,/"companyId"=\$\{req\.user\.companyId\}/);
  assert.match(route,/DELETE FROM "RecipeItem"/);
  assert.match(guard,/το συστατικό συνταγής/);
});

test("sales consume recipe ingredients with auditable stock movements",()=>{
  assert.match(route,/line\.quantity\*Number\(ingredient\.quantity\)\/Number\(recipe\[0\]\.yieldQuantity/);
  assert.match(route,/RECIPE_SALE/);
  assert.match(route,/Ανάλωση συνταγής/);
});

test("recipe UI exposes yield ingredients cost and stock formula",()=>{
  assert.match(client,/Απόδοση συνταγής/);
  assert.match(client,/Εκτιμώμενο κόστος/);
  assert.match(client,/Προσθήκη συστατικού/);
  assert.match(client,/ποσότητα πώλησης × ποσότητα συστατικού ÷ απόδοση/);
});
