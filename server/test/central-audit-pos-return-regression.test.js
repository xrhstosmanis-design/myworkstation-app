import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/kiosk-reports-audit.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/installKioskReportsAuditV2.js",import.meta.url),"utf8");

test("central Audit includes explicit POS full-return events without replacing ledger rows",()=>{
  assert.match(route,/FROM "StoreTransaction" t/);
  assert.match(route,/FROM "PosSaleActionAudit" a/);
  assert.match(route,/a\."actionType" IN \('RETURN','CANCEL'\)/);
  assert.match(route,/eventType:isReturn\?"POS_RETURN":"POS_CANCEL"/);
  assert.match(route,/sourceOfTruth:"StoreTransaction \+ PosSaleActionAudit \+ StoreOperatorAudit"/);
});

test("central Audit labels POS return events for operators",()=>{
  assert.match(ui,/POS_RETURN:"Ολική επιστροφή"/);
  assert.match(ui,/POS_CANCEL:"Ακύρωση πώλησης"/);
  assert.match(ui,/AUDIT_EVENT"\?"Συμβάν"/);
});
