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

test("Karamolegos row 521 is flagged while its five balanced neighbours remain unchanged",()=>{
  const supplierRows=[
    ["100139",2,2.10,20,0,0,3.36],
    ["103",3,2.15,35,20,0,3.35],
    ["114",4,1.90,30,20,0,4.26],
    ["521",3,1.88,0,0,10,13.00],
    ["522",3,1.68,0,20,0,4.03],
    ["650",4,1.49,0,20,0,4.77]
  ];
  const results=supplierRows.map(([code,quantity,unitCost,discount1,discount2,discount3,netAmount])=>
    reviewStatusForInvoiceLine({code,description:`Προϊόν ${code}`,rawText:`${code} Προϊόν ${code} ${quantity} ${unitCost}`,
      quantity,unit:"ΤΜΧ",unitCost,discount1,discount2,discount3,netAmount,confidence:95,sourceColumnsVerified:true},{matched:true}));
  assert.deepEqual(results.map(row=>row.resolutionStatus),["MATCHED","MATCHED","MATCHED","NEEDS_REVIEW","MATCHED","MATCHED"]);
  assert.match(results[3].reasons.join(" "),/καθαρή αξία/);
  assert.equal(reviewStatusForInvoiceLine({quantity:3,unitCost:1.88,discount2:20,netAmount:4.51,unit:"ΤΜΧ",rawText:"521 Προϊόν 3 1,88 4,51",code:"521",description:"Προϊόν 521"},{matched:true}).needsReview,false);
  assert.equal(reviewStatusForInvoiceLine({quantity:3,unitCost:1.88,netAmount:13,unit:"ΚΙΒ",rawText:"521 3 1,88 13",code:"521",description:"Προϊόν 521"},{matched:true}).reasons.some(reason=>reason.includes("καθαρή αξία")),false);
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
