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
  assert.match(status,/handoff:scheduledHandoff/);
});

test("POS keeps polling while the mismatch reread is being claimed",()=>{
  const status=route.slice(route.indexOf('router.get("/ai-reader/fast-status'),route.indexOf('// The invoice UI labels'));
  assert.match(status,/const done=background\.status==="COMPLETED"&&job\.status==="AWAITING_APPROVAL"&&!rereadClaimed/);
  assert.match(pos,/if\(result\?\.done\)/);
  assert.match(pos,/setTimeout\(poll,5000\)/);
  assert.doesNotMatch(pos,/επανάληψη από το BackOffice/);
});

test("every queued recovery waits for the first worker and then receives a successor",()=>{
  const worker=route.slice(route.indexOf("function scheduleFastBackground"),route.indexOf("async function ensureFastHandoffSchema"));
  assert.match(worker,/const activeWorker=fastBackgroundWorkers\.get\(jobId\)/);
  assert.match(worker,/fastBackgroundSuccessors\.set\(jobId/);
  assert.match(worker,/if\(!waiting\)activeWorker\.finally/);
  assert.match(worker,/scheduleFastBackground\(successor\)/);
  assert.doesNotMatch(worker,/if\(handoff\.replaceExistingDraft\)activeWorker\.finally/);
  assert.match(worker,/!fastBackgroundWorkers\.has\(jobId\)/);
});
