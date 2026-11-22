import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerCostMeter} from '../src/services/ai-customer-cost-meter.js';
import {variableServiceTariff,externalServiceReadiness} from '../src/services/ai-variable-service-tariffs.js';
import {walletActivityFromRequest} from '../src/services/ai-wallet-activity.js';
import {activityPurpose,activityProvider} from '../../client/src/components/voice/ai-wallet-activity.mjs';
const row={provider:'SERPER_GOOGLE',currency:'EUR',providerUnitCostMicros:'101',basisReference:'Synthetic verified contract, not a live price',validFrom:'2020-01-01T00:00:00.000Z',validUntil:'2099-01-01T00:00:00.000Z'};
const price=JSON.stringify([row]);
const scope={companyId:'synthetic-company',storeId:'synthetic-store',feature:'STAFF_SCHEDULE'};
function fixture(overrides={}){
 const events=[];const repository={enabledFor:async()=>true,reserve:async input=>{events.push(['reserve',input]);return {id:'hold'};},settle:async (...args)=>events.push(['settle',...args]),review:async (...args)=>events.push(['review',...args]),...overrides};
 const env={AI_OWNER_WALLET_ENABLED:'true',AI_OWNER_WALLET_EXTERNAL_COST_TARIFFS:price};
 return {events,repository,env,meter:createCustomerCostMeter({repository,env})};
}
test('validated EUR external unit cost applies the margin exactly once with integer rounding and immutable provenance',()=>{
 const tariff=variableServiceTariff('SERPER_GOOGLE',price);
 assert.equal(tariff.unitMicros,'152');assert.equal(tariff.providerUnitCostMicros,'101');assert.equal(tariff.markupBps,5000);assert.equal(tariff.billingUnit,'SUCCESSFUL_QUERY');
 assert.match(tariff.version,/^[a-f0-9]{64}$/);assert.notEqual(variableServiceTariff('SERPER_GOOGLE',JSON.stringify([{...row,basisReference:'changed proof'}])).version,tariff.version);
});
test('estimates, USD, missing/ambiguous/expired/future prices, unknown fields and overflow never become debt',()=>{
 for(const source of ['', '[]','invalid',JSON.stringify([row,row]),JSON.stringify([{...row,currency:'USD'}]),JSON.stringify([{...row,estimatedCostUsd:0.001}]),JSON.stringify([{...row,providerUnitCostMicros:'0'}]),JSON.stringify([{...row,providerUnitCostMicros:'1000000000000'}]),JSON.stringify([{...row,validUntil:'2020-01-01T00:00:00.000Z'}]),JSON.stringify([{...row,validFrom:'2098-01-01T00:00:00.000Z'}])])assert.throws(()=>variableServiceTariff('SERPER_GOOGLE',source),e=>e.code==='AI_WALLET_EXTERNAL_TARIFF_REQUIRED');
 assert.equal(externalServiceReadiness({})[0].ready,false);
});
test('native authorization, reservation and measured settlement precede/contain exactly one provider invocation',async()=>{
 const f=fixture();let calls=0;
 const result=await f.meter.query(scope,'SERPER_GOOGLE',async()=>{calls++;f.events.push(['provider']);return {organic:[]};},async()=>f.events.push(['authorize']));
 assert.deepEqual(result,{organic:[]});assert.equal(calls,1);assert.deepEqual(f.events.map(e=>e[0]),['authorize','reserve','provider','settle']);
 assert.equal(f.events[1][1].amountMicros,152n);assert.equal(f.events[1][1].feature,'SERPER_GOOGLE');
 const settlement=f.events[3][3];assert.equal(settlement.amountMicros,152n);assert.equal(settlement.usage.queries,1);assert.equal(settlement.usage.markupBps,5000);assert.match(settlement.usage.responseDigest,/^[a-f0-9]{64}$/);
});
test('missing tariff, rejected session/scope and insufficient balance stop before paid I/O',async()=>{
 for(const mode of ['tariff','session','funds','scope']){
  const f=fixture(mode==='funds'?{reserve:async()=>{throw Object.assign(new Error(),{code:'AI_WALLET_INSUFFICIENT'});}}:{});let calls=0;
  if(mode==='tariff')f.env.AI_OWNER_WALLET_EXTERNAL_COST_TARIFFS='[]';
  await assert.rejects(f.meter.query(mode==='scope'?{companyId:'c'}:scope,'SERPER_GOOGLE',async()=>{calls++;return {};},mode==='scope'?undefined:async()=>{if(mode==='session')throw Object.assign(new Error(),{code:'AI_WALLET_SESSION_REQUIRED'});}),e=>String(e.code).startsWith('AI_WALLET_'));
  assert.equal(calls,0);assert.ok(!f.events.some(e=>e[0]==='settle'));
 }
});
test('ambiguous transport, malformed payload and settlement rollback retain REVIEW and stop any automatic paid retry',async()=>{
 for(const mode of ['timeout','malformed','rollback','review-write-fails']){
  const f=fixture(mode==='rollback'?{settle:async()=>{throw new Error('rollback');}}:mode==='review-write-fails'?{review:async()=>{throw new Error('review unavailable');}}:{});let calls=0;
  await assert.rejects(f.meter.query(scope,'SERPER_GOOGLE',async()=>{calls++;if(mode==='timeout'||mode==='review-write-fails')throw new Error('lost provider reply');return mode==='malformed'?null:{organic:[]};},async()=>{}),e=>e.code==='AI_WALLET_USAGE_REVIEW');
  assert.equal(calls,1);assert.equal(f.events.filter(e=>e[0]==='reserve').length,1);if(mode!=='review-write-fails')assert.equal(f.events.at(-1)[0],'review');
 }
});
test('disabled rollout preserves original invocation/options and does not authorize or create wallet state',async()=>{
 for(const disabled of ['global','company']){
  const f=fixture(disabled==='company'?{enabledFor:async()=>false}:disabled==='under-lock'?{reserve:async()=>null}:{});if(disabled==='global')f.env.AI_OWNER_WALLET_ENABLED='false';let calls=0;
  const settings={model:'unpriced legacy',input:'unchanged'};
  const result=await f.meter.responses(scope,settings,async actual=>{assert.equal(actual,settings);calls++;return 'legacy';},async()=>{if(disabled!=='under-lock')throw new Error('must not authorize');});
  // under-lock response path requires a configured model before reserve.
  assert.equal(result,'legacy');assert.equal(calls,1);
 }
});
test('existing inclusive OpenAI tariff is reused without a second margin and carries real activity',async()=>{
 const f=fixture();f.env.AI_OWNER_WALLET_TARIFFS=JSON.stringify([{model:'synthetic-model',inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:500000,outputMicrosPerMillion:2000000,contextTokens:1000,maxOutputTokens:100}]);
 const activity=walletActivityFromRequest({user:{id:'actual-user',companyId:scope.companyId,tokenType:'BACKOFFICE_USER',role:'OWNER',fullName:'Synthetic actor'}},{storeId:scope.storeId,purpose:'STAFF_SCHEDULE'});
 await f.meter.responses({...scope,activity},{model:'synthetic-model'},async settings=>{assert.equal(settings.max_output_tokens,100);return {response:{ok:true},raw:{id:'response-synthetic',model:'synthetic-model',usage:{input_tokens:100,output_tokens:10}}};},async()=>{});
 assert.equal(f.events[0][1].amountMicros,1200n);assert.equal(f.events.at(-1)[3].amountMicros,120n);assert.equal(f.events[0][1].activity.actor.id,'actual-user');
 for(const feature of ['STAFF_SCHEDULE','CASH_PAPER_READING','PLATFORM_CUSTOMER_ASSISTANT']){assert.equal(activityProvider({kind:'USAGE',feature}),'OpenAI');assert.notEqual(activityPurpose({kind:'USAGE',feature}),'OTHER');}
 assert.equal(activityProvider({kind:'USAGE',feature:'SERPER_GOOGLE'}),'Serper');assert.equal(activityPurpose({kind:'USAGE',feature:'GOOGLE_CSE'}),'ONLINE_SEARCH');
});
