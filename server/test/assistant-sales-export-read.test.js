import test from 'node:test';
import assert from 'node:assert/strict';
import {runOwnerAssistant,ownerSalesTool} from '../src/services/owner-sales-tools.js';
import {cashTool} from '../src/services/assistant-cash-tools.js';
import {assistantEffectiveQuestion} from '../src/services/assistant-conversation-context.js';
import {assistantAnswerFromResponse} from '../src/services/assistant-answer-response.js';
import {salesExportReadPeriod} from '../src/services/assistant-sales-export-read.js';

const now=new Date('2026-10-19T18:00:00Z');
const history=[{role:'user',content:'Πόσα TEST WATER πουλήθηκαν χθες;'},{role:'assistant',content:'TEST WATER (SKU FIX) 18/10/2026'},{role:'user',content:'Και στις 17/10/2026;'},{role:'assistant',content:'TEST WATER 17/10/2026'}];
const args={product:'TEST WATER (SKU FIX)',from:'2026-10-17',to:'2026-10-17'};
const completed=()=>({response:{ok:true},raw:{status:'completed',output_text:JSON.stringify({answer:'fixture',highlights:[],limitations:''})}});
const called=(value=args,name='sales_by_product')=>({response:{ok:true},raw:{status:'completed',output:[{type:'function_call',name,call_id:'fixture-read',arguments:JSON.stringify(value)}]}});
const question=format=>assistantEffectiveQuestion(`Σε ${format}`,history);

test('period resolution accepts only a known sales format continuation and never falls back past invalid latest context',()=>{
 assert.deepEqual(salesExportReadPeriod(question('CSV'),{now}),{from:args.from,to:args.to});
 assert.deepEqual(salesExportReadPeriod('CSV\nΠροηγούμενο θέμα της ίδιας συνομιλίας: Πωλήσεις στις17/10/2026',{now}),{from:args.from,to:args.to});
 const prefix='Η νεότερη περίοδος αυτής της αναζήτησης είναι: ';
 for(const value of [question('JSON'),question('CSV')+'\n'+prefix+'στις18/10/2026',question('CSV').replace('Και στις 17/10/2026;','Και στις 31/02/2026;'),'Σε CSV\nΠροηγούμενο θέμα της ίδιας συνομιλίας: απόθεμα 17/10/2026','Σε CSV με αλλαγή ποσού\nΠωλήσεις στις17/10/2026'])assert.equal(salesExportReadPeriod(value,{now}),null);
});

for(const format of ['CSV','PDF','Excel','XLSX','Word','DOCX'])test(`${format} continuation requires a fresh canonical read at the latest period`,async()=>{
 let provider=0,reads=0;
 const result=await runOwnerAssistant({question:question(format),prompt:'fixture',now,cashTool,tools:[cashTool,ownerSalesTool],requestProvider:async settings=>{
  provider++;if(provider===1)return settings.tool_choice==='required'?called():completed();
  assert.equal(settings.tool_choice,'auto');return completed();
 },readSales:async value=>{reads++;assert.deepEqual(value,args);return {kind:'product_sales',rows:[],source:'fixture'};}});
 assert.equal(reads,1);assert.equal(result.evidence.length,1);assert.deepEqual(result.reads,[{name:'sales_by_product',args}]);assert.equal(provider,2);
});

test('wrong period or wrong domain is rejected before any canonical read',async()=>{
 for(const [value,name] of [[{...args,from:'2026-10-18',to:'2026-10-18'},'sales_by_product'],[{date:'2026-10-17'},'cash_details']]){
  let reads=0;
  await assert.rejects(runOwnerAssistant({question:question('CSV'),prompt:'fixture',now,cashTool,tools:[cashTool,ownerSalesTool],requestProvider:async()=>called(value,name),readSales:async()=>reads++,readCash:async()=>reads++}),e=>e.status===422);
  assert.equal(reads,0);
 }
});

test('a disobedient no-tool provider still yields no evidence and the safe unread-source refusal',async()=>{
 let calls=0;
 const result=await runOwnerAssistant({question:question('CSV'),prompt:'fixture',now,cashTool,tools:[cashTool,ownerSalesTool],requestProvider:async settings=>{calls++;assert.equal(settings.tool_choice,'required');return completed();}});
 assert.equal(calls,1);assert.deepEqual(result.reads,[]);
 assert.equal(assistantAnswerFromResponse(result.raw,result.evidence,{requireEvidence:true,question:question('CSV')}).sourceUnavailable,true);
});

test('ordinary questions, missing/invalid dates, mixed topics and missing permitted sales tool do not force reads',async()=>{
 const cases=[['Πωλήσεις TEST WATER στις 17/10/2026',[cashTool,ownerSalesTool]],['Σε CSV',[cashTool,ownerSalesTool]],['Σε CSV\nΠροηγούμενο θέμα της ίδιας συνομιλίας: Πωλήσεις TEST WATER στις 31/02/2026',[cashTool,ownerSalesTool]],['Σε CSV\nΠροηγούμενο θέμα της ίδιας συνομιλίας: πωλήσεις και ταμείο 17/10/2026',[cashTool,ownerSalesTool]],[question('CSV'),[cashTool]]];
 for(const [value,tools] of cases){let calls=0;const out=await runOwnerAssistant({question:value,prompt:'fixture',now,cashTool,tools,requestProvider:async settings=>{calls++;assert.equal(settings.tool_choice,'auto');return completed();}});assert.deepEqual(out.reads,[]);assert.ok(calls<=1);}
});
