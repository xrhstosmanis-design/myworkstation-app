import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const bootstrap=await readFile(new URL("../src/video-events-bootstrap.js",import.meta.url),"utf8");
const route=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/VideoConnectionManager.jsx",import.meta.url),"utf8");

test("V02 stores tenant and store scoped camera mappings",()=>{
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS "StoreVideoCamera"/);
  assert.match(bootstrap,/UNIQUE \("storeId","cameraKey"\)/);
  assert.match(bootstrap,/StoreVideoCamera_connection_fkey/);
  assert.match(route,/WHERE "companyId"=\$\{req\.params\.companyId\} AND "storeId"=\$\{store\.id\}/);
});

test("V02 only accepts the supported operational zones and unique camera keys",()=>{
  for(const zone of ["POS_1","POS_2","WAREHOUSE","ENTRANCE","DELIVERY","OTHER"])assert.match(route,new RegExp(`"${zone}"`));
  assert.match(route,/Κάθε κάμερα πρέπει να έχει μοναδικό κανάλι \/ ID/);
  assert.match(route,/\.max\(64\)/);
});

test("V02 updates mappings without deleting historical rows and records audit",()=>{
  assert.match(route,/UPDATE "StoreVideoCamera" SET "active"=false/);
  assert.match(route,/ON CONFLICT \("storeId","cameraKey"\) DO UPDATE/);
  assert.doesNotMatch(route,/DELETE FROM "StoreVideoCamera"/);
  assert.match(route,/CAMERA_MAPPING_UPDATED/);
});

test("Super Admin can map cameras to POS, warehouse, entrance and delivery",()=>{
  assert.match(ui,/V02 · Κάμερες και ζώνες/);
  assert.match(ui,/>POS 1</);
  assert.match(ui,/>POS 2</);
  assert.match(ui,/>Αποθήκη</);
  assert.match(ui,/>Είσοδος</);
  assert.match(ui,/>Delivery</);
  assert.match(ui,/Δεν ανοίγουν κάμερα και δεν αντιγράφουν video/);
});
