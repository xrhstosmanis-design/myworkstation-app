import test from "node:test";
import assert from "node:assert/strict";
import {mergeFastInvoiceHeaders} from "../../client/src/lib/invoice-fast-header-merge.js";

const subtotal={totalGross:120};
const payable={totalGross:496,totalGrossVerified:true};
const merge=imageHeaders=>mergeFastInvoiceHeaders(imageHeaders,{imageHeaders});

test("a uniquely verified photo total wins in either upload order",()=>{
  for(const pages of [[subtotal,payable],[payable,subtotal]]){
    const result=merge(pages);
    assert.equal(result.totalHeader,payable);
    assert.equal(result.totalNeedsReview,false);
  }
});

test("different unverified or competing verified totals require review",()=>{
  for(const pages of [
    [subtotal,{totalGross:496}],
    [{totalGross:496},subtotal],
    [{...subtotal,totalGrossVerified:true},payable],
    [payable,{...subtotal,totalGrossVerified:true}]
  ]){
    const result=merge(pages);
    assert.equal(result.totalHeader,null);
    assert.equal(result.totalNeedsReview,true);
  }
});

test("previous photo candidates are used even when only an added page was read",()=>{
  const result=mergeFastInvoiceHeaders([subtotal],{imageHeaders:[payable,subtotal]});
  assert.equal(result.totalHeader,payable);
});

test("equal amounts and a single verified candidate remain available",()=>{
  assert.equal(merge([subtotal,{totalGross:"120.00"}]).totalHeader,subtotal);
  assert.equal(merge([{totalGross:0},payable]).totalHeader,payable);
});

test("ordinary non-photo calls and the established Stefanidis rule keep their behavior",()=>{
  assert.equal(mergeFastInvoiceHeaders([payable,subtotal]).totalHeader,subtotal);
  assert.equal(merge([{...payable,supplierTaxId:"998878583"},subtotal]).totalHeader.totalGross,496);
});

test("the existing balanced payable proof ignores an unrelated receipt or balance",async()=>{
  const {recoverBalancedInvoicePayable}=await import("../src/lib/invoice-total-reading.js");
  assert.equal(recoverBalancedInvoicePayable("ΜΕΡΙΚΟ ΣΥΝΟΛΟ 120,00"),0);
  assert.equal(recoverBalancedInvoicePayable("ΚΑΘΑΡΗ ΑΞΙΑ 400,00 ΦΠΑ 96,00 ΠΛΗΡΩΤΕΟ 496,00 ΠΡΟΗΓΟΥΜΕΝΟ ΥΠΟΛΟΙΠΟ 19,00"),496);
  assert.equal(recoverBalancedInvoicePayable("ΚΑΘΑΡΗ ΑΞΙΑ 400,00 ΦΠΑ 96,00 ΑΠΟΔΕΙΞΗ ΕΙΣΠΡΑΞΗΣ ΠΛΗΡΩΤΕΟ 496,00"),0);
  assert.equal(recoverBalancedInvoicePayable("ΚΑΘΑΡΗ ΑΞΙΑ 400,00 ΦΠΑ 96,00 ΠΛΗΡΩΤΕΟ 120,00"),0);
});

test("a lone unverified amount in a multi-image read requires review",()=>{
  for(const pages of [[subtotal,{}],[{},subtotal],[subtotal]]){
    const result=merge(pages);
    assert.equal(result.totalHeader,null);
    assert.equal(result.totalNeedsReview,true);
  }
  assert.equal(merge([{},{}]).totalNeedsReview,false);
  assert.equal(mergeFastInvoiceHeaders([subtotal]).totalHeader,subtotal);
});

test("a labeled VAT table row verifies the explicit payable",async()=>{
  const {recoverBalancedInvoicePayable}=await import("../src/lib/invoice-total-reading.js");
  const table="ΚΑΘΑΡΗ ΑΞΙΑ Φ.Π.Α. % ΑΞΙΑ Φ.Π.Α. ΣΥΝΟΛ. ΑΞΙΑ";
  assert.equal(recoverBalancedInvoicePayable(`${table} 100,00 24,00 24,00 124,00 ΓΕΝΙΚΟ ΣΥΝΟΛΟ 124,00 ΠΛΗΡΩΤΕΟ € 124,00`),124);
  assert.equal(recoverBalancedInvoicePayable(`${table} 100,00 0,00 0,00 100,00 ΠΛΗΡΩΤΕΟ 100,00`),100);
  assert.equal(recoverBalancedInvoicePayable(`${table} 100,00 13,00 24,00 124,00 ΠΛΗΡΩΤΕΟ 124,00`),0);
  assert.equal(recoverBalancedInvoicePayable(`${table} 100,00 24,00 24,00 124,00 ΠΛΗΡΩΤΕΟ 120,00`),0);
  assert.equal(recoverBalancedInvoicePayable(`${table} 100,00 24,00 24,00 124,00 ΑΠΟΔΕΙΞΗ ΕΙΣΠΡΑΞΗΣ ΠΛΗΡΩΤΕΟ 124,00`),0);
});
