import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const server=fs.readFileSync(path.join(repo,"server/src/routes/pos-sale-actions.js"),"utf8");
const commerce=fs.readFileSync(path.join(repo,"server/src/routes/commerce-v1.js"),"utf8");

test("POS return core transaction does not depend on a guessed StockMovement schema",()=>{
  assert.doesNotMatch(server,/INSERT INTO \"StockMovement\"/);
  assert.match(server,/UPDATE \"StoreProduct\" sp SET \"currentStock\"=COALESCE\(sp\.\"currentStock\",0\)\+/);
  assert.match(server,/stockRestoredProductIds:restoredProductIds/);
});

test("BackOffice keeps its canonical StockMovement contract independently",()=>{
  assert.match(commerce,/INSERT INTO \"StockMovement\" \(\"id\",\"storeId\",\"productId\",\"movementType\",\"quantity\",\"unitCost\",\"sourceType\",\"note\",\"createdByUserId\"\)/);
});
