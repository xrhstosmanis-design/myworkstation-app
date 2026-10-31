import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeWalletReviewEvidence,walletReviewEvidence} from '../src/services/ai-owner-wallet-review-evidence.js';
import {createWalletProvider} from '../src/services/ai-owner-wallet-provider.js';

const tariff={model:'synthetic-review-model',responseModels:['synthetic-review-model'],inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:100000,outputMicrosPerMillion:2000000,cacheWriteMicrosPerMillion:{ttl30m:1250000,ttl12h:2500000},contextTokens:20000,maxOutputTokens:5000};
const raw={id:'resp_synthetic_review',model:tariff.model,usage:{input_tokens:100,output_tokens:5,input_tokens_details:{cached_tokens:20,cache_write_tokens:30,cache_write_tokens_details:{ttl_30m_tokens:30,ttl_12h_tokens:0}}}};
const scope={companyId:'synthetic-company',storeId:'synthetic-store',feature:'INVOICE_OPENAI'};
function fixture(overrides={}){
 const calls=[],repository={enabledFor:async()=>true,reserve:async input=>{calls.push(['reserve',input]);return{id:'synthetic-hold'}},settle:async(...args)=>calls.push(['settle',...args]),review:async(...args)=>calls.push(['review',...args]),...overrides};
 return {calls,provider:createWalletProvider({repository,enabled:()=>true,tariffs:()=>JSON.stringify([tariff])})};
}
test('review evidence is bounded, re-sanitized and contains no arbitrary errors, content, credentials, URLs or numeric strings',()=>{
 const secret='SECRET_private_prompt_token';
 const value={stage:'USAGE',reason:'USAGE_INVALID',responseId:'resp_synthetic_safe',model:tariff.model,responseOk:true,httpStatus:200,reported:{inputTokens:100,outputTokens:secret,cacheWriteTokens:null,cacheWrite12hTokens:1e12},presence:{inputTokens:'VALID',outputTokens:'INVALID',cachedInputTokens:secret},limits:{inputTokens:20000,outputTokens:5000,secret},acceptedModels:[tariff.model,'sk-proj-SECRET',secret+' value'],tariffVersion:'a'.repeat(64),prompt:secret,headers:{authorization:secret},output:secret,error:secret,url:'https://example.invalid/'+secret};
 const clean=sanitizeWalletReviewEvidence(value);assert.equal(clean.reported.inputTokens,100);assert.equal(clean.reported.outputTokens,undefined);assert.equal(clean.reported.cacheWriteTokens,undefined);assert.equal(clean.reported.cacheWrite12hTokens,undefined);assert.deepEqual(clean.acceptedModels,[tariff.model]);
 assert.doesNotMatch(JSON.stringify(clean),/SECRET|https:|authorization|prompt|headers/);assert.deepEqual(sanitizeWalletReviewEvidence(clean),clean);
 for(const item of [null,[],1,'bad'])assert.doesNotThrow(()=>sanitizeWalletReviewEvidence(item));
});
test('successful provider response with incomplete write usage retains exact safe evidence and the original REVIEW failure, without guessing a charge',async()=>{
 const f=fixture(),incomplete={...raw,output:[{text:'SECRET_output'}],usage:{...raw.usage,input_tokens_details:{cached_tokens:20}}};
 await assert.rejects(f.provider(scope,{model:tariff.model,input:'SECRET_prompt',max_output_tokens:3000},async()=>({response:{ok:true,status:200},raw:incomplete}),async()=>100),e=>e.code==='AI_WALLET_USAGE_REVIEW');
 assert.equal(f.calls.filter(c=>c[0]==='reserve').length,1);assert.equal(f.calls.filter(c=>c[0]==='settle').length,0);
 const evidence=f.calls.find(c=>c[0]==='review')[3];assert.equal(evidence.stage,'USAGE');assert.equal(evidence.reason,'USAGE_INVALID');assert.equal(evidence.responseId,raw.id);assert.equal(evidence.reported.inputTokens,100);assert.equal(evidence.reported.outputTokens,5);assert.equal(evidence.presence.cacheWriteTokens,'MISSING');assert.equal(evidence.presence.cacheWrite30mTokens,'MISSING');assert.equal(evidence.limits.inputTokens,100);assert.equal(evidence.limits.outputTokens,3000);assert.match(evidence.tariffVersion,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(evidence),/SECRET/);
});
test('transport, rejected response, exact-request overrun and settlement failures have distinct stable audit stages without retries',async()=>{
 const cases=[
  {stage:'PROVIDER',reason:'PROVIDER_UNAVAILABLE',invoke:async()=>{throw Error('SECRET transport')}},
  {stage:'RESPONSE',reason:'PROVIDER_RESPONSE_INVALID',invoke:async()=>({response:{ok:false,status:429},raw:{...raw,error:{message:'SECRET error'}}})},
  {stage:'BOUNDS',reason:'REQUEST_BOUNDS_EXCEEDED',invoke:async()=>({response:{ok:true},raw}),count:async()=>99},
  {stage:'SETTLEMENT',reason:'SETTLEMENT_FAILED',invoke:async()=>({response:{ok:true},raw}),overrides:{settle:async()=>{throw Error('SECRET SQL')}}}
 ];
 for(const value of cases){const f=fixture(value.overrides);let invokes=0;await assert.rejects(f.provider(scope,{model:tariff.model},async settings=>{invokes++;return value.invoke(settings)},value.count),e=>e.code==='AI_WALLET_USAGE_REVIEW');assert.equal(invokes,1);const review=f.calls.find(c=>c[0]==='review');assert.equal(review[1],scope.companyId);assert.equal(review[2],'synthetic-hold');assert.equal(review[3].stage,value.stage);assert.equal(review[3].reason,value.reason);assert.doesNotMatch(JSON.stringify(review),/SECRET/);}
});
test('verified complete usage still settles once at the original tariff and retains no diagnostic audit',async()=>{
 const f=fixture();const result={response:{ok:true},raw};assert.equal(await f.provider(scope,{model:tariff.model},async()=>result),result);assert.equal(f.calls.filter(c=>c[0]==='review').length,0);assert.equal(f.calls.filter(c=>c[0]==='settle').length,1);assert.equal(f.calls.find(c=>c[0]==='settle')[3].amountMicros,100n);
});
test('review persistence failure still preserves the original hold error and never refunds or retries',async()=>{
 const f=fixture({review:async()=>{throw Error('SECRET audit failure')}});let calls=0;await assert.rejects(f.provider(scope,{model:tariff.model},async()=>{calls++;throw Error('SECRET provider failure')}),e=>e.code==='AI_WALLET_USAGE_REVIEW'&&!e.message.includes('SECRET'));assert.equal(calls,1);assert.equal(f.calls.filter(c=>c[0]==='settle').length,0);
});
test('field presence distinguishes absent, null and invalid data without coercion or inference',()=>{
 const evidence=walletReviewEvidence({raw:{id:'https://secret.invalid',model:'sk-proj-SECRET',usage:{input_tokens:10,output_tokens:'5',input_tokens_details:{cached_tokens:null,cache_write_tokens:0,cache_write_tokens_details:{ttl_30m_tokens:-1}}}}},{stage:'USAGE',reason:'USAGE_INVALID',tariff,limits:null,maxOutputTokens:5000});
 assert.equal(evidence.presence.outputTokens,'INVALID');assert.equal(evidence.presence.cachedInputTokens,'NULL');assert.equal(evidence.presence.cacheWriteTokens,'VALID');assert.equal(evidence.presence.cacheWrite30mTokens,'INVALID');assert.equal(evidence.presence.cacheWrite12hTokens,'MISSING');assert.equal(evidence.responseId,undefined);assert.equal(evidence.model,undefined);assert.equal(evidence.reported.cacheWriteTokens,0);assert.equal(evidence.reported.cachedInputTokens,undefined);
});
