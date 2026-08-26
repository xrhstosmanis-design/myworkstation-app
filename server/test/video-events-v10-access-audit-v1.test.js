import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/kiosk-reports-audit.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/installKioskReportsAuditV2.js",import.meta.url),"utf8");

test("V10 audits every video view and export with actor store event and outcome",()=>{
  assert.match(route,/video-access",requireManagement,requireVideoAccess/);
  assert.match(route,/z\.enum\(\["VIEW","EXPORT"\]\)/);
  assert.match(route,/z\.enum\(\["CONTEXT_ONLY","OPENED","EXPORTED","UNAVAILABLE"\]\)/);
  assert.match(route,/VideoAccessAudit/);
  assert.match(route,/actualVideoAccess/);
});

test("V10 UI records context views and unavailable export attempts honestly",()=>{
  assert.match(ui,/auditVideoAccess\(button,"VIEW"/);
  assert.match(ui,/auditVideoAccess\(exportButton,"EXPORT","UNAVAILABLE"\)/);
  assert.match(ui,/Δεν δημιουργήθηκε αρχείο χωρίς πραγματικό adapter NVR/);
});

test("V10 access audit is tenant scoped and contains no credentials",()=>{
  assert.match(route,/"companyId"=\$\{req\.user\.companyId\}/);
  assert.doesNotMatch(route,/VIDEO_(?:VIEW|EXPORT)[\s\S]{0,600}passwordEnc/);
});
