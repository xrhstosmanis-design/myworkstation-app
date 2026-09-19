import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {assessInvoiceLineForReview,isLabReviewAcceptable,rawRowSupportsStructuredLine,reviewStatusForInvoiceLine} from "../src/lib/invoice-line-review.js";

test("matched low-confidence OCR line remains visibly reviewable",()=>{
  const result=reviewStatusForInvoiceLine({quantity:2,unitCost:4.25,confidence:61},{matched:true});
  assert.equal(result.resolutionStatus,"NEEDS_REVIEW");
  assert.match(result.reasons.join(" "),/Χαμηλή σιγουριά OCR/);
});

test("missing numeric quantity or package size is not silently confirmed",()=>{
  assert.equal(assessInvoiceLineForReview({quantity:0,unitCost:3},{matched:true}).needsReview,true);
  assert.equal(assessInvoiceLineForReview({quantity:1,unitCost:3,invoiceUnit:"PACKAGE",stockUnitsPerInvoiceUnit:0},{matched:true}).needsReview,true);
});

test("swapped neighbouring OCR values are marked when their raw physical row disagrees",()=>{
  const wrong={code:"0003012",description:"3Α Sticks Ντομάτα 85g",quantity:4,unitCost:1.95,rawText:"0003012 3Α STICKS ΝΤΟΜΑΤΑ 85g 6 ΤΜΧ 1,95 11,70"};
  assert.equal(rawRowSupportsStructuredLine(wrong),false);
  assert.match(assessInvoiceLineForReview(wrong,{matched:true}).reasons.join(" "),/ίδια φυσική σειρά OCR/);
  const correct={...wrong,quantity:6};
  assert.equal(rawRowSupportsStructuredLine(correct),true);
});

test("column verification survives the POS OCR handoff",()=>{
  for(const path of [
    new URL("../../client/src/lib/invoice-v244-core.js",import.meta.url),
    new URL("../../client/src/lib/invoice-v244-safe.js",import.meta.url),
    new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),
    new URL("../src/routes/commerce-pos-ai-recheck.js",import.meta.url)
  ])assert.match(fs.readFileSync(path,"utf8"),/sourceColumnsVerified/);
});

test("LAB acceptance permits at most two flagged lines and no unresolved product",()=>{
  const rows=[{resolutionStatus:"MATCHED"},{resolutionStatus:"NEEDS_REVIEW"},{resolutionStatus:"NEEDS_REVIEW"}];
  assert.equal(isLabReviewAcceptable(rows),true);
  assert.equal(isLabReviewAcceptable([...rows,{resolutionStatus:"NEEDS_REVIEW"}]),false);
  assert.equal(isLabReviewAcceptable([...rows,{resolutionStatus:"UNRESOLVED"}]),false);
});
