import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../src/services/cash-reconciliation-contract.js';
import {projectReconciliation,immediateCashPair} from '../src/services/cash-reconciliation-report.js';
const period={from:'2026-10-21',to:'2026-10-23'};
function fixture(){
 const sessions=new Map();for(const [i,id,amount,name]of [[0,'a',-8700,'Χρυσάνθη'],[1,'b',8000,'Γιάννης'],[2,'c',-1000,'Χρυσάνθη']]){
  sessions.set(id,{session:{id,companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedBy:'employee-'+id,openedByName:name,openedAt:`2026-10-${21+i}T06:00:00Z`,closedAt:`2026-10-${21+i}T14:00:00Z`,shiftLabel:'Πρωινή'},sourceHash:hash(id),initialCents:amount,basisCents:amount,cardCents:i===0?20000:-1000,explainedCents:0,reviewStatus:'VALID',nextClosed:i<2,transactions:[]});
 }sessions.get('a').session.nextSession={...sessions.get('b').session};sessions.get('b').session.nextSession={...sessions.get('c').session};
 return {store:{id:'store',name:'Δοκιμή'},rule:{mode:'FULL',carryOverEnabled:true},sessions,selectedIds:['a','b','c'],period,coverage:'BOUNDED_CLOSED_SHIFTS'};
}
const offset=(source,a,b,amount,id='offset')=>({id,sequence:1,actorName:'Χρήστος Μάνης',data:{kind:'OFFSET',previousSessionId:a,nextSessionId:b,previousHash:source.sessions.get(a).sourceHash,nextHash:source.sessions.get(b).sourceHash,amountCents:amount},proof:{previousHash:source.sessions.get(a).sourceHash,nextHash:source.sessions.get(b).sourceHash}});
const confirmation=(row,id='confirm',sequence=2)=>({id,sequence,actorName:'Χρήστος Μάνης',data:{kind:'CONFIRM',sessionId:row.sessionId,sourceHash:row.sourceHash,planHash:row.planHash},proof:{}});
test('equal opposite cash amounts alone do not offset; reviewed immediate pairs consume both sides once and never cards or other employee days',()=>{
 const source=fixture(),before=projectReconciliation(source,[]);assert.deepEqual(before.rows.map(r=>r.remainingCents),[-8700,8000,-1000]);assert.equal(before.totals.shortageCents,0);assert.equal(before.totals.pending,3);
 const review=offset(source,'a','b',8000),draft=projectReconciliation(source,[review]);assert.deepEqual(draft.rows.map(r=>r.remainingCents),[-700,0,-1000]);assert.deepEqual(draft.rows.map(r=>r.cardCents),[20000,-1000,-1000]);
 const done=projectReconciliation(source,[review,confirmation(draft.rows[0]),confirmation(draft.rows[1],'confirm-b',3)]);
 assert.equal(done.rows[0].reviewed,true);assert.equal(done.rows[2].reviewed,false);assert.equal(done.totals.shortageCents,700);assert.equal(done.totals.pending,1);assert.match(done.text,/ΜΑΝΗΣ ΧΡΗΣΤΟΣ/);assert.match(done.text,/Χρυσάνθη: Έλλειμμα 7,00/);assert.match(done.text,/POS–EFTPOS: διαφορά \+200,00/);
 assert.equal(done.employees.find(e=>e.name==='Χρυσάνθη').shortageCents,700,'another day stays outside reviewed employee total');
});
test('exact terminal adjacency rejects skipped, overlapping, delivery and unfinished shifts; changed source invalidates both sides and connected offsets',()=>{
 const source=fixture(),a=source.sessions.get('a'),b=source.sessions.get('b'),c=source.sessions.get('c');assert.equal(immediateCashPair(a,b,source.rule),true);
 assert.equal(immediateCashPair(a,c,source.rule),false);assert.equal(immediateCashPair(a,{...b,session:{...b.session,terminalPos:'DELIVERY'}},source.rule),false);assert.equal(immediateCashPair(a,{...b,session:{...b.session,status:'OPEN'}},source.rule),false);assert.equal(immediateCashPair({...a,session:{...a.session,closedAt:b.session.closedAt}},b,source.rule),false);
 const first=offset(source,'a','b',7000),second={...offset(source,'b','c',500,'second'),sequence:2};a.sourceHash=hash('changed');const stale=projectReconciliation(source,[first,second]);assert(stale.rows.every(r=>r.status==='RECHECK_REQUIRED'));assert.deepEqual(stale.rows.map(r=>r.remainingCents),[-8700,8000,-1000]);
});
test('context outside the selected day does not enter totals, revoked approval never resurrects an old one, unknown money is not zero',()=>{
 const source=fixture();source.selectedIds=['a'];source.period={from:'2026-10-21',to:'2026-10-21'};const pair=offset(source,'a','b',8000),draft=projectReconciliation(source,[pair]),one=confirmation(draft.rows[0]),two=confirmation(draft.rows[0],'newer',3),revoke={id:'revoke',sequence:4,data:{kind:'REVOKE',targetId:'newer'},proof:{}};
 const done=projectReconciliation(source,[pair,one]);assert.equal(done.totals.shortageCents,700);assert.equal(done.rows.length,1);assert.equal(done.context.length,2);
 assert.equal(projectReconciliation(source,[pair,one,two,revoke]).rows[0].reviewed,false);
 source.sessions.get('a').basisCents=null;const unknown=projectReconciliation(source,[]);assert.equal(unknown.rows[0].remainingCents,null);assert.match(unknown.text,/Άγνωστη διαφορά/);assert.equal(unknown.rows[0].eligible,false);
});
test('a stale card/prepaid paper remains a separate pending item without consuming or invalidating reviewed cash',()=>{
 const source=fixture(),pair=offset(source,'a','b',8000),draft=projectReconciliation(source,[pair]),confirmed=confirmation(draft.rows[0]);
 const card={id:'card-paper',sequence:3,data:{kind:'ASSOCIATE',confirmedKind:'PREPAID',sessionId:'a',sourceHash:source.sessions.get('a').sourceHash,confirmedDate:'2026-10-21',confirmedAmountCents:2000},proof:{sourceHash:source.sessions.get('a').sourceHash,rawLine:{label:'Vodafone 20'}}};
 const result=projectReconciliation(source,[pair,confirmed,card],new Map([['card-paper',false]]));assert.equal(result.rows[0].reviewed,true);assert.equal(result.rows[0].remainingCents,-700);assert.equal(result.rows[0].cardCents,20000);assert.match(result.text,/Εκκρεμεί επανέλεγχος: 2026-10-21 · Vodafone 20/);
});
test('one login with different recorded names or a shared generic code never becomes one employee net balance',()=>{
 for(const generic of [false,true]){
  const source=fixture(),a=source.sessions.get('a'),b=source.sessions.get('b');b.session.openedBy=a.session.openedBy;if(generic){a.session.openedByName='Έκτακτος';b.session.openedByName='Έκτακτος';}
  const draft=projectReconciliation(source,[]),done=projectReconciliation(source,[confirmation(draft.rows[0],'confirm-a',1),confirmation(draft.rows[1],'confirm-b',2)]);
  assert.equal(done.employees.length,2);assert(done.employees.every(e=>e.identityRequiresReview));assert.equal(done.totals.shortageCents,8700);assert.equal(done.totals.surplusCents,8000);
 }
});
test('a verified wrong-handover note on a zero-cash shift remains a note without manufacturing a shortage',()=>{
 const source=fixture(),a=source.sessions.get('a');a.initialCents=0;a.basisCents=0;a.cardCents=0;source.selectedIds=['a'];
 const draft=projectReconciliation(source,[]),review=confirmation(draft.rows[0]);review.data.note='Λάθος παράδοση ταμείου.';
 const done=projectReconciliation(source,[review]);assert.match(done.text,/Χρυσάνθη: Χωρίς διαφορά/);assert.match(done.text,/Σχόλιο ελέγχου: Λάθος παράδοση ταμείου\./);assert.equal(done.totals.shortageCents,0);
});

test('document findings stay factual and scoped to their shift, and do not change cash or cards',()=>{
 const source=fixture(); source.selectedIds=['a'];
 source.sessions.get('a').expenseFindings=[{code:'EXPENSE_WITHOUT_DOCUMENT',amountCents:12000,occurredAt:'2026-10-21T06:40:00.000Z'},{code:'EXPENSE_DOCUMENT_UNVERIFIED',amountCents:7529,occurredAt:'2026-10-21T07:00:00.000Z'}];
 source.sessions.get('b').expenseFindings=[{code:'EXPENSE_WITHOUT_DOCUMENT',amountCents:50000,occurredAt:null}];
 const report=projectReconciliation(source,[]);
 assert.match(report.text,/έξοδο 120,00\s*€ χωρίς παραστατικό/);
 assert.match(report.text,/παραστατικό ή πληρωμή 75,29\s*€ χρειάζεται επανέλεγχο/);
 assert.doesNotMatch(report.text,/500,00/);assert.equal(report.rows[0].remainingCents,-8700);assert.equal(report.rows[0].cardCents,20000);
 const oldHash=report.reportHash;source.sessions.get('a').expenseFindings=[];assert.notEqual(projectReconciliation(source,[]).reportHash,oldHash);
});

test('automatic arithmetic is carried in canonical prose without closing documents, creating approvals or allocating equal amounts',()=>{
 const source=fixture(),a=source.sessions.get('a');source.selectedIds=['a'];
 a.automaticSnapshot={openingDrawer:100,openingCustody:0,openingCoins:0,openingOperational:100,closingDrawer:13,closingCustody:0,closingCoins:0,actualOperational:13,expectedOperational:100,variance:-87,cashSales:0,expenses:0,cardSales:200,eftposTotal:0,cardVariance:200};
 a.automaticTransactions=[{id:'card',companyId:'co',storeId:'store',sessionId:'a',type:'SALE_CARD',amount:200,reversedAt:null}];
 a.expenseFindings=[{code:'EXPENSE_WITHOUT_DOCUMENT',amountCents:1000,occurredAt:null}];
 const before=structuredClone(source),report=projectReconciliation(source,[]),r=report.rows[0];
 assert.equal(r.automaticAudit.status,'CALCULATED');assert.equal(r.automaticAudit.cashVarianceCents,-8700);assert.equal(r.reviewed,false);assert.equal(r.offsetCents,0);
 assert.equal(report.totals.pending,1);assert.equal(report.totals.shortageCents,0);assert.equal(r.cardCents,20000);
 assert.match(report.text,/Ο αυτόματος αριθμητικός έλεγχος.*ολοκληρώθηκε/);assert.match(report.text,/έξοδο 10,00.*χωρίς παραστατικό/);assert.doesNotMatch(report.text,/ΜΑΝΗΣ ΧΡΗΣΤΟΣ/);
 assert.deepEqual(source,before);
 const oldHash=report.reportHash,oldSource=r.sourceHash,oldPlan=r.planHash;
 a.automaticSnapshot.expectedOperational=101;
 const changed=projectReconciliation(source,[]);assert.equal(changed.rows[0].automaticAudit.status,'INCOMPLETE');assert.notEqual(changed.reportHash,oldHash);assert.equal(changed.rows[0].sourceHash,oldSource);assert.equal(changed.rows[0].planHash,oldPlan);
});
