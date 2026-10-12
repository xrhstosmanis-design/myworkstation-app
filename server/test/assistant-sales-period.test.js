import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {assistantEffectiveQuestion,assistantQuestionHasPeriod,assistantSalesPeriodClarification} from '../src/services/assistant-conversation-context.js';
import {assistantAnswerFromResponse} from '../src/services/assistant-answer-response.js';
import {createOwnerAssistantRouter} from '../src/routes/owner-assistant.js';
import {createPlatformAssistantSession} from '../src/services/platform-assistant-products.js';
import {readAssistantSalesStores} from '../src/services/assistant-sales-stores.js';
const question='πωλησεις κατηγορια μπυρες',scope={companyId:'c',companyName:'Company',storeId:'s',storeName:'Selected'};
const history=[{role:'user',content:question},{role:'assistant',content:'Για ποια περίοδο;'}];
const fabricated={answer:'Δεν υπάρχουν μπύρες. 999 ευρώ. Ζήτησε SKU.',highlights:['999'],sources:['Fake'],limitations:'Fake'};
const raw={status:'completed',output_text:JSON.stringify(fabricated)};
test('sales period clarification is server-owned and cannot publish fabricated model amounts or false absence',()=>{
 for(const q of ['βγαλε μου λιστα πωλησεων απο μπυρες',question,'πωλήσεις Άλφα330']){
  const result=assistantAnswerFromResponse(raw,[],{requireEvidence:true,question:q});assert.equal(result.clarification,'period');assert.match(result.answer,/Για ποια περίοδο/);assert.deepEqual(result.sources,[]);assert.doesNotMatch(JSON.stringify(result),/999|SKU|Fake|Δεν υπάρχουν|Δεν διαβάστηκε/);
 }
 for(const q of ['πωλήσεις μπύρες 11/10/26','πωλήσεις μπύρες χθες','πωλήσεις και ταμεία','πως βλέπω πωλήσεις'])assert.equal(assistantSalesPeriodClarification(q),null);
 const denied=assistantAnswerFromResponse(raw,[],{requireEvidence:true,question:'πωλήσεις μπύρες σήμερα'});assert.equal(denied.sourceUnavailable,true);assert.doesNotMatch(JSON.stringify(denied),/999|Fake/);
 assert.throws(()=>assistantAnswerFromResponse({output:[{content:[{type:'refusal'}]}]},[],{requireEvidence:true,question}),e=>e.code==='AI_RESPONSE_REFUSED');
 assert.throws(()=>assistantAnswerFromResponse({status:'failed'},[],{providerOK:false,requireEvidence:true,question}),e=>e.code==='AI_PROVIDER_ERROR');
});
test('bare dates continue the latest topic, sales can retain its explicit period, and other report topics stop date inheritance',()=>{
 for(const q of ['απο 1/10 εως 31/10','1/10/26 έως 11/10/26','2026-10-01 έως 2026-10-11','11/10/26'])assert.match(assistantEffectiveQuestion(q,history),/πωλησεις κατηγορια μπυρες/);
 for(const q of ['πωλήσεις σήμερα','πωλήσεις χθες','πωλήσεις από1/10 έως31/10','πωλήσεις Οκτωβρίου','πωλήσεις τον προηγούμενο μήνα'])assert.equal(assistantQuestionHasPeriod(q),true);
 assert.equal(assistantQuestionHasPeriod(question),false);assert.equal(assistantQuestionHasPeriod('πωλήσεις νερού ΑΥΡΑ 1.5 λίτρου'),false);assert.equal(assistantQuestionHasPeriod('Πωλήσεις Άλφα330 Άλφα500'),false);
 const sales=[{role:'user',content:'πωλήσεις κόκα κόλα 11/10/26'}];assert.match(assistantEffectiveQuestion(question,sales),/Περίοδος της ίδιας αναζήτησης/);
 for(const topic of ['ταμεία 11/10/26','απόθεμα σήμερα','ιδιοκατανάλωση 11/10/26','πληρωμές 11/10/26'])assert.equal(assistantEffectiveQuestion(question,[...sales,{role:'user',content:topic}]),question);
 assert.equal(assistantEffectiveQuestion('εργαζόμενοι 11/10/26',history),'εργαζόμενοι 11/10/26');
 assert.match(assistantEffectiveQuestion(question,[...sales,{role:'user',content:'και χθες;'}]),/Περίοδος της ίδιας αναζήτησης πωλήσεων: και χθες/);
 assert.equal(assistantEffectiveQuestion('πωλήσεις μπύρες σήμερα',sales),'πωλήσεις μπύρες σήμερα');
 for(const q of ['Σε Excel','Και ανά κατάστημα;']){const effective=assistantEffectiveQuestion(q,[...history,{role:'user',content:'1/10/26 έως 11/10/26'}]);assert.match(effective,/πωλησεις κατηγορια μπυρες/);assert.match(effective,/Η νεότερη περίοδος αυτής της αναζήτησης είναι: 1\/10\/26 έως 11\/10\/26/);assert.equal(assistantSalesPeriodClarification(effective),null);}
});
test('actual Owner HTTP asks only period without provider/read and date-only reply reads freshly scoped canonical category',async()=>{
 let providers=0,reads=0,inventory=true,change=false,authorizations=0;
 const args={mode:'category',names:['μπίρες'],from:'2026-10-01',to:'2026-10-11'};
 const router=createOwnerAssistantRouter({authenticate:(req,res,next)=>{req.user={id:'owner',role:'OWNER'};next()},authorize:async(req,{requiredModules=[]}={})=>{authorizations++;if(requiredModules.includes('INVENTORY')&&!inventory)throw Object.assign(Error('disabled'),{code:'MODULE_DISABLED',status:403});return {...scope,storeId:change&&authorizations>=4?'foreign':'s'}},authorizeSalesStores:async(req,all)=>{assert.equal(all,false);return {scope:'OWNER_SELECTED_STORE',stores:[scope],excluded:[],truncated:false}},providerConfigured:()=>true,provider:async settings=>{providers++;assert.match(settings.input[0].content,/πωλησεις κατηγορια μπυρες/);assert.match(settings.input[0].content,/1\/10/);assert.deepEqual(settings.tools.map(t=>t.name).sort(),['sales_by_product','sales_by_store']);return providers%2===1?{response:{ok:true},raw:{status:'completed',output:[{type:'function_call',name:'sales_by_store',call_id:'read',arguments:JSON.stringify(args)}]}}:{response:{ok:true},raw}},readSalesStores:async(a,access,options)=>readAssistantSalesStores(a,access,{...options,readCatalog:async c=>{assert.equal(c,'c');return [{productId:'beer',name:'ΑΛΦΑ330',categoryName:'ΜΠΥΡΕΣ'}]},readReport:async f=>{reads++;assert.equal(f.companyId,'c');assert.equal(f.storeId,'s');assert.deepEqual(f.productIds,['beer']);const items=[{productId:'beer',name:'ΑΛΦΑ330',unit:'PIECE',storeId:'s',salesQuantity:2,grossSales:3,netSales:2.65,vatValue:.35,reversalCount:0,returnGrossValue:0}];return {companyId:'c',storeId:'s',period:{calendarFrom:args.from,calendarTo:args.to,timeZone:'Europe/Athens',from:f.from.toISOString(),toExclusive:f.to.toISOString()},items,count:1,reversalAware:true}},now:new Date('2026-10-12T18:00:00Z')})});
 const app=express();app.use(express.json());app.use('/api/owner-assistant',router);app.use((e,req,res,next)=>res.status(e.status||400).json({code:e.code,error:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const ask=body=>fetch(`http://127.0.0.1:${server.address().port}/api/owner-assistant/stores/s/ask`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  let response=await ask({question});assert.equal(response.status,200);let result=await response.json();assert.equal(result.clarification,'period');assert.deepEqual(result.evidence,[]);assert.equal(result.scope.storeId,'s');assert.equal(providers,0);assert.equal(reads,0);
  response=await ask({question:'απο 1/10 εως 11/10/26',history});assert.equal(response.status,200);result=await response.json();assert.equal(providers,2);assert.equal(reads,1);assert.equal(result.evidence[0].kind,'sales_by_store');assert.equal(result.evidence[0].mode,'category');assert.equal(result.evidence[0].rows[0].salesQuantity,2);assert.equal(result.evidence[0].storeId,undefined);
  inventory=false;response=await ask({question});assert.equal(response.status,403);assert.equal(providers,2);assert.equal(reads,1);
  inventory=true;change=true;authorizations=0;response=await ask({question});assert.equal(response.status,403);assert.equal((await response.json()).code,'OWNER_ASSISTANT_CONTEXT_CHANGED');assert.equal(providers,2);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
test('native Platform clarification reauthorizes selected scope and makes no provider, catalog or financial reads',async()=>{
 let auth=0,providers=0,reads=0;
 const session=await createPlatformAssistantSession({},scope,{authorize:async()=>{auth++;return scope},readSalesCatalog:async()=>{reads++;throw Error('no period')},readCash:async()=>{reads++;throw Error('unrelated')}});
 const out=await session.run({question,prompt:'Fixture',requestProvider:async()=>{providers++;throw Error('must not choose today')}});
 assert.equal(auth,2);assert.equal(providers,0);assert.equal(reads,0);assert.deepEqual(out.evidence,[]);assert.deepEqual(out.reads,[]);assert.match(JSON.parse(out.raw.output_text).answer,/Για ποια περίοδο/);
 let checked=0;const revoked=await createPlatformAssistantSession({},scope,{authorize:async()=>++checked===1?scope:{...scope,storeId:'foreign'}});await assert.rejects(revoked.run({question,prompt:'Fixture',requestProvider:async()=>{throw Error('no provider')}}),e=>e.code==='PLATFORM_ASSISTANT_CONTEXT_CHANGED');
});
