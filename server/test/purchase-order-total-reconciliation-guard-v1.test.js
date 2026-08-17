import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../src/routes/purchase-order-total-reconciliation-guard.js",import.meta.url),"utf8");

test("invoice total reconciliation keeps 0.05 EUR tolerance",()=>{
  assert.match(source,/const TOLERANCE=0\.05/);
  assert.match(source,/INVOICE_TOTAL_MISMATCH/);
  assert.match(source,/absoluteDifference/);
});

test("mismatch override is restricted and requires a reason",()=>{
  assert.match(source,/SUPER_ADMIN/);
  assert.match(source,/OWNER/);
  assert.match(source,/ADMIN/);
  assert.match(source,/MANAGER/);
  assert.match(source,/totalMismatchOverride/);
  assert.match(source,/totalMismatchReason/);
  assert.match(source,/reason\.length<5/);
  assert.match(source,/OWNER_MANAGER/);
});

test("override creates immutable responsibility audit fields",()=>{
  assert.match(source,/PurchaseOrderTotalOverrideAudit/);
  assert.match(source,/actorName/);
  assert.match(source,/actorRole/);
  assert.match(source,/invoiceTotal/);
  assert.match(source,/linesTotal/);
  assert.match(source,/difference/);
  assert.match(source,/reason/);
  assert.match(source,/FINALIZED/);
  assert.match(source,/NOT_FINALIZED/);
});
