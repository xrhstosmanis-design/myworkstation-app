import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticReportConfigurationSchema} from '../src/services/automatic-report-settings.js';
import {cashRuleFields,legacyCashControlRule} from '../src/services/cash-control-rules.js';

const base=()=>({dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:23,terminals:[{terminalPos:'MAIN',requiredSlots:[1,2,3]}],cashRule:cashRuleFields(legacyCashControlRule({name:'LAB'}))});
test('optional reviewed mode preserves old settings shape and requires an explicit boolean',()=>{
  assert.deepEqual(automaticReportConfigurationSchema.parse(base()),base());
  for(const value of [true,false])assert.equal(automaticReportConfigurationSchema.parse({...base(),reviewedReconciliation:value}).reviewedReconciliation,value);
  for(const value of ['true',null,1,{}])assert.equal(automaticReportConfigurationSchema.safeParse({...base(),reviewedReconciliation:value}).success,false);
});

import {readAutomaticDailyCashPreview} from '../src/services/automatic-report-source.js';
import {buildAutomaticCashPayload} from '../src/services/automatic-report-cash-payload.js';
test('explicit reviewed mode fails closed until reviewed result is available',async()=>{
 const configuration={...base(),reviewedReconciliation:true};
 const rows=[7,15,23].map((hour,i)=>({id:String(i),companyId:'c',storeId:'s',terminalPos:'MAIN',status:'CLOSED',openedAt:new Date(`2026-10-15T${String(hour).padStart(2,'0')}:00:00+03:00`),closedAt:new Date(i===2?'2026-10-16T07:00:00+03:00':`2026-10-15T${hour+8}:00:00+03:00`),variance:0}));
 const tx={user:{findUnique:async()=>({role:'SUPER_ADMIN'})},store:{findFirst:async()=>({id:'s',companyId:'c',name:'LAB'})},$queryRaw:async strings=>strings.join('').includes('FROM "AutomaticReportSettings"')?[{version:1}]:strings.join('').includes('FROM "CashControlStoreRule"')?[]:rows};
 const preview=await readAutomaticDailyCashPreview({$transaction:fn=>fn(tx)},{actorId:'u',companyId:'c',storeId:'s',day:'2026-10-15',configuration,settingsVersion:1,now:new Date('2026-10-16T08:00:00+03:00')});
 assert.equal(preview.ready,true);
 assert.equal(preview.reviewedReconciliation,true);
 assert.throws(()=>buildAutomaticCashPayload({preview,companyId:'c',storeId:'s',settingsVersion:1}),e=>e.code==='INVALID_CASH_PAYLOAD');
});

import {createCashReconciliationRepository} from '../src/services/cash-reconciliation-repository.js';
test('internal selection rejects invalid, duplicate and stale requests before reading cash',async()=>{
 let reads=0;
 const tx={$queryRawUnsafe:async(sql)=>{reads++;return sql.includes('current_schema()')?[{schema:'fixture',fence:'fixture.StoreLifecycleFence'}]:[{companyId:'c',generation:'2',maintenance:false,retired:false}]},$queryRaw:async()=>{throw Error('unexpected cash read')}};
 const repo=createCashReconciliationRepository(tx),scope={companyId:'c',storeId:'s',generation:'1'},period={from:'2026-10-01',to:'2026-10-31'};
 for(const ids of [[],['same','same'],Array(201).fill('x'),['']])await assert.rejects(repo.readSelectedInTransaction(tx,scope,period,ids),e=>e.code==='CASH_RECONCILIATION_SCOPE_INVALID');
 assert.equal(reads,0);
 await assert.rejects(repo.readSelectedInTransaction(tx,scope,period,['shift']),e=>e.code==='STORE_LIFECYCLE_STALE_GENERATION');
 assert.equal(reads,2);
});

import {hash} from '../src/services/cash-reconciliation-contract.js';
import {projectReconciliation} from '../src/services/cash-reconciliation-report.js';
import {projectAutomaticReviewedReport,validateAutomaticReviewedReport} from '../src/services/cash-reviewed-automatic-contract.js';
import {canSendProvisionalCashReport} from '../src/services/cash-reviewed-automatic-contract.js';
test('common reviewed report preserves separate cash and cards and rejects changed source or totals',()=>{
 const s={session:{id:'a',companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedBy:'employee',openedByName:'Σούλα',openedAt:'2026-10-21T06:00:00Z',closedAt:'2026-10-21T14:00:00Z',shiftLabel:'Πρωινή'},sourceHash:hash('session'),initialCents:-700,basisCents:-700,cardCents:20000,explainedCents:0,reviewStatus:'VALID',nextClosed:true,transactions:[{id:'PRIVATE_TRANSACTION'}]};
 s.expenseFindings=[{code:'EXPENSE_WITHOUT_DOCUMENT',amountCents:12000,occurredAt:'2026-10-21T07:00:00.000Z'}];
 const source={store:{id:'store',name:'Δοκιμή'},rule:{mode:'FULL',carryOverEnabled:true},sessions:new Map([['a',s]]),selectedIds:['a'],period:{from:'2026-10-21',to:'2026-10-21'},coverage:'BOUNDED_CLOSED_SHIFTS'};
 const initial=projectReconciliation(source,[]),r=initial.rows[0],record={id:'review',sequence:1,actorName:'Χρήστος Μάνης',data:{kind:'CONFIRM',sessionId:'a',sourceHash:r.sourceHash,planHash:r.planHash,note:'Ελέγχθηκε η βάρδια.'},proof:{}};
 const report=projectAutomaticReviewedReport(projectReconciliation(source,[record]));
 const input={companyId:'co',storeId:'store',dayStartHour:7,rule:{deliveryTerminalPattern:'DELIVERY'},groups:[{companyId:'co',storeId:'store',terminalPos:'MAIN',cashChain:'STORE',day:'2026-10-21',rows:[{sessionId:'a',employeeId:'employee',employeeName:'Σούλα',variance:-7}]}]};
 assert.equal(validateAutomaticReviewedReport(report,input),true);
 assert.match(report.text,/έξοδο 120,00\s*€ χωρίς παραστατικό/);
 assert.equal(validateAutomaticReviewedReport({...report,rows:[{...report.rows[0],expenseFindings:[]}]},input),false);
 assert.match(report.text,/POS–EFTPOS: διαφορά \+200,00/);assert.equal(JSON.stringify(report).includes('PRIVATE_TRANSACTION'),false);
 assert.equal(validateAutomaticReviewedReport({...report,totals:{...report.totals,shortageCents:0}},input),false);
 assert.equal(validateAutomaticReviewedReport(report,{...input,storeId:'foreign'}),false);
 assert.equal(validateAutomaticReviewedReport(report,{...input,groups:[{...input.groups[0],rows:[{...input.groups[0].rows[0],variance:-8}]}]}),false);
});

import {readReviewedAutomaticCash} from '../src/services/cash-reviewed-automatic-source.js';
test('unready or inaccessible sources never produce reviewed totals or expose errors',async()=>{
 const input={actorId:'actor',companyId:'co',storeId:'store',period:{fromDay:'2026-10-21',toDay:'2026-10-21',dayStartHour:7},rows:[{id:'a'}],groups:[],rule:{deliveryTerminalPattern:'DELIVERY'},sourceFingerprint:'a'.repeat(64)};
 assert.deepEqual(await readReviewedAutomaticCash({}, {...input,ready:false}),{status:'HOLD',reason:'SOURCE_NOT_READY',report:null});
 assert.deepEqual(await readReviewedAutomaticCash({user:{findUnique:async()=>{throw Error('private detail')}}}, {...input,ready:true}),{status:'HOLD',reason:'REVIEWED_SOURCE_UNAVAILABLE',report:null});
 assert.deepEqual(await readReviewedAutomaticCash({}, {...input,rows:[],ready:true}),{status:'HOLD',reason:'SOURCE_LIMIT_OR_EMPTY',report:null});
});


test('blank operator name stays explicitly unattributed without making source comparison fail',()=>{
 const session={id:'shift',companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedBy:null,openedByName:'',openedAt:'2026-10-21T06:00:00Z',closedAt:'2026-10-21T14:00:00Z',shiftLabel:'Πρωινή'};
 const source={store:{id:'store',name:'LAB'},rule:{mode:'FULL',carryOverEnabled:true},sessions:new Map([['shift',{session,sourceHash:hash('shift'),initialCents:0,basisCents:0,cardCents:0,explainedCents:0,reviewStatus:'VALID',nextClosed:true,transactions:[]}]]),selectedIds:['shift'],period:{from:'2026-10-21',to:'2026-10-21'},coverage:'BOUNDED_CLOSED_SHIFTS'};
 const draft=projectReconciliation(source,[]),r=draft.rows[0],report=projectAutomaticReviewedReport(projectReconciliation(source,[{id:'confirmed',sequence:1,actorName:'Χρήστος Μάνης',data:{kind:'CONFIRM',sessionId:'shift',sourceHash:r.sourceHash,planHash:r.planHash,note:'Ελέγχθηκε η βάρδια.'},proof:{}}]));
 const input={companyId:'co',storeId:'store',dayStartHour:7,rule:{deliveryTerminalPattern:'DELIVERY'},groups:[{companyId:'co',storeId:'store',terminalPos:'MAIN',cashChain:'STORE',day:'2026-10-21',rows:[{sessionId:'shift',employeeId:null,employeeName:'',variance:0}]}]};
 assert.equal(validateAutomaticReviewedReport(report,input),true);assert.equal(report.rows[0].identityRequiresReview,true);assert.equal(report.rows[0].employeeKey,'session:shift');
});

test('automatic calculation crosses the strict consumer once with open findings, no raw source and no fabricated reviewed totals',()=>{
 const session={id:'a',companyId:'co',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedBy:'employee',openedByName:'Σούλα',openedAt:'2026-10-21T06:00:00Z',closedAt:'2026-10-21T14:00:00Z',shiftLabel:'Πρωινή'};
 const s={session,sourceHash:hash('session'),initialCents:-700,basisCents:-700,cardCents:0,explainedCents:0,reviewStatus:'VALID',nextClosed:false,transactions:[],automaticSnapshot:{openingDrawer:100,openingCustody:0,openingCoins:0,openingOperational:100,closingDrawer:93,closingCustody:0,closingCoins:0,actualOperational:93,expectedOperational:100,variance:-7,cashSales:0,expenses:0,cardSales:0,eftposTotal:0,cardVariance:0},automaticTransactions:[]};
 const source={store:{id:'store',name:'LAB'},rule:{mode:'FULL',carryOverEnabled:true},sessions:new Map([['a',s]]),selectedIds:['a'],period:{from:'2026-10-21',to:'2026-10-21'},coverage:'BOUNDED_CLOSED_SHIFTS'};
 const report=projectAutomaticReviewedReport(projectReconciliation(source,[]));
 assert.equal(report.rows[0].automaticAudit.status,'CALCULATED');assert.equal(report.rows[0].reviewed,false);assert.equal(report.totals.shortageCents,0);assert.equal(report.totals.pending,1);assert(canSendProvisionalCashReport(report));
 assert.match(report.text,/Εκκρεμότητα: Αναμονή κλεισίματος/);assert(!JSON.stringify(report).includes('automaticSnapshot'));assert(!JSON.stringify(report).includes('automaticTransactions'));
 assert.throws(()=>projectAutomaticReviewedReport({...projectReconciliation(source,[]),rows:[{...projectReconciliation(source,[]).rows[0],automaticAudit:{...report.rows[0].automaticAudit,humanApproval:true}}]}));
 s.automaticSnapshot.cashSales=1;const changed=projectAutomaticReviewedReport(projectReconciliation(source,[]));assert.equal(changed.rows[0].automaticAudit.status,'INCOMPLETE');assert.equal(canSendProvisionalCashReport(changed),false);
});
