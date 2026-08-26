import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const tables=await readFile(new URL("../src/routes/store-table-orders.js",import.meta.url),"utf8");
const preparation=await readFile(new URL("../src/routes/store-preparation.js",import.meta.url),"utf8");
const checkout=await readFile(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/store/StoreTableOrdersModal.jsx",import.meta.url),"utf8");

test("table orders automatically create preparation batches by production station",()=>{
  assert.match(tables,/PreparationProductSettings/);
  assert.match(tables,/const stations=new Map/);
  assert.match(tables,/modifiers:line\.modifiers\|\|\[\]/);
  assert.match(ui,/item\.preparation\?\.modifiers\|\|\[\]/);
  assert.match(tables,/INSERT INTO "StorePreparationBatch"[\s\S]*"tableOrderId"/);
  assert.match(tables,/preparationBatches\.push/);
  assert.doesNotMatch(tables.split('router.post("/stores/:storeId/table-orders/:orderId/waste"')[0],/UPDATE "StoreProduct" SET "currentStock"/);
});

test("checkout links each prepared table item to one idempotent stock batch",()=>{
  assert.match(checkout,/WHERE "tableOrderId"=\$\{tableOrder\.id\}/);
  assert.match(checkout,/item\.overrideReason=`PREPARATION:\$\{batch\.id\}`/);
  assert.match(preparation,/PreparationStockConsumption_once_idx/);
  assert.match(preparation,/"status"='SENT' OR "status"='READY'/);
  assert.match(preparation,/SET "status"='CONSUMED'/);
});

test("whole-table waste consumes prepared ingredients once and remains non fiscal",()=>{
  const waste=tables.split('router.post("/stores/:storeId/table-orders/:orderId/waste"')[1];
  assert.match(waste,/transactionMode:"WASTE"/);
  assert.match(waste,/overrideReason:preparationByProduct/);
  assert.match(waste,/receipt:false/);
  assert.match(waste,/fiscalStatus:"NON_FISCAL"/);
});

test("ready state reaches waiter UI without manual refresh",()=>{
  assert.match(tables,/SET "status"='READY',"readyAt"=NOW\(\)/);
  assert.match(tables,/TABLE_ORDER_STATUS/);
  assert.match(ui,/setInterval\(\(\)=>load\(\),10000\)/);
  assert.match(ui,/ΕΤΟΙΜΗ ΓΙΑ ΠΑΡΑΛΑΒΗ/);
  assert.match(ui,/Παρασκευή:/);
});
