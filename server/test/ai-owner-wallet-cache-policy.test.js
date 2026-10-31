import test from 'node:test';
import assert from 'node:assert/strict';
import {createWalletProvider} from '../src/services/ai-owner-wallet-provider.js';
import {requestCacheWritePolicy} from '../src/services/ai-owner-wallet-cache-policy.js';
import {meteredUsage,tariffFor} from '../src/services/ai-owner-wallet-contract.js';
import {sanitizeWalletReviewEvidence} from '../src/services/ai-owner-wallet-review-evidence.js';

const tariff={model:'synthetic-cache-policy',responseModels:['synthetic-cache-policy'],inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:100000,outputMicrosPerMillion:2000000,cacheWriteMicrosPerMillion:{ttl30m:1250000,ttl12h:2500000},contextTokens:40000,maxOutputTokens:40000};
const scope={companyId:'synthetic-company',storeId:'synthetic-store',feature:'INVOICE_OPENAI'};
const raw={id:'resp_synthetic_uniform_write',model:tariff.model,usage:{input_tokens:9399,output_tokens:778,input_tokens_details:{cached_tokens:0,cache_write_tokens:9396}}};
function fixture(){const calls=[],repository={enabledFor:async()=>true,reserve:async input=>{calls.push(['reserve',input]);return{id:'synthetic-policy-hold'}},settle:async(...args)=>calls.push(['settle',...args]),review:async(...args)=>calls.push(['review',...args])};return {calls,provider:createWalletProvider({repository,enabled:()=>true,tariffs:()=>JSON.stringify([tariff])})};}

test('provider accepts actual positive aggregate shape for a uniformly known default lifetime and returns its original result',async()=>{
 const f=fixture(),result={response:{ok:true,status:200},raw};let invokes=0;
 assert.equal(await f.provider(scope,{model:tariff.model,input:'Synthetic policy fixture',max_output_tokens:30000},async()=>{invokes++;return result},async()=>9399),result);
 assert.equal(invokes,1);assert.equal(f.calls.filter(x=>x[0]==='reserve').length,1);assert.equal(f.calls.filter(x=>x[0]==='review').length,0);
 const settled=f.calls.find(x=>x[0]==='settle');assert.equal(settled[3].amountMicros,13304n);assert.equal(settled[3].usage.cacheWrite30mTokens,9396);assert.equal(settled[3].usage.cacheWrite12hTokens,0);
});

test('explicit uniform 12h preserves request and price version, snapshots policy and charges writes only once',async()=>{
 const f=fixture(),settings={model:tariff.model,max_output_tokens:30000,input:[{role:'user',content:[{type:'input_text',text:'SECRET',prompt_cache_breakpoint:{mode:'explicit'}}]}],prompt_cache_options:{ttl:'12h',mode:'explicit'}},original=structuredClone(settings),result={response:{ok:true},raw};
 assert.equal(await f.provider(scope,settings,async sent=>{assert.deepEqual(sent,original);return result},async()=>9399),result);
 assert.deepEqual(settings,original);
 const reserved=f.calls.find(x=>x[0]==='reserve')[1];
 assert.equal(reserved.tariff.version,tariffFor(tariff.model,JSON.stringify([tariff])).version);
 assert.deepEqual(reserved.tariff.requestCacheWritePolicy,{schemaVersion:1,state:'UNIFORM',ttl:'12h',source:'REQUEST_EXPLICIT'});
 assert.doesNotMatch(JSON.stringify(reserved,(_,v)=>typeof v==='bigint'?String(v):v),/SECRET/);
 const settled=f.calls.find(x=>x[0]==='settle')[3];assert.equal(settled.amountMicros,25049n);assert.equal(settled.usage.cacheWrite30mTokens,0);assert.equal(settled.usage.cacheWrite12hTokens,9396);assert.equal(settled.usage.cacheWritePartitionSource,'REQUEST_EXPLICIT');
});

test('mixed, hidden and unknown policies require provider partitions without retrying or settling',async()=>{
 const cases=[{previous_response_id:'resp_hidden'},{conversation:'hidden'},{prompt:{id:'hidden'}},{prompt_cache_retention:'24h'},{prompt_cache_options:null},{prompt_cache_options:{ttl:'24h'}},{prompt_cache_options:{mode:'future'}},{prompt_cache_options:{ttl:'30m',unknown:'SECRET'}},{input:[{type:'item_reference',id:'hidden'}]},{input:[{prompt_cache_breakpoint:{ttl:'12h'}}]},{input:[{prompt_cache_breakpoint:null}]}];
 for(const value of cases){const f=fixture();let calls=0;await assert.rejects(f.provider(scope,{model:tariff.model,...value},async()=>{calls++;return {response:{ok:true},raw}}),e=>e.code==='AI_WALLET_USAGE_REVIEW');assert.equal(calls,1);assert.equal(f.calls.filter(x=>x[0]==='settle').length,0);const review=f.calls.find(x=>x[0]==='review')[3];assert.ok(['UNKNOWN','MIXED'].includes(review.requestCacheWritePolicy.state));assert.doesNotMatch(JSON.stringify(review),/SECRET|hidden/);}
});

test('malformed supplied partitions and usage retain existing strict guards despite a uniform policy',async()=>{
 const details=raw.usage.input_tokens_details;
 for(const fields of [{...details,cache_write_tokens_details:null},{...details,cache_write_tokens_details:{}},{...details,cache_write_tokens_details:{ttl_30m_tokens:9396,ttl_12h_tokens:1}},{...details,cache_write_tokens:null},{...details,cache_write_tokens:'9396'},{...details,cached_tokens:undefined},{...details,cached_tokens:10}]){
  const f=fixture();await assert.rejects(f.provider(scope,{model:tariff.model},async()=>({response:{ok:true},raw:{...raw,usage:{...raw.usage,input_tokens_details:fields}}})),e=>e.code==='AI_WALLET_USAGE_REVIEW');assert.equal(f.calls.filter(x=>x[0]==='settle').length,0);
 }
 const f=fixture();await assert.rejects(f.provider(scope,{model:tariff.model,max_output_tokens:30000},async()=>({response:{ok:true},raw}),async()=>9398),e=>e.code==='AI_WALLET_USAGE_REVIEW');assert.equal(f.calls.find(x=>x[0]==='review')[3].stage,'BOUNDS');
});

test('a mixed policy with complete provider partition preserves exact long-context and cached-read pricing',()=>{
 const price={...tariff,longContext:{thresholdTokens:10000,inputMicrosPerMillion:2000000,cachedInputMicrosPerMillion:200000,outputMicrosPerMillion:3000000,cacheWriteMicrosPerMillion:{ttl30m:2500000,ttl12h:5000000}},requestCacheWritePolicy:{schemaVersion:1,state:'MIXED'}};
 const measured=meteredUsage({...raw,usage:{input_tokens:15000,output_tokens:100,input_tokens_details:{cached_tokens:2000,cache_write_tokens:7000,cache_write_tokens_details:{ttl_30m_tokens:3000,ttl_12h_tokens:4000}}}},price);
 assert.equal(measured.amount,40200n);assert.equal(measured.usage.pricingTier,'LONG_CONTEXT');assert.equal(measured.usage.cacheWritePartitionSource,undefined);
 const uniform=meteredUsage({...raw,usage:{...raw.usage,input_tokens:15000}}, {...price,requestCacheWritePolicy:{schemaVersion:1,state:'UNIFORM',ttl:'30m',source:'REQUEST_DEFAULT'}});
 assert.equal(uniform.amount,37032n);assert.equal(uniform.usage.cacheWritePartitionSource,'REQUEST_DEFAULT');
});

test('policy snapshot and diagnostic sanitizer retain only closed policy facts',()=>{
 const settings={input:[{role:'user',content:[{text:'SECRET',prompt_cache_breakpoint:{ttl:'30m',mode:'explicit'}}]}]};
 assert.deepEqual(requestCacheWritePolicy(settings),{schemaVersion:1,state:'UNIFORM',ttl:'30m',source:'REQUEST_DEFAULT'});
 const evidence=sanitizeWalletReviewEvidence({requestCacheWritePolicy:{schemaVersion:1,state:'UNIFORM',ttl:'30m',source:'REQUEST_DEFAULT',prompt:'SECRET'}});
 assert.doesNotMatch(JSON.stringify(evidence),/SECRET|prompt/);assert.deepEqual(sanitizeWalletReviewEvidence(evidence),evidence);
});
