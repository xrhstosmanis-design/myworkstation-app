import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {cashArchiveWorkbook,archiveArguments,readCashReviewedArchive,cashArchiveSourceHash} from '../src/services/cash-reviewed-archive.js';
import {reconciliationText,projectReconciliation} from '../src/services/cash-reconciliation-report.js';
import {hash} from '../src/services/cash-reconciliation-contract.js';

const scope={companyId:'co',storeId:'store',generation:'0'},period={from:'2026-10-21',to:'2026-10-23'};
function fixture(){
 const rows=[['a','2026-10-21','employee',-8700,-700,8000,20000,true],['b','2026-10-22','employee',500,500,0,0,true],['c','2026-10-23',null,null,null,0,null,false]].map(([sessionId,day,operatorId,initialCents,remainingCents,offsetCents,cardCents,reviewed])=>({sessionId,day,openedAt:day+'T06:00:00Z',closedAt:day+'T14:00:00Z',terminalPos:'MAIN',operatorId,employeeKey:operatorId?'operator:'+operatorId:'session:'+sessionId,identityRequiresReview:!operatorId,shiftLabel:'Πρωινή',operatorName:operatorId?'Χρυσάνθη':'ΕΚΤΑΚΤΟΣ',initialCents,remainingCents,offsetCents,cardCents,reviewed,status:reviewed?'REVIEWED':'AWAITING_NEXT_SHIFT',reviewedBy:reviewed?'Χρήστος Μάνης':null,reviewNote:reviewed?'Λάθος καταμέτρηση επιβεβαιωμένη.':null,transactions:[{secret:'PRIVATE'}]}));
 const r={storeId:'store',storeName:'Δοκιμή',generation:'0',period,head:hash('head'),reportHash:hash('source'),coverage:'BOUNDED_CLOSED_SHIFTS',financialFinality:'REVIEWED_CASH_ROWS_ONLY',originalFinancialLedgerChanged:false,rows,context:[{secret:'PRIVATE'}],employees:[{key:'operator:employee',name:'Χρυσάνθη',identityRequiresReview:false,shortageCents:700,surplusCents:500}],totals:{shortageCents:700,surplusCents:500,pending:1},checkpoint:{resumeFrom:'2026-10-23',current:true,period,pendingNotes:['Αναμονή ενημέρωσης για ακύρωση Vodafone 20 €.']}};r.text=reconciliationText(r);return r;
}
const book=r=>XLSX.read(cashArchiveWorkbook(r,scope),{type:'buffer'}),values=(b,name)=>XLSX.utils.sheet_to_json(b.Sheets[name],{header:1,defval:null});
test('actual XLSX retains net reviewed cents, separate shortages/surpluses across days, cards, unknown blanks, exact prose and continuation without private context',()=>{
 const r=fixture(),b=book(r);assert.equal(b.SheetNames.length,6);
 const shifts=values(b,'Βάρδιες');assert.match(shifts[1][2],/09:00:00/);assert.match(shifts[1][3],/17:00:00/);assert.equal(shifts[1][4],'MAIN');assert.deepEqual(shifts[1].slice(10,16),[-87,80,-7,7,0,200]);assert.deepEqual(shifts[3].slice(10,16),[null,0,null,null,null,null]);
 const totals=values(b,'Ανά εργαζόμενο');assert.equal(totals.length,2);assert.deepEqual(totals[1].slice(-3),[2,7,5]);
 const days=values(b,'Ανά ημέρα');assert.equal(days.length,3);assert.deepEqual(days[1].slice(-2),[7,0]);assert.deepEqual(days[2].slice(-2),[0,5]);
 assert.deepEqual(values(b,'Αναφορά').slice(1).map(v=>v[0]||'').join('\n'),r.text);
 const all=JSON.stringify(b);assert(!all.includes('PRIVATE'));assert(all.includes('Vodafone'));assert(all.includes('Μη πλήρη στοιχεία καρτών'));assert(all.includes('Αναμονή επόμενης βάρδιας'));
});
test('shared names stay per-session and same names with different real operator IDs stay separate, never employee net balances',()=>{
 for(const shared of [false,true]){
  const r=fixture();r.rows=r.rows.slice(0,2);r.totals.pending=0;r.checkpoint=null;
  for(const row of r.rows){row.operatorName='Ίδιο όνομα';row.operatorId=shared?'shared':row.sessionId;row.identityRequiresReview=shared;row.employeeKey=shared?'session:'+row.sessionId:'operator:'+row.operatorId;}
  r.employees=r.rows.map(row=>({key:row.employeeKey,name:row.operatorName,identityRequiresReview:shared,shortageCents:Math.max(0,-row.remainingCents),surplusCents:Math.max(0,row.remainingCents)}));r.text=reconciliationText(r);
  const rows=values(book(r),'Ανά εργαζόμενο');assert.equal(rows.length,3);assert.deepEqual(rows.slice(1).map(v=>v.slice(-2)),[[7,0],[0,5]]);
 }
});
test('canonical row identity classification includes conflicting aliases in context and matches the existing employee grouping',()=>{
 const sessions=new Map(['a','b'].map((id,i)=>[id,{session:{id,companyId:'co',storeId:'store',openedBy:'one-login',openedByName:i?'Different alias':'First alias',status:'CLOSED',terminalPos:'MAIN',openedAt:'2026-10-21T05:00:00Z',closedAt:'2026-10-21T13:00:00Z',shiftLabel:'Πρωινή'},sourceHash:hash(id),initialCents:0,basisCents:0,cardCents:0,explainedCents:0,reviewStatus:'VALID',nextClosed:true,transactions:[]} ]));
 const r=projectReconciliation({sessions,selectedIds:['a'],store:{id:'store',name:'Δοκιμή'},rule:{mode:'FULL',carryOverEnabled:false},period,coverage:'BOUNDED_CLOSED_SHIFTS'},[]);assert.equal(r.rows[0].employeeKey,'session:a');assert.equal(r.rows[0].identityRequiresReview,true);assert.equal(r.context[0].employeeKey,'session:b');const old=structuredClone(r);old.rows[0].identityRequiresReview=false;old.rows[0].employeeKey='operator:one-login';assert.equal(old.text,r.text);assert.notEqual(cashArchiveSourceHash(old),cashArchiveSourceHash(r));
});
test('untrusted spreadsheet strings remain text cells without formulas/hyperlinks; inconsistent reviewed totals and foreign scope refuse',()=>{
 const r=fixture(),label='=HYPERLINK("https://example.invalid","unsafe")';r.storeName=label;r.checkpoint.pendingNotes=[label];r.text=reconciliationText(r);const b=book(r);
 for(const name of b.SheetNames)for(const [key,cell]of Object.entries(b.Sheets[name]))if(!key.startsWith('!')){assert.equal(cell.f,undefined);assert.equal(cell.l,undefined);if(cell.v===label)assert.equal(cell.t,'s');}
 assert.throws(()=>cashArchiveWorkbook(r,{...scope,storeId:'foreign'}));r.totals.shortageCents=8700;assert.throws(()=>book(r));
});
test('strict receipt requires valid bounded dates, original generation/hash/head and no extra scope',()=>{
 const q={...period,generation:'0',reportHash:hash('source'),head:hash('head'),previewHash:hash('preview')};assert(archiveArguments.safeParse(q).success);
 for(const extra of [{storeId:'foreign'},{companyId:'foreign'},{url:'https://example.invalid'},{format:'xlsm'}])assert(!archiveArguments.safeParse({...q,...extra}).success);
 for(const change of [{from:'2026-02-30'},{to:'2026-12-31'},{generation:'9223372036854775808'},{reportHash:'bad'},{head:undefined},{previewHash:undefined}])assert(!archiveArguments.safeParse({...q,...change}).success);
});
test('canonical reader rechecks authorization, generation and source head after workbook creation, with no writer or provider call',async()=>{
 for(const mutation of ['none','head','hash','generation','role','scope','text','identity','role-final','scope-final','generation-final']){
  const r=fixture(),q={...period,generation:r.generation,head:r.head,reportHash:r.reportHash,previewHash:cashArchiveSourceHash(r)};let reads=0,auth=0;
  const repository={generation:async()=>mutation==='generation'&&reads||mutation==='generation-final'&&reads>1?'1':'0',read:async()=>{reads++;const next=structuredClone(r);if(reads>1&&mutation==='head')next.head=hash('changed');if(reads>1&&mutation==='hash')next.reportHash=hash('changed');if(reads>1&&mutation==='text')next.text+='\nA new pending note';if(reads>1&&mutation==='identity')next.rows[2].employeeKey='session:changed';return next;}};
  const authorize=async()=>{auth++;if(auth>1&&mutation==='role'||auth===3&&mutation==='role-final')throw Object.assign(Error('revoked'),{status:403});return {scope:{...scope,...((auth>1&&mutation==='scope'||auth===3&&mutation==='scope-final')?{companyId:'foreign'}:{})}};};
  const run=()=>readCashReviewedArchive({db:{$executeRaw:()=>assert.fail('No writer')},authorize,repository,req:{user:{id:'actor'},params:{storeId:'store'},query:q}});
  if(mutation==='none'){const out=await run();assert.equal(out.storeId,'store');assert.equal(reads,2);assert.equal(auth,3);assert(XLSX.read(Buffer.from(out.base64,'base64'),{type:'buffer'}).Sheets['Βάρδιες']);}
  else await assert.rejects(run(),e=>[403,409].includes(e.status));
 }
});
