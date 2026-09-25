import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const wrapper=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const core=await readFile(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");
const aiRecheck=await readFile(new URL("../src/routes/commerce-pos-ai-recheck.js",import.meta.url),"utf8");

test("a stranded AI_COMPLETE multipage handoff resumes from its stored lines",()=>{
  const schema=wrapper.slice(wrapper.indexOf("async function ensureFastHandoffSchema"),wrapper.indexOf("async function enqueueFastBackground"));
  const claim=wrapper.slice(wrapper.indexOf("async function claimFastBackground"),wrapper.indexOf("async function repairStaleRecoveringTasks"));
  const recover=wrapper.slice(wrapper.indexOf('router.post("/ai-reader/fast-recover"'),wrapper.indexOf('router.get("/ai-reader/fast-status'));
  const status=wrapper.slice(wrapper.indexOf('router.get("/ai-reader/fast-status'),wrapper.indexOf('router.use("/ai-reader/jobs/:jobId/product-lines'));
  assert.match(schema,/POS_REPROCESSING','AI_COMPLETE/);
  assert.match(claim,/POS_REPROCESSING','AI_COMPLETE/);
  assert.match(claim,/"POS_REPROCESSING","AI_COMPLETE"/);
  assert.match(recover,/"status" IN \('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_FAILED','AI_COMPLETE'\)/);
  assert.match(recover,/"status" IN \('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_PROCESSING','POS_FAILED','AI_COMPLETE'\)/);
  assert.match(recover,/hasStoredAiLines=Array\.isArray\(job\.resultJson\?\.productLines\)&&job\.resultJson\.productLines\.length>0/);
  assert.match(recover,/else if\(hasStoredAiLines\)handoff=\{\.\.\.handoff,resumeStoredProductLines:true\}/);
  assert.match(status,/hasStoredAiLines=Array\.isArray\(job\.resultJson\?\.productLines\)&&job\.resultJson\.productLines\.length>0/);
  assert.match(status,/job\.status==="AI_COMPLETE"&&hasStoredAiLines/);
  assert.match(status,/if\(hasStoredAiLines&&\(completedAiNeedsHandoff\|\|staleProcessing\)\)scheduledHandoff=\{\.\.\.handoff,resumeStoredProductLines:true\}/);
  assert.match(status,/staleProcessing\|\|completedAiNeedsHandoff/);
  assert.match(aiRecheck,/\["AI_COMPLETE","POS_PROCESSING"\]\.includes\(job\.status\)&&req\.user\?\.tokenType==="POS_BACKGROUND"/);
});

test("a completed mismatched POS draft gets one full reread from its durable pages",()=>{
  const recover=wrapper.slice(wrapper.indexOf('router.post("/ai-reader/fast-recover"'),wrapper.indexOf('router.get("/ai-reader/fast-status'));
  assert.match(recover,/OR "status"='AWAITING_APPROVAL'/);
  assert.match(recover,/Number\(background\.reconciliationDifference\)>POS_HANDOFF_TOLERANCE&&reprocess\.strategy!==POS_REPROCESS_STRATEGY/);
  assert.match(recover,/mode:"RECONCILIATION_REREAD",strategy:needsCompleteTableReplayRecovery\?completeRecoveryStrategy:POS_REPROCESS_STRATEGY,attemptedAt:/);
  assert.match(recover,/resumeStoredProductLines:false,replaceExistingDraft:true/);
});


test("a failed safe inferior reread advances once when a newer strategy is deployed",()=>{
  const recover=wrapper.slice(wrapper.indexOf('router.post("/ai-reader/fast-recover"'),wrapper.indexOf('router.get("/ai-reader/fast-status'));
  assert.match(wrapper,/const isSafeInferiorRereadFailure=error=>\/POS_BACKGROUND_AI_RECHECK:/);
  assert.match(recover,/job\.status==="POS_FAILED"&&Boolean\(job\.purchaseDocumentId\)&&reprocess\.strategy!==POS_REPROCESS_STRATEGY&&isSafeInferiorRereadFailure\(storedBackgroundError\)/);
  assert.doesNotMatch(recover,/needsFailedRereadAdvance=.*reprocess\.mode/);
  assert.match(recover,/needsCompleteTableReplayRecovery\?\(completeRecoveryStrategy===POS_LEVENTOPOULOS_EMPTY_TABLE_RECOVERY_STRATEGY\?"LEVENTOPOULOS_EMPTY_COMPLETE_TABLE":"COMPLETE_TABLE_TRAILING_REPLAY"\):needsFailedRereadAdvance\?"PREVIOUS_SAFE_INFERIOR_REREAD"/);
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
  assert.match(wrapper,/"COMPLETE_TABLE_TRAILING_REPLAY",trigger:"SERVER_STARTUP"/);
  assert.match(wrapper,/d\."status"='DRAFT' AND d\."sourceType"='POS_OCR_DRAFT'/);
});

test("a centrally confirmed generic complete-table profile is also requeued",()=>{
  assert.match(wrapper,/const genericCompleteTableProfile=profile\.requireCompletePrintedTableOnMismatch===true/);
  assert.match(wrapper,/completeTableProfile\|\|genericCompleteTableProfile\|\|legacyFreshSnackDraft/);
});

test("a failed Leventopoulos empty table is requeued once from the same linked draft image",()=>{
  const recover=wrapper.slice(wrapper.indexOf('router.post("/ai-reader/fast-recover"'),wrapper.indexOf('router.get("/ai-reader/fast-status'));
  assert.match(wrapper,/POS_LEVENTOPOULOS_EMPTY_TABLE_RECOVERY_STRATEGY="LEVENTOPOULOS_EMPTY_COMPLETE_TABLE_V17"/);
  assert.match(wrapper,/profile\.ruleKey==="LEVENTOPOULOS_MM_POS1_COLUMNS"/);
  assert.match(wrapper,/ΛΕΒΕΝΤΟΠΟΥΛΟΣ\|LEVENTOPOULOS/);
  assert.match(wrapper,/reason:recoveryStrategy===POS_LEVENTOPOULOS_EMPTY_TABLE_RECOVERY_STRATEGY\?"LEVENTOPOULOS_EMPTY_COMPLETE_TABLE"/);
  assert.match(recover,/completeRecoveryStrategy=completeTableRecoveryStrategy\(job,linkedSupplierName\)/);
  assert.match(recover,/resumeStoredProductLines:false,replaceExistingDraft:true/);
  assert.match(recover,/Boolean\(job\.purchaseDocumentId\)/);
  assert.match(wrapper,/pageJobIds:\[job\.id/);
  assert.match(wrapper,/internalCommerceRequest\(`\/ai-reader\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/ai-recheck`/);
});

test("reread replaces the same draft lines atomically without creating another payment",()=>{
  assert.match(core,/replaceExistingDraft:z\.boolean\(\)\.optional\(\)\.default\(false\)/);
  assert.match(core,/lockedReplacement=.*posReprocess\?\.mode==="RECONCILIATION_REREAD"/);
  assert.match(core,/lockedReplacement&&pageJob\.purchaseDocumentId&&pageJob\.purchaseDocumentId!==skeletonDocumentId/);
  const replacement=core.slice(core.indexOf('if(skeletonRows[0]){stage="replace-purchase-lines"'),core.indexOf('let paymentTransactionId=null'));
  assert.match(replacement,/DELETE FROM "PurchaseOrderLine" WHERE "orderId"=\$\{orderId\}/);
  assert.ok(replacement.indexOf('DELETE FROM "PurchaseOrderLine"')<replacement.indexOf('INSERT INTO "PurchaseOrderLine"'));
  assert.match(core,/stockMultiplierForPersistedInvoiceLine\(\{\.\.\.line,invoiceUnit\}\)/);
  assert.match(core,/if\(existingPayment\)\{\s*stage="link-existing-payment"/);
});


test("final POS intake restores one uniquely matching collapsed invoice line",()=>{
  assert.match(core,/function restoreUniqueExactGrossGap\(lines,invoiceTotal\)/);
  assert.match(core,/candidates\.length!==1/);
  assert.match(core,/Math\.abs\(productLinesGross\(restored\)-expected\)>0\.05/);
  const intake=core.slice(core.indexOf('router.post("/ai-reader/jobs/:jobId/pos-intake"'),core.indexOf('stage="validate-supplier"'));
  assert.match(intake,/restoreUniqueExactGrossGap\(parsedLines,body\.totalGross\)/);
  assert.match(intake,/let lines=finalGapRecovery\.lines/);
});

test("an inferior reread leaves the existing draft lines untouched",()=>{
  const worker=wrapper.slice(wrapper.indexOf("function scheduleFastBackground"),wrapper.indexOf("async function ensureFastHandoffSchema"));
  assert.match(worker,/beforeDiff=.*before\.grossTotal/);
  assert.match(worker,/afterDiff=.*after\.grossTotal/);
  assert.match(worker,/productLines\.length>previousLines\.length&&afterDiff<beforeDiff/);
  assert.ok(worker.indexOf("Η νέα πλήρης ανάγνωση δεν βελτίωσε")<worker.indexOf('/product-lines`'));
});
