import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const quality=fs.readFileSync(new URL("../../client/src/lib/document-image-quality.js",import.meta.url),"utf8");
const invoice=fs.readFileSync(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url),"utf8");
const payments=fs.readFileSync(new URL("../../client/src/components/store/StorePosPaymentsModal.jsx",import.meta.url),"utf8");
const settlements=fs.readFileSync(new URL("../../client/src/components/store/StoreSupplierOpenInvoicePayment.jsx",import.meta.url),"utf8");
const deposits=fs.readFileSync(new URL("../../client/src/components/store/StoreBankDeposit.jsx",import.meta.url),"utf8");
const learning=fs.readFileSync(new URL("../../client/src/invoice-learning-ai-bootstrap.js",import.meta.url),"utf8");

test("shared document pipeline rejects blur and prepares an OCR-safe image",()=>{
  assert.match(quality,/measureDocumentSharpness/);
  assert.match(quality,/code="IMAGE_QUALITY"/);
  assert.match(quality,/"BLURRY"/);
  assert.match(quality,/detectPaperBounds/);
  assert.match(quality,/estimateSkew/);
  assert.match(quality,/normalizeShadows/);
  assert.match(quality,/maxSide=3000/);
  assert.match(quality,/image\/jpeg",\.94/);
});

test("invoice and payment evidence share the same preprocessing path",()=>{
  for(const source of [invoice,payments,settlements,deposits,learning]){
    assert.match(source,/document-image-quality\.js/);
    assert.match(source,/prepareDocumentFile/);
    assert.match(source,/strict:true/);
  }
  assert.match(invoice,/pages\.map\(page=>\(\{filename:page\.file\.name/);
  assert.match(learning,/selectedFiles\.push\(prepared\.file\)/);
  assert.match(learning,/for\(const file of incoming\).*prepareDocumentFile/s);
  assert.match(learning,/maxSide:3000,enhance:true/);
});

test("PDF files bypass raster cleanup and keep their original file",()=>{
  assert.match(quality,/file\?\.type\?\.startsWith\("image\/"\)\?prepareDocumentImage\(file,options\):\{file,quality:null,changed:false\}/);
});
