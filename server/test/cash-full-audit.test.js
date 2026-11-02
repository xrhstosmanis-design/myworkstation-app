import test from 'node:test';
import assert from 'node:assert/strict';
import {assessAutomaticCash} from '../src/services/cash-automatic-audit.js';
import {hash} from '../src/services/cash-reconciliation-contract.js';
import {projectFullCashAudit,assertFullCashAudit,readFullCashEventEvidence} from '../src/services/cash-full-audit.js';

function fixture(remaining=-500){
 const opening=100,closing=opening+remaining/100;
 const session={id:'s',companyId:'c',storeId:'store',terminalPos:'MAIN',status:'CLOSED',openedAt:'2026-11-01T06:00:00Z',closedAt:'2026-11-01T14:00:00Z',openingDrawer:opening,openingCustody:0,openingCoins:0,openingOperational:opening,closingDrawer:closing,closingCustody:0,closingCoins:0,actualOperational:closing,expectedOperational:opening,variance:remaining/100,cashSales:0,expenses:0,cardSales:0,eftposTotal:0,cardVariance:0};
 const row={sessionId:'s',sourceHash:hash('source'),operatorId:'operator',operatorName:'Χειριστής',employeeKey:'operator:operator',identityRequiresReview:false,initialCents:remaining,explainedCents:0,offsetCents:0,remainingCents:remaining,cardCents:0,recheck:false,eligible:true,status:'AWAITING_REVIEW',automaticAudit:assessAutomaticCash({session,transactions:[],rule:{mode:'FULL',carryOverEnabled:false}})};
 const complete={status:'COMPLETE',unresolvedCount:0};
 const coverage={sessionId:'s',sourceHash:row.sourceHash,events:{...complete},duplicates:{...complete,windowSeconds:60},papers:{...complete},expenses:{...complete}};
 return {row,coverage};
}
test('full final result requires scoped complete receipts and preserves separate shortage and surplus without financial writes',()=>{
 for(const amount of [-500,0,500]){
  const input=fixture(amount),before=structuredClone(input),result=projectFullCashAudit(input);
  assert.equal(result.status,'FINAL');assert.equal(result.remainingCents,amount);assert.equal(result.shortageCents,Math.max(0,-amount));assert.equal(result.surplusCents,Math.max(0,amount));assert.equal(result.financialAdjustmentCents,0);assert.equal(result.humanApproval,false);assert.deepEqual(input,before);assertFullCashAudit({...input,fullAudit:result});
 }
});
test('missing, malformed, stale or foreign coverage and every unresolved source prevents full finality',()=>{
 for(const mutate of [i=>{delete i.coverage},i=>{i.coverage.sourceHash=hash('stale')},i=>{i.coverage.sessionId='foreign'},i=>{i.coverage.duplicates.windowSeconds=120},i=>{i.coverage.confirmed=true},...['events','duplicates','papers','expenses'].flatMap(key=>[i=>{i.coverage[key].status='INCOMPLETE'},i=>{i.coverage[key].unresolvedCount=1}])]){
  const input=fixture();mutate(input);const result=projectFullCashAudit(input);assert.equal(result.status,'PENDING');assert.equal(result.remainingCents,null);assert.equal(result.shortageCents,null);
 }
});
test('manual approval, closed questions and display flags do not replace current arithmetic, identity, cards or handoff evidence',()=>{
 for(const mutate of [i=>{i.row.cardCents=-100},i=>{i.row.cardCents=null},i=>{i.row.recheck=true},i=>{i.row.remainingCents=0},i=>{i.row.identityRequiresReview=true},i=>{i.row.operatorId=null},i=>{i.row.automaticAudit.checks.find(c=>c.code==='CARD_VARIANCE').status='MISMATCH'},i=>{i.row.automaticAudit.openIssues=['SAFE_MOVEMENT_REQUIRES_DOCUMENT']},i=>{i.row.automaticAudit.checks.push({code:'NEXT_HANDOFF',status:'MISMATCH',differenceCents:100})}]){
  const input=fixture();mutate(input);Object.assign(input.row,{reviewed:true,automaticallyCalculated:true,issueStatus:'CLOSED'});assert.equal(projectFullCashAudit(input).status,'PENDING');
 }
});
test('only the last-shift dependency yields awaiting; other gaps remain explicit',()=>{
 const input=fixture();input.row.eligible=false;input.row.automaticAudit.checks.push({code:'NEXT_HANDOFF',status:'AWAITING_NEXT_SHIFT',differenceCents:null});input.row.automaticAudit.openIssues=['AWAITING_NEXT_SHIFT'];
 assert.equal(projectFullCashAudit(input).status,'AWAITING_NEXT_SHIFT');input.coverage.papers.unresolvedCount=1;assert.equal(projectFullCashAudit(input).status,'PENDING');
});
test('an internally consistent nonzero bank-card variance still prevents full finality',()=>{
 const input=fixture();input.row.automaticAudit.bankCardVarianceCents=-18880;
 const result=projectFullCashAudit(input);assert.equal(result.status,'PENDING');assert(result.pendingChecks.includes('CARD_ARITHMETIC'));assert.equal(input.row.remainingCents,-500);
});
test('full audit projection and strict output reject forged amounts, status, fields or changed evidence',()=>{
 const input=fixture(),result=projectFullCashAudit(input);
 for(const patch of [{remainingCents:0},{status:'PENDING'},{financialAdjustmentCents:1},{approved:true}])assert.throws(()=>assertFullCashAudit({...input,fullAudit:{...result,...patch}}));
 input.coverage.events.unresolvedCount=1;assert.throws(()=>assertFullCashAudit({...input,fullAudit:result}));
 const noCash=fixture();noCash.row.status='NOT_APPLICABLE';assert.equal(projectFullCashAudit(noCash).status,'NOT_APPLICABLE');
});

const eventSession={id:'shift',companyId:'co',storeId:'shop',terminalPos:'POS1',status:'CLOSED',openedAt:'2026-11-01T06:00:00Z',closedAt:'2026-11-01T14:00:00Z'};
const event=(id,extra={})=>({id,companyId:'co',storeId:'shop',actionType:'RETURN_ITEMS',createdAt:'2026-11-01T12:00:00Z',details:{sessionId:'shift'},...extra});
function auditDb(actions=[],extra={}){
 const calls=[];
 return {calls,$queryRaw:async(strings,...values)=>{
  const sql=strings.join('?');calls.push({sql,values});
  if(sql.includes('to_regclass'))return [{operator:'present',actions:'present',safety:'present',...extra.tables}];
  if(sql.includes('FROM "PosSaleActionAudit"'))return actions;
  return [];
 }};
}
test('event source retains linked late events and excludes other sessions without attributing unrelated late ambiguity',async()=>{
 const actions=[event('own'),event('late',{createdAt:'2026-11-01T15:00:00Z'}),event('sale-linked',{saleId:'own-sale',details:{}}),event('foreign-session',{details:{sessionId:'next'}}),event('ambiguous',{details:{}}),event('late-ambiguous',{createdAt:'2026-11-01T15:00:00Z',details:{}})];
 const transactions=[{id:'t',companyId:'co',storeId:'shop',sessionId:'shift',type:'SALE_CASH',description:'POS πώληση own-sale · CASH'}],before=structuredClone({actions,transactions}),db=auditDb(actions);
 const result=await readFullCashEventEvidence(db,{companyId:'co',storeId:'shop'},eventSession,transactions);
 assert.equal(result.status,'AVAILABLE');assert.equal(result.findings.length,3);assert.equal(result.linkedCount,3);assert.equal(result.excludedCount,1);assert.equal(result.unassignedCount,1);assert.equal(result.findings.find(f=>f.eventId==='late').afterClose,true);assert(result.findings.every(f=>f.requiresReview&&f.sessionId==='shift'));assert.equal(result.financialAdjustmentCents,0);assert.deepEqual({actions,transactions},before);
 assert(db.calls.slice(1).every(c=>c.values.includes('co')&&c.values.includes('shop')&&c.sql.includes('LIMIT 2001')));
 const changed=await readFullCashEventEvidence(auditDb(actions.slice(1)),{companyId:'co',storeId:'shop'},eventSession,transactions);assert.notEqual(result.evidenceHash,changed.evidenceHash);
});
test('missing sources, query failures, limits, foreign rows and invalid session data never become empty complete event coverage',async()=>{
 const scope={companyId:'co',storeId:'shop'};
 for(const db of [auditDb([],{tables:{safety:null}}),{$queryRaw:async()=>{throw Error('offline')}},auditDb([event('foreign',{storeId:'other'})]),auditDb([event('dup'),event('dup')])])assert.equal((await readFullCashEventEvidence(db,scope,eventSession)).status,'UNAVAILABLE');
 const many=Array.from({length:2001},(_,i)=>event(String(i)));assert.equal((await readFullCashEventEvidence(auditDb(many),scope,eventSession)).status,'LIMITED');
 for(const patch of [{status:'OPEN'},{closedAt:null},{companyId:'foreign'},{closedAt:'2026-10-01T00:00:00Z'}])assert.equal((await readFullCashEventEvidence(auditDb(),scope,{...eventSession,...patch})).status,'UNAVAILABLE');
 const empty=await readFullCashEventEvidence(auditDb(),scope,eventSession);assert.equal(empty.status,'AVAILABLE');assert.equal(empty.unassignedCount,0);assert.deepEqual(empty.findings,[]);
});
