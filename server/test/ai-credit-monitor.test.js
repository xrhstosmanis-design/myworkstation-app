import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {createCreditMonitor,creditSummary,creditKeyIdentity,readOrganizationCosts,CREDIT_DEFAULTS} from "../src/services/ai-credit-monitor.js";
import {createAiCreditRoutes} from "../src/routes/platform-ai-credits.js";

const key="synthetic-test-key",identity=creditKeyIdentity(key),epoch=Date.parse("2026-10-09T12:00:00Z");
const response=(value,extra={})=>({ok:true,json:async()=>({data:[{results:[{object:"organization.costs.result",amount:{currency:"usd",value}}]}],has_more:false,...extra})});
const initial={...CREDIT_DEFAULTS,balanceUsd:10,baselineCostUsd:3,startTime:1791504000,keyIdentity:identity,baselineAt:new Date(epoch).toISOString()};
const summary=(totalUsd,extra={})=>creditSummary(initial,{totalUsd,checkedAt:new Date(epoch).toISOString(),...extra},{now:epoch,keyIdentity:identity});
function fixture(){
  let time=epoch,stored={...initial},keyValue=key,calls=0,cost=3,failure=false;
  const audits=[];
  const monitor=createCreditMonitor({now:()=>time,getKey:()=>keyValue,repository:{read:async()=>({...stored}),save:async(next,version,actor)=>{
    if(version!==stored.version)throw Object.assign(new Error("conflict"),{code:"CREDIT_SETTINGS_CONFLICT",status:409});
    stored={...next,version:version+1};audits.push(actor);
  }},fetchImpl:async()=>{calls++;if(failure)throw Error("SECRET must not escape");return response(cost)}});
  return {monitor,audits,setTime:value=>time=value,setCost:value=>cost=value,setKey:value=>keyValue=value,setFailure:()=>failure=true,get calls(){return calls},get stored(){return stored}};
}

test("credit states preserve exact boundary, negative balance, and cents",()=>{
  for(const [cost,state,balance] of [[3,"OK",10],[8,"WARNING",5],[11,"CRITICAL",2],[13,"EXHAUSTED",0],[13.12,"EXHAUSTED",-.12]]){
    const result=summary(cost);assert.equal(result.state,state);assert.equal(result.balanceUsd,balance);assert.equal(result.estimated,true);
  }
});
test("missing configuration and baseline are unknown, never zero or green",()=>{
  const result=creditSummary({},null,{now:epoch});assert.equal(result.state,"UNKNOWN");assert.equal(result.balanceUsd,null);assert.equal(result.code,"BILLING_NOT_CONFIGURED");
  assert.equal(creditSummary({},null,{now:epoch,keyIdentity:identity}).code,"BASELINE_REQUIRED");
});
test("stale baseline, changed account, stale costs and billing revisions never show green",()=>{
  assert.equal(creditSummary(initial,null,{now:epoch+8*86400_000,keyIdentity:identity}).code,"BASELINE_STALE");
  assert.equal(creditSummary(initial,null,{now:epoch,keyIdentity:"changed"}).code,"BILLING_ACCOUNT_CHANGED");
  assert.equal(summary(2).code,"BILLING_REVISED");
  assert.equal(summary(3,{checkedAt:new Date(epoch-300001).toISOString()}).code,"BILLING_STALE");
  assert.equal(summary(3,{error:"BILLING_UNAVAILABLE"}).balanceUsd,null);
});
test("Costs follows every page, includes all-organization spend, and uses GET without redirects",async()=>{
  const requests=[];
  const total=await readOrganizationCosts({key,startTime:100,endTime:200,fetchImpl:async(url,options)=>{
    requests.push({url,options});return requests.length===1?response(4,{has_more:true,next_page:"second"}):response(2);
  }});
  assert.equal(total,6);assert.equal(requests.length,2);
  for(const req of requests){const url=new URL(req.url);assert.equal(url.origin,"https://api.openai.com");assert.equal(url.searchParams.has("project_ids"),false);assert.equal(req.options.redirect,"error");assert.equal(req.options.body,undefined)}
  assert.equal(new URL(requests[1].url).searchParams.get("page"),"second");
});
test("partial, malformed, non-dollar, repeated cursors and unauthorized costs fail closed",async()=>{
  for(const fetchImpl of [async()=>({ok:false,status:403}),async()=>({ok:true,json:async()=>({data:[]})}),async()=>response(1,{has_more:true,next_page:"repeat"}),async()=>({ok:true,json:async()=>({data:[{results:[{amount:{value:1,currency:"eur"}}]}],has_more:false})})]){
    await assert.rejects(readOrganizationCosts({key,startTime:100,endTime:200,fetchImpl}));
  }
});
test("parallel reads coalesce and cache; next provider failure hides the old number",async()=>{
  const f=fixture();await Promise.all([f.monitor.status(),f.monitor.status(),f.monitor.status()]);assert.equal(f.calls,1);
  await f.monitor.status();assert.equal(f.calls,1);
  f.setTime(epoch+300001);f.setFailure();const result=await f.monitor.status();assert.equal(result.state,"UNKNOWN");assert.equal(result.balanceUsd,null);
  await f.monitor.status();assert.equal(f.calls,2);assert.doesNotMatch(JSON.stringify(result),/SECRET|synthetic-test-key/);
});
test("balance observation snapshots today's cost and deducts only subsequent spend",async()=>{
  const f=fixture();f.setCost(7);
  const result=await f.monitor.save({warningUsd:5,criticalUsd:2,version:0,balanceUsd:20,accountConfirmed:true},{id:"actor"});
  assert.equal(result.balanceUsd,20);assert.equal(result.version,1);assert.equal(f.stored.baselineCostUsd,7);assert.equal(f.audits.length,1);
  f.setTime(epoch+300001);f.setCost(10);assert.equal((await f.monitor.status()).balanceUsd,17);
});
test("threshold-only update preserves balance baseline and requires a fresh settings version",async()=>{
  const f=fixture();await f.monitor.save({warningUsd:7,criticalUsd:3,version:0},{id:"actor"});
  assert.equal(f.stored.baselineAt,initial.baselineAt);assert.equal(f.stored.balanceUsd,10);
  await assert.rejects(f.monitor.save({warningUsd:7,criticalUsd:3,version:0},{id:"actor"}),error=>error.code==="CREDIT_SETTINGS_CONFLICT");
});
test("invalid bounds or unconfirmed baseline never write",async()=>{
  const f=fixture();
  for(const values of [{warningUsd:2,criticalUsd:5,version:0},{warningUsd:5,criticalUsd:2,version:0,balanceUsd:20},{warningUsd:5,criticalUsd:2,version:0,balanceUsd:NaN,accountConfirmed:true}])await assert.rejects(f.monitor.save(values,{id:"actor"}));
  assert.equal(f.audits.length,0);
});
test("missing billing key or failed baseline fetch cannot commit a misleading balance",async()=>{
  for(const configured of [false,true]){const f=fixture();if(configured)f.setFailure();else f.setKey("");await assert.rejects(f.monitor.save({warningUsd:5,criticalUsd:2,version:0,balanceUsd:10,accountConfirmed:true},{id:"actor"}));assert.equal(f.audits.length,0)}
});

test("HTTP central roles only: no anonymous, owner, employee or role-string access; validated writes and safe failures",async t=>{
  const f=fixture(),app=express();app.use(express.json());
  app.use((req,_res,next)=>{const role=req.headers["x-test-role"];req.user=role==="central"?{id:"central",isSuperAdmin:true}:role?{id:"ordinary",role}:null;next()});
  app.use("/ai-credits",createAiCreditRoutes(f.monitor));
  const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}/ai-credits`;
  for(const role of ["","OWNER","EMPLOYEE","SUPER_ADMIN"]){const res=await fetch(url,{headers:{"x-test-role":role}});assert.equal(res.status,403)}
  assert.equal(f.calls,0);
  const allowed=await fetch(url,{headers:{"x-test-role":"central"}});assert.equal(allowed.status,200);assert.equal(allowed.headers.get("cache-control"),"no-store");
  const headers={"x-test-role":"central","content-type":"application/json"};
  assert.equal((await fetch(url,{method:"PUT",headers,body:JSON.stringify({warningUsd:5,criticalUsd:2,version:0,apiKey:"must-not-accept"})})).status,400);
  const saved=await fetch(url,{method:"PUT",headers,body:JSON.stringify({warningUsd:7,criticalUsd:3,version:0})});assert.equal(saved.status,200);
  assert.equal((await fetch(url,{method:"PUT",headers,body:JSON.stringify({warningUsd:7,criticalUsd:3,version:0})})).status,409);
  assert.equal(f.audits.length,1);
});
