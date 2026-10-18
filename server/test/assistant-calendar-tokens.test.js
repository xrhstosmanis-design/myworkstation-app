import test from 'node:test';
import assert from 'node:assert/strict';
import {businessQuestionPeriod,businessPeriodResolution,isBusinessPeriodFollowup} from '../src/services/assistant-business-period.js';
import {businessTool,businessQuestionClarification} from '../src/services/assistant-business-reports.js';
import {assistantEffectiveQuestion} from '../src/services/assistant-conversation-context.js';
import {runOwnerAssistant} from '../src/services/owner-sales-tools.js';
import {cashTool} from '../src/services/assistant-cash-tools.js';
const now=new Date('2026-10-18T10:00:00Z');
const period=q=>businessQuestionPeriod(q,{now});
const noRead=()=>assert.fail('no provider or report read for an invalid/missing period');
test('complete month words retain real Greek dates and no-space connectors, never name prefixes',()=>{
 for(const [text,from,to] of [
  ['1 Ιανουαρίου 2026','2026-01-01','2026-01-01'],['Φεβρουάριο 2024','2024-02-01','2024-02-29'],
  ['Μάρτιο 2026','2026-03-01','2026-03-31'],['Απριλίου 2026','2026-04-01','2026-04-30'],
  ['Μαΐου 2026','2026-05-01','2026-05-31'],['Ιουνίου 2026','2026-06-01','2026-06-30'],
  ['Ιούλιο 2026','2026-07-01','2026-07-31'],['Αύγουστο 2026','2026-08-01','2026-08-31'],
  ['Σεπτέμβρη 2026','2026-09-01','2026-09-30'],['Οκτωβρίου 2026','2026-10-01','2026-10-31'],
  ['Νοέμβρη 2026','2026-11-01','2026-11-30'],['Δεκέμβρη 2026','2026-12-01','2026-12-31'],
  ['από1/10 έως18/10/2026','2026-10-01','2026-10-18'],['από15 Οκτωβρίου έως σήμερα','2026-10-15','2026-10-18'],
  ['στις18/10/2026.','2026-10-18','2026-10-18'],
  ['Ιανουάρη 2026','2026-01-01','2026-01-31'],['Φεβρουάρη 2026','2026-02-01','2026-02-28'],['Απρίλη 2026','2026-04-01','2026-04-30']
 ])assert.deepEqual(period('μεταφορές στον ιδιοκτήτη '+text),{from,to},text);
 for(const name of ['Μαίρη','Μαρτίνι','Μαρτίνα','Απρίλια','Ιουλία','Νοεμβριανός']){
  assert.equal(period('Πληρωμές '+name),null,name);assert.equal(isBusinessPeriodFollowup(name),false,name);
  assert.deepEqual(period('Πληρωμές '+name+' χθες'),{from:'2026-10-17',to:'2026-10-17'},name);
 }
});
test('malformed complete numeric/named dates never become valid suffix dates or fall back to old history',async()=>{
 const history=[{role:'user',content:'μεταφορές στον ιδιοκτήτη από 1/10 έως 10/10/2026'}];
 for(const date of ['123/10/11','123/10/2026','1/123/2026','18/10/20261','12026-10-18','2026-10-181','1/10/2026/5','18/10/2','18/10/222','123 Οκτωβρίου 2026','Οκτωβρίου 20261']){
  const q=assistantEffectiveQuestion('και στις '+date+';',history);
  assert.equal(businessPeriodResolution(q,{now}).mentioned,true,date);assert.equal(period(q),null,date);
  const out=await runOwnerAssistant({question:q,now,tools:[businessTool],requestProvider:noRead,readBusiness:noRead});
  assert.deepEqual(out.reads,[]);assert.deepEqual(out.evidence,[]);assert.deepEqual(JSON.parse(out.raw.output_text),businessQuestionClarification(q,{now}));
 }
});
test('period-only continuation consumes date and rolling-day digits but preserves extra references',()=>{
 for(const q of ['και χθες;','στις 18/10/2026','τον Οκτώβριο 2026','από 1/10 έως 18/10/2026','τις τελευταίες 7 ημέρες'])assert.equal(isBusinessPeriodFollowup(q),true,q);
 for(const q of ['χθες 2269','χθες 5200000000000','Οκτωβρίου 2026 2269','τελευταίες 7 ημέρες 2269','123/10/11','abc18/10/2026','Μαρτίνι'])assert.equal(isBusinessPeriodFollowup(q),false,q);
});
test('actual dispatcher asks for missing dates for month-like names, then preserves literal name and recognized day',async()=>{
 for(const name of ['Μαίρη','Μαρτίνι']){
  const missing=await runOwnerAssistant({question:'Πληρωμές '+name,now,tools:[businessTool],requestProvider:noRead,readBusiness:noRead});
  assert.deepEqual(missing.evidence,[]);assert.match(JSON.parse(missing.raw.output_text).answer,/έγκυρο διάστημα/);
  const args={domain:'PAYMENTS',from:'2026-10-17',to:'2026-10-17',query:name,status:null};let calls=0,reads=0;
  const requestProvider=async()=>++calls===1?{response:{ok:true},raw:{status:'completed',output:[{type:'function_call',name:'business_records',call_id:'period',arguments:JSON.stringify(args)}]}}:{response:{ok:true},raw:{status:'completed',output_text:JSON.stringify({answer:'fixture',highlights:[],limitations:''})}};
  const out=await runOwnerAssistant({question:'Πληρωμές '+name+' χθες',now,tools:[businessTool],cashTool,requestProvider,readBusiness:async a=>{reads++;assert.deepEqual(a,args);return {kind:'business_records',domain:'PAYMENTS',source:'isolated fixture',rows:[],result:'no_records'}}});
  assert.equal(reads,1);assert.equal(calls,2);assert.deepEqual(out.reads,[{name:'business_records',args}]);
  await assert.rejects(runOwnerAssistant({question:'Πληρωμές '+name+' χθες',now,tools:[businessTool],cashTool,readBusiness:noRead,requestProvider:async()=>({response:{ok:true},raw:{output:[{type:'function_call',name:'business_records',call_id:'wrong',arguments:JSON.stringify({...args,from:'2026-03-01',to:'2026-03-31'})}]}})}),e=>e.status===422);
 }
});
