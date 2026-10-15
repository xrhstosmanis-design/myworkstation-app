import test from 'node:test';
import assert from 'node:assert/strict';
import {businessArguments,businessQuestionPeriod,businessQuestionClarification,directTransferRequest,readAssistantBusiness,checkedBusinessAnswer,businessTool} from '../src/services/assistant-business-reports.js';
import {assistantEffectiveQuestion,assistantQuestionRequiresReport} from '../src/services/assistant-conversation-context.js';
import {toolsForAssistantQuestion} from '../src/services/assistant-consumption.js';
import {runOwnerAssistant} from '../src/services/owner-sales-tools.js';
import {cashTool} from '../src/services/assistant-cash-tools.js';
import {createPlatformAssistantSession} from '../src/services/platform-assistant-products.js';
import {createOwnerAssistantHandlers} from '../src/services/owner-assistant-handlers.js';
import {parseAssistantSourceRead} from '../src/services/assistant-source-read.js';
import {assistantReportTables} from '../src/services/assistant-report-table.js';
import {presentAssistantAnswer} from '../../client/src/components/voice/presentAssistantAnswer.js';
const scope={companyId:'co',companyName:'Company',storeId:'store',storeName:'LAB'},now=new Date('2026-10-15T20:00:00Z');
const args={domain:'TRANSFERS_TO_OWNER',from:'2026-10-01',to:'2026-10-15',query:null,status:null};
const row=(extra={})=>({id:'one',companyId:'co',storeId:'store',recordedAt:new Date('2026-10-02T10:00:00Z'),recordType:'TRANSFER_OUT',label:'Ταμείο → Ιδιοκτήτης · παράδοση',amount:'20.10',operatorName:'Χειριστής',reversedAt:null,password:'SECRET',attachmentData:'SECRET',...extra});
const read=(rows=[row()],a=args)=>readAssistantBusiness(a,scope,{db:{$queryRaw:async()=>rows},now});
const response={response:{ok:true},raw:{status:'completed',output_text:JSON.stringify({answer:'BUSINESS_SNAPSHOT wrong cash',highlights:[],limitations:''})}};
test('business filters reject model scope, invalid calendar, mutation and unknown domains',()=>{
 for(const a of [{...args,companyId:'x'},{...args,domain:'DELETE'},{...args,from:null,to:null},{...args,from:'2026-02-30'},{...args,to:'2026-09-01'},{...args,from:'2024-01-01'},{...args,domain:'STAFF'}])assert.equal(businessArguments.safeParse(a).success,false);
 assert.equal(businessArguments.safeParse({...args,domain:'STAFF',from:null,to:null}).success,true);
 assert.equal(parseAssistantSourceRead({name:'business_records',args}).name,'business_records');
});
test('exact screenshot keeps supplied period on owner-transfer clarification and cannot use cash source',()=>{
 const prior='ελενξε ποσες μεταφορες ποσου ειχαμε απο 1/10 εως σημερα';
 const effective=assistantEffectiveQuestion('μεταφορα στον ιδιοκτητη',[{role:'user',content:prior},{role:'assistant',content:'untrusted 999 euros'}]);
 assert.deepEqual(businessQuestionPeriod(effective,{now}),{from:'2026-10-01',to:'2026-10-15'});
 assert.deepEqual(directTransferRequest(effective,{now}),args);assert.equal(assistantQuestionRequiresReport('μεταφορα στον ιδιοκτητη'),true);
 assert.deepEqual(toolsForAssistantQuestion(effective,[cashTool,businessTool]).map(t=>t.name),['business_records']);
 assert.match(businessQuestionClarification('μεταφορές στον ιδιοκτήτη από 31/2 έως σήμερα',{now}).answer,/έγκυρο/);
 assert.equal(directTransferRequest('Μεταφορές στον ιδιοκτήτη από Λεωνίδα 1/10 έως σήμερα',{now}),null);
 const changed=assistantEffectiveQuestion('μεταφορα στον ιδιοκτητη',[{role:'user',content:'πωλήσεις νερού 1/10 έως σήμερα'}]);assert.equal(changed,'μεταφορα στον ιδιοκτητη');
});
test('read is pinned to company/store/Athens range, excludes reversed rows and projects safe fields',async()=>{
 let sql,values;const out=await readAssistantBusiness(args,scope,{now,db:{$queryRaw:async(strings,...v)=>{sql=strings.join('?');values=v;return [row(),row({id:'two',amount:'0.20'})]}}});
 assert.match(sql,/"companyId"=\? AND "storeId"=\?/);assert.match(sql,/"reversedAt" IS NULL/);assert.match(sql,/LIMIT 501/);assert.doesNotMatch(sql,/INSERT|UPDATE|DELETE|SELECT \*/);
 assert.deepEqual(values.slice(0,3),['co','store',['TRANSFER_OUT']]);assert.equal(values[3].toISOString(),'2026-09-30T21:00:00.000Z');assert.equal(values[4].toISOString(),'2026-10-15T21:00:00.000Z');
 assert.equal(out.totals.count,2);assert.equal(out.totals.amount,20.3);assert.equal(out.incompletePeriod,true);assert.doesNotMatch(JSON.stringify(out),/SECRET|password|attachment/);
 assert.equal((await read([row()],{...args,query:'χειριστης'})).rows.length,1);
});
test('reversed/foreign/duplicate/wrong direction/out-of-range source refuses; caps and errors cannot imply zero',async()=>{
 for(const rows of [[row({companyId:'foreign'})],[row({storeId:'foreign'})],[row({recordType:'TRANSFER_AMOUNT'})],[row({reversedAt:now})],[row({recordedAt:new Date('2026-09-30T20:59:59Z')})],[row(),row()]])await assert.rejects(read(rows),e=>e.status===502);
 const cap=await read(Array.from({length:501},(_,i)=>row({id:String(i)})));assert.equal(cap.result,'source_limited');assert.equal(cap.totals,null);assert.equal(cap.rows.length,0);
 await assert.rejects(readAssistantBusiness(args,scope,{db:{$queryRaw:async()=>{throw Error('SECRET')}},now}),e=>e.status===503&&!e.message.includes('SECRET'));
 assert.equal((await read([])).result,'no_records');
});
test('transfer directions remain separate and invoices retain state without fabricated purchase totals',async()=>{
 const transfer=await read([row(),row({id:'in',recordType:'TRANSFER_AMOUNT',amount:100})],{...args,domain:'TRANSFERS'});assert.equal(transfer.totals.amount,null);assert.equal(transfer.totals.groups.length,2);
 const invoice=await read([row({recordType:'INVOICE',status:'DRAFT',amount:200})],{...args,domain:'INVOICES'});assert.equal(invoice.totals.amount,null);assert.equal(invoice.rows[0].status,'DRAFT');
 const bank=await read([row({recordType:'BANK_TRANSFER',status:'PENDING_REVIEW'})],{...args,domain:'BANK_MOVEMENTS'});assert.equal(bank.totals.amount,null);
});
test('all remaining domain SELECTs have bounded owned-store reads with no private personnel fields',async()=>{
 for(const domain of ['SUPPLIER_PAYMENTS','EXPENSES','INVOICES','SUPPLIERS','STAFF','CASH_SHIFTS','POS_EVENTS','BANK_MOVEMENTS']){
  let sql,v;const current=['STAFF','SUPPLIERS'].includes(domain);const out=await readAssistantBusiness({...args,domain,...(current?{from:null,to:null}:{})},scope,{now,db:{$queryRaw:async(strings,...values)=>{sql=strings.join('?');v=values;return []}}});
  assert.match(sql,/LIMIT 501/);assert.ok(v.includes('co')&&v.includes('store'));assert.doesNotMatch(sql,/SELECT \*|pinHash|password|dailyRate|phone|email|attachmentData|beforeJson|details/);assert.equal(out.result,'no_records');
 }
});
test('exact transfer dispatch reads once without asking AI to infer dates/counts; source values drive prose and export',async()=>{
 let calls=0;const question=assistantEffectiveQuestion('μεταφορα στον ιδιοκτητη',[{role:'user',content:'ελενξε ποσες μεταφορες ποσου ειχαμε απο 1/10 εως σημερα'}]);
 const out=await runOwnerAssistant({prompt:'fixture',question,tools:[businessTool],cashTool,now,readBusiness:async a=>{calls++;assert.deepEqual(a,args);return read()},requestProvider:()=>assert.fail('no model call needed for exact recorded count')});
 assert.equal(calls,1);assert.equal(out.reads[0].name,'business_records');const text=presentAssistantAnswer({...response.raw,evidence:out.evidence});assert.match(text.answer,/20,10/);assert.doesNotMatch(text.answer,/BUSINESS_SNAPSHOT|cash_details/);
 const tables=assistantReportTables(out.evidence);assert.equal(tables[0].rows[0][3],20.1);assert.match(tables[0].rows[0][1],/ιδιοκτήτη/);
 const noRead=checkedBusinessAnswer(question,{answer:'no transfers because no snapshot'},[]);assert.match(noRead.answer,/Δεν διαβάστηκε/);
});
test('provider cannot switch requested domain, dates, arbitrary scope or unrelated cash tool',async()=>{
 const question='μεταφορές στον ιδιοκτήτη από Λεωνίδα 1/10 έως σήμερα';
 for(const a of [{...args,domain:'EXPENSES'},{...args,from:'2026-10-15'},{...args,storeId:'foreign'}])await assert.rejects(runOwnerAssistant({prompt:'fixture',question,now,tools:[businessTool],cashTool,readBusiness:()=>assert.fail(),requestProvider:async()=>({response:{ok:true},raw:{output:[{type:'function_call',call_id:'c',name:'business_records',arguments:JSON.stringify(a)}]}})}),e=>e.status===422);
});
test('Platform replay/ask retains selected store and reauthorizes before and after read',async()=>{
 let auth=0,reads=0;const session=await createPlatformAssistantSession({},scope,{authorize:async()=>{auth++;return scope},readBusiness:async(a,s)=>{reads++;assert.deepEqual(s,scope);return read([],a)}});
 const reports=await session.replay([{name:'business_records',args}]);assert.equal(reports[0].scope,'PLATFORM_SELECTED_STORE');assert.equal(reads,1);assert.ok(auth>=4);
 const global=await createPlatformAssistantSession({},null,{authorize:async()=>null,allStores:true});await assert.rejects(global.replay([{name:'business_records',args}]),e=>e.status===403);
 let allow=true;const revoked=await createPlatformAssistantSession({},scope,{authorize:async()=>{if(!allow)throw Object.assign(Error('revoked'),{status:401});return scope},readBusiness:async()=>{allow=false;return read()}});await assert.rejects(revoked.replay([{name:'business_records',args}]),e=>e.status===401);
});
test('Owner business source rechecks domain module and personnel package; denial prevents source read',async()=>{
 let result,reads=0,modules=[];const handlers=createOwnerAssistantHandlers({authorize:async(req,o)=>{modules.push(o.requiredModules);return scope},readBusiness:async()=>{reads++;return read()},requestProvider:()=>assert.fail('direct transfer uses source')});
 await handlers.ask({body:{question:'μεταφορές στον ιδιοκτήτη από 1/10 έως σήμερα'}},{json:v=>result=v},e=>{throw e});assert.equal(reads,1);assert.ok(modules.filter(m=>m.includes('CASH_CONTROL')).length>=4);assert.equal(result.evidence[0].kind,'business_records');
 let error;const limited=createOwnerAssistantHandlers({authorize:async(req,o)=>{if(o.requiredModules.includes('CASH_CONTROL'))throw Object.assign(Error('disabled'),{status:403,code:'MODULE_DISABLED'});return scope},readBusiness:()=>assert.fail(),requestProvider:()=>assert.fail()});await limited.ask({body:{question:'μεταφορές στον ιδιοκτήτη από 1/10 έως σήμερα'}},{},e=>error=e);assert.equal(error.status,403);
 const staff={...args,domain:'STAFF',from:null,to:null};const denied=createOwnerAssistantHandlers({authorize:async()=>scope,authorizePersonnel:async()=>{throw Object.assign(Error('package'),{status:403})},readBusiness:()=>assert.fail(),requestProvider:async()=>({response:{ok:true},raw:{output:[{type:'function_call',call_id:'c',name:'business_records',arguments:JSON.stringify(staff)}]}})});await denied.ask({body:{question:'λίστα προσωπικού'}},{},e=>error=e);assert.equal(error.status,403);
});
