import test from 'node:test';
import assert from 'node:assert/strict';
import {countInvoiceInput} from '../src/services/ai-invoice-input-count.js';
import {reserveAmount,reserveRequestAmount,tariffFor} from '../src/services/ai-owner-wallet-contract.js';
import {createWalletProvider} from '../src/services/ai-owner-wallet-provider.js';

const tariff={model:'synthetic',inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:100000,outputMicrosPerMillion:2000000,contextTokens:100000,maxOutputTokens:30000};
const scope={companyId:'c',storeId:'s',feature:'INVOICE_OPENAI'};
const settings={model:'synthetic',input:[{role:'user',content:[{type:'input_text',text:'synthetic invoice'},{type:'input_image',image_url:'data:image/png;base64,c3ludGhldGlj'}]}],max_output_tokens:5000,text:{format:{type:'json_schema',name:'synthetic',schema:{type:'object'}}},reasoning:{effort:'low'}};
const options={method:'POST',headers:{Authorization:'Bearer synthetic'},signal:new AbortController().signal};
const usage=(input=1200,output=100)=>({id:'synthetic-response',model:'synthetic',usage:{input_tokens:input,output_tokens:output,input_tokens_details:{cached_tokens:0}}});
function fixture(extra={}){
  const events=[];
  const repository={enabledFor:async()=>true,reserve:async value=>{events.push(['reserve',value]);return {id:'r'}},settle:async(...args)=>events.push(['settle',...args]),review:async()=>events.push(['review']),...extra.repository};
  const provider=createWalletProvider({repository,enabled:extra.enabled||(()=>true),tariffs:()=>JSON.stringify([extra.tariff||tariff])});
  return {provider,events};
}
test('measured invoice input plus unchanged requested output replaces the full capacity hold',async()=>{
  const f=fixture();let generated=0;
  await f.provider(scope,settings,async actual=>{generated++;assert.deepEqual(actual,settings);assert.equal(f.events[0][1].amountMicros,11200n);return {response:{ok:true},raw:usage()}},async()=>1200);
  assert.equal(generated,1);assert.equal(f.events[1][3].amountMicros,1400n);
  assert.equal(f.events[0][1].tariff.contextTokens,100000);assert.equal(f.events[0][1].tariff.maxOutputTokens,30000);
  assert.equal(reserveAmount(tariff),160000n);
});
test('request holds cover every cache partition and the precise long-context boundary',()=>{
  const t={...tariff,cacheWriteMicrosPerMillion:{ttl30m:1250000,ttl12h:2500000},longContext:{thresholdTokens:10000,inputMicrosPerMillion:2000000,cachedInputMicrosPerMillion:200000,outputMicrosPerMillion:3000000,cacheWriteMicrosPerMillion:{ttl30m:2500000,ttl12h:5000000}}};
  assert.equal(reserveRequestAmount(t,{inputTokens:10000,maxOutputTokens:5000}),35000n);
  assert.equal(reserveRequestAmount(t,{inputTokens:10001,maxOutputTokens:5000}),65005n);
  assert.equal(reserveRequestAmount({...tariff,inputMicrosPerMillion:1,outputMicrosPerMillion:1},{inputTokens:1,maxOutputTokens:1}),1n);
});
test('no measurement and unsupported mutable requests keep the original full hold',async()=>{
  for(const measure of [undefined,async()=>null]){
    const f=fixture();await f.provider(scope,settings,async()=>({response:{ok:true},raw:usage()}),measure);
    assert.equal(f.events[0][1].amountMicros,reserveAmount(tariff));
  }
});
test('invalid counts/caps stop before hold and generation without reducing the requested output',async()=>{
  for(const count of [undefined,-1,1.5,NaN,100001]){
    const f=fixture();let generated=0;
    await assert.rejects(f.provider(scope,settings,async()=>{generated++},async()=>count),e=>e.code==='AI_WALLET_INPUT_COUNT_REQUIRED');
    assert.equal(generated,0);assert.equal(f.events.length,0);
  }
  for(const max of [0,-1,1.5,30001])assert.throws(()=>reserveRequestAmount(tariff,{inputTokens:1200,maxOutputTokens:max}));
});
test('insufficient balance and input counting failure never generate or silently fall back',async()=>{
  const f=fixture({repository:{reserve:async()=>{throw Object.assign(Error('empty'),{code:'AI_WALLET_INSUFFICIENT'})}}});let generated=0;
  await assert.rejects(f.provider(scope,settings,async()=>{generated++},async()=>1200),e=>e.code==='AI_WALLET_INSUFFICIENT');
  assert.equal(generated,0);
  await assert.rejects(f.provider(scope,settings,async()=>{generated++},async()=>{throw Object.assign(Error('count'),{code:'AI_WALLET_INPUT_COUNT_REQUIRED'})}));
  assert.equal(generated,0);
});
test('provider usage over the measured input or requested output retains REVIEW and cannot settle',async()=>{
  for(const raw of [usage(1201),usage(1200,5001)]){
    const f=fixture();await assert.rejects(f.provider(scope,settings,async()=>({response:{ok:true},raw}),async()=>1200),e=>e.code==='AI_WALLET_USAGE_REVIEW');
    assert.deepEqual(f.events.map(e=>e[0]),['reserve','review']);
  }
});
test('runtime/company OFF preserve legacy invocation and never count or initialize a wallet',async()=>{
  for(const extra of [{enabled:()=>false},{repository:{enabledFor:async()=>false}}]){
    const f=fixture(extra);let calls=0;
    await f.provider(scope,settings,async actual=>{calls++;assert.equal(actual,settings);return 'same'},async()=>{throw Error('must not count')});
    assert.equal(calls,1);assert.equal(f.events.length,0);
  }
});
test('input-count request preserves inline invoice and JSON schema, credentials/signal; generation-only cap is excluded',async()=>{
  const before=JSON.stringify(settings);let calls=0;
  const count=await countInvoiceInput(settings,options,async(url,actual)=>{
    calls++;assert.equal(url,'https://api.openai.com/v1/responses/input_tokens');assert.equal(actual.headers,options.headers);assert.equal(actual.signal,options.signal);
    const body=JSON.parse(actual.body);assert.deepEqual(body.input,settings.input);assert.deepEqual(body.text,settings.text);assert.deepEqual(body.reasoning,settings.reasoning);assert.equal(body.max_output_tokens,undefined);
    return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:1200}));
  });assert.equal(count,1200);assert.equal(calls,1);assert.equal(JSON.stringify(settings),before);
});
test('PDF data is countable; remote URL, conversation, tool, prompt and unknown inputs keep full holds without preflight I/O',async()=>{
  const pdf={...settings,input:[{role:'user',content:[{type:'input_file',filename:'synthetic.pdf',file_data:'data:application/pdf;base64,c3ludGhldGlj'}]}]};
  assert.equal(await countInvoiceInput(pdf,options,async()=>new Response(JSON.stringify({object:'response.input_tokens',input_tokens:42}))),42);
  for(const value of [{...settings,previous_response_id:'old'},{...settings,conversation:'c'},{...settings,prompt:{id:'p'}},{...settings,tools:[{type:'web_search'}]},{...settings,truncation:'auto'},{...settings,input:[{role:'user',content:[{type:'input_image',image_url:'https://example.invalid/mutable.png'}]}]},{...settings,input:[{role:'user',content:[{type:'input_file',file_url:'https://example.invalid/mutable.pdf'}]}]},{...settings,input:[{role:'assistant',content:'old'}]}]){
    assert.equal(await countInvoiceInput(value,options,()=>{throw Error('must not call')}),null);
  }
});
test('invalid/unavailable/aborted count responses fail safely without leaking provider details',async()=>{
  for(const transport of [async()=>new Response('secret',{status:503}),async()=>new Response('not JSON'),async()=>new Response(JSON.stringify({input_tokens:12})),async()=>new Response(JSON.stringify({object:'response.input_tokens',input_tokens:1.1})),async()=>{throw Error('secret provider error')}]){
    await assert.rejects(countInvoiceInput(settings,options,transport),e=>e.code==='AI_WALLET_INPUT_COUNT_REQUIRED'&&!e.message.includes('secret'));
  }
  const abort=new AbortController();abort.abort();let calls=0;
  await assert.rejects(countInvoiceInput(settings,{...options,signal:abort.signal},async()=>{calls++}),e=>e.code==='AI_WALLET_INPUT_COUNT_REQUIRED');assert.equal(calls,0);
});
