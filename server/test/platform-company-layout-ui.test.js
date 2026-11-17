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
  let companies=[a,b];const calls=[],unexpected=[],pending=new Map();
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
    else if(pathname.endsWith("/access-matrix")){
      const store=companies.flatMap(item=>item.stores).find(item=>pathname.includes(`/stores/${item.id}/`));
      data={company:a,store,licenseAllowed:true,summary:{},rows:[]};
    }
    else if(pathname==="/api/auth/logout")data={ok:true};
    else {unexpected.push({url,method});throw new Error(`Unexpected fixture route ${pathname}`);}
    if(pending.has(pathname))await pending.get(pathname).promise;
    return {ok:true,status:200,text:async()=>JSON.stringify(data),json:async()=>data};
  };
  const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React;
  const root=createRoot(document.getElementById("root"));
  const click=async el=>{assert.ok(el,"Expected mounted control");await act(async()=>el.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true})));};
  const button=name=>[...document.querySelectorAll("button")].find(el=>el.textContent===name);
  const select=async id=>{
    if(!document.querySelector(`[aria-label="Διαχείριση ${id}"]`))await click(document.querySelector('.platform-owner-toggle'));
    await click(document.querySelector(`[aria-label="Διαχείριση ${id}"]`));
  };
  const detail=()=>document.querySelector('.platform-company-detail');
  const search=async value=>{await act(async()=>{const el=document.querySelector('input[type="search"]');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));})};
  try{
    await act(async()=>root.render(React.createElement(App)));
    assert.equal(document.querySelectorAll('.platform-company-card').length,0);
    assert.equal(document.querySelectorAll('.platform-owner-toggle').length,1);
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
    const storeA2={id:"store-a2",name:"Store A2",active:true};
    companies=[{...a,stores:[a.stores[0],storeA2]},b];
    await click(document.querySelector('.platform-action-utility button'));
    const defer=pathname=>{
      let release,fail;
      const promise=new Promise((resolve,reject)=>{release=resolve;fail=reject;});pending.set(pathname,{promise});
      return error=>act(async()=>{pending.delete(pathname);if(error)fail(error);else release();});
    };
    const openStores=()=>click([...detail().querySelectorAll('button')].find(el=>el.textContent==='Καταστήματα'));
    const storeActions=store=>[...document.querySelectorAll('.security-list article')].find(el=>el.querySelector('b')?.textContent===store);
    const storeAction=(store,action)=>[...storeActions(store).querySelectorAll('button')].find(el=>el.textContent===action);
    await openStores();
    const finishOldTerminal=defer('/api/platform/companies/company-a/stores/store-a/installation-terminals');
    await click(storeAction('Store A','Εγκαταστάσεις / Τερματικά'));
    await click(storeAction('Store A2','Εγκαταστάσεις / Τερματικά'));
    const terminalDialog=()=>document.querySelector('.terminal-manager-dialog');
    assert.match(terminalDialog().querySelector('p').textContent,/Store A2/);
    await finishOldTerminal();assert.match(terminalDialog().querySelector('p').textContent,/Store A2/);
    await click(terminalDialog().querySelector('.modal-close'));

    const finishOldMatrix=defer('/api/platform/store-modules/companies/company-a/stores/store-a/access-matrix');
    await click(storeAction('Store A','Έλεγχος δικαιωμάτων'));
    await click(storeAction('Store A2','Έλεγχος δικαιωμάτων'));
    const matrix=()=>document.querySelector('.access-matrix-dialog');
    assert.match(matrix().querySelector('p').textContent,/Store A2/);
    await finishOldMatrix();assert.match(matrix().querySelector('p').textContent,/Store A2/);
    await click(matrix().querySelector('.modal-close'));

    const closeStores=()=>click(storeActions('Store A').closest('.platform-security-dialog').querySelector('.modal-close'));
    const finishClosedMatrix=defer('/api/platform/store-modules/companies/company-a/stores/store-a/access-matrix');
    await click(storeAction('Store A','Έλεγχος δικαιωμάτων'));
    await closeStores();
    await finishClosedMatrix();assert.equal(matrix(),null);

    await openStores();
    const finishClosedTerminal=defer('/api/platform/companies/company-a/stores/store-a/installation-terminals');
    await click(storeAction('Store A','Εγκαταστάσεις / Τερματικά'));
    await closeStores();
    await finishClosedTerminal(new Error('Late fixture terminal error'));
    assert.equal(terminalDialog(),null);assert.equal(document.querySelector('.platform-alert.error'),null);

    companies=[a,b];await click(document.querySelector('.platform-action-utility button'));
    const finishDeselectedTerminal=defer('/api/platform/companies/company-a/stores/store-a/installation-terminals');
    await click([...detail().querySelectorAll('button')].find(el=>el.textContent==='Τερματικά'));
    await select('Company B');await finishDeselectedTerminal();
    assert.equal(terminalDialog(),null);assert.match(detail().textContent,/Company B/);
    await select('Company A');
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
