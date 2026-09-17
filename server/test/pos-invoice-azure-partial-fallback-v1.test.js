import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const azure=await readFile(new URL("../src/routes/commerce-azure-invoice-reader.js",import.meta.url),"utf8");
const handoff=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");

test("partial Azure invoice tables fall through to the full AI table reader",()=>{
  const route=azure.slice(azure.indexOf('router.post("/ai-reader/jobs/:jobId/ai-recheck"'));
  const mismatch=route.indexOf('INVOICE_TOTAL_DIFFERS_FROM_LINE_SUM');
  const discountVerifier=route.indexOf('verifyInvoiceDiscounts');
  assert.ok(mismatch>=0&&discountVerifier>mismatch,"large table mismatch must fall back before discount verification");
  assert.match(route,/"status"='LOCAL_COMPLETE'/);
  assert.match(route,/azureFallbackReason="INVOICE_TOTAL_DIFFERS_FROM_LINE_SUM"/);
  assert.match(route,/return next\(\)/);
});

test("durable POS handoffs bypass generic Azure without losing their routing state",()=>{
  const route=azure.slice(azure.indexOf('router.post("/ai-reader/jobs/:jobId/ai-recheck"'));
  const bypass=route.indexOf('if(job.resultJson?.posHandoff&&typeof job.resultJson.posHandoff==="object")return next()');
  const providerCall=route.indexOf('payload=await callAzure');
  const partialWrite=route.indexOf('"status"=\'LOCAL_COMPLETE\'');
  assert.ok(bypass>=0&&providerCall>bypass&&partialWrite>providerCall,"POS handoff must leave the generic route before provider work or a partial result write");
});

test("resuming a known incomplete Azure result forces a complete reread",()=>{
  assert.match(handoff,/force:true,additionalPageJobIds/);
  assert.match(handoff,/scheduleFastBackground/);
  assert.match(handoff,/existingJobs\[0\]\?\.id\|\|id\(\)/);
});
