import test from "node:test";
import assert from "node:assert/strict";
import {createBackofficeSessionBoundary,readBackofficeContext,watchBackofficeContext} from "../../client/src/utils/backofficeSessionBoundary.mjs";

const jwt=payload=>`fixture.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.not-a-signature`;
const claims={id:"owner",sessionId:"session-A",sessionVersion:1,companyId:"company-A",role:"OWNER",platformRole:"OWNER",tokenType:"BACKOFFICE_USER",isSuperAdmin:false};
function fixture(request=async()=>({ok:true})){
  const values=new Map([["token",jwt({...claims,iat:1,exp:2})],["user",JSON.stringify({id:"owner",role:"OWNER",company:{id:"company-A"}})]]);
  const notices=[],calls=[];let current=true;
  const storage={getItem:key=>values.get(key)||null};
  const boundary=createBackofficeSessionBoundary({readContext:()=>readBackofficeContext(storage),isCurrent:()=>current,onInvalidated:reason=>notices.push(reason),request:async(...args)=>{calls.push(args);return request(...args)}});
  return {values,storage,notices,calls,boundary,retire:()=>{current=false}};
}
const error=status=>Object.assign(new Error("fixture error"),{status});

test("healthy context retains request options and ordinary errors",async()=>{
  const f=fixture();const options={method:"POST",headers:{"x-mws-terminal-pos":"MAIN"},body:"fixture"};
  assert.deepEqual(await f.boundary.request("/same-store",options),{ok:true});assert.equal(f.calls[0][1],options);
  assert.equal(f.notices.length,0);
});

for(const key of ["token","user","supportContext"]){
  test(`changed ${key} blocks before another request without clearing shared storage`,async()=>{
    const f=fixture();f.values.set(key,key==="token"?jwt({...claims,companyId:"company-B"}):"changed");
    const before=[...f.values];await assert.rejects(f.boundary.request("/old-store"),{code:"BACKOFFICE_SESSION_CHANGED"});
    assert.equal(f.calls.length,0);assert.deepEqual([...f.values],before);assert.deepEqual(f.notices,["context-changed"]);
    await assert.rejects(f.boundary.request("/old-store"));assert.equal(f.notices.length,1);
  });
}

test("logout and storage clear block the old view",async()=>{
  for(const change of [f=>f.values.delete("token"),f=>f.values.clear()]){const f=fixture();change(f);await assert.rejects(f.boundary.request("/old-store"));assert.equal(f.calls.length,0)}
});

test("same-company new login and changed support store or role are new contexts",async()=>{
  for(const next of [{...claims,sessionId:"new-session"},{...claims,role:"EMPLOYEE"},{...claims,sessionVersion:2},{...claims,isSuperAdmin:true,supportContext:{companyId:"company-A",storeId:"store-B"}}]){
    const f=fixture();f.values.set("token",jwt(next));await assert.rejects(f.boundary.request("/old-store"));assert.equal(f.calls.length,0);
  }
});

test("same-session renewal is allowed and uses the current credential",async()=>{
  const f=fixture();let received;
  const boundary=createBackofficeSessionBoundary({readContext:()=>readBackofficeContext(f.storage),request:async()=>{received=f.storage.getItem("token");return "fresh"}});
  f.values.set("token",jwt({...claims,iat:50,exp:100,mustChangePassword:false,ownerCompanyId:"company-A"}));
  assert.equal(await boundary.request("/same-store"),"fresh");assert.equal(received,f.values.get("token"));
});

test("support renewal does not invalidate an older support token lacking password flag",async()=>{
  const p={...claims,platformRole:"SUPER_ADMIN",isSuperAdmin:true,supportContext:{companyId:"company-A",storeId:"store-A",destination:"ALL"}};
  const f=fixture();f.values.set("token",jwt(p));const boundary=createBackofficeSessionBoundary({readContext:()=>readBackofficeContext(f.storage),request:async()=>true});
  f.values.set("token",jwt({...p,mustChangePassword:false,iat:50,exp:100}));assert.equal(await boundary.request("/store-A"),true);
});

for(const failed of [false,true]){
  test(`context change rejects a late ${failed?"failure":"success"}`,async()=>{
    let settle;const f=fixture(()=>new Promise((resolve,reject)=>{settle=failed?reject:resolve}));
    const pending=f.boundary.request("/store-A");f.values.set("token",jwt({...claims,companyId:"company-B"}));
    settle(failed?error(401):{privateOldData:true});await assert.rejects(pending,{code:"BACKOFFICE_SESSION_CHANGED"});
    assert.deepEqual(f.notices,["context-changed"]);
  });
}

test("retired view cannot fetch or invalidate a newer view from its late response",async()=>{
  let settle;const f=fixture(()=>new Promise(resolve=>{settle=resolve}));const pending=f.boundary.request("/store-A");
  f.retire();settle("late");await assert.rejects(pending,{code:"BACKOFFICE_SESSION_CHANGED"});
  await assert.rejects(f.boundary.request("/store-A"));assert.equal(f.calls.length,1);assert.equal(f.notices.length,0);
});

test("current401 suspends this view once; subsequent retries never reach request",async()=>{
  const f=fixture(async()=>{throw error(401)});
  await assert.rejects(f.boundary.request("/store-A"),{status:401});await assert.rejects(f.boundary.request("/store-A"),{code:"BACKOFFICE_SESSION_CHANGED"});
  assert.equal(f.calls.length,1);assert.deepEqual(f.notices,["unauthorized"]);
});

test("pre-renewal401 does not suspend a renewed credential",async()=>{
  let settle;const f=fixture(()=>new Promise((_resolve,reject)=>{settle=reject}));const pending=f.boundary.request("/store-A");
  f.values.set("token",jwt({...claims,iat:50,exp:100}));settle(error(401));await assert.rejects(pending,{status:401});
  assert.equal(f.boundary.check(),true);assert.equal(f.notices.length,0);
});

test("Authorization override401 is not attributed to this session",async()=>{
  const f=fixture(async()=>{throw error(401)});await assert.rejects(f.boundary.request("/probe",{headers:{authorization:"different-fixture"}}));assert.equal(f.boundary.check(),true);
});

for(const status of [403,404,500,503,undefined]){
  test(`${status||"network error"} does not globally suspend the context`,async()=>{
    const f=fixture(async()=>{throw error(status)});await assert.rejects(f.boundary.request("/store-A"));await assert.rejects(f.boundary.request("/store-A"));
    assert.equal(f.calls.length,2);assert.equal(f.notices.length,0);
  });
}

test("storage/focus/pageshow/visibility checks and cleanup cover missed events",()=>{
  const win=new EventTarget(),doc=new EventTarget();
  for(const kind of ["storage","focus","pageshow","visibilitychange"]){
    const f=fixture();const stop=watchBackofficeContext(f.boundary,win,doc);f.values.delete("token");
    const event=new Event(kind);if(kind==="storage")Object.defineProperty(event,"key",{value:null});
    (kind==="visibilitychange"?doc:win).dispatchEvent(event);assert.equal(f.notices.length,1);stop();
  }
  const f=fixture();const stop=watchBackofficeContext(f.boundary,win,doc);stop();f.values.delete("token");win.dispatchEvent(new Event("focus"));assert.equal(f.notices.length,0);
});

test("unrelated storage signals do not invalidate the healthy context",()=>{
  const f=fixture(),win=new EventTarget(),doc=new EventTarget();const stop=watchBackofficeContext(f.boundary,win,doc);
  const event=new Event("storage");Object.defineProperty(event,"key",{value:"myworkstation:store-sync"});win.dispatchEvent(event);assert.equal(f.notices.length,0);stop();
});
