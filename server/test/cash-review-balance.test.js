import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {confirmedExplanationBalance,readCashReviewState,sameCashReviewSnapshot} from '../src/services/cash-review-balance.js';
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
 const deps={router:{get:(_path,fn)=>{handler=fn}},route:fn=>fn,prisma:db,normalize:x=>x,assertStoreAccess:()=>{},ownedStore:async()=>({}),cashControlRule:async()=>({mode:'FULL'}),existingAuditTables:async()=>({}),partitionCashAuditEvents,suspiciousOperatorEvent:()=>true,auditAmount:()=>null,money:v=>Number(v||0),reviewSnapshot:async()=>snapshot,sameSnapshot:sameCashReviewSnapshot,confirmedExplanationBalance};
 new Function(...Object.keys(deps),route)(...Object.values(deps));const invoke=async()=>{let result;await handler({params:{sessionId:'shift'},user:{companyId:'c'}},{json:x=>{result=x}});return result;};
 let out=await invoke();assert.equal(out.initialVariance,-5);assert.equal(out.unexplainedVariance,-3);assert.equal(out.recheckRequired,false);assert.equal(out.reviews[0].amount,2);
 reviews=[explanation(6)];out=await invoke();assert.equal(out.unexplainedVariance,null);assert.equal(out.status,'RECHECK_REQUIRED');assert.equal(out.reviewBalance.reason,'EXPLANATIONS_EXCEED_VARIANCE');
 reviews=[explanation(2,{snapshotJson:{...snapshot,activeTotal:11}})];out=await invoke();assert.equal(out.unexplainedVariance,null);assert.equal(out.recheckRequired,true);assert.equal(out.initialVariance,-5);
});

test('actual Platform investigation and copied Analyses use the same signed balance and honest unknown label',async()=>{
 const api=readFileSync(new URL('../src/routes/platform-admin.js',import.meta.url),'utf8'),body=api.slice(api.indexOf('function platformCashAuditAmount('),api.indexOf('function companyView('));
 const db={$queryRaw:async strings=>{const sql=strings.join('');return sql.includes('FROM "CashControlReview"')?[explanation(2)]:sql.includes('COUNT(*)::int AS "transactionCount"')?[snapshot]:[];}};
 const investigate=new Function('prisma','partitionCashAuditEvents','readCashReviewState',body+';return platformCashInvestigation;')(db,partitionCashAuditEvents,readCashReviewState);
 const result=await investigate(session,{operator:true,actions:true,safety:true,purchaseDocuments:true});assert.equal(result.reviewBalance.unexplainedVariance,-3);assert.equal(result.completed,false);
 const ui=readFileSync(new URL('../../client/src/components/platform/PlatformAdminApp.jsx',import.meta.url),'utf8'),labels=ui.slice(ui.indexOf('const cashNumber='),ui.indexOf('const cashWrittenReport=')),label=new Function(labels+';return cashReviewBalanceLabel;')();
 const text=label({...session,investigation:result});assert.match(text,/-5,00/);assert.match(text,/2,00/);assert.match(text,/-3,00/);
 const unknown=label({...session,investigation:{reviewBalance:{status:'UNAVAILABLE'}}});assert.match(unknown,/δεν μπορεί να υπολογιστεί/);assert.doesNotMatch(unknown,/ανεξήγητο υπόλοιπο 0/);assert.match(ui,/rows\.map\(cashReviewBalanceLabel\)/);
});
