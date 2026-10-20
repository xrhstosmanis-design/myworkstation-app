import test from 'node:test';
import assert from 'node:assert/strict';
import {readCanonicalOwnerSales,productSalesEvidence} from '../src/services/owner-sales-tools.js';
import {createPlatformAssistantSession} from '../src/services/platform-assistant-products.js';
import {salesReportCalendar} from '../src/services/sales-report-calendar.js';

const scope={companyId:'fixture-company',storeId:'fixture-store',companyName:'Fixture',storeName:'Fixture store'};
const args={product:'TEST WATER 500ML (SKU FIX-500)',from:'2026-10-17',to:'2026-10-17'};
const req={headers:{authorization:'Bearer isolated-fixture'}};
const item=(overrides={})=>({productId:'fixture-product',sku:'FIX-500',name:'TEST WATER 500ML',storeId:scope.storeId,storeName:scope.storeName,unit:'PIECE',salesQuantity:3,grossSales:7.77,netSales:6.88,vatValue:.89,normalSaleCount:2,reversalCount:1,returnGrossValue:.5,costValue:123,supplierName:'PRIVATE',...overrides});
function report(items=[item()],value=args){
 const c=salesReportCalendar(value.from,value.to);
 return {companyId:scope.companyId,storeId:scope.storeId,period:{calendarFrom:value.from,calendarTo:value.to,timeZone:'Europe/Athens',from:c.from.toISOString(),toExclusive:c.to.toISOString()},reversalAware:true,items,count:items.length,sourceCoverage:{complete:true,returnedGroupCount:items.length,totalGroupCount:items.length,limit:10000,totalsScope:'COMPLETE_SOURCE'}};
}
// Simulate the canonical reader's literal ILIKE term. The production SQL and
// auth are unchanged; these tests execute both actual assistant adapters.
const filtered=(q,rows=[item()])=>rows.filter(r=>[r.name,r.sku].some(v=>v.toLowerCase().includes(q.toLowerCase())));

test('actual Owner reader resolves the observed display-decorated query with a checked name/SKU pair',async()=>{
 let calls=0;
 const out=await readCanonicalOwnerSales(req,args,scope,{port:8081,fetchImpl:async(url,options)=>{
  calls++;const u=new URL(url);assert.equal(u.origin,'http://127.0.0.1:8081');assert.equal(u.pathname,'/api/reports/sales-analysis');
  assert.equal(u.searchParams.get('q'),'TEST WATER 500ML');assert.equal(u.searchParams.get('storeId'),scope.storeId);assert.equal(u.searchParams.get('from'),args.from);assert.equal(u.searchParams.get('to'),args.to);assert.equal(u.searchParams.get('timeZone'),'Europe/Athens');
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,req.headers.authorization);
  return {ok:true,json:async()=>report(filtered(u.searchParams.get('q')))};
 }});
 assert.equal(calls,1);assert.equal(out.result,'matched');assert.equal(out.productQuery,args.product);assert.equal(out.rows[0].productId,'fixture-product');assert.equal(out.rows[0].grossSales,7.77);assert.equal(out.rows[0].salesQuantity,3);assert.equal(out.rows[0].reversalCount,1);assert.equal(out.rows[0].unit,'PIECE');assert.doesNotMatch(JSON.stringify(out),/PRIVATE|costValue/);
});

test('actual Platform provider-read and export replay use the same checked query and fresh authorization',async()=>{
 let revoked=false,reads=0,providers=0,auth=0;
 const session=await createPlatformAssistantSession({},scope,{authorize:async()=>{auth++;if(revoked)throw Object.assign(Error('revoked'),{status:403});return scope},readSalesReport:async f=>{
  reads++;assert.equal(f.q,'TEST WATER 500ML');assert.equal(f.storeId,scope.storeId);assert.equal(f.companyId,scope.companyId);assert.equal(f.calendar.calendarFrom,args.from);return report(filtered(f.q));
 }});
 const out=await session.run({prompt:'synthetic request',question:'Πωλήσεις TEST WATER 500ML στις17/10/2026',requestProvider:async()=>++providers===1?{response:{ok:true},raw:{output:[{type:'function_call',name:'sales_by_product',call_id:'fixture-call',arguments:JSON.stringify(args)}]}}:{response:{ok:true},raw:{output_text:'{"answer":"fixture","highlights":[],"limitations":""}'}}});
 assert.equal(out.evidence[0].result,'matched');assert.equal(out.evidence[0].scope,'PLATFORM_SELECTED_STORE');assert.deepEqual(out.reads,[{name:'sales_by_product',args}]);
 const replay=await session.replay(out.reads);assert.equal(replay[0].result,'matched');assert.equal(reads,2);assert.ok(auth>=6);
 revoked=true;await assert.rejects(session.replay(out.reads),e=>e.status===403);assert.equal(reads,2);
});

test('decorated identity requires both exact fields, preserves literal full names and refuses duplicate identity',()=>{
 assert.equal(productSalesEvidence(report([item(),item({productId:'other',sku:'OTHER'})]),args,scope).rows[0].productId,'fixture-product');
 for(const override of [{sku:'OTHER'},{name:'TEST WATER 1L'},{name:'TEST WATER 500ML extra'}])assert.equal(productSalesEvidence(report([item(override)]),args,scope).result,'no_match');
 const duplicate=productSalesEvidence(report([item(),item({productId:'duplicate'})]),args,scope);assert.equal(duplicate.result,'ambiguous');assert.deepEqual(duplicate.rows,[]);
 const literal=item({productId:'literal',name:args.product,sku:'LITERAL'});assert.equal(productSalesEvidence(report([item(),literal]),args,scope).rows[0].productId,'literal');
 for(const product of ['FIX-500','TEST WATER 500ML','TEST WATER'])assert.equal(productSalesEvidence(report(),{...args,product},scope).result,'matched');
});

test('decorated query cannot turn partial, malformed, foreign or unavailable source into a match',async()=>{
 const partial=report();partial.sourceCoverage={complete:false,returnedGroupCount:1,totalGroupCount:2,limit:10000,totalsScope:'RETURNED_GROUPS'};
 const out=productSalesEvidence(partial,args,scope);assert.equal(out.result,'source_limited');assert.deepEqual(out.rows,[]);
 for(const mutate of [r=>r.companyId='foreign',r=>r.storeId='foreign',r=>r.items[0].storeId='foreign',r=>r.period.calendarTo='2026-10-18',r=>r.items[0].grossSales=NaN]){const r=report();mutate(r);assert.throws(()=>productSalesEvidence(r,args,scope),e=>e.status===502);}
 for(const status of [401,403,404,500])await assert.rejects(readCanonicalOwnerSales(req,args,scope,{fetchImpl:async()=>({ok:false,status})}),e=>e.status===(status===500?502:status));
 let reads=0;await assert.rejects(readCanonicalOwnerSales({headers:{}},args,scope,{fetchImpl:async()=>reads++}),e=>e.status===401);assert.equal(reads,0);
});

test('Platform still withholds a decorated result when access is revoked while the canonical read awaits',async()=>{
 let revoked=false;
 const session=await createPlatformAssistantSession({},scope,{authorize:async()=>{if(revoked)throw Object.assign(Error('revoked'),{status:403});return scope},readSalesReport:async()=>{revoked=true;return report()}});
 await assert.rejects(session.replay([{name:'sales_by_product',args}]),e=>e.status===403);
});
