import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnerAssistantHandlers} from '../src/services/owner-assistant-handlers.js';
import {createPlatformAssistantSession} from '../src/services/platform-assistant-products.js';
import {assistantEffectiveQuestion} from '../src/services/assistant-conversation-context.js';
import {salesReportCalendar} from '../src/services/sales-report-calendar.js';

const scope={companyId:'fixture-c',storeId:'fixture-s',companyName:'Fixture',storeName:'Fixture store'};
const history=[{role:'user',content:'Πόσα TEST WATER πουλήθηκαν στις 18/10/2026;'},{role:'assistant',content:'fixture 18/10/2026'},{role:'user',content:'Και στις 17/10/2026;'},{role:'assistant',content:'fixture 17/10/2026'}];
const args={product:'TEST WATER (SKU FIX)',from:'2026-10-17',to:'2026-10-17'};
const evidence={kind:'product_sales',source:'Fixture sales',result:'matched',rows:[],from:args.from,to:args.to};
const completed=()=>({response:{ok:true},raw:{status:'completed',output_text:'{"answer":"fixture","highlights":[],"limitations":""}'}});
function provider(){let calls=0;return async settings=>{if(++calls===1){assert.equal(settings.tool_choice,'required');return {response:{ok:true},raw:{status:'completed',output:[{type:'function_call',name:'sales_by_product',call_id:'fresh-fixture',arguments:JSON.stringify(args)}]}};}return completed();};}

test('actual Owner handler reauthorizes a format-only continuation around its fresh read',async()=>{
 let auth=0,reads=0,out,err;
 await createOwnerAssistantHandlers({authorize:async()=>{auth++;return scope},requestProvider:provider(),readSales:async(req,value,current)=>{reads++;assert.deepEqual(value,args);assert.equal(current,scope);return evidence}}).ask({body:{question:'Σε CSV',history},headers:{authorization:'Bearer fixture'},params:{storeId:scope.storeId}}, {json:value=>out=value,status(){return this}},e=>err=e);
 assert.equal(err,undefined);assert.equal(reads,1);assert.equal(out.evidence[0],evidence);assert.equal(out.scope.storeId,scope.storeId);assert.ok(auth>=8);
});

test('actual Owner rejects revocation during the fresh export read before returning evidence',async()=>{
 let revoked=false,out,err;
 await createOwnerAssistantHandlers({authorize:async()=>{if(revoked)throw Object.assign(Error('revoked'),{status:403});return scope},requestProvider:provider(),readSales:async()=>{revoked=true;return evidence}}).ask({body:{question:'Σε CSV',history}}, {json:value=>out=value,status(){return this}},e=>err=e);
 assert.equal(out,undefined);assert.equal(err.status,403);
});

function report(){const c=salesReportCalendar(args.from,args.to);return {companyId:scope.companyId,storeId:scope.storeId,period:{calendarFrom:args.from,calendarTo:args.to,timeZone:'Europe/Athens',from:c.from.toISOString(),toExclusive:c.to.toISOString()},reversalAware:true,items:[{productId:'fixture-product',name:'TEST WATER',sku:'FIX',storeId:scope.storeId,storeName:scope.storeName,unit:'PIECE',salesQuantity:3,grossSales:1.5,netSales:1.33,vatValue:.17,normalSaleCount:2,reversalCount:1,returnGrossValue:.5}],count:1,sourceCoverage:{complete:true,returnedGroupCount:1,totalGroupCount:1,limit:10000,totalsScope:'COMPLETE_SOURCE'}};}

test('actual Platform continuation reads current period and signed-read replay is fresh and revocable',async()=>{
 let reads=0,auth=0,revoked=false;
 const session=await createPlatformAssistantSession({},scope,{authorize:async()=>{auth++;if(revoked)throw Object.assign(Error('revoked'),{status:403});return scope},readSalesReport:async filter=>{reads++;assert.equal(filter.q,'TEST WATER');assert.equal(filter.storeId,scope.storeId);assert.equal(filter.calendar.calendarFrom,args.from);return report()}});
 const result=await session.run({question:assistantEffectiveQuestion('Σε CSV',history),prompt:'fixture',requestProvider:provider()});
 assert.equal(result.evidence[0].result,'matched');assert.equal(result.evidence[0].rows[0].salesQuantity,3);assert.deepEqual(result.reads,[{name:'sales_by_product',args}]);
 await session.replay(result.reads);assert.equal(reads,2);assert.ok(auth>=8);
 revoked=true;await assert.rejects(session.replay(result.reads),e=>e.status===403);assert.equal(reads,2);
});

test('actual Platform revocation during a fresh continuation read withholds the result',async()=>{
 let revoked=false;
 const session=await createPlatformAssistantSession({},scope,{authorize:async()=>{if(revoked)throw Object.assign(Error('revoked'),{status:403});return scope},readSalesReport:async()=>{revoked=true;return report()}});
 await assert.rejects(session.run({question:assistantEffectiveQuestion('Σε CSV',history),prompt:'fixture',requestProvider:provider()}),e=>e.status===403);
});
