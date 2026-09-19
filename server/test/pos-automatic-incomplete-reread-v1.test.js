import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const pos=await readFile(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url),"utf8");

test("POS polling automatically claims one incomplete completed draft for full reread",()=>{
  const status=route.slice(route.indexOf('router.get("/ai-reader/fast-status'),route.indexOf('// The invoice UI labels'));
  assert.match(status,/needsAutomaticReread=.*background\.reconciliationRequired===true&&reprocess\.strategy!==POS_REPROCESS_STRATEGY/);
  assert.match(status,/strategy:POS_REPROCESS_STRATEGY/);
  assert.match(status,/trigger:"POS_STATUS"/);
  assert.match(status,/resumeStoredProductLines:false,replaceExistingDraft:true/);
  assert.match(status,/posHandoff:scheduledHandoff/);
  assert.match(status,/await enqueueFastBackground\(\{companyId:req\.user\.companyId,storeId:job\.storeId,jobId:job\.id,publicOrigin\}\)/);
});

test("POS keeps polling while the mismatch reread is being claimed",()=>{
  const status=route.slice(route.indexOf('router.get("/ai-reader/fast-status'),route.indexOf('// The invoice UI labels'));
  assert.match(status,/const done=background\.status==="COMPLETED"&&job\.status==="AWAITING_APPROVAL"&&!rereadClaimed/);
  assert.match(pos,/if\(result\?\.done\)/);
  assert.match(pos,/setTimeout\(poll,2000\)/);
  assert.doesNotMatch(pos,/επανάληψη από το BackOffice/);
});

test("queued recovery keeps one database lease and cannot reopen a completed draft",()=>{
  const claim=route.slice(route.indexOf("async function claimFastBackground"),route.indexOf("async function runPosInvoiceBackgroundSweep"));
  const worker=route.slice(route.indexOf("function scheduleFastBackground"),route.indexOf("async function ensureFastHandoffSchema"));
  assert.match(claim,/FOR UPDATE OF t SKIP LOCKED LIMIT 1/);
  assert.match(claim,/"leaseToken"=\$\{leaseToken\}/);
  assert.match(claim,/j\."status" IN \('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_PROCESSING','POS_REPROCESSING'\)/);
  assert.doesNotMatch(claim,/AWAITING_APPROVAL|CONFIRMED/);
  assert.match(worker,/\["AWAITING_APPROVAL","CONFIRMED"\]\.includes\(terminalRows\[0\]\?\.status\)/);
  assert.match(worker,/fastBackgroundWorkers\.has\(jobId\)/);
});
