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
  assert.match(client,/api\(`\/api\/reports\/\$\{/);
  assert.match(client,/sale-deletions/);
  assert.match(client,/deactivations/);
  assert.doesNotMatch(client,/MutationObserver/);
});

test("audit bootstrap is loaded by Vite index",()=>{
  const html=fs.readFileSync(new URL("../../client/index.html",import.meta.url),"utf8");
  assert.match(html,/report-audit-bootstrap\.js/);
});

test("events tab is permanent and shortage attempts are included in BackOffice audit",()=>{
  const suite=fs.readFileSync(new URL("../../client/src/components/commerce/installKioskReportsSuite.js",import.meta.url),"utf8");
  const entry=fs.readFileSync(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");
  const route=read("src/routes/kiosk-reports-audit.js");
  assert.match(suite,/\["audit-events","🛡 Συμβάντα \/ Audit"\]/);
  assert.match(entry,/installKioskReportsAuditV2\(\)/);
  assert.match(route,/SHIFT_CLOSE_SHORTAGE_ATTEMPT/);
  assert.match(route,/SHIFT_CLOSED_WITH_CONFIRMED_SHORTAGE/);
  assert.match(route,/StoreTransaction \+ PosSaleActionAudit \+ StoreOperatorAudit/);
});

test("cart removals and manual price changes are central audit events",()=>{
  const route=read("src/routes/kiosk-reports-audit.js");
  const pilot=read("src/routes/store-pos-pilot-actions.js");
  const client=fs.readFileSync(new URL("../../client/src/components/commerce/installKioskReportsAuditV2.js",import.meta.url),"utf8");
  assert.match(route,/CART_ITEM_REMOVE/);
  assert.match(route,/PRICE_CHANGE/);
  assert.match(route,/ΔΙΑΓΡΑΦΗ ΠΡΟΪΟΝΤΟΣ ΑΠΟ ΚΑΛΑΘΙ/);
  assert.match(route,/ΧΕΙΡΟΚΙΝΗΤΗ ΑΛΛΑΓΗ ΤΙΜΗΣ/);
  assert.match(route,/δεν ολοκληρώθηκε πώληση \/ δεν κινήθηκε stock/);
  assert.match(pilot,/\["CART_ITEM_REMOVE","PRICE_CHANGE"\]/);
  assert.match(pilot,/sessionId:shift\?\.id\|\|null/);
  assert.match(client,/CART_ITEM_REMOVE:"Διαγραφή προϊόντος από καλάθι"/);
  assert.match(client,/PRICE_CHANGE:"Χειροκίνητη αλλαγή τιμής"/);
});
