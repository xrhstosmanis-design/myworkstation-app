import test from "node:test";
import assert from "node:assert/strict";
import {knownSupplierFromFastHeaders} from "./invoice-fast-supplier-match.js";

test("POS resolves the issuer VAT from a later page against its loaded suppliers",()=>{
  const suppliers=[{id:"known",name:"ΜΕΛΟΣ ΓΕΩΡΓΙΟΣ",taxId:"EL 997886929"}];
  assert.equal(knownSupplierFromFastHeaders([{supplierName:"ΜΕΛΟΣ"},{supplierTaxId:"997886929"}],suppliers),suppliers[0]);
});

test("POS does not guess a supplier when the VAT is absent or duplicated",()=>{
  const suppliers=[{id:"one",taxId:"997886929"},{id:"two",taxId:"EL997886929"}];
  assert.equal(knownSupplierFromFastHeaders([{supplierTaxId:"997886929"}],suppliers),null);
  assert.equal(knownSupplierFromFastHeaders([{supplierTaxId:"997886928"}],suppliers),null);
});
