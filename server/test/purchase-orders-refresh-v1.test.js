import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

const source=await readFile(new URL("../../client/src/components/commerce/installPurchaseOrdersSuite.js",import.meta.url),"utf8");
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}};
const response=(orders=[],ok=true)=>({ok,status:ok?200:503,json:async()=>ok?{orders,summary:{count:orders.length}}:{error:"Η ανανέωση απέτυχε"}});

function fixture(){
  const requests=[],listeners={},notices=[],controls=new Map();
  const button={disabled:false,attrs:{},setAttribute(name,value){this.attrs[name]=value},addEventListener(name,handler){this[name]=handler}};
  controls.set("[data-po-refresh]",button);
  controls.set("[data-po-refresh-status]",{textContent:""});
  controls.set("[data-po-search]",{addEventListener(name,handler){this[name]=handler}});
  const root={isConnected:true,hidden:false,querySelector:selector=>controls.get(selector)||null,querySelectorAll:()=>[]};
  const launch={dataset:{},addEventListener(){}};
  const strip={querySelector:()=>launch,querySelectorAll:()=>[launch]};
  const hub={querySelector:selector=>selector===".commerce-module-strip"?strip:selector===".purchase-orders-suite"?root:null};
  const context=vm.createContext({URLSearchParams,Date,setTimeout:()=>0,clearTimeout(){},
    document:{documentElement:{},addEventListener(name,handler){listeners[name]=handler},querySelectorAll:()=>[hub]},
    MutationObserver:class{constructor(handler){listeners.mutation=handler}observe(){}},
    localStorage:{getItem:key=>key==="user"?'{"role":"OWNER"}':null},
    fetch:(url,options)=>{const pending=deferred();requests.push({url,options,...pending});return pending.promise},
    captureRender(html){root.html=html;root.renderCount=(root.renderCount||0)+1},
    captureNotice:(text,error)=>notices.push({text,error})
  });
  // Execute the shipped event handlers and async request logic; only DOM drawing is replaced.
  vm.runInContext(source.replace("export function installPurchaseOrdersSuite","function installPurchaseOrdersSuite")+`
    render=root=>{captureRender(header()+ordersHtml());bindRoot(root)};
    notify=(root,text,error)=>captureNotice(text,error);
    globalThis.suite={state,loadReport,refreshReport,refreshActiveSuite,bindRoot,installPurchaseOrdersSuite};
  `,context);
  const suite=context.suite;
  suite.state.active=true;
  const setFilters=values=>{for(const [key,value] of Object.entries(values))controls.set(`[data-po-${key}]`,{value})};
  return {suite,root,hub,button,requests,listeners,notices,controls,setFilters};
}

test("inner refresh reads the visible filters and renders newly returned orders without cache",async()=>{
  const f=fixture();
  f.setFilters({from:"2026-09-01",to:"2026-09-13",store:"lab",supplier:"supplier-1",status:"NEW",q:"2612188"});
  f.suite.bindRoot(f.root);
  const pending=f.button.click();
  assert.equal(f.button.disabled,true);
  assert.equal(f.button.attrs["aria-busy"],"true");
  const request=f.requests[0],url=new URL(request.url,"https://test.invalid");
  for(const [key,value] of Object.entries({storeId:"lab",supplierId:"supplier-1",status:"NEW",q:"2612188"}))assert.equal(url.searchParams.get(key),value);
  assert.ok(url.searchParams.get("from"));assert.ok(url.searchParams.get("to"));
  assert.equal(request.options.cache,"no-store");
  assert.ok(url.searchParams.get("_refresh"));
  request.resolve(response([{id:"new-order",invoiceNumber:"2612188",status:"NEW"}]));
  await pending;
  assert.match(f.root.html,/2612188/);
  assert.equal(f.button.disabled,false);
  assert.equal(f.button.attrs["aria-busy"],"false");
  assert.match(f.controls.get("[data-po-refresh-status]").textContent,/Ενημερώθηκε .*1 εγγραφές/);
});

test("outer commerce refresh targets the active suite and cancels unrelated catalog reload",async()=>{
  const f=fixture();f.suite.installPurchaseOrdersSuite();
  f.setFilters({q:"new filter"});
  let cancelled=false;
  const pending=f.listeners["purchase-orders:refresh"]({target:{closest:()=>f.hub},preventDefault(){cancelled=true}});
  assert.equal(cancelled,true);
  assert.equal(new URL(f.requests[0].url,"https://test.invalid").searchParams.get("q"),"new filter");
  f.requests[0].resolve(response());await pending;
  f.root.hidden=true;cancelled=false;
  f.listeners["purchase-orders:refresh"]({target:{closest:()=>f.hub},preventDefault(){cancelled=true}});
  assert.equal(cancelled,false);assert.equal(f.requests.length,2);
  assert.match(f.requests[1].url,/\/api\/commerce\/ai-reader\/fast-recover$/);
});

test("observer mutations do not remount an existing suite or trigger request loops",()=>{
  const f=fixture();f.suite.installPurchaseOrdersSuite();
  const listener=f.listeners["purchase-orders:refresh"];
  for(let i=0;i<5;i++)f.listeners.mutation();
  f.suite.installPurchaseOrdersSuite();
  assert.equal(f.requests.length,0);
  assert.equal(f.root.renderCount,undefined);
  assert.equal(f.listeners["purchase-orders:refresh"],listener);
});

test("a slow old response cannot overwrite a newer refresh",async()=>{
  const f=fixture();
  const old=f.suite.loadReport(f.root),latest=f.suite.loadReport(f.root);
  assert.notEqual(f.requests[0].url,f.requests[1].url);
  f.requests[1].resolve(response([{id:"latest",invoiceNumber:"LATEST"}]));await latest;
  f.requests[0].resolve(response([{id:"old",invoiceNumber:"OLD"}]));await old;
  assert.equal(f.suite.state.report.orders[0].id,"latest");
  assert.equal(f.root.renderCount,1);
  assert.equal(f.suite.state.loading,false);
});

test("failed refresh keeps previous orders and timestamp, displays error and re-enables retry",async()=>{
  const f=fixture();f.suite.state.report={orders:[{id:"existing"}]};
  const pending=f.suite.loadReport(f.root);f.requests[0].resolve(response([],false));await pending;
  assert.equal(f.suite.state.report.orders[0].id,"existing");
  assert.equal(f.suite.state.lastRefresh,null);
  assert.deepEqual(f.notices,[{text:"Η ανανέωση απέτυχε",error:true}]);
  assert.equal(f.button.disabled,false);
});

test("cleared filters are applied by search and invalid dates fail visibly without a request",async()=>{
  const f=fixture();f.suite.state.q="old";f.suite.state.storeId="old-store";
  f.setFilters({q:"",store:"",from:""});f.suite.bindRoot(f.root);
  await f.controls.get("[data-po-search]").click();
  assert.equal(f.suite.state.q,"");assert.equal(f.suite.state.storeId,"");
  assert.equal(f.requests.length,0);assert.equal(f.notices.length,1);
  assert.equal(f.button.disabled,false);
});

test("a response arriving after unmount cannot update another screen",async()=>{
  const f=fixture();const pending=f.suite.loadReport(f.root);
  f.root.isConnected=false;f.requests[0].resolve(response([{id:"detached"}]));await pending;
  assert.equal(f.suite.state.report,null);assert.equal(f.root.renderCount,undefined);
  assert.equal(f.suite.state.loading,false);
});
