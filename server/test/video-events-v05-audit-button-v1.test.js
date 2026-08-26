import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/kiosk-reports-audit.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/installKioskReportsAuditV2.js",import.meta.url),"utf8");

test("V05 exposes a Video button inside the central Events Audit",()=>{
  assert.match(ui,/Προβολή βίντεο/);
  assert.match(ui,/data-video-source/);
  assert.match(ui,/data-video-id/);
  assert.match(ui,/Video συμβάντος/);
});

test("V05 resolves video context with tenant and source scoping",()=>{
  assert.match(route,/audit-events\/:sourceType\/:sourceId\/video-context/);
  assert.match(route,/v\."companyId"=\$\{req\.user\.companyId\}/);
  assert.match(route,/v\."sourceType"=\$\{sourceType\} AND v\."sourceId"=\$\{sourceId\}/);
  assert.match(route,/requireManagement/);
});

test("V05 does not claim or open real CCTV video",()=>{
  assert.match(route,/realVideoOpened:false/);
  assert.match(ui,/Δεν άνοιξε πραγματικό video και δεν δημιουργήθηκε clip/);
  assert.doesNotMatch(route,/passwordEnc/);
});
