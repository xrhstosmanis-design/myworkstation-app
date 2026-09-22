import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {mergeInvoiceLearningPages} from "../src/routes/platform-invoice-learning-ai.js";

test("merges physical rows in page order and uses the footer page totals",()=>{
  const merged=mergeInvoiceLearningPages([
    {supplier:{name:"TALOS",taxId:"800802293"},documentNumber:"01T00125909",documentDate:"2026-09-21",documentType:"INVOICE",totalGross:0,productLines:[{supplierItemCode:"A"},{supplierItemCode:"B"}],azurePageCount:1},
    {documentType:"INVOICE",totalNet:223.05,totalVat:29.01,totalGross:252.06,productLines:[{supplierItemCode:"C"}],azurePageCount:1},
  ]);
  assert.deepEqual(merged.productLines.map(line=>line.supplierItemCode),["A","B","C"]);
  assert.equal(merged.supplier.taxId,"800802293");
  assert.equal(merged.documentNumber,"01T00125909");
  assert.equal(merged.totalNet,223.05);
  assert.equal(merged.totalVat,29.01);
  assert.equal(merged.totalGross,252.06);
  assert.equal(merged.sourcePageCount,2);
  assert.equal(merged.azurePageCount,2);
});

test("Learning UI selects up to five images and sends every page together",()=>{
  const client=fs.readFileSync(new URL("../../client/src/invoice-learning-ai-bootstrap.js",import.meta.url),"utf8");
  assert.match(client,/el\.id==='photoFile'\)el\.multiple=true/);
  assert.match(client,/incoming\.length>5/);
  assert.match(client,/pages:selectedPages\.map/);
  assert.match(client,/Σελίδα \$\{index\+1\}\/\$\{selectedFiles\.length\}/);
});

test("Learning server rejects mixed PDF pages and gives all images to OpenAI",()=>{
  const route=fs.readFileSync(new URL("../src/routes/platform-invoice-learning-ai.js",import.meta.url),"utf8");
  assert.match(route,/pages\.length>1&&pages\.some\(page=>page\.mimeType==="application\/pdf"\)/);
  assert.match(route,/\.\.\.fileParts/);
  assert.match(route,/for\(const page of pages\)azurePages\.push/);
});
