import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const wrapper=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const core=await readFile(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");

test("a completed mismatched POS draft gets one full reread from its durable pages",()=>{
  const recover=wrapper.slice(wrapper.indexOf('router.post("/ai-reader/fast-recover"'),wrapper.indexOf('router.get("/ai-reader/fast-status'));
  assert.match(recover,/OR "status"='AWAITING_APPROVAL'/);
  assert.match(recover,/background\.reconciliationRequired===true&&reprocess\.strategy!==POS_REPROCESS_STRATEGY/);
  assert.match(recover,/mode:"RECONCILIATION_REREAD",strategy:POS_REPROCESS_STRATEGY,attemptedAt:/);
  assert.match(recover,/resumeStoredProductLines:false,replaceExistingDraft:true/);
});

test("reread replaces the same draft lines atomically without creating another payment",()=>{
  assert.match(core,/replaceExistingDraft:z\.boolean\(\)\.optional\(\)\.default\(false\)/);
  assert.match(core,/lockedReplacement=.*posReprocess\?\.mode==="RECONCILIATION_REREAD"/);
  assert.match(core,/lockedReplacement&&pageJob\.purchaseDocumentId&&pageJob\.purchaseDocumentId!==skeletonDocumentId/);
  const replacement=core.slice(core.indexOf('if(skeletonRows[0]){stage="replace-purchase-lines"'),core.indexOf('let paymentTransactionId=null'));
  assert.match(replacement,/DELETE FROM "PurchaseOrderLine" WHERE "orderId"=\$\{orderId\}/);
  assert.ok(replacement.indexOf('DELETE FROM "PurchaseOrderLine"')<replacement.indexOf('INSERT INTO "PurchaseOrderLine"'));
  assert.match(core,/stockConversionFromDescription\(line\.description/);
  assert.match(core,/if\(existingPayment\)\{\s*stage="link-existing-payment"/);
});

test("an inferior reread leaves the existing draft lines untouched",()=>{
  const worker=wrapper.slice(wrapper.indexOf("function scheduleFastBackground"),wrapper.indexOf("async function ensureFastHandoffSchema"));
  assert.match(worker,/beforeDiff=.*before\.grossTotal/);
  assert.match(worker,/afterDiff=.*after\.grossTotal/);
  assert.match(worker,/productLines\.length>previousLines\.length&&afterDiff<beforeDiff/);
  assert.ok(worker.indexOf("Η νέα πλήρης ανάγνωση δεν βελτίωσε")<worker.indexOf('/product-lines`'));
});
