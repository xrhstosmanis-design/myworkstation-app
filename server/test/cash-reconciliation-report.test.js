import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../src/services/cash-reconciliation-contract.js';
import {projectReconciliation,immediateCashPair,reconciliationText} from '../src/services/cash-reconciliation-report.js';
const period={from:'2026-10-21',to:'2026-10-23'};
function fixture(){
 const sessions=new Map();for(const [i,id,amount,name]of [[0,'a',-8700,'Χρυσάνθη'],[1,'b',8000,'Γιάννης'],[2,'c',-1000,'Χρυσάνθη']]){
  sessions.set(id,{session:{id,companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedBy:'employee-'+id,openedByName:name,openedAt:`2026-10-${21+i}T06:00:00Z`,closedAt:`2026-10-${21+i}T14:00:00Z`,shiftLabel:'Πρωινή'},sourceHash:hash(id),initialCents:amount,basisCents:amount,cardCents:i===0?20000:-1000,explainedCents:0,reviewStatus:'VALID',nextClosed:i<2,transactions:[]});
 }sessions.get('a').session.nextSession={...sessions.get('b').session};sessions.get('b').session.nextSession={...sessions.get('c').session};
 return {store:{id:'store',name:'Δοκιμή'},rule:{mode:'FULL',carryOverEnabled:true},sessions,selectedIds:['a','b','c'],period,coverage:'BOUNDED_CLOSED_SHIFTS'};
}
const offset=(source,a,b,amount,id='offset')=>({id,sequence:1,actorName:'Χρήστος Μάνης',data:{kind:'OFFSET',previousSessionId:a,nextSessionId:b,previousHash:source.sessions.get(a).sourceHash,nextHash:source.sessions.get(b).sourceHash,amountCents:amount},proof:{previousHash:source.sessions.get(a).sourceHash,nextHash:source.sessions.get(b).sourceHash}});
const confirmation=(row,id='confirm',sequence=2)=>({id,sequence,actorName:'Χρήστος Μάνης',data:{kind:'CONFIRM',sessionId:row.sessionId,sourceHash:row.sourceHash,planHash:row.planHash},proof:{}});
test('joint handwritten candidates render as unverified with ledger date provenance and cannot close finality',()=>{
 const source=fullFixture();source.paperEvidence.coverage.complete=false;source.paperEvidence.items=[{status:'UNRESOLVED',reason:'DOCUMENT_DATE_UNREADABLE',line:null}];
 source.paperEvidence.shiftCandidates=[{filename:'synthetic.jpg',fromLine:0,toLine:3,operatorName:'Synthetic Operator',terminalPos:'MAIN',candidateDate:'2026-10-21',dateBasis:'LEDGER_DAY_MONTH_CANDIDATE',selected:true,proof:[{field:'openingOperational',amountCents:10000},{field:'cardSales',amountCents:2200}]}];
 const before=projectReconciliation(source,[]);assert.match(before.text,/χωρίς αντιστοίχιση σε επιλεγμένη βάρδια: 1/);assert.match(before.text,/γραμμές χειρογράφων προς έλεγχο με σύνδεση στη βάρδια 0/);assert.match(before.text,/Προτεινόμενη βάρδια — ΠΡΟΣ ΕΛΕΓΧΟ/);assert.match(before.text,/έτος από την υποψήφια καταχωρισμένη βάρδια, όχι από το χειρόγραφο/);assert.match(before.text,/αρχικό ταμείο 100,00/);assert.match(before.text,/POS 22,00/);assert.doesNotMatch(before.text,/ΤΕΛΙΚΟ ΤΕΚΜΗΡΙΩΜΕΝΟ ΑΠΟΤΕΛΕΣΜΑ/);assert.equal(before.rows[0].fullAudit.status,'PENDING');assert.equal(before.rows[0].reviewed,false);
 source.paperEvidence.shiftCandidates[0].proof[1].amountCents=2300;assert.notEqual(projectReconciliation(source,[]).reportHash,before.reportHash);
 source.paperEvidence.shiftCandidates=Array.from({length:31},()=>structuredClone(source.paperEvidence.shiftCandidates[0]));const limited=projectReconciliation(source,[]);assert.match(limited.text,/Εμφανίζονται 30 από 31 προτεινόμενες/);assert.equal(limited.text.split('Προτεινόμενη βάρδια — ΠΡΟΣ ΕΛΕΓΧΟ').length-1,30);
});
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

function fullFixture(){
 const source=fixture(),a=source.sessions.get('a');source.selectedIds=['a'];source.rule.carryOverEnabled=false;a.cardCents=0;
 a.automaticSnapshot={openingDrawer:100,openingCustody:0,openingCoins:0,openingOperational:100,closingDrawer:3,closingCustody:0,closingCoins:0,actualOperational:3,expectedOperational:90,variance:-87,cashSales:0,expenses:10,cardSales:0,eftposTotal:0,cardVariance:0};
 a.automaticTransactions=[{id:'expense-a',companyId:'co',storeId:'store',sessionId:'a',type:'OTHER_EXPENSE',amount:10,subtractFromShift:true,reversedAt:null}];
 a.transactions=[{id:'expense-a',type:'OTHER_EXPENSE',amountCents:1000,cashEffect:true,reversed:false,occurredAt:'2026-10-21T10:00:00Z'}];
 a.expenseFindings=[]; // The original expense document check is already independently complete.
 a.eventSales={status:'AVAILABLE',findings:[],financialAdjustmentCents:0,evidenceHash:hash('price-events')};
 a.fullEvidence={events:{status:'AVAILABLE',findings:[],unassignedCount:0,evidenceHash:hash('events')},duplicates:{salesStatus:'LINKED_POS_SCOPE',findings:[],duplicateWindowSeconds:60}};
 source.paperEvidence={version:1,storeId:'store',status:'COMPLETE',items:[{sourceId:'paper',line:0,status:'MATCHED',kind:'EXPENSE',sessionId:'a',transactionId:'expense-a',amountCents:1000,reason:'UNIQUE_RECORDED_CORROBORATION'}],coverage:{discoveryComplete:true,complete:true},financialAdjustmentCents:0,humanApproval:false,hash:hash('papers')};
 return source;
}
test('full evidence integration reaches final only with complete current sources, retaining expense arithmetic and separate original results',()=>{
 const source=fullFixture(),before=structuredClone(source),report=projectReconciliation(source,[]),row=report.rows[0];
 assert.equal(row.fullAudit.status,'FINAL');assert.equal(row.fullAudit.remainingCents,-8700);assert.equal(row.fullAudit.shortageCents,8700);assert.equal(row.fullCoverage.expenses.unresolvedCount,0);
 assert.equal(row.initialCents,-8700);assert.equal(row.explainedCents,0);assert.equal(row.offsetCents,0);assert.equal(row.remainingCents,-8700,'matched paper corroborates an already-subtracted expense, never subtracts it again');
 assert.equal(row.cardCents,0);assert.equal(row.reviewed,false);assert.equal(report.calculatedResult.shortageCents,8700);assert.equal(report.calculatedResult.surplusCents,0);assert.equal(report.originalFinancialLedgerChanged,false);
 assert.match(report.text,/ΤΕΛΙΚΟ ΤΕΚΜΗΡΙΩΜΕΝΟ ΑΠΟΤΕΛΕΣΜΑ.*Χρυσάνθη: Έλλειμμα 87,00/);assert.doesNotMatch(report.text,/χρειάζεται έλεγχος και διευκρίνιση από τον υπεύθυνο ή τον ιδιοκτήτη/);assert.deepEqual(source,before);
 const arithmeticOnly=structuredClone(source);delete arithmeticOnly.paperEvidence;delete arithmeticOnly.sessions.get('a').fullEvidence;
 const old=projectReconciliation(arithmeticOnly,[]);assert.equal(old.rows[0].fullAudit,undefined);assert.deepEqual(report.calculatedResult,old.calculatedResult);assert.equal(row.remainingCents,old.rows[0].remainingCents);assert.doesNotMatch(old.text,/Η αναφορά δημιουργήθηκε αυτόματα από το MyWorkStation/);
});
test('paper ambiguity, event ambiguity, duplicate candidates or missing source coverage hold full finality without changing cash',()=>{
 for(const mutate of [s=>{s.paperEvidence.items.push({sourceId:'ambiguous',line:0,status:'UNRESOLVED',reason:'AMBIGUOUS_MATCH'});s.paperEvidence.coverage.complete=false},s=>{s.sessions.get('a').fullEvidence.events.unassignedCount=1},s=>{s.sessions.get('a').fullEvidence.events.status='UNAVAILABLE'},s=>{s.sessions.get('a').fullEvidence.duplicates.findings=[{code:'SALE_LINE_DUPLICATE_CANDIDATE',transactions:[{saleId:'one'},{saleId:'two'}],secondsApart:30}]},s=>{delete s.sessions.get('a').fullEvidence}]){
  const source=fullFixture();mutate(source);const report=projectReconciliation(source,[]),row=report.rows[0];assert.equal(row.fullAudit.status,'PENDING');assert.equal(row.fullAudit.remainingCents,null);assert.equal(row.remainingCents,-8700);assert.equal(row.automaticallyCalculated,true);assert.equal(report.calculatedResult.shortageCents,8700);assert.doesNotMatch(report.text,/ΤΕΛΙΚΟ ΤΕΚΜΗΡΙΩΜΕΝΟ ΑΠΟΤΕΛΕΣΜΑ/);assert.match(report.text,/Η αναφορά δημιουργήθηκε αυτόματα από το MyWorkStation/);assert.match(report.text,/χρειάζεται έλεγχος και διευκρίνιση από τον υπεύθυνο ή τον ιδιοκτήτη/);
 }
});
test('paper and event coverage changes invalidate the report fingerprint and forged rendered full results reject',()=>{
 const source=fullFixture(),report=projectReconciliation(source,[]);
 for(const mutate of [s=>{s.paperEvidence.coverage.complete=false},s=>{s.paperEvidence.items[0].status='UNRESOLVED'},s=>{s.sessions.get('a').fullEvidence.events.evidenceHash=hash('changed-events')},s=>{s.sessions.get('a').fullEvidence.events.unassignedCount=1}]){
  const changed=structuredClone(source);mutate(changed);assert.notEqual(projectReconciliation(changed,[]).reportHash,report.reportHash);
 }
 for(const mutate of [r=>{r.rows[0].fullAudit.remainingCents=0},r=>{r.rows[0].fullAudit.shortageCents=0},r=>{r.rows[0].fullCoverage.events.unresolvedCount=1},r=>{r.rows[0].fullEvidence.events.unassignedCount=1},r=>{r.paperEvidence.items[0].status='UNRESOLVED'},r=>{r.rows[0].pendingEvidence=[{id:'old',kind:'EFTPOS',label:'stale',date:'2026-10-21',amountCents:100}]},r=>{r.rows[0].fullAudit.humanApproval=true}]){
  const forged=structuredClone(report);mutate(forged);assert.throws(()=>reconciliationText(forged));
 }
});

test('imported Kiosk findings and incomplete evidence block full finality without changing recorded amounts',()=>{
 for(const incomplete of [false,true]){
  const source=fullFixture();source.kioskEventSales={status:incomplete?'UNAVAILABLE':'AVAILABLE',findings:incomplete?[]:[{code:'ZERO_VALUE_SALE',occurredAt:'2026-10-21T10:00:00.000Z',sessionId:'a',quantity:1,totalReductionCents:0,originalPriceCents:0,finalPriceCents:0}],coverage:{missingJournalShiftIds:[],unverifiedEventOverlapCount:0,sourceUnavailable:incomplete}};
  const report=projectReconciliation(source,[]);assert.equal(report.rows[0].fullAudit.status,'PENDING');assert(report.rows[0].fullAudit.pendingChecks.includes('EVENTS'));assert.equal(report.rows[0].remainingCents,-8700);
 }
});

test('matching a handwritten expense amount does not replace a missing expense receipt or close its question',()=>{
 const source=fullFixture();source.sessions.get('a').expenseFindings=[{code:'EXPENSE_WITHOUT_DOCUMENT',transactionId:'expense-a',amountCents:1000,occurredAt:'2026-10-21T10:00:00.000Z',evidenceHash:hash('missing-receipt')}];
 const report=projectReconciliation(source,[]),row=report.rows[0];assert.equal(row.fullAudit.status,'PENDING');assert(row.fullAudit.pendingChecks.includes('EXPENSES'));assert.equal(row.remainingCents,-8700);assert.equal(row.explainedCents,0);assert.equal(row.offsetCents,0);assert.equal(report.issueRegister.issues[0].status,'OPEN');assert.match(report.text,/χωρίς παραστατικό/);assert.doesNotMatch(report.text,/ΤΕΛΙΚΟ ΤΕΚΜΗΡΙΩΜΕΝΟ/);
});


test('full-audit event and document upload times use midnight 00 with the correct Athens day in summer and winter',()=>{
 for(const [occurredAt,day] of [['2026-10-20T21:25:26.000Z','21/10/2026'],['2026-10-26T22:25:26.000Z','27/10/2026']]){
  const source=fullFixture(),a=source.sessions.get('a');
  a.fullEvidence.events.findings=[{code:'AUDIT_IDEMPOTENT_REPLAY',eventId:'midnight-event',occurredAt}];
  source.paperEvidence.items[0].filename='midnight-source.png';source.paperEvidence.items[0].uploadedAt=occurredAt;
  const before=structuredClone(source),report=projectReconciliation(source,[]);
  assert(report.text.includes(`${day}, 00:25:26 · Επαναλήψεις αιτήματος καταχώρισης POS: 1`));
  assert.doesNotMatch(report.text,/AUDIT_IDEMPOTENT_REPLAY|midnight-event/);
  assert(report.text.includes(`midnight-source.png (ανέβηκε ${day}, 00:25:26)`));
  assert.doesNotMatch(report.text,/24:25:26/);assert.equal(report.rows[0].remainingCents,-8700);assert.equal(report.rows[0].cardCents,0);assert.deepEqual(source,before);
 }
});


test('verified paper headings render as information while unknown or metadata-only documents keep finality pending',()=>{
 const source=fullFixture();
 source.paperEvidence.items.unshift({sourceId:'paper',line:0,status:'INFORMATIONAL',kind:'OTHER',label:'Χειριστής: LAB POS 2',amountCents:null,reason:'VERIFIED_DOCUMENT_HEADER'});
 const before=structuredClone(source),report=projectReconciliation(source,[]);
 assert.match(report.text,/Πληροφορία εγγράφου · Συνημμένο · γραμμή 1 · Χειριστής: LAB POS 2 · επαληθευμένη επικεφαλίδα εγγράφου/);
 assert.equal(report.rows[0].fullAudit.status,'FINAL');assert.equal(report.rows[0].fullCoverage.papers.unresolvedCount,0);
 assert.equal(report.rows[0].remainingCents,-8700);assert.equal(report.rows[0].cardCents,0);assert.equal(report.originalFinancialLedgerChanged,false);assert.deepEqual(source,before);
 for(const reason of ['NO_FINANCIAL_DOCUMENT_LINES','LINE_TIME_UNREADABLE']){
  const unknown=structuredClone(source);unknown.paperEvidence.items.push({sourceId:'unknown',line:null,status:'UNRESOLVED',reason});unknown.paperEvidence.coverage.complete=false;
  const pending=projectReconciliation(unknown,[]);assert.equal(pending.rows[0].fullAudit.status,'PENDING');assert.equal(pending.rows[0].fullCoverage.papers.unresolvedCount,1);assert.equal(pending.rows[0].remainingCents,-8700);
  if(reason==='NO_FINANCIAL_DOCUMENT_LINES')assert.match(pending.text,/Χρειάζεται διευκρίνιση.*δεν αναγνωρίστηκαν οικονομικές γραμμές/);
 }
 const forged=structuredClone(report);forged.paperEvidence.items[0].status='UNRESOLVED';assert.throws(()=>reconciliationText(forged),/coverage changed/);
});

test('one documented return is shown for two linked audit records, never matched by timestamp alone',()=>{
 const source=fullFixture(),row=source.sessions.get('a');
 const event={occurredAt:'2026-10-21T10:00:00.000Z',sessionId:'a',
  returnDetails:{saleId:'returned-sale',originalSaleId:'original-sale',reason:'Λάθος χειριστή',
   refundCents:300,method:'CASH',fiscalPendingAtEntry:true,items:[{name:'Δοκιμαστικό είδος',quantity:1}]}};
 row.fullEvidence.events.findings=[
  {...event,eventId:'action',code:'AUDIT_RETURN_ITEMS'},
  {...event,eventId:'operator',code:'AUDIT_POS_INTERNAL_RETURN_PENDING_RBS'},
  {...event,eventId:'independent',code:'AUDIT_POS_INTERNAL_RETURN_PENDING_RBS',
   returnDetails:{...event.returnDetails,saleId:'another-return',reason:'Άλλη αιτία'}},
 ];
 const report=projectReconciliation(source,[]);
 assert.equal((report.text.match(/Μερική επιστροφή ειδών/g)||[]).length,2);
 assert.equal((report.text.match(/Λάθος χειριστή/g)||[]).length,1);
 assert.match(report.text,/3,00.*μετρητά.*1 × Δοκιμαστικό είδος.*εκκρεμούσε φορολογική επιστροφή RBS/);
 assert.match(report.text,/Άλλη αιτία/);
 assert.doesNotMatch(report.text,/returned-sale|original-sale|another-return/);
 assert.equal(report.rows[0].remainingCents,-8700);
});


test('reports separately corroborated EFTPOS shift totals and identifies missing slip verification',()=>{
 const source=fullFixture();
 assert.match(projectReconciliation(source,[]).text,/Απόκομμα EFTPOS: δεν υπάρχει επαληθευμένο σύνολο/);
 source.paperEvidence.items.push({sourceId:'eftpos',line:0,filename:'eftpos.png',status:'MATCHED',kind:'EFTPOS',sessionId:'a',transactionId:null,evidenceBasis:'SHIFT_TOTAL',amountCents:11800,reason:'UNIQUE_RECORDED_CORROBORATION'});
 const result=projectReconciliation(source,[]);
 assert.match(result.text,/Απόκομμα EFTPOS · eftpos\.png · αναγνωσμένο σύνολο 118,00\s€ · καταχωρισμένο EFTPOS 118,00\s€ · διαφορά 0,00\s€/);
});
