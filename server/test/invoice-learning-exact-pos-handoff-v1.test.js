import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {exactLearnedInvoiceCandidate} from "../src/lib/invoice-learning-exact-document.js";

const line=(overrides={})=>({status:"CONFIRMED",supplierItemCode:"720547",description:"ΚΑΘΗΜΕΡΙΝΑ ΦΡΕΣΚΟ ΓΑΛΑ ΠΛΗΡΕΣ 1LT",quantity:2,unit:"ΤΜΧ",unitPrice:1.74,discount1:10,discount2:0,discount3:0,netValue:3.13,vatRate:13,...overrides});
const state=document=>({documents:[document]});

test("exact learned invoice is replayed only with verified arithmetic",()=>{
  const result=exactLearnedInvoiceCandidate(state({id:"learned-28897",status:"LEARNED",supplierTaxId:"053354239",supplierName:"ΣΑΤΤΑΣ ΧΑΡΑΛΑΜΠΟΣ ΕΥΘΥΜΙΟΣ",invoiceNo:"28897",sourceGrossAmount:3.54,updatedAt:"2026-09-21T09:00:00Z",lines:[line()]}),{supplier:{taxId:"053354239",name:"ΣΑΤΤΑΣ ΧΑΡΑΛΑΜΠΟΣ ΕΥΘΥΜΙΟΣ"},documentNumber:"28897",totalGross:3.54});
  assert.ok(result);
  assert.equal(result.lines[0].quantity,2);
  assert.equal(result.lines[0].discount1,10);
  assert.equal(result.lines[0].vatRate,13);
  assert.equal(result.lines[0].grossAmount,3.5369);
  assert.equal(result.lines[0].sourceColumnsVerified,true);
});

test("different invoice identity cannot reuse learned economics",()=>{
  const learned={id:"learned-28897",status:"LEARNED",supplierTaxId:"053354239",invoiceNo:"28897",sourceGrossAmount:3.54,lines:[line()]};
  assert.equal(exactLearnedInvoiceCandidate(state(learned),{supplier:{taxId:"053354239"},documentNumber:"28898",totalGross:3.54}),null);
  assert.equal(exactLearnedInvoiceCandidate(state(learned),{supplier:{taxId:"000000000"},documentNumber:"28897",totalGross:3.54}),null);
  assert.equal(exactLearnedInvoiceCandidate(state(learned),{supplier:{taxId:"053354239"},documentNumber:"28897",totalGross:9.99}),null);
});

test("partial or unbalanced learning documents fail closed",()=>{
  const base={id:"learned-28897",status:"LEARNED",supplierTaxId:"053354239",invoiceNo:"28897",sourceGrossAmount:3.54};
  assert.equal(exactLearnedInvoiceCandidate(state({...base,lines:[line({status:"REVIEW"})]}),{supplier:{taxId:"053354239"},documentNumber:"28897",totalGross:3.54}),null);
  assert.equal(exactLearnedInvoiceCandidate(state({...base,lines:[line({netValue:2.25})]}),{supplier:{taxId:"053354239"},documentNumber:"28897",totalGross:3.54}),null);
});

test("DELTA 28897 preserves the photographed quantities and discounts",()=>{
  const rows=[
    ["720547",2,1.74,10,3.13],["720550",1,1.74,10,1.57],["720449",3,2.07,10,5.59],
    ["720558",6,1.58,10,8.53],["720116",3,1.47,10,3.97],["720599",3,2.00,10,5.40],
    ["720598",3,2.00,10,5.40],["720519",2,2.69,10,4.84],["720563",4,1.12,10,4.03],
    ["730437",3,1.60,15,4.08],["730430",1,1.38,15,1.17]
  ];
  const learned={
    id:"delta-28897",status:"LEARNED",supplierTaxId:"053354239",supplierName:"ΣΑΤΤΑΣ ΧΑΡΑΛΑΜΠΟΣ ΕΥΘΥΜΙΟΣ",
    invoiceNo:"28897",sourceGrossAmount:53.91,updatedAt:"2026-09-21T09:00:00Z",
    lines:rows.map(([code,quantity,unitPrice,discount1,netValue])=>({status:"CONFIRMED",supplierItemCode:code,description:`DELTA ${code}`,quantity,unitPrice,discount1,discount2:0,discount3:0,netValue,vatRate:13}))
  };
  const result=exactLearnedInvoiceCandidate(state(learned),{supplier:{taxId:"053354239",name:"ΣΑΤΤΑΣ ΧΑΡΑΛΑΜΠΟΣ ΕΥΘΥΜΙΟΣ"},documentNumber:"28897",totalGross:53.91});
  assert.ok(result);
  assert.equal(result.lines.length,11);
  assert.deepEqual(result.lines.map(row=>row.quantity),[2,1,3,6,3,3,3,2,4,3,1]);
  assert.deepEqual(result.lines.map(row=>row.discount1),[10,10,10,10,10,10,10,10,10,15,15]);
  assert.ok(Math.abs(result.learnedGross-53.91)<=.05);
  assert.deepEqual(result.vatSummary.map(row=>row.rate),[13]);
});

test("confirmed line arithmetic overrides a stale OCR header total",()=>{
  const rows=[
    ["720547",2,1.74,10,3.13],["720550",1,1.74,10,1.57],["720449",3,2.07,10,5.59],
    ["720558",6,1.58,10,8.53],["720116",3,1.47,10,3.97],["720599",3,2.00,10,5.40],
    ["720598",3,2.00,10,5.40],["720519",2,2.69,10,4.84],["720563",4,1.12,10,4.03],
    ["730437",3,1.60,15,4.08],["730430",1,1.38,15,1.17]
  ];
  const learned={
    id:"delta-28897-stale-total",status:"LEARNED",supplierTaxId:"053354239",invoiceNo:"28897",
    sourceGrossAmount:55.25,
    lines:rows.map(([code,quantity,unitPrice,discount1,netValue])=>({status:"CONFIRMED",supplierItemCode:code,description:`DELTA ${code}`,quantity,unitPrice,discount1,discount2:0,discount3:0,netValue,vatRate:13}))
  };
  const result=exactLearnedInvoiceCandidate(state(learned),{supplier:{taxId:"053354239"},documentNumber:"28897",totalGross:53.91});
  assert.ok(result,"the stale OCR header must not hide a fully reconciled learned table");
  assert.equal(result.lines.length,11);
  assert.ok(Math.abs(result.learnedGross-53.91)<=.05);
});

test("POS persistence rechecks the exact central Learning invoice",()=>{
  const source=fs.readFileSync(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");
  assert.match(source,/exactLearnedInvoiceCandidate\(workspaceRows\?\.\[0\]\?\.state/);
  assert.match(source,/if\(exactLearning\)lines=exactLearning\.lines/);
  assert.ok(source.indexOf("if(exactLearning)lines=exactLearning.lines")<source.indexOf("stage=\"match-products\""),"learned rows must replace OCR before product matching and persistence");
});
