import test from "node:test";
import assert from "node:assert/strict";
import {netlinkConnectionFailure} from "../src/integrations/netlink/connection-diagnostics.js";
import {NetlinkClient} from "../src/integrations/netlink/client.js";

const config={tokenUrl:"https://provider.invalid/token",apiBase:"https://provider.invalid",clientId:"synthetic-app",clientSecret:"synthetic-app-secret",username:"synthetic-user",password:"synthetic-password",stationId:"synthetic-station"};
const failure=(error,stage="CATALOGUE")=>netlinkConnectionFailure(error,{stage,diagnosticId:"synthetic-check-id"});

test("diagnostics disclose only approved metadata, never raw provider errors, credentials or URLs",()=>{
  const error=Object.assign(new Error("synthetic-password Bearer synthetic-token https://secret.invalid"),{providerStatus:401,providerBody:{error:"synthetic-password"},netlinkCheckStage:"AUTH",stack:"synthetic-app-secret"});
  const result=failure(error);
  assert.equal(result.diagnostic.stage,"AUTH");assert.equal(result.diagnostic.reason,"AUTH_REJECTED");assert.equal(result.diagnostic.providerStatus,401);
  assert.doesNotMatch(JSON.stringify(result),/synthetic-password|synthetic-token|secret.invalid|synthetic-app-secret|providerBody|stack/);
  assert.equal(failure({providerStatus:"401",cause:{code:"synthetic-password"}}).diagnostic.providerStatus,undefined);
  assert.doesNotMatch(JSON.stringify(failure({code:"NETLINK_NOT_CONFIGURED",setting:"synthetic-password"},"CONFIG")),/synthetic-password/);
});

test("missing server configuration is distinguished from store credentials without network",()=>{
  const old=process.env.NETLINK_TOKEN_URL;delete process.env.NETLINK_TOKEN_URL;
  try{assert.throws(()=>new NetlinkClient({...config,tokenUrl:""}),error=>{
    const result=failure(error,"CONFIG");assert.equal(result.diagnostic.reason,"MISSING_SERVER_SETTING");assert.equal(result.diagnostic.setting,"NETLINK_TOKEN_URL");return true;
  })}finally{old===undefined?delete process.env.NETLINK_TOKEN_URL:process.env.NETLINK_TOKEN_URL=old}
});

test("real client identifies authentication rejection and never requests catalogue after it",async t=>{
  const old=globalThis.fetch;t.after(()=>{globalThis.fetch=old});const calls=[];
  globalThis.fetch=async(url)=>{calls.push(url);return new Response(JSON.stringify({error:"synthetic-password"}),{status:401})};
  await assert.rejects(new NetlinkClient(config).menu(),error=>{assert.equal(failure(error).diagnostic.stage,"AUTH");assert.equal(failure(error).diagnostic.providerStatus,401);return true});
  assert.deepEqual(calls,[config.tokenUrl]);
});

test("real client distinguishes catalogue rejection after successful authentication",async t=>{
  const old=globalThis.fetch;t.after(()=>{globalThis.fetch=old});const calls=[];
  globalThis.fetch=async(url)=>{calls.push(url);return url===config.tokenUrl?new Response(JSON.stringify({access_token:"synthetic-token"})):new Response(JSON.stringify({message:"synthetic-password"}),{status:403})};
  await assert.rejects(new NetlinkClient(config).menu(),error=>{assert.equal(error.netlinkCheckStage,"CATALOGUE");assert.equal(failure(error).diagnostic.providerStatus,403);return true});
  assert.deepEqual(calls,[config.tokenUrl,config.apiBase+"/menu"]);
});

test("timeouts, DNS and invalid token responses stay distinct and sanitized",async t=>{
  assert.equal(failure({name:"TimeoutError"}).diagnostic.reason,"TIMEOUT");
  assert.equal(failure({cause:{code:"ENOTFOUND"}}).diagnostic.networkCode,"ENOTFOUND");
  const old=globalThis.fetch;t.after(()=>{globalThis.fetch=old});
  globalThis.fetch=async()=>new Response(JSON.stringify({message:"synthetic-password"}));
  await assert.rejects(new NetlinkClient(config).menu(),error=>{assert.equal(failure(error).diagnostic.reason,"INVALID_TOKEN");assert.equal(failure(error).diagnostic.stage,"AUTH");return true});
});

test("mounted check preserves disabled state, role/tenant guards and safe correlated server logs",async t=>{
  const express=(await import("express")).default;
  const {createPlatformNetlinkConnectionsRouter}=await import("../src/routes/platform-netlink-connections.js");
  const {encryptStoreIntegrationValue}=await import("../src/integrations/store-integration-crypto.js");
  const old=process.env.INTEGRATION_CREDENTIALS_KEY,oldWarn=console.warn;process.env.INTEGRATION_CREDENTIALS_KEY="synthetic-key";
  t.after(()=>{console.warn=oldWarn;old===undefined?delete process.env.INTEGRATION_CREDENTIALS_KEY:process.env.INTEGRATION_CREDENTIALS_KEY=old});
  const logs=[],calls=[];console.warn=(...args)=>logs.push(args);
  const db={store:{findFirst:async({where})=>where.companyId==="fixture-company"&&where.id==="fixture-store"?{id:where.id}:null},$queryRaw:async()=>[{stationId:config.stationId,enabled:false,credentialsEnc:encryptStoreIntegrationValue(config)}]};
  const app=express();app.use((req,res,next)=>{req.user={isSuperAdmin:req.headers["x-fixture-admin"]==="yes"};next()});
  app.use(createPlatformNetlinkConnectionsRouter(db,{provider:()=>({menu:async()=>{calls.push("menu");throw Object.assign(Error("synthetic-password"),{netlinkCheckStage:"AUTH",providerStatus:401,providerBody:{token:"synthetic-token"}})}})}));
  app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
  const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}/companies/fixture-company/stores/fixture-store/netlink-connection/check`;
  assert.equal((await fetch(base,{method:"POST"})).status,403);assert.equal(calls.length,0);
  assert.equal((await fetch(base.replace("fixture-company","other"),{method:"POST",headers:{"x-fixture-admin":"yes"}})).status,404);assert.equal(calls.length,0);
  const response=await fetch(base,{method:"POST",headers:{"x-fixture-admin":"yes"}}),body=await response.json();
  assert.equal(response.status,502);assert.equal(response.headers.get("cache-control"),"no-store");assert.equal(body.code,"NETLINK_CONNECTION_CHECK_FAILED");assert.equal(body.diagnostic.stage,"AUTH");assert.equal(calls.length,1);
  const logged=JSON.parse(logs[0][1]);assert.equal(logged.diagnosticId,body.diagnostic.diagnosticId);assert.equal(logged.storeId,"fixture-store");
  assert.doesNotMatch(JSON.stringify({body,logs}),/synthetic-password|synthetic-token|synthetic-user|credentialsEnc/);
});
