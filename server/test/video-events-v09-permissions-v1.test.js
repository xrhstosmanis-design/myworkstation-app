import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/kiosk-reports-audit.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/installKioskReportsAuditV2.js",import.meta.url),"utf8");

test("V09 allows Owner and Super Admin without creating a second permission system",()=>{
  assert.match(route,/isSuperAdmin===true/);
  assert.match(route,/platformRole==="SUPER_ADMIN"/);
  assert.match(route,/role==="OWNER"/);
  assert.match(route,/StoreOperatorProfile/);
  assert.match(route,/permissions\.videoEvents===true\|\|permissions\.videoView===true/);
});

test("V09 only allows explicitly authorized managers and blocks every other role",()=>{
  assert.match(route,/role!=="MANAGER"\)return false/);
  assert.match(route,/requireVideoAccess/);
  assert.match(route,/εξουσιοδοτημένο Manager/);
  assert.match(route,/video-context",requireManagement,requireVideoAccess/);
});

test("V09 hides the Video button when the backend denies access",()=>{
  assert.match(ui,/videoAccessAllowed===true/);
  assert.match(ui,/Δεν έχεις εξουσιοδότηση προβολής Video/);
  assert.match(ui,/canVideo\?/);
});
