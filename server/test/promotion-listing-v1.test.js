import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const route=fs.readFileSync(path.join(repo,"server/src/routes/price-catalog-promotion-guard.js"),"utf8");

test("promotion listing is read-only and tenant scoped",()=>{
  assert.match(route,/router\.get\("\/promotions\/scoped"/);
  assert.match(route,/const companyId=req\.user\.companyId/);
  assert.match(route,/WHERE pr\."companyId"=\$\{companyId\}/);
  assert.match(route,/LIMIT 1000/);
  assert.match(route,/res\.json\(\{items:rows,count:rows\.length\}\)/);
  assert.doesNotMatch(route,/router\.get\("\/promotions\/scoped"[\s\S]*?(INSERT INTO|UPDATE .*PriceCatalogPromotion|DELETE FROM)/);
});
