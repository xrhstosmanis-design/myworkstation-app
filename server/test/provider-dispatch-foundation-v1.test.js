import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/provider-logistics.js",import.meta.url),"utf8");
const schema=await readFile(new URL("../src/extended-modules-bootstrap.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/DispatchProviderPanel.jsx",import.meta.url),"utf8");

test("dispatch notes and lines are tenant scoped",()=>{
  assert.match(schema,/CREATE TABLE IF NOT EXISTS "DispatchNote"/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS "DispatchNoteLine"/);
  assert.match(route,/"companyId"=\$\{req\.user\.companyId\}/);
  assert.match(route,/products\.length!==productIds\.length/);
});

test("local finalization creates an idempotent blocked provider outbox item",()=>{
  assert.match(schema,/ProviderOutbox_idempotency_key/);
  assert.match(route,/dispatch-note:\$\{note\.id\}:issue-v1/);
  assert.match(route,/BLOCKED_PROVIDER_NOT_CONNECTED/);
  assert.match(route,/ON CONFLICT \("idempotencyKey"\) DO NOTHING/);
});

test("provider readiness never claims fiscal transmission",()=>{
  assert.match(route,/externalTransmissionEnabled:false/);
  assert.match(route,/Δεν εκτελείται αποστολή σε myDATA/);
  assert.match(ui,/Δεν θα γίνει αποστολή σε myDATA/);
});

test("local cancellation is audited instead of deleting dispatch notes",()=>{
  assert.match(route,/"status"='CANCELLED_LOCAL'/);
  assert.match(route,/"cancellationReason"=\$\{body\.reason\}/);
  assert.doesNotMatch(route,/DELETE FROM "DispatchNote"/);
});
