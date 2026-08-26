import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/store-table-orders.js",import.meta.url),"utf8");
const checkout=await readFile(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");
const index=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/store/StoreTableOrdersModal.jsx",import.meta.url),"utf8");
const pos=await readFile(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");
const orderCreate=route.split('router.post("/stores/:storeId/table-orders/:orderId/waste"')[0];

test("wireless table orders are tenant and store scoped",()=>{
  assert.match(route,/"DiningTable"/);
  assert.match(route,/"TableOrder"/);
  assert.match(route,/"companyId"=\$\{req\.user\.companyId\}/);
  assert.match(route,/assertStore/);
  assert.match(index,/storeTableOrdersRoutes/);
});

test("sending an order snapshots products without reducing stock",()=>{
  assert.match(route,/INSERT INTO "TableOrderLine"/);
  assert.match(route,/COALESCE\(sp\."salePrice",p\."salePrice"\)/);
  assert.doesNotMatch(orderCreate,/UPDATE "StoreProduct" SET "currentStock"/);
  assert.match(route,/'TABLE_ORDER_SENT'/);
});

test("POS checkout locks and closes the exact table order once",()=>{
  assert.match(checkout,/tableOrderId:z\.string/);
  assert.match(checkout,/FROM "TableOrder"[\s\S]*FOR UPDATE/);
  assert.match(checkout,/FROM "TableOrderLine"/);
  assert.match(checkout,/SET "status"='PAID',"saleId"=\$\{saleId\}/);
  assert.match(checkout,/linkedCount/);
});

test("responsive POS UI can send, monitor and load table orders",()=>{
  assert.match(ui,/ΑΣΥΡΜΑΤΗ ΠΑΡΑΓΓΕΛΙΟΛΗΨΙΑ/);
  assert.match(ui,/ΑΠΟΣΤΟΛΗ ΤΡΕΧΟΥΣΑΣ ΠΑΡΑΓΓΕΛΙΑΣ/);
  assert.match(ui,/ΦΟΡΤΩΣΗ ΣΤΟ POS/);
  assert.match(pos,/ΤΡΑΠΕΖΙΑ/);
  assert.match(pos,/tableOrderId/);
});

test("table waste uses the normal turnover flow without issuing a receipt",()=>{
  assert.match(route,/table-orders\/:orderId\/waste/);
  assert.match(route,/"source"\) VALUES[\s\S]*'WASTE'/);
  assert.match(route,/'SALE_CASH'/);
  assert.match(route,/'CASH'/);
  assert.match(route,/ΧΩΡΙΣ ΑΠΟΔΕΙΞΗ/);
  assert.match(route,/receipt:false/);
  assert.match(route,/"currentStock"=COALESCE\("currentStock",0\)-/);
  assert.match(route,/TableOrderLine" SET "quantity"="quantity"-/);
});

test("table waste and cancellation require an auditable reason and actor",()=>{
  assert.match(route,/Η ποσότητα φύρας δεν συμφωνεί με την ανοικτή παραγγελία/);
  assert.match(route,/Η ακύρωση απαιτεί αιτιολογία/);
  assert.match(route,/'WASTE'/);
  assert.match(route,/tableName:order\.tableName/);
  assert.match(ui,/ΦΥΡΑ/);
  assert.match(ui,/Υποχρεωτική αιτιολογία ακύρωσης/);
});

test("waste always closes the whole remaining table and cannot be partial",()=>{
  assert.match(route,/Η φύρα τραπεζιού πρέπει να περιλαμβάνει ολόκληρη την υπόλοιπη παραγγελία/);
  assert.match(route,/items\.length!==lines\.length/);
  assert.match(ui,/ΦΥΡΑ ΟΛΟ ΤΟ ΤΡΑΠΕΖΙ/);
  assert.match(ui,/window\.confirm/);
  assert.match(ui,/Υποχρεωτική αιτιολογία φύρας ολόκληρου τραπεζιού/);
});
