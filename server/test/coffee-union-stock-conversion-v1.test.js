import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const runtime=await readFile(new URL("../src/lib/invoice-supplier-profile-runtime.js",import.meta.url),"utf8");
const context=vm.createContext({console});
vm.runInContext(runtime.replace(/^import .*;\n/gm,"").replaceAll("export async function","async function")+'\nthis.convert=applySupplierStockConversion;',context);
const {convert}=context;

test("Coffee Union converts kilograms to grams once without changing invoice economics",()=>{
  const line=convert({quantity:24,unitPrice:36.2,netAmount:571.24},{verified:true,discount1:34.25,invoiceUnit:"ΚΙΛΟ",stockUnit:"GR",stockConversion:{factor:1000,to:"GR"}});
  assert.equal(line.invoiceQuantity,24);assert.equal(line.quantity,24);assert.equal(line.unit,"ΚΙΛΟ");assert.equal(line.stockUnit,"GR");assert.equal(line.stockUnitsPerInvoiceUnit,1000);assert.equal(line.supplierProfileEvidence.stockQuantity,24000);assert.equal(line.unitPrice,36.2);assert.equal(line.netAmount,571.24);assert.equal(line.discount1,34.25);
});
test("Coffee Union converts a five-pack cup line to 500 pieces exactly once",()=>{
  const line=convert({quantity:5,unitPrice:5.3,netAmount:22.53},{verified:true,discount1:15,invoiceUnit:"ΠΑΚΕΤΟ",stockUnit:"ΤΜΧ",stockConversion:{factor:100,to:"PCS"}});
  assert.equal(line.invoiceQuantity,5);assert.equal(line.quantity,5);assert.equal(line.unit,"ΠΑΚΕΤΟ");assert.equal(line.stockUnit,"ΤΜΧ");assert.equal(line.stockUnitsPerInvoiceUnit,100);assert.equal(line.supplierProfileEvidence.stockQuantity,500);assert.equal(line.unitPrice,5.3);assert.equal(line.netAmount,22.53);
});

test("printed 25 percent survives the rounded 10.13 net amount",()=>{
  const line=convert({quantity:1,unitPrice:13.5,discount1:25,netAmount:10.13},
    {verified:true,discount1:99,invoiceUnit:'ΚΙΛΟ',stockUnit:'GR',stockConversion:{factor:1000}});
  assert.equal(line.discount1,25);
  assert.equal(line.quantity,1);
  assert.equal(line.netAmount,10.13);
});

test("current multiple discounts are not combined and then applied twice",()=>{
  const line=convert({quantity:2,unitPrice:100,discount1:10,discount2:5,discount3:2,netAmount:167.58},
    {verified:true,invoiceUnit:'ΚΙΛΟ',stockUnit:'GR',stockConversion:{factor:1000}});
  assert.equal(line.discount1,10);
  assert.equal(line.discount2,5);
  assert.equal(line.discount3,2);
  assert.equal(line.netAmount,167.58);
});
