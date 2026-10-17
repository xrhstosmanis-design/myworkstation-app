import test from 'node:test';
import assert from 'node:assert/strict';
import {plainTotalSalesRequest,runProductAssistant} from '../src/services/owner-sales-tools.js';
import {readAssistantSalesStores,salesStoresArguments,salesStoresTool} from '../src/services/assistant-sales-stores.js';
import {salesReportCalendar} from '../src/services/sales-report-calendar.js';
import {parseAssistantSourceRead} from '../src/services/assistant-source-read.js';
import {createPlatformAssistantSession} from '../src/services/platform-assistant-products.js';
import {assistantAnswerFromResponse} from '../src/services/assistant-answer-response.js';
const now=new Date('2026-10-17T21:30:00Z'); // already 18 October in Athens
const scope={companyId:'company',storeId:'selected',storeName:'Selected'},access={scope:'PLATFORM_SELECTED_STORE',stores:[scope],excluded:[],truncated:false};
const args={mode:'all',names:[],from:'2026-10-18',to:'2026-10-18'};
function report(f){return {companyId:f.companyId,storeId:f.storeId,period:{calendarFrom:f.calendar.calendarFrom,calendarTo:f.calendar.calendarTo,timeZone:'Europe/Athens',from:f.from.toISOString(),toExclusive:f.to.toISOString()},reversalAware:true,items:[{storeId:f.storeId,productId:'a',name:'Water',unit:'PIECE',salesQuantity:3,grossSales:1.5,netSales:1,vatValue:.5,reversalCount:1,returnGrossValue:.5,costValue:'PRIVATE'},{storeId:f.storeId,productId:'b',name:'Other',unit:'LITER',salesQuantity:1.5,grossSales:2.25,netSales:2,vatValue:.25,reversalCount:0,returnGrossValue:0}],count:2};}
const options={now,readCatalog:async()=>{throw Error('all-product totals must not depend on catalog matching')},readReport:async f=>{assert.equal(f.companyId,'company');assert.equal(f.storeId,'selected');assert.equal(f.productIds,null);assert.equal(f.promotionsOnly,false);assert.equal(f.q,null);assert.equal(f.observedThrough,now);return report(f)}};
test('plain total-sales request is exact, Greek-calendar aware and never drops extra or inherited filters',()=>{
 for(const q of ['ΠΩΛΗΣΕΙΣ ΣΗΜΕΡΑ','Συνολικές πωλήσεις σήμερα','Σύνολο πωλήσεων σήμερα','Τζίρος σήμερα σε CSV'])assert.deepEqual(plainTotalSalesRequest(q,{now}),args);
 assert.deepEqual(plainTotalSalesRequest('Πωλήσεις χθες',{now}),{...args,from:'2026-10-17',to:'2026-10-17'});
 for(const q of ['Πωλήσεις σήμερα νερά','Πωλήσεις σήμερα μετρητά','Πωλήσεις σήμερα με χειριστή Χρήστης','Πωλήσεις αύριο','Σε CSV','Και σήμερα;','Πωλήσεις σήμερα\nΠροηγούμενο θέμα: νερά','Πωλήσεις σήμερα ή χθες'])assert.equal(plainTotalSalesRequest(q,{now}),null,q);
 assert.equal(salesStoresArguments.safeParse({...args,names:['water']}).success,false);
 assert.equal(salesStoresArguments.safeParse({...args,storeId:'foreign'}).success,false);
 assert.ok(!salesStoresTool.parameters.properties.mode.enum.includes('all')); // internal path only
});
test('exact failing request now reads canonical all-product evidence without provider extraction; signed replay schema retains args',async()=>{
 let calls=0;const out=await runProductAssistant({prompt:'fixture',question:'ΠΩΛΗΣΕΙΣ ΣΗΜΕΡΑ',now,cashTool:{name:'cash'},tools:[salesStoresTool],requestProvider:async()=>{throw Error('must not need model tool selection')},readSalesStores:async a=>{calls++;assert.deepEqual(a,args);return readAssistantSalesStores(a,access,options)}});
 assert.equal(calls,1);assert.equal(out.evidence[0].totals.grossSales,3.75);assert.equal(out.evidence[0].rows.length,2);assert.equal(out.evidence[0].incompletePeriod,true);assert.deepEqual(out.reads,[{name:'sales_by_store',args}]);assert.deepEqual(parseAssistantSourceRead(out.reads[0]),out.reads[0]);assert.doesNotMatch(JSON.stringify(out),/PRIVATE|costValue/);
 assert.notEqual(assistantAnswerFromResponse(out.raw,out.evidence,{requireEvidence:true,question:'ΠΩΛΗΣΕΙΣ ΣΗΜΕΡΑ'}).sourceUnavailable,true);
 await assert.rejects(runProductAssistant({prompt:'fixture',question:'Πωλήσεις νερού σήμερα',now,cashTool:{name:'cash'},tools:[salesStoresTool],readSalesStores:async()=>{throw Error('must not broaden product filter')},requestProvider:async()=>({response:{ok:true},raw:{output:[{type:'function_call',name:'sales_by_store',call_id:'bad',arguments:JSON.stringify(args)}]}})}),e=>e.status===422);
});
test('all-product totals withhold wrong, unavailable, capped or excluded sources; only validated empty source is zero',async()=>{
 const empty=await readAssistantSalesStores(args,access,{...options,readReport:async f=>({...report(f),items:[],count:0})});assert.equal(empty.result,'no_sales');assert.equal(empty.totals.grossSales,0);
 for(const mutate of [r=>r.storeId='foreign',r=>r.companyId='foreign',r=>r.period.calendarTo='2026-10-19',r=>r.items[0].storeId='foreign',r=>r.items[0].grossSales=NaN])await assert.rejects(readAssistantSalesStores(args,access,{...options,readReport:async f=>{const r=report(f);mutate(r);return r}}),e=>e.status===502);
 const capped=await readAssistantSalesStores(args,access,{...options,readReport:async f=>{const r=report(f);return {...r,items:Array(10000).fill(r.items[0]),count:10000}}});assert.equal(capped.result,'source_limited');assert.equal(capped.totals,null);assert.deepEqual(capped.rows,[]);
 const excluded=await readAssistantSalesStores(args,{...access,excluded:[{reason:'denied'}]},options);assert.equal(excluded.totals,null);assert.equal(excluded.complete,false);
 await assert.rejects(readAssistantSalesStores(args,access,{...options,readReport:async()=>{throw Error('unavailable')}}),/unavailable/);
 await assert.rejects(readAssistantSalesStores(args,access,{...options,verify:async()=>{throw Object.assign(Error('revoked'),{status:403})}}),e=>e.status===403);
});
test('actual Platform session replay reauthorizes selected scope for internal all mode and refuses revoked access',async()=>{
 let revoked=false,reads=0;const authorize=async()=>{if(revoked)throw Object.assign(Error('revoked'),{status:403});return scope};
 const session=await createPlatformAssistantSession({},scope,{authorize,authorizeSalesStores:async()=>access,readSalesCatalog:options.readCatalog,readSalesReport:async f=>{reads++;assert.equal(f.storeId,scope.storeId);assert.equal(f.productIds,null);return report(f)}});
 const [out]=await session.replay([{name:'sales_by_store',args}]);assert.equal(out.totals.grossSales,3.75);assert.equal(reads,1);revoked=true;await assert.rejects(session.replay([{name:'sales_by_store',args}]),e=>e.status===403);assert.equal(reads,1);
});
