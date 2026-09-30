import test from "node:test";
import assert from "node:assert/strict";
import {purchasePrintedRounding} from "../src/lib/purchase-printed-rounding.js";
const found={sourceType:"POS_OCR_DRAFT",status:"NEW"};
const calculated={quantity:10,unitCost:2.27,discount1:0,discount2:0,discount3:0,exciseTotal:0,vatRate:0,netAmount:22.7,vatAmount:0,grossAmount:22.7};
test("printed cents are preserved without inventing price or discount; unrelated edits retain them",()=>{
  const result=purchasePrintedRounding(found,{printedNetAmount:22.69},{ocrRawText:"original OCR"},calculated);
  assert.equal(result.calculated.netAmount,22.69);assert.equal(result.calculated.grossAmount,22.69);
  assert.equal(result.calculated.unitCost,2.27);assert.equal(result.calculated.discount1,0);
  const again=purchasePrintedRounding(found,{}, {ocrRawText:result.rawText},calculated);
  assert.equal(again.calculated.netAmount,22.69);
  assert.equal(purchasePrintedRounding(found,{}, {ocrRawText:result.rawText},{...calculated,quantity:11,netAmount:24.97}).calculated.netAmount,24.97);
});
test("precision cannot mask quantity/price errors or override other/closed purchases",()=>{
  assert.throws(()=>purchasePrintedRounding(found,{printedNetAmount:20},{},calculated),/στρογγυλοποίηση/);
  assert.throws(()=>purchasePrintedRounding({...found,status:"FINAL"},{printedNetAmount:22.69},{},calculated),/ενεργό πρόχειρο/);
  assert.throws(()=>purchasePrintedRounding({...found,sourceType:"MANUAL"},{printedNetAmount:22.69},{},calculated));
  assert.deepEqual(purchasePrintedRounding(found,{}, {},calculated).calculated,calculated);
});
test("explicit printed negative adjustments remain unchanged",()=>{
  const line={...calculated,quantity:5,unitCost:3.87,discount3:-.05};
  const result=purchasePrintedRounding(found,{printedNetAmount:19.37},{},line);
  assert.equal(result.calculated.netAmount,19.37);assert.equal(result.calculated.discount3,-.05);
});
test("transcribed 137177 rounding fixture sums printed cents across all thirteen rows",()=>{
  const quantities=[10,10,5,5,5,4,4,10,4,10,5,30,5];
  const prices=[2.27,2.27,4.07,4.33,3.87,4.85,4.85,5.09,4.81,1.85,4.1,4.1,4.1];
  const nets=[22.69,22.69,20.35,21.65,19.37,19.42,19.42,50.92,19.24,18.5,20.51,123.04,20.51];
  const rows=nets.map((net,index)=>purchasePrintedRounding(found,{printedNetAmount:net},{},{...calculated,quantity:quantities[index],unitCost:prices[index],discount3:index===4?-.05:0}).calculated);
  assert.equal(Math.round(rows.reduce((sum,row)=>sum+row.netAmount,0)*100),39831);
  assert.equal(rows.reduce((sum,row)=>sum+row.quantity,0),107);
  assert.deepEqual(rows.map(row=>row.unitCost),prices);
});
