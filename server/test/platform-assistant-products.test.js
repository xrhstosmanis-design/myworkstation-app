import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {authorizePlatformAssistant,createPlatformAssistantSession} from "../src/services/platform-assistant-products.js";
import {assistantProductTools,runProductAssistant,runOwnerAssistant,productSalesEvidence} from "../src/services/owner-sales-tools.js";
import {productStockEvidence} from "../src/services/owner-stock-tools.js";
import {readSalesAnalysisReport} from "../src/routes/kiosk-reports-sales-v4.js";
import {readStockAnalysisReport} from "../src/routes/kiosk-reports-stock-v3.js";
import {salesReportCalendar} from "../src/services/sales-report-calendar.js";

const req={user:{id:"admin",role:"OWNER",platformRole:"SUPER_ADMIN",isSuperAdmin:true,sessionId:"session",sessionVersion:3},headers:{authorization:"Bearer fixture"}};
const selection={companyId:"c",storeId:"s"},scope={...selection,companyName:"Company",storeName:"Store"};
const session=()=>({userId:"admin",expiresAt:new Date("2030-01-01"),revokedAt:null,user:{id:"admin",role:"SUPER_ADMIN",sessionVersion:3,mustChangePassword:false}});
const row=()=>({productId:"p",sku:"2269",name:"ΝΕΡΟ 500ML",storeId:"s",storeName:"Store",unit:"KG",currentStock:-2.125,salesQuantity:4,grossSales:2,netSales:1.77,vatValue:.23,costValue:99,normalSaleCount:1,reversalCount:0,returnGrossValue:0,supplierName:"PRIVATE SUPPLIER",operatorName:"PRIVATE NAME"});
const args={product:"2269",from:"2026-10-10",to:"2026-10-10"},calendar=salesReportCalendar(args.from,args.to);
const sales=()=>({companyId:"c",storeId:"s",items:[row()],count:1,reversalAware:true,period:{calendarFrom:args.from,calendarTo:args.to,timeZone:"Europe/Athens",from:calendar.from.toISOString(),toExclusive:calendar.to.toISOString()}});
const stock=()=>({items:[row()],count:1});
const call=name=>({type:"function_call",name,call_id:"call",arguments:JSON.stringify(name==="sales_by_product"?args:{product:"2269"})});
const answer=()=>({response:{ok:true},raw:{output_text:'{"answer":"Fixture","highlights":[],"sources":[],"limitations":"Read only"}'}});
const denial=(fn,status)=>assert.rejects(fn,error=>error.status===status);

test("Platform and Owner share the exact product registry, dispatcher and checked projections",()=>{
  assert.equal(runProductAssistant,runOwnerAssistant);assert.deepEqual(assistantProductTools.map(x=>x.name),["sales_by_product","stock_by_product"]);
  assert.ok(assistantProductTools.every(x=>x.strict&&x.parameters.additionalProperties===false&&!Object.hasOwn(x.parameters.properties,"storeId")&&!Object.hasOwn(x.parameters.properties,"companyId")));
  for(const e of [productSalesEvidence(sales(),args,scope),productStockEvidence(stock(),{product:"2269"},scope)])assert.doesNotMatch(JSON.stringify(e),/PRIVATE|costValue|supplierName|operatorName/);
});

test("fresh actual Super Admin session and matching active company/store are required before any report",async()=>{
  const db={userSession:{findUnique:async()=>session()},store:{findFirst:async({where})=>{assert.deepEqual(where,{id:"s",companyId:"c",active:true,company:{active:true}});return {id:"s",companyId:"c",name:"Store",company:{name:"Company"}}}}};
  assert.deepEqual(await authorizePlatformAssistant(req,selection,{db}),scope);assert.equal(await authorizePlatformAssistant(req,null,{db}),null);
  for(const user of [{...req.user,role:"EMPLOYEE"},{...req.user,isSuperAdmin:false,platformRole:"OWNER"},{...req.user,supportContext:selection}])await denial(authorizePlatformAssistant({...req,user},selection,{db}),403);
  await denial(authorizePlatformAssistant({...req,user:{...req.user,sessionId:null}},selection,{db}),401);
  for(const mutate of [s=>s.revokedAt=new Date(),s=>s.expiresAt=new Date(0),s=>s.expiresAt="invalid",s=>s.userId="other",s=>s.user.id="other",s=>s.user.role="OWNER",s=>s.user.sessionVersion=4,s=>s.user.mustChangePassword=true]){const s=session();mutate(s);await denial(authorizePlatformAssistant(req,selection,{db:{...db,userSession:{findUnique:async()=>s}}}),401)}
  await denial(authorizePlatformAssistant(req,{...selection,companyId:"foreign"},{db:{...db,store:{findFirst:async()=>null}}}),404);
});

test("actual Backoffice session issuer's OWNER/SUPER_ADMIN payload reaches products while a database downgrade still denies it",async()=>{
  const source=readFileSync(new URL("../src/routes/auth.js",import.meta.url),"utf8");
  const body=source.slice(source.indexOf("async function issueSession("),source.indexOf("// Renew only an already authenticated"));
  assert.ok(body.startsWith("async function issueSession("));let payload;
  const issue=new Function("prisma","jwt","assertCustomerDemoRuntimeClosed","SESSION_HOURS","deviceLabel","ipAddress","publicUser","process",`${body};return issueSession`)(
    {userSession:{create:async()=>({id:"session",deviceName:"Fixture"})}},
    {sign:value=>{payload=value;return "test-only"}},()=>{},8,value=>value,()=>null,user=>({id:user.id}),{env:{JWT_SECRET:"test-only"}});
  await issue({id:"admin",role:"SUPER_ADMIN",companyId:"platform",sessionVersion:3},{headers:{}},"Fixture");
  assert.equal(payload.role,"OWNER");assert.equal(payload.platformRole,"SUPER_ADMIN");assert.equal(payload.isSuperAdmin,true);
  const db={userSession:{findUnique:async()=>session()},store:{findFirst:async()=>({id:"s",companyId:"c",name:"Store",company:{name:"Company"}})}};
  assert.deepEqual(await authorizePlatformAssistant({user:payload},selection,{db}),scope);
  const downgraded=session();downgraded.user.role="OWNER";
  await denial(authorizePlatformAssistant({user:payload},selection,{db:{...db,userSession:{findUnique:async()=>downgraded}}}),401);
});

test("selected sales/stock tools use canonical filters and privacy projection with identical Owner results",async()=>{
  for(const name of ["sales_by_product","stock_by_product"]){let providers=0,reads=0;const options={authorize:async()=>scope,readSalesReport:async filters=>{reads++;assert.equal(filters.companyId,"c");assert.equal(filters.storeId,"s");assert.equal(filters.q,"2269");assert.equal(filters.from.toISOString(),"2026-10-09T21:00:00.000Z");return sales()},readStockReport:async filters=>{reads++;assert.equal(filters.storeId,"s");assert.equal(filters.q,"2269");return stock()}};
    const assistant=await createPlatformAssistantSession(req,selection,options);assert.deepEqual(assistant.tools.map(x=>x.name),["cash_details","sales_by_product","stock_by_product","sales_by_store","consumption_details","business_records"]);
    const out=await assistant.run({prompt:"Fixture",requestProvider:async settings=>{providers++;assert.equal(settings.store,false);assert.equal(settings.parallel_tool_calls,false);if(providers===1)return {response:{ok:true},raw:{output:[{type:"reasoning",id:"reason"},call(name)]}};assert.equal(settings.input[1].id,"reason");assert.equal(settings.input.at(-1).type,"function_call_output");return answer()}});
    assert.equal(reads,1);assert.equal(out.evidence[0].scope,"PLATFORM_SELECTED_STORE");assert.deepEqual(out.scope,scope);
    const expected=name==="sales_by_product"?productSalesEvidence(sales(),args,scope):productStockEvidence(stock(),{product:"2269"},scope);const actual=out.evidence[0];assert.deepEqual(actual.rows,expected.rows);assert.equal(actual.source,expected.source);assert.doesNotMatch(JSON.stringify(actual),/PRIVATE|costValue|supplierName|operatorName/);
  }
});

test("unselected scope cannot invoke products or accept model company/store injection",async()=>{
  for(const selectionValue of [null,selection]){let reads=0;const assistant=await createPlatformAssistantSession(req,selectionValue,{allStores:selectionValue===null,authorize:async()=>selectionValue?scope:null,readSalesReport:async()=>{reads++;return sales()}});
    const tool=call("sales_by_product");if(selectionValue)tool.arguments=JSON.stringify({...args,storeId:"foreign"});
    await denial(assistant.run({prompt:"Fixture",requestProvider:async()=>({response:{ok:true},raw:{output:[tool]}})}),selectionValue?422:502);assert.equal(reads,0);
  }
});

test("revocation or changed pair at any provider/read/final boundary withholds the whole answer",async()=>{
  for(const boundary of [2,3,4,5,6]){let auth=0,reads=0,providers=0;const assistant=await createPlatformAssistantSession(req,selection,{authorize:async()=>{if(++auth===boundary)throw Object.assign(Error("revoked"),{status:401});return scope},readStockReport:async()=>{reads++;return stock()}});
    await denial(assistant.run({prompt:"Fixture",requestProvider:async()=>++providers===1?{response:{ok:true},raw:{output:[call("stock_by_product")]}}:answer()}),401);if(boundary<=3)assert.equal(reads,0);if(boundary===4)assert.equal(providers,1);
  }
  let n=0;const assistant=await createPlatformAssistantSession(req,selection,{authorize:async()=>++n===4?{...scope,companyId:"other"}:scope,readStockReport:async()=>stock()});await denial(assistant.run({prompt:"Fixture",requestProvider:async()=>({response:{ok:true},raw:{output:[call("stock_by_product")]}})}),403);
});

test("empty/ambiguous/capped/negative results obey the shared rules and malformed foreign reports fail",async()=>{
  for(const items of [[],[row(),{...row(),productId:"p2",sku:"22690"}],Array.from({length:10000},row)]){const query={product:"νερο"};const e=productStockEvidence({items,count:items.length},query,scope);assert.equal(e.result,items.length===0?"no_match":items.length===10000?"source_limited":"ambiguous");assert.deepEqual(e.rows,[]);assert.doesNotMatch(JSON.stringify(e.candidates),/currentStock|PRIVATE/)}
  assert.equal(productStockEvidence(stock(),{product:"2269"},scope).rows[0].currentStock,-2.125);
  await denial(Promise.resolve().then(()=>productSalesEvidence({...sales(),storeId:"foreign"},args,scope)),502);
  await denial(Promise.resolve().then(()=>productStockEvidence({items:[{...row(),storeId:"foreign"}],count:1},{product:"2269"},scope)),502);
});

test("canonical calculations stay parameterized and return the same ordinary-report quantities and arithmetic",async()=>{
  const queries=[],db={$queryRaw:async(strings,...values)=>{queries.push({sql:strings.join("?"),values});return [row()]},store:{findFirst:async()=>({id:"s"})}};
  const filters={companyId:"c",storeId:"s",from:calendar.from,to:calendar.to,q:"2269",calendar};
  const s=await readSalesAnalysisReport(filters,{db}),st=await readStockAnalysisReport(filters,{db});
  assert.equal(s.items[0].salesQuantity,4);assert.equal(s.items[0].grossSales,2);assert.equal(s.items[0].netSales,1.77);assert.equal(s.items[0].vatValue,.23);assert.equal(st.items[0].currentStock,-2.125);
  assert.ok(queries.every(q=>q.values.includes("c")&&q.values.includes("s")&&q.values.includes("%2269%")));assert.match(queries[0].sql,/COMPLETED/);assert.match(queries[0].sql,/<>'CREDIT'/);assert.match(queries[0].sql,/POS_REVERSAL/);assert.match(queries[1].sql,/p\."companyId"=\?/);
});

test("source errors and abort after a read cannot produce a cached or partial answer",async()=>{
  for(const aborted of [false,true]){const controller=new AbortController(),failure=Object.assign(Error("unavailable"),{status:502});let providers=0;
    const assistant=await createPlatformAssistantSession(req,selection,{authorize:async()=>scope,signal:controller.signal,readStockReport:async()=>{if(!aborted)throw failure;controller.abort();return stock()}});
    await assert.rejects(assistant.run({prompt:"Fixture",requestProvider:async()=>{providers++;return {response:{ok:true},raw:{output:[call("stock_by_product")]}}}}),e=>aborted?e.name==="AbortError":e===failure);assert.equal(providers,1);
  }
});
