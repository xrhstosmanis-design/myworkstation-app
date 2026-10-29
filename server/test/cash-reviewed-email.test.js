import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../src/services/cash-reconciliation-contract.js';
import {projectReconciliation} from '../src/services/cash-reconciliation-report.js';
import {createReviewedCashEmailReader,reviewedCashEmailReadiness,assertReviewedCashEmailPreview,renderReviewedCashEmail} from '../src/services/cash-reviewed-email.js';
import {assessAutomaticCash} from '../src/services/cash-automatic-audit.js';
import {reconciliationText} from '../src/services/cash-reconciliation-report.js';

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
 const reader=createReviewedCashEmailReader({db:{},authorize:async()=>({scope:{companyId:'co',storeId:'store'}}),repository:{generation:async()=>'0',read:async()=>r}});
 return reader({id:'actor'},'store','2026-10-21');
}
const render=e=>renderReviewedCashEmail({evidence:e,companyId:'co',storeId:'store',storeName:e.report.storeName,date:'2026-10-21'});
test('email uses the actual shared reviewed projection, exact text and offset amount; cards and other-day context never reduce cash',async()=>{
 const e=await envelope(),mail=render(e);assert.equal(mail.text,e.report.text);assert.equal(e.report.rows[0].remainingCents,-700);assert.match(mail.text,/Χρυσάνθη: Έλλειμμα 7,00/);assert.match(mail.text,/POS–EFTPOS: διαφορά \+200,00/);assert.match(mail.text,/ΜΑΝΗΣ ΧΡΗΣΤΟΣ/);assert.match(mail.text,/Ελεγμένα ελλείμματα: 7,00/);assert.equal(reviewedCashEmailReadiness(e,legacy),true);assert.doesNotMatch(mail.html,/<table/);assert.equal(assertReviewedCashEmailPreview(e,{reportHash:e.fingerprint,generation:'0'}),e);
});
test('pending review stays pending; both existing freshness and reviewed gates are required; row identity drift refuses',async()=>{
 const pending=await envelope(report({reviewed:false}));assert.equal(reviewedCashEmailReadiness(pending,legacy),false);assert.match(render(pending).text,/ΥΠΟ ΕΛΕΓΧΟ/);
 const e=await envelope();assert.equal(reviewedCashEmailReadiness(e,[{...legacy[0],reviewValid:false}]),false);assert.throws(()=>reviewedCashEmailReadiness(e,[{...legacy[0],sessionId:'foreign'}]));assert.throws(()=>reviewedCashEmailReadiness(e,[]));
});
test('same cash report hash with a changed audit head or checkpoint cannot send unseen new text; wrong generation, store and date reject',async()=>{
 const e=await envelope(),changed=await envelope({...e.report,head:hash('new-history')});assert.equal(e.report.reportHash,changed.report.reportHash);assert.notEqual(e.fingerprint,changed.fingerprint);assert.throws(()=>assertReviewedCashEmailPreview(changed,{reportHash:e.fingerprint,generation:'0'}));assert.throws(()=>assertReviewedCashEmailPreview(e,{reportHash:e.fingerprint,generation:'1'}));assert.throws(()=>renderReviewedCashEmail({evidence:e,companyId:'foreign',storeId:'store',storeName:e.report.storeName,date:'2026-10-21'}));assert.throws(()=>renderReviewedCashEmail({evidence:e,companyId:'co',storeId:'store',storeName:e.report.storeName,date:'2026-10-22'}));assert.throws(()=>render({...e,report:{...e.report,text:'FAKE FINAL LIABILITY'}}));
});
test('only escaped prose and a separately labelled comment enter HTML; preview does not claim final cash',async()=>{
 const e=await envelope(report({reviewed:false,name:'<img src=x onerror=bad>'})),m=renderReviewedCashEmail({evidence:e,companyId:'co',storeId:'store',storeName:e.report.storeName,date:'2026-10-21',comment:'<script>bad</script>',previewOnly:true});assert.match(m.text,/^ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΑΝΑΦΟΡΑΣ/);assert.match(m.text,/Πρόσθετο σχόλιο αποστολής:/);assert.match(m.html,/&lt;img/);assert.match(m.html,/&lt;script/);assert.doesNotMatch(m.html,/<script|<img|<table/);
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
