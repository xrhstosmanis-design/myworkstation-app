import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const catalog=await readFile(new URL("../src/services/module-catalog.js",import.meta.url),"utf8");
const bootstrap=await readFile(new URL("../src/video-events-bootstrap.js",import.meta.url),"utf8");
const index=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const route=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/VideoConnectionManager.jsx",import.meta.url),"utf8");

test("VIDEO_EVENTS is optional and requires explicit technical activation",()=>{
  assert.match(catalog,/key:"VIDEO_EVENTS"[\s\S]*?commercialReady:false,requiresTechnicalActivation:true/);
  assert.doesNotMatch(catalog,/TRIAL:\[[^\]]*VIDEO_EVENTS/);
  assert.doesNotMatch(catalog,/PILOT:\[[^\]]*VIDEO_EVENTS/);
});

test("V01 creates one NVR connection per tenant-scoped store",()=>{
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS "StoreVideoConnection"/);
  assert.match(bootstrap,/"storeId" TEXT NOT NULL UNIQUE/);
  assert.match(bootstrap,/StoreVideoConnection_company_fkey/);
  assert.match(index,/await ensureVideoEventsSchema\(\)/);
  assert.match(route,/videoStoreContext\(req\.params\.companyId,req\.params\.storeId\)/);
});

test("NVR password is encrypted and never returned",()=>{
  assert.match(route,/createCipheriv\("aes-256-gcm"/);
  assert.match(route,/"passwordEnc" IS NOT NULL/);
  assert.match(route,/passwordConfigured:Boolean\(passwordEnc\)/);
  assert.match(route,/passwordChanged:Boolean\(body\.password\)/);
});

test("V01 records configuration audit and makes no camera call",()=>{
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS "VideoAccessAudit"/);
  assert.match(route,/CONNECTION_CONFIG_UPDATED/);
  assert.match(route,/configurationOnly:true/);
  assert.doesNotMatch(route,/fetch\(body\.endpoint|axios|ONVIFClient|RTSPClient/);
});

test("Super Admin UI clearly identifies configuration-only state",()=>{
  assert.match(ui,/Δεν ανοίγουν κάμερα και δεν αντιγράφουν video/);
  assert.match(ui,/ΔΕΝ ΕΧΕΙ ΔΟΚΙΜΑΣΤΕΙ/);
  assert.match(ui,/ONVIF/);
  assert.match(ui,/RTSP/);
});
