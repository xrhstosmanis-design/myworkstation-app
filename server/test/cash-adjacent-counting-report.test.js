import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../src/services/cash-reconciliation-contract.js';
import {projectReconciliation} from '../src/services/cash-reconciliation-report.js';
import {projectAutomaticReviewedReport} from '../src/services/cash-reviewed-automatic-contract.js';

function shift({id,name,opened,closed,opening,actual,expected,variance,cashSales,expenses=0,cardSales=0,eftposTotal=0,cardVariance=0}){
 const session={id,companyId:'company',storeId:'store',terminalPos:'POS1',status:'CLOSED',openedBy:'user-'+id,openedByName:name,shiftLabel:'Βάρδια',openedAt:opened,closedAt:closed,
 openingDrawer:opening,openingCustody:0,openingCoins:0,openingOperational:opening,
 closingDrawer:actual,closingCustody:0,closingCoins:0,actualOperational:actual,expectedOperational:expected,variance,
 cashSales,expenses,cardSales,eftposTotal,cardVariance,openingSafe:0,closingSafe:0};
 const tx=[{id:'sale-'+id,companyId:'company',storeId:'store',sessionId:id,type:'SALE_CASH',amount:cashSales,reversedAt:null}];
 if(expenses)tx.push({id:'supplier-'+id,companyId:'company',storeId:'store',sessionId:id,type:'SUPPLIER_PAYMENT',amount:expenses,subtractFromShift:true,reversedAt:null});
 return {session,sourceHash:hash(id),initialCents:Math.round(variance*100),basisCents:Math.round(variance*100),cardCents:Math.round(cardVariance*100),explainedCents:0,reviewStatus:'VALID',nextClosed:true,transactions:tx.map(t=>({id:t.id,type:t.type,amountCents:Math.round(t.amount*100),reversed:false,cashEffect:t.type==='SUPPLIER_PAYMENT',occurredAt:opened})),automaticSnapshot:{...session},automaticTransactions:tx,expenseFindings:[]};
}
function fixture(){
 const a=shift({id:'a',name:'Night',opened:'2026-10-22T22:07:00Z',closed:'2026-10-23T03:10:00Z',opening:1065.70,actual:1081.60,expected:1425.60,variance:-344,cashSales:359.90});
 const b=shift({id:'b',name:'Morning',opened:'2026-10-23T03:11:00Z',closed:'2026-10-23T11:10:00Z',opening:1081.60,actual:1006.10,expected:663.02,variance:343.08,cashSales:285.80,expenses:704.38});
 a.session.nextSession={id:'b',companyId:'company',storeId:'store',terminalPos:'POS1',status:'CLOSED',openedAt:b.session.openedAt,closedAt:b.session.closedAt,openedByName:b.session.openedByName};
 b.session.previousSession={id:'a',companyId:'company',storeId:'store',terminalPos:'POS1',status:'CLOSED',openedAt:a.session.openedAt,closedAt:a.session.closedAt,openedByName:a.session.openedByName};
 b.nextClosed=false;
 return {store:{id:'store',name:'Synthetic Cash LAB'},rule:{mode:'FULL',carryOverEnabled:true,posEftposEnabled:true},sessions:new Map([['a',a],['b',b]]),selectedIds:['a','b'],period:{from:'2026-10-23',to:'2026-10-23'},coverage:'BOUNDED_CLOSED_SHIFTS'};
}
function tripleFixture(){
 const source=fixture(),b=source.sessions.get('b');
 const c=shift({id:'c',name:'Afternoon',opened:'2026-10-23T11:11:00Z',closed:'2026-10-23T18:00:00Z',opening:1006.10,actual:1006.10,expected:1106.10,variance:-100,cashSales:100});
 b.session.nextSession={id:'c'};c.session.previousSession={id:'b'};
 b.nextClosed=true;c.nextClosed=false;source.sessions.set('c',c);source.selectedIds.push('c');
 return source;
}
test('canonical cash report proactively classifies adjacent opposite cash but never allocates or approves money',()=>{
 const s=fixture(),before=structuredClone(s),report=projectReconciliation(s,[]);
 assert.equal(report.countingErrorCandidates?.length,1);
 const q=report.countingErrorCandidates[0];
 assert.deepEqual([q.commonCents,q.previousResidualCents,q.nextResidualCents],[34308,-92,0]);
 assert.equal(q.status,'COUNTING_ERROR_CANDIDATE');
 assert.deepEqual(report.rows.map(r=>r.remainingCents),[-34400,34308]);
 assert.deepEqual(report.rows.map(r=>r.offsetCents),[0,0]);
 assert(report.rows.every(r=>r.reviewed===false));
 assert.equal(report.originalFinancialLedgerChanged,false);
 assert.match(report.text,/ΕΝΔΕΙΞΕΙΣ ΛΑΘΟΥΣ ΚΑΤΑΜΕΤΡΗΣΗΣ/);
 assert.match(report.text,/ΠΡΟΤΕΙΝΟΜΕΝΟ ΛΑΘΟΣ ΚΑΤΑΜΕΤΡΗΣΗΣ/);
 assert.match(report.text,/0,92/);
 assert.deepEqual(s,before);
 const same=projectReconciliation(s,[]);assert.equal(same.reportHash,report.reportHash);
 const edited=structuredClone(s);edited.sessions.get('b').session.openingOperational=1081.59;edited.sessions.get('b').automaticSnapshot.openingOperational=1081.59;
 const after=projectReconciliation(edited,[]);
 assert.equal(after.countingErrorCandidates,undefined);
 assert.notEqual(after.reportHash,report.reportHash);
});
test('manual reviewed OFFSET removes only the overlapping proposal without altering raw sources',()=>{
 const s=fixture(),a=s.sessions.get('a'),b=s.sessions.get('b');
 const o={id:'manual-offset',sequence:1,actorName:'Auditor',data:{kind:'OFFSET',previousSessionId:'a',nextSessionId:'b',previousHash:a.sourceHash,nextHash:b.sourceHash,amountCents:34308},proof:{previousHash:a.sourceHash,nextHash:b.sourceHash}};
 const after=projectReconciliation(s,[o]);
 assert.equal(after.countingErrorCandidates,undefined);
 assert.deepEqual(after.rows.map(r=>r.remainingCents),[-92,0]);
 assert.deepEqual(after.rows.map(r=>r.offsetCents),[34308,34308]);
 assert(after.rows.every(r=>r.reviewed===false));
 assert.match(after.text,/0,92/);
});
test('card-only sign alternation does not create counting mistake or change source report hash',()=>{
 const s=fixture(),a=s.sessions.get('a'),b=s.sessions.get('b');for(const row of [a,b]){row.initialCents=0;row.basisCents=0;row.session.variance=0;row.automaticSnapshot.variance=0;row.session.actualOperational=row.session.expectedOperational;row.automaticSnapshot.actualOperational=row.session.actualOperational;row.session.closingDrawer=row.session.actualOperational;row.automaticSnapshot.closingDrawer=row.session.closingDrawer;}
 b.session.openingOperational=a.session.actualOperational;b.automaticSnapshot.openingOperational=b.session.openingOperational;b.session.openingDrawer=b.session.openingOperational;b.automaticSnapshot.openingDrawer=b.session.openingDrawer;
 a.cardCents=-22750;b.cardCents=22750;
 const out=projectReconciliation(s,[]);assert.equal(out.countingErrorCandidates,undefined);assert.doesNotMatch(out.text,/ΠΡΟΤΕΙΝΟΜΕΝΟ ΛΑΘΟΣ ΚΑΤΑΜΕΤΡΗΣΗΣ/);
});

test('canonical and automatic reports preserve boundary ambiguity without changing selected financial rows',()=>{
 for(const selected of ['a','c']){
  const source=tripleFixture();source.selectedIds=[selected];const before=structuredClone(source),report=projectReconciliation(source,[]);
  assert.equal(report.countingErrorCandidates.length,1);
  assert.equal(report.countingErrorCandidates[0].status,'AMBIGUOUS_OVERLAP');
  assert.deepEqual([report.countingErrorCandidates[0].commonCents,report.countingErrorCandidates[0].previousResidualCents,report.countingErrorCandidates[0].nextResidualCents],[null,null,null]);
  const original=source.sessions.get(selected);
  assert.deepEqual(report.rows.map(r=>[r.sessionId,r.initialCents,r.remainingCents,r.offsetCents,r.reviewed]),[[selected,original.initialCents,original.basisCents,0,false]]);
  assert.match(report.text,/ΑΜΦΙΒΟΛΗ ΑΛΛΗΛΟΥΧΙΑ/);assert.doesNotMatch(report.text,/ΠΡΟΤΕΙΝΟΜΕΝΟ ΛΑΘΟΣ ΚΑΤΑΜΕΤΡΗΣΗΣ/);
  const automatic=projectAutomaticReviewedReport(report);
  assert.deepEqual(automatic.countingErrorCandidates,report.countingErrorCandidates);assert.equal(automatic.text,report.text);assert.equal(automatic.reportHash,report.reportHash);
  assert.equal(projectReconciliation(source,[]).reportHash,report.reportHash);assert.deepEqual(source,before);
 }
});
test('one-neighbour canonical reports retain original differences without inventing a boundary allocation',()=>{
 for(const [selected,missing] of [['a','c'],['c','a']]){
  const source=tripleFixture();source.selectedIds=[selected];source.sessions.delete(missing);
  const before=structuredClone(source),report=projectReconciliation(source,[]),original=source.sessions.get(selected);
  assert.equal(report.countingErrorCandidates,undefined);
  assert.deepEqual(report.rows.map(r=>[r.initialCents,r.remainingCents,r.offsetCents,r.reviewed]),[[original.initialCents,original.basisCents,0,false]]);
  assert.doesNotMatch(report.text,/ΠΡΟΤΕΙΝΟΜΕΝΟ ΛΑΘΟΣ ΚΑΤΑΜΕΤΡΗΣΗΣ|ΑΜΦΙΒΟΛΗ ΑΛΛΗΛΟΥΧΙΑ/);
  const automatic=projectAutomaticReviewedReport(report);assert.equal(automatic.text,report.text);assert.equal(automatic.reportHash,report.reportHash);
  assert.deepEqual(source,before);
 }
});

test('automatic reviewed projection preserves candidate text and fingerprint without modifying financial rows',()=>{
 const canonical=projectReconciliation(fixture(),[]),automatic=projectAutomaticReviewedReport(canonical);
 assert.deepEqual(automatic.countingErrorCandidates,canonical.countingErrorCandidates);
 assert.equal(automatic.reportHash,canonical.reportHash);
 assert.equal(automatic.text,canonical.text);
 assert.deepEqual(automatic.rows.map(r=>[r.initialCents,r.remainingCents,r.offsetCents,r.cardCents]),canonical.rows.map(r=>[r.initialCents,r.remainingCents,r.offsetCents,r.cardCents]));
 const malformed=structuredClone(canonical);malformed.countingErrorCandidates[0].commonCents=1;
 assert.throws(()=>projectAutomaticReviewedReport(malformed));
 const wrongStatus=structuredClone(canonical);
 wrongStatus.countingErrorCandidates[0].status='AMBIGUOUS_OVERLAP';
 assert.throws(()=>projectAutomaticReviewedReport(wrongStatus),'ambiguous overlap cannot carry an allocated candidate amount');
 const wrongResidual=structuredClone(canonical);
 wrongResidual.countingErrorCandidates[0].previousResidualCents=0;
 assert.throws(()=>projectAutomaticReviewedReport(wrongResidual),'candidate residual must equal immutable source difference minus overlap');
 const wrongSign=structuredClone(canonical);
 wrongSign.countingErrorCandidates[0].nextDifferenceCents=-34308;
 assert.throws(()=>projectAutomaticReviewedReport(wrongSign),'same-sign adjacent cash differences cannot become candidates');
 const missing=structuredClone(canonical);delete missing.countingErrorCandidates;
 assert.throws(()=>projectAutomaticReviewedReport(missing),/Cash report text changed/);
});
