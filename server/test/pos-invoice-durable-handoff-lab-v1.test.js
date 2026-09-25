import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const server=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url),"utf8");

test("POS persists every invoice page before starting full recognition",()=>{
  assert.match(route,/router\.post\("\/ai-reader\/fast-handoff"/);
  assert.match(route,/INSERT INTO "DocumentAttachment"/);
  assert.match(route,/POS_QUEUED/);
  assert.match(route,/posHandoff:handoff/);
  const handoffStart=route.indexOf('router.post("/ai-reader/fast-handoff"');
  const response=route.indexOf('res.status(202).json',handoffStart);
  const queued=route.indexOf('await enqueueFastBackground({companyId,storeId,jobId,publicOrigin})',handoffStart);
  assert.ok(queued>handoffStart&&response>queued,"the durable task must be committed before POS receives acceptance");
  assert.doesNotMatch(route.slice(handoffStart,response),/scheduleFastBackground\(/);
});

test("POS closes the invoice modal immediately and only monitors server status",()=>{
  assert.match(client,/effectiveMode==="PAID"\?`⏳ Η πληρωμή/);
  assert.match(client,/δεν έχει δηλωθεί ακόμη επιτυχία/);
  assert.match(client,/monitorBackgroundV244\(\{api,jobId:handoff\.jobId/);
  assert.match(client,/\/ai-reader\/fast-status\//);
  assert.doesNotMatch(client,/\/ai-reader\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/ai-recheck/);
  assert.match(route,/function scheduleFastBackground/);
  assert.match(route,/\/ai-recheck/);
  assert.match(route,/\/product-lines/);
  assert.match(route,/\/pos-intake/);
});

test("POS reports success only after non-empty reconciled background completion",()=>{
  assert.match(route,/const lineCount=Number\(background\.lineCount\|\|job\.resultJson\?\.productLines\?\.length\|\|0\)/);
  assert.match(route,/const done=background\.status==="COMPLETED"&&job\.status==="AWAITING_APPROVAL"&&!rereadClaimed&&lineCount>0/);
  assert.match(client,/if\(lineCount<=0\).*Δεν θεωρείται επιτυχής/s);
  assert.match(client,/review\?`⚠️[\s\S]*πέρασε κανονικά στο BackOffice ως πρόχειρο[\s\S]*χρειάζεται διόρθωση πριν από έγκριση ή αποθήκη\.`:`✅[\s\S]*οικονομικός έλεγχος ΟΚ/);
  assert.match(client,/safe retry του ίδιου job|ασφαλές retry του ίδιου job/);
});

test("server startup reclaims persisted queued or expired-lease work without POS polling",()=>{
  assert.match(route,/posHandoff:primaryHandoff/);
  assert.match(route,/CREATE TABLE IF NOT EXISTS "PosInvoiceBackgroundTask"/);
  assert.match(route,/SELECT j\."id",j\."companyId",j\."storeId",'QUEUED',NOW\(\) FROM "AiReaderJob" j/);
  assert.match(route,/t\."state"='RUNNING' AND \(t\."leaseUntil" IS NULL OR t\."leaseUntil"<CURRENT_TIMESTAMP\)/);
  assert.match(route,/FOR UPDATE OF t SKIP LOCKED LIMIT 1/);
  assert.match(route,/setInterval\(runPosInvoiceBackgroundSweep,POS_BACKGROUND_SWEEP_MS\)/);
  assert.match(server,/await ensurePosInvoiceBackgroundWorkerSchema\(\)/);
  assert.match(server,/app\.listen[\s\S]*startPosInvoiceBackgroundWorker\(\)/);
});

test("a live POS worker heartbeats a short lease and an orphan is reclaimed",()=>{
  assert.match(route,/POS_BACKGROUND_LEASE_MS=90\*1000/);
  assert.match(route,/POS_BACKGROUND_HEARTBEAT_MS=30\*1000/);
  assert.match(route,/async function renewFastBackgroundLease/);
  assert.match(route,/"state"='RUNNING' AND "leaseToken"=\$\{leaseToken\}/);
  assert.match(route,/setInterval\(\(\)=>\{renewFastBackgroundLease/);
  assert.match(route,/clearInterval\(leaseHeartbeat\)/);
  assert.match(route,/WHERE "state"='RUNNING' AND \("leaseUntil" IS NULL OR "leaseToken" IS NULL OR "leaseOwner" IS NULL\)/);
  assert.match(route,/t\."state"='RUNNING' AND \(t\."leaseUntil" IS NULL OR t\."leaseUntil"<CURRENT_TIMESTAMP\)/);
});

test("startup reconciles an eligible job whose durable task is terminal or mis-scoped",()=>{
  const schema=route.slice(route.indexOf("async function ensureFastHandoffSchema"),route.indexOf("async function enqueueFastBackground"));
  assert.match(schema,/j\."status" IN \('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_PROCESSING','POS_REPROCESSING','AI_COMPLETE'\)/);
  assert.match(schema,/j\."resultJson"->'posHandoff' IS NOT NULL/);
  assert.match(schema,/ON CONFLICT \("jobId"\) DO UPDATE SET/);
  assert.match(schema,/"state"='QUEUED',"availableAt"=NOW\(\),"attemptCount"=0/);
  assert.match(schema,/NOT \("PosInvoiceBackgroundTask"\."state"='RUNNING' AND "PosInvoiceBackgroundTask"\."leaseUntil">NOW\(\)/);
  assert.match(schema,/"PosInvoiceBackgroundTask"\."companyId"<>EXCLUDED\."companyId"/);
  assert.match(schema,/"PosInvoiceBackgroundTask"\."storeId"<>EXCLUDED\."storeId"/);
  assert.doesNotMatch(schema,/ON CONFLICT \("jobId"\) DO NOTHING/);
});

test("worker watchdog requeues a stale recovering job without browser polling",()=>{
  const repair=route.slice(route.indexOf("async function repairStaleRecoveringTasks"),route.indexOf("async function runPosInvoiceBackgroundSweep"));
  const sweep=route.slice(route.indexOf("async function runPosInvoiceBackgroundSweep"),route.indexOf("export async function ensurePosInvoiceBackgroundWorkerSchema"));
  assert.match(repair,/j\."status"='POS_QUEUED' AND j\."stage"='POS_RECOVERING'/);
  assert.match(repair,/j\."updatedAt"<CURRENT_TIMESTAMP-INTERVAL '3 minutes'/);
  assert.match(repair,/j\."resultJson"->'posHandoff' IS NOT NULL/);
  assert.match(repair,/NOT \(t\."state"='RUNNING' AND t\."leaseUntil">CURRENT_TIMESTAMP/);
  assert.match(repair,/"state"='QUEUED',"availableAt"=CURRENT_TIMESTAMP/);
  assert.match(sweep,/await repairStaleRecoveringTasks\(\)/);
  assert.ok(sweep.indexOf("repairStaleRecoveringTasks")<sweep.indexOf("claimFastBackground"));
});

test("startup rereads one recent unapproved mismatched MANTZILAS draft without browser refresh",()=>{
  const schema=route.slice(route.indexOf("async function ensureFastHandoffSchema"),route.indexOf("async function enqueueFastBackground"));
  assert.match(route,/MANTZILAS_SINGLE_COMPLETE_VERIFIER_V15/);
  assert.match(schema,/j\."status"='AWAITING_APPROVAL'/);
  assert.match(schema,/j\."updatedAt">CURRENT_TIMESTAMP-INTERVAL '48 hours'/);
  assert.match(schema,/reconciliationRequired'\)::boolean,false\)=true/);
  assert.match(schema,/COALESCE\(l\."stockUnitsPerInvoiceUnit",1\)<=1/);
  assert.match(schema,/o\."sourceDocumentId"=d\."id"/);
  assert.match(schema,/STARTUP_TOTAL_OR_PACKAGING_RESTORE/);
  assert.match(schema,/d\."status"='DRAFT' AND d\."sourceType"='POS_OCR_DRAFT'/);
  assert.match(schema,/s\."name" ILIKE '%ΜΑΝΤΖΙΛΑΣ%'/);
  assert.match(schema,/reason:"STARTUP_TOTAL_OR_PACKAGING_RESTORE",trigger:"SERVER_STARTUP"/);
  assert.match(schema,/resumeStoredProductLines:false,replaceExistingDraft:true/);
  assert.match(schema,/"status"='POS_REPROCESSING'/);
  assert.match(schema,/ON CONFLICT \("jobId"\) DO UPDATE SET[\s\S]*"state"='QUEUED'/);
});

test("handoff distinguishes existing myDATA and not-yet-arrived documents",()=>{
  assert.match(route,/FROM "MyDataInboundDocument" m/);
  assert.match(route,/ABS\(COALESCE\(m\."totalGross",0\)-\$\{totalGross\}\)<=0\.05/);
  assert.match(route,/myDataMatched:Boolean\(myData\)/);
  assert.match(route,/συνδέθηκε με το υπάρχον myDATA/);
  assert.match(route,/Θα συνδεθεί αυτόματα όταν εμφανιστεί στο myDATA/);
});

test("LAB handoff records paid or credit intent without posting stock",()=>{
  assert.match(route,/settlementMode=req\.body\?\.settlementMode==="PAID"\?"PAID":"CREDIT"/);
  assert.match(route,/paymentTransactionId/);
  assert.doesNotMatch(route,/fast-handoff[\s\S]*INSERT INTO "StockMovement"/);
});

test("a stalled internal background request times out and becomes retryable",()=>{
  assert.match(route,/INTERNAL_COMMERCE_REQUEST_TIMEOUT_MS=180000/);
  assert.match(route,/signal:AbortSignal\.timeout\(INTERNAL_COMMERCE_REQUEST_TIMEOUT_MS\)/);
  assert.match(route,/aborted due to timeout\|TimeoutError/);
});

test("multi-page header reading continues when one page has no usable header",()=>{
  const select=client.slice(client.indexOf("const selectFiles=async selected=>"),client.indexOf("const removePage="));
  assert.match(select,/const headerResults=\[\],headerErrors=\[\]/);
  assert.match(select,/for\(const sourcePage of headerPages\)/);
  assert.match(select,/const result=await api\("\/api\/commerce\/ai-reader\/fast-header"/);
  assert.match(select,/catch\(error\)\{headerErrors\.push\(error\)\}/);
  assert.doesNotMatch(select,/Promise\.all|Promise\.allSettled/);
  assert.match(select,/if\(!headerResults\.length\)throw/);
  assert.ok(select.indexOf("headerErrors.push(error)")<select.indexOf("mergeFastInvoiceHeaders(headerResults)"));
});

test("FAST header retries empty or malformed structured AI responses safely",()=>{
  assert.match(route,/FAST_OPENAI_HEADER_ATTEMPTS=2/);
  assert.match(route,/for\(let attempt=1;attempt<=FAST_OPENAI_HEADER_ATTEMPTS;attempt\+\+\)/);
  assert.match(route,/if\(!raw\.trim\(\)\)throw new Error\("empty structured response"\)/);
  assert.match(route,/const parsed=JSON\.parse\(raw\)/);
  assert.match(route,/Η γρήγορη ανάγνωση δεν επέστρεψε έγκυρα βασικά στοιχεία μετά από ασφαλή επανάληψη/);
});

test("FAST header safely reuses the exact durable POS file before provider calls",()=>{
  const start=route.indexOf('router.post("/ai-reader/fast-header"');
  const body=route.slice(start,route.indexOf('router.post("/ai-reader/fast-duplicate-check"',start));
  assert.match(body,/crypto\.createHash\("sha256"\)\.update\(fileBytes\)/);
  assert.match(body,/a\."companyId"=\$\{req\.user\.companyId\} AND a\."storeId"=\$\{storeId\} AND a\."checksum"=\$\{attachmentChecksum\}/);
  assert.match(body,/difference>POS_STORED_LINES_TOLERANCE/);
  assert.match(body,/provider:"DURABLE_POS_JOB",productLines/);
  assert.ok(body.indexOf('provider:"DURABLE_POS_JOB"')<body.indexOf("callAzure"));
  assert.doesNotMatch(body.slice(0,body.indexOf("callAzure")),/StoreTransaction|PurchaseDocument" SET|StockMovement/);
});
