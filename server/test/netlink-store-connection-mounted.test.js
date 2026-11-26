import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

async function fixture(path){
  const compiled=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",external:["react","react-dom","react/jsx-runtime"],loader:{".css":"empty"}});
  const module={exports:{}};new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const dom=new JSDOM('<div id="root"></div>',{url:"https://fixture.invalid/platform-admin"});
  const keys=["window","document","navigator","HTMLElement","Event","IS_REACT_ACT_ENVIRONMENT"],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
  const React=await import("react"),{createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root")),{act}=React;
  let mounted=true;
  return {dom,act,render:props=>act(async()=>root.render(React.createElement(module.exports.default,props))),unmount:async()=>{await act(async()=>root.unmount());mounted=false},close:async()=>{if(mounted)await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};

test("mounted credential form fences stores and unmount, serializes save and clears secret inputs",async()=>{
  const f=await fixture("../../client/src/components/platform/NetlinkConnectionForm.jsx"),calls=[],oldLoad=deferred(),pendingSave=deferred(),pendingCheck=deferred();
  let saveHeld=true,checkHeld=false;
  const request=async(url,options={})=>{
    calls.push({url,options});
    if(!options.method&&url.includes("/A/"))return oldLoad.promise;
    if(!options.method)return {connection:{configured:false,enabled:false}};
    if(options.method==="PUT")return saveHeld?pendingSave.promise:{connection:{configured:true,enabled:true,stationId:JSON.parse(options.body).stationId}};
    if(options.method==="POST")return checkHeld?pendingCheck.promise:{ok:true,message:"Κατάλογος διαθέσιμος. Η ταυτοποίηση καταστήματος εκκρεμεί."};
    return {connection:{configured:true,enabled:false,stationId:"C-station"}};
  };
  const render=storeId=>f.render({companyId:"company",storeId,request});
  const fill=async(name,value)=>f.act(async()=>{
    const input=document.querySelector(`[name="${name}"]`);Object.getOwnPropertyDescriptor(f.dom.window.HTMLInputElement.prototype,"value").set.call(input,value);input.dispatchEvent(new f.dom.window.Event("input",{bubbles:true}));
  });
  const submit=()=>f.act(async()=>document.querySelector("form").dispatchEvent(new f.dom.window.Event("submit",{bubbles:true,cancelable:true})));
  const click=label=>f.act(async()=>[...document.querySelectorAll("button")].find(b=>b.textContent===label).click());
  try{
    await render("A");await render("B");await f.act(async()=>oldLoad.resolve({connection:{configured:true,enabled:true,stationId:"OLD-A"}}));
    assert.doesNotMatch(document.body.textContent,/OLD-A/);assert.ok(calls.every(c=>!c.options.method));
    await fill("netlinkStationId","B-station");await fill("netlinkUsername","B-user");await fill("netlinkPassword","B-password");
    await submit();await submit();const saves=calls.filter(c=>c.options.method==="PUT");assert.equal(saves.length,1);assert.match(saves[0].url,/\/B\//);assert.deepEqual(JSON.parse(saves[0].options.body),{username:"B-user",password:"B-password",stationId:"B-station",enabled:false});
    await render("C");await f.act(async()=>pendingSave.resolve({connection:{configured:true,enabled:true,stationId:"OLD-B"}}));assert.doesNotMatch(document.body.textContent,/OLD-B/);assert.equal(document.querySelector('[name="netlinkPassword"]').value,"");
    saveHeld=false;await fill("netlinkStationId","C-station");await fill("netlinkUsername","C-user");await fill("netlinkPassword","C-password");await submit();
    assert.equal(document.querySelector('[name="netlinkPassword"]').value,"");assert.equal(document.querySelector('[name="netlinkUsername"]').value,"");assert.equal(document.querySelector('[name="netlinkStationId"]').value,"C-station");
    await click("Έλεγχος πρόσβασης χωρίς έκδοση");assert.match(document.querySelector('[role="status"]').textContent,/ταυτοποίηση.*εκκρεμεί/);assert.equal(calls.filter(c=>c.options.method==="POST").length,1);
    checkHeld=true;await click("Έλεγχος πρόσβασης χωρίς έκδοση");await f.unmount();const count=calls.length;await f.act(async()=>pendingCheck.resolve({ok:true,message:"OLD-C"}));assert.equal(calls.length,count);assert.equal(document.getElementById("root").textContent,"");
    assert.ok(calls.every(c=>!/prepare|execute/.test(c.url)));
  }finally{await f.close()}
});

test("mounted POS requests explicit store status/menu and discards previous store catalogue and reports",async()=>{
  const f=await fixture("../../client/src/components/commerce/NetlinkPosPanel.jsx"),calls=[],oldMenu=deferred(),oldReports=deferred();
  const request=async(url)=>{
    calls.push(url);
    if(url.includes("/reports/"))return oldReports.promise;
    if(url.includes("/status"))return {configured:true,executeEnabled:false};
    if(url.includes("/config"))return {configured:true};
    if(url.includes("/menu")){
      const store=new URL(url,"https://fixture.invalid").searchParams.get("storeId");
      if(store==="A")return oldMenu.promise;
      return {groups:[{title:"CAT-"+store,products:[]}]};
    }
    throw Error("Unexpected request "+url);
  };
  const render=storeId=>f.render({api:request,storeId,onClose:()=>{}});
  try{
    await render("A");await render("B");assert.match(document.body.textContent,/CAT-B/);
    await f.act(async()=>oldMenu.resolve({groups:[{title:"OLD-CAT-A",products:[]}]}));assert.doesNotMatch(document.body.textContent,/OLD-CAT-A/);assert.match(document.body.textContent,/CAT-B/);
    await f.act(async()=>[...document.querySelectorAll("button")].find(b=>b.textContent==="Αναφορές").click());
    assert.equal(calls.filter(u=>u.includes("/reports/")).length,3);assert.ok(calls.filter(u=>u.includes("/reports/")).every(u=>new URL(u,"https://fixture.invalid").searchParams.get("storeId")==="B"));
    await render("C");await f.act(async()=>oldReports.resolve({items:[{id:"old",productId:"OLD-REPORT-B"}],days:[],settlement:{}}));assert.doesNotMatch(document.body.textContent,/OLD-REPORT-B|CAT-B/);assert.match(document.body.textContent,/CAT-C/);
    assert.ok(calls.filter(u=>/\/status|\/menu/.test(u)).every(u=>new URL(u,"https://fixture.invalid").searchParams.has("storeId")));
    assert.ok(calls.every(u=>!/prepare|execute/.test(u)));
  }finally{await f.close()}
});

test("mounted common catalogue reads provider tabs and prints only fresh selected-store reports without execution",async()=>{
 const f=await fixture("../../client/src/components/commerce/NetlinkPosPanel.jsx"),calls=[],report=deferred();let hold=false,printed=0;
 const request=async url=>{calls.push(url);if(url.includes('/status'))return {configured:true,executeEnabled:false};if(url.includes('/config'))return {configured:true};if(url.includes('/menu'))return {data:{tabs:[{title:'airtime',groups:[{title:'Mobile',products:[{productId:'P',title:'Synthetic Card'},{productId:'D',title:'Disabled card',disabled:true}]}]}]}};if(url.includes('/reports/')){if(hold)return report.promise;return {items:[{id:'T',productId:'P',amount:10,status:'COMPLETED'}],totals:{completed:1,cardAmount:10},days:[],settlement:{},dailyBreakdown:[]}};throw Error(url)};
 const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
 try{
  await f.render({api:request,storeId:'SYNTHETIC-A',storeName:'Synthetic A',onClose:()=>{}});
  assert.match(document.body.textContent,/Synthetic Card/);assert.match(document.body.textContent,/1 διαθέσιμες υπηρεσίες/);assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Disabled card')).disabled,true);
  await f.act(async()=>button('Αναφορές').click());assert.equal(button('Εκτύπωση αναφοράς').disabled,false);
  const printDom=new JSDOM('<html><head></head><body></body></html>');window.open=()=>({document:printDom.window.document,focus(){},print(){printed++},close(){},addEventListener(){}});
  await f.act(async()=>button('Εκτύπωση αναφοράς').click());assert.equal(printed,1);assert.match(printDom.window.document.body.textContent,/Synthetic A/);assert.match(printDom.window.document.body.textContent,/Εσωτερική αναφορά/);
  hold=true;await f.act(async()=>button('Ανανέωση').click());assert.equal(button('Εκτύπωση αναφοράς').disabled,true);
  await f.render({api:request,storeId:'SYNTHETIC-B',storeName:'Synthetic B',onClose:()=>{}});await f.act(async()=>report.resolve({items:[{productId:'OLD-A'}]}));assert.doesNotMatch(document.body.textContent,/OLD-A/);
  assert.ok(calls.every(u=>!/prepare|execute/.test(u)));printDom.window.close();
 }finally{await f.close()}
});

test('backoffice paid recovery mounts the common selected-store review without a POS employee login or new checkout',async()=>{
 const f=await fixture('../../client/src/components/commerce/NetlinkPaidRecoveryWorkspace.jsx'),calls=[];let state='UNKNOWN';
 const item={requestId:'00000000-0000-4000-8000-000000000003',title:'Synthetic paid card 5€',status:state,paid:true,customerTotal:5.5,updatedAt:'2026-11-25T15:30:00Z',providerRequestId:'999999999999999999999999999'};
 const request=async(url,options={})=>{calls.push({url,body:options.body?JSON.parse(options.body):null});
  if(url.includes('/status'))return {configured:true,executeEnabled:false};if(url.includes('/config'))return {configured:true};if(url.includes('/menu'))return {groups:[]};
  if(url.includes('/nonexecution-review')){state='RECOVERY_READY';return {status:state}};
  if(url.endsWith('/recover-paid')){state='UNKNOWN';return {status:'UNKNOWN'}};
  if(url.includes('/issuance-intents?'))return {items:[{...item,status:state}],canAuthorizeRecovery:true,recoveryEnabled:true,recoveryStationId:'12345'};
  throw Error('Unexpected route '+url);
 };
 const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent===label);
 const fill=async(selector,value)=>f.act(async()=>{const input=document.querySelector(selector);Object.getOwnPropertyDescriptor(f.dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}))});
 try{
  await f.render({api:request,storeId:'A',storeName:'Synthetic A',onClose(){}});
  assert.match(document.body.textContent,/Synthetic paid card/);assert.match(document.body.textContent,/Χωρίς νέα είσπραξη ή απόδειξη/);assert.equal(button('Καταγραφή επιβεβαίωσης Netlink').disabled,true);
  await fill('input[placeholder="Αριθμός αιτήματος ή email παρόχου"]','Synthetic vendor incident confirms no execution');await fill('input[type="datetime-local"]','2026-11-26T09:32');
  await f.act(async()=>document.querySelector('input[type="checkbox"]').click());assert.equal(button('Καταγραφή επιβεβαίωσης Netlink').disabled,false);
  await f.act(async()=>document.querySelector('form').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(calls.filter(c=>c.url.endsWith('/nonexecution-review')).length,1);assert.equal(calls.filter(c=>c.url.endsWith('/recover-paid')).length,0);assert.match(document.body.textContent,/Επιβεβαιώθηκε μη εκτέλεση/);
  window.confirm=()=>true;await f.act(async()=>button('Ολοκλήρωση πληρωμένης κάρτας').click());assert.equal(calls.filter(c=>c.url.endsWith('/recover-paid')).length,1);assert.deepEqual(calls.find(c=>c.url.endsWith('/recover-paid')).body,{storeId:'A',fulfillExistingPaidPurchase:true});assert.match(document.body.textContent,/Μην κάνεις δεύτερη πληρωμή/);assert.equal(button('Ολοκλήρωση πληρωμένης κάρτας'),undefined);
  assert.ok(calls.every(c=>!/cash-received|checkout|\/issue$|\/execute|\/prepare/.test(c.url)));
 }finally{await f.close()}
});
