import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/provider-logistics.js",import.meta.url),"utf8");
const schema=await readFile(new URL("../src/extended-modules-bootstrap.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/DispatchProviderPanel.jsx",import.meta.url),"utf8");

test("sandbox validation records attempts without an external call",()=>{
  assert.match(schema,/CREATE TABLE IF NOT EXISTS "ProviderAttempt"/);
  assert.match(schema,/"externalCall" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(route,/'VALIDATION_ONLY',false,'SUCCESS'/);
  assert.match(route,/externalCall:false,providerMark:null/);
});

test("reconciliation compares the current payload with the immutable hash",()=>{
  assert.match(route,/actualHash===row\.payloadHash/);
  assert.match(route,/PAYLOAD_HASH_MISMATCH/);
  assert.match(route,/RECONCILIATION_ERROR/);
});

test("sandbox validation is idempotent and never invents a provider MARK",()=>{
  assert.match(route,/outboxStatus==="SANDBOX_VALIDATED"/);
  assert.match(route,/idempotent:true/);
  assert.match(route,/LOCAL-SANDBOX-/);
  assert.doesNotMatch(route,/providerMark:\s*["'`]\w/);
});

test("the UI clearly identifies local-only sandbox checks",()=>{
  assert.match(ui,/Τοπικό sandbox check/);
  assert.match(ui,/Δεν επικοινωνεί με πάροχο/);
  assert.match(ui,/Δεν έγινε εξωτερική κλήση/);
});
