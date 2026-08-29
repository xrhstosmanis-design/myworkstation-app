import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const ui=await readFile(new URL("../../client/src/components/store/StorePosPaymentsModal.jsx",import.meta.url),"utf8");
const route=await readFile(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");

test("an undocumented other expense requires the operator responsibility acknowledgement",()=>{
  assert.match(ui,/noDocumentAcknowledged/);
  assert.match(ui,/Δήλωση ευθύνης χωρίς παραστατικό/);
  assert.match(ui,/ανοίγω το συρτάρι, γίνεται η πληρωμή/);
  assert.match(ui,/evidenceMode="NO_DOCUMENT"/);
  assert.match(ui,/idempotencyKey=crypto\.randomUUID\(\)/);
});

test("undocumented expenses remain auditable server-side",()=>{
  assert.match(route,/evidenceMode:z\.enum\(\["DOCUMENT","NO_DOCUMENT"\]\)/);
  assert.match(route,/body\.description\.trim\(\)\.length<3/);
  assert.match(route,/body\.paymentSource==="CASH_SHIFT"/);
});
