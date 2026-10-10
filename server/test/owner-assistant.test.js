import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {authorizeOwnerAssistant} from "../src/services/owner-assistant-access.js";
import {readCanonicalOwnerCash,createOwnerAssistantHandlers} from "../src/services/owner-assistant-handlers.js";
import {createOwnerAssistantRouter} from "../src/routes/owner-assistant.js";

// Isolated session/database/provider fixtures; these are CI security tests, not LAB acceptance.
const scope={companyId:"c",companyName:"Fixture",storeId:"s",storeName:"Store A",supportPreview:false};
const owner={id:"o",role:"OWNER",companyId:"c",tokenType:"BACKOFFICE_USER",sessionId:"session",sessionVersion:3};
const request=()=>({user:{...owner},params:{storeId:"s"},headers:{authorization:"Bearer fixture-session"}});
function fixture(){
  const session={userId:"o",expiresAt:new Date(Date.now()+3600000),revokedAt:null,user:{id:"o",role:"OWNER",companyId:"c",sessionVersion:3,mustChangePassword:false}};
  const state={name:"Fixture",licenseAllowed:true,activeModules:["AI_OWNER_ASSISTANT","CASH_CONTROL"]};
  const overrides={},reads=[];let ownAccess=true,storeAvailable=true;
  const db={userSession:{findUnique:async()=>session},store:{findFirst:async({where})=>{reads.push(where);return storeAvailable&&where.id==="s"&&where.companyId==="c"&&where.active?{id:"s",name:"Store A",companyId:"c"}:null}},$queryRaw:async(strings,...args)=>{
    reads.push({sql:strings.join("?"),args});
    return strings.join("").includes("OwnerCompanyAccess")?(ownAccess?[{ok:1}]:[]):overrides[args.at(-1)]?[overrides[args.at(-1)]]:[];
  }};
  return {session,state,overrides,reads,db,getState:async id=>id==="c"?state:null,setOwnAccess:v=>ownAccess=v,setStoreAvailable:v=>storeAvailable=v};
}
const denied=(promise,status)=>assert.rejects(promise,e=>e.status===status);
test("ordinary Owner access requires a fresh session, exact own active store and both effective modules",async()=>{
  const f=fixture();assert.deepEqual(await authorizeOwnerAssistant(request(),f),scope);
  assert.deepEqual(f.reads[0],{id:"s",companyId:"c",active:true});
  assert.equal(f.reads.filter(r=>r.sql).length,2);
  for(const role of ["EMPLOYEE","SUPER_ADMIN","MANAGER"]){const req=request();req.user.role=role;await denied(authorizeOwnerAssistant(req,f),403)}
  for(const storeId of ["","foreign"]){const req=request();req.params.storeId=storeId;await denied(authorizeOwnerAssistant(req,f),storeId?404:400)}
  f.setStoreAvailable(false);await denied(authorizeOwnerAssistant(request(),f),404);
});
test("session revocation, expiry, version/password and changed database role fail closed",async()=>{
  for(const change of [s=>s.revokedAt=new Date(),s=>s.expiresAt=new Date(0),s=>s.userId="other",s=>s.user.sessionVersion++,s=>s.user.mustChangePassword=true]){
    const f=fixture();change(f.session);await denied(authorizeOwnerAssistant(request(),f),401);assert.equal(f.reads.length,0);
  }
  const f=fixture();f.session.user.role="EMPLOYEE";await denied(authorizeOwnerAssistant(request(),f),403);
  const req=request();delete req.user.sessionId;await denied(authorizeOwnerAssistant(req,fixture()),401);
});
test("additional own company needs the existing explicit OwnerCompanyAccess and current relation",async()=>{
  const f=fixture(),req=request();f.session.user.companyId="home";
  await denied(authorizeOwnerAssistant(req,f),403);
  req.user.ownerCompanyId="c";assert.equal((await authorizeOwnerAssistant(req,f)).companyId,"c");
  assert.ok(f.reads.some(r=>r.sql?.includes('c."active"=TRUE')&&r.args[0]==="o"&&r.args[1]==="c"));
  f.setOwnAccess(false);await denied(authorizeOwnerAssistant(req,f),403);
});
test("license and per-store module overrides retain configured deny, expiry and explicit enabled override",async()=>{
  for(const key of ["AI_OWNER_ASSISTANT","CASH_CONTROL"]){
    const f=fixture();f.state.activeModules=f.state.activeModules.filter(k=>k!==key);await denied(authorizeOwnerAssistant(request(),f),403);
    f.overrides[key]={active:true};assert.equal((await authorizeOwnerAssistant(request(),f)).storeId,"s");
    for(const override of [{active:false},{active:true,endsAt:new Date(0)},{active:true,startsAt:new Date(Date.now()+86400000)}]){f.overrides[key]=override;await denied(authorizeOwnerAssistant(request(),f),403)}
  }
  const f=fixture();f.state.licenseAllowed=false;await denied(authorizeOwnerAssistant(request(),f),403);
});
test("support is a separately labelled preview bound to fresh actual Super Admin and exact context",async()=>{
  const f=fixture(),req=request();f.session.user.role="SUPER_ADMIN";req.user.isSuperAdmin=true;req.user.platformRole="SUPER_ADMIN";
  await denied(authorizeOwnerAssistant(req,f),403);
  req.user.supportContext={companyId:"c",storeId:"foreign"};await denied(authorizeOwnerAssistant(req,f),403);
  req.user.supportContext.storeId="s";f.state.activeModules=[];f.state.licenseAllowed=false;
  assert.equal((await authorizeOwnerAssistant(req,f)).supportPreview,true);
  f.session.user.role="OWNER";await denied(authorizeOwnerAssistant(req,f),403);
});
const canonical=()=>({date:"2026-10-10",timeZone:"Europe/Athens",store:{id:"s"},rule:{mode:"POS_EFTPOS_ONLY",posEftposEnabled:true},sessions:[{id:"shift",companyId:"c",storeId:"s",status:"CLOSED",shiftLabel:"Πρωί",terminalPos:"MAIN",variance:-12.5,effectiveVariance:0,expectedOperational:100,actualOperational:87.5,cardVariance:2,openedByName:"PRIVATE PERSON",attachmentData:"PRIVATE IMAGE",notes:"PRIVATE NOTE"}],totals:{variance:0,cardVariance:2,secret:"PRIVATE TOTAL"}});
test("Owner reader uses only the fixed authorized canonical GET, preserves effective rule and removes private fields",async()=>{
  let called;const evidence=await readCanonicalOwnerCash(request(),"2026-10-10",scope,{port:8081,fetchImpl:async(url,options)=>{called={url,options};return {ok:true,json:async()=>canonical()}}});
  assert.equal(called.url,"http://127.0.0.1:8081/api/cash/stores/s/daily-summary?date=2026-10-10");assert.equal(called.options.method,"GET");assert.equal(called.options.redirect,"error");assert.equal(called.options.headers.Authorization,"Bearer fixture-session");
  assert.equal(evidence.scope,"OWNER_SELECTED_STORE");assert.equal(evidence.rows[0].sessionId,"shift");assert.equal(evidence.rows[0].variance,0);assert.equal(evidence.rows[0].expectedOperational,100);assert.equal(evidence.rows[0].cardVariance,2);assert.equal(evidence.totals.variance,0);assert.equal(JSON.stringify(evidence).includes("PRIVATE"),false);
});
test("Owner canonical source rejects cross-company/store, open rows, date mismatch and unavailable source",async()=>{
  for(const mutate of [r=>r.store.id="foreign",r=>r.sessions[0].companyId="foreign",r=>r.sessions[0].storeId="foreign",r=>r.sessions[0].status="OPEN",r=>r.date="2026-10-09",r=>r.sessions=null]){const r=canonical();mutate(r);await denied(readCanonicalOwnerCash(request(),"2026-10-10",scope,{fetchImpl:async()=>({ok:true,json:async()=>r})}),502)}
  for(const status of [401,403,404,500])await denied(readCanonicalOwnerCash(request(),null,scope,{fetchImpl:async()=>({ok:false,status})}),status===500?502:status);
  let reads=0;const fetchImpl=async()=>{reads++};await denied(readCanonicalOwnerCash({...request(),headers:{}},null,scope,{fetchImpl}),401);await denied(readCanonicalOwnerCash(request(),null,scope,{fetchImpl,port:"8080/remote"}),503);assert.equal(reads,0);
});
test("empty/truncated canonical report is explicit and keeps full-source totals without new arithmetic",async()=>{
  const r=canonical();r.sessions=[];const read=()=>readCanonicalOwnerCash(request(),null,scope,{fetchImpl:async()=>({ok:true,json:async()=>r})});
  let e=await read();assert.equal(e.totalRows,0);assert.equal(e.rows.length,0);assert.equal(e.totals.variance,0);
  r.sessions=Array.from({length:101},(_,i)=>({...canonical().sessions[0],id:`shift-${i}`}));e=await read();assert.equal(e.totalRows,101);assert.equal(e.rows.length,100);assert.equal(e.truncated,true);assert.equal(e.totals.cardVariance,2);
});
const tool={type:"function_call",name:"cash_details",call_id:"read",arguments:'{"date":"2026-10-10"}'};
const success=()=>({response:{ok:true},raw:{output_text:JSON.stringify({answer:"Fixture answer",highlights:[],limitations:""})}});
async function invoke(options){let out,err,code=200;const res={status(n){code=n;return this},json(v){out=v;return this}};await createOwnerAssistantHandlers(options).ask({...request(),body:{question:"Ποια διαφορά είχε το ταμείο;"}},res,e=>err=e);return {out,err,code}}
test("real handler revalidates around provider/source and returns independently scoped evidence",async()=>{
  let auth=0,providers=0,reads=0;const r=await invoke({authorize:async()=>{auth++;return scope},requestProvider:async settings=>{providers++;assert.equal(settings.store,false);assert.match(settings.tools[0].description,/επιλεγμένου καταστήματος/);return providers===1?{response:{ok:true},raw:{output:[{type:"reasoning",id:"r"},tool]}}:success()},readCash:async(req,date,s)=>{reads++;assert.equal(s,scope);assert.equal(date,"2026-10-10");return {...scope,scope:"OWNER_SELECTED_STORE",rows:[]}}});
  assert.equal(r.err,undefined);assert.equal(r.out.answer,"Fixture answer");assert.equal(r.out.evidence.length,1);assert.equal(auth,6);assert.equal(reads,1);assert.equal(providers,2);
});
test("late module/session/role revocation and context changes prevent source or final answer",async()=>{
  for(const boundary of [2,3,4,5,6]){let auth=0,providers=0;const r=await invoke({authorize:async()=>{if(++auth===boundary)throw Object.assign(Error("revoked"),{status:403});return scope},requestProvider:async()=>++providers===1?{response:{ok:true},raw:{output:[tool]}}:success(),readCash:async()=>({rows:[]})});assert.equal(r.out,undefined);assert.equal(r.err.status,403)}
  let auth=0;const r=await invoke({authorize:async()=>++auth===2?{...scope,companyId:"changed"}:scope,requestProvider:async()=>{throw Error("must not call")}});assert.equal(r.err.code,"OWNER_ASSISTANT_CONTEXT_CHANGED");
});
test("mounted route denies arbitrary body/query scope and revoked access before provider or source I/O",async()=>{
  let providerCalls=0,readCalls=0,allow=true;
  const app=express();app.use(express.json());app.use("/api/owner-assistant",createOwnerAssistantRouter({authenticate:(req,res,next)=>{req.user=owner;next()},authorize:async()=>{if(!allow)throw Object.assign(Error("denied"),{status:403});return scope},provider:async()=>{providerCalls++;return success()},readCash:async()=>{readCalls++;return {}},providerConfigured:()=>true}));
  app.use((err,req,res,next)=>res.status(err.status||(err.name==="ZodError"?400:500)).json({error:err.message}));
  const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));const base=`http://127.0.0.1:${server.address().port}/api/owner-assistant/stores/s`;
  try{
    assert.equal((await fetch(`${base}/status?storeId=foreign`)).status,400);
    for(const extra of [{storeId:"foreign"},{companyId:"foreign"},{model:"foreign"},{url:"https://foreign.invalid"},{action:"grant"}])assert.equal((await fetch(`${base}/ask`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:"Ποια διαφορά;",...extra})})).status,400);
    allow=false;assert.equal((await fetch(`${base}/status`)).status,403);assert.equal((await fetch(`${base}/ask`,{method:"POST",headers:{"Content-Type":"application/json"},body:'{"question":"Ποια διαφορά;"}'})).status,403);assert.equal(providerCalls,0);assert.equal(readCalls,0);
    allow=true;const response=await fetch(`${base}/ask`,{method:"POST",headers:{"Content-Type":"application/json"},body:'{"question":"Ποια διαφορά;","inputChannel":"voice"}'});assert.equal(response.status,200);assert.equal((await response.json()).scope.storeId,"s");assert.equal(providerCalls,1);
  }finally{await new Promise(resolve=>server.close(resolve))}
});
