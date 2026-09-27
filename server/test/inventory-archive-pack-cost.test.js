import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/inventory-archive.js",import.meta.url),"utf8");

test("archive prices corrected package purchases by stocked piece in latest and average cost",()=>{
  assert.equal((route.match(/sm\."movementType"='PURCHASE_PACK_CORRECTION'/g)||[]).length,2);
  assert.equal((route.match(/sm\."sourceId"=d2?\."id"/g)||[]).length,2);
  assert.match(route,/"lastPurchasePrice"/);
  assert.match(route,/"averagePurchasePrice"/);
  assert.equal((31.63/30).toFixed(4),"1.0543");
});
