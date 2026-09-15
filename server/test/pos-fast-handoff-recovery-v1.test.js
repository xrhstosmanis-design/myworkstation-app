import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const orders=await readFile(new URL("../../client/src/components/commerce/installPurchaseOrdersSuite.js",import.meta.url),"utf8");
const reader=await readFile(new URL("../src/routes/commerce-pos-ai-recheck.js",import.meta.url),"utf8");

test("BackOffice refresh reclaims only durable, stale POS handoffs without a payment write",()=>{
  assert.match(route,/router\.post\("\/ai-reader\/fast-recover"/);
  assert.match(route,/"status" IN \('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_FAILED'\) OR \("status"='POS_PROCESSING' AND "updatedAt"<\$\{staleBefore\}\)/);
  assert.match(route,/ORDER BY "updatedAt" ASC LIMIT 50/);
  assert.match(route,/if\(recovered\.length>=3\)break/);
  assert.match(route,/scheduleFastBackground\(\{authorization:req\.get\("authorization"\)/);
  assert.doesNotMatch(route.slice(route.indexOf('router.post("/ai-reader/fast-recover"'),route.indexOf('router.get("/ai-reader/fast-status')),/StoreTransaction"/);
});

test("fast handoff creates the BackOffice shell and file inbox before OCR",()=>{
  const start=route.indexOf('router.post("/ai-reader/fast-handoff"');
  const body=route.slice(start,route.indexOf('router.post("/ai-reader/fast-recover"',start));
  assert.match(body,/\/pos-draft/);
  assert.ok(body.indexOf('/pos-draft')<body.indexOf('res.status(202).json'));
  assert.match(body,/DocumentInbox/);
  assert.match(body,/\"status\" IN \('AWAITING_APPROVAL','CONFIRMED'\)/);
  assert.match(body,/POS_DRAFT_READY','POS_PROCESSING','POS_FAILED/);
});

test("background OCR falls back to the public Render origin when loopback fails",()=>{
  assert.match(route,/const origins=\[localOrigin,.+publicOrigin/);
  assert.match(route,/publicOrigin,method:"POST",body:\{force:true/);
  assert.match(route,/x-forwarded-proto/);
});

test("background OCR permits one bounded retry before it marks the POS draft failed",()=>{
  assert.match(route,/FAST_BACKGROUND_RETRY_DELAYS_MS=\[0,3000\]/);
  assert.match(route,/for\(const \[attempt,delay\] of FAST_BACKGROUND_RETRY_DELAYS_MS\.entries\(\)\)/);
  assert.match(route,/if\(lastError\)throw lastError/);
  assert.match(route,/isRetryableBackgroundError\(error\)/);
  assert.ok(route.indexOf("FAST_BACKGROUND_RETRY_DELAYS_MS")<route.indexOf("'POS_BACKGROUND_FAILED'"));
});

test("orders refresh starts durable handoff recovery without blocking the report",()=>{
  const start=orders.indexOf("async function loadReport");
  const body=orders.slice(start,orders.indexOf("async function loadStock",start));
  assert.match(body,/\/api\/commerce\/ai-reader\/fast-recover/);
  assert.ok(body.indexOf("fast-recover")>body.indexOf("/api/purchase-orders/report"));
  assert.match(body,/state\.recovery=recovery;updateRefreshControls\(root\)/);
  assert.match(body,/state\.recovery=\{error:error\.message\};updateRefreshControls\(root\)/);
});

test("fast recovery reports why stored jobs were not reclaimed",()=>{
  assert.match(route,/skippedOperatorScope=0,skippedNoHandoff=0,skippedNonRetryable=0/);
  assert.match(route,/scanned:rows\.length,recovered:recovered\.length/);
  assert.match(route,/skipped:\{operatorScope:skippedOperatorScope,noHandoff:skippedNoHandoff,nonRetryable:skippedNonRetryable\}/);
  assert.match(orders,/Recovery: scanned .*started .*no-handoff .*non-retryable/);
});

test("queued recovery is not abandoned behind an older in-memory worker",()=>{
  const worker=route.slice(route.indexOf("function scheduleFastBackground"),route.indexOf("async function ensureFastHandoffSchema"));
  assert.match(worker,/fastBackgroundSuccessors\.set\(jobId/);
  assert.match(worker,/if\(!waiting\)activeWorker\.finally/);
  assert.match(worker,/scheduleFastBackground\(successor\)/);
  assert.doesNotMatch(worker,/if\(handoff\.replaceExistingDraft\)activeWorker\.finally/);
});

test("a reused one-page LOCAL_COMPLETE job is promoted and recoverable after POS payment",()=>{
  assert.match(route,/status" IN \('LOCAL_COMPLETE','POS_DRAFT_READY','POS_PROCESSING','POS_FAILED'\)/);
  assert.match(route,/"status" IN \('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_FAILED'\)/);
  assert.match(route,/Number\(handoff\.pageCount\|\|0\)===1/);
  assert.match(route,/pageJobIds:\[job\.id\],primaryJobId:job\.id/);
});

test("AI recheck applies verified printed column recovery before reconciliation",()=>{
  assert.match(reader,/recoverPrintedRetailColumns/);
  assert.match(reader,/parsed\.productLines=parsed\.productLines\.map\(line=>recoverPrintedRetailColumns\(line,printedDocumentText\)\)/);
  assert.ok(reader.indexOf("recoverPrintedRetailColumns(line,printedDocumentText)")<reader.indexOf("const initialLinesTotal"));
});

test("completed background OCR can fill only its own linked empty POS draft",()=>{
  assert.match(reader,/source:z\.enum\(\["V2\.4\.4","V2\.4\.4_USER_REVIEW"\]\)/);
  assert.match(reader,/backgroundMayFillLinkedDraft=Boolean\(job\.purchaseDocumentId&&body\.source==="V2\.4\.4"&&job\.status==="AI_COMPLETE"/);
  assert.match(reader,/job\.resultJson\?\.posHandoff&&job\.documentSourceType==="POS_OCR_DRAFT"&&job\.documentStatus==="DRAFT"/);
  assert.match(reader,/if\(job\.purchaseDocumentId&&!backgroundMayFillLinkedDraft\)return res\.status\(409\)/);
  assert.match(reader,/POS_BACKGROUND_V2\.4\.4/);
});

test("full OCR page recovery stays parallel and exposes retryable Azure timeouts",()=>{
  assert.match(reader,/Promise\.allSettled\(pageJobs\.map/);
  assert.match(reader,/timeout\?"AZURE_TIMEOUT":"FULL_OCR_PROVIDER_FAILURE"/);
  assert.match(reader,/wrapped\.status=timeout\?503:502/);
});

test("AI recheck reports a safe stage instead of a hidden generic 500",()=>{
  assert.match(reader,/let failureStage="validate-request"/);
  assert.match(reader,/failureStage="save-ai-result"/);
  assert.match(reader,/AI_RECHECK_INTERNAL \[\$\{failureStage\}\]/);
  assert.match(reader,/safe\.status=502/);
});

test("table recheck provider failure falls through to Azure recovery",()=>{
  assert.match(reader,/The table pass is supplemental/);
  assert.match(reader,/tableRecheckError=isProviderTimeout\(error\)\?"PROVIDER_TIMEOUT":"PROVIDER_FAILURE"/);
  assert.match(route,/AI_RECHECK_INTERNAL \\\[table-recheck\\\]/);
});

test("background failure identifies the internal operation",()=>{
  const worker=route.slice(route.indexOf("function scheduleFastBackground"),route.indexOf("async function ensureFastHandoffSchema"));
  assert.match(worker,/operationStage="ai-recheck"/);
  assert.match(worker,/operationStage="save-product-lines"/);
  assert.match(worker,/operationStage="purchase-intake"/);
  assert.match(worker,/POS_BACKGROUND_\$\{operationStage\.toUpperCase\(\)/);
});

test("the repaired secondary-page conflict is eligible for durable recovery",()=>{
  assert.match(route,/Δεν επιβεβαιώθηκαν όλες οι πρόσθετες σελίδες του τιμολογίου/);
});

test("a historical hidden AI-recheck failure can be reclaimed after staged diagnostics deploy",()=>{
  assert.match(route,/POS_BACKGROUND_AI_RECHECK:\\s\*\(\?:Παρουσιάστηκε εσωτερικό σφάλμα\|AI_RECHECK_INTERNAL/);
});
