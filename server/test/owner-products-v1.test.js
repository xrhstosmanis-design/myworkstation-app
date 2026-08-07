import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const bootstrap=fs.readFileSync(new URL("../src/owner-product-bootstrap.js",import.meta.url),"utf8");
const route=fs.readFileSync(new URL("../src/routes/owner-products.js",import.meta.url),"utf8");

test("owner product schema is additive",()=>{
  assert.doesNotMatch(bootstrap,/\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i);
  for(const table of ["ProductPriceHistory","Promotion","PromotionStore","Stocktake","StocktakeLine"])assert.match(bootstrap,new RegExp(`CREATE TABLE IF NOT EXISTS \\\"${table}\\\"`));
});

test("owner product flow preserves master catalog and store pricing rules",()=>{
  assert.match(route,/MasterProduct/);
  assert.match(route,/"scanEnabled"=true/);
  assert.match(route,/ProductPriceHistory/);
  assert.match(route,/promotionType/);
  assert.match(route,/BUY_X_GET_Y/);
  assert.match(route,/STOCKTAKE_ADJUSTMENT/);
  assert.match(route,/vatVerified/);
});
