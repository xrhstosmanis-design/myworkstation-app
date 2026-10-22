import test from 'node:test';
import assert from 'node:assert/strict';
import {createInvoiceWalletMeter,throwIfWalletError,invoiceWalletFeatures} from '../src/services/ai-wallet-invoice-metering.js';

const token={model:'synthetic',inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:0,outputMicrosPerMillion:1000000,contextTokens:100,maxOutputTokens:20};
const page={model:'prebuilt-invoice',apiVersion:'2024-11-30',unitMicros:40,maxPages:5};
const env={AI_OWNER_WALLET_ENABLED:'true',AI_OWNER_WALLET_INVOICES_ENABLED:'true',AI_OWNER_WALLET_TARIFFS:JSON.stringify([token]),AI_OWNER_WALLET_AZURE_TARIFFS:JSON.stringify([page])};
const url='https://api.openai.com/v1/responses',options={method:'POST',body:JSON.stringify({model:'synthetic',input:'synthetic private invoice'})},scope={companyId:'c',storeId:'s'};
const raw=id=>({id,model:'synthetic',usage:{input_tokens:5,output_tokens:3,input_tokens_details:{cached_tokens:0}},output_text:'synthetic answer'});
const azurePayload={status:'succeeded',analyzeResult:{modelId:page.model,apiVersion:page.apiVersion,pages:[{pageNumber:1},{pageNumber:2}]}};
function fixture({configuration=env,repository={},transport,countPages=async()=>2}={}){
 const events=[];let sequence=0;
 const repo={enabledFor:async()=>true,reserve:async data=>{const id='r'+(++sequence);events.push({kind:'reserve',id,...data});return {id}},settle:async(companyId,id,data)=>events.push({kind:'settle',companyId,id,...data}),review:async(companyId,id)=>events.push({kind:'review',companyId,id}),...repository};
 const meter=createInvoiceWalletMeter({env:configuration,repository:repo,countPages,transport:transport||(async()=>new Response(JSON.stringify(raw('response-'+sequence)),{headers:{'content-type':'application/json'}}))});
 return {meter,events};
}
test('invoice runtime and feature gates default OFF; original transport/options and Azure results pass through without wallet effects',async()=>{
 for(const configuration of [{},{...env,AI_OWNER_WALLET_ENABLED:'false'},{...env,AI_OWNER_WALLET_INVOICES_ENABLED:'false'}]){
  let calls=0;const response=new Response('original'),f=fixture({configuration,repository:{enabledFor(){throw Error('no DB')}},transport:async(u,o)=>{assert.equal(u,url);assert.equal(o,options);calls++;return response},countPages(){throw Error('no PDF parse')}});
  assert.equal(await f.meter.responsesFetch(url,options),response);assert.equal(await f.meter.azure({},async()=>azurePayload),azurePayload);assert.equal(calls,1);
 }
 assert.deepEqual(invoiceWalletFeatures({}),['OWNER_ASSISTANT']);assert.ok(invoiceWalletFeatures(env).includes('INVOICE_AZURE'));
});
test('active invoice calls require a canonical scope and reject arbitrary outbound URL before paid I/O',async()=>{
 let calls=0;const f=fixture({transport:async()=>{calls++;return new Response('{}')}});
 await assert.rejects(f.meter.responsesFetch(url,options),e=>e.status===403);assert.throws(()=>f.meter.run({companyId:'c',storeId:''},()=>{}),e=>e.status===403);
 await assert.rejects(f.meter.run(scope,()=>f.meter.responsesFetch('https://untrusted.invalid',options)),e=>e.status===403);assert.equal(calls,0);
});
test('disabled company preserves exact options even under the invoice runtime gate',async()=>{
 const original={...options,body:' { "model": "unpriced" } '};const f=fixture({repository:{enabledFor:async()=>false},transport:async(u,o)=>{assert.equal(o,original);return 'same'}});
 assert.equal(await f.meter.run(scope,()=>f.meter.responsesFetch(url,original)),'same');assert.equal(f.events.length,0);
});
test('parallel invoice scopes retain the exact company/store across provider waits and settle only actual tokens',async()=>{
 const f=fixture();
 await Promise.all([{companyId:'a',storeId:'a1'},{companyId:'b',storeId:'b1'}].map(s=>f.meter.run(s,async()=>{await new Promise(resolve=>setTimeout(resolve,2));const result=await f.meter.responsesFetch(url,options);assert.equal((await result.json()).output_text,'synthetic answer')})));
 const holds=f.events.filter(e=>e.kind==='reserve'),debits=f.events.filter(e=>e.kind==='settle');
 assert.deepEqual(holds.map(h=>[h.companyId,h.storeId]).sort(),[['a','a1'],['b','b1']]);assert.ok(debits.every(d=>d.amountMicros===8n));assert.equal(debits.length,2);
 assert.doesNotMatch(JSON.stringify(f.events,(_,v)=>typeof v==='bigint'?String(v):v),/synthetic private invoice/);
});
test('exhausted balance never calls a paid provider; uncertain billing is409 and cannot enter ordinary503 fallback/retry',async()=>{
 let paid=0,fallback=0;const f=fixture({repository:{reserve:async()=>{throw Object.assign(Error('empty'),{code:'AI_WALLET_INSUFFICIENT',status:402})}},transport:async()=>{paid++}});
 await assert.rejects(f.meter.run(scope,async()=>{try{return await f.meter.responsesFetch(url,options)}catch(error){throwIfWalletError(error);fallback++}}),e=>e.status===402);assert.equal(paid,0);assert.equal(fallback,0);
 const uncertain=fixture({transport:async()=>{paid++;throw Error('synthetic timeout SECRET')}});
 await assert.rejects(uncertain.meter.run(scope,()=>uncertain.meter.responsesFetch(url,options)),e=>e.code==='AI_WALLET_USAGE_REVIEW'&&e.status===409&&!e.message.includes('SECRET'));assert.equal(uncertain.events.at(-1).kind,'review');
});
test('Azure page funding reserves once before POST/polls and uses verified physical pages and opaque operation identity',async()=>{
 const f=fixture();let invoked=0;
 const result=await f.meter.run(scope,()=>f.meter.azure({model:page.model,apiVersion:page.apiVersion,mimeType:'application/pdf',contentData:'synthetic'},async mark=>{invoked++;assert.equal(f.events[0].amountMicros,80n);mark('https://synthetic.invalid/operation/opaque-id?not-for-ledger');return azurePayload}));
 assert.equal(result,azurePayload);assert.equal(invoked,1);assert.equal(f.events[1].amountMicros,80n);assert.equal(f.events[1].usage.pages,2);assert.match(f.events[1].usage.providerResponseId,/^AZURE:[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(f.events,(_,v)=>typeof v==='bigint'?String(v):v),/opaque-id|not-for-ledger/);
});
test('Azure unknown/missing/duplicate pages, operation or model retain the hold instead of inventing consumption',async()=>{
 for(const value of [{}, {...azurePayload,analyzeResult:{...azurePayload.analyzeResult,pages:[{pageNumber:1},{pageNumber:1}]}}, {...azurePayload,analyzeResult:{...azurePayload.analyzeResult,modelId:'different'}}]){
  const f=fixture();await assert.rejects(f.meter.run(scope,()=>f.meter.azure({...page},async mark=>{mark('operation');return value})),e=>e.code==='AI_WALLET_USAGE_REVIEW'&&e.status===409);assert.equal(f.events.at(-1).kind,'review');assert.equal(f.events.filter(e=>e.kind==='settle').length,0);
 }
 const f=fixture();await assert.rejects(f.meter.run(scope,()=>f.meter.azure({...page},async()=>azurePayload)),e=>e.status===409);
});
test('Azure missing price, excessive physical pages and low balance fail before POST',async()=>{
 let paid=0;const invoke=async()=>{paid++;return azurePayload};
 for(const setup of [{configuration:{...env,AI_OWNER_WALLET_AZURE_TARIFFS:'[]'}},{countPages:async()=>6},{repository:{reserve:async()=>{throw Object.assign(Error('empty'),{code:'AI_WALLET_INSUFFICIENT',status:402})}}}]){
  const f=fixture(setup);await assert.rejects(f.meter.run(scope,()=>f.meter.azure({...page},invoke)));
 }
 assert.equal(paid,0);
});

test('actual internal commerce HTTP transport bypasses the invoice provider meter',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../src/routes/commerce-pos-v244.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('async function internalCommerceRequest('),source.indexOf('async function rebuildLostFastHandoff('));
 let calls=0;const previous=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{calls++;assert.match(url,/^http:\/\/127\.0\.0\.1:\d+\/api\/commerce\/synthetic$/);assert.equal(options.headers.Authorization,'synthetic-internal');return new Response(JSON.stringify({ok:true}))};
 try{
  const request=new Function('assertCustomerDemoOutboundAllowed','lifecycleContext','INTERNAL_COMMERCE_REQUEST_TIMEOUT_MS','fetch',body+';return internalCommerceRequest;')(()=>{},()=>({}),1000,()=>{throw Error('internal request must not enter paid provider adapter')});
  assert.deepEqual(await request('/synthetic',{authorization:'synthetic-internal'}),{ok:true});assert.equal(calls,1);
 }finally{globalThis.fetch=previous}
});
