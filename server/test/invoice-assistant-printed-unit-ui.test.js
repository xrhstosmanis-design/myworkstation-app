// Exercises the production client helpers and native select behavior in isolation.
// Hand-transcribed invoice values are regression fixtures, not OCR replay or USER PASS.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {JSDOM} from "jsdom";
import {invoicePrintedRounding} from "../../shared/invoice-printed-rounding.mjs";

const source=readFileSync(new URL("../../client/src/invoice-assistant-pos-client.js",import.meta.url),"utf8");
const context=vm.createContext({invoicePrintedRounding});
vm.runInContext(source.slice(0,source.indexOf("const api=")).replace(/^import .*;$/gm,"")+"\nglobalThis.helpers={normalizePrintedUnit,validPrinted,printedReviewIssue,tableInput,rowAmounts};",context);
const {normalizePrintedUnit,validPrinted,printedReviewIssue,tableInput,rowAmounts}=context.helpers;
const base={description:"HARIBO FRUIT 100G",quantity:"2",unitCost:"0.95",discount1:String(100*.10/1.90),discount2:"0",discount3:"0",exciseTotal:"0",vatRate:"13",netAmount:"1.80",grossAmount:"2.03",stockUnitsPerInvoiceUnit:"1",confidence:"certain"};
const selectValue=line=>{const dom=new JSDOM(tableInput(line,0,"invoiceUnit"));try{return dom.window.document.querySelector("select").value;}finally{dom.window.close();}};

test("known printed piece units are canonical before validation and agree with the displayed select",()=>{
  for(const raw of ["PIECE","ΤΜ","ΤΜΧ","Τεμ."," ΤΕΜ. ","ΤΕΜΑΧΙΟ","ΤΕΜΑΧΙΑ","τεμάχιο","τεμάχια","TM.","TMX","TEM","PC","PCS."]){
    const line={...base,invoiceUnit:normalizePrintedUnit(raw)};
    assert.equal(line.invoiceUnit,"PIECE",raw);
    assert.equal(selectValue(line),line.invoiceUnit,raw);
    assert.equal(validPrinted(line,true),true,raw);
    assert.equal(printedReviewIssue(line),"",raw);
    assert.equal(line.quantity,"2");assert.equal(rowAmounts(line).net,1.8);
  }
});
test("unknown or missing units remain visibly unselected and cannot be applied",()=>{
  for(const raw of ["KG","ΛΙΤΡΟ","","PIECES?","ΤΕΜ/ΚΙΒ"]){
    const line={...base,invoiceUnit:normalizePrintedUnit(raw)};
    assert.equal(selectValue(line),"",raw);
    assert.equal(validPrinted(line,true),false,raw);
    assert.match(printedReviewIssue(line),/μονάδα/);
  }
});
test("SET and package aliases retain the explicit package factor requirement",()=>{
  for(const raw of ["ΣΕΤ","SET.","ΠΑΚ.","ΚΙΒ.","BOX","PACKAGE"]){
    const line={...base,invoiceUnit:normalizePrintedUnit(raw),stockUnitsPerInvoiceUnit:""};
    assert.equal(line.invoiceUnit,"PACKAGE",raw);assert.equal(selectValue(line),"PACKAGE");
    assert.equal(validPrinted(line,true),false);
    line.stockUnitsPerInvoiceUnit="3";assert.equal(validPrinted(line,true),true);
    assert.equal(Number(line.quantity)*Number(line.stockUnitsPerInvoiceUnit),6);
    assert.equal(rowAmounts(line).net,1.8);
  }
});
test("HARIBO 13-row fixture retains 55 printed pieces, discounts and accepted cent rounding",()=>{
  const rows=[[2,.95,1.80,2.03],[2,.95,1.80,2.03],[3,1.21,3.45,3.90],[3,1.67,4.76,5.38],[3,1.67,4.76,5.38],[3,.95,2.71,3.06],[3,1.67,4.76,5.38],[4,.95,3.61,4.08],[5,.88,4.18,4.72],[5,.95,4.51,5.10],[7,.95,6.32,7.14],[7,.95,6.32,7.14],[8,.95,7.22,8.17]].map(([quantity,unitCost,netAmount,grossAmount])=>({...base,quantity:String(quantity),unitCost:String(unitCost),netAmount:String(netAmount),grossAmount:String(grossAmount),discount1:String(100*(1-netAmount/(quantity*unitCost))),invoiceUnit:normalizePrintedUnit("ΤΕΜ.")}));
  assert.equal(rows.length,13);assert.equal(rows.reduce((sum,line)=>sum+Number(line.quantity),0),55);
  assert.ok(rows.every(line=>validPrinted(line,true)));
  const cents=rows.reduce((sum,line)=>sum+Math.round(rowAmounts(line).gross*100),0);
  assert.equal(cents,6350);assert.equal(Math.abs(cents-6351),1);
  assert.equal(Math.round(rows.reduce((sum,line)=>sum+rowAmounts(line).net,0)*100),5620);
  assert.equal(validPrinted({...rows[0],grossAmount:"2.10"},true),false);
  assert.equal(validPrinted({...rows[0],description:""},true),false);
  assert.equal(validPrinted({...rows[0],stockUnitsPerInvoiceUnit:"0"},true),false);
});
