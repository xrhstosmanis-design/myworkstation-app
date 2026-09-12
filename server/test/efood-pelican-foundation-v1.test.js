import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {buildEfoodCatalogPreview,buildEfoodOrderRecoveryPreview,buildEfoodPromoPreview,normalizeEfoodWebhook} from "../src/integrations/efood/foundation.js";

const platformRoute=await readFile(new URL("../src/routes/platform-efood-integrations.js",import.meta.url),"utf8");
const webhookRoute=await readFile(new URL("../src/routes/efood-pelican-webhook.js",import.meta.url),"utf8");
const bootstrap=await readFile(new URL("../src/efood-integration-bootstrap.js",import.meta.url),"utf8");
const integrationBootstrap=await readFile(new URL("../src/store-integration-bootstrap.js",import.meta.url),"utf8");
const cryptoSource=await readFile(new URL("../src/integrations/store-integration-crypto.js",import.meta.url),"utf8");
const index=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const patchScript=await readFile(new URL("../scripts/patch-efood-pelican-routes.js",import.meta.url),"utf8");
const rootPackage=JSON.parse(await readFile(new URL("../../package.json",import.meta.url),"utf8"));
const serverPackage=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
const ui=await readFile(new URL("../../client/src/components/platform/StoreFiscalIntegrations.jsx",import.meta.url),"utf8");

test("Pelican webhook normalization keeps a stable order/status idempotency key",()=>{
  const first=normalizeEfoodWebhook({order:{id:"ORDER-1",status:"ready-for-pickup",items:[{id:"SKU-1",name:"Νερό",quantity:2}]},store_id:"TEST-VENDOR"});
  const second=normalizeEfoodWebhook({store_id:"TEST-VENDOR",order:{items:[{quantity:2,name:"Νερό",id:"SKU-1"}],status:"ready-for-pickup",id:"ORDER-1"}});
  assert.equal(first.status,"READY_FOR_PICKUP");
  assert.equal(first.idempotencyKey,"order:ORDER-1:status:READY_FOR_PICKUP");
  assert.equal(first.payloadHash,second.payloadHash);
  assert.equal(first.supported,true);
  assert.deepEqual(first.productRefs[0],{externalProductId:"SKU-1",externalSku:null,name:"Νερό",quantity:2});
});

test("catalog, promo and recovery preparation are local-only previews",()=>{
  const catalog=buildEfoodCatalogPreview({vendorId:"TEST-VENDOR",products:[{externalProductId:"SKU-1",name:"Νερό",price:1,stock:4}]});
  const promo=buildEfoodPromoPreview({vendorId:"TEST-VENDOR",promotions:[{externalPromotionId:"PROMO-1",externalProductId:"SKU-1",title:"Δοκιμή",discountPercent:10}]});
  const orders=buildEfoodOrderRecoveryPreview({vendorId:"TEST-VENDOR",from:"2026-09-01T00:00:00Z",to:"2026-09-13T00:00:00Z"});
  for(const preview of [catalog,promo,orders]){
    assert.equal(preview.externalCall,false);
    assert.equal(preview.environment,"SANDBOX");
    assert.equal(preview.providerContractPending,true);
    assert.match(preview.requestHash,/^[a-f0-9]{64}$/);
  }
});

test("efood credentials and webhook payloads are encrypted and never returned",()=>{
  assert.match(cryptoSource,/aes-256-gcm/);
  assert.match(platformRoute,/encryptStoreIntegrationValue\(credentials\)/);
  assert.match(webhookRoute,/payloadEnc=encryptStoreIntegrationValue\(payload\)/);
  assert.match(platformRoute,/function view\(row\)/);
  assert.doesNotMatch(platformRoute,/webhookSecret[^\n]*res\.json/);
  assert.match(platformRoute,/payloadsEncrypted:true/);
});

test("Phase A is fail-closed and cannot activate live efood execution",()=>{
  assert.match(platformRoute,/"enabled"=false/);
  assert.match(platformRoute,/"externalCallsEnabled"=false/);
  assert.match(platformRoute,/Η παραγωγική efood διασύνδεση παραμένει κλειδωμένη/);
  assert.match(webhookRoute,/EFOOD_FAIL_CLOSED/);
  assert.match(webhookRoute,/integration\.externalCallsEnabled!==true/);
  assert.match(webhookRoute,/constantTimeSecretEquals/);
  assert.match(cryptoSource,/timingSafeEqual/);
});

test("webhook validation cannot create orders, sales, stock, payments or fiscal execution",()=>{
  assert.match(webhookRoute,/orderCreated:false/);
  assert.match(webhookRoute,/saleCreated:false/);
  assert.match(webhookRoute,/stockChanged:false/);
  assert.match(webhookRoute,/paymentPosted:false/);
  assert.match(webhookRoute,/fiscalExecution:false/);
  assert.doesNotMatch(webhookRoute,/INSERT INTO "OnlineOrder"/);
  assert.doesNotMatch(webhookRoute,/INSERT INTO "Sale"/);
  assert.doesNotMatch(webhookRoute,/INSERT INTO "StockMovement"/);
  assert.doesNotMatch(webhookRoute,/CapDriver|RBS|EFTPOS/);
});

test("events, mappings and previews remain company/store scoped",()=>{
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS "EfoodWebhookEvent"/);
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS "EfoodProductMapping"/);
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS "EfoodIntegrationPreview"/);
  assert.match(platformRoute,/WHERE m\."companyId"=\$\{store\.companyId\} AND m\."storeId"=\$\{store\.id\}/);
  assert.match(platformRoute,/JOIN "StoreProduct" sp ON sp\."productId"=p\."id" AND sp\."storeId"=\$\{store\.id\}/);
  assert.match(bootstrap,/UNIQUE \("integrationId","idempotencyKey"\)/);
});

test("StoreIntegrationCredential allows EFOOD additively without changing existing integrations",()=>{
  assert.match(integrationBootstrap,/MYDATA','VAT_LOOKUP','EFOOD/);
  assert.match(integrationBootstrap,/ADD COLUMN IF NOT EXISTS "metadataJson"/);
  assert.match(integrationBootstrap,/ADD COLUMN IF NOT EXISTS "webhookKey"/);
  assert.match(integrationBootstrap,/ADD COLUMN IF NOT EXISTS "externalCallsEnabled"/);
});

test("the public webhook route is mounted before authenticated platform routes",()=>{
  const publicMount=index.indexOf('app.use("/api/public/efood",efoodPelicanWebhookRoutes)');
  const platformMount=index.indexOf('app.use("/api/platform",auth,platformAuditCapture)');
  assert.ok(publicMount>0,"missing public efood webhook mount");
  assert.ok(platformMount>publicMount,"efood webhook must be mounted before platform auth");
  assert.match(patchScript,/platformEfoodIntegrationRoutes/);
  assert.match(patchScript,/efoodPelicanWebhookRoutes/);
  assert.match(rootPackage.scripts["prepare:server"],/patch-efood-pelican-routes/);
  assert.match(serverPackage.scripts.start,/patch-efood-pelican-routes/);
});

test("Super Admin UI labels the connector as preparation only",()=>{
  assert.match(ui,/efood \/ Pelican — Indirect POS/);
  assert.match(ui,/Μόνο προετοιμασία SANDBOX/);
  assert.match(ui,/test vendor, E2E LAB PASS και νέα έγκριση/);
  assert.match(ui,/\/stores\/\$\{manager\.store\.id\}\/efood/);
  assert.doesNotMatch(ui,/Ενεργοποίηση efood/);
});
