import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expenseDocumentCheck,readCashExpenseEvidence,cashExpenseFindings} from '../src/services/cash-expense-evidence.js';
import {partitionCashAuditEvents} from '../src/services/cash-audit-association.js';
import {readCashReviewState,confirmedExplanationBalance} from '../src/services/cash-review-balance.js';
const row={id:'first',sessionId:null,type:'OTHER_EXPENSE',amount:31,subtractFromShift:false,purchaseDocumentId:'doc',hasAttachment:false};
const doc={id:'doc',documentStatus:'APPROVED',documentTotal:124,documentPaymentTotal:124,cashPaymentTotal:0,externalPaymentTotal:124,paymentCount:3,invalidPaymentCount:0};
test('accepted equal and cent installments reconcile as totals and retain distinct original movements',()=>{
 for(const [total,amounts] of [[124,[31,31,62]],[1.24,[.03,.03,1.18]]]){
  const rows=amounts.map((amount,i)=>({...row,id:'p'+i,amount})),before=JSON.stringify(rows);
  const checks=rows.map(r=>expenseDocumentCheck(r,{...doc,documentTotal:total,documentPaymentTotal:total,externalPaymentTotal:total}));
  assert(checks.every(r=>r.status==='MATCHED'&&r.difference===0&&r.paymentCount===3&&r.paymentSource==='EXTERNAL'));
  assert.equal(checks.length,3);assert.equal(checks[0].amount,checks[1].amount);assert.equal(JSON.stringify(rows),before);assert.deepEqual(cashExpenseFindings(checks),[]);
 }
});
test('partial/mixed-source/overpayment uses document settlement and never changes row amount or cash variance',()=>{
 const cash={...row,amount:31,subtractFromShift:true,sessionId:'old-shift'},input=JSON.stringify(cash);
 let out=expenseDocumentCheck(cash,{...doc,documentPaymentTotal:62,cashPaymentTotal:31,externalPaymentTotal:31,paymentCount:2});
 assert.equal(out.status,'PARTIALLY_PAID');assert.equal(out.remainingDocumentAmount,62);assert.equal(out.amount,31);assert.equal(out.cashPaymentTotal,31);assert.equal(out.externalPaymentTotal,31);assert.equal(cashExpenseFindings([out])[0].code,'EXPENSE_DOCUMENT_PARTIAL');
 out=expenseDocumentCheck(cash,{...doc,cashPaymentTotal:31,externalPaymentTotal:93});assert.equal(out.status,'MATCHED');
 out=expenseDocumentCheck(cash,{...doc,documentPaymentTotal:125,cashPaymentTotal:31,externalPaymentTotal:94});assert.equal(out.status,'AMOUNT_MISMATCH');assert.equal(out.difference,1);assert.equal(cashExpenseFindings([out])[0].documentPaymentTotal,125);assert.equal(JSON.stringify(cash),input);
});
test('missing document, image-only, unavailable, invalid and reversed data cannot certify amount reconciliation',()=>{
 assert.equal(expenseDocumentCheck({...row,purchaseDocumentId:null},null).status,'NO_DOCUMENT');
 assert.equal(expenseDocumentCheck({...row,purchaseDocumentId:null,hasAttachment:true},null).status,'ATTACHMENT_ONLY');
 assert.equal(expenseDocumentCheck(row,null).status,'DOCUMENT_UNRESOLVED');assert.equal(expenseDocumentCheck(row,doc,'UNAVAILABLE').status,'SOURCE_UNAVAILABLE');
 for(const bad of [{documentStatus:'DRAFT'},{documentTotal:0},{documentTotal:NaN},{documentTotal:124.001},{documentPaymentTotal:NaN},{invalidPaymentCount:1},{paymentCount:0},{cashPaymentTotal:1}])assert.equal(expenseDocumentCheck(row,{...doc,...bad}).status,'DOCUMENT_RECHECK');
 for(const bad of [{amount:-1},{amount:null},{amount:31.001},{subtractFromShift:null},{subtractFromShift:true,sessionId:null}])assert.equal(expenseDocumentCheck({...row,...bad},doc).status,'DOCUMENT_RECHECK');
 const reversed=expenseDocumentCheck({...row,reversedAt:'2026-10-16'},null);assert.equal(reversed.status,'REVERSED');assert.deepEqual(cashExpenseFindings([reversed]),[]);
});
test('reader is bounded/read-only, one owned aggregate across periods, unavailable source remains explicit',async()=>{
 const calls=[],db={$queryRaw:async(strings,...values)=>{calls.push({sql:strings.join(''),values});return [doc]}};
 const checks=await readCashExpenseEvidence(db,{companyId:'c',storeId:'s'},[row,{...row,id:'second'},{...row,id:'sale',type:'SALE_CASH'}]);assert.equal(checks.length,2);assert(checks.every(c=>c.status==='MATCHED'));assert.equal(calls.length,1);assert.deepEqual(calls[0].values.slice(-3),['c','s',['doc']]);assert(!/INSERT|UPDATE|DELETE/.test(calls[0].sql));
 const fail=await readCashExpenseEvidence({$queryRaw:async()=>{throw Error('missing table')}},{companyId:'c',storeId:'s'},[row]);assert.equal(fail[0].status,'SOURCE_UNAVAILABLE');
 assert.equal((await readCashExpenseEvidence(db,{storeId:'s'},[row]))[0].status,'SOURCE_UNAVAILABLE');
});
const session={id:'shift',sessionId:'shift',companyId:'c',storeId:'s',openedAt:new Date('2026-10-01T04:00Z'),closedAt:new Date('2026-10-01T12:00Z'),variance:-5};
const transactions=[{...row,sessionId:'shift',subtractFromShift:true}],paid={...doc,cashPaymentTotal:31,externalPaymentTotal:93};
const db={$queryRaw:async strings=>{const sql=strings.join('');return sql.includes('FROM "PurchaseDocument" p')?[paid]:sql.includes('SELECT s.*')?[session]:sql.includes('FROM "StoreTransaction"')?transactions:[]}};
test('actual Platform and cloud investigators share matched, missing, partial and overpaid findings without changing variance',async()=>{
 const api=readFileSync(new URL('../src/routes/platform-admin.js',import.meta.url),'utf8'),body=api.slice(api.indexOf('function platformCashAuditAmount('),api.indexOf('function companyView('));
 const source=readFileSync(new URL('../src/routes/cash-control.js',import.meta.url),'utf8'),start=source.indexOf('router.get("/sessions/:sessionId/investigation"'),end=source.indexOf('router.post("/sessions/:sessionId/reviews"',start);
 for(const [currentRows,currentDoc,status,code] of [
  [transactions,paid,'MATCHED',null],
  [[{...transactions[0],purchaseDocumentId:null}],null,'NO_DOCUMENT','EXPENSE_WITHOUT_DOCUMENT'],
  [transactions,{...paid,documentPaymentTotal:62,externalPaymentTotal:31,paymentCount:2},'PARTIALLY_PAID','EXPENSE_DOCUMENT_PARTIAL'],
  [transactions,{...paid,documentPaymentTotal:125,externalPaymentTotal:94},'AMOUNT_MISMATCH','EXPENSE_DOCUMENT_MISMATCH'],
  [transactions,null,'DOCUMENT_UNRESOLVED','EXPENSE_DOCUMENT_UNVERIFIED']
 ]){
  const scopedDb={$queryRaw:async strings=>{const sql=strings.join('');return sql.includes('FROM "PurchaseDocument" p')?(currentDoc?[currentDoc]:[]):sql.includes('SELECT s.*')?[session]:sql.includes('FROM "StoreTransaction"')?currentRows:[]}};
  const investigate=new Function('prisma','partitionCashAuditEvents','readCashReviewState','readCashExpenseEvidence','cashExpenseFindings',body+';return platformCashInvestigation;')(scopedDb,partitionCashAuditEvents,readCashReviewState,readCashExpenseEvidence,cashExpenseFindings);
  const platform=await investigate(session,{purchaseDocuments:true,operator:true,actions:true,safety:true});assert.equal(platform.expenseChecks[0].status,status);assert.equal(platform.completed,false);
  let handler;
  const deps={router:{get:(_path,fn)=>{handler=fn}},route:fn=>fn,prisma:scopedDb,normalize:x=>x,assertStoreAccess:()=>{},ownedStore:async()=>({}),cashControlRule:async()=>({mode:'FULL'}),existingAuditTables:async()=>({}),partitionCashAuditEvents,readCashExpenseEvidence,cashExpenseFindings,confirmedExplanationBalance,suspiciousOperatorEvent:()=>true,auditAmount:()=>null,money:v=>Number(v||0),reviewSnapshot:async()=>({}),sameSnapshot:()=>true};
  new Function(...Object.keys(deps),source.slice(start,end))(...Object.values(deps));let cloud;await handler({params:{sessionId:'shift'},user:{companyId:'c'}},{json:x=>{cloud=x}});
  assert.deepEqual(cloud.expenseChecks,platform.expenseChecks);assert.equal(cloud.initialVariance,-5);assert.equal(cloud.unexplainedVariance,-5);assert.equal(cloud.transactions[0].amount,31);assert.equal(cloud.coverageStatus,'PROVISIONAL');
  for(const result of [cloud,platform])assert.deepEqual(result.findings.filter(f=>f.code.startsWith('EXPENSE_')).map(f=>f.code),code?[code]:[]);
 }
});
test('actual written finding labels disclose aggregate period/source and cannot imply automatic cash deduction',()=>{
 const ui=readFileSync(new URL('../../client/src/components/platform/PlatformAdminApp.jsx',import.meta.url),'utf8'),label=new Function(ui.slice(ui.indexOf('const cashNumber='),ui.indexOf('const cashWrittenReport='))+';return cashFindingLabel;')();
 const partial=expenseDocumentCheck(row,{...doc,documentPaymentTotal:62,externalPaymentTotal:62,paymentCount:2});const text=label(cashExpenseFindings([partial])[0]);assert.match(text,/Μερική εξόφληση/);assert.match(text,/ανεξαρτήτως περιόδου/);assert.match(text,/εκτός ταμείου/);assert.match(text,/δεν αφαιρούνται ξανά/);
 const image=label(cashExpenseFindings([expenseDocumentCheck({...row,purchaseDocumentId:null,hasAttachment:true},null)])[0]);assert.match(image,/χωρίς επιβεβαιωμένη συμφωνία ποσών/);assert.match(image,/Δεν εξηγεί αυτόματα/);
});
test('actual daily report leaves selected-period expense totals intact while reading lifetime settlement',async()=>{
 const source=readFileSync(new URL('../src/routes/cash-control.js',import.meta.url),'utf8'),start=source.indexOf('router.get("/stores/:storeId/daily-summary"'),end=source.indexOf('router.get("/sessions/:sessionId/investigation"',start);let handler;
 const dailyDb={$queryRaw:async strings=>{const sql=strings.join('');return sql.includes('FROM "PurchaseDocument" p')?[paid]:sql.includes('SELECT * FROM "CashShiftSession"')?[{...session,status:'CLOSED',expenses:31,variance:-5}]:sql.includes('SELECT t."id"')?transactions:[];}};
 const deps={router:{get:(_path,fn)=>{handler=fn}},route:fn=>fn,prisma:dailyDb,assertStoreAccess:()=>{},ownedStore:async()=>({id:'s'}),reportDateSchema:{parse:x=>x},resolveCashReportPeriod:()=>({from:'2026-10-01',to:'2026-10-01'}),ensurePosSaleSafetySchema:async()=>{},cashControlRule:async()=>({mode:'FULL'}),normalize:x=>x,money:v=>Number(v||0),readCashExpenseEvidence,buildKatShiftReconciliation:()=>({status:'AGREEMENT'})};
 new Function(...Object.keys(deps),source.slice(start,end))(...Object.values(deps));let result;await handler({params:{storeId:'s'},query:{date:'2026-10-01'},user:{companyId:'c'}},{json:x=>{result=x}});
 assert.equal(result.totals.expenses,31);assert.equal(result.totals.variance,-5);assert.equal(result.expenseChecks[0].documentPaymentTotal,124);assert.equal(result.expenseChecks[0].cashPaymentTotal,31);assert.equal(result.expenseChecks[0].externalPaymentTotal,93);assert(!result.alerts.some(x=>x.type==='AMOUNT_MISMATCH'));assert.equal(result.coverageStatus,'PROVISIONAL');
});
