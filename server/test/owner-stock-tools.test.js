import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {stockToolArguments,ownerStockTool,readCanonicalOwnerStock} from "../src/services/owner-stock-tools.js";
import {runOwnerAssistant} from "../src/services/owner-sales-tools.js";
import {ownerCashTool,createOwnerAssistantHandlers} from "../src/services/owner-assistant-handlers.js";
import stockRouter from "../src/routes/kiosk-reports-stock-v3.js";
import {prisma} from "../src/prisma.js";

const scope={companyId:"c",companyName:"Fixture",storeId:"s",storeName:"Store",supportPreview:false};
const req={params:{storeId:"s"},headers:{authorization:"Bearer isolated-fixture"},user:{id:"o",companyId:"c",role:"OWNER",tokenType:"BACKOFFICE_USER"}};
const args={product:"2269"},now=new Date("2026-10-10T21:30:00.000Z");
const row=(id="p",name="ΝΕΡΟ 500ML",sku="2269")=>({productId:id,name,sku,storeId:"s",storeName:"Store",unit:"PIECE",currentStock:-2.125,purchasePrice:99,supplierName:"PRIVATE SUPPLIER",operatorName:"PRIVATE PERSON",salesQuantity:100,attachmentData:"PRIVATE IMAGE"});
const report=(items=[row()])=>({items,count:items.length,totalStockQuantity:999,totalPurchaseValue:999});
const read=(data=report(),options={})=>readCanonicalOwnerStock(req,args,scope,{now,fetchImpl:async()=>({ok:true,json:async()=>data}),...options});
const deny=(promise,status)=>assert.rejects(promise,error=>error.status===status);

test("stock arguments allow only a bounded literal product, rejecting date/scope/action before I/O",async()=>{
  assert.equal(ownerStockTool.strict,true);assert.equal(ownerStockTool.parameters.additionalProperties,false);
  for(const extra of [{storeId:"foreign"},{companyId:"foreign"},{url:"https://foreign.invalid"},{action:"adjust"},{date:"2026-10-10"},{sql:"SELECT"}])assert.equal(stockToolArguments.safeParse({...args,...extra}).success,false);
  for(const value of [{},{product:" "},{product:"x".repeat(121)},{...args,date:"2026-10-10"}]){let calls=0;await assert.rejects(readCanonicalOwnerStock(req,value,scope,{fetchImpl:async()=>calls++}));assert.equal(calls,0)}
});
test("stock uses fixed original-session GET, Greek today, no redirect and privacy projection without zeroing negatives",async()=>{
  let called;const signal=new AbortController().signal;
  const e=await read(report(),{port:8081,signal,fetchImpl:async(url,options)=>{called={url,options};return {ok:true,json:async()=>report()}}});
  assert.equal(called.url,"http://127.0.0.1:8081/api/reports/stock-analysis?storeId=s&q=2269&from=2026-10-11&to=2026-10-11");
  assert.equal(called.options.method,"GET");assert.equal(called.options.redirect,"error");assert.equal(called.options.headers.Authorization,req.headers.authorization);assert.equal(called.options.signal,signal);
  assert.equal(e.kind,"product_stock");assert.equal(e.result,"matched");assert.equal(e.rows[0].currentStock,-2.125);assert.equal(e.rows[0].unit,"PIECE");assert.equal(e.physicalCount,false);assert.equal(e.scope,"OWNER_SELECTED_STORE");assert.equal(e.companyId,"c");assert.equal(e.storeId,"s");assert.ok(Number.isFinite(new Date(e.observedAt).getTime()));
  assert.doesNotMatch(JSON.stringify(e),/PRIVATE|purchasePrice|supplierName|salesQuantity|totalStockQuantity|totalPurchaseValue/);
});
test("stock zero is a matched source value; missing record is no-match, duplicate names/rows require SKU",async()=>{
  let data=report();data.items[0].currentStock=0;assert.equal((await read(data)).rows[0].currentStock,0);
  assert.equal((await read(report([]))).result,"no_match");assert.equal((await read(report([row("other","Άλλο","OTHER")]))).result,"no_match");
  const exact=await read(report([row(),row("p2","ΝΕΡΟ άλλο","22690")]));assert.equal(exact.rows[0].productId,"p");
  const lookup=async(items)=>readCanonicalOwnerStock(req,{product:"νερο"},scope,{fetchImpl:async()=>({ok:true,json:async()=>report(items)})});
  for(const rows of [[row(),row("p2","ΝΕΡΟ 500ML","OTHER")],[row(),row()]]){const e=await lookup(rows);assert.equal(e.result,"ambiguous");assert.equal(e.rows.length,0);assert.ok(e.candidates.length>0);assert.equal(Object.hasOwn(e.candidates[0],"currentStock"),false)}
  const decimal=report();decimal.items[0].unit="KG";decimal.items[0].currentStock=0.125;assert.equal((await read(decimal)).rows[0].currentStock,0.125);
});
test("stock cap never proves absence/uniqueness and candidates carry no quantity or costs",async()=>{
  const e=await read(report(Array.from({length:10000},(_,i)=>row(`p${i}`,`ΝΕΡΟ ${i}`,String(i)))));assert.equal(e.result,"source_limited");assert.equal(e.rows.length,0);assert.equal(e.truncated,true);
  const candidates=await read(report(Array.from({length:21},(_,i)=>row(`p${i}`,`ΝΕΡΟ ${i}`,`2269-${i}`))));assert.equal(candidates.result,"ambiguous");assert.equal(candidates.candidateCount,21);assert.equal(candidates.candidates.length,20);assert.equal(candidates.truncated,true);assert.doesNotMatch(JSON.stringify(candidates.candidates),/currentStock|purchasePrice|PRIVATE/);
});
test("stock rejects foreign rows, malformed identities/quantities/units and source/session failures without fabrication",async()=>{
  for(const mutate of [r=>r.items[0].storeId="foreign",r=>r.count=2,r=>r.items=null,r=>r.items[0]=null,r=>r.items[0].productId="",r=>r.items[0].sku=42,r=>r.items[0].name="",r=>r.items[0].unit="UNKNOWN",r=>r.items[0].currentStock=null,r=>r.items[0].currentStock="0",r=>r.items[0].currentStock=Infinity]){const data=report();mutate(data);await deny(read(data),502)}
  for(const status of [401,403,404,500])await deny(read(report(),{fetchImpl:async()=>({ok:false,status})}),status===500?502:status);
  let calls=0;const fetchImpl=async()=>calls++;await deny(readCanonicalOwnerStock({...req,headers:{}},args,scope,{fetchImpl}),401);await deny(read(report(),{fetchImpl,port:"8080/remote"}),503);await deny(readCanonicalOwnerStock(req,args,{...scope,storeId:""},{fetchImpl}),502);assert.equal(calls,0);
  const aborted=Object.assign(Error("aborted"),{name:"AbortError"});await assert.rejects(read(report(),{fetchImpl:async()=>{throw aborted}}),error=>error===aborted);
});
const toolCall={type:"function_call",name:"stock_by_product",call_id:"stock",arguments:JSON.stringify(args)};
const answer=()=>({response:{ok:true},raw:{output_text:JSON.stringify({answer:"Fixture stock",highlights:[],limitations:"Recorded only"})}});
test("stock dispatch preserves reasoning, rejects missing capability/extra scope and shares the global two-read budget",async()=>{
  const tools=[ownerCashTool,ownerStockTool];let providers=0,reads=0;
  const out=await runOwnerAssistant({prompt:"Fixture",cashTool:ownerCashTool,tools,readStock:async a=>{assert.deepEqual(a,args);reads++;return {kind:"product_stock"}},requestProvider:async settings=>{if(++providers===1)return {response:{ok:true},raw:{output:[{type:"reasoning",id:"r"},toolCall]}};assert.equal(settings.input[1].id,"r");assert.equal(settings.input[3].type,"function_call_output");return answer()}});assert.equal(reads,1);assert.equal(out.evidence[0].kind,"product_stock");
  for(const output of [[toolCall,toolCall],[{...toolCall,arguments:JSON.stringify({...args,storeId:"foreign"})}],[{...toolCall,name:"adjust_stock"}]]){let reads=0;await assert.rejects(runOwnerAssistant({prompt:"Fixture",cashTool:ownerCashTool,tools,readStock:async()=>reads++,requestProvider:async()=>({response:{ok:true},raw:{output}})}));assert.equal(reads,0)}
  let deniedReads=0;await deny(runOwnerAssistant({prompt:"Fixture",cashTool:ownerCashTool,tools:[ownerCashTool],readStock:async()=>deniedReads++,requestProvider:async()=>({response:{ok:true},raw:{output:[toolCall]}})}),502);assert.equal(deniedReads,0);
  providers=0;reads=0;await deny(runOwnerAssistant({prompt:"Fixture",cashTool:ownerCashTool,tools,readStock:async()=>{reads++;return {}},readCash:async()=>{reads++;return {}},requestProvider:async settings=>{providers++;if(providers===3)assert.equal(settings.tool_choice,"none");return {response:{ok:true},raw:{output:[providers===2?{...toolCall,name:"cash_details",arguments:'{"date":null}'}:toolCall]}}}}),502);assert.equal(providers,3);assert.equal(reads,2);
});
test("stock catalog uses the existing INVENTORY gate and handler rechecks every read/provider/final boundary",async()=>{
  let status;const h=createOwnerAssistantHandlers({authorize:async(r,o)=>{if(o.requiredModules.includes("INVENTORY"))throw Object.assign(Error("disabled"),{code:"MODULE_DISABLED",status:403});return scope},requestProvider:async()=>answer()});await h.status({...req,query:{}},{json:v=>status=v},e=>{throw e});assert.deepEqual(status.supported,["cash_details","business_records"]);
  for(const boundary of [5,6,7,8]){let auth=0,providers=0,reads=0,out,err;const h=createOwnerAssistantHandlers({authorize:async(r,o)=>{auth++;if(auth===boundary)throw Object.assign(Error("revoked"),{status:403});if(auth>=5)assert.deepEqual(o.requiredModules,["INVENTORY"]);return scope},requestProvider:async()=>++providers===1?{response:{ok:true},raw:{output:[toolCall]}}:answer(),readStock:async()=>{reads++;return {kind:"product_stock"}}});await h.ask({...req,body:{question:"Πόσο απόθεμα έχει το SKU2269;"}},{json:v=>out=v,status(){return this}},e=>err=e);assert.equal(out,undefined);assert.equal(err.status,403);if(boundary===5)assert.equal(reads,0)}
  let auth=0,providers=0,out,err;const h2=createOwnerAssistantHandlers({authorize:async()=>++auth===6?{...scope,storeId:"changed"}:scope,requestProvider:async()=>++providers===1?{response:{ok:true},raw:{output:[toolCall]}}:answer(),readStock:async()=>({kind:"product_stock"})});await h2.ask({...req,body:{question:"Απόθεμα 2269"}},{json:v=>out=v,status(){return this}},e=>err=e);assert.equal(out,undefined);assert.equal(err.code,"OWNER_ASSISTANT_CONTEXT_CHANGED");assert.equal(providers,1);
});
test("existing canonical stock HTTP route enforces own active store, parameterized company/store and numeric contract",async()=>{
  const originalQuery=prisma.$queryRaw,originalStore=prisma.store.findFirst,queries=[];
  prisma.store.findFirst=async({where})=>where.id==="s"&&where.companyId==="c"&&where.active?{id:"s"}:null;
  prisma.$queryRaw=async(strings,...values)=>{queries.push({sql:strings.join("?"),values});return [row()]};
  const app=express();app.use((request,response,next)=>{request.user=req.user;next()});app.use("/api/reports",stockRouter);app.use((error,request,response,next)=>response.status(error.status||500).json({error:error.message}));
  const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));const base=`http://127.0.0.1:${server.address().port}/api/reports/stock-analysis`;
  try{const response=await fetch(`${base}?storeId=s&q=2269&from=2026-10-11&to=2026-10-11`);assert.equal(response.status,200);const r=await response.json();assert.equal(r.count,1);assert.equal(r.items[0].currentStock,-2.125);assert.match(queries[0].sql,/s\."companyId"=\?/);assert.match(queries[0].sql,/p\."companyId"=\?/);assert.match(queries[0].sql,/sp\."storeId"=\?/);assert.ok(queries[0].values.includes("c"));assert.ok(queries[0].values.includes("s"));assert.ok(queries[0].values.includes("%2269%"));const before=queries.length;assert.equal((await fetch(`${base}?storeId=foreign`)).status,404);assert.equal(queries.length,before);
  }finally{prisma.$queryRaw=originalQuery;prisma.store.findFirst=originalStore;await new Promise(resolve=>server.close(resolve))}
});
