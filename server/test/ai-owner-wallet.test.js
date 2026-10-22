import test from 'node:test';
import assert from 'node:assert/strict';
import {tariffFor,reserveAmount,meteredUsage,positiveMicros} from '../src/services/ai-owner-wallet-contract.js';
import {createWalletProvider} from '../src/services/ai-owner-wallet-provider.js';
import {acceptedWalletMail,walletNoticeText,createWalletNotificationDispatcher} from '../src/services/ai-owner-wallet-notifications.js';
import {walletMicrosFromEuros} from '../../client/src/components/voice/ai-wallet-money.mjs';

const tariff={model:'synthetic-model',inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:500000,outputMicrosPerMillion:2000000,contextTokens:100,maxOutputTokens:20};
const tariffs=JSON.stringify([tariff]),scope={companyId:'company',storeId:'store',feature:'OWNER_ASSISTANT'};
const raw={id:'synthetic-response',model:tariff.model,usage:{input_tokens:20,input_tokens_details:{cached_tokens:10},output_tokens:5}};
function fixture(overrides={}){
  const calls=[];const repository={enabledFor:async()=>true,reserve:async value=>{calls.push(['reserve',value]);return {id:'r',companyId:'company'}},settle:async(...args)=>calls.push(['settle',...args]),review:async(...args)=>calls.push(['review',...args]),...overrides};
  return {calls,repository,provider:createWalletProvider({repository,enabled:()=>true,tariffs:()=>tariffs})};
}
test('wallet tariff uses integer EUR micro-units, exact cached/output usage and conservative ceilings',()=>{
  const price=tariffFor(tariff.model,tariffs);assert.equal(reserveAmount(price),140n);
  assert.equal(meteredUsage(raw,price).amount,25n);assert.equal(price.currency,'EUR');assert.match(price.version,/^[a-f0-9]{64}$/);
  assert.equal(meteredUsage({...raw,usage:{input_tokens:1,output_tokens:0}},tariffFor(tariff.model,JSON.stringify([{...tariff,inputMicrosPerMillion:1,cachedInputMicrosPerMillion:0}]))).amount,1n);
  for(const value of ['', '[]','not-json',JSON.stringify([tariff,tariff]),JSON.stringify([{...tariff,cachedInputMicrosPerMillion:2000000}])])assert.throws(()=>tariffFor(tariff.model,value),e=>e.code==='AI_WALLET_TARIFF_REQUIRED');
});
test('wallet refuses invented usage, wrong model and tokens beyond the reserved model limits',()=>{
  for(const value of [{}, {...raw,model:'other'}, {...raw,id:''}, {...raw,usage:{input_tokens:2,output_tokens:1,input_tokens_details:{cached_tokens:3}}}, {...raw,usage:{input_tokens:101,output_tokens:0}}, {...raw,usage:{input_tokens:1,output_tokens:21}}, {...raw,usage:{input_tokens:1.5,output_tokens:1}}])assert.throws(()=>meteredUsage(value,tariff));
});
test('funding parsing never uses floating-point rounding and rejects negatives, exponents, zero and over-limit amounts',()=>{
  assert.equal(walletMicrosFromEuros('12,34'),'12340000');assert.equal(walletMicrosFromEuros('0.01'),'10000');assert.equal(walletMicrosFromEuros('1000000'),'1000000000000');
  for(const value of ['0','-1','1e3','NaN','0.001','1000001','1,2,3'])assert.throws(()=>walletMicrosFromEuros(value));
  for(const value of ['0','-1','1.5','1000000000001',1])assert.throws(()=>positiveMicros(value));
});
test('disabled runtime calls the existing provider byte-for-byte without touching wallet storage',async()=>{
  let calls=0;const settings={model:'unknown',input:'synthetic'},provider=createWalletProvider({enabled:()=>false,repository:new Proxy({},{get(){throw Error('must not initialize')}})});
  assert.equal(await provider(null,settings,async body=>{assert.equal(body,settings);calls++;return 'unchanged'}),'unchanged');assert.equal(calls,1);
});
test('active provider reserves before invocation, settles exact usage once and does not retain prompts',async()=>{
  const f=fixture();let invocations=0;
  await f.provider(scope,{model:tariff.model,input:'not stored',max_output_tokens:10},async settings=>{invocations++;assert.equal(f.calls[0][0],'reserve');assert.equal(settings.max_output_tokens,10);return {response:{ok:true},raw}});
  assert.equal(invocations,1);assert.equal(f.calls[1][0],'settle');assert.equal(f.calls[1][3].amountMicros,25n);assert.doesNotMatch(JSON.stringify(f.calls,(_,v)=>typeof v==='bigint'?String(v):v),/not stored/);
});
test('no money, absent prices and invalid scope never invoke the paid provider',async()=>{
  let calls=0;const invoke=async()=>{calls++};
  await assert.rejects(fixture({reserve:async()=>{throw Object.assign(Error('insufficient'),{code:'AI_WALLET_INSUFFICIENT',status:402})}}).provider(scope,{model:tariff.model},invoke),e=>e.status===402);
  await assert.rejects(fixture().provider(scope,{model:'unpriced'},invoke));
  await assert.rejects(fixture().provider({...scope,storeId:''},{model:tariff.model},invoke));assert.equal(calls,0);
});
test('timeout, bad usage, provider rejection and settlement failure retain a reviewed hold without blind refund/retry',async()=>{
  for(const invoke of [async()=>{throw Error('SECRET transport timeout')},async()=>({response:{ok:false},raw:{}}),async()=>({response:{ok:true},raw:{}})]){
    const f=fixture();await assert.rejects(f.provider(scope,{model:tariff.model},invoke),e=>e.code==='AI_WALLET_USAGE_REVIEW'&&!e.message.includes('SECRET'));assert.equal(f.calls.filter(x=>x[0]==='review').length,1);assert.equal(f.calls.filter(x=>x[0]==='settle').length,0);
  }
  const f=fixture({settle:async()=>{throw Error('database unavailable')}});await assert.rejects(f.provider(scope,{model:tariff.model},async()=>({response:{ok:true},raw})));assert.equal(f.calls.at(-1)[0],'review');
});
test('mail acceptance requires one exact positive recipient and rejects partial/uncertain responses',()=>{
  const to='owner@example.invalid',ok={messageId:'synthetic-id',accepted:[to],rejected:[]};assert.equal(acceptedWalletMail(ok,to),true);
  for(const value of [{...ok,messageId:''},{...ok,accepted:[]},{...ok,accepted:[to,'other@example.invalid']},{...ok,rejected:['other']},{...ok,pending:[to]},{...ok,pending:null},{...ok,rejected:undefined}])assert.equal(acceptedWalletMail(value,to),false);
  assert.match(walletNoticeText({kind:'LOW',balanceMicros:'200000',amountMicros:'0'}).text,/20%/);assert.match(walletNoticeText({kind:'EMPTY',balanceMicros:'0'}).text,/υπόλοιπο πρόγραμμα/);
});
test('notification dispatcher cannot initialize schema or send mail with the runtime gate off',async()=>{
  const drain=createWalletNotificationDispatcher({enabled:()=>false,repository:{ensure(){throw Error('schema effect')}},send(){throw Error('outbound effect')}});assert.deepEqual(await drain(),{attempted:0});
});
