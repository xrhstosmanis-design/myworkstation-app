import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");

test("card checkout loads the configured fail-closed route",()=>{
  assert.match(source,/resolvePaymentDeviceRoute/);
  assert.match(source,/cardAmount>0\?await configuredPaymentRoute/);
  assert.match(source,/onlineOrder\.fulfillmentType==="DELIVERY"\?"ONLINE_DELIVERY":"ONLINE_PICKUP"/);
  assert.match(source,/body\.operationChannel==="DELIVERY_DELAYED"\?"DELIVERY":"IN_STORE"/);
});

test("stores without any fiscal mapping retain the legacy checkout during migration",()=>{
  assert.match(source,/if\(!fiscalDevices\.length\)return null/);
});

test("a routed card payment records a planned attempt without claiming provider execution",()=>{
  assert.match(source,/CREATE TABLE IF NOT EXISTS "PaymentDeviceRouteAttempt"/);
  assert.match(source,/"status" TEXT NOT NULL DEFAULT 'PLANNED'/);
  assert.match(source,/VALUES \(.+,'PLANNED',FALSE,/s);
  assert.doesNotMatch(source,/PaymentDeviceRouteAttempt[\s\S]{0,1500}'SUCCESS'/);
});

test("route audit links sale shift terminal fiscal EFTPOS and idempotency key",()=>{
  for(const field of ["saleId","sessionId","terminalPos","channel","fiscalDeviceCode","eftposDeviceCode","idempotencyKey"])assert.match(source,new RegExp(`"${field}"`));
  assert.match(source,/paymentRoute:txResult\.paymentRoute\|\|null/);
  assert.match(source,/paymentRoute,creditAmount/);
});
