import test from 'node:test';
import assert from 'node:assert/strict';
import {tariffFor,reserveAmount,meteredUsage} from '../src/services/ai-owner-wallet-contract.js';
import {createWalletProvider} from '../src/services/ai-owner-wallet-provider.js';
import {createInvoiceWalletMeter} from '../src/services/ai-wallet-invoice-metering.js';

const row={model:'synthetic-cache-model',inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:100000,outputMicrosPerMillion:2000000,cacheWriteMicrosPerMillion:{ttl30m:1250000,ttl12h:2500000},contextTokens:20000,maxOutputTokens:5000};
const raw={id:'synthetic-cache-response',model:row.model,usage:{input_tokens:12000,output_tokens:2000,input_tokens_details:{cached_tokens:4000,cache_write_tokens:7000,cache_write_tokens_details:{ttl_30m_tokens:3000,ttl_12h_tokens:4000}}}};
const price=(value=row)=>tariffFor(value.model,JSON.stringify([value]));
const tier={thresholdTokens:10000,inputMicrosPerMillion:2000000,cachedInputMicrosPerMillion:200000,outputMicrosPerMillion:3000000,cacheWriteMicrosPerMillion:{ttl30m:2500000,ttl12h:5000000}};

test('cache read, ordinary input and both write lifetimes partition input exactly without additive double charging',()=>{
  const measured=meteredUsage(raw,price());assert.equal(measured.amount,19150n);assert.equal(reserveAmount(price()),60000n);
  assert.deepEqual(measured.usage,{providerResponseId:raw.id,model:row.model,inputTokens:12000,cachedInputTokens:4000,outputTokens:2000,cacheWriteTokens:7000,cacheWrite30mTokens:3000,cacheWrite12hTokens:4000});
});
test('long-context threshold applies the explicit full-request tier only above the boundary, including write/read/output rates',()=>{
  const tariff=price({...row,longContext:tier});assert.equal(meteredUsage(raw,tariff).amount,36300n);assert.equal(reserveAmount(tariff),115000n);
  for(const [input,amount,tierName] of [[10000,10200n,'STANDARD'],[10001,20302n,'LONG_CONTEXT']]){
    const measured=meteredUsage({...raw,usage:{input_tokens:input,output_tokens:100,input_tokens_details:{cached_tokens:0,cache_write_tokens:0,cache_write_tokens_details:{ttl_30m_tokens:0,ttl_12h_tokens:0}}}},tariff);
    assert.equal(measured.amount,amount);assert.equal(measured.usage.pricingTier,tierName);
  }
});
test('malformed, overlapping, missing or unpriced cache usage never becomes a guessed charge',()=>{
  const details=raw.usage.input_tokens_details;
  for(const d of [{...details,cached_tokens:undefined},{...details,cache_write_tokens:undefined},{...details,cache_write_tokens:null},{...details,cache_write_tokens_details:undefined},{...details,cache_write_tokens_details:{ttl_30m_tokens:7000}},{...details,cache_write_tokens_details:{ttl_30m_tokens:3000,ttl_12h_tokens:4001}},{...details,cache_write_tokens:9000,cache_write_tokens_details:{ttl_30m_tokens:5000,ttl_12h_tokens:4000}},{...details,cache_write_tokens_details:{ttl_30m_tokens:-1,ttl_12h_tokens:7001}}])assert.throws(()=>meteredUsage({...raw,usage:{...raw.usage,input_tokens_details:d}},price()),e=>e.code==='AI_WALLET_USAGE_REVIEW');
  const legacy={...row};delete legacy.cacheWriteMicrosPerMillion;
  assert.throws(()=>meteredUsage(raw,price(legacy)),e=>e.code==='AI_WALLET_USAGE_REVIEW');
});
test('tariff rows require complete strict explicit tier/write prices and version every configured change',()=>{
  for(const value of [{...row,cacheWriteMicrosPerMillion:{ttl30m:1}},{...row,longContext:{...tier,cacheWriteMicrosPerMillion:undefined}},{...row,longContext:{...tier,thresholdTokens:20000}},{...row,longContext:{...tier,cachedInputMicrosPerMillion:3000000}},{...row,cacheWriteMicrosPerMillion:{...row.cacheWriteMicrosPerMillion,unknown:1}}])assert.throws(()=>price(value),e=>e.code==='AI_WALLET_TARIFF_REQUIRED');
  assert.notEqual(price().version,price({...row,cacheWriteMicrosPerMillion:{...row.cacheWriteMicrosPerMillion,ttl12h:2500001}}).version);
});
test('legacy three-rate tariffs retain their original reserve, usage and metadata with absent write fields',()=>{
  const legacy={...row};delete legacy.cacheWriteMicrosPerMillion;const tariff=price(legacy),response={...raw,usage:{input_tokens:20,output_tokens:5,input_tokens_details:{cached_tokens:10}}};
  assert.equal(reserveAmount(tariff),30000n);assert.equal(meteredUsage(response,tariff).amount,21n);assert.equal('cacheWriteTokens' in meteredUsage(response,tariff).usage,false);
  assert.equal(meteredUsage({...response,usage:{...response.usage,input_tokens_details:{cached_tokens:10,cache_write_tokens:0}}},tariff).amount,21n);
});
test('owner provider reserves the full write envelope before I/O and settles only the verified partition; incomplete usage retains REVIEW',async()=>{
  const calls=[],repository={enabledFor:async()=>true,reserve:async value=>{calls.push(['reserve',value]);return {id:'r'}},settle:async(...args)=>calls.push(['settle',...args]),review:async()=>calls.push(['review'])};
  const provider=createWalletProvider({repository,enabled:()=>true,tariffs:()=>JSON.stringify([row])}),scope={companyId:'c',storeId:'s',feature:'OWNER_ASSISTANT'};
  await provider(scope,{model:row.model},async()=>{assert.equal(calls[0][1].amountMicros,60000n);return {response:{ok:true},raw}});assert.equal(calls[1][3].amountMicros,19150n);
  await assert.rejects(provider(scope,{model:row.model},async()=>({response:{ok:true},raw:{...raw,usage:{input_tokens:1,output_tokens:1}}})),e=>e.code==='AI_WALLET_USAGE_REVIEW');assert.equal(calls.at(-1)[0],'review');assert.equal(calls.filter(c=>c[0]==='settle').length,1);
});
test('actual invoice Responses adapter shares the exact write and long-context tariff contract',async()=>{
  let charged,reserved;const repository={enabledFor:async()=>true,reserve:async value=>{reserved=value.amountMicros;return {id:'r'}},settle:async(c,id,value)=>{charged=value},review:async()=>{throw Error('must not review verified usage')}};
  const meter=createInvoiceWalletMeter({repository,env:{AI_OWNER_WALLET_ENABLED:'true',AI_OWNER_WALLET_INVOICES_ENABLED:'true',AI_OWNER_WALLET_TARIFFS:JSON.stringify([{...row,longContext:tier}])},transport:async()=>new Response(JSON.stringify(raw))});
  await meter.run({companyId:'c',storeId:'s'},()=>meter.responsesFetch('https://api.openai.com/v1/responses',{method:'POST',body:JSON.stringify({model:row.model})}));
  assert.equal(reserved,115000n);assert.equal(charged.amountMicros,36300n);assert.equal(charged.usage.pricingTier,'LONG_CONTEXT');
});
