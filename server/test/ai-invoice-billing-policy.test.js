import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceWalletReadiness,requireInvoiceWalletReady} from '../src/services/ai-invoice-wallet-readiness.js';
import {resolvedInvoiceWalletCompany} from '../src/services/ai-invoice-company-scope.js';
import {createInvoiceWalletMeter,invoiceWalletFeatures} from '../src/services/ai-wallet-invoice-metering.js';

const price=model=>({model,inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:100000,outputMicrosPerMillion:2000000,contextTokens:400000,maxOutputTokens:128000});
const page={model:'prebuilt-invoice',apiVersion:'2024-11-30',unitMicros:13200,maxPages:5};
const env={AI_OWNER_WALLET_ENABLED:'true',AI_OWNER_WALLET_INVOICES_ENABLED:'true',AI_OWNER_WALLET_INVOICE_COMPANIES:'[]',OPENAI_API_KEY:'synthetic-private-key',AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT:'synthetic-private-endpoint',AZURE_DOCUMENT_INTELLIGENCE_KEY:'synthetic-private-azure',AI_OWNER_WALLET_INVOICE_TARIFFS:JSON.stringify(['gpt-5','gpt-5-mini','gpt-5.6-sol'].map(price)),AI_OWNER_WALLET_INVOICE_AZURE_TARIFFS:JSON.stringify([page])};

test('invoice activation readiness validates each existing model and both providers without exposing credentials',()=>{
  assert.equal(invoiceWalletReadiness(env).ready,true);
  assert.deepEqual(new Set(invoiceWalletReadiness(env).models),new Set(['gpt-5','gpt-5-mini','gpt-5.6-sol']));
  assert.doesNotMatch(JSON.stringify(invoiceWalletReadiness(env)),/synthetic-private/);
  const custom={...env,OPENAI_INVOICE_MODEL:'custom',OPENAI_INVOICE_FAST_MODEL:'custom',OPENAI_INVOICE_FULL_MODEL:'custom',OPENAI_INVOICE_ASSISTANT_MODEL:'custom',AI_OWNER_WALLET_INVOICE_TARIFFS:JSON.stringify([price('custom')])};
  assert.equal(invoiceWalletReadiness(custom).ready,true);
  assert.equal(invoiceWalletReadiness({...custom,AI_OWNER_WALLET_INVOICE_TARIFFS:JSON.stringify([{...price('custom'),maxOutputTokens:29999}])}).ready,false);
  for(const bad of [{AI_OWNER_WALLET_INVOICES_ENABLED:'false'},{AI_OWNER_WALLET_ENABLED:'false'},{OPENAI_API_KEY:''},{AZURE_DOCUMENT_INTELLIGENCE_KEY:''},{AI_OWNER_WALLET_INVOICE_TARIFFS:'invalid'},{AI_OWNER_WALLET_INVOICE_TARIFFS:JSON.stringify([price('gpt-5')])},{AI_OWNER_WALLET_INVOICE_TARIFFS:JSON.stringify([...JSON.parse(env.AI_OWNER_WALLET_INVOICE_TARIFFS),price('gpt-5')])},{AI_OWNER_WALLET_INVOICE_AZURE_TARIFFS:JSON.stringify([page,page])},{AI_OWNER_WALLET_INVOICE_AZURE_TARIFFS:JSON.stringify([{...page,unitMicros:0}])}]){
    const value={...env,...bad};assert.equal(invoiceWalletReadiness(value).ready,false);assert.throws(()=>requireInvoiceWalletReady(value),e=>e.code.startsWith('AI_WALLET_INVOICE_'));
  }
  assert.equal(invoiceWalletReadiness({...env,OPENAI_INVOICE_MODEL:'private secret with spaces'}).models.includes('private secret with spaces'),false);
});

test('durable explicit company decisions override only legacy rollout, not the global gate',async()=>{
  const calls=[],repository={invoiceEnabledFor:async(company,fallback)=>{calls.push({company,fallback});return company==='new'}};
  assert.equal(await resolvedInvoiceWalletCompany(repository,'new',env),true);
  assert.equal(await resolvedInvoiceWalletCompany(repository,'old',{...env,AI_OWNER_WALLET_INVOICE_COMPANIES:'["old"]'}),false);
  assert.deepEqual(calls,[{company:'new',fallback:false},{company:'old',fallback:true}]);
  assert.ok(invoiceWalletFeatures(env,'new',true).includes('INVOICE_OPENAI'));
  assert.deepEqual(invoiceWalletFeatures({...env,AI_OWNER_WALLET_INVOICES_ENABLED:'false'},'new',true),['OWNER_ASSISTANT']);
  assert.deepEqual(invoiceWalletFeatures(env,'old',false),['OWNER_ASSISTANT']);
});

test('both actual invoice adapters use live company policy and pass legacy fallback to the atomic reservation',async()=>{
  let decision=true,paid=0;const holds=[],settled=[];
  const repository={enabledFor:async()=>true,invoiceEnabledFor:async()=>decision,reserve:async input=>{holds.push(input);return {id:'hold-'+holds.length}},settle:async(...args)=>settled.push(args),review:async()=>{throw Error('unexpected review')}};
  const meter=createInvoiceWalletMeter({repository,env,countPages:async()=>1,transport:async()=>{paid++;return new Response(JSON.stringify({id:'synthetic-'+paid,model:'gpt-5',usage:{input_tokens:10,output_tokens:2}}))}});
  const request={method:'POST',body:JSON.stringify({model:'gpt-5',input:'synthetic source'})},scope={companyId:'new',storeId:'new-store'};
  await meter.run(scope,()=>meter.responsesFetch('https://api.openai.com/v1/responses',request));
  await meter.run(scope,()=>meter.azure({model:page.model,apiVersion:page.apiVersion},async mark=>{mark('synthetic-operation');return {status:'succeeded',analyzeResult:{modelId:page.model,apiVersion:page.apiVersion,pages:[{pageNumber:1}]}}}));
  assert.equal(holds.length,2);assert.equal(settled.length,2);assert.ok(holds.every(h=>h.companyId==='new'&&h.storeId==='new-store'&&h.invoicePolicyFallback===false));
  decision=false;
  await meter.run(scope,()=>meter.responsesFetch('https://api.openai.com/v1/responses',request));
  await meter.run(scope,()=>meter.azure({},async()=>({original:true})));
  assert.equal(holds.length,2);assert.equal(settled.length,2);assert.equal(paid,2);
  repository.invoiceEnabledFor=async()=>{throw Object.assign(Error('unavailable policy'),{code:'AI_WALLET_INVOICE_CONFIG_INVALID',status:409})};
  await assert.rejects(meter.run(scope,()=>meter.responsesFetch('https://api.openai.com/v1/responses',request)),e=>e.status===409);assert.equal(paid,2);
});
