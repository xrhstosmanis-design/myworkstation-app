import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {exactLearnedInvoiceCandidate,hasLearnedInvoiceIdentity} from "../src/lib/invoice-learning-exact-document.js";

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

test("exact learned invoice can recover a lost POS header total safely",()=>{
  const learned={id:"learned-38001",status:"LEARNED",supplierTaxId:"053939069",supplierName:"ΜΑΝΤΖΑΒΑΣ ΣΠΥΡΙΔΩΝ ΗΛΙΑΣ",invoiceNo:"38001",lines:[line({description:"LIFE 9 ΦΡΟΥΤΑ ΜΠΟΥΚΑΛ 400ML",quantity:1,unitPrice:1.74,discount1:0,netValue:1.74,vatRate:0})]};
  const result=exactLearnedInvoiceCandidate(state(learned),{supplier:{taxId:"053939069",name:"ΜΑΝΤΖΑΒΑΣ ΣΠΥΡΙΔΩΝ ΗΛΙΑΣ"},documentNumber:"38001",totalGross:0});
  assert.ok(result);
  assert.equal(result.lines[0].quantity,1);
  assert.equal(result.learnedGross,1.74);
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

test("TALOS learned identity survives arithmetic rejection without matching another invoice",()=>{
  const learned={id:"talos",status:"LEARNED",supplierTaxId:"800802293",invoiceNo:"01T00125909",lines:[line({netValue:13,vatRate:13})]};
  const args={supplier:{taxId:"800802293"},documentNumber:"01T00125909",totalGross:252.06};
  assert.equal(exactLearnedInvoiceCandidate(state(learned),args),null);
  assert.equal(hasLearnedInvoiceIdentity(state(learned),args),true);
  assert.equal(hasLearnedInvoiceIdentity(state(learned),{...args,documentNumber:"01T00125910"}),false);
  assert.equal(hasLearnedInvoiceIdentity(state(learned),{...args,supplier:{taxId:"000000000"}}),false);
  const route=fs.readFileSync(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");
  const reread=fs.readFileSync(new URL("../src/routes/commerce-pos-ai-recheck.js",import.meta.url),"utf8");
  assert.match(route,/hasLearnedInvoiceIdentity\(workspaceRows\?\.\[0\]\?\.state/);
  assert.match(reread,/hasLearnedInvoiceIdentity\(workspaceRows\?\.\[0\]\?\.state/);
  assert.match(route,/POS_LEARNED_INVOICE_MISMATCH/);
  assert.match(reread,/POS_LEARNED_INVOICE_MISMATCH/);
});

test("TALOS printed series resolves the centrally learned numeric document across stores",()=>{
  const learned={id:"talos-125909",status:"LEARNED",supplierTaxId:"800802293",invoiceNo:"00125909",lines:[line({quantity:1,unitPrice:223.05,discount1:0,netValue:223.05,vatRate:13})]};
  const request={supplier:{taxId:"800802293"},documentNumber:"01T00125909",totalGross:252.06};
  const result=exactLearnedInvoiceCandidate(state(learned),request);
  assert.ok(result);
  assert.equal(result.documentId,"talos-125909");
  assert.equal(result.lines[0].unitCost,223.05);
  assert.equal(hasLearnedInvoiceIdentity(state(learned),request),true);
  assert.equal(exactLearnedInvoiceCandidate(state(learned),{...request,documentNumber:"01T00125910"}),null);
  assert.equal(exactLearnedInvoiceCandidate(state(learned),{...request,supplier:{taxId:"000000000"}}),null);
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

test("exact Learning result bypasses generic OCR profile mutation",()=>{
  const source=fs.readFileSync(new URL("../src/routes/commerce-pos-ai-recheck.js",import.meta.url),"utf8");
  const exactBoundary=source.indexOf("if(parsed.exactLearningDocumentApplied===true)");
  const genericProfile=source.indexOf('failureStage="apply-supplier-profile-initial"');
  assert.ok(exactBoundary>0&&genericProfile>exactBoundary);
  const block=source.slice(exactBoundary,genericProfile);
  assert.match(block,/parsed\.posExactLearningFinal=true/);
  assert.match(block,/status"='AI_COMPLETE'/);
  assert.match(block,/CENTRAL_LEARNING_EXACT_INVOICE/);
  assert.match(block,/return res\.json/);
});
