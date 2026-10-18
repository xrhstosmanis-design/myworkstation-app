import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeOpeningOperators} from '../src/services/automatic-report-policy.js';
const group=(rows,other={})=>({companyId:'c',storeId:'s',terminalPos:'MAIN',cashChain:'STORE',day:'2026-10-01',rows,...other});
const row=(sessionId,employeeId,variance,employeeName='Same name')=>({sessionId,employeeId,variance,employeeName});
test('opening users retain ID aliases, original amounts and source trace without allocating offsets',()=>{
 const groups=[group([row('1','u1',-10),row('2','u2',8)]),group([row('3','u1',0.01,'Renamed'),row('4','u2',0.02)],{day:'2026-10-02',terminalPos:'SECOND'}),group([row('5','u1',30)],{cashChain:'DELIVERY'})],before=JSON.stringify(groups),r=summarizeOpeningOperators(groups);
 assert.equal(r.complete,true);assert.equal(r.operators.length,3);const u=r.operators.find(x=>x.operatorId==='u1'&&x.cashChain==='STORE');assert.deepEqual([u.originalShortage,u.originalSurplus,u.netVariance,u.sessionCount],[10,.01,-9.99,2]);assert.deepEqual(u.recordedNames,['Same name','Renamed']);assert.deepEqual(u.sessions.map(x=>[x.sessionId,x.day,x.terminalPos]),[['1','2026-10-01','MAIN'],['3','2026-10-02','SECOND']]);assert.equal(u.employeeLiabilityAdjusted,false);assert.equal('offset' in u,false);assert.equal(JSON.stringify(groups),before);
});
test('missing opening identities never infer identity from name or merge unrelated sessions',()=>{
 const r=summarizeOpeningOperators([group([row('1',null,-1),row('2','',2),row('3',' u ',3),row('4','u',4)])]);assert.equal(r.complete,true);assert.equal(r.operators.length,4);assert.equal(r.operators.filter(x=>x.identityStatus==='UNATTRIBUTED').length,3);assert.deepEqual(r.operators.filter(x=>x.operatorId).map(x=>x.operatorId),['u']);
});
test('invalid duplicate or unsafe source suppresses entire operator aggregate',()=>{
 for(const groups of [null,[group([row('a','u',1),row('a','v',2)])],[group([row('a','u',1)]),group([row('a','u',1)],{cashChain:'DELIVERY'})],[group([row('a','u',NaN)])],[group([row('a','u',Infinity)])],[group([row('a','u','1')])],[group([row('a','u',.001)])],[group([row('a','u',Number.MAX_SAFE_INTEGER)])],[group([row('a','u',45035996273704.95),row('b','u',45035996273704.95),row('c','u',1)])],[group([row('a','u',1)],{cashChain:'UNKNOWN'})]]){const r=summarizeOpeningOperators(groups);assert.equal(r.complete,false);assert.equal(r.operators,null)}
});
