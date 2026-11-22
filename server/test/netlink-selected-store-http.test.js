import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {encryptStoreIntegrationValue} from "../src/integrations/store-integration-crypto.js";

test("ordinary status/menu bind the selected authorized store, never global credentials or another operator's station",async t=>{
  const changes={INTEGRATION_CREDENTIALS_KEY:"synthetic-http-key",NETLINK_TOKEN_URL:"https://fixture.invalid/token",NETLINK_API_BASE:"https://fixture.invalid",NETLINK_CLIENT_ID:"app",NETLINK_CLIENT_SECRET:"app-secret",NETLINK_USERNAME:"global-must-not-be-used",NETLINK_PASSWORD:"global-must-not-be-used",NETLINK_STATION_ID:"global-must-not-be-used",NETLINK_MOCK_PROVIDER:"false"};
  const previous=Object.fromEntries(Object.keys(changes).map(k=>[k,process.env[k]])),oldPrisma=globalThis.prisma,originalFetch=globalThis.fetch;
  Object.assign(process.env,changes);
  const external=[],records=new Map(["A","B"].map(id=>[id,{credentialsEnc:encryptStoreIntegrationValue({username:"user-"+id,password:"pass-"+id}),stationId:"station-"+id,enabled:true}]));
  globalThis.prisma={store:{findFirst:async({where})=>where.companyId==="company"&&records.has(where.id)?{id:where.id,companyId:"company",name:where.id}:null},$queryRaw:async(strings,...values)=>values[0]==="company"&&records.has(values[1])?[records.get(values[1])]:[]};
  globalThis.fetch=async(url,options={})=>{
    if(String(url).startsWith("http://127.0.0.1:"))return originalFetch(url,options);
    external.push({url,options});
    return new Response(JSON.stringify(String(url).endsWith("/token")?{access_token:options.body.get("username"),expires_in:300}:{station:options.headers["X-Station-Id"],token:options.headers.Authorization}));
  };
  let server;
  t.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));globalThis.fetch=originalFetch;globalThis.prisma=oldPrisma;for(const [key,value] of Object.entries(previous))value===undefined?delete process.env[key]:process.env[key]=value});
  const {default:router}=await import("../src/routes/netlink.js");
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={companyId:"company",role:"OWNER",...(req.headers["x-test-operator"]?{tokenType:"STORE_OPERATOR",storeId:"A"}:{storeId:req.headers["x-test-token-store"]})};next()});app.use(router);app.use((error,req,res,next)=>res.status(error.status||(error.name==="ZodError"?400:500)).json({error:error.message,code:error.code}));
  server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
  const get=async(path,headers={})=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{headers});return {status:response.status,body:await response.json()}};
  assert.equal((await get("/status")).body.configured,false);assert.equal((await get("/menu")).status,400);
  assert.equal((await get("/status?storeId=")).status,400);assert.equal((await get("/status?storeId=A&storeId=B")).status,400);
  assert.equal((await get("/menu?storeId=foreign")).status,404);
  assert.equal((await get("/menu?storeId=B",{"x-test-operator":"true"})).status,403);assert.equal(external.length,0);
  assert.equal((await get("/status?storeId=B",{"x-test-token-store":"A"})).body.configured,true);
  assert.deepEqual((await get("/menu?storeId=B",{"x-test-token-store":"A"})).body,{station:"station-B",token:"Bearer user-B"});
  assert.deepEqual((await get("/menu?storeId=A",{"x-test-operator":"true"})).body,{station:"station-A",token:"Bearer user-A"});
  const count=external.length;records.get("B").enabled=false;assert.equal((await get("/status?storeId=B")).body.configured,false);assert.equal((await get("/menu?storeId=B")).status,503);assert.equal(external.length,count);
  assert.ok(external.every(call=>!/prepare|execute/.test(String(call.url))));assert.ok(external.every(call=>call.options.body?.get?.("username")!=="global-must-not-be-used"));
});
