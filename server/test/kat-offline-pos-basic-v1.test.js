import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(repo,file),"utf8");
const panel=read("client/src/components/store/StorePosPanel.jsx");
const operator=read("client/src/components/store/StoreOperatorApp.jsx");
const auth=read("server/src/middleware/auth.js");
const checkout=read("server/src/routes/store-pos.js");
const queue=read("client/src/offline-sale-queue.js");

test("offline catalog and runtime permissions are persisted per store",()=>{
  assert.match(panel,/myworkstation:offline-pos-catalog:\$\{storeId\}/);
  assert.match(panel,/writeOfflineCatalog\(store\.id,pos\)/);
  assert.match(panel,/readOfflineCatalog\(store\.id\)/);
  assert.match(operator,/myworkstation:pos-runtime-access:\$\{storeId\}/);
  assert.match(operator,/writeRuntimeAccess\(session\.store\.id,access\)/);
  assert.match(operator,/const fallback=readRuntimeAccess\(session\.store\.id\)/);
});

test("offline queue accepts cash only and never claims a card or return sale",()=>{
  assert.match(panel,/networkFailure&&paymentMethod==="CASH"&&!cart\.some\(row=>row\.exchangeReturn\)/);
  assert.match(panel,/Offline: επιτρέπεται μόνο πώληση ΜΕΤΡΗΤΩΝ/);
  assert.match(panel,/Κάρτα\/IRIS\/μικτή πληρωμή\/επιστροφές παραμένουν μπλοκαρισμένες/);
  assert.doesNotMatch(panel,/request:\{paymentMethod:"CASH",payments:/);
});

test("offline cash replay keeps one stable idempotency key and cannot overlap",()=>{
  assert.match(queue,/clientTransactionId:id/);
  assert.match(queue,/locks\.has\(storeId\)/);
  assert.match(queue,/locks\.add\(storeId\)/);
  assert.match(queue,/finally\{locks\.delete\(storeId\)\}/);
  assert.match(panel,/JSON\.stringify\(request\)/);
});

test("cart clears only after durable local queue write",()=>{
  const write=queue.indexOf("if(!writeOfflineSaleQueue(storeId,rows,storage))throw");
  const queued=panel.indexOf("const offline=queueOfflineCashSale");
  const clear=panel.indexOf("clearCart()",queued);
  assert.ok(write>=0&&queued>=0&&clear>queued);
});

test("locked offline prices do not grant arbitrary retail-price changes",()=>{
  assert.match(auth,/offlineLockedPrice=checkoutItems\.length>0&&checkoutItems\.every/);
  assert.match(auth,/manualPrice&&!offlineLockedPrice&&!permissions\.includes\("CHANGE_RETAIL"\)/);
  assert.match(checkout,/overrideReason==="OFFLINE_POS_LOCKED_PRICE"&&Math\.abs\(unitPrice-round2\(item\.retailPrice\)\)>\.009/);
  assert.match(checkout,/priceSource:overrideReason==="OFFLINE_POS_LOCKED_PRICE"\?"OFFLINE_LOCKED":"MANUAL"/);
  assert.match(checkout,/manualPrice:overrideReason!=="OFFLINE_POS_LOCKED_PRICE"/);
});

test("offline replay remains explicitly non fiscal",()=>{
  assert.match(panel,/OFFLINE: Η πώληση/);
  assert.match(checkout,/'NON_FISCAL'/);
  assert.match(panel,/η πώληση καταγράφεται στο MyWorkStation ως NON_FISCAL/);
});
