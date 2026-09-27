import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const source=fs.readFileSync(path.resolve(process.cwd(),"../client/src/components/commerce/installPurchaseOrdersSuite.js"),"utf8");
const functions=["discountDraft","calcDraft"].map(name=>{
  const start=source.indexOf(`function ${name}(`);
  const end=source.indexOf("\nfunction ",start+1);
  return source.slice(start,end<0?undefined:end);
}).join("\n");
const calc=vm.runInNewContext(`${functions}\ncalcDraft`,{
  enhanceDiscountEditor:()=>{},
  num:value=>Number(String(value).replace(",","."))||0,
  money:value=>Number(value).toFixed(2),
});

function form(pack){
  const fields=Object.fromEntries([
    ["quantity",5],["unitCost",6.326],["exciseTotal",0],["vatRate",13],
    ["markupPercent",50],["proposedSalePrice",0],["finalUnitCost",0],
    ...[1,2,3].flatMap(i=>[[`discount${i}`,0],[`discountAmount${i}`,0]]),
  ].map(([name,value])=>[name,{value:String(value)}]));
  const totals={"data-net-total":{textContent:""},"data-gross-total":{textContent:""}};
  return {fields,totals,elements:{invoiceUnit:{value:pack>1?"PACKAGE":"PIECE"},stockUnitsPerInvoiceUnit:{value:String(pack)}},
    querySelector(selector){const name=selector.match(/\[name=([^\]]+)\]/)?.[1];return name?fields[name]:totals[selector.match(/\[([^\]]+)\]/)?.[1]]},dataset:{}};
}

test("five packs of six price retail by piece while preserving invoice totals",()=>{
  const draft=form(6);
  calc(draft,"MARKUP");
  assert.equal(draft.fields.finalUnitCost.value,"1.054333");
  assert.equal(draft.fields.proposedSalePrice.value,"1.79");
  assert.equal(draft.totals["data-net-total"].textContent,"31.63");
  assert.equal(draft.totals["data-gross-total"].textContent,"35.74");
  draft.fields.proposedSalePrice.value="2.00";
  calc(draft,"RETAIL");
  assert.ok(Math.abs(Number(draft.fields.markupPercent.value)-(2/(31.63*1.13/30)-1)*100)<.002);
});

test("piece invoices retain their existing per-piece price",()=>{
  const draft=form(1);
  calc(draft,"MARKUP");
  assert.equal(draft.fields.finalUnitCost.value,"6.326000");
  assert.equal(draft.fields.proposedSalePrice.value,"10.72");
});
