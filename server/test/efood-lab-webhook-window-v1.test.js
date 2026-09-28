import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const platformRoute=await readFile(new URL("../src/routes/platform-efood-integrations.js",import.meta.url),"utf8");
const webhookRoute=await readFile(new URL("../src/routes/efood-pelican-webhook.js",import.meta.url),"utf8");
const storeBootstrap=await readFile(new URL("../src/store-integration-bootstrap.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/StoreFiscalIntegrations.jsx",import.meta.url),"utf8");

test("efood LAB webhook window schema is additive and fail-closed",()=>{
  for(const column of ["webhookSecretHash","webhookTestOpenedAt","webhookTestExpiresAt","webhookTestConsumedAt","webhookTestClosedReason","webhookTestEventId"]){
    assert.match(storeBootstrap,new RegExp(`ADD COLUMN IF NOT EXISTS \\\"${column}\\\"`));
  }
  assert.match(storeBootstrap,/webhook_test_expiry_idx/);
  assert.match(platformRoute,/"enabled"=false,"externalCallsEnabled"=false/);
});

test("Super Admin can generate a hash-only secret and open at most a 15 minute one-shot window",()=>{
  assert.match(platformRoute,/\/efood\/webhook-secret/);
  assert.match(platformRoute,/crypto\.randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(platformRoute,/const secretHash=sha256\(secret\)/);
  assert.match(platformRoute,/"webhookSecretHash"=\$\{secretHash\}/);
  assert.match(platformRoute,/min\(60\)\.max\(900\)\.default\(300\)/);
  assert.match(platformRoute,/\/efood\/webhook-test-window/);
  assert.match(platformRoute,/oneShot:true/);
  assert.match(platformRoute,/EFOOD_TEST_VENDOR_REQUIRED/);
  assert.doesNotMatch(platformRoute,/secretHash[^\n]*res\.json/);
});

test("public test webhook requires LAB, SANDBOX, header secret and a locked provider row",()=>{
  assert.match(webhookRoute,/assertEfoodLabContext/);
  assert.match(webhookRoute,/integration\.environment!=="SANDBOX"/);
  assert.match(webhookRoute,/req\.get\("authorization"\)/);
  assert.match(webhookRoute,/constantTimeSecretEquals\(sha256\(suppliedAuthorization\),integration\.webhookSecretHash\)/);
  assert.match(webhookRoute,/LIMIT 1 FOR UPDATE/);
  assert.doesNotMatch(webhookRoute,/req\.query/);
});

test("the first accepted test event is dry-run only and automatically closes the window",()=>{
  assert.match(webhookRoute,/mode:"LAB_WEBHOOK_TEST"/);
  assert.match(webhookRoute,/captureMappings:false/);
  assert.match(webhookRoute,/"webhookTestConsumedAt"=NOW\(\)/);
  assert.match(webhookRoute,/"webhookTestClosedReason"='CONSUMED'/);
  assert.match(webhookRoute,/windowAutoLocked/);
  assert.match(webhookRoute,/dryRun:true/);
  assert.match(webhookRoute,/orderCreated:false/);
  assert.match(webhookRoute,/saleCreated:false/);
  assert.match(webhookRoute,/stockChanged:false/);
  assert.match(webhookRoute,/paymentPosted:false/);
  assert.match(webhookRoute,/fiscalExecution:false/);
  assert.doesNotMatch(webhookRoute,/INSERT INTO "OnlineOrder"|INSERT INTO "Sale"|INSERT INTO "StockMovement"|INSERT INTO "Payment"/);
});

test("expired windows auto-lock and exact retries remain idempotent",()=>{
  assert.match(platformRoute,/"webhookTestClosedReason"='EXPIRED'/);
  assert.match(webhookRoute,/EFOOD_TEST_WINDOW_EXPIRED/);
  assert.match(webhookRoute,/replay\.payloadHash===parsed\.payloadHash/);
  assert.match(webhookRoute,/idempotent:true/);
});

test("Super Admin UI exposes copy, secret rotation, countdown and emergency lock controls",()=>{
  assert.match(ui,/Αντιγραφή Callback URL/);
  assert.match(ui,/Δημιουργία νέου ισχυρού secret/);
  assert.match(ui,/Άνοιγμα 5λεπτου LAB webhook/);
  assert.match(ui,/Κλείδωμα τώρα/);
  assert.match(ui,/Trigger Test Order/);
  assert.match(ui,/window\.location\.origin/);
  assert.match(ui,/remainingSeconds/);
  assert.match(ui,/External calls \/ Order \/ Sale \/ Stock \/ Payment \/ Fiscal: ΟΧΙ/);
});
