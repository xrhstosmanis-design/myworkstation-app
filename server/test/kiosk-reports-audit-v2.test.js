import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("reports audit exposes sale deletion and deactivation ledgers",()=>{
  const route=read("src/routes/kiosk-reports-audit.js");
  assert.match(route,/sale-list-deletions/);
  assert.match(route,/sale-deletions/);
  assert.match(route,/deactivations/);
  assert.match(route,/KioskAuditEvent/);
  assert.match(route,/auditFromNow:true/);
});

test("product deactivation capture records active state transitions",()=>{
  const middleware=read("src/middleware/product-audit-capture.js");
  assert.match(middleware,/PRODUCT_ACTIVE_CHANGE/);
  assert.match(middleware,/newActive:change\.nextActive/);
  assert.match(middleware,/BULK_PRODUCT_CARD/);
  assert.match(middleware,/PRODUCT_CARD/);
});

test("POS deletion audit uses capture listener without MutationObserver",()=>{
  const client=fs.readFileSync(new URL("../../client/src/components/commerce/installPosDeletionAudit.js",import.meta.url),"utf8");
  assert.match(client,/sale-list-deletions/);
  assert.match(client,/ITEM_REMOVE/);
  assert.match(client,/CLEAR_CART/);
  assert.match(client,/addEventListener\("click"/);
  assert.doesNotMatch(client,/MutationObserver/);
});

test("audit reports render the two real audit tabs",()=>{
  const client=fs.readFileSync(new URL("../../client/src/components/commerce/installKioskReportsAuditV2.js",import.meta.url),"utf8");
  assert.match(client,/Διαγραφές λίστας πώλησης/);
  assert.match(client,/Απενεργοποιήσεις ειδών/);
  assert.match(client,/\/api\/reports\/sale-deletions/);
  assert.match(client,/\/api\/reports\/deactivations/);
  assert.doesNotMatch(client,/MutationObserver/);
});

test("audit bootstrap is loaded by Vite index",()=>{
  const html=fs.readFileSync(new URL("../../client/index.html",import.meta.url),"utf8");
  assert.match(html,/report-audit-bootstrap\.js/);
});
