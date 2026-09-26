import assert from "node:assert/strict";
import test from "node:test";
import {assistantRowsToProductLines} from "../src/lib/pos-invoice-assistant-reading.js";
import {invoiceAssistantDiscounts} from "../src/lib/invoice-assistant-discounts.js";

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
  assert.ok(Math.abs(mapped.discount1-0.23/1.27*100)<0.5);
  assert.equal(mapped.discount2,18);
  assert.ok(Math.abs(mapped.quantity*mapped.unitCost*(1-mapped.discount1/100)*(1-mapped.discount2/100)-1.70)<1e-8);
});

test("cent-rounded printed net survives the draft percentage calculation across many lines",()=>{
  const rows=Array.from({length:18},()=>({quantity:2,unitCost:1.27,unitDiscountAmount:0.23,printedDiscounts:[18,0,0],netAmount:1.70}));
  const calculated=rows.reduce((sum,row)=>{
    const discounts=invoiceAssistantDiscounts(row);
    assert.equal(discounts[1],18);
    return sum+row.quantity*row.unitCost*discounts.reduce((factor,value)=>factor*(1-value/100),1);
  },0);
  assert.ok(Math.abs(calculated-18*1.70)<1e-8);
});

test("an incorrect printed net cannot be used to tune a basket discount",()=>{
  const discounts=invoiceAssistantDiscounts({quantity:2,unitCost:1.27,unitDiscountAmount:0.23,printedDiscounts:[18,0,0],netAmount:1.55});
  assert.ok(Math.abs(discounts[0]-0.23/1.27*100)<1e-8);
});

test("small gross rounding noise across a full table uses net, excise and VAT before footer comparison",()=>{
  const lines=Array.from({length:18},()=>line({grossAmount:"2.27"}));
  const rows=assistantRowsToProductLines(reading({printedTotal:"40.68",printedQuantityTotal:"36",printedNetTotal:"36.00",lines}),{pageCount:1,totalGross:40.68});
  assert.equal(rows.length,18);
  assert.ok(Math.abs(rows.reduce((sum,row)=>sum+row.grossAmount,0)-40.68)<0.000001);
});

test("material gross contradiction in one row cannot be repaired by the footer",()=>{
  assert.throws(()=>assistantRowsToProductLines(reading({lines:[line({grossAmount:"2.40"})]}),{pageCount:1,totalGross:2.26}),/μικτή αξία της γραμμής/);
});

test("printed whole-line discount preserves the first physical row economics",()=>{
  const item=line({rawText:"703177 ΓΑΛΟΠΟΥΛΑ 3 1,5900 4,77 1,91 2,86 13%",code:"703177",description:"ΓΑΛΟΠΟΥΛΑ",quantity:"3",unitCost:"1.59",lineDiscountAmount:"1.91",netAmount:"2.86",grossAmount:"3.23"});
  const [row]=assistantRowsToProductLines(reading({printedTotal:"3.23",printedQuantityTotal:"3",printedNetTotal:"2.86",lines:[item]}),{pageCount:1,totalGross:3.23});
  assert.equal(row.unitCost,1.59);
  assert.ok(Math.abs(row.discount1-(1.91/4.77*100))<0.1);
  assert.ok(Math.abs(row.quantity*row.unitCost*(1-row.discount1/100)-2.86)<0.000001);
});

test("contradictory printed whole-line discount remains blocked",()=>{
  const item=line({rawText:"703177 ΓΑΛΟΠΟΥΛΑ 3 1,5900 4,77 1,91 2,86 13%",code:"703177",description:"ΓΑΛΟΠΟΥΛΑ",quantity:"3",unitCost:"1.59",lineDiscountAmount:"1.00",netAmount:"2.86",grossAmount:"3.23"});
  assert.throws(()=>assistantRowsToProductLines(reading({printedTotal:"3.23",lines:[item]}),{pageCount:1,totalGross:3.23}),/τυπωμένη έκπτωση/);
});
