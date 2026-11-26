import assert from 'node:assert/strict';
import {test} from 'node:test';
import {estimateReceiptCadence,readPosProposalSuppliers} from '../src/services/pos-order-proposal.js';

test('coverage uses distinct local receipt days and rejects sparse or stale history',()=>{
 const days=['2026-11-05','2026-11-02','2026-11-09','2026-11-12','2026-11-12'];
 assert.deepEqual(estimateReceiptCadence(days,'2026-11-13'),{
  coverageDays:3,receiptDays:4,latestReceipt:'2026-11-12'
 });
 assert.equal(estimateReceiptCadence(days.slice(0,3),'2026-11-13'),null);
 assert.equal(estimateReceiptCadence(days,'2026-11-27'),null);
});

test('receipt history is scoped to the selected company and store and attached per supplier',async()=>{
 const suppliers=[{id:'a'},{id:'b'}];
 const receiptDays=['2026-11-02','2026-11-05','2026-11-09','2026-11-12'];
 const calls=[];
 const db={$queryRaw:async(sql,...params)=>{
  calls.push({sql:sql.join('?'),params});
  return calls.length===1?suppliers:receiptDays.map(day=>({supplierId:'a',day}));
 }};
 const result=await readPosProposalSuppliers(db,{companyId:'company',storeId:'store',includeCadence:true,now:new Date('2026-11-13T12:00:00Z')});
 assert.match(calls[1].sql,/o\."companyId"=\? AND o\."storeId"=\?/);
 assert.deepEqual(calls[1].params.slice(0,2),['company','store']);
 assert.equal(result[0].receiptCadence.coverageDays,3);
 assert.equal(result[1].receiptCadence,null);
});
