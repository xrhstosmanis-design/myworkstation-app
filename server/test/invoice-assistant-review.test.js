import test from "node:test";
import assert from "node:assert/strict";
import {assessInvoicePages,fillMissingPrintedGross,invoicePageReviewChecks} from "../src/routes/invoice-assistant-review.js";

test("a photographed page 2/2 cannot authorize deletion from a partial POS draft",()=>{
  assert.equal(assessInvoicePages({expectedPageCount:2,visiblePageNumbers:[2],sourcePageCount:1,printedLines:[{grossAmount:"43.91"}],printedTotal:111.32}),false);
  assert.equal(assessInvoicePages({expectedPageCount:1,visiblePageNumbers:[1],sourcePageCount:1,printedLines:[{grossAmount:"43.91"}],printedTotal:111.32}),false);
});

test("all photographed pages and matching line totals allow human review",()=>{
  assert.equal(assessInvoicePages({expectedPageCount:2,visiblePageNumbers:[1,2],sourcePageCount:2,printedLines:[{grossAmount:"67.41"},{grossAmount:"43.91"}],printedTotal:111.32}),true);
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
