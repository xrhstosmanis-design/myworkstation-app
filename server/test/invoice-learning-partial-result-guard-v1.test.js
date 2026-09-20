import assert from "node:assert/strict";
import test from "node:test";
import {invoiceReadingCompleteness} from "../src/routes/platform-invoice-learning-ai.js";

test("Invoice Learning rejects a one-line partial result against the printed total",()=>{
  const result=invoiceReadingCompleteness({
    totalGross:1380.44,
    productLines:[{grossAmount:82.72}],
  });
  assert.equal(result.complete,false);
  assert.equal(result.reason,"PARTIAL_PRODUCT_LINES");
  assert.equal(result.lineGross,82.72);
  assert.equal(result.totalGross,1380.44);
});

test("Invoice Learning accepts reconciled lines within the invoice tolerance",()=>{
  const result=invoiceReadingCompleteness({
    totalGross:1380.44,
    productLines:[
      {grossAmount:82.72},
      {grossAmount:1297.70},
    ],
  });
  assert.equal(result.complete,true);
  assert.equal(result.reason,"RECONCILED");
});

test("Invoice Learning can retain lines when the provider exposes no printed total",()=>{
  const result=invoiceReadingCompleteness({
    totalGross:0,
    productLines:[{netAmount:100,vatRate:24}],
  });
  assert.equal(result.complete,true);
  assert.equal(result.reason,"TOTAL_NOT_AVAILABLE");
  assert.equal(result.lineGross,124);
});

test("Invoice Learning accepts all net lines when the printed net, VAT and gross footer reconcile",()=>{
  const result=invoiceReadingCompleteness({
    totalNet:47.48,
    totalVat:6.43,
    totalGross:53.91,
    productLines:[
      {netAmount:20.12,vatRate:0},
      {netAmount:27.36,vatRate:0},
    ],
  });
  assert.equal(result.complete,true);
  assert.equal(result.reason,"RECONCILED_BY_HEADER_VAT");
  assert.equal(result.requiresLineVatReview,true);
  assert.equal(result.lineNet,47.48);
});

test("Invoice Learning still rejects missing rows when only the footer itself reconciles",()=>{
  const result=invoiceReadingCompleteness({
    totalNet:47.48,
    totalVat:6.43,
    totalGross:53.91,
    productLines:[{netAmount:20.12,vatRate:0}],
  });
  assert.equal(result.complete,false);
  assert.equal(result.reason,"PARTIAL_PRODUCT_LINES");
});
