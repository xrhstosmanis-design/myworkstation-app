import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/payment-device-attempts.js",import.meta.url),"utf8");
const index=await readFile(new URL("../src/index.js",import.meta.url),"utf8");

test("provider result and retry routes are mounted behind Store Mode auth",()=>{
  assert.match(index,/paymentDeviceAttemptRoutes/);
  assert.match(index,/requireCompanyModule\("STORE_MODE"\),paymentDeviceAttemptRoutes/);
  assert.match(route,/payment-route-attempts\/:attemptId\/result/);
  assert.match(route,/payment-route-attempts\/:attemptId\/retry/);
});

test("provider result is row-locked and audited",()=>{
  assert.match(route,/FOR UPDATE/);
  assert.match(route,/PAYMENT_PROVIDER_RESULT_RECORDED/);
  assert.match(route,/idempotentReplay:true/);
});

test("retry preserves original device route and creates a new idempotency key",()=>{
  assert.match(route,/fiscalDeviceCode","eftposDeviceCode/);
  assert.match(route,/retry:\$\{attemptNo\}/);
  assert.match(route,/"parentAttemptId","attemptNo"/);
  assert.match(route,/authorizePaymentRetry/);
});
