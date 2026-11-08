import test from "node:test";
import assert from "node:assert/strict";
import {mergeFastInvoiceHeaders} from "../../client/src/lib/invoice-fast-header-merge.js";

const invoice={documentNumber:"00-172950",documentDate:"2026-11-05"};
const merge=imageHeaders=>mergeFastInvoiceHeaders(imageHeaders,{imageHeaders});

test("competing invoice numbers require review in either photo order",()=>{
  for(const other of [{documentNumber:"40001594112631"},{documentNumber:"05/11/2026 - 1001 - 92 - 9200300386"}]){
    for(const pages of [[invoice,other],[other,invoice]]){
      const result=merge(pages);
      assert.equal(result.documentNumberNeedsReview,true);
      assert.equal(result.documentHeader.documentNumber,"");
      assert.equal(result.documentHeader.documentDate,invoice.documentDate);
    }
  }
});

test("number and date from separate pages survive in either order",()=>{
  const number={documentNumber:invoice.documentNumber},date={documentDate:invoice.documentDate};
  for(const pages of [[number,date],[date,number]]){
    assert.deepEqual(merge(pages).documentHeader,invoice);
  }
});

test("matching, long and previously read invoice numbers are handled without truncation",()=>{
  assert.equal(merge([invoice,{documentNumber:" 00-172950 "}]).documentHeader.documentNumber,"00-172950");
  assert.equal(merge([{documentNumber:"40001594112631"},{}]).documentHeader.documentNumber,"40001594112631");
  const result=mergeFastInvoiceHeaders([{}],{imageHeaders:[invoice,{}]});
  assert.deepEqual(result.documentHeader,invoice);
});

test("legacy single-image and Stefanidis number handling remains available",()=>{
  assert.equal(mergeFastInvoiceHeaders([invoice]).documentHeader,invoice);
  const result=merge([{supplierTaxId:"998878583",documentNumber:"000172950"},{documentNumber:"172950"}]);
  assert.equal(result.documentHeader.documentNumber,"172950");
  assert.equal(result.documentNumberNeedsReview,false);
});
