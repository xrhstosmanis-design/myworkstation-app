import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import JSZip from 'jszip';
import {assistantBusinessDomain,businessQuestionParts} from '../../shared/assistant-business.mjs';
import {assistantEffectiveQuestion} from '../src/services/assistant-conversation-context.js';
import {businessQuestionPeriod,directTransferRequest,businessTool,readAssistantBusiness} from '../src/services/assistant-business-reports.js';
import {runOwnerAssistant} from '../src/services/owner-sales-tools.js';
import {cashTool} from '../src/services/assistant-cash-tools.js';
import {createOwnerAssistantHandlers} from '../src/services/owner-assistant-handlers.js';
import {createPlatformAssistantSession} from '../src/services/platform-assistant-products.js';
import {createAssistantExportHandler} from '../src/services/assistant-export-handler.js';
import {issueAssistantExportTicket} from '../src/services/assistant-export-ticket.js';
const now=new Date('2026-10-16T00:00:00Z'),scope={companyId:'fixture-company',storeId:'fixture-store',companyName:'Εικονική εταιρεία',storeName:'Εικονικό κατάστημα'};
const args={domain:'TRANSFERS_TO_OWNER',from:'2026-10-01',to:'2026-10-16',query:null,status:null};
const question='μεταφορές στον ιδιοκτήτη\nαπό 1/10 έως 16/10/2026';
const report=()=>({...scope,kind:'business_records',domain:'TRANSFERS_TO_OWNER',source:'Μετρητά προς ιδιοκτήτη',title:'Μετρητά προς ιδιοκτήτη',from:args.from,to:args.to,result:'matched',rows:[],totals:{count:0,amount:0}});
test('current multiline text supplies domain, period and direction without reading old generated context as current',()=>{
 for(const q of [question,question.replace('\n','\r\n'),'πόσες κινήσεις είχαμε\n'+question]){
  assert.equal(assistantBusinessDomain(q),'TRANSFERS_TO_OWNER');assert.deepEqual(businessQuestionPeriod(q,{now}),{from:args.from,to:args.to});
 }
 assert.deepEqual(directTransferRequest(question,{now}),args);
 const changed=assistantEffectiveQuestion('μεταφορές\nαπό τον ιδιοκτήτη',[{role:'user',content:question}]);
 assert.equal(assistantBusinessDomain(changed),'TRANSFERS_FROM_OWNER');assert.deepEqual(businessQuestionPeriod(changed,{now}),{from:args.from,to:args.to});
 assert.match(businessQuestionParts(changed).current,/από τον ιδιοκτήτη/);
 const ambiguous=question+'\nκαι χθες';assert.equal(businessQuestionPeriod(ambiguous,{now}),null);
});
test('a later-line filter never becomes an unfiltered deterministic request, including inherited topic/period',()=>{
 for(const extra of ['από τον χειριστή Λεωνίδα','χειριστής: Δοκιμή','μόνο με κάρτα','μόνο ακυρωμένες'])assert.equal(directTransferRequest(question+'\n'+extra,{now}),null,extra);
 const filtered=question+'\nαπό τον χειριστή Λεωνίδα';
 const follow=assistantEffectiveQuestion('και\nχθες;',[{role:'user',content:filtered}]);
 assert.equal(directTransferRequest(follow,{now}),null);assert.match(businessQuestionParts(follow).topic,/Λεωνίδα/);assert.deepEqual(businessQuestionPeriod(follow,{now}),{from:'2026-10-15',to:'2026-10-15'});
 const clarify=assistantEffectiveQuestion('μεταφορές\nστον ιδιοκτήτη',[{role:'user',content:filtered}]);assert.equal(directTransferRequest(clarify,{now}),null);
 const named=assistantEffectiveQuestion('μεταφορές στον ιδιοκτήτη\nαπό Χρόνη',[{role:'user',content:question}]);
 assert.deepEqual(businessQuestionPeriod(named,{now}),{from:args.from,to:args.to},'operator name is not a calendar year');
 assert.equal(directTransferRequest(named,{now}),null);
 const marked=question+'\nΠερίοδος της ίδιας αναζήτησης: χθες\nΧρησιμοποίησε μόνο την προηγούμενη περίοδο και το είδος της νέας ερώτησης στο ήδη επιλεγμένο κατάστημα.\nαπό τον χειριστή Λεωνίδα';
 assert.equal(directTransferRequest(marked,{now}),null,'context-looking text never discards later filters');
});
test('multiline period-only changes and file requests use latest period, not old dates or assistant output',()=>{
 const history=[{role:'user',content:question},{role:'user',content:'για\nχθες;'},{role:'assistant',content:'2024-01-01 έως 2024-12-31'},{role:'user',content:'μεταφορές\nαπό τον ιδιοκτήτη'}];
 const file=assistantEffectiveQuestion('σε\nExcel',history);assert.equal(assistantBusinessDomain(file),'TRANSFERS_FROM_OWNER');assert.deepEqual(businessQuestionPeriod(file,{now}),{from:'2026-10-15',to:'2026-10-15'});
 const own=assistantEffectiveQuestion('μεταφορές στον ιδιοκτήτη\nτον προηγούμενο μήνα',history);assert.deepEqual(businessQuestionPeriod(own,{now}),{from:'2026-09-01',to:'2026-09-30'});
});
test('actual dispatcher preserves multiline actor extraction and refuses provider date/scope replacement',async()=>{
 let reads=0,providers=0;const filtered=question+'\nαπό τον χειριστή Λεωνίδα';
 const run=async value=>runOwnerAssistant({prompt:filtered,question:filtered,cashTool,tools:[businessTool],now,readBusiness:async a=>{reads++;assert.equal(a.query,'Λεωνίδα');return report()},requestProvider:async()=>{providers++;return providers%2?{response:{ok:true},raw:{output:[{type:'function_call',name:'business_records',call_id:'read',arguments:JSON.stringify(value)}]}}:{response:{ok:true},raw:{output_text:'ok'}}}});
 const out=await run({...args,query:'Λεωνίδα'});assert.equal(reads,1);assert.equal(providers,2);assert.equal(out.reads[0].args.query,'Λεωνίδα');
 for(const override of [{from:'2026-10-02'},{domain:'TRANSFERS_FROM_OWNER'},{storeId:'foreign'}]){providers=0;await assert.rejects(run({...args,query:'Λεωνίδα',...override}),e=>e.status===422);assert.equal(reads,1);}
});
test('actual Owner handler and Platform session use fresh authorized selected-store reads for multiline request',async()=>{
 let auth=0,reads=0;const authorize=async()=>{auth++;return scope};
 const readBusiness=async(a,s)=>{reads++;assert.deepEqual(a,args);assert.equal(s.storeId,scope.storeId);return report()};
 let result;const owner=createOwnerAssistantHandlers({authorize,readBusiness,requestProvider:()=>assert.fail('unfiltered request uses direct source')});
 await owner.ask({body:{question}},{json:v=>result=v},e=>{throw e});assert.equal(result.evidence[0].storeId,scope.storeId);
 const platform=await createPlatformAssistantSession({},scope,{authorize,readBusiness});const out=await platform.run({prompt:question,question,requestProvider:()=>assert.fail('direct')});
 assert.equal(out.evidence[0].scope,'PLATFORM_SELECTED_STORE');assert.equal(reads,2);assert.ok(auth>=8);
});
test('signed business export replays the exact filtered read for all four real formats, not cached question amounts',async()=>{
 const filteredArgs={...args,query:'Εικονικός χειριστής'},read={name:'business_records',args:filteredArgs};
 const req={user:{id:'fixture-admin',sessionId:'fixture-session',sessionVersion:1}},secret='fixture-only-export-secret';
 let amount='10.10',sourceReads=0,auth=0;
 const readBusiness=async(a,s)=>{assert.deepEqual(a,filteredArgs);assert.equal(s.storeId,scope.storeId);sourceReads++;return readAssistantBusiness(a,s,{now,db:{$queryRaw:async()=>[{id:'fixture-row',...scope,recordedAt:new Date('2026-10-02T10:00:00Z'),recordType:'TRANSFER_OUT',label:'Εικονική κίνηση',operatorName:'Εικονικός χειριστής',amount,reversedAt:null,password:'PRIVATE'}]}})};
 const cached=await readBusiness(filteredArgs,scope),ticket=issueAssistantExportTicket(req,[read],[cached],{selection:{companyId:scope.companyId,storeId:scope.storeId},secret});amount='20.20';
 const handler=createAssistantExportHandler({secret:()=>secret,authorize:async()=>{auth++;return scope},createSession:async()=>createPlatformAssistantSession(req,scope,{authorize:async()=>{auth++;return scope},readBusiness})});
 for(const format of ['xlsx','csv','pdf','docx']){
  let artifact;await handler({...req,body:{ticket,format}},{json:v=>artifact=v},e=>{throw e});const bytes=Buffer.from(artifact.base64,'base64');assert.equal(bytes.length,artifact.size);
  if(format==='xlsx'){const wb=XLSX.read(bytes,{type:'buffer'}),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});assert.ok(rows.some(r=>r.includes(20.2)));assert.ok(!rows.some(r=>r.includes(10.1)));}
  if(format==='csv'){const text=bytes.toString('utf8');assert.match(text,/20,20/);assert.doesNotMatch(text,/10,10|PRIVATE/);}
  if(format==='docx'){const zip=await JSZip.loadAsync(bytes),xml=await zip.file('word/document.xml').async('string');assert.match(xml,/20,20/);assert.match(xml,/Εικονική κίνηση/);assert.doesNotMatch(xml,/10,10|PRIVATE/);}
  if(format==='pdf'){const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const pdf=await getDocument({data:new Uint8Array(bytes),disableFontFace:true}).promise;try{const text=(await (await pdf.getPage(1)).getTextContent()).items.map(x=>x.str).join(' ');assert.match(text,/20,20/);assert.match(text,/Εικονική κίνηση/);assert.doesNotMatch(text,/10,10|PRIVATE/);}finally{await pdf.destroy()}}
 }
 assert.equal(sourceReads,5);assert.ok(auth>=24);
});
