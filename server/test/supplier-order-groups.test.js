import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {z} from "zod";
import {buildOrderSuggestions} from "../src/lib/order-suggestions.js";
import {buildSupplierOrderGroups,SUPPLIER_EVIDENCE_LIMIT} from "../src/lib/supplier-order-groups.js";
const rows=[{productId:"p",name:"P",suggestedQuantity:12},{productId:"tie",suggestedQuantity:2},{productId:"none",suggestedQuantity:null}];
const e=(productId,supplierId,documentId)=>({productId,supplierId,supplierName:supplierId,documentId});
test("supplier proposal counts distinct approved document identities, preserves quantities, and never asserts primary or delivery frequency",()=>{
  const evidence=[e("p","a","1"),e("p","a","1"),e("p","a","2"),e("p","b","3"),e("tie","a","1"),e("tie","b","2")];
  const result=buildSupplierOrderGroups(rows,evidence);
  assert.equal(result.rows[0].candidateSupplierId,"a");assert.equal(result.rows[0].supplierCandidates[0].documentCount,2);
  assert.deepEqual(result.rows.map(r=>r.suggestedQuantity),[12,2,null]);assert.deepEqual(result.unassigned.map(r=>r.productId),["tie","none"]);
  assert.equal(result.rows[1].supplierReviewReason,"DOCUMENT_FREQUENCY_TIE");assert.equal(result.rows[2].supplierReviewReason,"NO_APPROVED_DOCUMENT_EVIDENCE");
  assert.ok(result.rows.every(r=>r.primarySupplierId===null&&r.reviewRequired));assert.equal(result.automaticTransmission,false);assert.equal(result.supplierBasis,"APPROVED_DOCUMENT_FREQUENCY_PROXY");
  assert.deepEqual(rows,[{productId:"p",name:"P",suggestedQuantity:12},{productId:"tie",suggestedQuantity:2},{productId:"none",suggestedQuantity:null}]);
});
test("truncated evidence cannot manufacture a candidate, including for otherwise complete-looking products",()=>{
  for(const [evidence,options] of [[[e("p","a","1")],{complete:false}],[Array.from({length:SUPPLIER_EVIDENCE_LIMIT+1},(_,i)=>e("p","a",String(i))),{}]]){
    const r=buildSupplierOrderGroups(rows,evidence,options);assert.equal(r.complete,false);assert.equal(r.groups.length,0);assert.equal(r.unassigned.length,3);assert.ok(r.rows.every(r=>!r.candidateSupplierId&&r.supplierCandidates.length===0&&r.supplierReviewReason==="INCOMPLETE_EVIDENCE"));
  }
});
test("actual grouped reader uses repeatable-read, parameterized source scope/period and unchanged quantity function",async()=>{
  const source=await readFile(new URL("../src/routes/order-suggestions.js",import.meta.url),"utf8");
  const registrations=[],calls=[];let isolation;
  const db={$transaction:async(fn,options)=>{isolation=options;return fn({$queryRaw:async(strings,...values)=>{calls.push({sql:strings.join("?"),values});return calls.length===1?[{productId:"p",name:"P",sku:"P",unit:"PIECE",currentStock:3,minStock:5,soldQuantity:60,returnedQuantity:15}]:[e("p","a","1")];}});}};
  const read=new Function("Router","z","prisma","requireStoreModule","buildOrderSuggestions","buildSupplierOrderGroups","SUPPLIER_EVIDENCE_LIMIT",source.replace(/^import .*;\s*$/gm,"").replace(/export default router;?/,"").replace(/^export /gm,"")+"\nreturn readSupplierOrderSuggestions;")(()=>({get:(...args)=>registrations.push(args)}),z,db,()=>()=>{},buildOrderSuggestions,buildSupplierOrderGroups,SUPPLIER_EVIDENCE_LIMIT);
  const now=new Date("2026-10-18T12:00:00Z"),options={historyDays:7,coverageDays:7,leadDays:3},r=await read(db,{storeId:"selected-store",companyId:"selected-company",options,now});
  assert.deepEqual(isolation,{isolationLevel:"RepeatableRead"});assert.equal(calls.length,2);assert.equal(r.rows[0].suggestedQuantity,62);assert.equal(r.rows[0].candidateSupplierId,"a");
  assert.equal(r.supplierEvidence.from,"2026-10-11T12:00:00.000Z");assert.equal(r.supplierEvidence.to,now.toISOString());assert.equal(r.supplierEvidence.physicalDeliveryFrequencyVerified,false);
  assert.ok(calls[1].values.includes("selected-store"));assert.ok(calls[1].values.includes("selected-company"));assert.equal(calls[1].values.at(-1),20001);
  assert.match(calls[1].sql,/SELECT DISTINCT/);assert.match(calls[1].sql,/d\."status"='APPROVED'/);assert.match(calls[1].sql,/d\."documentType"='INVOICE'/);assert.match(calls[1].sql,/l\."quantity">0/);
  assert.deepEqual(registrations.map(r=>r[0]),["/order-suggestions","/order-suggestions/by-supplier"]);
  const wire=JSON.parse(JSON.stringify(r));
  assert.deepEqual(wire.rows[0].currentStockShortfall,{status:"BELOW_MINIMUM",quantity:2,basis:"RECORDED_CURRENT_STOCK_MINIMUM",stockVerified:false,reviewReasons:[]});
  assert.deepEqual(wire.groups[0].rows[0],wire.rows[0]);
});

test("actual quantity producer through grouped JSON separates recorded minimum gaps, demand and review without changing original proposals",()=>{
  const raw=[
    {productId:"below",unit:"PIECE",currentStock:3,minStock:5,soldQuantity:60,returnedQuantity:15},
    {productId:"demand",unit:"PIECE",currentStock:5,minStock:5,soldQuantity:60,returnedQuantity:0},
    {productId:"equal",unit:"PIECE",currentStock:5,minStock:5,soldQuantity:0,returnedQuantity:0},
    {productId:"above",unit:"PIECE",currentStock:6,minStock:5,soldQuantity:0,returnedQuantity:0},
    {productId:"negative",unit:"PIECE",currentStock:-2,minStock:5,soldQuantity:0,returnedQuantity:0},
    {productId:"unknown",unit:"UNKNOWN",currentStock:0,minStock:5,soldQuantity:0,returnedQuantity:0},
    {productId:"recipe",unit:"PIECE",hasRecipe:true,currentStock:0,minStock:5,soldQuantity:0,returnedQuantity:0},
    {productId:"default-min",unit:"PIECE",currentStock:0,minStock:null,soldQuantity:0,returnedQuantity:0},
    {productId:"tiny",unit:"KG",currentStock:.9996,minStock:1,soldQuantity:0,returnedQuantity:0},
    {productId:"decimal",unit:"KG",currentStock:.1,minStock:.3,soldQuantity:0,returnedQuantity:0},
  ];
  const options={historyDays:30,coverageDays:7,leadDays:3};
  const produced=buildOrderSuggestions(raw,options),before=structuredClone(produced);
  const evidence=raw.filter(r=>r.productId!=="negative").map(r=>e(r.productId,"supplier",r.productId));
  const wire=JSON.parse(JSON.stringify(buildSupplierOrderGroups(produced,evidence)));
  const find=id=>wire.rows.find(r=>r.productId===id),classification=id=>find(id).currentStockShortfall;
  assert.equal(classification("below").status,"BELOW_MINIMUM");assert.equal(classification("below").quantity,2);
  assert.equal(classification("demand").status,"DEMAND_REPLENISHMENT");assert.equal(classification("demand").quantity,0);assert.ok(find("demand").suggestedQuantity>0);
  for(const id of ["equal","above","default-min"]){assert.equal(classification(id).status,"NO_SHORTAGE");assert.equal(classification(id).quantity,0);}
  assert.equal(find("default-min").minStock,0); // Existing base default, not proof a minimum was configured.
  assert.equal(classification("negative").status,"REVIEW_REQUIRED");assert.deepEqual(classification("negative").reviewReasons,["NEGATIVE_RECORDED_STOCK"]);assert.equal(find("negative").suggestedQuantity,7);
  for(const id of ["unknown","recipe"]){assert.equal(classification(id).quantity,null);assert.deepEqual(classification(id).reviewReasons,["NUMERIC_SUGGESTION_UNAVAILABLE"]);}
  assert.equal(classification("tiny").quantity,1-.9996);assert.ok(classification("tiny").quantity>0&&classification("tiny").quantity<.001);assert.equal(find("tiny").suggestedQuantity,.001);
  assert.equal(classification("decimal").quantity,.3-.1);assert.equal(find("decimal").suggestedQuantity,.2);
  assert.ok(wire.rows.every(r=>r.currentStockShortfall.stockVerified===false&&r.currentStockShortfall.basis==="RECORDED_CURRENT_STOCK_MINIMUM"));
  for(const output of wire.rows){const original=before.find(r=>r.productId===output.productId);for(const [key,value] of Object.entries(original))assert.deepEqual(output[key],value,`${output.productId}/${key} original producer field changed`);}
  assert.deepEqual(produced,before);assert.ok(produced.every(r=>!("currentStockShortfall" in r))); // Flat API DTO untouched.
});

test("classification fails closed using typed DTO calculations, with missing-before-invalid-before-negative priority and no prose inference",()=>{
  const valid=buildOrderSuggestions([{productId:"p",unit:"PIECE",currentStock:1,minStock:2,soldQuantity:3,returnedQuantity:1}],{historyDays:30})[0];
  const classify=row=>buildSupplierOrderGroups([row],[]).rows[0].currentStockShortfall;
  const fields=["currentStock","minStock","soldQuantity","returnedQuantity","netQuantity","dailyDemand","targetStock","suggestedQuantity"];
  for(const key of fields){
    for(const value of [null,undefined]){const result=classify({...valid,[key]:value});assert.equal(result.status,"REVIEW_REQUIRED");assert.equal(result.quantity,null);assert.deepEqual(result.reviewReasons,["NUMERIC_SUGGESTION_UNAVAILABLE"]);}
    for(const value of ["1",NaN,Infinity,-Infinity,true,{}])assert.deepEqual(classify({...valid,[key]:value}).reviewReasons,["INVALID_NUMERIC_SUGGESTION"]);
    if(key!=="currentStock")assert.deepEqual(classify({...valid,[key]:-1}).reviewReasons,["INVALID_NUMERIC_SUGGESTION"]);
  }
  const absent={...valid};delete absent.netQuantity;assert.deepEqual(classify(absent).reviewReasons,["NUMERIC_SUGGESTION_UNAVAILABLE"]);
  assert.deepEqual(classify({...valid,currentStock:-1,minStock:-2,suggestedQuantity:null}).reviewReasons,["NUMERIC_SUGGESTION_UNAVAILABLE"]);
  assert.deepEqual(classify({...valid,currentStock:-1,minStock:-2}).reviewReasons,["INVALID_NUMERIC_SUGGESTION"]);
  assert.deepEqual(classify({...valid,currentStock:-1}).reviewReasons,["NEGATIVE_RECORDED_STOCK"]);
  assert.deepEqual(classify({...valid,reason:"Προϊόν συνταγής — άγνωστη μονάδα"}),classify({...valid,reason:"arbitrary localized text"}));
});

test("supplier ties, absent or capped document evidence never alter the independent recorded-stock classification",()=>{
  const produced=buildOrderSuggestions([{productId:"p",unit:"PIECE",currentStock:1,minStock:3,soldQuantity:4,returnedQuantity:0}],{historyDays:30});
  const cases=[buildSupplierOrderGroups(produced,[e("p","s1","a")]),buildSupplierOrderGroups(produced,[e("p","s1","a"),e("p","s2","b")]),buildSupplierOrderGroups(produced,[]),buildSupplierOrderGroups(produced,[e("p","s1","a")],{complete:false})];
  for(const result of cases){assert.deepEqual(result.rows[0].currentStockShortfall,cases[0].rows[0].currentStockShortfall);assert.equal(result.rows[0].suggestedQuantity,2);assert.equal(result.rows[0].primarySupplierId,null);assert.equal(result.automaticTransmission,false);const membership=result.groups.flatMap(g=>g.rows).concat(result.unassigned);assert.strictEqual(membership[0],result.rows[0]);}
});

