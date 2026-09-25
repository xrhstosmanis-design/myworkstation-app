import test from "node:test";
import assert from "node:assert/strict";
import {invoiceLineWithExcise,invoiceLineTaxAmounts} from "../src/lib/invoice-excise-intake.js";

test("Mantzilas line keeps printed excise separate from VAT",()=>{
  const line=invoiceLineWithExcise({quantity:1,netAmount:18.30,exciseTotal:7.49,vatRate:24,grossAmount:31.98});
  assert.deepEqual(invoiceLineTaxAmounts(line),{exciseTotal:7.49,vatAmount:6.19,grossAmount:31.98});
});

test("gross without printed amount includes excise before VAT",()=>{
  const line=invoiceLineWithExcise({quantity:1,netAmount:18.30,exciseTotal:7.49,vatRate:24});
  assert.equal(line.grossAmount,31.98);
});

test("ordinary VAT line remains unchanged",()=>{
  const line=invoiceLineWithExcise({quantity:2,netAmount:43.20,vatRate:13,grossAmount:48.82});
  assert.deepEqual(invoiceLineTaxAmounts(line),{exciseTotal:0,vatAmount:5.62,grossAmount:48.82});
});
