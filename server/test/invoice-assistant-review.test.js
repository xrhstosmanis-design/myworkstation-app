import test from "node:test";
import assert from "node:assert/strict";
import {assessInvoicePages} from "../src/routes/invoice-assistant-review.js";

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
