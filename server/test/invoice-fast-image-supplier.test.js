import test from "node:test";
import assert from "node:assert/strict";
import {hasConflictingFastSuppliers,knownSupplierFromFastHeaders} from "../../client/src/lib/invoice-fast-supplier-match.js";

const issuer={id:"issuer",taxId:"999211633"};
const other={id:"other",taxId:"094154647"};
const suppliers=[issuer,other];
const conflict=headers=>hasConflictingFastSuppliers(headers,suppliers);

test("different OCR tax IDs conflict in either order",()=>{
  const pages=[{supplierTaxId:issuer.taxId},{supplierTaxId:other.taxId}];
  assert.equal(conflict(pages),true);
  assert.equal(conflict([...pages].reverse()),true);
});

test("matching IDs and equivalent formatted VAT agree with partial headers",()=>{
  const pages=[{supplierId:issuer.id},{supplierTaxId:"EL 999 211 633"},{}];
  assert.equal(conflict(pages),false);
  assert.equal(knownSupplierFromFastHeaders(pages,suppliers),issuer);
});

test("supplier ID and a different VAT conflict across or within pages",()=>{
  assert.equal(conflict([{supplierId:issuer.id},{supplierTaxId:other.taxId}]),true);
  assert.equal(conflict([{supplierId:issuer.id,supplierTaxId:other.taxId},{}]),true);
  assert.equal(conflict([{supplierId:issuer.id},{supplierId:other.id}]),true);
});

test("name-only and incomplete VAT headers do not invent a conflict",()=>{
  assert.equal(conflict([{supplierTaxId:"9992116"},{supplierName:"Issuer"}]),false);
  assert.equal(conflict([{supplierTaxId:issuer.taxId},null]),false);
});
