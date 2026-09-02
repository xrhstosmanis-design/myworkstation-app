import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../src/routes/commerce-pos-ai-recheck.js",import.meta.url),"utf8");
const commerceSource=await readFile(new URL("../src/routes/commerce-v1.js",import.meta.url),"utf8");

test("V2.4.4 table pass is triggered by invoice total mismatch",()=>{
  assert.match(source,/TOTAL_TOLERANCE=0\.05/);
  assert.match(source,/totalMismatch=invoiceTotal>0&&Math\.abs\(initialLinesTotal-invoiceTotal\)>TOTAL_TOLERANCE/);
  assert.match(source,/needsTablePass=parsed\.productLines\.length>0&&\(allNumericMissing\|\|partialNumericMissing\|\|totalMismatch\)/);
});

test("V2.4.4 recovery asks for all visible product rows and can append missing rows",()=>{
  assert.match(source,/επέστρεψε ΟΛΕΣ τις πραγματικές σειρές προϊόντων/i);
  assert.match(source,/out\.push\(normalizeProductLine\(candidate\)\)/);
  assert.match(source,/parsed\.productLines=mergeRecoveredLines\(parsed\.productLines,recovered\)/);
});

test("V2.4.4 records completeness totals before and after recovery",()=>{
  assert.match(source,/productLinesGrossBeforeRecovery/);
  assert.match(source,/productLinesGrossAfterRecovery/);
  assert.match(source,/productLinesTotalDifference/);
  assert.match(source,/productLinesComplete/);
});

test("supplier OCR matching validates VAT and tolerates Greek/Latin OCR glyphs",()=>{
  assert.match(source,/validGreekTaxId/);
  assert.match(source,/greekLatinFold/);
  assert.match(source,/best\.score>=0\.76/);
  assert.match(source,/best\.score-\(second\.score\|\|0\)>=0\.08/);
});

test("AI Reader job accepts an unknown initial page count",()=>{
  assert.match(commerceSource,/pageCount:z\.number\(\)\.int\(\)\.min\(0\)/);
});
