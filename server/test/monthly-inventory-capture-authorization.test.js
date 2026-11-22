import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMonthlyCaptureExecution,authorizeMonthlyCaptureSourceInTransaction as source,authorizeMonthlyCaptureWriteInTransaction as write,authorizeMonthlyCaptureLookupInTransaction as lookup,authorizeMonthlyCaptureGrantManagementInTransaction as management,requireMonthlyCaptureContext as requireContext,monthlyCaptureWriteGuardParameters as guard,finishMonthlyCaptureSourceInTransaction as finish} from '../src/services/monthly-inventory-capture-authorization.js';
const revision='a'.repeat(40),request=()=>({type:'SERVICE_DELEGATION',purpose:'MONTHLY_INVENTORY_CAPTURE',executor:'MONTHLY_INVENTORY_CAPTURE_V1',jobId:'synthetic-job',leaseToken:'b'.repeat(64)}),options={sourceRevision:revision};
const refuses=code=>e=>e?.code===code;
test('execution is exactly a detached fixed-purpose typed lease request without caller scope or principal casting',()=>{
 const input=request(),copy=normalizeMonthlyCaptureExecution(input);input.jobId='changed';input.leaseToken='c'.repeat(64);assert.equal(copy.jobId,'synthetic-job');assert.equal(copy.leaseToken,'b'.repeat(64));assert.equal(Object.isFrozen(copy),true);
 for(const patch of [{type:'BACKOFFICE_USER'},{purpose:'CASH'},{executor:'OWNER'},{companyId:'foreign'},{month:'2026-01'},{lifecycleGeneration:'2'},{sourceRevision:revision},{leaseToken:'A'.repeat(64)},{leaseToken:'b'.repeat(64)+'\n'},{jobId:'x\n'},{jobId:'α'.repeat(81)}])assert.throws(()=>normalizeMonthlyCaptureExecution({...request(),...patch}),refuses('MONTHLY_CAPTURE_INPUT_INVALID'));
});
test('accessors, unexpected symbols and request mutation cannot supply delegated authorization',async()=>{
 let touched=0,calls=0;const tx={$queryRawUnsafe:async()=>{calls++;assert.fail('No SQL expected')}};
 const getter={...request()};Object.defineProperty(getter,'leaseToken',{get(){touched++;return 'b'.repeat(64)}});
 const symbol={...request(),[Symbol('scope')]:'foreign'};
 for(const input of [getter,symbol,null,[],{role:'OWNER'},JSON.stringify(request())])await assert.rejects(source(tx,input,options),refuses('MONTHLY_CAPTURE_INPUT_INVALID'));
 assert.equal(touched,0);assert.equal(calls,0);
});
test('actual transaction mode admission refuses source writes and fresh authority in held snapshots before schema access',async()=>{
 const now=new Date().toISOString(),make=(readOnly,isolation)=>({$queryRawUnsafe:async sql=>{assert.match(sql,/transaction_read_only/);return [{readOnly,isolation,transactionStartedAt:now,readAt:now}]}});
 await assert.rejects(source(make('off','read committed'),request(),options),refuses('MONTHLY_CAPTURE_SOURCE_TRANSACTION_REQUIRED'));
 for(const fn of [write,lookup])await assert.rejects(fn(make('on','repeatable read'),request(),options),refuses('MONTHLY_CAPTURE_WRITE_TRANSACTION_REQUIRED'));
 await assert.rejects(source(make('on','repeatable read'),request(),{sourceRevision:revision+'\n'}),refuses('MONTHLY_CAPTURE_INPUT_INVALID'));
});
test('an opaque context cannot be fabricated, serialized, cloned or reused as a persistence bypass',async()=>{
 const tx={};for(const context of [{},Object.freeze({}),{type:'SERVICE_DELEGATION'},null,JSON.parse('{}')])for(const stage of ['SOURCE','LOOKUP','WRITE','MANAGEMENT','ANY'])assert.throws(()=>requireContext(tx,context,stage),refuses('MONTHLY_CAPTURE_CONTEXT_INVALID'));
 assert.throws(()=>guard(tx,{}),refuses('MONTHLY_CAPTURE_CONTEXT_INVALID'));await assert.rejects(finish(tx,{}),refuses('MONTHLY_CAPTURE_CONTEXT_INVALID'));
});
test('management requires explicit personal session identity and rejects accessor scopes before SQL',async()=>{
 let calls=0;const tx={$queryRawUnsafe:async()=>{calls++;assert.fail('No SQL expected')}};
 const actor={id:'user',companyId:'company',role:'OWNER',tokenType:'BACKOFFICE_USER',sessionId:'session',sessionVersion:0};
 for(const a of [{...actor,sessionId:undefined},{...actor,sessionVersion:-1},{...actor,tokenType:'STORE_OPERATOR'},{...actor,mustChangePassword:true}])await assert.rejects(management(tx,a,{companyId:'company',storeId:'store'}));
 const scope={companyId:'company'};Object.defineProperty(scope,'storeId',{get(){assert.fail('Getter must not run')}});await assert.rejects(management(tx,actor,scope),refuses('MONTHLY_CAPTURE_INPUT_INVALID'));assert.equal(calls,0);
});
