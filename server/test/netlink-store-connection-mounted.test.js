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
