import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const orders=await readFile(new URL("../../client/src/components/commerce/installPurchaseOrdersSuite.js",import.meta.url),"utf8");
const reader=await readFile(new URL("../src/routes/commerce-pos-ai-recheck.js",import.meta.url),"utf8");
const auth=await readFile(new URL("../src/middleware/auth.js",import.meta.url),"utf8");

test("BackOffice refresh reclaims only durable, stale POS handoffs without a payment write",()=>{
  assert.match(route,/router\.post\("\/ai-reader\/fast-recover"/);
  assert.match(route,/"status" IN \('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_FAILED'\) OR \("status"='POS_PROCESSING' AND "updatedAt"<\$\{staleBefore\}\)/);
  assert.match(route,/"updatedAt" ASC LIMIT 50/);
  assert.match(route,/if\(recovered\.length>=3\)break/);
  assert.match(route,/enqueueFastBackground\(\{companyId:req\.user\.companyId,storeId:job\.storeId,jobId:job\.id,publicOrigin\}\)/);
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

test("complete FAST product lines recover printed discounts before bypassing full OCR",()=>{
  const start=route.indexOf('router.post("/ai-reader/fast-handoff"');
  const body=route.slice(start,route.indexOf('router.post("/ai-reader/fast-recover"',start));
  assert.match(route,/import \{verifyInvoiceDiscounts\} from "\.\.\/lib\/invoice-discount-verifier\.js"/);
  assert.match(body,/await verifyInvoiceDiscounts\(\{productLines:page\.cachedProductLines,apiKey:null\}\)/);
  assert.match(body,/finalizeV244ProductLines\(page\.cachedProductLines\)/);
  assert.ok(body.indexOf("verifyInvoiceDiscounts")<body.indexOf("const cachedProductLines=hasCompleteCachedProductLines"));
});

test("Azure may forward a reconciled complete table while OpenAI FAST remains header-only",()=>{
  const schema=route.slice(route.indexOf('const fastHeaderSchema='),route.indexOf('const reconciledFastProductLines='));
  assert.doesNotMatch(schema,/productLines/);
  assert.match(route,/const reconciledFastProductLines=/);
  assert.match(route,/reconcileInvoiceLines\(productLines,totalGross\)/);
  assert.match(route,/return difference<=POS_STORED_LINES_TOLERANCE\?productLines:\[\]/);
  assert.match(route,/const azureProductLines=reconciledFastProductLines\(parsed\.productLines,azureTotalGross\)/);
});

test("a useful Azure header with an incomplete table continues through FAST OpenAI",()=>{
  const start=route.indexOf('router.post("/ai-reader/fast-header"');
  const body=route.slice(start,route.indexOf('router.post("/ai-reader/fast-duplicate-check"',start));
  assert.match(body,/let azureHeaderFallback=null/);
  assert.match(body,/const azureProductLines=reconciledFastProductLines\(parsed\.productLines,azureTotalGross\)/);
  assert.match(body,/if\(azureHasUsefulHeader&&azureProductLines\.length\)return res\.json\(azureHeader\)/);
  assert.match(body,/if\(azureHasUsefulHeader\)azureHeaderFallback=azureHeader/);
  assert.ok(body.indexOf("azureHeaderFallback=azureHeader")<body.indexOf("callFastOpenAiHeader({prompt,filePart})"));
  assert.match(body,/catch\(error\)\{if\(azureHeaderFallback\)return res\.json\(azureHeaderFallback\);throw error\}/);
});

test("fast handoff hydrates an empty newest job from the matching exact-file durable table",()=>{
  const start=route.indexOf('router.post("/ai-reader/fast-handoff"');
  const body=route.slice(start,route.indexOf('router.post("/ai-reader/fast-recover"',start));
  assert.match(body,/a\."checksum"=\$\{page\.checksum\}/);
  assert.match(body,/normalizeDocumentNumber\(candidateHandoff\.documentNumber\)===normalizeDocumentNumber\(documentNumber\)/);
  assert.match(body,/normalizeIntakeDate\(candidateHandoff\.documentDate\)===documentDate/);
  assert.match(body,/candidateDifference>POS_STORED_LINES_TOLERANCE/);
  assert.match(body,/page\.cachedProductLines=candidateLines/);
  assert.ok(body.indexOf("page.cachedProductLines=candidateLines")<body.indexOf("const hasCompleteCachedProductLines"));
});

test("fast handoff survives optimized image checksum changes using strict invoice identity",()=>{
  const start=route.indexOf('router.post("/ai-reader/fast-handoff"');
  const body=route.slice(start,route.indexOf('router.post("/ai-reader/fast-recover"',start));
  assert.match(body,/j\."companyId"=\$\{companyId\} AND j\."storeId"=\$\{storeId\}/);
  assert.match(body,/j\."resultJson"->'posHandoff'->>'supplierId'=\$\{supplierId\}/);
  assert.match(body,/normalizeDocumentNumber\(candidateHandoff\.documentNumber\)===normalizeDocumentNumber\(documentNumber\)/);
  assert.match(body,/normalizeIntakeDate\(candidateHandoff\.documentDate\)===documentDate/);
  assert.match(body,/Math\.abs\(round2\(candidateHandoff\.totalGross\|\|0\)-totalGross\)<=POS_STORED_LINES_TOLERANCE/);
  const identity=body.indexOf("const identityCandidates=");
  assert.ok(identity>body.indexOf("a.\"checksum\"=${page.checksum}"));
  assert.ok(body.indexOf("reconcileInvoiceLines(candidateLines,totalGross)",identity)>identity);
});

test("durable POS task receives the complete cached-line handoff",()=>{
  const start=route.indexOf('router.post("/ai-reader/fast-handoff"');
  const body=route.slice(start,route.indexOf('router.post("/ai-reader/fast-recover"',start));
  assert.match(body,/const handoff=\{supplierId,documentNumber,documentDate,totalGross,settlementMode,paymentTransactionId,pageCount:pageJobIds\.length,pageJobIds,primaryJobId:jobId,resumeStoredProductLines:hasCompleteCachedProductLines\}/);
  assert.match(body,/posHandoff:primaryHandoff/);
  assert.match(body,/await enqueueFastBackground\(\{companyId,storeId,jobId,publicOrigin\}\)/);
});

test("durable POS background uses a job-scoped server capability instead of the browser session",()=>{
  const worker=route.slice(route.indexOf("function scheduleFastBackground"),route.indexOf("async function ensureFastHandoffSchema"));
  assert.match(route,/tokenType:"POS_BACKGROUND",companyId,storeId,jobId,path,method,bodyHash/);
  assert.match(route,/expiresIn:"5m",issuer:POS_BACKGROUND_TOKEN_ISSUER,audience:POS_BACKGROUND_TOKEN_AUDIENCE/);
  assert.match(worker,/const backgroundScope=\{companyId,storeId,jobId\}/);
  assert.match(worker,/\/ai-recheck`,\{backgroundScope,publicOrigin/);
  assert.match(worker,/\/product-lines`,\{backgroundScope,publicOrigin/);
  assert.match(worker,/\/pos-intake`,\{backgroundScope,publicOrigin/);
  assert.doesNotMatch(worker,/authorization:req\.get|\{authorization,publicOrigin/);
});

test("POS background capability is bound to exact route, method, body, tenant, store and durable job",()=>{
  assert.match(auth,/^const POS_BACKGROUND_ACTIONS=\{/m);
  assert.match(auth,/payload\.path!==path\.replace\("\/api\/commerce",""\)/);
  assert.match(auth,/payload\.method!==req\.method/);
  assert.match(auth,/payload\.jobId!==requestJobId/);
  assert.match(auth,/payload\.bodyHash!==bodyHash/);
  assert.match(auth,/j\."companyId"=\$\{String\(payload\.companyId\|\|""\)\} AND j\."storeId"=\$\{String\(payload\.storeId\|\|""\)\}/);
  assert.match(auth,/Array\.isArray\(handoff\.pageJobIds\).*includes\(String\(job\?\.id\)\)/);
  assert.match(auth,/\["POS_QUEUED","POS_DRAFT_READY","POS_PROCESSING","POS_REPROCESSING","AI_COMPLETE"\]\.includes\(job\.status\)/);
  assert.match(auth,/code:"POS_BACKGROUND_SCOPE_REJECTED"/);
  assert.match(auth,/code:"POS_BACKGROUND_JOB_REJECTED"/);
});

test("POS background capability remains active across the durable claim race only",()=>{
  const start=auth.indexOf('if(payload.tokenType==="POS_BACKGROUND")');
  const body=auth.slice(start,auth.indexOf('if(payload.tokenType==="STORE_OPERATOR")',start));
  assert.match(body,/"POS_QUEUED","POS_DRAFT_READY","POS_PROCESSING","POS_REPROCESSING","AI_COMPLETE"/);
  assert.doesNotMatch(body,/"POS_FAILED"/);
  assert.doesNotMatch(body,/"AWAITING_APPROVAL"/);
  assert.doesNotMatch(body,/"CONFIRMED"/);
});

test("a repeated POS intake reuses and re-verifies durable cached lines without provider OCR",()=>{
  const start=route.indexOf('router.post("/ai-reader/fast-handoff"');
  const body=route.slice(start,route.indexOf('router.post("/ai-reader/fast-recover"',start));
  const worker=route.slice(route.indexOf("function scheduleFastBackground"),route.indexOf("async function ensureFastHandoffSchema"));
  assert.match(worker,/storedDifference<=POS_STORED_LINES_TOLERANCE/);
  assert.match(worker,/usingStoredProductLines=true/);
  assert.match(worker,/if\(usingStoredProductLines&&Array\.isArray\(sourceLines\)&&sourceLines\.length\)await verifyInvoiceDiscounts\(\{productLines:sourceLines,apiKey:null\}\)/);
  assert.ok(worker.indexOf("verifyInvoiceDiscounts({productLines:sourceLines")<worker.indexOf("const productLines=verifiedPrintedTableForPersistence"));
});

test("background OCR falls back publicly only for a loopback connection failure",()=>{
  assert.match(route,/const origins=\[localOrigin,.+publicOrigin/);
  assert.match(route,/publicOrigin,method:"POST",body:\{force:true/);
  assert.match(route,/error\.internalHttpResponse=true/);
  assert.match(route,/if\(!hasFallback\|\|error\?\.internalHttpResponse\|\|timedOut\)throw error/);
  assert.match(route,/x-forwarded-proto/);
});

test("the durable database task is the only background retry owner",()=>{
  const worker=route.slice(route.indexOf("function scheduleFastBackground"),route.indexOf("async function ensureFastHandoffSchema"));
  assert.doesNotMatch(route,/FAST_BACKGROUND_RETRY_DELAYS_MS/);
  assert.doesNotMatch(worker,/for\(const \[attempt,delay\]/);
  assert.match(route,/isRetryableBackgroundError\(error\)/);
  assert.match(route,/POS_BACKGROUND_DURABLE_RETRY_DELAYS_MS=\[30000,120000\]/);
  assert.match(route,/"state"='QUEUED',"availableAt"=\$\{availableAt\}/);
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

test("queued recovery uses the existing database lease and skips a completed draft",()=>{
  const queue=route.slice(route.indexOf("async function enqueueFastBackground"),route.indexOf("async function claimFastBackground"));
  const claim=route.slice(route.indexOf("async function claimFastBackground"),route.indexOf("async function runPosInvoiceBackgroundSweep"));
  assert.match(queue,/"state"='RUNNING' AND "PosInvoiceBackgroundTask"\."leaseUntil">CURRENT_TIMESTAMP/);
  assert.match(claim,/FOR UPDATE OF t SKIP LOCKED LIMIT 1/);
  assert.match(claim,/j\."status" IN \('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_PROCESSING','POS_REPROCESSING'\)/);
  assert.doesNotMatch(claim,/AWAITING_APPROVAL|CONFIRMED/);
});

test("completed MANTZILAS drafts with the legacy 48/65.5 ambiguity reread the archived image",()=>{
  assert.match(route,/function hasMantzilasLegacyAmbiguity\(productLines\)/);
  assert.match(route,/async function hasPersistedMantzilasLegacyAmbiguity\(companyId,job\)/);
  assert.match(route,/JOIN "PurchaseOrderLine" row9 ON row9\."orderId"=o\."id"/);
  assert.match(route,/row9\."quantity"=48 AND ABS\(row9\."discount1"-65\.5\)<=0\.05/);
  assert.match(route,/await hasPersistedMantzilasLegacyAmbiguity\(req\.user\.companyId,job\)/);
  assert.match(route,/Number\(row9\.quantity\)===48/);
  assert.match(route,/Number\(row9\.discount1\|\|0\)-65\.5/);
  assert.match(route,/reason:needsFailedRereadAdvance\?"PREVIOUS_SAFE_INFERIOR_REREAD":needsLegacyAmbiguityReread\?"MANTZILAS_LEGACY_AMBIGUITY":null/);
  assert.match(route,/handoff=\{\.\.\.handoff,resumeStoredProductLines:false,replaceExistingDraft:true\}/);
});

test("recovery prioritizes recent completed drafts before the bounded legacy scan",()=>{
  assert.match(route,/ORDER BY CASE WHEN "status"='AWAITING_APPROVAL' THEN 0 ELSE 1 END,/);
  assert.match(route,/CASE WHEN "status"='AWAITING_APPROVAL' THEN "updatedAt" END DESC,/);
  assert.match(route,/MANTZILAS_SINGLE_COMPLETE_VERIFIER_V14/);
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
  assert.match(route,/table-recheck\|discount-verification/);
});

test("discount verification internal failure is eligible for durable reread",()=>{
  assert.match(route,/AI_RECHECK_INTERNAL \\\[/);
  assert.match(route,/table-recheck\|discount-verification/);
});

test("bounded invoice-total diagnostics remain eligible for durable reread",()=>{
  assert.match(route,/invoice-total-reconciliation/);
  assert.ok(route.includes("AI_RECHECK_INTERNAL \\[(?:table-recheck|discount-verification|invoice-total-reconciliation)"));
});

test("a reclaimed discount failure stays in POS recovery instead of reporting the stale failure",()=>{
  assert.match(route,/retryClaimed=false/);
  assert.match(route,/retryClaimed=Boolean\(reclaimed\);shouldSchedule=retryClaimed/);
  assert.match(route,/stage:rereadClaimed\?"POS_REPROCESSING":retryClaimed\?"POS_RECOVERING"/);
  assert.match(route,/failed:job\.status==="POS_FAILED"&&!retryClaimed/);
  assert.match(route,/error:retryClaimed\?null:background\.error\|\|null/);
  assert.match(route,/status:"RECOVERING",recoveredAt:new Date\(\)\.toISOString\(\),previousError/);
});

test("normal POS status polling does not enqueue a successor until processing is stale",()=>{
  assert.match(route,/staleProcessing=job\.status==="POS_PROCESSING"&&new Date\(job\.updatedAt\)\.getTime\(\)<Date\.now\(\)-60\*1000/);
  assert.match(route,/\["POS_QUEUED","POS_DRAFT_READY"\]\.includes\(job\.status\)\|\|staleProcessing/);
  assert.doesNotMatch(route,/\["POS_QUEUED","POS_DRAFT_READY","POS_PROCESSING"\]\.includes\(job\.status\)/);
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
