import test from "node:test";
import assert from "node:assert/strict";

// Real parent and Command Center; other panels and every API are isolated fixtures.
// This does not exercise server permissions, business actions or a live store.
test("approved Platform home keeps company selection and routes existing actions without writes",async t=>{
  const {build}=await import("esbuild");
  const {JSDOM}=await import("jsdom");
  const {createRequire}=await import("node:module");
  const {fileURLToPath}=await import("node:url");
  const path=await import("node:path");
  const keep=new Set(["PlatformAdminApp.jsx","PlatformCompanyWorkspace.jsx"]);
  const result=await build({
    stdin:{contents:'export {default} from "./client/src/components/platform/PlatformAdminApp.jsx";',resolveDir:fileURLToPath(new URL("../../",import.meta.url)),loader:"jsx"},
    bundle:true,write:false,format:"cjs",platform:"node",
    external:["react","react-dom","react-dom/client","react/jsx-runtime"],loader:{".css":"empty"},
    plugins:[{name:"isolated-panels",setup(b){b.onLoad({filter:/\.jsx$/},args=>{
      const name=path.basename(args.path);if(keep.has(name))return;
      if(name==="PlatformSecureLogin.jsx")return {contents:'import React from "react";export default function Login(p){return <button data-fixture-login onClick={()=>p.onLogin({id:"fixture-next-user",fullName:"Fixture Next"})}>Fixture login</button>}',loader:"jsx"};
      return {contents:'import React from "react";export default function Panel(p){return <section data-fixture="'+name+'" data-store={p.store?.id||p.manager?.store?.id||""} data-company={p.company?.id||p.manager?.company?.id||""}>{p.onClose&&<button onClick={p.onClose}>Fixture close</button>}</section>}',loader:"jsx"};
    })}}]
  });
  const module={exports:{}};
  new Function("require","module","exports",result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const App=module.exports.default,dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid/platform-admin"});
  const keys=["window","document","navigator","HTMLElement","Event","CustomEvent","MutationObserver","localStorage","sessionStorage","fetch","IS_REACT_ACT_ENVIRONMENT"];
  const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
  localStorage.setItem("token","fixture-only");localStorage.setItem("platformUser",JSON.stringify({id:"fixture-user",fullName:"Fixture User"}));
  const company=(id,name,storeId,storeName)=>({id,name,active:true,plan:"BASIC",modules:[],stores:[{id:storeId,name:storeName,active:true}]});
  const a={...company("company-a","Company A","store-a","Store A"),taxId:"001234567"},b={...company("company-b","Company B","store-b","Store B"),taxId:"987654321",owner:{id:"owner-a",fullName:"Owner A",email:"owner@example.invalid"}};
  let companies=[a,b];const calls=[],unexpected=[];
  globalThis.fetch=async(url,options={})=>{
    const method=options.method||"GET",pathname=new URL(url,"https://isolated.invalid").pathname;
    calls.push({url,method});
    if(method!=="GET"&&!(pathname==="/api/auth/logout"&&method==="POST")){
      unexpected.push({url,method});throw new Error("Unexpected fixture write");
    }
    let data;
    if(pathname==="/api/platform/overview")data={companies,stats:{}};
    else if(pathname==="/api/platform/owners")data={owners:[{id:"owner-a",fullName:"Owner A",email:"owner@example.invalid",companyId:"company-a",companyIds:["company-a","company-b"]}]};
    else if(pathname==="/api/platform/backup-monitoring")data={configured:false};
    else if(pathname==="/api/platform/cash-control/daily")data={totals:{},stores:[],rows:[]};
    else if(pathname==="/api/transactions/supplier-settlements/review"||pathname==="/api/transactions/bank-ledger/review")data={items:[]};
    else if(pathname==="/api/platform/invoice-learning/workspace")data={state:{documents:[],profiles:{}}};
    else if(/^\/api\/platform\/companies\/[^/]+\/stores\/[^/]+\/(installation-terminals|device-routing|video-connection)$/.test(pathname))data={terminals:[],fiscalDevices:[],eftposDevices:[],cameras:[]};
    else if(pathname==="/api/auth/logout")data={ok:true};
    else {unexpected.push({url,method});throw new Error(`Unexpected fixture route ${pathname}`);}
    return {ok:true,status:200,text:async()=>JSON.stringify(data),json:async()=>data};
  };
  const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React;
  const root=createRoot(document.getElementById("root"));
  const click=async el=>{assert.ok(el,"Expected mounted control");await act(async()=>el.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true})));};
  const button=name=>[...document.querySelectorAll("button")].find(el=>el.textContent===name);
  const select=id=>click(document.querySelector(`[aria-label="Διαχείριση ${id}"]`));
  const detail=()=>document.querySelector('.platform-company-detail');
  const search=async value=>{await act(async()=>{const el=document.querySelector('input[type="search"]');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));})};
  try{
    await act(async()=>root.render(React.createElement(App)));
    assert.equal(document.querySelectorAll('.platform-company-card').length,2);
    assert.match(detail().textContent,/Επιλέξτε εταιρεία/);
    await select('Company B');assert.match(detail().textContent,/Company B/);
    assert.equal([...detail().querySelectorAll('button')].find(el=>el.textContent==='Νέος κωδικός').disabled,true,'linked owner password guard remains');
    await click([...detail().querySelectorAll('button')].find(el=>el.textContent==='Στοιχεία εταιρείας'));
    assert.equal(document.querySelector('[data-fixture="CompanyIdentityEditor.jsx"]').dataset.company,'company-b');
    await click(document.querySelector('[data-fixture="CompanyIdentityEditor.jsx"] button'));
    await search('001234567');assert.equal(document.querySelectorAll('.platform-company-card').length,1);
    assert.match(detail().textContent,/προηγούμενη επιλογή/);assert.equal(detail().querySelector('button'),null);
    await search('');await select('Company A');
    companies=[{...a,name:'Updated A'},b];await click(document.querySelector('.platform-action-utility button'));
    assert.match(detail().textContent,/Updated A/);assert.doesNotMatch(detail().textContent,/Company B/);
    await click([...detail().querySelectorAll('button')].find(el=>el.textContent==='Καταστήματα'));
    const dialog=[...document.querySelectorAll('.platform-modal')].find(el=>el.textContent.includes('Καταστήματα πελάτη'));
    assert.match(dialog.textContent,/Store A/);assert.doesNotMatch(dialog.textContent,/Store B/);
    await click(dialog.querySelector('.modal-close'));
    await click([...detail().querySelectorAll('button')].find(el=>el.textContent==='Τερματικά'));
    assert.ok(calls.some(c=>c.url.includes('/companies/company-a/stores/store-a/installation-terminals')));
    assert.ok(document.querySelector('.terminal-manager-dialog'));
    await click(document.querySelector('.terminal-manager-dialog .modal-close'));
    companies=[b];await click(document.querySelector('.platform-action-utility button'));
    assert.match(detail().textContent,/προηγούμενη επιλογή/);
    await click(button('Εργαλεία'));assert.equal(document.querySelector('[aria-label="Εργαλεία"]').hidden,false);
    assert.equal(document.querySelector('[aria-label="Οικονομικά και έλεγχοι"]').hidden,true);
    await click(button('Demo πελατών · Προετοιμασία'));assert.ok(document.querySelector('[data-fixture="CustomerDemoCenter.jsx"]'));
    await click(document.querySelector('[data-fixture="CustomerDemoCenter.jsx"] button'));
    await click(button('Οικονομικά & Έλεγχοι'));assert.equal(document.querySelector('[aria-label="Οικονομικά και έλεγχοι"]').hidden,false);
    await click(button('Πελάτες'));assert.equal(document.querySelector('[aria-label="Εργαλεία"]').hidden,true);
    assert.equal(document.querySelector('.platform-workspace').parentElement.hidden,false);
    await click(button('Νέα εταιρεία / ΑΦΜ'));assert.match(document.querySelector('.platform-owner-picker').textContent,/Owner A/);
    await click(document.querySelector('.platform-owner-picker button'));assert.equal(document.querySelector('.platform-owner-picker'),null);
    assert.match(document.querySelector('.platform-modal').textContent,/Owner A/);
    assert.deepEqual(unexpected,[]);assert.ok(calls.every(c=>c.method==='GET'),'home navigation must never write business data');
  }finally{
    await act(async()=>root.unmount());dom.window.close();
    for(const[k,v]of previous)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];
  }
});
