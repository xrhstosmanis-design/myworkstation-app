import test from "node:test";
import assert from "node:assert/strict";
import {TWIN_RETURN_KEY} from "../../client/src/components/platform/ai-command-twin-navigation.js";

// The seven real screen components are mounted. APIs, nested business editors,
// browser full-page navigation and file saving are isolated fixtures, not LIVE/LAB.
test("N40: canonical six-tile navigation keeps scope, returns, and rejects late results",async t=>{
 const {build}=await import("esbuild"),{JSDOM}=await import("jsdom"),{createRequire}=await import("node:module"),{fileURLToPath}=await import("node:url"),path=await import("node:path"),{readFile}=await import("node:fs/promises");
 const keep=new Set(["PlatformAdminApp.jsx","AiCommandCenter.jsx","SuperAdminChecksAnalytics.jsx","SupplierSettlementReviewCenter.jsx","BankLedgerReviewCenter.jsx","SuperAdminStaffScheduler.jsx","VideoConnectionManager.jsx"]);
 const built=await build({stdin:{contents:'export {default} from "./client/src/components/platform/PlatformAdminApp.jsx";',resolveDir:fileURLToPath(new URL("../../",import.meta.url)),loader:"jsx"},bundle:true,write:false,format:"cjs",platform:"node",external:["react","react-dom","react-dom/client","react/jsx-runtime"],loader:{".css":"empty"},plugins:[{name:"isolated-business-editors",setup(b){b.onLoad({filter:/\.jsx$/},async args=>{
  const name=path.basename(args.path);
  if(name==="PlatformAdminApp.jsx"){
   const source=await readFile(args.path,"utf8"),anchor='window.location.href=`/?${query}`;';
   assert.equal(source.split(anchor).length,2,"Only replace the existing full-page browser assignment for this JSDOM fixture");
   return{contents:source.replace(anchor,'window.__fixtureNavigate(`/?${query}`);'),loader:"jsx"};
  }
  if(keep.has(name))return;
  if(name==="PlatformSecureLogin.jsx")return{contents:'import React from "react";export default function Login(p){return <button data-fixture-login onClick={()=>p.onLogin({id:"actor",fullName:"Fixture"})}>Login</button>}',loader:"jsx"};
  return{contents:'import React from "react";export default function Nested(p){return <div data-fixture="'+name+'" data-store={p.store?.id||""}/>}',loader:"jsx"};
 })}}]});
 const module={exports:{}};new Function("require","module","exports",built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const App=module.exports.default,dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid/platform-admin"});
 const keys=["window","document","navigator","HTMLElement","Event","CustomEvent","MutationObserver","localStorage","sessionStorage","fetch","IS_REACT_ACT_ENVIRONMENT"],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
 const navigations=[],downloads=[];window.__fixtureNavigate=url=>navigations.push(url);window.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download)};
 localStorage.setItem("token","fixture-platform");localStorage.setItem("platformUser",JSON.stringify({id:"actor",fullName:"Fixture"}));
 const a={id:"company-a",name:"Company A",active:true,plan:"BASIC",modules:[],stores:[{id:"store-a",name:"Store A",active:true}]},b={id:"company-b",name:"Company B",active:true,plan:"BASIC",modules:[],stores:[{id:"store-b",name:"Store B",active:true}]};
 let companies=[a,b],payments=false,bank=false,videoDenied=false,pendingVideo=null;
 const calls=[],unexpected=[],totals={shifts:0,shortage:0,surplus:0,variance:0,cardVariance:0,expensesWithoutDocument:0,duplicateCandidates:0};
 const reply=(data,status=200)=>({ok:status<400,status,text:async()=>JSON.stringify(data),json:async()=>data});
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url,"https://isolated.invalid"),p=u.pathname,method=options.method||"GET",body=options.body?JSON.parse(options.body):null;
  calls.push({url,p,method,body,query:u.searchParams});
  if(method!=="GET"){
   if(p==="/api/platform/super-admin-analytics/execute"&&method==="POST")return reply({status:"ΟΚ",rows:[],findings:[],totals:{}});
   if(p==="/api/platform/companies/company-b/support-access"&&method==="POST")return reply({token:"fixture-support",user:{id:"support"},supportContext:{companyId:"company-b",storeId:"store-b"}});
   if(p==="/api/auth/logout"&&method==="POST")return reply({ok:true});
   unexpected.push({url,method});throw Error("Unexpected fixture business write");
  }
  if(p==="/api/platform/overview")return reply({companies,stats:{}});
  if(p==="/api/platform/owners")return reply({owners:[]});
  if(p==="/api/platform/backup-monitoring")return reply({configured:false});
  if(p==="/api/platform/invoice-learning/workspace")return reply({state:{documents:[],profiles:{}}});
  if(p==="/api/platform/cash-control/daily"){
   const stores=companies.flatMap(c=>c.stores.map(s=>({...totals,storeId:s.id,storeName:s.name,companyId:c.id,companyName:c.name}))).filter(s=>!u.searchParams.get("storeId")||s.storeId===u.searchParams.get("storeId"));
   return reply({date:"2026-10-10",totals,stores,rows:[]});
  }
  if(p==="/api/platform/cash-control/shortages")return reply({rows:[],totalShortage:0});
  if(p==="/api/transactions/supplier-settlements/review")return reply({items:payments?[{id:"payment-b",companyId:b.id,storeId:"store-b",companyName:b.name,storeName:"Store B",supplierName:"Fixture supplier",amount:2,status:"PENDING_REVIEW",allocations:[],automaticCheck:{checks:[]}}]:[],companies,stores:companies.flatMap(c=>c.stores.map(s=>({...s,companyId:c.id})))});
  if(p==="/api/transactions/bank-ledger/review")return reply({items:bank?[{id:"bank-b",storeId:"store-b",companyId:b.id,companyName:b.name,storeName:"Store B",amount:3,status:"CONFIRMED",attachmentFilename:"fixture.pdf",occurredAt:"2026-10-10T07:00:00Z"}]:[]});
  if(p==="/api/transactions/bank-ledger/summary")return reply({items:[],totals:{availableBalance:0,pendingAmount:0,projectedBalance:0}});
  if(p==="/api/transactions/other-expenses/review")return reply({items:[]});
  if(/^\/api\/platform\/store-modules\/companies\/[^/]+\/stores\/[^/]+(?:\/check-packages)?$/.test(p))return reply({packages:[],states:{}});
  if(/^\/api\/platform\/companies\/[^/]+\/stores\/[^/]+\/(installation-terminals|device-routing)$/.test(p))return reply({terminals:[],fiscalDevices:[],eftposDevices:[]});
  if(/^\/api\/platform\/companies\/[^/]+\/stores\/[^/]+\/video-connection$/.test(p)){
   if(p.includes("/store-b/")&&pendingVideo){const held=pendingVideo;pendingVideo=null;return held}
   if(p.includes("/store-b/")&&videoDenied)return reply({error:"403: module denied"},403);
   return reply({connection:{active:false},connector:null,cameras:[]});
  }
  unexpected.push({url,method});throw Error(`Unexpected fixture route: ${p}`);
 };
 const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React;let root=createRoot(document.getElementById("root"));
 const press=async el=>{assert.ok(el,"Expected mounted control");assert.ok(!el.disabled,"Control must be enabled");await act(async()=>el.dispatchEvent(new window.MouseEvent("click",{bubbles:true})))};
 const button=(selector,text)=>[...document.querySelectorAll(selector)].find(el=>el.textContent.trim()===text);
 const open=()=>press(document.querySelector(".ai-command-launch"));
 const close=()=>press(document.querySelector(".ai-command-close"));
 const select=name=>press(button(".ai-full-twin-selector button",name));
 const selected=()=>document.querySelector(".ai-full-twin-selector button.active")?.textContent;
 const area=title=>[...document.querySelectorAll(".ai-full-twin-areas button")].find(el=>el.querySelector("small")?.textContent===title);
 const refresh=()=>press(document.querySelector(".ai-command-header-actions button:not(.ai-command-close)"));
 const returned=()=>{assert.equal(selected(),"Store B");assert.equal(document.querySelectorAll(".ai-full-twin-areas button").length,6)};
 const scoped=(since,paths)=>{
  const relevant=calls.slice(since).filter(c=>paths.includes(c.p));assert.ok(relevant.length,"Expected scoped reads");
  for(const call of relevant){const fields=call.method==="POST"?call.body:Object.fromEntries(call.query);assert.equal(fields.companyId,"company-b",call.url);assert.equal(fields.storeId,"store-b",call.url)}
 };
 try{
  await act(async()=>root.render(React.createElement(App)));await open();await select("Store B");
  await t.test("POS opens existing checks with locked scope; clear, execute and return retain it",async()=>{
   const since=calls.length;await press(area("POS"));
   const selects=[...document.querySelectorAll(".sa-checks-filters select")];assert.deepEqual(selects.map(s=>s.value),["company-b","store-b"]);assert.ok(selects.every(s=>s.disabled));assert.ok(selects.every(s=>![...s.options].some(o=>o.value==="")));
   await press(button(".sa-filter-actions button","Καθαρισμός"));assert.deepEqual(selects.map(s=>s.value),["company-b","store-b"]);
   await press(button(".sa-filter-actions button","Εκτέλεση ελέγχου"));scoped(since,["/api/platform/super-admin-analytics/execute","/api/transactions/bank-ledger/summary","/api/transactions/bank-ledger/review","/api/transactions/supplier-settlements/review","/api/transactions/other-expenses/review"]);
   await press(document.querySelector('[aria-label="Κλείσιμο ελέγχων και αναλύσεων"]'));returned();
  });
  await t.test("EFTPOS opens existing cash report; refresh and export never broaden scope",async()=>{
   const since=calls.length;await press(area("EFTPOS / Ταμειακές"));const s=document.querySelector(".cash-report-filters select");assert.equal(s.value,"store-b");assert.ok(s.disabled);assert.deepEqual([...s.options].map(o=>o.value),["store-b"]);
   await press(button(".cash-report-filters button","Εμφάνιση"));await press(button(".cash-report-filters button","Excel ελλειμμάτων καταστήματος"));
   scoped(since,["/api/platform/cash-control/daily","/api/platform/cash-control/shortages"]);assert.ok(downloads.some(name=>name.includes("Store B")));
   await press(document.querySelector(".cash-report-dialog .modal-close"));returned();
  });
  await t.test("Cash follows supplier findings to the canonical scoped supplier center",async()=>{
   payments=true;await refresh();const since=calls.length;await press(area("Ταμείο"));
   const ss=[...document.querySelectorAll(".supplier-settlement-review-dialog select")];assert.deepEqual(ss.map(s=>s.value),["company-b","store-b"]);assert.ok(ss.every(s=>s.disabled));
   await press(button(".supplier-review-head button","Ανανέωση"));scoped(since,["/api/transactions/supplier-settlements/review"]);
   await press(document.querySelector(".supplier-settlement-review-dialog .modal-close"));returned();payments=false;
  });
  await t.test("Cash follows bank findings to scoped review and summary, with automatic return",async()=>{
   bank=true;await refresh();const since=calls.length;await press(area("Ταμείο"));const ss=[...document.querySelectorAll(".sa-modal select")];assert.deepEqual(ss.map(s=>s.value),["company-b","store-b"]);assert.ok(ss.every(s=>s.disabled));
   await press(button(".sa-modal .sa-actions button","Ανανέωση"));scoped(since,["/api/transactions/bank-ledger/review","/api/transactions/bank-ledger/summary"]);
   await press(document.querySelector(".sa-modal .sa-close"));returned();bank=false;
  });
  await t.test("Workforce opens its real canonical shell with only the selected store",async()=>{
   const since=calls.length;await press(area("Προσωπικό"));const s=document.querySelector(".workforce-store-selector select");assert.equal(s.value,"store-b");assert.deepEqual([...s.options].map(o=>o.value),["store-b"]);
   assert.ok(calls.slice(since).some(c=>c.p==="/api/platform/store-modules/companies/company-b/stores/store-b"));await press(document.querySelector(".staff-scheduler-modal .modal-close"));returned();
  });
  await t.test("Video opens the real canonical settings shell without camera commands",async()=>{
   const since=calls.length;await press(area("Κάμερες"));assert.match(document.querySelector(".video-connection-dialog").textContent,/Company B · Store B/);assert.equal(calls.slice(since).length,1);assert.match(calls.at(-1).p,/company-b\/stores\/store-b\/video-connection$/);
   await press(document.querySelector(".video-connection-dialog .modal-close"));returned();
  });
  await t.test("Module denial stays in the Twin with a visible error and no fallback",async()=>{
   videoDenied=true;const since=calls.length;await press(area("Κάμερες"));returned();assert.match(document.querySelector(".ai-command-problem-error[role=alert]").textContent,/403/);assert.equal(document.querySelector(".video-connection-dialog"),null);assert.equal(calls.slice(since).length,1);videoDenied=false;
  });
  await t.test("Closing the Twin before a pending destination resolves cannot reopen it",async()=>{
   let release;pendingVideo=new Promise(r=>release=r);await press(area("Κάμερες"));assert.ok(area("POS").disabled);await close();await act(async()=>release(reply({connection:{},cameras:[]})));assert.equal(document.querySelector(".video-connection-dialog"),null);assert.equal(document.querySelector(".ai-command-page"),null);await open();returned();
  });
  await t.test("Changing store while a destination is pending rejects its old response",async()=>{
   let release;pendingVideo=new Promise(r=>release=r);await press(area("Κάμερες"));await select("Store A");await act(async()=>release(reply({connection:{},cameras:[]})));assert.equal(selected(),"Store A");assert.equal(document.querySelector(".video-connection-dialog"),null);await select("Store B");
  });
  await t.test("Ordinary central entry stays unscoped and close does not reopen the Twin",async()=>{
   await close();const since=calls.length;await press(button(".platform-action-group button","Ταμεία"));assert.ok(!document.querySelector(".cash-report-filters select").disabled);assert.equal(document.querySelector(".cash-report-filters select").value,"");assert.equal(calls.slice(since).filter(c=>c.p==="/api/platform/cash-control/daily")[0].query.has("storeId"),false);
   const s=document.querySelector(".cash-report-filters select");assert.deepEqual([...s.options].map(o=>o.value),["","store-a","store-b"]);
   await act(async()=>{s.value="store-a";s.dispatchEvent(new window.Event("change",{bubbles:true}))});await press(button(".cash-report-filters button","Εμφάνιση"));
   assert.equal(calls.findLast(c=>c.p==="/api/platform/cash-control/daily").query.get("storeId"),"store-a");
   await act(async()=>{s.value="";s.dispatchEvent(new window.Event("change",{bubbles:true}))});await press(button(".cash-report-filters button","Εμφάνιση"));
   assert.equal(calls.findLast(c=>c.p==="/api/platform/cash-control/daily").query.has("storeId"),false);
   await press(document.querySelector(".cash-report-dialog .modal-close"));assert.equal(document.querySelector(".ai-command-page"),null);await open();returned();
  });
  await t.test("Central Checks retains selectable scope, explicit all-store execution and ordinary close",async()=>{
   await close();await press(button(".platform-action-group button","Κέντρο Ελέγχων"));
   const selects=[...document.querySelectorAll(".sa-checks-filters select")];assert.deepEqual(selects.map(s=>s.value),["",""]);assert.ok(selects.every(s=>!s.disabled));
   assert.deepEqual([...selects[0].options].map(o=>o.value),["","company-a","company-b"]);
   assert.deepEqual([...selects[1].options].map(o=>o.value),["","store-a","store-b"]);
   await act(async()=>{selects[0].value="company-b";selects[0].dispatchEvent(new window.Event("change",{bubbles:true}))});
   await act(async()=>{selects[1].value="store-b";selects[1].dispatchEvent(new window.Event("change",{bubbles:true}))});
   const since=calls.length;await press(button(".sa-filter-actions button","Εκτέλεση ελέγχου"));
   scoped(since,["/api/platform/super-admin-analytics/execute","/api/transactions/bank-ledger/summary","/api/transactions/bank-ledger/review","/api/transactions/supplier-settlements/review","/api/transactions/other-expenses/review"]);
   await press(button(".sa-filter-actions button","Καθαρισμός"));assert.deepEqual(selects.map(s=>s.value),["",""]);
   const allSince=calls.length;await press(button(".sa-filter-actions button","Εκτέλεση ελέγχου"));
   assert.deepEqual(calls.findLast(c=>c.p==="/api/platform/super-admin-analytics/execute").body,{});
   for(const c of calls.slice(allSince).filter(c=>c.method==="GET"&&c.p.startsWith("/api/transactions/"))){assert.equal(c.query.has("storeId"),false);assert.equal(c.query.has("companyId"),false)}
   await press(document.querySelector('[aria-label="Κλείσιμο ελέγχων και αναλύσεων"]'));assert.equal(document.querySelector(".ai-command-page"),null);await open();returned();
  });
  await t.test("Central Workforce retains all stores, switches scoped data and closes normally",async()=>{
   await close();const since=calls.length;await press(button(".platform-action-group button","Προσωπικό & Πρόγραμμα"));
   const s=document.querySelector(".workforce-store-selector select");assert.ok(s&&!s.disabled);
   assert.deepEqual([...s.options].map(o=>o.value),["store-a","store-b"]);assert.equal(s.value,"store-a");
   await act(async()=>{s.value="store-b";s.dispatchEvent(new window.Event("change",{bubbles:true}))});
   assert.equal(s.value,"store-b");
   const reads=calls.slice(since).filter(c=>c.p.startsWith("/api/platform/store-modules/companies/"));
   assert.deepEqual(reads.map(c=>c.p),["/api/platform/store-modules/companies/company-a/stores/store-a","/api/platform/store-modules/companies/company-b/stores/store-b"]);
   await press(document.querySelector(".staff-scheduler-modal .modal-close"));assert.equal(document.querySelector(".ai-command-page"),null);await open();returned();
  });
  await t.test("Stock keeps the existing support exchange and returns after a simulated full-page cycle",async()=>{
   await press(area("Stock"));const access=calls.findLast(c=>c.p.endsWith("/support-access"));assert.deepEqual(access.body,{storeId:"store-b",destination:"BACKOFFICE"});assert.match(navigations.at(-1),/supportStore=store-b/);
   const hint=JSON.parse(sessionStorage.getItem(TWIN_RETURN_KEY));assert.equal(hint.userId,"actor");assert.equal(hint.storeId,"store-b");assert.ok(!("token"in hint));
   await act(async()=>root.unmount());
   // Simulate the existing main.jsx support exit, whose auth implementation is unchanged.
   localStorage.setItem("token",sessionStorage.getItem("platformToken"));sessionStorage.removeItem("platformToken");localStorage.removeItem("supportContext");localStorage.removeItem("user");
   root=createRoot(document.getElementById("root"));await act(async()=>root.render(React.createElement(App)));returned();assert.equal(sessionStorage.getItem(TWIN_RETURN_KEY),null);
  });
  await t.test("A removed store closes the scoped destination without selecting a different one",async()=>{
   payments=true;await refresh();await press(area("Ταμείο"));companies=[a];await press(document.querySelector(".platform-action-utility button"));assert.ok(document.querySelector(".ai-command-page"));assert.equal(document.querySelector(".supplier-settlement-review-dialog"),null);assert.equal(document.querySelector(".ai-full-twin-areas"),null);assert.ok(document.querySelector("[data-ai-twin-selection-unavailable]"));
  });
  assert.deepEqual(unexpected,[],"No unknown endpoint or business mutation in navigation checks");
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor]of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
});
