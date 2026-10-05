import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {buildSupplierPriceComparison} from "../src/lib/supplier-price-comparison.js";

const line = changes => ({productId:"p1",productName:"Προϊόν",sku:"100",productUnit:"PIECE",supplierId:"s1",supplierName:"Προμηθευτής",documentId:"d1",documentNumber:"INV-1",documentDate:"2026-10-01T10:00:00Z",documentCreatedAt:"2026-10-01T10:00:00Z",sourceType:"MANUAL",unit:"PIECE",quantity:10,unitCost:9,netAmount:20,...changes});

test("supplier costs use net amounts after discounts and normalize packages without guessing",()=>{
  const rows=buildSupplierPriceComparison([line({unit:"PACKAGE",unitsPerPackage:12,quantity:2,netAmount:24}),line({supplierId:"s2",quantity:24,netAmount:18})]);
  assert.equal(rows[0].lastCost,1);assert.equal(rows[1].lastCost,.75);
  assert.equal(rows[0].unitLabel,"τεμ.");
});

test("duplicate product rows are weighted within a document and latest differs from historical minimum",()=>{
  const [row]=buildSupplierPriceComparison([
    line({documentId:"old",documentNumber:"OLD",documentDate:"2026-09-01",quantity:10,netAmount:8}),
    line({quantity:10,netAmount:20}),line({quantity:10,netAmount:10})
  ]);
  assert.equal(row.purchaseCount,2);assert.equal(row.lastCost,1.5);assert.equal(row.bestCost,.8);
  assert.equal(row.lastDocumentNumber,"INV-1");assert.equal(row.bestDocumentNumber,"OLD");
});

test("grams and kilograms compare per kilo; incompatible dimensions remain excluded",()=>{
  const [good]=buildSupplierPriceComparison([line({productUnit:"KG",unit:"GR",quantity:500,netAmount:2})]);
  assert.equal(good.lastCost,4);assert.equal(good.baseUnit,"KG");
  const [bad]=buildSupplierPriceComparison([line({productUnit:"KG",unit:"PIECE"})]);
  assert.equal(bad.lastCost,null);assert.match(bad.reason,/Μονάδες/);
  const [litre]=buildSupplierPriceComparison([line({productUnit:"LT",unit:"ML",quantity:500,netAmount:1})]);
  assert.equal(litre.lastCost,2);assert.equal(litre.baseUnit,"L");
});

test("missing package, quantity, amount and unknown units never become zero-priced winners",()=>{
  for(const fields of [{unit:"PACKAGE",unitsPerPackage:null},{quantity:0},{quantity:-1},{netAmount:null},{netAmount:0},{netAmount:-1},{netAmount:"Infinity"},{productUnit:"UNKNOWN"}]){
    const [row]=buildSupplierPriceComparison([line(fields)]);
    assert.equal(row.lastCost,null,JSON.stringify(fields));assert.equal(row.bestCost,null);assert.equal(row.excludedPurchaseCount,1);
  }
});

test("an invalid newest purchase is not replaced by an older price",()=>{
  const [row]=buildSupplierPriceComparison([line({documentId:"old",documentDate:"2026-09-01",netAmount:8}),line({unit:"PACKAGE",unitsPerPackage:0})]);
  assert.equal(row.lastCost,null);assert.equal(row.bestCost,.8);assert.equal(row.lastDocumentId,"d1");
});

test("posted orders use recorded pack corrections or explicit quantities and excise-inclusive net",()=>{
  const sourceType="PURCHASE_ORDER";
  const [correction]=buildSupplierPriceComparison([line({sourceType,correctionId:"movement1",correctedUnitCost:.814})]);
  assert.equal(correction.lastCost,.814);assert.equal(correction.evidenceId,"movement1");
  const [explicit]=buildSupplierPriceComparison([line({sourceType,orderBaseQuantity:24,orderNetAmount:12,orderInvalidUnits:0})]);
  assert.equal(explicit.lastCost,.5);
  for(const fields of [{},{orderBaseQuantity:24,orderNetAmount:12,orderInvalidUnits:1},{correctionId:"movement1",correctedUnitCost:null}]){
    const [bad]=buildSupplierPriceComparison([line({sourceType,...fields})]);assert.equal(bad.lastCost,null);
  }
});

test("same date purchases use creation time then document ID, independent of row order",()=>{
  const old=line({documentId:"a",documentCreatedAt:"2026-10-01T10:00:01Z",netAmount:10});
  const last=line({documentId:"b",documentCreatedAt:"2026-10-01T10:00:02Z",netAmount:30});
  assert.equal(buildSupplierPriceComparison([last,old])[0].lastCost,3);
  assert.equal(buildSupplierPriceComparison([old,last])[0].lastCost,3);
  assert.deepEqual(buildSupplierPriceComparison([]),[]);
});

test("comparison route uses the licensed target store/company and only reads approved invoices",async()=>{
  const source=await readFile(new URL("../src/routes/commerce-v1.js",import.meta.url),"utf8");
  const registrations=[];
  const router=Object.fromEntries(["get","post","patch","put","delete","use"].map(method=>[method,(...args)=>registrations.push({method,args})]));
  const queries=[];
  const prisma={$queryRaw:async(strings,...values)=>{queries.push({sql:strings.join("?"),values});return [line({netAmount:10})];},$executeRaw:()=>{throw new Error("Unexpected write");}};
  const module=source.replace(/^import .*;\s*$/gm,"").replace(/export default router;?/,"");
  new Function("Router","prisma","requireCompanyModule","requireStoreModule","buildSupplierPriceComparison","orderSuggestionsRouter","lowValueProductsRouter",module)(()=>router,prisma,()=>()=>{},key=>{assert.equal(key,"INVENTORY");return "STORE_LICENSE_GUARD";},buildSupplierPriceComparison,()=>{},()=>{});
  const route=registrations.find(r=>r.method==="get"&&r.args[0]==="/supplier-price-comparison");
  assert.equal(route.args[1],"STORE_LICENSE_GUARD");
  let body,error;
  await route.args[2]({user:{companyId:"different-login-company"},targetStore:{id:"target-store",companyId:"target-company"}},{json:data=>{body=data;}},e=>{error=e;});
  assert.equal(error,undefined);assert.equal(body[0].lastCost,1);
  const {sql,values}=queries[0];
  assert.match(sql,/d\."status"='APPROVED' AND d\."documentType"='INVOICE'/);
  assert.match(sql,/p\."companyId"=\?/);assert.match(sql,/s\."companyId"=\?/);assert.match(sql,/d\."storeId"=\?/);
  assert.ok(values.every(value=>["target-store","target-company"].includes(value)));
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER)\b/);
});
