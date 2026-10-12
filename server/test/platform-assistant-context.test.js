import test from "node:test";
import assert from "node:assert/strict";
import {readPlatformAssistantContext,requestPlatformAssistant,requestPlatformAssistantExport,requestPlatformAssistantStatus,watchPlatformAssistantContext} from "../../client/src/components/platform/platform-assistant-context.mjs";
const base=()=>({tokenType:"BACKOFFICE_USER",id:"actor",companyId:"platform",sessionId:"session",sessionVersion:3,role:"OWNER",platformRole:"SUPER_ADMIN",isSuperAdmin:true,exp:Math.floor(Date.now()/1000)+3600});
const token=p=>"fixture."+Buffer.from(JSON.stringify(p)).toString("base64url")+".signature";
const storage=values=>{const map=new Map(Object.entries(values));return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
const support=p=>({...p,companyId:"lab",supportContext:{companyId:"lab",storeId:"selected",destination:"STORES"}});
test("new status/export helpers remain purpose-bound and withhold late files after session changes",async()=>{
 const p=base(),s=storage({token:token(support(p))}),sessions=storage({platformToken:token(p)}),request=async(path,options)=>{assert.equal(options.headers.Authorization,"Bearer "+token(p));return {ok:true}};
 assert.equal((await requestPlatformAssistantStatus(request,"/api/platform/ai-command-center/status?storeId=selected",{},s,sessions)).ok,true);
 assert.equal((await requestPlatformAssistantExport(request,"/api/platform/ai-command-center/export",{method:"POST"},s,sessions)).ok,true);
 for(const path of ["https://foreign.invalid/api/platform/ai-command-center/export","/api/platform/ai-command-center/ask","/api/platform/ai-command-center/export?x=1"])await assert.rejects(requestPlatformAssistantExport(request,path,{method:"POST"},s,sessions));
 await assert.rejects(requestPlatformAssistantStatus(request,"/api/platform/ai-command-center/status",{method:"POST"},s,sessions));
 await assert.rejects(requestPlatformAssistantExport(async()=>{sessions.removeItem("platformToken");return {base64:"PRIVATE"}},"/api/platform/ai-command-center/export",{method:"POST"},s,sessions),e=>e.code==="PLATFORM_ASSISTANT_CONTEXT_CHANGED");
});
test("central assistant retains native signed OWNER representation; normal paid Owner never becomes platform authority",()=>{
 const p=base(),s=storage({token:token(p)}),session=storage({});
 assert.equal(readPlatformAssistantContext(s,session).token,s.getItem("token"));
 for(const changed of [{role:"EMPLOYEE"},{isSuperAdmin:false,platformRole:"OWNER",paidAssistant:true},{tokenType:"POS_OPERATOR"},{mustChangePassword:true},{sessionId:null}]){
  assert.throws(()=>readPlatformAssistantContext(storage({token:token({...p,...changed})}),session),e=>e.status===403&&e.code==="PLATFORM_ASSISTANT_ROLE_REQUIRED");
 }
});
test("support view uses only pre-existing same-actor/session native central credential, without changing either store or credential",()=>{
 const p=base(),canonical=token(p),scoped=token({...support(p),exp:1}),s=storage({token:scoped,supportContext:JSON.stringify(support(p).supportContext)}),session=storage({platformToken:canonical});
 assert.equal(readPlatformAssistantContext(s,session).token,canonical);
 assert.equal(s.getItem("token"),scoped);assert.equal(JSON.parse(s.getItem("supportContext")).storeId,"selected");
 for(const changed of [{id:"other"},{sessionId:"other"},{sessionVersion:4},{supportContext:{companyId:"lab",storeId:"selected"}},{isSuperAdmin:false,platformRole:"OWNER"},{exp:1}]){
  assert.throws(()=>readPlatformAssistantContext(s,storage({platformToken:token({...p,...changed})})),e=>e.status===403);
 }
 assert.throws(()=>readPlatformAssistantContext(s,storage({})),/Επιστροφή στο Super Admin/);
 assert.throws(()=>readPlatformAssistantContext(storage({token:token({...p,exp:1})}),session),/έληξε/);
});
test("central request preserves already-selected region/all scope and sends only matching canonical credential",async()=>{
 const p=base(),s=storage({token:token(support(p))}),session=storage({platformToken:token(p)}),signal=new AbortController().signal;
 const body=JSON.stringify({selection:{companyId:"lab",storeId:"selected"},readScope:"all_stores",question:"νερά"});
 let captured;
 const out=await requestPlatformAssistant(async(path,options)=>{captured={path,options};return {answer:"source"};},"/api/platform/ai-command-center/ask",{method:"POST",body,signal,headers:{"X-Read":"same",Authorization:"untrusted"}},s,session);
 assert.equal(out.answer,"source");assert.equal(captured.options.body,body);assert.equal(captured.options.signal,signal);assert.equal(captured.options.headers.Authorization,"Bearer "+session.getItem("platformToken"));assert.equal(captured.options.headers["X-Read"],"same");
 let calls=0;await assert.rejects(requestPlatformAssistant(async()=>{calls++;},"/api/platform/ai-command-center/ask",{},s,storage({})));assert.equal(calls,0);
});
test("late response is withheld after actor/support-scope change or loss of existing central credential",async()=>{
 for(const change of [(s,session)=>s.setItem("token",token(support({...base(),id:"other"}))),(s,session)=>session.removeItem("platformToken"),(s,session)=>s.setItem("token",token({...support(base()),supportContext:{companyId:"lab",storeId:"different"}}))]){
  const p=base(),s=storage({token:token(support(p))}),session=storage({platformToken:token(p)});
  await assert.rejects(requestPlatformAssistant(async()=>{change(s,session);return {answer:"late"};},"/api/platform/ai-command-center/ask",{},s,session),e=>e.code==="PLATFORM_ASSISTANT_CONTEXT_CHANGED");
 }
});
test("same-session renewal retains answers; watcher withdraws changed session/store and cleans listeners/timer",()=>{
 const p=base(),s=storage({token:token(support(p))}),session=storage({platformToken:token(p)}),listeners=new Map();let tick,cleared=false,changes=0;
 const win={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),setInterval:f=>{tick=f;return 7},clearInterval:id=>{assert.equal(id,7);cleared=true}},doc={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
 const stop=watchPlatformAssistantContext(s,session,win,doc,()=>changes++);
 s.setItem("token",token({...support(p),iat:12,exp:p.exp+5}));session.setItem("platformToken",token({...p,iat:12,exp:p.exp+5}));tick();assert.equal(changes,0);
 s.setItem("token",token({...support(p),supportContext:{companyId:"lab",storeId:"changed",destination:"STORES"}}));tick();assert.equal(changes,1);
 session.removeItem("platformToken");listeners.get("focus")();assert.equal(changes,2);stop();assert.equal(cleared,true);assert.equal(listeners.size,0);
});

test("late old-session rejection is replaced by context-change message, never attributed to the new actor",async()=>{
 const p=base(),store=storage({token:token(p)}),session=storage({});
 await assert.rejects(requestPlatformAssistant(async()=>{store.setItem("token",token({...p,id:"new"}));throw new Error("old role denial")},"/api/platform/ai-command-center/ask",{},store,session),e=>e.code==="PLATFORM_ASSISTANT_CONTEXT_CHANGED"&&!e.message.includes("old role"));
});

test("existing central credential cannot be sent to another endpoint or origin through assistant helper",async()=>{
 const p=base(),store=storage({token:token(p)}),session=storage({});let calls=0;
 for(const path of ["https://foreign.invalid/ask","/api/owner-assistant/ask"]){
  await assert.rejects(requestPlatformAssistant(async()=>{calls++;},path,{},store,session),e=>e.code==="PLATFORM_ASSISTANT_REQUEST_REJECTED");
 }
 assert.equal(calls,0);
});
