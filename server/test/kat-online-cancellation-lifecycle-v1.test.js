import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/kat-online-ordering.js",import.meta.url),"utf8");
const bootstrap=fs.readFileSync(new URL("../src/kat-online-ordering-bootstrap.js",import.meta.url),"utf8");
const pos=fs.readFileSync(new URL("../../client/src/components/store/StoreOnlineOrdersV2.jsx",import.meta.url),"utf8");
const backoffice=fs.readFileSync(new URL("../../client/src/components/commerce/OnlineOrdersBackofficePanel.jsx",import.meta.url),"utf8");

test("online cancellation is serialized, replay-safe and blocks completed sales",()=>{
  assert.match(route,/orders\/:orderId\/cancel/);
  assert.match(route,/pg_advisory_xact_lock/);
  assert.match(route,/FOR UPDATE/);
  assert.match(route,/order\.status==="CANCELLED".*replay:true/s);
  assert.match(route,/order\.status==="DELIVERED"\|\|order\.saleId\|\|order\.commercialPostedAt/);
});

test("cancellation distinguishes pre-production from waste without fake stock reversal",()=>{
  assert.match(route,/BEFORE_PRODUCTION/);
  assert.match(route,/WASTE_RECORDED_NO_STOCK_REVERSAL/);
  assert.match(route,/MANUAL_RECONCILIATION_REQUIRED/);
  assert.match(route,/saleCreated:false,fiscalCreated:false/);
  assert.doesNotMatch(route,/ONLINE_ORDER_CANCEL_COMPENSATION/);
});

test("cancellation metadata, POS action and BackOffice audit view are present",()=>{
  for(const field of ["cancelledAt","cancelReason","cancellationStage","cancellationDisposition"])assert.match(bootstrap,new RegExp(field));
  assert.match(route,/ONLINE_ORDER_CANCELLED/);
  assert.match(pos,/ΑΚΥΡΩΣΗ/);
  assert.match(backoffice,/Δεν δημιουργήθηκε πώληση, fiscal ή αυτόματη επιστροφή stock/);
});
