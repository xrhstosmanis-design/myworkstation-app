import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const wrapper=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const core=await readFile(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");

test("a completed mismatched POS draft gets one full reread from its durable pages",()=>{
  const recover=wrapper.slice(wrapper.indexOf('router.post("/ai-reader/fast-recover"'),wrapper.indexOf('router.get("/ai-reader/fast-status'));
  assert.match(recover,/OR "status"='AWAITING_APPROVAL'/);
  assert.match(recover,/background\.reconciliationRequired===true&&reprocess\.strategy!==POS_REPROCESS_STRATEGY/);
  assert.match(recover,/mode:"RECONCILIATION_REREAD",strategy:needsCompleteTableReplayRecovery\?POS_COMPLETE_TABLE_REPLAY_RECOVERY_STRATEGY:POS_REPROCESS_STRATEGY,attemptedAt:/);
  assert.match(recover,/resumeStoredProductLines:false,replaceExistingDraft:true/);
});


test("a failed safe inferior reread advances once when a newer strategy is deployed",()=>{
  const recover=wrapper.slice(wrapper.indexOf('router.post("/ai-reader/fast-recover"'),wrapper.indexOf('router.get("/ai-reader/fast-status'));
  assert.match(wrapper,/const isSafeInferiorRereadFailure=error=>\/POS_BACKGROUND_AI_RECHECK:/);
  assert.match(recover,/job\.status==="POS_FAILED"&&Boolean\(job\.purchaseDocumentId\)&&reprocess\.strategy!==POS_REPROCESS_STRATEGY&&isSafeInferiorRereadFailure\(storedBackgroundError\)/);
  assert.doesNotMatch(recover,/needsFailedRereadAdvance=.*reprocess\.mode/);
  assert.match(recover,/needsCompleteTableReplayRecovery\?"COMPLETE_TABLE_TRAILING_REPLAY":needsFailedRereadAdvance\?"PREVIOUS_SAFE_INFERIOR_REREAD"/);
  assert.match(recover,/"status" IN \('AWAITING_APPROVAL','POS_FAILED'\)/);
  assert.match(recover,/if\(job\.status==="POS_FAILED"&&!needsFailedRereadAdvance&&!needsCompleteTableReplayRecovery&&!isRetryableBackgroundError/);
});

test("a failed Fresh complete-table replay is safely requeued once from its stored source",()=>{
  const recover=wrapper.slice(wrapper.indexOf('router.post("/ai-reader/fast-recover"'),wrapper.indexOf('router.get("/ai-reader/fast-status'));
  assert.match(wrapper,/const POS_COMPLETE_TABLE_REPLAY_RECOVERY_STRATEGY="COMPLETE_TABLE_TRAILING_REPLAY_V16"/);
  assert.match(wrapper,/const isSafeCompleteTableReplayFailure=/);
  assert.match(wrapper,/FRESH_SNACK_COMPLETE_PRINTED_TABLE","FRESH_DELICACIES_COMPLETE_PRINTED_TABLE/);
  assert.match(wrapper,/legacyFreshSnackDraft=\/FRESH\\s\+SNACK\/i/);
  assert.match(wrapper,/s\."name" ILIKE '%FRESH%SNACK%'/);
  assert.match(wrapper,/async function linkedDraftSupplierName/);
  assert.match(recover,/linkedSupplierName=job\.status==="POS_FAILED"\?await linkedDraftSupplierName/);
  assert.match(wrapper,/Η πλήρης ανάγνωση δεν έχει πλήρως επαληθευμένες τυπωμένες γραμμές/);
  assert.match(wrapper,/reason:"COMPLETE_TABLE_TRAILING_REPLAY",trigger:"SERVER_STARTUP"/);
  assert.match(wrapper,/d\."status"='DRAFT' AND d\."sourceType"='POS_OCR_DRAFT'/);
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


test("final POS intake restores one uniquely matching collapsed invoice line",()=>{
  assert.match(core,/function restoreUniqueExactGrossGap\(lines,invoiceTotal\)/);
  assert.match(core,/candidates\.length!==1/);
  assert.match(core,/Math\.abs\(productLinesGross\(restored\)-expected\)>0\.05/);
  const intake=core.slice(core.indexOf('router.post("/ai-reader/jobs/:jobId/pos-intake"'),core.indexOf('stage="validate-supplier"'));
  assert.match(intake,/restoreUniqueExactGrossGap\(parsedLines,body\.totalGross\)/);
  assert.match(intake,/const lines=finalGapRecovery\.lines/);
});

test("an inferior reread leaves the existing draft lines untouched",()=>{
  const worker=wrapper.slice(wrapper.indexOf("function scheduleFastBackground"),wrapper.indexOf("async function ensureFastHandoffSchema"));
  assert.match(worker,/beforeDiff=.*before\.grossTotal/);
  assert.match(worker,/afterDiff=.*after\.grossTotal/);
  assert.match(worker,/productLines\.length>previousLines\.length&&afterDiff<beforeDiff/);
  assert.ok(worker.indexOf("Η νέα πλήρης ανάγνωση δεν βελτίωσε")<worker.indexOf('/product-lines`'));
});
