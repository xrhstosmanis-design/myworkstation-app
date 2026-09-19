import test from "node:test";
import assert from "node:assert/strict";
import {assessInvoiceLineForReview,isLabReviewAcceptable,reviewStatusForInvoiceLine} from "../src/lib/invoice-line-review.js";

test("matched low-confidence OCR line remains visibly reviewable",()=>{
  const result=reviewStatusForInvoiceLine({quantity:2,unitCost:4.25,confidence:61},{matched:true});
  assert.equal(result.resolutionStatus,"NEEDS_REVIEW");
  assert.match(result.reasons.join(" "),/Χαμηλή σιγουριά OCR/);
});

test("missing numeric quantity or package size is not silently confirmed",()=>{
  assert.equal(assessInvoiceLineForReview({quantity:0,unitCost:3},{matched:true}).needsReview,true);
  assert.equal(assessInvoiceLineForReview({quantity:1,unitCost:3,invoiceUnit:"PACKAGE",stockUnitsPerInvoiceUnit:0},{matched:true}).needsReview,true);
});

test("LAB acceptance permits at most two flagged lines and no unresolved product",()=>{
  const rows=[{resolutionStatus:"MATCHED"},{resolutionStatus:"NEEDS_REVIEW"},{resolutionStatus:"NEEDS_REVIEW"}];
  assert.equal(isLabReviewAcceptable(rows),true);
  assert.equal(isLabReviewAcceptable([...rows,{resolutionStatus:"NEEDS_REVIEW"}]),false);
  assert.equal(isLabReviewAcceptable([...rows,{resolutionStatus:"UNRESOLVED"}]),false);
});
