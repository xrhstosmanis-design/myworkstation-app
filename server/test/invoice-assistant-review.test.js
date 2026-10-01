import test from "node:test";
import assert from "node:assert/strict";
import {assessInvoicePages,fillMissingPrintedGross,hasEquivalentPrintedEconomics,invoicePageReviewChecks,invoiceHumanQuantityReview,parsePrintedPayable} from "../src/routes/invoice-assistant-review.js";
import {invoiceQuantityConfirmation} from "../../shared/invoice-quantity-review.mjs";

test("contradictory printed quantity requires all rows and explicit human confirmation",()=>{
  const quantities=[30,5,10,3,5,5,5],nets=[39,8.5,14,7.5,10,17,7.5];
  const printedLines=quantities.map((quantity,index)=>({quantity:String(quantity),netAmount:String(nets[index]),grossAmount:String(nets[index]*1.13)}));
  const input={expectedPageCount:1,visiblePageNumbers:[1],sourcePageCount:1,printedLines,printedTotal:116.96,printedQuantityTotal:"19",printedNetTotal:"103.50"};
  const review=invoiceHumanQuantityReview(input);
  assert.equal(review.reviewReady,true);assert.equal(review.quantityReviewRequired,true);
  assert.equal(review.checks.quantityAgrees,false);assert.equal(review.checks.quantitySum,63);
  assert.equal(assessInvoicePages(input),false); // automatic strict assessment remains unchanged
  assert.equal(invoiceQuantityConfirmation(printedLines,"19",{selectedCount:7}).allowed,false);
  assert.equal(invoiceQuantityConfirmation(printedLines,"19",{confirmed:true,selectedCount:6}).allowed,false);
  assert.equal(invoiceQuantityConfirmation(printedLines,"19",{confirmed:true,selectedCount:7}).allowed,true);
  assert.equal(invoiceQuantityConfirmation(printedLines,"63",{selectedCount:0}).required,false);
  assert.equal(invoiceQuantityConfirmation([{quantity:""}],"19",{confirmed:true,selectedCount:1}).allowed,false);
  for(const bad of [{printedTotal:120},{printedNetTotal:"110"},{sourcePageCount:2},{visiblePageNumbers:[]},{printedQuantityTotal:"unreadable"},{printedLines:[{quantity:"",netAmount:"103.50",grossAmount:"116.96"}]}])assert.equal(invoiceHumanQuantityReview({...input,...bad}).reviewReady,false);
});

test("quantity confirmation cannot replace full evidence for unnumbered sheets",()=>{
  const input={expectedPageCount:0,visiblePageNumbers:[],sourcePageCount:2,documentNumber:"6538",unnumberedPageEvidence:[{imageIndex:1,documentNumber:"6538",fullPageVisible:true,printedTotalsVisible:false},{imageIndex:2,documentNumber:"6538",fullPageVisible:true,printedTotalsVisible:true}],printedLines:[{quantity:"63",netAmount:"103.50",grossAmount:"116.96"}],printedTotal:116.96,printedNetTotal:"103.50",printedQuantityTotal:"19"};
  assert.equal(invoiceHumanQuantityReview(input).quantityReviewRequired,true);
  for(const evidence of [input.unnumberedPageEvidence.slice(1),[{...input.unnumberedPageEvidence[0],fullPageVisible:false},input.unnumberedPageEvidence[1]],[input.unnumberedPageEvidence[0],{...input.unnumberedPageEvidence[1],printedTotalsVisible:false}],[input.unnumberedPageEvidence[0],{...input.unnumberedPageEvidence[1],documentNumber:"6539"}]])assert.equal(invoiceHumanQuantityReview({...input,unnumberedPageEvidence:evidence}).reviewReady,false);
});

test("printed payable accepts the invoice's three decimal currency format",()=>{
  assert.equal(parsePrintedPayable("173,680"),173.68);
  assert.equal(parsePrintedPayable("173.680"),173.68);
  assert.equal(parsePrintedPayable("173,43"),173.43);
  assert.equal(parsePrintedPayable(""),null);
  assert.equal(parsePrintedPayable("173,6800"),null);
});

test("a photographed page 2/2 cannot authorize deletion from a partial POS draft",()=>{
  assert.equal(assessInvoicePages({expectedPageCount:2,visiblePageNumbers:[2],sourcePageCount:1,printedLines:[{grossAmount:"43.91"}],printedTotal:111.32}),false);
  assert.equal(assessInvoicePages({expectedPageCount:1,visiblePageNumbers:[1],sourcePageCount:1,printedLines:[{grossAmount:"43.91"}],printedTotal:111.32}),false);
});

test("all photographed pages and matching line totals allow human review",()=>{
  assert.equal(assessInvoicePages({expectedPageCount:2,visiblePageNumbers:[1,2],sourcePageCount:2,printedLines:[{grossAmount:"67.41"},{grossAmount:"43.91"}],printedTotal:111.32}),true);
});

test("two unnumbered full sheets with the same invoice and reconciled printed totals allow review",()=>{
  const invoice={expectedPageCount:0,visiblePageNumbers:[],sourcePageCount:2,documentNumber:"52244",unnumberedPageEvidence:[
    {imageIndex:1,documentNumber:"52244",fullPageVisible:true,printedTotalsVisible:false},
    {imageIndex:2,documentNumber:"52244",fullPageVisible:true,printedTotalsVisible:true}
  ],printedLines:[{quantity:"64",netAmount:"90.00",grossAmount:"101.70"},{quantity:"46",netAmount:"63.70",grossAmount:"71.98"}],printedQuantityTotal:"110",printedNetTotal:"153.70",printedTotal:173.68};
  assert.equal(assessInvoicePages(invoice),true);
  assert.equal(assessInvoicePages({...invoice,printedTotal:null}),false);
  assert.equal(assessInvoicePages({...invoice,printedQuantityTotal:""}),false);
  assert.equal(assessInvoicePages({...invoice,printedLines:invoice.printedLines.slice(1)}),false);
  assert.equal(assessInvoicePages({...invoice,unnumberedPageEvidence:[invoice.unnumberedPageEvidence[1]]}),false);
  assert.equal(assessInvoicePages({...invoice,unnumberedPageEvidence:[invoice.unnumberedPageEvidence[0],{...invoice.unnumberedPageEvidence[1],documentNumber:"52245"}]}),false);
  assert.equal(assessInvoicePages({...invoice,unnumberedPageEvidence:[invoice.unnumberedPageEvidence[0],{...invoice.unnumberedPageEvidence[1],fullPageVisible:false}]}),false);
});


test("printed taxable net can include explicit excise without hiding a net mismatch",()=>{
  const lines=[{quantity:"77",netAmount:"280.93",exciseTotal:"64.14",grossAmount:"410.15"}];
  const invoice={expectedPageCount:1,visiblePageNumbers:[1],sourcePageCount:1,printedLines:lines,printedTotal:410.15,printedQuantityTotal:"77",printedNetTotal:"345.07"};
  assert.equal(assessInvoicePages(invoice),true);
  assert.equal(invoicePageReviewChecks(invoice).netSum,345.07);
  assert.equal(assessInvoicePages({...invoice,printedNetTotal:"280.93"}),true);
  assert.equal(assessInvoicePages({...invoice,printedNetTotal:"350.00"}),false);
  assert.equal(assessInvoicePages({...invoice,printedLines:[{...lines[0],exciseTotal:""}]}),false);
  assert.equal(assessInvoicePages({...invoice,printedTotal:420.15}),false);
});
test("printed quantity and net expose a missing row even if gross is copied from the footer",()=>{
  const invoice={expectedPageCount:1,visiblePageNumbers:[1],sourcePageCount:1,printedLines:[{quantity:"2",netAmount:"2.00",grossAmount:"2.26"}],printedTotal:2.26};
  assert.equal(assessInvoicePages({...invoice,printedQuantityTotal:"3",printedNetTotal:"2.00"}),false);
  assert.equal(assessInvoicePages({...invoice,printedQuantityTotal:"2",printedNetTotal:"3.00"}),false);
  assert.equal(assessInvoicePages({...invoice,printedQuantityTotal:"2",printedNetTotal:"2.00"}),true);
});

test("review reports the exact failing check without unlocking incomplete pages",()=>{
  const invoice={expectedPageCount:0,visiblePageNumbers:[1],sourcePageCount:1,printedLines:[{quantity:"2",netAmount:"1.70",grossAmount:"1.92"}],printedTotal:1.92,printedQuantityTotal:"2",printedNetTotal:"1.70"};
  assert.deepEqual(invoicePageReviewChecks(invoice),{pagesComplete:false,grossAgrees:true,quantityAgrees:true,netAgrees:true,grossSum:1.92,quantitySum:2,netSum:1.7});
  assert.equal(assessInvoicePages(invoice),false);
});

test("printed net and VAT supply an absent per-row gross when totals reconcile",()=>{
  const source=[{quantity:"2",netAmount:"1.70",exciseTotal:"0",vatRate:"13",grossAmount:""}];
  const lines=fillMissingPrintedGross(source,{printedNetTotal:"1.70",printedTotal:1.92});
  assert.equal(lines[0].grossAmount,"1.92");
  assert.equal(assessInvoicePages({expectedPageCount:1,visiblePageNumbers:[1],sourcePageCount:1,printedLines:lines,printedQuantityTotal:"2",printedNetTotal:"1.70",printedTotal:1.92}),true);
  assert.equal(source[0].grossAmount,"");
});

test("a supplied wrong gross or absent printed payable cannot be silently repaired",()=>{
  const wrong={netAmount:"1.70",exciseTotal:"0",vatRate:"13",grossAmount:"9.99"};
  assert.equal(fillMissingPrintedGross([wrong],{printedNetTotal:"1.70",printedTotal:1.92})[0].grossAmount,"9.99");
  assert.equal(fillMissingPrintedGross([{...wrong,grossAmount:""}],{printedNetTotal:"",printedTotal:null})[0].grossAmount,"");
  assert.equal(fillMissingPrintedGross([{...wrong,grossAmount:""}],{printedNetTotal:"",printedTotal:1.92})[0].grossAmount,"1.92");
});


test("an absent excise column permits zero excise only when explicitly confirmed",()=>{
  const line={netAmount:"77.08",exciseTotal:"",vatRate:"13",grossAmount:""};
  assert.equal(fillMissingPrintedGross([line],{printedTotal:87.10})[0].grossAmount,"");
  const filled=fillMissingPrintedGross([line],{printedTotal:87.10,exciseColumnAbsent:true})[0];
  assert.equal(filled.exciseTotal,"0");
  assert.equal(filled.grossAmount,"87.10");
});


test("equivalent unit discount and percent discount do not create false corrections",()=>{
  const saved={quantity:2,unitCost:2.26,netAmount:3.28,vatRate:13,grossAmount:3.71,discount1:11.50442,discount2:18};
  const printed={quantity:"2",unitCost:"2.260",netAmount:"3.28",vatRate:"13",grossAmount:"3.71",unitDiscountAmount:"0.26",discount2:"18"};
  assert.equal(hasEquivalentPrintedEconomics(saved,printed),true);
  assert.equal(hasEquivalentPrintedEconomics({...saved,netAmount:3.04},printed),false);
  assert.equal(hasEquivalentPrintedEconomics(saved,{...printed,grossAmount:""}),false);
});
