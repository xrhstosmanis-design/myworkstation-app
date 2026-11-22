import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {hash,reconciliationRequest} from '../src/services/cash-reconciliation-contract.js';
import {projectReconciliation,reconciliationText} from '../src/services/cash-reconciliation-report.js';
import {projectAutomaticReviewedReport} from '../src/services/cash-reviewed-automatic-contract.js';
import {cashArchiveWorkbook} from '../src/services/cash-reviewed-archive.js';
import {assertCashIssues,cashIssueQuestion} from '../src/services/cash-issue-replies.js';

function fixture(){
 const sessions=new Map();
 for(const [index,id]of ['a','b'].entries())sessions.set(id,{session:{id,companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedBy:'employee-'+id,openedByName:'Εργαζόμενος '+id,shiftLabel:'Βάρδια',openedAt:`2026-10-2${index+1}T06:00:00.000Z`,closedAt:`2026-10-2${index+1}T14:00:00.000Z`},sourceHash:hash(id),initialCents:-700,basisCents:-700,explainedCents:0,cardCents:20000,nextClosed:index===0,reviewStatus:'VALID',transactions:[]});
 sessions.get('a').session.nextSession={id:'b'};
 sessions.get('a').expenseFindings=['first','second'].map(transactionId=>({transactionId,code:'EXPENSE_WITHOUT_DOCUMENT',amountCents:2500,occurredAt:'2026-10-21T08:00:00.000Z',evidenceHash:hash({transactionId,amount:25})}));
 return {store:{id:'store',name:'LAB'},period:{from:'2026-10-21',to:'2026-10-21'},rule:{mode:'FULL',carryOverEnabled:true},sessions,selectedIds:['a'],coverage:'BOUNDED_CLOSED_SHIFTS'};
}
function reply(report,records,status='OPEN',note='Ελέγχθηκε η συγκεκριμένη κίνηση.',transactionId='first'){
 const q=report.issueRegister.issues.find(q=>q.transactionId===transactionId),index=records.length+1;
 return {id:'issue-reply-'+index,sequence:index,actorName:'Ελεγκτής',createdAt:'2026-10-31T12:00:00.000Z',data:{kind:'ISSUE',sessionId:q.sessionId,issueId:q.id,sourceHash:q.sourceHash,issueFingerprint:q.fingerprint,reportHash:report.reportHash,status,note,reviewed:true},proof:{period:report.period,question:cashIssueQuestion(q)}};
}
const book=report=>XLSX.read(cashArchiveWorkbook({...report,generation:'0',head:'ROOT'},{companyId:'co',storeId:'store'}),{type:'buffer'});
const values=(b,name)=>XLSX.utils.sheet_to_json(b.Sheets[name],{header:1,defval:null});

test('same amount and time never merge questions; replies close/reopen only the identified expense and never approve or net cash',()=>{
 const source=fixture(),original=structuredClone(source),records=[];let report=projectReconciliation(source,records);
 assert.equal(report.issueRegister.issues.length,2);assert.notEqual(...report.issueRegister.issues.map(q=>q.id));
 const financial=r=>({rows:r.rows.map(v=>({cash:v.remainingCents,card:v.cardCents,offset:v.offsetCents,reviewed:v.reviewed,by:v.reviewedBy,source:v.sourceHash,plan:v.planHash})),totals:r.totals,calculatedResult:r.calculatedResult});
 const before=financial(report),firstHash=report.reportHash;
 for(const [status,note]of [['OPEN','Περιμένουμε το παραστατικό της πρώτης κίνησης.'],['CLOSED','Παραστατικό ελέγχθηκε και η συγκεκριμένη ερώτηση κλείνει.'],['OPEN','Η συγκεκριμένη εκκρεμότητα ανοίγει ξανά για έλεγχο.']]){
  records.push(reply(report,records,status,note));report=projectReconciliation(source,records);
  assert.equal(report.issueRegister.issues.find(q=>q.transactionId==='first').status,status);
  assert.equal(report.issueRegister.issues.find(q=>q.transactionId==='second').status,'OPEN');
  assert.deepEqual(financial(report),before);assert.equal(report.issueRegister.issues.find(q=>q.transactionId==='first').lastReply.note,note);
  assert.doesNotMatch(report.text,/ΜΑΝΗΣ ΧΡΗΣΤΟΣ/);assert.equal(projectAutomaticReviewedReport(report).issueRegister.issues.length,2);
 }
 assert.notEqual(report.reportHash,firstHash);assert.equal(report.issueRegister.issues.find(q=>q.transactionId==='first').repliesCount,3);assert.deepEqual(source,original);
});

test('closed source snapshot becomes recheck on changed source/evidence or vanished finding, retaining original answer and transaction identity',()=>{
 for(const change of [s=>{s.sessions.get('a').sourceHash=hash('new source')},s=>{s.sessions.get('a').expenseFindings[0].evidenceHash=hash('changed document totals')},s=>{s.sessions.get('a').expenseFindings.shift()}]){
  const source=fixture(),initial=projectReconciliation(source,[]),record=reply(initial,[],'CLOSED','Το πρωτότυπο ελέγχθηκε πριν από την αλλαγή.');
  const closed=projectReconciliation(source,[record]);assert.equal(closed.issueRegister.issues.find(q=>q.transactionId==='first').status,'CLOSED');
  change(source);const changed=projectReconciliation(source,[record]),q=changed.issueRegister.issues.find(q=>q.transactionId==='first');
  assert.equal(q.status,'RECHECK_REQUIRED');assert.equal(q.lastReply.note,record.data.note);assert.equal(q.lastReply.decision,'CLOSED');assert.notEqual(changed.reportHash,closed.reportHash);assertCashIssues(changed);projectAutomaticReviewedReport(changed);
 }
});

test('canonical text, strict DTO and workbook share current issue status while raw/manual sheets stay unchanged and strings stay escaped data',()=>{
 const source=fixture(),before=projectReconciliation(source,[]),note='=HYPERLINK("https://invalid.test","<script>not executed</script>")';
 const record=reply(before,[],'CLOSED',note),closed=projectReconciliation(source,[record]),a=book(before),b=book(closed);
 for(const name of ['Βάρδιες','Ανά εργαζόμενο','Ανά ημέρα'])assert.deepEqual(values(a,name),values(b,name));
 assert.equal(values(b,'Εκκρεμότητες').filter(r=>r.includes('Παραστατικό εξόδου')).length,1);
 assert.equal(values(b,'Αναφορά').slice(1).map(r=>r[0]??'').join('\n'),closed.text);assert.equal(projectAutomaticReviewedReport(closed).text,closed.text);
 assert.match(closed.text,/Αρχικό εύρημα \(κλειστή εκκρεμότητα με τεκμηρίωση\)/);assert(closed.text.includes(note));
 assert(values(b,'Απαντήσεις εκκρεμοτήτων').some(r=>r.includes(note)));
 for(const sheet of Object.values(b.Sheets))for(const [key,cell]of Object.entries(sheet))if(!key.startsWith('!')){assert.equal(cell.f,undefined);assert.equal(cell.l,undefined);}
 for(const mutate of [r=>{r.issueRegister.issues.find(q=>q.status==='CLOSED').status='OPEN'},r=>{r.issueRegister.issues.pop()},r=>{r.issueRegister.issues[0].id=hash('other')},r=>{delete r.issueRegister}]){
  const bad=structuredClone(closed);mutate(bad);assert.throws(()=>reconciliationText(bad));assert.throws(()=>projectAutomaticReviewedReport(bad));assert.throws(()=>book(bad));
 }
});

test('legacy unbound findings stay visible/read-only; register limits do not suppress raw cash or turn incomplete source into zero',()=>{
 const source=fixture();for(const f of source.sessions.get('a').expenseFindings){delete f.transactionId;delete f.evidenceHash;}
 const old=projectReconciliation(source,[]);assert.equal(old.issueRegister,undefined);assert.match(old.text,/χωρίς παραστατικό/);assert.equal(book(old).SheetNames.length,6);projectAutomaticReviewedReport(old);
 const many=fixture();many.selectedIds=['a','b'];many.period.to='2026-10-22';for(const [id,count]of [['a',250],['b',251]])many.sessions.get(id).expenseFindings=Array.from({length:count},(_,i)=>({transactionId:id+i,code:'EXPENSE_WITHOUT_DOCUMENT',amountCents:100,occurredAt:null,evidenceHash:hash([id,i])}));
 const limited=projectReconciliation(many,[]);assert.equal(limited.issueRegister.status,'LIMITED');assert.equal(limited.issueRegister.issues.length,0);assert.equal(limited.rows[0].remainingCents,-700);assert.match(limited.text,/κατάλογος εκκρεμοτήτων είναι περιορισμένος/);projectAutomaticReviewedReport(limited);
});

test('issue request rejects implicit close, missing snapshot, controls and unsupported state; corrupted proof never becomes a valid closed question',()=>{
 const source=fixture(),r=projectReconciliation(source,[]),record=reply(r,[],'CLOSED');
 const request={requestId:'8bf60d86-cf8b-4aad-8c0c-f240d844c240',head:'ROOT',generation:'0',period:r.period,data:record.data};
 assert(reconciliationRequest.safeParse(request).success);
 for(const patch of [{reviewed:false},{issueFingerprint:undefined},{status:'CONFIRMED'},{note:'bad\u0000control text'}])assert.equal(reconciliationRequest.safeParse({...request,data:{...record.data,...patch}}).success,false);
 const bad=structuredClone(record);bad.proof.question.transactionId='second';assert.throws(()=>projectReconciliation(source,[bad]),e=>e.code==='CASH_RECONCILIATION_INVALID_HISTORY');
});
