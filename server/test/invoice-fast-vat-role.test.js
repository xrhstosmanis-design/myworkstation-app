import test from "node:test";
import assert from "node:assert/strict";
import {reviewFastSupplierVat} from "../src/lib/invoice-fast-vat-role.js";

const header={supplierId:"s",supplierName:"Issuer",supplierTaxId:"999211633",totalGross:496,documentNumber:"001"};

test("distinct or missing recipient VAT preserves the candidate",()=>{
  for(const recipient of ["094154647","",undefined,"123"]){
    assert.equal(reviewFastSupplierVat(header,recipient,"999211633"),header);
  }
});

test("a recipient match clears supplier fields but retains other invoice fields",()=>{
  assert.deepEqual(reviewFastSupplierVat(header,"EL 999 211 633","999211633"),{
    ...header,supplierId:"",supplierName:"",supplierTaxId:"",supplierVatNeedsReview:true
  });
});

test("catalog normalization cannot hide a raw candidate equal to the recipient",()=>{
  const result=reviewFastSupplierVat(header,"094154647","094154647");
  assert.equal(result.supplierVatNeedsReview,true);
  assert.equal(result.supplierId,"");
});

test("a catalog VAT equal to the recipient also needs review",()=>{
  assert.equal(reviewFastSupplierVat(header,"999211633",undefined).supplierVatNeedsReview,true);
});
