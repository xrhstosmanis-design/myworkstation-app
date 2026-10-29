import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {hash} from '../src/services/cash-reconciliation-contract.js';
import {projectReconciliation} from '../src/services/cash-reconciliation-report.js';
import {canAutomaticallyCalculate,calculateCashResult,assertCalculatedCashResult} from '../src/services/cash-automatic-result.js';
import {projectAutomaticReviewedReport,canSendProvisionalCashReport} from '../src/services/cash-reviewed-automatic-contract.js';
import {cashArchiveWorkbook} from '../src/services/cash-reviewed-archive.js';
import {createReviewedCashEmailReader,reviewedCashEmailReadiness} from '../src/services/cash-reviewed-email.js';

function fixture(){
 const sessions=new Map();
 for(const [index,id,opening,closing]of [[0,'a',100,95],[1,'b',95,100],[2,'c',100,100]]){
  const session={id,companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedBy:'employee',openedByName:'Εργαζόμενος',openedAt:`2026-10-21T${String(6+index*5).padStart(2,'0')}:00:00Z`,closedAt:`2026-10-21T${String(10+index*5).padStart(2,'0')}:00:00Z`,shiftLabel:'Βάρδια '+id};
  const variance=closing-opening;
  sessions.set(id,{session,sourceHash:hash(id),initialCents:variance*100,basisCents:variance*100,explainedCents:0,cardCents:200,nextClosed:index<2,reviewStatus:'VALID',transactions:[],automaticSnapshot:{openingDrawer:opening,openingCustody:0,openingCoins:0,openingOperational:opening,closingDrawer:closing,closingCustody:0,closingCoins:0,actualOperational:closing,expectedOperational:opening,variance,cashSales:0,expenses:0,cardSales:30,eftposTotal:28,cardVariance:2},automaticTransactions:[{id:'card-'+id,companyId:'co',storeId:'store',sessionId:id,type:'SALE_CARD',amount:30,reversedAt:null}]});
 }
 for(const [a,b]of [['a','b'],['b','c']]){sessions.get(a).session.nextSession={id:b};sessions.get(b).session.previousSession={id:a};}
 sessions.get('a').expenseFindings=[{code:'EXPENSE_WITHOUT_DOCUMENT',amountCents:2500,occurredAt:'2026-10-21T08:00:00.000Z'}];
 return {store:{id:'store',name:'Δοκιμή'},sessions,rule:{mode:'FULL',carryOverEnabled:true},selectedIds:['a','b','c'],period:{from:'2026-10-21',to:'2026-10-21'},coverage:'BOUNDED_CLOSED_SHIFTS'};
}
const complete=source=>({...projectReconciliation(source,[]),generation:'0',head:'ROOT',checkedAt:'2026-10-29T20:00:00Z'});
async function evidence(report){return createReviewedCashEmailReader({db:{},authorize:async()=>({scope:{companyId:'co',storeId:'store'}}),repository:{generation:async()=>'0',read:async()=>report}})({},'store','2026-10-21')}
const absent=id=>({sessionId:id,reviewValid:false,reviewDecision:null,reviewedAt:null,reviewedBy:null});

test('prior evidenced shifts produce employee/day results without CONFIRM; opposite amounts never net; last shift and documents remain open',()=>{
 const source=fixture(),original=structuredClone(source),r=complete(source);
 assert.deepEqual(r.rows.map(v=>v.automaticallyCalculated),[true,true,false]);
 assert(r.rows.every(v=>!v.reviewed&&v.reviewedBy===null&&v.offsetCents===0));
 assert.deepEqual(r.totals,{shortageCents:0,surplusCents:0,pending:3});
 assert.equal(r.calculatedResult.automaticCount,2);assert.equal(r.calculatedResult.pending,1);
 assert.equal(r.calculatedResult.shortageCents,500);assert.equal(r.calculatedResult.surplusCents,500);
 assert.equal(r.calculatedResult.employees.length,1);assert.equal(r.calculatedResult.days.length,1);
 assert.equal(r.calculatedResult.employees[0].shortageCents,500);assert.equal(r.calculatedResult.employees[0].surplusCents,500);
 assert.match(r.text,/Βάρδια a · Εργαζόμενος: Έλλειμμα 5,00\s*€\./);assert.match(r.text,/Βάρδια c .*ΥΠΟ ΕΛΕΓΧΟ/);
 assert.match(r.text,/έξοδο 25,00.*χωρίς παραστατικό/);assert.match(r.text,/Εκκρεμούν 1 βάρδιες/);assert.doesNotMatch(r.text,/ΜΑΝΗΣ ΧΡΗΣΤΟΣ/);assert.deepEqual(source,original);
 const dto=projectAutomaticReviewedReport(r);assert.deepEqual(dto.calculatedResult,r.calculatedResult);assert.equal(canSendProvisionalCashReport(dto),true);assert(!JSON.stringify(dto).includes('automaticSnapshot'));
});
test('card-only contradiction does not change cash results; missing cash, unsafe handoff or identity does',()=>{
 const source=fixture();source.sessions.get('a').automaticSnapshot.cardSales=31;
 const r=complete(source);assert.equal(r.rows[0].automaticAudit.status,'INCOMPLETE');assert.equal(r.rows[0].recheck,false);assert.equal(r.rows[0].automaticallyCalculated,true);assert.equal(r.calculatedResult.shortageCents,500);assert.match(r.text,/καταχωρισμένο σύνολο καρτών/);
 for(const mutate of [s=>{s.sessions.get('a').automaticSnapshot.closingCoins=null},s=>{s.sessions.get('b').automaticSnapshot.openingOperational=99},s=>{s.sessions.get('a').session.openedByName='Έκτακτος'},s=>{s.sessions.get('a').session.openedBy=null}]){
  const input=fixture();mutate(input);assert.equal(complete(input).rows[0].automaticallyCalculated,false);
 }
 const unknown=fixture();unknown.sessions.get('a').automaticTransactions.push({id:'unknown',companyId:'co',storeId:'store',sessionId:'a',type:'UNKNOWN',amount:10});assert.equal(complete(unknown).rows[0].automaticallyCalculated,false);
});
test('difference-only configuration retains its provisional variance-column policy without acquiring FULL automatic approvals',()=>{
 const source=fixture();source.rule={mode:'DIFFERENCE_ONLY',carryOverEnabled:false};
 const r=complete(source);assert(r.rows.every(row=>row.automaticAudit.status==='NOT_APPLICABLE'&&!row.automaticallyCalculated&&!row.reviewed));
 assert.equal(r.calculatedResult.automaticCount,0);assert.equal(r.calculatedResult.pending,3);
 assert.equal(canSendProvisionalCashReport(projectAutomaticReviewedReport(r)),true);
});
test('a cash contradiction invalidates both connected offset halves before allocation; card-only change preserves verified allocation',()=>{
 const input=fixture(),a=input.sessions.get('a'),b=input.sessions.get('b');
 const records=[{id:'offset',sequence:1,actorName:'Ελεγκτής',data:{kind:'OFFSET',previousSessionId:'a',nextSessionId:'b',previousHash:a.sourceHash,nextHash:b.sourceHash,amountCents:500},proof:{previousHash:a.sourceHash,nextHash:b.sourceHash}}];
 a.automaticSnapshot.cardSales=31;
 const card=projectReconciliation(input,records);assert.deepEqual(card.rows.slice(0,2).map(r=>r.remainingCents),[0,0]);assert(card.rows.slice(0,2).every(r=>r.automaticallyCalculated));
 a.automaticSnapshot.closingDrawer=94;
 const cash=projectReconciliation(input,records);assert(cash.rows.slice(0,2).every(r=>r.recheck&&!r.reviewed&&!r.automaticallyCalculated));assert.deepEqual(cash.rows.slice(0,2).map(r=>r.remainingCents),[-500,500]);
});
test('forged effective flags, deductions, aggregate totals and missing required checks reject without manufacturing approval',()=>{
 const r=complete(fixture());
 for(const mutate of [v=>{delete v.calculatedResult},v=>{v.calculatedResult.shortageCents=0},v=>{v.rows[2].automaticallyCalculated=true},v=>{v.rows[0].remainingCents=0},v=>{v.rows[0].automaticAudit.checks=v.rows[0].automaticAudit.checks.filter(c=>c.code!=='CASH_SALES')}]){
  const bad=structuredClone(r);mutate(bad);assert.throws(()=>assertCalculatedCashResult(bad));assert.throws(()=>projectAutomaticReviewedReport(bad));assert.throws(()=>cashArchiveWorkbook(bad,{companyId:'co',storeId:'store'}));
 }
 const row=structuredClone(r.rows[0]);row.explainedCents=600;assert.equal(canAutomaticallyCalculate(row),false);
 row.explainedCents=0;row.recheck=true;assert.equal(canAutomaticallyCalculate(row),false);
 assert.equal(calculateCashResult([]).automaticCount,0);
});
test('Excel has the exact common text and separate employee/day shortage and surplus, while retaining original manual sheets and open documents',()=>{
 const r=complete(fixture()),book=XLSX.read(cashArchiveWorkbook(r,{companyId:'co',storeId:'store'}),{type:'buffer'}),values=name=>XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:null});
 assert.equal(values('Αναφορά').slice(1).map(v=>v[0]??'').join('\n'),r.text);
 assert.deepEqual(values('Αποτελέσματα εργαζομένων')[1].slice(-2),[5,5]);assert.deepEqual(values('Αποτελέσματα ημέρας')[1].slice(-2),[5,5]);
 assert.equal(values('Ανά εργαζόμενο').length,1,'manual-only history is preserved');
 const pending=values('Εκκρεμότητες');assert(pending.some(v=>v.includes('Λείπει παραστατικό.')));assert.equal(pending.filter(v=>v.includes('Δεν περιλαμβάνεται στα ελεγμένα σύνολα.')).length,1);
});
test('explicit absent legacy approval accepts current provisional evidence; stale or unknown review and missing cash still hold',async()=>{
 const r=complete(fixture()),e=await evidence(r),legacy=r.rows.map(v=>absent(v.sessionId));
 assert.equal(reviewedCashEmailReadiness(e,legacy),true);assert.equal(e.report.rows[2].automaticallyCalculated,false);
 for(const patch of [{reviewedAt:'2026-10-21T10:00:00Z'},{reviewDecision:'CONFIRMED'},{reviewedBy:'actor'},{reviewedAt:undefined}])assert.equal(reviewedCashEmailReadiness(e,[{...legacy[0],...patch},...legacy.slice(1)]),false);
 const changed=fixture();changed.sessions.get('a').automaticSnapshot.expectedOperational=99;assert.equal(reviewedCashEmailReadiness(await evidence(complete(changed)),legacy),false);
});
