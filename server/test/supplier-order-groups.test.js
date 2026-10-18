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
});
