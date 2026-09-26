import assert from "node:assert/strict";
import test from "node:test";
import {assistantRowsToProductLines} from "../src/lib/pos-invoice-assistant-reading.js";

const line=(overrides={})=>({page:"1",rawText:"001 ΚΑΦΕΣ 2 1,00 2,00 13% 2,26",code:"001",description:"ΚΑΦΕΣ",quantity:"2",unit:"PIECE",unitsPerPackage:"1",unitCost:"1",discount1:"0",discount2:"0",discount3:"0",netAmount:"2",exciseTotal:"0",vatRate:"13",grossAmount:"2.26",confidence:"certain",...overrides});
const reading=(overrides={})=>({expectedPageCount:1,visiblePageNumbers:[1],printedTotal:"2.26",lines:[line()],...overrides});

test("assistant maps a complete physical line into the existing POS draft format",()=>{
  const rows=assistantRowsToProductLines(reading(),{pageCount:1,totalGross:2.26});
  assert.equal(rows.length,1);
  assert.equal(rows[0].quantity,2);
  assert.equal(rows[0].sourceColumnsVerified,true);
  assert.equal(rows[0].sourceFileIndex,0);
});

test("assistant cannot fill a draft when only page two of two is visible",()=>{
  assert.throws(()=>assistantRowsToProductLines(reading({expectedPageCount:2,visiblePageNumbers:[2]}),{pageCount:1,totalGross:2.26}),/όλες τις φυσικές σελίδες/);
});

test("one unnumbered full sheet can fill the existing draft",()=>{
  const rows=assistantRowsToProductLines(reading({expectedPageCount:0,visiblePageNumbers:[],singlePageComplete:true}),{pageCount:1,totalGross:2.26});
  assert.equal(rows.length,1);
  assert.equal(rows[0].sourceColumnsVerified,true);
});

test("one complete sheet marked page 1 without a printed page count can fill the draft",()=>{
  const rows=assistantRowsToProductLines(reading({expectedPageCount:0,visiblePageNumbers:[1],singlePageComplete:true}),{pageCount:1,totalGross:2.26});
  assert.equal(rows.length,1);
});

test("one unnumbered sheet with unverified footer cannot fill the draft",()=>{
  assert.throws(()=>assistantRowsToProductLines(reading({expectedPageCount:0,visiblePageNumbers:[],singlePageComplete:false}),{pageCount:1,totalGross:2.26}),/όλες τις φυσικές σελίδες/);
});

test("matching header total does not conceal a wrong physical row",()=>{
  assert.throws(()=>assistantRowsToProductLines(reading({lines:[line({quantity:"3"})]}),{pageCount:1,totalGross:2.26}),/αριθμητική/);
});

test("printed invoice quantity stays separate from stock package conversion",()=>{
  const rows=assistantRowsToProductLines(reading({printedTotal:"5424",lines:[line({rawText:"001 ΚΑΦΕΣ 48 ΠΑΚ 100 100,00 4800,00 13% 5424,00",quantity:"48",unit:"PACKAGE",unitsPerPackage:"100",unitCost:"100",netAmount:"4800",grossAmount:"5424"})]}),{pageCount:1,totalGross:5424});
  assert.equal(rows[0].quantity,48);
  assert.equal(rows[0].unitsPerPackage,100);
  assert.equal(rows[0].unit,"PACKAGE");
});


test("printed quantity catches an omitted physical row even when payable matches",()=>{
  assert.throws(()=>assistantRowsToProductLines(reading({printedQuantityTotal:"3"}),{pageCount:1,totalGross:2.26}),/τυπωμένες ποσότητες/);
});

test("printed net catches a description-only reading",()=>{
  assert.throws(()=>assistantRowsToProductLines(reading({printedNetTotal:"3.00"}),{pageCount:1,totalGross:2.26}),/καθαρές αξίες/);
});

test("fixed basket discount preserves original price and printed percentage",()=>{
  const item=line({rawText:"001 ΡΟΛΟ 2 1,270 0,23 1,040 18% 1,70 13%",unitCost:"1.27",unitDiscountAmount:"0.23",discount1:"18",netAmount:"1.70",grossAmount:"1.92"});
  const [mapped]=assistantRowsToProductLines(reading({printedTotal:"1.92",printedQuantityTotal:"2",printedNetTotal:"1.70",lines:[item]}),{pageCount:1,totalGross:1.92});
  assert.equal(mapped.unitCost,1.27);
  assert.ok(Math.abs(mapped.discount1-0.23/1.27*100)<1e-8);
  assert.equal(mapped.discount2,18);
});
