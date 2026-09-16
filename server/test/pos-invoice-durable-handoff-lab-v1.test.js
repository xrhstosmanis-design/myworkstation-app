import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url),"utf8");

test("POS persists every invoice page before starting full recognition",()=>{
  assert.match(route,/router\.post\("\/ai-reader\/fast-handoff"/);
  assert.match(route,/INSERT INTO "DocumentAttachment"/);
  assert.match(route,/POS_QUEUED/);
  assert.match(route,/posHandoff:handoff/);
  const response=route.indexOf('res.status(202).json');
  const background=route.indexOf('setImmediate(()=>scheduleFastBackground',response);
  assert.ok(response>=0&&background>response,"durable handoff response must be sent before full background OCR starts");
});

test("POS closes the invoice modal immediately and only monitors server status",()=>{
  assert.match(client,/effectiveMode==="PAID"\?`✅ Πληρωμή/);
  assert.match(client,/monitorBackgroundV244\(\{api,jobId:handoff\.jobId/);
  assert.match(client,/\/ai-reader\/fast-status\//);
  assert.doesNotMatch(client,/\/ai-reader\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/ai-recheck/);
  assert.match(route,/function scheduleFastBackground/);
  assert.match(route,/\/ai-recheck/);
  assert.match(route,/\/product-lines/);
  assert.match(route,/\/pos-intake/);
});

test("status polling restarts a persisted queued worker after a server restart",()=>{
  assert.match(route,/posHandoff:primaryHandoff/);
  assert.match(route,/\["POS_QUEUED","POS_DRAFT_READY","POS_PROCESSING"\]\.includes\(job\.status\)/);
  assert.match(route,/handoff\.pageJobIds/);
  assert.match(route,/fastBackgroundWorkers\.has\(jobId\)/);
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
