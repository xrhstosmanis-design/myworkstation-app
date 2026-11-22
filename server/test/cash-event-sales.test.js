import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCashEventSales,cashEventSalesText,unmatchedPriceApplication} from '../src/services/cash-event-sales.js';
import {projectReconciliation} from '../src/services/cash-reconciliation-report.js';
import {projectAutomaticReviewedReport} from '../src/services/cash-reviewed-automatic-contract.js';
import {hash} from '../src/services/cash-reconciliation-contract.js';
const scope={companyId:'company',storeId:'estia',sessionId:'shift'};
const line=(extra={})=>({lineId:'line',productId:'water',description:'Νερό',quantity:2,unitPrice:1,discount:0,lineTotal:0,...extra});
const sale=(extra={})=>({...scope,saleId:'sale',receiptNumber:'123',occurredAt:'2026-10-22T16:23:52.000Z',actorId:'native-user',actorName:'Σωτήρης',status:'COMPLETED',source:'POS',total:3,linked:true,lines:[line()],...extra});
const event=(extra={})=>({...scope,id:'event',actionType:'PRICE_CHANGE',productId:'water',productName:'Νερό',actorId:'native-user',actorName:'Σωτήρης',quantity:2,oldPrice:1,newPrice:0,newTotal:0,createdAt:'2026-10-22T16:23:40.000Z',...extra});
const compare=(sales,events=[],confirmations=[])=>compareCashEventSales({scope,sales,events,confirmations});
test('zero-value items require explanation even without a price event, with exact camera time and no cash adjustment',()=>{
 const result=compare([sale()]);assert.equal(result.status,'AVAILABLE');assert.equal(result.findings.length,1);assert.equal(result.findings[0].code,'ZERO_VALUE_SALE');assert.equal(result.findings[0].quantity,2);assert.equal(result.findings[0].totalReductionCents,200);assert.equal(result.financialAdjustmentCents,0);
 const text=cashEventSalesText(result,{storeName:'Εστία',shiftLabel:'Απογευματινή'}).join('\n');for(const value of ['Εστία','Σωτήρης','123','ποσότητα 2','19:23:52','διάθεση του είδους'])assert(text.includes(value),value);
 assert.doesNotMatch(text,/έλλειμμα/i);
});
test('water names do not exempt zero sales; only exact evidenced permitted own use is exempt',()=>{
 const s=sale(),l=s.lines[0],approval={...scope,kind:'PERMITTED_WATER_OWN_USE',saleId:s.saleId,lineId:l.lineId,productId:l.productId,occurredAt:s.occurredAt,quantity:2,unitPriceCents:100,lineTotalCents:0,evidenceId:'owner-confirmation'};
 assert.equal(compare([s],[],[approval]).findings.length,0);
 for(const changed of [{storeId:'other'},{saleId:'other'},{lineId:'other'},{quantity:1},{unitPriceCents:0},{evidenceId:''}])assert.equal(compare([s],[],[{...approval,...changed}]).findings.length,1);
 assert.equal(compare([sale({lines:[line({description:'Επιτρεπόμενο νερό',productId:'other'})]})],[],[approval]).findings.length,1);
});
test('an exact multi-field event match supplies original price once; mismatched identities or ambiguity never invent application',()=>{
 const s=sale({lines:[line({unitPrice:0})]});const result=compare([s],[event()]);assert.equal(result.findings.length,1);assert.equal(result.findings[0].eventId,'event');assert.equal(result.findings[0].originalPriceCents,100);
 for(const e of [event({actorId:'different-file-code'}),event({quantity:3}),event({newTotal:1}),event({saleId:'different'}),event({createdAt:'2026-10-22T16:24:00.000Z'})]){
  const r=compare([s],[e]);assert(r.findings.some(f=>f.code==='PRICE_APPLICATION_UNCONFIRMED'));assert.equal(r.findings.find(f=>f.code==='ZERO_VALUE_SALE').eventId,null);
 }
 const ambiguous=compare([s,sale({saleId:'second',receiptNumber:'124',occurredAt:'2026-10-22T16:23:53.000Z'})],[event()]);assert.equal(ambiguous.findings.filter(f=>f.eventId==='event').length,1);assert.equal(ambiguous.findings.at(-1).code,'PRICE_APPLICATION_UNCONFIRMED');
 const repeated=compare([s],[event(),event({id:'event2'})]);assert.equal(repeated.findings[0].eventId,null);assert.equal(repeated.findings.filter(f=>f.code==='PRICE_APPLICATION_UNCONFIRMED').length,2);
});
test('permanent catalog changes are not treated as sales even when a subsequent line has the same price',()=>{
 const r=compare([sale({lines:[line({unitPrice:1,lineTotal:2})]})],[event({actionType:'PERMANENT_PRICE_CHANGE',newPrice:1,newTotal:2})]);assert.equal(r.findings.length,1);assert.equal(r.findings[0].code,'CATALOG_PRICE_CHANGE_UNCONFIRMED');assert.equal(r.findings[0].saleId,null);assert.equal(r.findings[0].totalReductionCents,null);assert(cashEventSalesText(r).join('').includes(unmatchedPriceApplication));
});
test('specific automatic discounts are suppressed without approving all Estia products or any zero-value sale',()=>{
 const l=line({productId:'blu',description:'BLU BAR WATERMELON',quantity:1,unitPrice:8,lineTotal:7,discount:1}),s=sale({lines:[l],total:7});
 const approved={...scope,kind:'AUTOMATIC_DISCOUNT',saleId:s.saleId,lineId:l.lineId,productId:l.productId,occurredAt:s.occurredAt,quantity:1,unitPriceCents:800,lineTotalCents:700,evidenceId:'confirmed-example'};
 assert.equal(compare([s],[],[approved]).findings.length,0);assert.equal(compare([s],[],[]).findings.length,1);
 assert.equal(compare([sale({saleId:'other',lines:[l]})],[],[approved]).findings.length,1);
 assert.equal(compare([sale()],[],[{...approved,productId:'water',quantity:2,unitPriceCents:100,lineTotalCents:0}]).findings[0].code,'ZERO_VALUE_SALE');
});
test('returns, holds, deleted and unlinked lines cannot be reported as completed sales',()=>{
 const r=compare([sale({status:'HOLD'}),sale({source:'RETURN'}),sale({linked:false}),sale({lines:[line({quantity:-2,lineTotal:-2})]})],[event({actionType:'CART_ITEM_REMOVE'})]);assert.deepEqual(r,{status:'AVAILABLE',findings:[],financialAdjustmentCents:0});
});
test('unknown original price stays unknown and bounded overflow is explicit',()=>{
 const r=compare([sale({lines:[line({unitPrice:0})]})]);assert.equal(r.findings[0].originalPriceCents,null);assert.equal(r.findings[0].totalReductionCents,null);
 assert.equal(compare(Array.from({length:2001},()=>sale())).status,'LIMITED');assert.equal(compare([sale({lines:Array.from({length:1001},()=>line())})]).status,'LIMITED');
});
test('fractional unit prices are rounded after quantity multiplication, and foreign or malformed evidence is not an empty successful audit',()=>{
 assert.equal(compare([sale({lines:[line({quantity:2,unitPrice:0.015,lineTotal:0.03})]})]).findings.length,0);
 assert.equal(compare([sale({storeId:'foreign'})]).status,'UNAVAILABLE');
 assert.equal(compare([sale({lines:[line({lineTotal:null})]})]).status,'LIMITED');
 assert.equal(compare([sale(),sale()]).status,'LIMITED');
 assert.equal(compare(Array.from({length:11},(_,i)=>sale({saleId:'many-'+i,lines:Array.from({length:1000},()=>line())}))).status,'LIMITED');
});
test('canonical report and automatic projection retain findings without cash/card allocation or duplicate financial totals',()=>{
 const evidence=compare([sale()],[event()]);const initial={session:{id:'shift',companyId:'company',storeId:'estia',status:'CLOSED',openedBy:'employee',openedByName:'Σωτήρης',terminalPos:'MAIN',shiftLabel:'Απογευματινή',openedAt:'2026-10-22T12:00:00.000Z',closedAt:'2026-10-22T20:00:00.000Z'},sourceHash:hash('unchanged-cash'),initialCents:-500,basisCents:-500,explainedCents:0,cardCents:200,nextClosed:true,reviewStatus:'VALID',transactions:[],eventSales:evidence};
 const source={store:{id:'estia',name:'Εστία'},rule:{mode:'FULL',carryOverEnabled:true},sessions:new Map([['shift',initial]]),selectedIds:['shift'],period:{from:'2026-10-22',to:'2026-10-22'}};
 const report=projectReconciliation(source,[]),projected=projectAutomaticReviewedReport(report);assert.equal(projected.rows[0].remainingCents,-500);assert.equal(projected.rows[0].cardCents,200);assert.equal(projected.totals.shortageCents,0);assert.equal(projected.totals.pending,1);assert.deepEqual(projected.rows[0].eventSales,evidence);assert.match(projected.text,/ΕΛΕΓΧΟΣ ΣΥΜΒΑΝΤΩΝ/);assert.match(projected.text,/Αρχικά ελλείμματα: 5,00/);
 initial.eventSales={status:'AVAILABLE',findings:[],financialAdjustmentCents:0};assert.notEqual(projectReconciliation(source,[]).reportHash,report.reportHash);assert.equal(projectReconciliation(source,[]).rows[0].sourceHash,report.rows[0].sourceHash);
 assert.throws(()=>projectAutomaticReviewedReport({...report,text:report.text.replace('Μηδενική χρέωση','Αυτόματη έκπτωση')}));
});

test('camera time after Greek midnight uses00 rather than24 with the correct local date',()=>{
 const r=compare([sale({occurredAt:'2026-10-11T21:13:46.000Z'})]);
 const text=cashEventSalesText(r).join('\n');assert(text.includes('12/10/2026, 00:13:46'));assert(!text.includes('24:13'));
 const winter=compare([sale({occurredAt:'2026-10-28T22:13:46.000Z'})]);assert(cashEventSalesText(winter).join('').includes('29/10/2026, 00:13:46'));
});
