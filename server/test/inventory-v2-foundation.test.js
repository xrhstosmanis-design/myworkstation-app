import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=path=>fs.readFileSync(new URL(path,import.meta.url),"utf8");
test("Inventory 2.0 supports partial scope without touching unrelated products",()=>{const route=read("../src/routes/inventory-v2.js");assert.match(route,/PARTIAL_PRODUCTS/);assert.match(route,/PARTIAL_CATEGORIES/);assert.match(route,/p\."id"=ANY/);assert.match(route,/WHERE "stocktakeId"=\$\{st\.id\} FOR UPDATE/)});
test("Inventory 2.0 keeps immutable count and recount evidence",()=>{const schema=read("../src/owner-product-bootstrap.js"),route=read("../src/routes/inventory-v2.js");assert.match(schema,/InventoryCountEvent/);assert.match(schema,/clientEventId/);assert.match(route,/expectedVersion/);assert.match(route,/eventType=previous===null\?"COUNT":"RECOUNT"/)});
test("Inventory mobile access is scoped and expiring",()=>{const route=read("../src/routes/inventory-v2.js");assert.match(route,/INVENTORY_COUNTER/);assert.match(route,/stocktakeId:g\.stocktakeId/);assert.match(route,/zoneId:g\.zoneId/);assert.match(route,/expiresIn:"8h"/)});
