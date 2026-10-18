import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantEffectiveQuestion,assistantQuestionHasPeriod,assistantSalesPeriodClarification} from '../src/services/assistant-conversation-context.js';
import {businessQuestionHasNamedMonth,businessPeriodResolution,businessQuestionPeriod} from '../src/services/assistant-business-period.js';
import {businessTool,businessQuestionClarification} from '../src/services/assistant-business-reports.js';
import {runOwnerAssistant} from '../src/services/owner-sales-tools.js';
import {cashTool} from '../src/services/assistant-cash-tools.js';
const now=new Date('2026-10-18T10:00:00Z'),yesterday={from:'2026-10-17',to:'2026-10-17'};
const names=['Μαρτίνι','Μαρτίνα','Απρίλια','Ιουλία','Νοεμβριανός','Ιανουαρίου2269','SKUΟκτωβρίου'];
const history=(...contents)=>contents.map(content=>({role:'user',content}));
test('conversation month detection agrees with complete Greek calendar words, not name or code prefixes',()=>{
 for(const name of names){
  assert.equal(businessQuestionHasNamedMonth(name),false,name);
  assert.equal(assistantQuestionHasPeriod('Πληρωμές '+name),false,name);
  assert.equal(businessPeriodResolution('Πληρωμές '+name,{now}).mentioned,false,name);
 }
 for(const month of ['Ιανουαρίου','Φεβρουάριο','Μάρτιος','Απριλίου','Μαΐου','Ιούνιο','Ιούλιο','Αύγουστο','Σεπτέμβρη','Οκτώβρη','Νοέμβρη','Δεκέμβρη','Ιανουάρη','Φεβρουάρη','Απρίλη']){
  assert.equal(businessQuestionHasNamedMonth(month),true,month);
  assert.equal(assistantQuestionHasPeriod('Πληρωμές '+month),true,month);
  assert.ok(businessQuestionPeriod('Πληρωμές '+month,{now}),month);
 }
 for(const text of ['χθες','προχθές','σήμερα','από1/10 έως18/10','2026-10-18','την προηγούμενη εβδομάδα','τον προηγούμενο μήνα','τις τελευταίες 7 ημέρες','φέτος','October','yesterday'])assert.equal(assistantQuestionHasPeriod('Πληρωμές '+text),true,text);
 assert.equal(assistantQuestionHasPeriod('πωλήσεις νερού ΑΥΡΑ 1.5 λίτρου'),false);
});
test('named questions inherit only the latest compatible period and retain their literal new name',()=>{
 for(const name of names){
  for(const label of ['Πληρωμές','Πωλήσεις']){
   const question=label+' '+name;
   const effective=assistantEffectiveQuestion(question,history(label+' στις 10/10/2026','και χθες;'));
   assert.ok(effective.startsWith(question+'\n'),name);
   assert.match(effective,/Περίοδος της ίδιας αναζήτησης/);
   assert.deepEqual(businessQuestionPeriod(effective,{now}),yesterday,name);
   if(label==='Πωλήσεις')assert.equal(assistantSalesPeriodClarification(effective),null);
   assert.equal(assistantEffectiveQuestion(question,history(label+' χθες','μεταφορές σήμερα')),question);
   assert.equal(assistantEffectiveQuestion(question,[{role:'assistant',content:label+' χθες'}]),question);
  }
 }
 for(const label of ['Πληρωμές','Πωλήσεις']){
  const question=label+' Ιουλία σήμερα';assert.equal(assistantEffectiveQuestion(question,history(label+' χθες')),question);
  assert.deepEqual(businessQuestionPeriod(question,{now}),{from:'2026-10-18',to:'2026-10-18'});
 }
 assert.deepEqual(businessQuestionPeriod(assistantEffectiveQuestion('Πληρωμές Οκτωβρίου',history('Πληρωμές χθες')),{now}),{from:'2026-10-01',to:'2026-10-31'});
});
test('invalid newly supplied dates still refuse fallback and missing named sales ask for a period',async()=>{
 const noRead=()=>assert.fail('invalid/missing period cannot call provider or source');
 for(const date of ['123 Οκτωβρίου 2026','Οκτωβρίου 26','Οκτωβρίου 20261','31/02/2026']){
  const effective=assistantEffectiveQuestion('Πληρωμές Ιουλία '+date,history('Πληρωμές χθες'));
  assert.equal(businessPeriodResolution(effective,{now}).mentioned,true,date);
  assert.equal(businessQuestionPeriod(effective,{now}),null,date);
  const out=await runOwnerAssistant({question:effective,now,tools:[businessTool],requestProvider:noRead,readBusiness:noRead});
  assert.deepEqual(JSON.parse(out.raw.output_text),businessQuestionClarification(effective,{now}));
  assert.deepEqual(out.reads,[]);
 }
 for(const name of names)assert.equal(assistantSalesPeriodClarification('Πωλήσεις '+name)?.clarification,'period',name);
});
test('real dispatcher binds the inherited day and new name, rejecting a model-substituted month before source read',async()=>{
 const question=assistantEffectiveQuestion('Πληρωμές Ιουλία',history('Πληρωμές χθες'));
 const args={domain:'PAYMENTS',...yesterday,query:'Ιουλία',status:null};let providers=0,reads=0;
 const out=await runOwnerAssistant({question,now,tools:[businessTool],cashTool,requestProvider:async()=>++providers===1?{response:{ok:true},raw:{output:[{type:'function_call',name:'business_records',call_id:'context',arguments:JSON.stringify(args)}]}}:{response:{ok:true},raw:{status:'completed',output_text:JSON.stringify({answer:'fixture',highlights:[],limitations:''})}},readBusiness:async actual=>{reads++;assert.deepEqual(actual,args);return {kind:'business_records',domain:'PAYMENTS',source:'isolated fixture',rows:[],result:'no_records'}}});
 assert.equal(providers,2);assert.equal(reads,1);assert.deepEqual(out.reads,[{name:'business_records',args}]);
 await assert.rejects(runOwnerAssistant({question,now,tools:[businessTool],cashTool,requestProvider:async()=>({response:{ok:true},raw:{output:[{type:'function_call',name:'business_records',call_id:'wrong',arguments:JSON.stringify({...args,from:'2026-07-01',to:'2026-07-31'})}]}}),readBusiness:()=>assert.fail('wrong month must not read')}),e=>e.status===422);
});
