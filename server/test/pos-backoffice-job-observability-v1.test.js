import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/purchase-orders.js",import.meta.url),"utf8");
const suite=fs.readFileSync(new URL("../../client/src/components/commerce/installPurchaseOrdersSuite.js",import.meta.url),"utf8");

test("purchase order report exposes only scoped OCR job diagnostics",()=>{
  assert.match(route,/j\."companyId"=o\."companyId" AND j\."purchaseDocumentId"=o\."sourceDocumentId"/);
  assert.match(route,/GROUP BY o\."id",o\."companyId",o\."sourceDocumentId",s\."name",st\."name"/);
  assert.match(route,/jsonb_build_object\('status',j\."status",'stage',j\."stage",'updatedAt',j\."updatedAt",'error',LEFT\(COALESCE\(j\."resultJson"->'posBackground'->>'error',''\),700\)\)/);
  assert.doesNotMatch(route,/AS "ocrJob"[\s\S]{0,80}resultJson/);
});

test("purchase order list labels delivered assistant drafts while preserving failed OCR diagnostics",()=>{
  assert.match(suite,/job\.status==="AWAITING_APPROVAL"&&job\.stage==="POS_BACKGROUND_COMPLETE"/);
  assert.match(suite,/Ανάγνωση από βοηθό · πρόχειρο για έλεγχο/);
  assert.match(suite,/OCR job: \$\{esc\(job\.status\|\|"—"\)\} \/ \$\{esc\(job\.stage\|\|"—"\)\}/);
  assert.match(suite,/job\.error\?` · \$\{esc\(job\.error\)\}`/);
  assert.match(suite,/ocrJobDiagnostic\(o\.ocrJob\)/);
});
