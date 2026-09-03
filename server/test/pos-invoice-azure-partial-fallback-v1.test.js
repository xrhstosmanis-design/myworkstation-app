import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const azure=await readFile(new URL("../src/routes/commerce-azure-invoice-reader.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url),"utf8");

test("partial Azure invoice tables fall through to the full AI table reader",()=>{
  const route=azure.slice(azure.indexOf('router.post("/ai-reader/jobs/:jobId/ai-recheck"'));
  const mismatch=route.indexOf('INVOICE_TOTAL_DIFFERS_FROM_LINE_SUM');
  const discountVerifier=route.indexOf('verifyInvoiceDiscounts');
  assert.ok(mismatch>=0&&discountVerifier>mismatch,"large table mismatch must fall back before discount verification");
  assert.match(route,/"status"='LOCAL_COMPLETE'/);
  assert.match(route,/azureFallbackReason="INVOICE_TOTAL_DIFFERS_FROM_LINE_SUM"/);
  assert.match(route,/return next\(\)/);
});

test("resuming a known incomplete Azure result forces a complete reread",()=>{
  assert.match(client,/existingTotalMismatch/);
  assert.match(client,/INVOICE_TOTAL_DIFFERS_FROM_LINE_SUM/);
  assert.match(client,/completedLines\.length&&!existingTotalMismatch/);
});
