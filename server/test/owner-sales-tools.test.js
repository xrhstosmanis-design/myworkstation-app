import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {salesReportCalendar,optionalSalesCalendar} from "../src/services/sales-report-calendar.js";
import {salesToolArguments,ownerSalesTool,readCanonicalOwnerSales,runOwnerAssistant} from "../src/services/owner-sales-tools.js";
import {ownerCashTool,createOwnerAssistantHandlers} from "../src/services/owner-assistant-handlers.js";
import {authorizeOwnerAssistant} from "../src/services/owner-assistant-access.js";
import salesRouter,{salesAnalysisFilters} from "../src/routes/kiosk-reports-sales-v4.js";
import {prisma} from "../src/prisma.js";

const scope={companyId:"c",companyName:"Fixture",storeId:"s",storeName:"Fixture Store",supportPreview:false};
const args={product:"TEST1",from:"2026-10-10",to:"2026-10-10"};
const req={params:{storeId:"s"},headers:{authorization:"Bearer isolated-fixture"},user:{id:"o",role:"OWNER",tokenType:"BACKOFFICE_USER",companyId:"c",sessionId:"session",sessionVersion:1}};
const row=(id="p",name="Νερό",sku="TEST1")=>({productId:id,sku,name,storeId:"s",storeName:"Fixture Store",salesQuantity:2,grossSales:1,netSales:0.8849557522123894,vatValue:0.1150442477876106,normalSaleCount:3,reversalCount:1,returnGrossValue:0.5,currentStock:5,unitCost:9,supplierName:"PRIVATE",customerName:"PRIVATE",attachmentData:"PRIVATE"});
const report=(items=[row()])=>{const c=salesReportCalendar(args.from,args.to);return{companyId:"c",storeId:"s",period:{calendarFrom:args.from,calendarTo:args.to,timeZone:c.timeZone,from:c.from.toISOString(),toExclusive:c.to.toISOString()},reversalAware:true,count:items.length,items,totalGross:999}};
const read=(data=report(),options={})=>readCanonicalOwnerSales(req,args,scope,{fetchImpl:async()=>({ok:true,json:async()=>data}),...options});
const deny=(promise,status)=>assert.rejects(promise,error=>error.status===status);

test("inclusive Greek dates are server-TZ independent and cover 23/25-hour DST days",()=>{
  for(const [date,hours,start,end] of [["2026-03-29",23,"2026-03-28T22:00:00.000Z","2026-03-29T21:00:00.000Z"],["2026-10-25",25,"2026-10-24T21:00:00.000Z","2026-10-25T22:00:00.000Z"]]){const range=salesReportCalendar(date,date);assert.equal((range.to-range.from)/3600000,hours);assert.equal(range.from.toISOString(),start);assert.equal(range.to.toISOString(),end)}
  assert.equal(optionalSalesCalendar({from:"legacy-invalid"}),null);
  for(const [from,to] of [["2026-02-30","2026-03-01"],["2026-10-11","2026-10-10"],["2025-01-01","2026-01-02"],["1999-12-31","2000-01-01"]])assert.throws(()=>salesReportCalendar(from,to),error=>error.status===400);
  assert.throws(()=>optionalSalesCalendar({timeZone:"UTC",...args}),error=>error.status===400);
  const f=salesAnalysisFilters({user:{companyId:"c"},query:{from:args.from,to:args.to,timeZone:"Europe/Athens",storeId:"s"}});assert.equal(f.from.toISOString(),"2026-10-09T21:00:00.000Z");assert.equal(f.to.toISOString(),"2026-10-10T21:00:00.000Z");
});
test("strict product/date arguments reject scope, URL, action, invalid/missing period before I/O",async()=>{
  for(const extra of [{storeId:"foreign"},{companyId:"foreign"},{url:"https://foreign.invalid"},{sql:"SELECT"},{action:"write"}])assert.equal(salesToolArguments.safeParse({...args,...extra}).success,false);
  for(const value of [{...args,from:"2026-02-30"},{...args,to:"2026-10-09"},{...args,product:""},{product:"TEST1"}]){let calls=0;await assert.rejects(readCanonicalOwnerSales(req,value,scope,{fetchImpl:async()=>calls++}));assert.equal(calls,0)}
  assert.equal(ownerSalesTool.strict,true);assert.equal(ownerSalesTool.parameters.additionalProperties,false);
});
test("fixed canonical GET/original session/period and privacy projection preserve reversal-aware source amounts",async()=>{
  let called;const e=await read(report(),{port:8081,fetchImpl:async(url,options)=>{called={url,options};return {ok:true,json:async()=>report()}}});
  assert.equal(called.url,"http://127.0.0.1:8081/api/reports/sales-analysis?storeId=s&from=2026-10-10&to=2026-10-10&q=TEST1&timeZone=Europe%2FAthens");assert.equal(called.options.method,"GET");assert.equal(called.options.redirect,"error");assert.equal(called.options.headers.Authorization,"Bearer isolated-fixture");
  assert.equal(e.result,"matched");assert.equal(e.rows[0].grossSales,1);assert.equal(e.rows[0].salesQuantity,2);assert.equal(e.rows[0].reversalCount,1);assert.equal(e.rows[0].netSales,row().netSales);assert.equal(JSON.stringify(e).includes("PRIVATE"),false);assert.equal(Object.hasOwn(e.rows[0],"currentStock"),false);assert.equal(Object.hasOwn(e,"totalGross"),false);
});
test("exact SKU wins over partial match; duplicate names never choose the first product or sum them",async()=>{
  let e=await read(report([row(),row("p2","Νερό άλλο","TEST10")]));assert.equal(e.result,"matched");assert.equal(e.rows[0].productId,"p");
  e=await readCanonicalOwnerSales(req,{...args,product:"Νερό"},scope,{fetchImpl:async()=>({ok:true,json:async()=>report([row(),row("p2","Νερό","TEST2")])})});assert.equal(e.result,"ambiguous");assert.equal(e.rows.length,0);assert.equal(e.candidateCount,2);assert.equal(Object.hasOwn(e.candidates[0],"grossSales"),false);
  e=await read(report([row("p2","Άλλο","OTHER")]));assert.equal(e.result,"no_match");assert.equal(e.rows.length,0);
  e=await read(report([]));assert.equal(e.result,"no_match");
});
test("source cap cannot prove unique match or no data; candidates are limited explicitly",async()=>{
  let e=await read(report(Array.from({length:10000},(_,i)=>row(`p${i}`,`Νερό${i}`,`TEST1-${i}`))));assert.equal(e.result,"source_limited");assert.equal(e.truncated,true);assert.equal(e.rows.length,0);
  e=await read(report(Array.from({length:21},(_,i)=>row(`p${i}`,`Νερό${i}`,`TEST1-${i}`))));assert.equal(e.result,"ambiguous");assert.equal(e.candidates.length,20);assert.equal(e.truncated,true);
});
test("foreign scope, changed period, invalid numbers and unavailable source fail without fabricated zero",async()=>{
  for(const mutate of [r=>r.companyId="foreign",r=>r.storeId="foreign",r=>r.items[0].storeId="foreign",r=>r.period.timeZone="UTC",r=>r.period.toExclusive="bad",r=>r.reversalAware=false,r=>r.count=2,r=>r.items[0].grossSales=null]){const data=report();mutate(data);await deny(read(data),502)}
  for(const status of [401,403,404,500])await deny(read(report(),{fetchImpl:async()=>({ok:false,status})}),status===500?502:status);
  let calls=0;const options={fetchImpl:async()=>calls++};await deny(readCanonicalOwnerSales({...req,headers:{}},args,scope,options),401);await deny(read(report(),{...options,port:"8080/remote"}),503);assert.equal(calls,0);
});
test("domain modules are fresh independent requirements, never substitutes for AI or tenant/role/session checks",async()=>{
  const state={name:"Fixture",licenseAllowed:true,activeModules:["AI_OWNER_ASSISTANT","INVENTORY"]},overrides={};
  const session={userId:"o",expiresAt:new Date(Date.now()+3600000),user:{id:"o",role:"OWNER",companyId:"c",sessionVersion:1,mustChangePassword:false}};
  const db={userSession:{findUnique:async()=>session},store:{findFirst:async()=>({id:"s",name:scope.storeName,companyId:"c"})},$queryRaw:async(strings,...values)=>overrides[values.at(-1)]?[overrides[values.at(-1)]]:[]};const options={db,getState:async()=>state,requiredModules:["INVENTORY"]};
  assert.equal((await authorizeOwnerAssistant(req,options)).storeId,"s");await deny(authorizeOwnerAssistant(req,{...options,requiredModules:["CASH_CONTROL"]}),403);
  for(const key of ["AI_OWNER_ASSISTANT","INVENTORY"]){overrides[key]={active:false};await deny(authorizeOwnerAssistant(req,options),403);delete overrides[key];overrides[key]={active:true,endsAt:new Date(0)};await deny(authorizeOwnerAssistant(req,options),403);delete overrides[key]}
  session.user.role="EMPLOYEE";await deny(authorizeOwnerAssistant(req,options),403);session.user.role="OWNER";session.revokedAt=new Date();await deny(authorizeOwnerAssistant(req,options),401);
});
const salesCall={type:"function_call",name:"sales_by_product",call_id:"sales",arguments:JSON.stringify(args)};
const answer=()=>({response:{ok:true},raw:{output_text:'{"answer":"Fixture","highlights":[],"limitations":""}'}});
test("Owner dispatcher replays evidence/reasoning, bounds total reads and rejects unknown/multi/extra tools",async()=>{
  let calls=0,reads=0;const out=await runOwnerAssistant({prompt:"Fixture",cashTool:ownerCashTool,readSales:async()=>{reads++;return {rows:[]}},requestProvider:async settings=>{calls++;assert.equal(settings.store,false);if(calls===1)return {response:{ok:true},raw:{output:[{type:"reasoning",id:"r"},salesCall]}};assert.equal(settings.input[1].id,"r");assert.equal(settings.input[3].type,"function_call_output");return answer()}});assert.equal(out.evidence.length,1);assert.equal(reads,1);
  for(const output of [[{...salesCall,name:"write"}],[salesCall,salesCall],[{...salesCall,arguments:JSON.stringify({...args,storeId:"foreign"})}]]){let readCalls=0;await assert.rejects(runOwnerAssistant({prompt:"Fixture",cashTool:ownerCashTool,readSales:async()=>readCalls++,requestProvider:async()=>({response:{ok:true},raw:{output}})}));assert.equal(readCalls,0)}
  calls=0;reads=0;await deny(runOwnerAssistant({prompt:"Fixture",cashTool:ownerCashTool,readSales:async()=>{reads++;return {}},requestProvider:async settings=>{calls++;if(calls===3)assert.equal(settings.tool_choice,"none");return {response:{ok:true},raw:{output:[salesCall]}}}}),502);assert.equal(calls,3);assert.equal(reads,2);
});
test("real handler checks sales entitlement around read and rejects late revocation before provider/final",async()=>{
  for(const boundary of [5,6,7,8]){let auth=0,providers=0,reads=0,out,err;const h=createOwnerAssistantHandlers({authorize:async(request,options)=>{auth++;if(auth===boundary)throw Object.assign(Error("revoked"),{status:403});if(auth>=5)assert.ok(options.requiredModules.includes("INVENTORY"));return scope},requestProvider:async()=>++providers===1?{response:{ok:true},raw:{output:[salesCall]}}:answer(),readSales:async()=>{reads++;return {rows:[]}}});await h.ask({...req,body:{question:"Πωλήσεις TEST1 10/10/2026;"}},{json:value=>out=value,status(){return this}},error=>err=error);assert.equal(out,undefined);assert.equal(err.status,403);if(boundary===5)assert.equal(reads,0)}
});
test("mounted canonical route uses opt-in Athens exclusive SQL bounds and metadata; legacy remains unchanged",async()=>{
  const original=prisma.$queryRaw,queries=[];prisma.$queryRaw=async(strings,...values)=>{queries.push({sql:strings.join("?"),values});return [row()]};
  const app=express();app.use((request,response,next)=>{request.user=req.user;next()});app.use("/api/reports",salesRouter);app.use((error,request,response,next)=>response.status(error.status||500).json({error:error.message}));
  const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));const base=`http://127.0.0.1:${server.address().port}/api/reports/sales-analysis`;
  try{const response=await fetch(`${base}?storeId=s&from=2026-10-10&to=2026-10-10&q=TEST1&timeZone=Europe%2FAthens`);assert.equal(response.status,200);const data=await response.json();assert.equal(data.companyId,"c");assert.equal(data.storeId,"s");assert.equal(data.period.toExclusive,"2026-10-10T21:00:00.000Z");assert.equal(data.reversalAware,true);assert.ok(queries[0].values.some(value=>value instanceof Date&&value.toISOString()==="2026-10-09T21:00:00.000Z"));assert.match(queries[0].sql,/sa\."occurredAt"<\?/);assert.match(queries[0].sql,/POS_REVERSAL/);assert.match(queries[0].sql,/<>'CREDIT'/);
    const legacy=await(await fetch(`${base}?storeId=s&from=2026-10-10&to=2026-10-10`)).json();assert.equal(Object.hasOwn(legacy,"period"),false);const before=queries.length;assert.equal((await fetch(`${base}?from=2026-02-30&to=2026-03-01&timeZone=Europe%2FAthens`)).status,400);assert.equal(queries.length,before);
  }finally{prisma.$queryRaw=original;await new Promise(resolve=>server.close(resolve))}
});
