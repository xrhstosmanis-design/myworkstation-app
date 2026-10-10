import test from "node:test";
import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {createServer} from "node:http";
import {n40ReadHeaders,n40ReadRecord,N40_LAB_STORE} from "../../shared/n40-read-trace.mjs";
import {createN40ReadTrace} from "../src/n40-read-trace.js";
const scope={companyId:"company-lab",storeId:N40_LAB_STORE},id="n40-"+"a".repeat(32);
const uuid=()=>"a".repeat(32);
test("only target-LAB relative API GETs can acquire trace headers",()=>{
  assert.equal(n40ReadHeaders("/api/platform/cash-control",scope,"POST",uuid),null);
  assert.equal(n40ReadHeaders("/api/platform/cash-control",{...scope,storeId:"another-store"},"GET",uuid),null);
  assert.equal(n40ReadHeaders("https://foreign.invalid/api/platform",scope,"GET",uuid),null);
  assert.equal(n40ReadHeaders("//foreign.invalid/api/platform",scope,"GET",uuid),null);
  assert.equal(n40ReadHeaders("/api/platform",{storeId:N40_LAB_STORE},"GET",uuid),null);
  assert.equal(n40ReadHeaders("/api/platform",scope,"GET",()=>{throw Error("unavailable")}),null);
  assert.equal(n40ReadHeaders("/api/platform",scope,"GET",uuid).headers["X-MWS-N40-Trace"],id);
});
test("metadata excludes personal path values, query text, tokens and payloads",()=>{
  const path="/api/platform/companies/company-lab/stores/"+N40_LAB_STORE+"/employees/private-person?storeId="+N40_LAB_STORE+"&email=private%40example.invalid&token=secret-value&search=secret-name";
  const record=n40ReadRecord(path,scope,id,403,{role:"EMPLOYEE",email:"private@example.invalid",token:"secret-value",supportContext:{storeId:N40_LAB_STORE}});
  const encoded=JSON.stringify(record);
  for(const privateValue of ["private-person","private@example.invalid","secret-value","secret-name","email","token","search"])assert.equal(encoded.includes(privateValue),false);
  assert.equal(record.storeMatches,true);assert.equal(record.companyMatches,true);assert.equal(record.status,403);assert.equal(record.role,"EMPLOYEE");
});
test("ambiguous and foreign store scope remains visible without logging query content",()=>{
  const record=n40ReadRecord("/api/platform/report?storeId="+N40_LAB_STORE+"&storeId=foreign-store",scope,id,200);
  assert.deepEqual(record.storeIds,[N40_LAB_STORE,"foreign-store"]);assert.equal(record.storeMatches,false);
  assert.equal(n40ReadRecord("/api/platform/report",scope,id,200).storeMatches,null);
  assert.equal(n40ReadRecord("/api/platform/report",scope,"bad",200),null);
  const invalid=n40ReadRecord("/api/platform/report?storeId=private%40email.invalid",scope,id,200);
  assert.equal(invalid.storeMatches,false);assert.equal(invalid.storeScopeInvalid,true);assert.equal(JSON.stringify(invalid).includes("private"),false);
});
test("server completion records real status after middleware, does not alter request or response",()=>{
  const logs=[],middleware=createN40ReadTrace({log:(...args)=>logs.push(args),now:()=>100000});
  const req={method:"GET",originalUrl:"/api/platform/report?storeId="+N40_LAB_STORE,headers:{"x-mws-n40-store":N40_LAB_STORE,"x-mws-n40-company":scope.companyId,"x-mws-n40-trace":id,authorization:"Bearer never-log"},body:{pin:"never-log"}};
  const res=new EventEmitter();res.statusCode=200;let next=0;
  middleware(req,res,()=>next++);assert.equal(logs.length,0);assert.equal(next,1);
  req.user={role:"EMPLOYEE"};res.statusCode=403;res.emit("finish");
  assert.equal(logs.length,1);const record=JSON.parse(logs[0][1]);assert.equal(record.status,403);assert.equal(record.role,"EMPLOYEE");assert.equal(record.side,"server");assert.equal(JSON.stringify(logs).includes("never-log"),false);
  assert.equal(res.statusCode,403);assert.equal(req.headers.authorization,"Bearer never-log");
});
test("writes, ordinary requests and log failures never alter authorization flow",()=>{
  const middleware=createN40ReadTrace({log:()=>{throw Error("sink failed")},now:()=>100000});
  for(const method of ["POST","PATCH","DELETE"]){const res=new EventEmitter();let next=0;middleware({method,url:"/api/platform",headers:{}},res,()=>next++);assert.equal(next,1);assert.equal(res.listenerCount("finish"),0)}
  const res=new EventEmitter();res.statusCode=401;let next=0;middleware({method:"GET",url:"/api/platform",headers:{"x-mws-n40-store":N40_LAB_STORE,"x-mws-n40-company":scope.companyId,"x-mws-n40-trace":id}},res,()=>next++);assert.doesNotThrow(()=>res.emit("finish"));assert.equal(next,1);
});
test("legacy support readers are observed only after authenticated Super Admin target-LAB context",()=>{
  const logs=[],middleware=createN40ReadTrace({log:(...args)=>logs.push(args)});
  const send=user=>{const req={method:"GET",url:"/api/platform/report",headers:{}};const res=new EventEmitter();res.statusCode=200;middleware(req,res,()=>{});req.user=user;res.emit("finish")};
  send(null);send({role:"OWNER",supportContext:scope});send({tokenType:"BACKOFFICE_USER",isSuperAdmin:true,companyId:scope.companyId,supportContext:{...scope,storeId:"other-store"}});send({tokenType:"BACKOFFICE_USER",isSuperAdmin:true,companyId:"different-company",supportContext:scope});assert.equal(logs.length,0);
  send({tokenType:"BACKOFFICE_USER",isSuperAdmin:true,platformRole:"SUPER_ADMIN",companyId:scope.companyId,supportContext:scope});assert.equal(logs.length,1);const record=JSON.parse(logs[0][1]);assert.equal(record.source,"authenticated-support-context");assert.equal(record.expectedStoreId,N40_LAB_STORE);assert.equal(record.role,"SUPER_ADMIN");
});
test("server diagnostic emission is bounded and resets without blocking requests",()=>{
  const logs=[];let clock=100000,next=0;const middleware=createN40ReadTrace({log:(...args)=>logs.push(args),now:()=>clock,limit:2});
  const send=()=>{const res=new EventEmitter();res.statusCode=200;middleware({method:"GET",url:"/api/platform",headers:{"x-mws-n40-store":N40_LAB_STORE,"x-mws-n40-company":scope.companyId,"x-mws-n40-trace":id}},res,()=>next++);res.emit("finish")};
  send();send();send();assert.equal(logs.length,2);assert.equal(next,3);clock+=60000;send();assert.equal(logs.length,3);assert.equal(next,4);
});
test("legacy support polling cannot consume the correlated Twin request budget",()=>{
  const logs=[];let next=0,clock=100000;
  const middleware=createN40ReadTrace({log:(...args)=>logs.push(JSON.parse(args[1])),now:()=>clock,limit:2,legacyLimit:1});
  const send=correlated=>{const res=new EventEmitter();res.statusCode=200;middleware({method:"GET",url:"/api/platform/report?storeId="+N40_LAB_STORE,headers:correlated?n40ReadHeaders("/api/platform/report",scope,"GET",uuid).headers:{} ,user:{tokenType:"BACKOFFICE_USER",isSuperAdmin:true,companyId:scope.companyId,supportContext:scope}},res,()=>next++);res.emit("finish")};
  // Node header names match the real HTTP boundary's lowercase representation.
  const headerSend=()=>{const res=new EventEmitter();res.statusCode=200;middleware({method:"GET",url:"/api/platform/report",headers:{"x-mws-n40-store":N40_LAB_STORE,"x-mws-n40-company":scope.companyId,"x-mws-n40-trace":id}},res,()=>next++);res.emit("finish")};
  for(let i=0;i<100;i++)send(false);headerSend();headerSend();headerSend();
  assert.equal(logs.filter(x=>x.source==="authenticated-support-context").length,1);assert.equal(logs.filter(x=>x.source==="correlation-header").length,2);assert.equal(next,103);
  clock+=60000;send(false);headerSend();assert.equal(logs.length,5);assert.equal(next,105);
});
test("real local HTTP response retains denial and correlates only sanitized GET metadata",async()=>{
  const logs=[],middleware=createN40ReadTrace({log:(...args)=>logs.push(args)});
  const server=createServer((req,res)=>middleware(req,res,()=>{res.statusCode=403;res.end("ordinary-denial-body")}));
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/platform/report?storeId=${N40_LAB_STORE}&search=private-search`,{headers:n40ReadHeaders("/api/platform/report",scope,"GET",uuid).headers});
    assert.equal(response.status,403);assert.equal(await response.text(),"ordinary-denial-body");
    assert.equal(logs.length,1);const record=JSON.parse(logs[0][1]);assert.equal(record.traceId,id);assert.equal(record.status,403);assert.equal(record.storeMatches,true);assert.equal(JSON.stringify(logs).includes("private-search"),false);assert.equal(JSON.stringify(logs).includes("ordinary-denial-body"),false);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
