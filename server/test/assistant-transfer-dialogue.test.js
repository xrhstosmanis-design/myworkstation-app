import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantEffectiveQuestion} from '../src/services/assistant-conversation-context.js';
import {assistantBusinessDomain} from '../../shared/assistant-business.mjs';
import {businessQuestionPeriod,isBusinessPeriodFollowup} from '../src/services/assistant-business-period.js';
import {directTransferRequest,businessTool} from '../src/services/assistant-business-reports.js';
import {runOwnerAssistant} from '../src/services/owner-sales-tools.js';
import {cashTool} from '../src/services/assistant-cash-tools.js';
import {createOwnerAssistantHandlers} from '../src/services/owner-assistant-handlers.js';
import {createPlatformAssistantSession} from '../src/services/platform-assistant-products.js';

const now=new Date('2026-10-16T09:00:00Z');
const history=(...contents)=>contents.map(content=>({role:'user',content}));
const from='Μεταφορές από τον ιδιοκτήτη στις 11/10/2026';
const to='Και προς τον ιδιοκτήτη;';
const args=(domain,date)=>({domain,from:date,to:date,query:null,status:null});

test('latest short transfer direction survives subsequent date and file follow-ups',()=>{
 const h=history(from,to);
 assert.equal(isBusinessPeriodFollowup('Και στις 12/10/2026;'),true);
 for(const [question,date] of [['Και στις 12/10/2026;','2026-10-12'],['Και χθες;','2026-10-15'],['Σε Excel','2026-10-11']]){
  const effective=assistantEffectiveQuestion(question,h);
  assert.equal(assistantBusinessDomain(effective),'TRANSFERS_TO_OWNER',question);
  assert.deepEqual(businessQuestionPeriod(effective,{now}),{from:date,to:date});
 }
 const back=assistantEffectiveQuestion('Και στις 13/10/2026;',history(from,to,'Και στις 12/10/2026;','Και από τον ιδιοκτήτη;'));
 assert.equal(assistantBusinessDomain(back),'TRANSFERS_FROM_OWNER');
 assert.deepEqual(businessQuestionPeriod(back,{now}),{from:'2026-10-13',to:'2026-10-13'});
 const latest=assistantEffectiveQuestion('και χθες;',history(from,to,'Μεταφορές από τον ιδιοκτήτη στις 14/10/2026'));
 assert.equal(assistantBusinessDomain(latest),'TRANSFERS_FROM_OWNER');
});

test('short direction changes preserve inherited actor filters and topic boundaries',()=>{
 const filtered='Μεταφορές από τον ιδιοκτήτη στις 11/10/2026\nχειριστής: Εικονικός Χειριστής';
 for(const q of ['Και προς τον ιδιοκτήτη;','Και προς τον ιδιοκτήτη στις 12/10/2026;']){
  const effective=assistantEffectiveQuestion(q,history(filtered,'Και χθες;'));
  assert.equal(assistantBusinessDomain(effective),'TRANSFERS_TO_OWNER');
  assert.match(effective,/Εικονικός Χειριστής/);
  assert.equal(directTransferRequest(effective,{now}),null,'actor filter must not disappear');
 }
 const next=assistantEffectiveQuestion('και στις 12/10/2026;',history(filtered,to));
 assert.match(next,/Εικονικός Χειριστής/);assert.equal(directTransferRequest(next,{now}),null);
 for(const h of [[],history('Πωλήσεις νερού στις 11/10/2026'),history(from,'Πληρωμές προμηθευτών στις 11/10/2026')]){
  assert.equal(assistantBusinessDomain(assistantEffectiveQuestion(to,h)),null,'no transfer topic from unrelated question');
 }
 const other=assistantEffectiveQuestion('και στις 12/10/2026;',history(from,to,'Πληρωμές προμηθευτών στις 11/10/2026'));
 assert.equal(assistantBusinessDomain(other),'SUPPLIER_PAYMENTS');
});

test('clear dated from/to questions use the guarded direct dispatcher without model arguments',async()=>{
 for(const [question,domain] of [[from,'TRANSFERS_FROM_OWNER'],['Μεταφορές προς τον ιδιοκτήτη στις 12/10/2026','TRANSFERS_TO_OWNER'],[assistantEffectiveQuestion('Και στις 12/10/2026;',history(from,to)),'TRANSFERS_TO_OWNER']]){
  let read;
  const out=await runOwnerAssistant({question,prompt:question,now,cashTool,tools:[businessTool],requestProvider:()=>assert.fail('clear date/direction does not require model'),readBusiness:async a=>{read=a;return {kind:'business_records',domain:a.domain,from:a.from,to:a.to,result:'no_records',rows:[]}}});
  assert.deepEqual(read,args(domain,question===from?'2026-10-11':'2026-10-12'));
  assert.equal(out.reads.length,1);
 }
});

test('Owner and Platform execute the latest short-direction/date sequence through scoped source guards',async()=>{
 const h=history(from,to),question='Και στις 12/10/2026;',scope={companyId:'fixture-company',storeId:'fixture-store'};
 let reads=0,auth=0,result;
 const authorize=async()=>{auth++;return scope};
 const readBusiness=async(a,s)=>{
  reads++;assert.deepEqual(a,args('TRANSFERS_TO_OWNER','2026-10-12'));assert.deepEqual(s,scope);
  return {...scope,kind:'business_records',domain:a.domain,from:a.from,to:a.to,result:'no_records',rows:[]};
 };
 const requestProvider=()=>assert.fail('explicit transfer dialogue uses its canonical source');
 await createOwnerAssistantHandlers({authorize,readBusiness,requestProvider}).ask({body:{question,history:h}},{json:v=>result=v},e=>{throw e});
 assert.equal(result.readOnly,true);assert.equal(result.evidence[0].domain,'TRANSFERS_TO_OWNER');
 const platform=await createPlatformAssistantSession({},scope,{authorize,readBusiness});
 const out=await platform.run({question:assistantEffectiveQuestion(question,h),prompt:question,requestProvider});
 assert.equal(out.evidence[0].scope,'PLATFORM_SELECTED_STORE');assert.equal(reads,2);assert.ok(auth>=8);
});
