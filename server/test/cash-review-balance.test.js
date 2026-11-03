import {readCashExpenseEvidence,cashExpenseFindings} from "../src/services/cash-expense-evidence.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {confirmedExplanationBalance,readCashReviewState,sameCashReviewSnapshot,cashReviewSnapshotFromLoadedTransactions} from '../src/services/cash-review-balance.js';
import {partitionCashAuditEvents} from '../src/services/cash-audit-association.js';
const snapshot={transactionCount:1,activeTotal:10,expenseTotal:0,reversedCount:0,lastMovementAt:'2026-10-16T07:00:00.000Z'};
const session={id:'shift',sessionId:'shift',companyId:'c',storeId:'s',terminalPos:'MAIN',openedAt:new Date('2026-10-16T04:00Z'),closedAt:new Date('2026-10-16T12:00Z'),variance:-5};
const explanation=(amount,extra={})=>({id:'review',decision:'EXPLANATION',amount,snapshotJson:snapshot,actorName:'Reviewer',createdAt:new Date('2026-10-16T13:00Z'),...extra});
test('confirmed positive explanations reduce shortage and surplus toward zero in cents without changing inputs',()=>{
 const reviews=[explanation(2)];const before=JSON.stringify(reviews);
 assert.equal(confirmedExplanationBalance(-5,reviews).unexplainedVariance,-3);assert.equal(confirmedExplanationBalance(5,reviews).unexplainedVariance,3);
 assert.equal(confirmedExplanationBalance(-5,[explanation(5)]).unexplainedVariance,0);assert.equal(confirmedExplanationBalance(5,[explanation(5)]).unexplainedVariance,0);
 assert.equal(confirmedExplanationBalance(-.3,[explanation(.1),explanation(.2)]).unexplainedVariance,0);assert.equal(confirmedExplanationBalance(0,[]).unexplainedVariance,0);assert.equal(JSON.stringify(reviews),before);
});
test('excessive, invalid or unsafe explanations return unknown/recheck rather than crossing zero or silently clamping',()=>{
 for(const [initial,reviews] of [[-5,[explanation(6)]],[5,[explanation(6)]],[0,[explanation(1)]],[-5,[explanation(-2)]],[-5,[explanation(0)]],[-5,[explanation(NaN)]],[null,[]],[-5,[explanation(Number.MAX_SAFE_INTEGER)]]]){
  const result=confirmedExplanationBalance(initial,reviews);assert.equal(result.status,'RECHECK_REQUIRED');assert.equal(result.unexplainedVariance,null);
 }
 assert.equal(confirmedExplanationBalance(-5,[explanation(6)],{enabled:false}).status,'NOT_APPLICABLE');
});
test('same persisted snapshot ignores JSON key order while every field/value and stale movement still matters',()=>{
 const reordered=Object.fromEntries(Object.entries(snapshot).reverse());assert.equal(sameCashReviewSnapshot(snapshot,reordered),true);
 for(const value of [{...snapshot,activeTotal:11},{...snapshot,transactionCount:2},{...snapshot,reversedCount:1},{...snapshot,lastMovementAt:'2026-10-16T07:01:00.000Z'},{...snapshot,expenseTotal:1},{},null])assert.equal(sameCashReviewSnapshot(snapshot,value),false);
});
test('read-only shared source binds tenant/store/session, ignores non-explanations and exposes stale/unavailable sources',async()=>{
 const calls=[];let reviews=[explanation(2),explanation(99,{id:'no-change',decision:'REVIEWED_NO_CHANGE'})];
 const db={$queryRaw:async(strings,...values)=>{const sql=strings.join('');calls.push({sql,values});return sql.includes('FROM "CashControlReview"')?reviews:[snapshot];}};
 let out=await readCashReviewState(db,session);assert.equal(out.balance.unexplainedVariance,-3);assert.equal(out.confirmedExplanations.length,1);assert(calls.every(c=>c.values.includes('c')&&c.values.includes('s')&&c.values.includes('shift')));
 reviews=[explanation(2,{snapshotJson:{...snapshot,activeTotal:9}})];out=await readCashReviewState(db,session);assert.equal(out.balance.reason,'STALE_REVIEW');assert.equal(out.balance.unexplainedVariance,null);assert.deepEqual(out.confirmedExplanations,[]);
 out=await readCashReviewState({$queryRaw:async()=>{throw Error('source unavailable')}},session);assert.equal(out.balance.status,'UNAVAILABLE');assert.equal(out.balance.unexplainedVariance,null);assert.equal(out.confirmedExplanations,null);
 out=await readCashReviewState({$queryRaw:async strings=>strings.join('').includes('FROM \"CashControlReview\"')?[]:[{...snapshot,activeTotal:NaN}]},session);assert.equal(out.balance.status,'UNAVAILABLE');
});

test('actual cloud route uses signed balance and stale/excessive recheck while preserving original variance and review rows',async()=>{
 const source=readFileSync(new URL('../src/routes/cash-control.js',import.meta.url),'utf8'),start=source.indexOf('router.get("/sessions/:sessionId/investigation"'),end=source.indexOf('router.post("/sessions/:sessionId/reviews"',start),route=source.slice(start,end);
 let handler,reviews=[explanation(2)];const db={$queryRaw:async strings=>{const sql=strings.join('');return sql.includes('SELECT s.*')?[session]:sql.includes('FROM "CashControlReview"')?reviews:[];}};
 const deps={router:{get:(_path,fn)=>{handler=fn}},route:fn=>fn,prisma:db,normalize:x=>x,assertStoreAccess:()=>{},ownedStore:async()=>({}),cashControlRule:async()=>({mode:'FULL'}),readCashExpenseEvidence,cashExpenseFindings,existingAuditTables:async()=>({}),partitionCashAuditEvents,suspiciousOperatorEvent:()=>true,auditAmount:()=>null,money:v=>Number(v||0),reviewSnapshot:async()=>snapshot,sameSnapshot:sameCashReviewSnapshot,confirmedExplanationBalance};
 new Function(...Object.keys(deps),route)(...Object.values(deps));const invoke=async()=>{let result;await handler({params:{sessionId:'shift'},user:{companyId:'c'}},{json:x=>{result=x}});return result;};
 let out=await invoke();assert.equal(out.initialVariance,-5);assert.equal(out.unexplainedVariance,-3);assert.equal(out.recheckRequired,false);assert.equal(out.reviews[0].amount,2);
 reviews=[explanation(6)];out=await invoke();assert.equal(out.unexplainedVariance,null);assert.equal(out.status,'RECHECK_REQUIRED');assert.equal(out.reviewBalance.reason,'EXPLANATIONS_EXCEED_VARIANCE');
 reviews=[explanation(2,{snapshotJson:{...snapshot,activeTotal:11}})];out=await invoke();assert.equal(out.unexplainedVariance,null);assert.equal(out.recheckRequired,true);assert.equal(out.initialVariance,-5);
});

test('actual Platform investigation and copied Analyses use the same signed balance and honest unknown label',async()=>{
 const api=readFileSync(new URL('../src/routes/platform-admin.js',import.meta.url),'utf8'),body=api.slice(api.indexOf('function platformCashAuditAmount('),api.indexOf('function companyView('));
 const db={$queryRaw:async strings=>{const sql=strings.join('');return sql.includes('FROM "CashControlReview"')?[explanation(2)]:sql.includes('COUNT(*)::int AS "transactionCount"')?[snapshot]:[];}};
 const investigate=new Function('prisma','partitionCashAuditEvents','readCashReviewState','readCashExpenseEvidence','cashExpenseFindings',body+';return platformCashInvestigation;')(db,partitionCashAuditEvents,readCashReviewState,readCashExpenseEvidence,cashExpenseFindings);
 const result=await investigate(session,{operator:true,actions:true,safety:true,purchaseDocuments:true});assert.equal(result.reviewBalance.unexplainedVariance,-3);assert.equal(result.completed,false);
 const ui=readFileSync(new URL('../../client/src/components/platform/PlatformAdminApp.jsx',import.meta.url),'utf8'),labels=ui.slice(ui.indexOf('const cashNumber='),ui.indexOf('const cashWrittenReport=')),label=new Function(labels+';return cashReviewBalanceLabel;')();
 const text=label({...session,investigation:result});assert.match(text,/-5,00/);assert.match(text,/2,00/);assert.match(text,/-3,00/);
 const unknown=label({...session,investigation:{reviewBalance:{status:'UNAVAILABLE'}}});assert.match(unknown,/δεν μπορεί να υπολογιστεί/);assert.doesNotMatch(unknown,/ανεξήγητο υπόλοιπο 0/);assert.match(ui,/rows\.map\(cashReviewBalanceLabel\)/);
 const writtenSource=ui.slice(ui.indexOf('const cashNumber='),ui.indexOf('const cashShiftResult=')),written=new Function(writtenSource+';return cashWrittenReport;')();
 assert.match(written({...session,investigation:result}).paragraphs.join(' '),/3,00/);assert.doesNotMatch(written({...session,investigation:result}).paragraphs.join(' '),/Ανεξήγητο έλλειμμα 5/);
 const covered=written({...session,investigation:{findings:[],reviewBalance:{status:'VALID',explainedAmount:5,unexplainedVariance:0}}});assert.match(covered.paragraphs.join(' '),/καλύπτουν την αρχική διαφορά/);assert.match(covered.paragraphs.join(' '),/παραμένει προσωρινός/);

});

test('loaded exact decimal sidecars reproduce signed SQL sums, ignored nulls, reversed rows and driver-normalized last movement without mutation',()=>{
 const loaded=[['0.1','SALE_CASH'],['0.2','SALE_CARD'],['-1.25','SUPPLIER_PAYMENT'],['2.1234','OTHER_EXPENSE'],[null,'SALE_IRIS'],['999','OTHER_EXPENSE',true]].map(([amount,type,reversed],i)=>({record:{companyId:'c',storeId:'s',sessionId:'shift',type,amount:amount===null?null:Number(amount),createdAt:i===4?null:'2026-10-16T07:00:00.000001Z',reversedAt:reversed?'2026-10-16T07:03:00.123999Z':null},snapshotAmount:amount}));
 const before=structuredClone(loaded);assert.deepEqual(cashReviewSnapshotFromLoadedTransactions(session,loaded),{transactionCount:6,activeTotal:1.1734,expenseTotal:.8734,reversedCount:1,lastMovementAt:'2026-10-16T07:03:00.123Z'});assert.deepEqual(loaded,before);
 const precision=['1.00000000000000000001','-1'].map(amount=>({record:{companyId:'c',storeId:'s',sessionId:'shift',type:'SALE_CASH',amount:Number(amount),createdAt:null,reversedAt:null},snapshotAmount:amount}));
 assert.equal(precision[0].record.amount,1);assert.equal(cashReviewSnapshotFromLoadedTransactions(session,precision).activeTotal,1e-20,'JSON rounding cannot erase a decimal residual that SQL SUM retains');
 assert.deepEqual(cashReviewSnapshotFromLoadedTransactions(session,[]),{transactionCount:0,activeTotal:0,expenseTotal:0,reversedCount:0,lastMovementAt:null});
 const nullCreated={record:{companyId:'c',storeId:'s',sessionId:'shift',type:'SALE_CASH',amount:10,createdAt:null,reversedAt:'2026-10-16T07:03:00.123999Z'}};
 assert.equal(cashReviewSnapshotFromLoadedTransactions(session,[nullCreated]).lastMovementAt,'2026-10-16T07:03:00.123Z','GREATEST ignores NULL createdAt and reversed amounts are excluded');
});
test('loaded snapshot and bounded preloaded reviews retain the exact legacy projection while issuing no aggregate/review re-read',async()=>{
 const loaded=[{record:{companyId:'c',storeId:'s',sessionId:'shift',type:'SALE_CASH',amount:10,createdAt:snapshot.lastMovementAt,reversedAt:null},snapshotAmount:'10.00'}],reviews=[explanation(2),explanation(99,{id:'no-change',decision:'REVIEWED_NO_CHANGE'})];
 const legacy=await readCashReviewState({$queryRaw:async strings=>strings.join('').includes('CashControlReview')?reviews:[snapshot]},session);
 const reused=await readCashReviewState({$queryRaw:()=>assert.fail('loaded source must not be reread')},session,{loadedTransactions:loaded,reviewRows:reviews});assert.deepEqual(reused,legacy);
 const stale=[explanation(2,{snapshotJson:{...snapshot,activeTotal:9}})];assert.equal((await readCashReviewState({$queryRaw:()=>assert.fail('no query')},session,{loadedTransactions:loaded,reviewRows:stale})).balance.reason,'STALE_REVIEW');
});
test('unsupported exact sidecars, foreign scope or invalid timestamps fall back to established scoped SQL, never guessed rounding',async()=>{
 const base={record:{companyId:'c',storeId:'s',sessionId:'shift',type:'SALE_CASH',amount:10,createdAt:snapshot.lastMovementAt,reversedAt:null},snapshotAmount:'10.00'};
 for(const mutate of [x=>delete x.snapshotAmount,x=>{x.snapshotAmount='1e1'},x=>{x.snapshotAmount='NaN'},x=>{x.snapshotAmount='Infinity'},x=>{x.snapshotAmount='1'.repeat(1001)},x=>{x.snapshotAmount='11'},x=>{x.record.storeId='foreign'},x=>{x.record.createdAt='invalid'},x=>{x.record.amount=true}]){
  const input=structuredClone(base);mutate(input);assert.equal(cashReviewSnapshotFromLoadedTransactions(session,[input]),null);let calls=0;
  const result=await readCashReviewState({$queryRaw:async(strings,...values)=>{calls++;assert(strings.join('').includes('COUNT(*)::int AS "transactionCount"'));assert.deepEqual(values,['c','s','shift']);return [snapshot];}},session,{loadedTransactions:[input],reviewRows:[]});assert.deepEqual(result.currentSnapshot,snapshot);assert.equal(calls,1);
 }
 assert.equal(cashReviewSnapshotFromLoadedTransactions(session,Array(501).fill(base)),null);
 const unavailable=await readCashReviewState({$queryRaw:()=>assert.fail('no re-read of a failed detailed review query')},session,{loadedTransactions:[base],reviewRows:null});assert.equal(unavailable.balance.status,'UNAVAILABLE');
});
