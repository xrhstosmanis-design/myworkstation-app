import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const server=fs.readFileSync(path.join(repo,"server/src/routes/pos-sale-actions.js"),"utf8");

test("POS return writes StockMovement with the canonical BackOffice columns",()=>{
  assert.match(server,/INSERT INTO \"StockMovement\" \(\"id\",\"storeId\",\"productId\",\"movementType\",\"quantity\",\"unitCost\",\"sourceType\",\"note\",\"createdByUserId\"\)/);
  assert.doesNotMatch(server,/INSERT INTO \"StockMovement\"[^\n]*\"sourceId\"/);
  assert.match(server,/'POS_REVERSAL'/);
});
