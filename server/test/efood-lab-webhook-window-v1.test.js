import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const platformRoute=await readFile(new URL("../src/routes/platform-efood-integrations.js",import.meta.url),"utf8");
const webhookRoute=await readFile(new URL("../src/routes/efood-pelican-webhook.js",import.meta.url),"utf8");
const storeBootstrap=await readFile(new URL("../src/store-integration-bootstrap.js",import.meta.url),"utf8");
const efoodBootstrap=await readFile(new URL("../src/efood-integration-bootstrap.js",import.meta.url),"utf8");
const startupBootstrap=await readFile(new URL("../src/ensure-efood-integration-schema.js",import.meta.url),"utf8");
const serverPackage=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
const ui=await readFile(new URL("../../client/src/components/platform/StoreFiscalIntegrations.jsx",import.meta.url),"utf8");

test("efood LAB webhook window schema is additive and fail-closed",()=>{
  for(const column of ["webhookSecretHash","webhookTestOpenedAt","webhookTestExpiresAt","webhookTestConsumedAt","webhookTestClosedReason","webhookTestEventId"]){
    assert.match(storeBootstrap,new RegExp(`ADD COLUMN IF NOT EXISTS \\\"${column}\\\"`));
  }
  assert.match(storeBootstrap,/webhook_test_expiry_idx/);
  assert.match(platformRoute,/"enabled"=false,"externalCallsEnabled"=false/);
});

test("server startup applies StoreIntegration before efood evidence schema",()=>{
  const storeCall=startupBootstrap.indexOf("await ensureStoreIntegrationSchema()");
  const efoodCall=startupBootstrap.indexOf("await ensureEfoodIntegrationSchema()");
  assert.ok(storeCall>=0,"missing StoreIntegration startup bootstrap");
  assert.ok(efoodCall>storeCall,"efood evidence schema must run after StoreIntegration");
  assert.match(startupBootstrap,/await prisma\.\$disconnect\(\)/);

  for(const scriptName of ["dev","start"]){
    const command=serverPackage.scripts?.[scriptName]||"";
    const bootstrapPosition=command.indexOf("node src/ensure-efood-integration-schema.js");
    const serverPosition=command.lastIndexOf("node src/index.js");
    assert.ok(bootstrapPosition>=0,`${scriptName} does not run the efood startup bootstrap`);
    assert.ok(serverPosition<0||bootstrapPosition<serverPosition,`${scriptName} starts HTTP before the efood schema bootstrap`);
  }
});

test("efood startup tolerates a clean database before the optional Product table exists",()=>{
  const mappingStart=efoodBootstrap.indexOf(`CREATE TABLE IF NOT EXISTS "EfoodProductMapping"`);
  const mappingEnd=efoodBootstrap.indexOf(`CREATE INDEX IF NOT EXISTS "EfoodProductMapping_store_status_idx"`,mappingStart);
  assert.ok(mappingStart>=0&&mappingEnd>mappingStart,"missing EfoodProductMapping bootstrap");
  const mappingCreate=efoodBootstrap.slice(mappingStart,mappingEnd);
  assert.doesNotMatch(mappingCreate,/REFERENCES "Product"/);
  assert.match(efoodBootstrap,/to_regclass\('public\."Product"'\) IS NOT NULL/);
  assert.match(efoodBootstrap,/ADD CONSTRAINT "EfoodProductMapping_product_fkey"/);
  assert.match(efoodBootstrap,/await prisma\.\$executeRawUnsafe\(EFOOD_PRODUCT_MAPPING_FK_SQL\)/);
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