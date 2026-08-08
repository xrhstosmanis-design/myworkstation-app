import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const bootstrap=await readFile(new URL("../src/platform-bootstrap.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");

test("pilot profile stores the real PC, operating hours and responsible person per store",()=>{
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS "PilotStoreProfile"/);
  assert.match(route,/stores\/:storeId\/pilot-profile/);
  assert.match(route,/"pcName","operatingHours","responsibleName"/);
  assert.match(ui,/Κλείδωμα πιλοτικής εγκατάστασης/);
});

test("pilot readiness blocks until backup, design and database freezes are confirmed",()=>{
  assert.match(route,/key:"backup"[\s\S]*blocking:true/);
  assert.match(route,/key:"scopeFreeze"[\s\S]*blocking:true/);
  assert.match(ui,/Έχει ληφθεί ασφαλές backup/);
  assert.match(ui,/Κλείδωμα υπάρχοντος design/);
  assert.match(ui,/Κλείδωμα δομής βάσης/);
});

test("scope freeze does not involve the RBS fiscal path",()=>{
  assert.match(route,/καμία εντολή προς RBS/);
  assert.match(ui,/δεν επικοινωνεί με RBS\/ταμειακή/);
});
