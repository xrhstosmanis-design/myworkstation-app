import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const [repair,pkg]=await Promise.all([
  readFile(new URL("../src/online-recipe-stock-repair.js",import.meta.url),"utf8"),
  readFile(new URL("../package.json",import.meta.url),"utf8")
]);

test("online recipe stock repair is bounded to recent delivered KAT orders",()=>{
  assert.match(repair,/REPAIR_CUTOFF=new Date\("2026-08-20T06:45:00\.000Z"\)/);
  assert.match(repair,/o\."status"='DELIVERED'/);
  assert.match(repair,/LOWER\(s\."name"\)=LOWER\(\$\{KAT_STORE_NAME\}\)/);
  assert.match(repair,/postedAt<REPAIR_CUTOFF/);
});

test("online recipe stock repair reconciles only the missing movement quantity",()=>{
  assert.match(repair,/sourceType"='ONLINE_ORDER_RECIPE'/);
  assert.match(repair,/const missing=Math\.max\(0,item\.quantity-n\(movement\?\.consumed\)\)/);
  assert.match(repair,/SET "currentStock"=COALESCE\("currentStock",0\)-\$\{missing\}/);
  assert.match(repair,/'RECIPE_CONSUMPTION',\$\{-missing\}/);
  assert.match(repair,/FOR UPDATE/);
});

test("server start runs actor repair then stock repair before app start",()=>{
  const parsed=JSON.parse(pkg);
  assert.equal(parsed.scripts.start,"node src/online-transaction-actor-fix.js && node src/online-recipe-stock-repair.js && node src/index.js");
  assert.equal(parsed.dependencies.bcryptjs,"^2.4.3");
});
