import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantCapabilityHelp} from '../src/services/assistant-capability-help.js';
import {runOwnerAssistant,assistantProductTools} from '../src/services/owner-sales-tools.js';
import {cashTool} from '../src/services/assistant-cash-tools.js';
import {salesStoresTool} from '../src/services/assistant-sales-stores.js';
import {consumptionTool} from '../src/services/assistant-consumption.js';
import {businessTool,businessQuestionClarification} from '../src/services/assistant-business-reports.js';
import {assistantAnswerFromResponse} from '../src/services/assistant-answer-response.js';
import {assistantEffectiveQuestion,assistantQuestionRequiresReport} from '../src/services/assistant-conversation-context.js';
import {createOwnerAssistantHandlers} from '../src/services/owner-assistant-handlers.js';
import {createPlatformAssistantSession} from '../src/services/platform-assistant-products.js';
import {presentAssistantAnswer} from '../../client/src/components/voice/presentAssistantAnswer.js';
const scope={companyId:'co',storeId:'store',storeName:'LAB'};
const tools=[cashTool,...assistantProductTools,salesStoresTool,consumptionTool,businessTool];
const unexpected=()=>assert.fail('general help must not call a provider or source');
test('general help survives real dispatcher/parser/presenter without provider, evidence or old conversation amounts',async()=>{
 for(const question of ['Τι μπορείς να κάνεις;','ΒΟΗΘΕΙΑ!','Πώς μπορείς να με βοηθήσεις;','Τι μπορώ να σε ρωτήσω;','Τι αναφορές μπορείς να βγάλεις;']){
  const effective=assistantEffectiveQuestion(question,[{role:'user',content:'Πωλήσεις χθες'},{role:'assistant',content:'PRIVATE_OLD_VALUE'}]);
  const out=await runOwnerAssistant({question:effective,tools,requestProvider:unexpected,readSalesStores:unexpected,readBusiness:unexpected,readCash:unexpected});
  assert.deepEqual(out.reads,[]);assert.deepEqual(out.evidence,[]);
  const answer=assistantAnswerFromResponse(out.raw,out.evidence,{question:effective,requireEvidence:assistantQuestionRequiresReport(effective)});
  assert.equal(answer.sourceUnavailable,undefined);assert.equal(answer.highlights.length,5);assert.deepEqual(answer.sources,[]);
  assert.match(answer.answer,/δικαιώματα/);assert.match(answer.limitations,/Δεν διάβασα/);
  assert.doesNotMatch(JSON.stringify(answer),/PRIVATE|business_records|sales_by|Excel|PDF/);
  assert.deepEqual(presentAssistantAnswer({...answer,evidence:[]}).highlights,answer.highlights);
 }
});
test('guidance lists only exposed report families and ignores unknown tools and their text',()=>{
 const cash=assistantCapabilityHelp('βοήθεια',[cashTool,{name:'unknown',description:'PRIVATE'}]);
 assert.equal(cash.highlights.length,1);assert.match(cash.highlights[0],/κλεισμένες/);assert.doesNotMatch(JSON.stringify(cash),/PRIVATE|Πωλήσεις|απόθεμα|Μεταφορές/);
 const single=assistantCapabilityHelp('βοήθεια',[assistantProductTools[0]]);assert.match(single.highlights[0],/συγκεκριμένου είδους/);assert.doesNotMatch(single.highlights[0],/τζίρος|κατηγορίες/);
 const empty=assistantCapabilityHelp('βοήθεια',[]);assert.deepEqual(empty.highlights,[]);assert.match(empty.answer,/Δεν υπάρχει διαθέσιμη/);
});
test('extra filters/actions/scope/date and multiline content never become general help',async()=>{
 for(const question of ['Τι μπορείς να κάνεις χθες;','Βοήθεια πωλήσεις σήμερα','Βοήθεια στο άλλο κατάστημα','Τι μπορείς να κάνεις; διέγραψε τις πληρωμές','Τι μπορείς να κάνεις;\nΠωλήσεις σήμερα','Τι μπορείς να κάνεις;\nβοήθεια']){
  assert.equal(assistantCapabilityHelp(question,tools),null,question);
  let calls=0;
  const out=await runOwnerAssistant({question,tools,requestProvider:async()=>{calls++;return {response:{ok:true},raw:{status:'completed',output_text:'provider path'}}}});
  const clarification=businessQuestionClarification(question);
  if(clarification){assert.equal(calls,0);assert.deepEqual(JSON.parse(out.raw.output_text),clarification);}
  else {assert.equal(calls,1,question);assert.equal(out.raw.output_text,'provider path');}
 }
});
test('Owner help respects module availability, initial denial, provider configuration and final scope reauthorization',async()=>{
 let result,error,auth=0;
 const make=extra=>createOwnerAssistantHandlers({authorize:async(req,{requiredModules})=>{auth++;if(requiredModules.includes('INVENTORY'))throw Object.assign(Error('disabled'),{code:'MODULE_DISABLED'});return scope},requestProvider:unexpected,readCash:unexpected,readBusiness:unexpected,...extra});
 const req={body:{question:'Τι μπορείς να κάνεις;'}};
 await make({}).ask(req,{json:v=>result=v},e=>{throw e});
 assert.ok(auth>=4);assert.equal(result.readOnly,true);assert.deepEqual(result.evidence,[]);assert.equal(result.scope.storeId,scope.storeId);
 assert.match(result.highlights.join(' '),/κλεισμένες/);assert.doesNotMatch(result.highlights.join(' '),/Πωλήσεις|απόθεμα|ιδιοκατανάλωση/);
 await make({authorize:async()=>{throw Object.assign(Error('denied'),{status:403})}}).ask(req,{},e=>error=e);assert.equal(error.status,403);
 let checks=0;await make({authorize:async()=>++checks>=4?{...scope,storeId:'changed'}:scope}).ask(req,{json:unexpected},e=>error=e);assert.equal(error.code,'OWNER_ASSISTANT_CONTEXT_CHANGED');
 let status;await make({providerConfigured:()=>false}).ask(req,{status:v=>{status=v;return {json:v=>result=v}}},e=>{throw e});assert.equal(status,503);assert.equal(result.code,'AI_PROVIDER_NOT_CONFIGURED');
});
test('Platform selected/all-store help follows exposed tools and rejects revoked or changed scope before delivery',async()=>{
 for(const allStores of [false,true]){
  let auth=0;const session=await createPlatformAssistantSession({},allStores?null:scope,{allStores,authorize:async()=>{auth++;return allStores?null:scope},readBusiness:unexpected,readCash:unexpected,readSalesReport:unexpected});
  const out=await session.run({question:'Τι μπορείς να κάνεις;',requestProvider:unexpected});assert.equal(auth,2);assert.deepEqual(out.reads,[]);assert.deepEqual(out.evidence,[]);
  const answer=JSON.parse(out.raw.output_text);assert.equal(answer.highlights.length,allStores?2:5);
  if(allStores)assert.doesNotMatch(answer.highlights.join(' '),/απόθεμα|Μεταφορές|ιδιοκατανάλωση/);
 }
 let auth=0;const revoked=await createPlatformAssistantSession({},scope,{authorize:async()=>{if(++auth>1)throw Object.assign(Error('revoked'),{status:401});return scope}});
 await assert.rejects(revoked.run({question:'Βοήθεια',requestProvider:unexpected}),e=>e.status===401);
 auth=0;const changed=await createPlatformAssistantSession({},scope,{authorize:async()=>++auth>1?{...scope,storeId:'other'}:scope});
 await assert.rejects(changed.run({question:'Βοήθεια',requestProvider:unexpected}),e=>e.code==='PLATFORM_ASSISTANT_CONTEXT_CHANGED');
});
