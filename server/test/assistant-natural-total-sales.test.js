import test from 'node:test';
import assert from 'node:assert/strict';
import {plainTotalSalesRequest,runProductAssistant} from '../src/services/owner-sales-tools.js';
import {assistantEffectiveQuestion} from '../src/services/assistant-conversation-context.js';
import {salesStoresTool,readAssistantSalesStores} from '../src/services/assistant-sales-stores.js';
import {createOwnerAssistantHandlers} from '../src/services/owner-assistant-handlers.js';
import {createPlatformAssistantSession} from '../src/services/platform-assistant-products.js';
import {salesReportCalendar} from '../src/services/sales-report-calendar.js';
const now=new Date('2026-10-17T21:30:00Z'); // Sunday18October in Athens
const expected=(from,to=from)=>({mode:'all',names:[],from,to});
const parse=q=>plainTotalSalesRequest(q,{now});
const users=contents=>contents.map(content=>({role:'user',content}));

test('natural total-sales language consumes all wording and uses existing Athens calendar for full periods',()=>{
 for(const q of ['Τι τζίρο κάναμε σήμερα;','Πόσο πουλήσαμε σήμερα;','Δείξε μου τις πωλήσεις σήμερα','Θέλω να δω τον τζίρο σήμερα','Μπορείς να μου δείξεις τις συνολικές πωλήσεις σήμερα;','Βγάλε μου το σύνολο των πωλήσεων σήμερα']){
  assert.deepEqual(parse(q),expected('2026-10-18'),q);
 }
 for(const [period,from,to] of [
  ['αυτή την εβδομάδα','2026-10-12','2026-10-18'],['την προηγούμενη εβδομάδα','2026-10-05','2026-10-11'],
  ['αυτόν τον μήνα','2026-10-01','2026-10-18'],['τον προηγούμενο μήνα','2026-09-01','2026-09-30'],
  ['του προηγούμενου μήνα','2026-09-01','2026-09-30'],['τις τελευταίες 7 ημέρες','2026-10-12','2026-10-18'],
  ['από 1/10/2026 έως 17/10/2026','2026-10-01','2026-10-17'],['στις 10 Οκτωβρίου 2026','2026-10-10','2026-10-10'],
  ['Σεπτέμβριο 2026','2026-09-01','2026-09-30'],['προχθές','2026-10-16','2026-10-16']
 ])assert.deepEqual(parse(`Δείξε μου τις συνολικές πωλήσεις ${period}`),expected(from,to),period);
 assert.deepEqual(parse('Τζίρος σήμερα σε CSV'),expected('2026-10-18'));
 assert.deepEqual(plainTotalSalesRequest('Πωλήσεις σήμερα',{now:new Date('2026-10-25T22:30:00Z')}),expected('2026-10-26'),'Athens after DST change');
});

test('actual effective questions keep the latest natural sales period through dates and exports; assistant text is not context',()=>{
 const history=users(['Τι τζίρο κάναμε σήμερα;','Και την προηγούμενη εβδομάδα;','Και τον προηγούμενο μήνα;']);
 assert.deepEqual(parse(assistantEffectiveQuestion('Και χθες;',history)),expected('2026-10-17'));
 for(const format of ['CSV','Excel','XLSX','PDF','Word','DOCX'])assert.deepEqual(parse(assistantEffectiveQuestion(`Σε ${format}`,history)),expected('2026-09-01','2026-09-30'),format);
 assert.deepEqual(parse(assistantEffectiveQuestion('Πωλήσεις',history)),expected('2026-09-01','2026-09-30'));
 assert.deepEqual(parse(assistantEffectiveQuestion('Και αυτή την εβδομάδα;',users(['Πωλήσεις σήμερα']))),expected('2026-10-12','2026-10-18'));
 assert.equal(parse(assistantEffectiveQuestion('Και χθες;',[{role:'assistant',content:'Πωλήσεις σήμερα'}])),null);
 for(const other of ['Πληρωμές 10/10/2026','Απόθεμα νερού σήμερα','Μεταφορές στον ιδιοκτήτη σήμερα'])assert.equal(parse(assistantEffectiveQuestion('Σε CSV',[...history,...users([other])])),null,other);
});

test('product, payment, actor, store, comparisons and invalid dates never become unfiltered total-sales reads',()=>{
 const filtered=['Πωλήσεις νερού σήμερα','Πωλήσεις σήμερα μετρητά','Τζίρος σήμερα του χειριστή Δοκιμή','Πωλήσεις σήμερα στο άλλο κατάστημα','Πωλήσεις σήμερα\nχειριστής: Δοκιμή','Πωλήσεις σήμερα\nΠροηγούμενο θέμα της ίδιας συνομιλίας: Πωλήσεις μπύρας σήμερα','Πωλήσεις σήμερα\nΠερίοδος της ίδιας αναζήτησης πωλήσεων: Πωλήσεις μπύρας χθες'];
 for(const q of [...filtered,'Πωλήσεις σήμερα ή χθες','Σύγκρινε πωλήσεις σήμερα με χθες','Πωλήσεις αυτή και την προηγούμενη εβδομάδα','Πωλήσεις στις 31/02/2026','Πωλήσεις από 1/10/2026','Πωλήσεις τις τελευταίες 367 ημέρες','Πωλήσεις σήμερα\nΠροηγούμενο θέμα: νερό','Και χθες;','Σε CSV','Πωλήσεις'])assert.equal(parse(q),null,q);
 for(const topic of filtered.slice(0,5))for(const follow of ['Και χθες;','Και τον προηγούμενο μήνα;','Σε CSV'])assert.equal(parse(assistantEffectiveQuestion(follow,users([topic]))),null,`${topic} -> ${follow}`);
 const badDate=assistantEffectiveQuestion('στις 31/02/2026',users(['Πωλήσεις σήμερα']));assert.equal(parse(badDate),null,'invalid new date must not fall back to old valid date');
});

test('numeric product codes, malformed dates and month-like product/person names cannot be discarded as period text',async()=>{
 const qualifiers=['σήμερα 2269','χθες 999','Μαίρη','Μαρτίνι','Ιουλία','Οκτωβριανό','στις 123/10/2026','στις 2026-10-123','στις 10/10/2026/2269','Σεπτέμβριο 2026 2269'];
 for(const text of qualifiers){
  const question=`Πωλήσεις ${text}`;assert.equal(parse(question),null,question);
  for(const follow of ['Και χθες;','Σε CSV'])assert.equal(parse(assistantEffectiveQuestion(follow,users([question]))),null,`${question} -> ${follow}`);
  const out=await runProductAssistant({question,prompt:'fixture',now,cashTool:{name:'cash'},tools:[salesStoresTool],readSalesStores:()=>assert.fail('must not read an unfiltered total'),requestProvider:async()=>({response:{ok:true},raw:{output:[{type:'function_call',name:'sales_by_store',call_id:'bad',arguments:JSON.stringify(expected('2026-10-17'))}]}})}).catch(e=>{assert.equal(e.status,422);return null;});
  // Undated unknown names may ask for a period before any provider call;
  // dated filtered requests must reject the injected all-mode call instead.
  if(out){assert.deepEqual(out.evidence,[]);assert.deepEqual(out.reads,[]);assert.match(JSON.parse(out.raw.output_text).answer,/Για ποια περίοδο/);}
 }
 for(const month of ['Μάρτιο','Μαρτίου','Ιούλιο','Ιουλίου','Μάιο','Μαΐου','Σεπτέμβριο','Σεπτεμβρίου','Οκτώβρη'])assert.ok(parse(`Πωλήσεις ${month} 2026`),month);
});

test('natural total dispatch reads a fresh canonical source each time without model extraction',async()=>{
 let reads=0;const scope={companyId:'c',storeId:'s'},access={scope:'PLATFORM_SELECTED_STORE',stores:[scope],excluded:[],truncated:false};
 const question=assistantEffectiveQuestion('Και τον προηγούμενο μήνα;',users(['Πωλήσεις σήμερα']));
 const settings={question,prompt:'fixture',now,cashTool:{name:'cash'},tools:[salesStoresTool],requestProvider:()=>assert.fail('no model extraction needed'),readSalesStores:async args=>{reads++;assert.deepEqual(args,expected('2026-09-01','2026-09-30'));return readAssistantSalesStores(args,access,{now,readCatalog:()=>assert.fail('no catalog needed'),readReport:async f=>({companyId:'c',storeId:'s',period:{calendarFrom:args.from,calendarTo:args.to,timeZone:'Europe/Athens',from:f.from.toISOString(),toExclusive:f.to.toISOString()},reversalAware:true,count:1,items:[{storeId:'s',productId:'p',name:'Fixture',unit:'PIECE',salesQuantity:1,grossSales:reads,netSales:reads,vatValue:0,reversalCount:0,returnGrossValue:0}]})})}};
 assert.equal((await runProductAssistant(settings)).evidence[0].totals.grossSales,1);
 assert.equal((await runProductAssistant(settings)).evidence[0].totals.grossSales,2);
});

test('actual Owner and Platform entry paths keep natural-period total report scope and reauthorize',async()=>{
 const scope={companyId:'c',storeId:'s'},history=users(['Δείξε μου τις πωλήσεις από 1/9/2026 έως 30/9/2026']);
 const args=expected('2026-09-01','2026-09-30');let revoked=false,reads=0,result;
 const authorize=async()=>{if(revoked)throw Object.assign(Error('revoked'),{status:403});return scope};
 const authorizeSalesStores=async()=>({scope:'OWNER_SELECTED_STORE',stores:[scope],excluded:[],truncated:false});
 const requestProvider=()=>assert.fail('known natural total does not need provider');
 const readSalesStores=async a=>{reads++;assert.deepEqual(a,args);return {kind:'sales_by_store',mode:'all',rows:[],source:'Στατιστικά πωλήσεων',result:'no_sales'}};
 await createOwnerAssistantHandlers({authorize,authorizeSalesStores,requestProvider,readSalesStores}).ask({body:{question:'Σε CSV',history}},{json:r=>result=r},e=>{throw e});
 assert.equal(result.scope.storeId,'s');assert.equal(result.readOnly,true);assert.equal(reads,1);
 const platform=await createPlatformAssistantSession({},scope,{authorize,authorizeSalesStores,readSalesCatalog:()=>assert.fail('no catalog'),readSalesReport:async f=>{
  reads++;assert.equal(f.companyId,'c');assert.equal(f.storeId,'s');assert.equal(f.productIds,null);
  const calendar=salesReportCalendar(args.from,args.to);assert.equal(f.from.toISOString(),calendar.from.toISOString());
  return {companyId:'c',storeId:'s',period:{calendarFrom:args.from,calendarTo:args.to,timeZone:'Europe/Athens',from:f.from.toISOString(),toExclusive:f.to.toISOString()},reversalAware:true,count:0,items:[]};
 }});
 const out=await platform.run({question:assistantEffectiveQuestion('Σε CSV',history),prompt:'fixture',requestProvider});
 assert.deepEqual(out.reads,[{name:'sales_by_store',args}]);assert.equal(reads,2);
 await platform.replay(out.reads);assert.equal(reads,3);revoked=true;
 await assert.rejects(platform.replay(out.reads),e=>e.status===403);assert.equal(reads,3);
});
