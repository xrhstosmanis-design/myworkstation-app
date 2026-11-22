import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../src/services/cash-reconciliation-contract.js';
import {projectReconciliation} from '../src/services/cash-reconciliation-report.js';
import {createReviewedCashEmailReader,reviewedCashEmailReadiness,assertReviewedCashEmailPreview,renderReviewedCashEmail} from '../src/services/cash-reviewed-email.js';
import {assessAutomaticCash} from '../src/services/cash-automatic-audit.js';
import {reconciliationText} from '../src/services/cash-reconciliation-report.js';
import {projectAutomaticReviewedReport} from '../src/services/cash-reviewed-automatic-contract.js';

function report({reviewed=true,offset=true,name='Δοκιμή'}={}){
 const sessions=new Map([['a',-8700],['b',8000]].map(([id,cents],i)=>[id,{session:{id,companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedBy:id,openedByName:id==='a'?'Χρυσάνθη':'Γιάννης',openedAt:`2026-10-${21+i}T06:00:00Z`,closedAt:`2026-10-${21+i}T14:00:00Z`,shiftLabel:'Πρωινή'},sourceHash:hash(id),initialCents:cents,basisCents:cents,cardCents:20000,explainedCents:0,reviewStatus:'VALID',nextClosed:i===0,transactions:[]} ]));
 sessions.get('a').session.nextSession={...sessions.get('b').session};
 const source={store:{id:'store',name},rule:{mode:'FULL',carryOverEnabled:true},sessions,selectedIds:['a'],period:{from:'2026-10-21',to:'2026-10-21'},coverage:'BOUNDED_CLOSED_SHIFTS'};
 const records=offset?[{id:'offset',sequence:1,actorName:'Χρήστος Μάνης',data:{kind:'OFFSET',previousSessionId:'a',nextSessionId:'b',previousHash:hash('a'),nextHash:hash('b'),amountCents:8000},proof:{previousHash:hash('a'),nextHash:hash('b')}}]:[];
 if(reviewed){const row=projectReconciliation(source,records).rows[0];records.push({id:'confirmation',sequence:records.length+1,actorName:'Χρήστος Μάνης',data:{kind:'CONFIRM',sessionId:'a',sourceHash:row.sourceHash,planHash:row.planHash,note:'Ελέγχθηκαν τα πρωτότυπα.'},proof:{}});}
 return {...projectReconciliation(source,records),head:hash(records),generation:'0'};
}
const legacy=[{sessionId:'a',reviewValid:true,variance:-87,cardVariance:200}];
async function envelope(r=report()){
 const reader=createReviewedCashEmailReader({db:{},authorize:async()=>({scope:{companyId:'co',storeId:'store'}}),repository:{generation:async()=>'0',read:async scope=>{assert.equal(scope.fullAudit,true);return r}}});
 return reader({id:'actor'},'store','2026-10-21');
}
const render=e=>renderReviewedCashEmail({evidence:e,companyId:'co',storeId:'store',storeName:e.report.storeName,date:'2026-10-21'});
test('email uses the actual shared reviewed projection, exact text and offset amount; cards and other-day context never reduce cash',async()=>{
 const e=await envelope(),mail=render(e);assert.equal(mail.text,e.report.text);assert.equal(e.report.rows[0].remainingCents,-700);assert.match(mail.text,/Χρυσάνθη: Έλλειμμα 7,00/);assert.match(mail.text,/POS–EFTPOS: διαφορά \+200,00/);assert.match(mail.text,/ΜΑΝΗΣ ΧΡΗΣΤΟΣ/);assert.match(mail.text,/Ελεγμένα ελλείμματα: 7,00/);assert.equal(reviewedCashEmailReadiness(e,legacy),true);assert.equal((mail.html.match(/<table/g)||[]).length,2);assert.match(mail.html,/Μετρητά και παραδόσεις/);assert.match(mail.html,/Κάρτες POS–EFTPOS/);assert.equal(assertReviewedCashEmailPreview(e,{reportHash:e.fingerprint,generation:'0'}),e);
});
test('pending review stays pending; both existing freshness and reviewed gates are required; row identity drift refuses',async()=>{
 const pending=await envelope(report({reviewed:false}));assert.equal(reviewedCashEmailReadiness(pending,legacy),false);assert.match(render(pending).text,/ΥΠΟ ΕΛΕΓΧΟ/);
 const e=await envelope();assert.equal(reviewedCashEmailReadiness(e,[{...legacy[0],reviewValid:false}]),false);assert.throws(()=>reviewedCashEmailReadiness(e,[{...legacy[0],sessionId:'foreign'}]));assert.throws(()=>reviewedCashEmailReadiness(e,[]));
});
test('same cash report hash with a changed audit head or checkpoint cannot send unseen new text; wrong generation, store and date reject',async()=>{
 const e=await envelope(),changed=await envelope({...e.report,head:hash('new-history')});assert.equal(e.report.reportHash,changed.report.reportHash);assert.notEqual(e.fingerprint,changed.fingerprint);assert.throws(()=>assertReviewedCashEmailPreview(changed,{reportHash:e.fingerprint,generation:'0'}));assert.throws(()=>assertReviewedCashEmailPreview(e,{reportHash:e.fingerprint,generation:'1'}));assert.throws(()=>renderReviewedCashEmail({evidence:e,companyId:'foreign',storeId:'store',storeName:e.report.storeName,date:'2026-10-21'}));assert.throws(()=>renderReviewedCashEmail({evidence:e,companyId:'co',storeId:'store',storeName:e.report.storeName,date:'2026-10-22'}));assert.throws(()=>render({...e,report:{...e.report,text:'FAKE FINAL LIABILITY'}}));
});
test('only escaped prose and a separately labelled comment enter HTML; preview does not claim final cash',async()=>{
 const e=await envelope(report({reviewed:false,name:'<img src=x onerror=bad>'})),m=renderReviewedCashEmail({evidence:e,companyId:'co',storeId:'store',storeName:e.report.storeName,date:'2026-10-21',comment:'<script>bad</script>',previewOnly:true});assert.match(m.text,/^ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΑΝΑΦΟΡΑΣ/);assert.match(m.text,/Πρόσθετο σχόλιο αποστολής:/);assert.match(m.html,/&lt;img/);assert.match(m.html,/&lt;script/);assert.doesNotMatch(m.html,/<script|<img/);assert.match(m.html,/Περιμένω απάντηση μέσω email/);
});
test('reader checks admission twice and original generation after source read; invalid date never reaches admission and failures do not leak',async()=>{
 let admission=0,reads=0,generation=0;const r=report(),reader=createReviewedCashEmailReader({db:{},authorize:async()=>{admission++;if(admission===2)throw Object.assign(Error('PRIVATE TOKEN'),{status:403});return {scope:{companyId:'co',storeId:'store'}}},repository:{generation:async()=>String(generation),read:async()=>{reads++;return r}}});
 await assert.rejects(reader({},'store','2026-02-30'),e=>e.status===400);assert.equal(admission,0);await assert.rejects(reader({},'store','2026-10-21'),e=>e.status===403&&!e.message.includes('PRIVATE'));assert.equal(reads,1);
 const stale=createReviewedCashEmailReader({db:{},authorize:async()=>({scope:{companyId:'co',storeId:'store'}}),repository:{generation:async()=>String(generation),read:async()=>{generation++;return r}}});await assert.rejects(stale({},'store','2026-10-21'),e=>e.code==='CASH_EMAIL_RECHECK_REQUIRED');
 for(const bad of [{...r,storeId:'foreign'},{...r,generation:'2'},{...r,head:undefined},{...r,coverage:'LIMITED'},{...r,period:{from:'2026-10-20',to:'2026-10-20'}}])await assert.rejects(envelope(bad));
});

test('a current calculated provisional report can keep open document and handoff questions without a forged confirmation',async()=>{
 const r=report({reviewed:false,offset:false}),row=r.rows[0];
 const session={id:'a',companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedAt:row.openedAt,closedAt:row.closedAt,openingDrawer:100,openingCustody:0,openingCoins:0,openingOperational:100,closingDrawer:13,closingCustody:0,closingCoins:0,actualOperational:13,expectedOperational:100,variance:-87,cashSales:0,expenses:0,cardSales:200,eftposTotal:0,cardVariance:200};
 row.automaticAudit=assessAutomaticCash({session,transactions:[{id:'card',companyId:'co',storeId:'store',sessionId:'a',type:'SALE_CARD',amount:200,reversedAt:null}],rule:{mode:'FULL',carryOverEnabled:true}});
 row.expenseFindings=[{code:'EXPENSE_WITHOUT_DOCUMENT',amountCents:1000,occurredAt:null}];r.text=reconciliationText(r);
 const e=await envelope(r);assert.equal(reviewedCashEmailReadiness(e,legacy),true);assert.equal(e.report.rows[0].reviewed,false);assert.equal(e.report.totals.shortageCents,0);assert.match(render(e).text,/χωρίς παραστατικό/);assert.match(render(e).text,/Αναμονή κλεισίματος/);assert.doesNotMatch(render(e).text,/ΜΑΝΗΣ ΧΡΗΣΤΟΣ/);
 assert.equal(reviewedCashEmailReadiness(e,[{...legacy[0],reviewValid:false}]),false);
 for(const patch of [{expectedOperational:99},{eftposTotal:null}]){
  row.automaticAudit=assessAutomaticCash({session:{...session,...patch},transactions:[{id:'card',companyId:'co',storeId:'store',sessionId:'a',type:'SALE_CARD',amount:200,reversedAt:null}],rule:{mode:'FULL',carryOverEnabled:true}});r.text=reconciliationText(r);
  assert.equal(reviewedCashEmailReadiness(await envelope(r),legacy),false);
 }
});

function fullReport(mutate=()=>{}){
 const session={id:'a',companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedBy:'synthetic-operator',openedByName:'Χειριστής δοκιμής',openedAt:'2026-10-21T06:00:00Z',closedAt:'2026-10-21T14:00:00Z',shiftLabel:'Πρωινή'};
 const source={store:{id:'store',name:'Συνθετικό κατάστημα'},rule:{mode:'FULL',carryOverEnabled:false},sessions:new Map([['a',{
  session,sourceHash:hash('synthetic-source'),initialCents:-500,basisCents:-500,explainedCents:0,cardCents:0,nextClosed:false,reviewStatus:'VALID',transactions:[],automaticTransactions:[],
  automaticSnapshot:{openingDrawer:100,openingCustody:0,openingCoins:0,openingOperational:100,closingDrawer:95,closingCustody:0,closingCoins:0,actualOperational:95,expectedOperational:100,variance:-5,cashSales:0,expenses:0,cardSales:0,eftposTotal:0,cardVariance:0},
  eventSales:{status:'AVAILABLE',findings:[],financialAdjustmentCents:0,evidenceHash:hash('synthetic-price-events')},
  fullEvidence:{events:{status:'AVAILABLE',findings:[{code:'RETURN_ITEMS',eventId:'synthetic-event',occurredAt:'2026-10-21T10:00:00.000Z'}],unassignedCount:0,evidenceHash:hash('synthetic-events')},duplicates:{salesStatus:'LINKED_POS_SCOPE',duplicateWindowSeconds:60,findings:[{code:'SALE_LINE_DUPLICATE_CANDIDATE',transactions:[{saleId:'synthetic-sale-one',receiptNumber:'TEST-001'},{saleId:'synthetic-sale-two',receiptNumber:'TEST-002'}],secondsApart:30}]}}
 }]]),selectedIds:['a'],period:{from:'2026-10-21',to:'2026-10-21'},coverage:'BOUNDED_CLOSED_SHIFTS',
 paperEvidence:{version:1,storeId:'store',status:'INCOMPLETE',items:[{sourceId:'synthetic-paper',filename:'synthetic-paper.png',line:null,status:'UNRESOLVED',reason:'NOT_READ'}],coverage:{discoveryComplete:true,complete:false},financialAdjustmentCents:0,humanApproval:false,hash:hash('synthetic-papers')}};
 mutate(source);
 return {...projectReconciliation(source,[]),generation:'0',head:'ROOT'};
}
const noManualReview=[{sessionId:'a',reviewValid:false,reviewDecision:null,reviewedAt:null,reviewedBy:null}];
test('full pending findings remain in the system-generated email without a sender comment or manual review',async()=>{
 const e=await envelope(fullReport()),before=structuredClone(e),mail=render(e),row=e.report.rows[0];
 assert.equal(reviewedCashEmailReadiness(e,noManualReview),true);assert.equal(row.fullAudit.status,'PENDING');assert.equal(row.reviewed,false);assert.equal(row.fullAudit.humanApproval,false);assert.equal(row.fullAudit.financialAdjustmentCents,0);assert.equal(e.report.totals.shortageCents,0);assert.equal(e.report.calculatedResult.shortageCents,500);
 assert(['EVENTS','DUPLICATES','PAPERS'].every(code=>row.fullAudit.pendingChecks.includes(code)));
 assert.equal(mail.text,e.report.text);assert.match(mail.text,/Η αναφορά δημιουργήθηκε αυτόματα από το MyWorkStation/);assert.match(mail.text,/χρειάζεται έλεγχος και διευκρίνιση από τον υπεύθυνο ή τον ιδιοκτήτη/);assert.match(mail.text,/Μερική επιστροφή ειδών/);assert.match(mail.text,/TEST-001 \/ TEST-002/);assert.match(mail.text,/synthetic-paper\.png.*δεν έχει διαβαστεί/);assert.doesNotMatch(mail.text,/Πρόσθετο σχόλιο αποστολής|ΤΕΛΙΚΟ ΤΕΚΜΗΡΙΩΜΕΝΟ ΑΠΟΤΕΛΕΣΜΑ/);
 assert.throws(()=>projectAutomaticReviewedReport(e.report),/Cash report text changed/,'the separate public scheduled-report contract is unchanged');assert.deepEqual(e,before,'readiness must not strip or rewrite the delivered full envelope');
});
test('full evidence is validated before readiness and evidence-only changes stale an earlier email preview',async()=>{
 const e=await envelope(fullReport());
 for(const mutate of [r=>{r.rows[0].fullAudit.humanApproval=true},r=>{r.rows[0].fullCoverage.duplicates.unresolvedCount=0},r=>{r.rows[0].fullEvidence.duplicates.findings=[]},r=>{r.paperEvidence.coverage.complete=true},r=>{r.text+='\nFORGED'}]){
  const forged=structuredClone(e);mutate(forged.report);assert.throws(()=>reviewedCashEmailReadiness(forged,noManualReview));assert.throws(()=>render(forged));
 }
 for(const mutate of [s=>{s.paperEvidence.hash=hash('changed-cached-paper')},s=>{s.sessions.get('a').fullEvidence.events.evidenceHash=hash('changed-full-events')}]){
  const changed=await envelope(fullReport(mutate));assert.equal(changed.report.text,e.report.text);assert.equal(changed.report.rows[0].remainingCents,e.report.rows[0].remainingCents);assert.notEqual(changed.fingerprint,e.fingerprint);assert.throws(()=>assertReviewedCashEmailPreview(changed,{reportHash:e.fingerprint,generation:'0'}));
 }
});
test('full pending reports retain arithmetic, card availability and stale-review delivery holds',async()=>{
 for(const patch of [{expectedOperational:99},{eftposTotal:null}]){
  const e=await envelope(fullReport(s=>Object.assign(s.sessions.get('a').automaticSnapshot,patch)));assert.equal(reviewedCashEmailReadiness(e,noManualReview),false);
 }
 const e=await envelope(fullReport());
 for(const patch of [{reviewDecision:'APPROVED'},{reviewedAt:'2026-10-20T10:00:00Z'},{reviewedBy:'stale-reviewer'}])assert.equal(reviewedCashEmailReadiness(e,[{...noManualReview[0],...patch}]),false);
});
