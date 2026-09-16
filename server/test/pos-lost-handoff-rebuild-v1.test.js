import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const wrapper=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const recheck=await readFile(new URL("../src/routes/commerce-pos-ai-recheck.js",import.meta.url),"utf8");
const core=await readFile(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");

test("AI success preserves the durable POS handoff",()=>{
  assert.match(recheck,/"resultJson"=COALESCE\("resultJson",'\{\}'::jsonb\)\|\|\$\{JSON\.stringify\(parsed\)\}::jsonb/);
});

test("lost handoff rebuild is restricted to the same draft, payment and transaction page group",()=>{
  assert.match(wrapper,/async function rebuildLostFastHandoff\(companyId,job\)/);
  assert.match(wrapper,/d\."id"=\$\{job\.purchaseDocumentId\}.*d\."companyId"=\$\{companyId\}.*d\."storeId"=\$\{job\.storeId\}/s);
  assert.match(wrapper,/d\."sourceType"='POS_OCR_DRAFT' AND d\."status"='DRAFT'/);
  assert.match(wrapper,/document\.settlementMode==="PAID"&&!document\.paymentTransactionId/);
  assert.match(wrapper,/"createdAt"=\$\{job\.createdAt\}/);
  assert.match(wrapper,/siblings\.length!==expectedPageCount/);
  assert.match(wrapper,/resumeStoredProductLines:true/);
});

test("reconstructed recovery reuses stored lines and accepts the AI_COMPLETE bridge state",()=>{
  assert.match(wrapper,/handoff\.resumeStoredProductLines\|\|\(storedLines\.length&&storedDifference<=POS_STORED_LINES_TOLERANCE\)/);
  assert.match(wrapper,/sourceLines=storedLines;usingStoredProductLines=true/);
  assert.match(core,/"POS_DRAFT_READY","POS_PROCESSING","POS_FAILED","AI_COMPLETE"/);
});
