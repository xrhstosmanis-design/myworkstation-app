import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {hash,reconciliationRequest} from '../src/services/cash-reconciliation-contract.js';
import {projectReconciliation,reconciliationText,immediateCashPair} from '../src/services/cash-reconciliation-report.js';
import {handoffQuestion,projectHandoffIssues,assertHandoffIssues} from '../src/services/cash-handoff-issues.js';
import {projectAutomaticReviewedReport} from '../src/services/cash-reviewed-automatic-contract.js';
import {cashArchiveWorkbook} from '../src/services/cash-reviewed-archive.js';

function fixture(){
 const sessions=new Map();
 for(const [i,id]of ['a','b','c'].entries()){
  const cash=100+i*119,session={id,companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedBy:'employee-'+id,openedByName:'Operator '+id,shiftLabel:'Βάρδια',openedAt:`2026-10-2${i+1}T06:00:00.000Z`,closedAt:`2026-10-2${i+1}T14:00:00.000Z`,openingOperational:cash,actualOperational:cash};
  sessions.set(id,{session,sourceHash:hash(id),initialCents:0,basisCents:0,explainedCents:0,cardCents:0,nextClosed:i<2,reviewStatus:'VALID',transactions:[],automaticSnapshot:{...session,openingDrawer:cash,openingCustody:0,openingCoins:0,closingDrawer:cash,closingCustody:0,closingCoins:0,expectedOperational:cash,cashSales:0,expenses:0,cardSales:0,eftposTotal:0,variance:0,cardVariance:0},automaticTransactions:[]});
 }
 sessions.get('a').session.nextSession={id:'b'};sessions.get('b').session.previousSession={id:'a'};sessions.get('b').session.nextSession={id:'c'};sessions.get('c').session.previousSession={id:'b'};
 return {store:{id:'store',name:'LAB'},period:{from:'2026-10-21',to:'2026-10-22'},rule:{mode:'FULL',carryOverEnabled:true},sessions,selectedIds:['a','b'],coverage:'BOUNDED_CLOSED_SHIFTS'};
}
function reply(report,records,status='OPEN',note='Ελέγχθηκε η συγκεκριμένη παράδοση.',pair='a'){
 const q=report.handoffRegister.issues.find(q=>q.previousSessionId===pair),n=records.length+1;
 return {id:'handoff-'+n,sequence:n,actorName:'Auditor',createdAt:'2026-10-31T18:00:00.000Z',data:{kind:'HANDOFF_ISSUE',issueId:q.id,previousSessionId:q.previousSessionId,nextSessionId:q.nextSessionId,previousHash:q.previousHash,nextHash:q.nextHash,issueFingerprint:q.fingerprint,reportHash:report.reportHash,status,note,reviewed:true},proof:{period:report.period,handoffQuestion:handoffQuestion(q)}};
}
const finance=r=>({rows:r.rows.map(({sessionId,initialCents,remainingCents,offsetCents,cardCents,reviewed,reviewedBy,status,automaticAudit})=>({sessionId,initialCents,remainingCents,offsetCents,cardCents,reviewed,reviewedBy,status,automaticAudit})),totals:r.totals,employees:r.employees,calculatedResult:r.calculatedResult});
const workbook=r=>XLSX.read(cashArchiveWorkbook({...r,generation:'0',head:'ROOT'},{storeId:'store',companyId:'co'}),{type:'buffer'});
const values=(b,n)=>XLSX.utils.sheet_to_json(b.Sheets[n],{header:1,defval:null});

test('original ordered pair is deduplicated across selected halves and remains identical at a period boundary; equal amounts on different pairs never merge',()=>{
 const s=fixture(),r=projectReconciliation(s,[]);
 assert.equal(r.handoffRegister.issues.length,2);const [ab,bc]=r.handoffRegister.issues;
 assert.equal(ab.differenceCents,bc.differenceCents);assert.notEqual(ab.id,bc.id);
 assert.deepEqual(r.rows.map(r=>r.handoffIssueIds.length),[1,2]);
 s.selectedIds=['b'];s.period={from:'2026-10-22',to:'2026-10-22'};const boundary=projectReconciliation(s,[]);
 assert.deepEqual(boundary.handoffRegister,r.handoffRegister);assert.equal(projectAutomaticReviewedReport(boundary).handoffRegister.issues.length,2);
});

test('OPEN CLOSED OPEN preserve original arithmetic, pending finality, other pair, source and complete reply history',()=>{
 const s=fixture(),original=structuredClone(s),records=[];let r=projectReconciliation(s,[]);const before=finance(r),first=r.reportHash;
 for(const status of ['OPEN','CLOSED','OPEN']){
  const record=reply(r,records,status);records.push(record);r=projectReconciliation(s,records);
  const q=r.handoffRegister.issues.find(q=>q.previousSessionId==='a');assert.equal(q.status,status);assert.equal(q.repliesCount,records.length);assert.equal(q.lastReply.note,record.data.note);
  assert.equal(r.handoffRegister.issues.find(q=>q.previousSessionId==='b').repliesCount,0);assert.deepEqual(finance(r),before);
  assert.match(r.text,/απόκλιση/);assert.match(r.text,/δεν μεταβάλλει τα ποσά/);assert.equal(projectAutomaticReviewedReport(r).text,r.text);
 }
 assert.notEqual(r.reportHash,first);assert.deepEqual(s,original);assert.equal(records[1].data.status,'CLOSED');
});

test('either changed half, original amount or rule invalidates the old closed answer; vanished pair is retained read-only',()=>{
 for(const change of [s=>s.sessions.get('a').sourceHash=hash('changed a'),s=>s.sessions.get('b').sourceHash=hash('changed b'),s=>s.sessions.get('b').session.openingOperational=220,s=>s.rule.carryOverEnabled=false,s=>s.sessions.get('a').session.nextSession={id:'c'},s=>s.sessions.get('b').session.status='OPEN']){
  const s=fixture(),first=projectReconciliation(s,[]),record=reply(first,[],'CLOSED');change(s);const r=projectReconciliation(s,[record]),q=r.handoffRegister.issues.find(q=>q.id===record.data.issueId);
  assert.equal(q.status,'RECHECK_REQUIRED');assert.equal(q.lastReply.decision,'CLOSED');assert.equal(q.repliesCount,1);assertHandoffIssues(r);projectAutomaticReviewedReport(r);
 }
});

test('equal, absent, overlapping, foreign, other-terminal, open and non-FULL sources never become replyable pairs',()=>{
 for(const change of [s=>s.sessions.get('b').session.openingOperational=100,s=>s.sessions.get('a').session.actualOperational=null,s=>s.sessions.get('b').session.openedAt='2026-10-21T12:00:00.000Z',s=>s.sessions.get('b').session.companyId='foreign',s=>s.sessions.get('b').session.storeId='other',s=>s.sessions.get('b').session.terminalPos='DELIVERY',s=>s.sessions.get('b').session.status='OPEN',s=>s.rule.mode='POS_EFTPOS_ONLY']){
  const s=fixture();s.selectedIds=['a'];change(s);assert.equal(projectHandoffIssues(s,[],immediateCashPair),undefined);
 }
});

test('XLSX contains exact pair/status/note and canonical text; closing a question leaves financial AND original unresolved-audit sheets unchanged',()=>{
 const s=fixture(),a=projectReconciliation(s,[]),note='=HYPERLINK("https://invalid.test","<img src=x onerror=bad>")',record=reply(a,[],'CLOSED',note),b=projectReconciliation(s,[record]),wa=workbook(a),wb=workbook(b);
 for(const name of ['Βάρδιες','Ανά εργαζόμενο','Ανά ημέρα','Εκκρεμότητες'])assert.deepEqual(values(wa,name),values(wb,name));
 assert(values(wb,'Απαντήσεις παραδόσεων').some(r=>r.includes(note)&&r.includes('a')&&r.includes('b')));
 assert.equal(values(wb,'Αναφορά').slice(1).map(r=>r[0]||'').join('\n'),b.text);
 for(const sheet of Object.values(wb.Sheets))for(const [k,c]of Object.entries(sheet))if(!k.startsWith('!')){assert.equal(c.f,undefined);assert.equal(c.l,undefined);}
 for(const mutate of [r=>delete r.handoffRegister,r=>r.handoffRegister.issues.pop(),r=>r.handoffRegister.issues[0].status='OPEN',r=>r.handoffRegister.issues[0].nextSessionId='foreign']){
  const bad=structuredClone(b);mutate(bad);assert.throws(()=>reconciliationText(bad));assert.throws(()=>projectAutomaticReviewedReport(bad));assert.throws(()=>workbook(bad));
 }
});

test('strict request and stored proof reject forged halves, implicit review, unsafe note and unsupported state',()=>{
 const s=fixture(),r=projectReconciliation(s,[]),record=reply(r,[]),request={requestId:'8bf60d86-cf8b-4aad-8c0c-f240d844c240',head:'ROOT',generation:'0',period:r.period,data:record.data};
 assert(reconciliationRequest.safeParse(request).success);
 for(const patch of [{reviewed:false},{nextHash:undefined},{issueFingerprint:undefined},{status:'CONFIRMED'},{note:'unsafe\u0000control note'},{financialAdjustmentCents:11900}])assert.equal(reconciliationRequest.safeParse({...request,data:{...record.data,...patch}}).success,false);
 for(const change of [q=>q.nextSessionId='foreign',q=>q.nextOpeningCents++,q=>q.previousHash=hash('foreign source')]){const bad=structuredClone(record);change(bad.proof.handoffQuestion);assert.throws(()=>projectReconciliation(s,[bad]),e=>e.code==='CASH_RECONCILIATION_INVALID_HISTORY');}
});

test('large handoff registry remains bounded and exposes an explicit read-only limit instead of dropping questions',()=>{
 const base=fixture(),sessions=new Map(),selectedIds=[];
 for(let i=0;i<501;i++){
  const a=structuredClone(base.sessions.get('a')),b=structuredClone(base.sessions.get('b'));a.session.id='a'+i;b.session.id='b'+i;a.session.nextSession={id:b.session.id};b.session.previousSession={id:a.session.id};delete b.session.nextSession;a.session.terminalPos=b.session.terminalPos='MAIN'+i;sessions.set(a.session.id,a);sessions.set(b.session.id,b);selectedIds.push(a.session.id);
 }
 const register=projectHandoffIssues({...base,sessions,selectedIds},[],immediateCashPair);assert.equal(register.status,'LIMITED');assert.deepEqual(register.issues,[]);
});
