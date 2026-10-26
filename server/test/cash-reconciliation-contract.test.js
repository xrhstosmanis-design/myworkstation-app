import test from 'node:test';
import assert from 'node:assert/strict';
import {hash,exactCents,periodSchema,reconciliationRequest,scopeKey,actionId,chainState,requestHash} from '../src/services/cash-reconciliation-contract.js';
const scope={companyId:'c',storeId:'s',generation:'0'},period={from:'2026-10-21',to:'2026-10-23'};
const data={kind:'OFFSET',previousSessionId:'a',nextSessionId:'b',previousHash:'a'.repeat(64),nextHash:'b'.repeat(64),amountCents:8000,countingErrorConfirmed:true,note:'Επιβεβαιώθηκε η επαναμέτρηση.'};
const request={requestId:'123e4567-e89b-42d3-a456-426614174000',head:'ROOT',generation:'0',period,data};
test('review contract rejects ambiguous cents, guessed dates, missing explicit confirmation and changed scope',()=>{
 assert.equal(exactCents('12.34'),1234);for(const v of [null,undefined,true,'','1.234','1,23','NaN'])assert.equal(exactCents(v),null);
 assert.equal(reconciliationRequest.safeParse(request).success,true);
 for(const changed of [{...request,data:{...data,amountCents:.5}},{...request,data:{...data,countingErrorConfirmed:false}},{...request,data:{...data,cardOffset:true}},{...request,role:'SUPER_ADMIN'},{...request,period:{from:'2026-02-31',to:'2026-03-01'}}])assert.equal(reconciliationRequest.safeParse(changed).success,false);
 assert.equal(periodSchema.safeParse({from:'2026-10-01',to:'2026-10-31'}).success,true);assert.equal(periodSchema.safeParse({from:'2026-10-01',to:'2026-11-01'}).success,false);
 assert.notEqual(scopeKey(scope),scopeKey({...scope,storeId:'other'}));assert.notEqual(scopeKey(scope),scopeKey({...scope,generation:'1'}));assert.throws(()=>scopeKey({...scope,generation:'9223372036854775808'}));
 assert.equal(requestHash(request),requestHash({...request,head:'a'.repeat(64)}),'fresh head does not invalidate replay of the same business request');
});
test('durable review chain validates scope, sequence, head, payload and bounded audit rather than trusting stored flags',()=>{
 const key=scopeKey(scope),id=actionId(key,request.requestId),detail={version:1,generation:'0',sequence:1,previousHead:'ROOT',requestId:request.requestId,requestHash:requestHash(request),data,proof:{period,previousHash:data.previousHash,nextHash:data.nextHash},actorName:'Χρήστος Μάνης'};
 detail.head=hash({id,sequence:1,previousHead:'ROOT',requestHash:detail.requestHash,data,proof:detail.proof,actorName:detail.actorName});
 const row={id,companyId:'c',storeId:'s',entityType:'CASH_RECONCILIATION',entityId:key,action:'CASH_RECONCILIATION_REVIEWED',afterJson:detail,createdAt:new Date()};
 assert.equal(chainState([row],scope).head,detail.head);
 for(const changed of [{...row,storeId:'other'},{...row,afterJson:{...detail,sequence:2}},{...row,afterJson:{...detail,head:'a'.repeat(64)}},{...row,afterJson:{...detail,data:{...data,amountCents:8001}}}])assert.throws(()=>chainState([changed],scope));
 assert.throws(()=>chainState(Array.from({length:501},()=>row),scope));
});
