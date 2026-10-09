import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import webpush from "web-push";
import {isCustomerDemoTenant,containsCustomerDemoIdentifier,assertCustomerDemoRuntimeClosed} from "../src/customer-demo-runtime.js";
import {blockCustomerDemoRequest} from "../src/middleware/customer-demo-runtime.js";
import {auth} from "../src/middleware/auth.js";
import {sendEmail,sendCashControlDailyReportEmail} from "../src/services/mail.js";
import {sendStoreChatPush,saveStoreChatPushSubscription} from "../src/store-chat-push.js";
import {NetlinkClient,netlinkClient,resetNetlinkClient} from "../src/integrations/netlink/client.js";
import {readPosInvoiceWithAssistant} from "../src/lib/pos-invoice-assistant-reading.js";
import {fetchOriginalPdf,acquireOriginal} from "../src/mydata-original.js";
import {enqueueVideoCommand} from "../src/services/video-connector-commands.js";
import {recordEfoodWebhookEvent} from "../src/routes/efood-pelican-webhook.js";

const demo={companyId:"customer-demo-11111111-1111-4111-8111-111111111111",storeId:"customer-demo-store-11111111-1111-4111-8111-111111111111"};
const ordinary={companyId:"ordinary-company",storeId:"ordinary-store"};
const blocked=e=>e?.status===403&&e?.code==="CUSTOMER_DEMO_OUTBOUND_BLOCKED";
function response(){return {statusCode:200,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}}}
function request(method,path,body={},query={}){const res=response();let calls=0;blockCustomerDemoRequest({method,originalUrl:path,body,query},res,()=>calls++);return {res,calls}}

test("runtime stays closed for every lifecycle/flag, malformed reserved namespace and either tenant identifier",()=>{
  for(const status of ["PREPARED","ACTIVE","EXPIRED","REVOKED",null]){
    assert.throws(()=>assertCustomerDemoRuntimeClosed({...demo,status,installable:true,active:true}),e=>e.code==="CUSTOMER_DEMO_RUNTIME_LOCKED");
  }
  assert.ok(isCustomerDemoTenant({storeId:demo.storeId}));
  assert.ok(isCustomerDemoTenant({companyId:" CUSTOMER-DEMO-broken-id "}));
  assert.equal(isCustomerDemoTenant(ordinary),false);
  assert.doesNotThrow(()=>assertCustomerDemoRuntimeClosed(ordinary));
  const cycle={safe:true};cycle.self=cycle;
  assert.equal(containsCustomerDemoIdentifier(cycle),false);
  let tree={target:demo.storeId};for(let i=0;i<20000;i++)tree={next:tree};
  assert.equal(containsCustomerDemoIdentifier(tree),true);
});

test("every method and public/device/unknown path rejects demo identifiers before handler execution",()=>{
  for(const method of ["GET","HEAD","OPTIONS","POST","PUT","PATCH","DELETE"]){
    for(const path of [`/api/store-pos/stores/${demo.storeId}/checkout`,`/api/unknown/${demo.companyId}`,`/api/public/online/${demo.storeId}`,`/mobile-invoice-upload/${demo.companyId}/opaque`]){
      const result=request(method,path);assert.equal(result.calls,0);assert.equal(result.res.statusCode,403);
    }
  }
  for(const [body,query] of [[{a:[{b:demo.companyId}]},{}],[{}, {storeId:demo.storeId}],[{[demo.companyId]:true},{}]])assert.equal(request("POST","/api/unknown",body,query).calls,0);
  assert.equal(request("POST",`/api/store-pos/stores/%63ustomer-demo-store-${demo.storeId.slice(20)}/checkout`).calls,0);
  assert.equal(request("GET","/api/%ZZ").res.statusCode,400);
  assert.equal(request("PATCH",`/api/platform/companies/${demo.companyId}`).res.statusCode,409);
  assert.equal(request("GET",`/api/platform/companies/${demo.companyId}`).res.statusCode,403);
});

test("ordinary requests and only the exact preparation API proceed to their existing auth/schema handlers",()=>{
  for(const method of ["GET","POST","PATCH","DELETE"])assert.equal(request(method,`/api/ordinary/${ordinary.storeId}`,ordinary).calls,1);
  assert.equal(request("POST","/api/platform/customer-demos",{displayName:"Demo",requestKey:"11111111-1111-4111-8111-111111111111"}).calls,1);
  assert.equal(request("POST","/api/platform/customer-demos/11111111-1111-4111-8111-111111111111/revoke").calls,1);
  assert.equal(request("GET",`/api/platform/customer-demos/extra/${demo.companyId}`).calls,0);
});

test("signed demo owner/operator/device/background/SA claims cannot reach handlers without a body or path identifier",async t=>{
  const old=process.env.JWT_SECRET;process.env.JWT_SECRET="isolated-demo-runtime-unit-secret";
  t.after(()=>{if(old===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=old});
  for(const tokenType of ["BACKOFFICE_USER","STORE_OPERATOR","WORKFORCE_MOBILE","POS_BACKGROUND","STORE_DEVICE",undefined]){
    for(const role of ["OWNER","EMPLOYEE","SUPER_ADMIN"]){
      const token=jwt.sign({...demo,tokenType,role,isSuperAdmin:true,sessionId:"nonexistent",sessionVersion:0},process.env.JWT_SECRET);
      const res=response();let calls=0;await auth({headers:{authorization:`Bearer ${token}`},originalUrl:"/api/netlink/menu",method:"GET"},res,()=>calls++);
      assert.equal(calls,0);assert.equal(res.statusCode,403);assert.equal(res.body.code,"CUSTOMER_DEMO_RUNTIME_LOCKED");
    }
  }
});

test("demo SMTP and Push are rejected before constructing a transport or accessing subscriptions; ordinary SMTP is unchanged",async t=>{
  const saved={createTransport:nodemailer.createTransport,push:webpush.sendNotification,env:{...process.env}};
  let mails=0,pushes=0,transports=0;
  nodemailer.createTransport=()=>{transports++;return {sendMail:async payload=>{mails++;assert.match(payload.subject,/fixture/);return {messageId:"fixture-only"}}}};
  webpush.sendNotification=async()=>{pushes++};
  Object.assign(process.env,{SMTP_HOST:"fixture.invalid",SMTP_USER:"fixture",SMTP_PASSWORD:"fixture",MAIL_FROM:"fixture@example.invalid",MAIL_TEST_RECIPIENT:"fixture@example.invalid"});
  t.after(()=>{nodemailer.createTransport=saved.createTransport;webpush.sendNotification=saved.push;for(const k of Object.keys(process.env))if(!(k in saved.env))delete process.env[k];Object.assign(process.env,saved.env)});
  await assert.rejects(sendEmail({...demo,to:"fixture@example.invalid",subject:"fixture",text:"fixture"}),blocked);
  await assert.rejects(sendCashControlDailyReportEmail({...demo,to:"fixture@example.invalid",storeName:"fixture",date:"2026-10-09",rows:[],comment:"",auditorName:"fixture"}),blocked);
  const store={id:demo.storeId,companyId:demo.companyId,name:"fixture"};
  await assert.rejects(sendStoreChatPush({store,senderId:"fixture"}),blocked);
  await assert.rejects(saveStoreChatPushSubscription({store,user:{id:"fixture"},subscription:{}}),blocked);
  assert.deepEqual({mails,pushes,transports},{mails:0,pushes:0,transports:0});
  assert.equal((await sendEmail({...ordinary,to:"fixture@example.invalid",subject:"fixture",text:"fixture"})).messageId,"fixture-only");
  assert.deepEqual({mails,pushes,transports},{mails:1,pushes:0,transports:1});
});

test("cached Netlink client and direct provider services cannot execute demo work; ordinary adapter still sends its same requests",async t=>{
  const original=globalThis.fetch;let calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,status:200,text:async()=>JSON.stringify(url.endsWith("/token")?{access_token:"fixture",expires_in:300}:{fixture:true})}};
  t.after(()=>{globalThis.fetch=original;resetNetlinkClient()});
  const config={...ordinary,tokenUrl:"https://fixture.invalid/token",apiBase:"https://fixture.invalid",clientId:"fixture",clientSecret:"fixture",username:"fixture",password:"fixture"};
  const client=new NetlinkClient(config);
  assert.deepEqual(await client.menu(),{fixture:true});assert.equal(calls.length,2);calls=[];
  assert.throws(()=>new NetlinkClient({...config,...demo}),blocked);
  assert.throws(()=>netlinkClient(demo),blocked);
  const noDatabase=new Proxy({},{get(){throw new Error("Database must not be accessed")}});
  await assert.rejects(readPosInvoiceWithAssistant({...demo,pageJobIds:["opaque"],totalGross:1}),blocked);
  await assert.rejects(fetchOriginalPdf({...demo,rawPayload:{}},globalThis.fetch),blocked);
  await assert.rejects(acquireOriginal(noDatabase,demo.companyId,demo.storeId,"opaque",null,true),blocked);
  await assert.rejects(enqueueVideoCommand({...demo,commandType:"HEALTH"},noDatabase),blocked);
  await assert.rejects(recordEfoodWebhookEvent({integration:demo,payload:{},database:noDatabase}),blocked);
  assert.equal(calls.length,0);
});
