import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

test("mounted Owner voice panel rejects stale answers/status/speech and requires explicit current-store Ask",async()=>{
  const {build}=await import("esbuild"),{JSDOM}=await import("jsdom");
  const bundle=await build({stdin:{contents:'export {default} from "./client/src/components/voice/OwnerAssistantPanel.jsx"',resolveDir:fileURLToPath(new URL("../../",import.meta.url)),loader:"jsx"},bundle:true,write:false,format:"cjs",platform:"node",loader:{".css":"empty"},external:["react","react-dom","react-dom/client","react/jsx-runtime"]});
  const module={exports:{}};new Function("require","module","exports",bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const Panel=module.exports.default,dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid"}),keys=["window","document","navigator","HTMLElement","Event","IS_REACT_ACT_ENVIRONMENT"],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
  const recordings=[],calls=[],lateStatuses=[];let denied=false,deferAsk=false,lateAsk,deferStatus=false;
  class Recognition{constructor(){recordings.push(this);this.aborts=0}start(){this.starts=(this.starts||0)+1}stop(){}abort(){this.aborts++}}
  Object.defineProperty(window,"isSecureContext",{configurable:true,value:true});window.SpeechRecognition=Recognition;
  const scoped=id=>({available:true,scope:{companyId:"c",storeId:id,storeName:id,supportPreview:false}});
  const result=id=>({answer:`Answer ${id}`,highlights:[],limitations:"",scope:{companyId:"c",storeId:id},evidence:[{scope:"OWNER_SELECTED_STORE",companyId:"c",storeId:id,storeName:id,date:"2026-10-10",rows:[],totalRows:0}]});
  const api=async(url,options={})=>{calls.push({url,...options});const id=url.includes("/a/")?"a":"b";if(options.method==="POST")return deferAsk?new Promise(resolve=>lateAsk=resolve):result(id);if(deferStatus)return new Promise((resolve,reject)=>lateStatuses.push({resolve,reject,id}));if(denied)throw Error("MODULE_DISABLED");return scoped(id)};
  const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React,root=createRoot(document.getElementById("root"));
  const render=id=>act(async()=>root.render(React.createElement(Panel,{api,storeId:id,storeName:id}))),click=el=>act(async()=>el.dispatchEvent(new window.MouseEvent("click",{bubbles:true}))),ask=()=>document.querySelector('button[type="submit"]'),mic=()=>document.querySelector(".mws-voice-input-actions button"),field=()=>document.querySelector("textarea"),posts=()=>calls.filter(c=>c.method==="POST");
  const speak=text=>({results:[Object.assign([{transcript:text}],{isFinal:true})]});
  try{
    await render("");assert.equal(calls.length,0);assert.equal(mic().disabled,true);assert.equal(ask().disabled,true);
    await render("a");assert.equal(recordings.length,0);assert.equal(posts().length,0);assert.equal(mic().disabled,false);
    await click(mic());const first=recordings.at(-1);await act(async()=>{first.onstart();first.onresult(speak("Ποια διαφορά είχε το ταμείο;"));first.onend()});assert.equal(posts().length,0);assert.equal(field().value,"Ποια διαφορά είχε το ταμείο;");
    await act(async()=>window.dispatchEvent(new window.Event("myworkstation:modules-updated")));assert.equal(field().value,"Ποια διαφορά είχε το ταμείο;");assert.equal(ask().disabled,false);
    await click(ask());assert.equal(posts().length,1);assert.equal(posts()[0].url,"/api/owner-assistant/stores/a/ask");assert.equal(JSON.parse(posts()[0].body).inputChannel,"voice");assert.match(document.body.textContent,/Answer a/);assert.doesNotMatch(document.querySelector(".mws-cash-evidence").textContent,/Όλα τα επιτρεπόμενα/);
    deferAsk=true;await click(ask());const oldPost=posts().at(-1);await act(async()=>window.dispatchEvent(new window.Event("myworkstation:modules-updated")));assert.equal(oldPost.signal.aborted,false);assert.equal(field().value,"Ποια διαφορά είχε το ταμείο;");await render("b");assert.equal(oldPost.signal.aborted,true);assert.equal(field().value,"");await act(async()=>lateAsk(result("a")));assert.doesNotMatch(document.body.textContent,/Answer a/);
    await click(mic());const staleSpeech=recordings.at(-1),oldResult=staleSpeech.onresult,oldEnd=staleSpeech.onend;await act(async()=>window.dispatchEvent(new window.Event("myworkstation:modules-updated")));assert.equal(staleSpeech.aborts,0);denied=true;await act(async()=>window.dispatchEvent(new window.Event("myworkstation:modules-updated")));assert.equal(staleSpeech.aborts,1);denied=false;await render("");await act(async()=>{oldResult(speak("ΠΑΛΙΑ ΕΡΩΤΗΣΗ"));oldEnd()});assert.equal(staleSpeech.aborts,1);assert.equal(field().value,"");assert.equal(ask().disabled,true);
    denied=true;await render("a");assert.equal(mic().disabled,true);assert.match(document.querySelector('[role="alert"]').textContent,/MODULE_DISABLED/);assert.equal(posts().length,2);
    denied=false;deferStatus=true;await render("b");assert.equal(lateStatuses.length,1);await act(async()=>window.dispatchEvent(new window.Event("myworkstation:modules-updated")));assert.equal(lateStatuses.length,2);await act(async()=>lateStatuses[1].reject(Error("MODULE_DISABLED")));await act(async()=>lateStatuses[0].resolve(scoped("b")));assert.equal(mic().disabled,true);assert.equal(ask().disabled,true);assert.match(document.querySelector('[role="alert"]').textContent,/MODULE_DISABLED/);
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d]of prior)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}
});

test("actual CommerceHub assistant entry never falls back from blank/invalid/removed store to the first store",async()=>{
  const {build}=await import("esbuild"),{JSDOM}=await import("jsdom");
  const bundle=await build({stdin:{contents:'export {default} from "./client/src/components/commerce/CommerceHub.jsx"',resolveDir:fileURLToPath(new URL("../../",import.meta.url)),loader:"jsx"},bundle:true,write:false,format:"cjs",platform:"node",loader:{".css":"empty"},external:["react","react-dom","react-dom/client","react/jsx-runtime"],plugins:[{name:"unrelated-commerce-panels",setup(b){b.onResolve({filter:/^\.\/[^/]+\.jsx$/},args=>args.importer.endsWith("CommerceHub.jsx")?{path:args.path,namespace:"unrelated-panel"}:undefined);b.onLoad({filter:/.*/,namespace:"unrelated-panel"},()=>({contents:"export default function Unrelated(){return null}",loader:"jsx"}));b.onLoad({filter:/components\/commerce\/[^/]+\.jsx$/},args=>args.path.endsWith("CommerceHub.jsx")?undefined:{contents:"export default function Unrelated(){return null}",loader:"jsx"});b.onResolve({filter:/lucide-react/},()=>({path:"icons",namespace:"fixture"}));b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:'export const '+['Mic','Square','X','BarChart3','Boxes','Camera','ChevronRight','ClipboardCheck','ClipboardList','Clock3','FileScan','Files','LockKeyhole','PackagePlus','RadioTower','RefreshCw','ShoppingCart','Truck'].map(n=>`${n}=()=>null`).join(',')+';',loader:"jsx"}))}}]});
  const module={exports:{}};new Function("require","module","exports",bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid"}),keys=["window","document","navigator","HTMLElement","Event","localStorage","IS_REACT_ACT_ENVIRONMENT"],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
  const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React,root=createRoot(document.getElementById("root")),calls=[];
  const api=async(url)=>{calls.push(url);if(url.includes("owner-assistant"))return {available:true,scope:{companyId:"c",storeId:url.includes("/b/")?"b":"a"}};return {items:[],modules:[],products:[],inventory:[],suppliers:[],purchases:[],totals:{}}};
  const stores=[{id:"a",name:"A"},{id:"b",name:"B"}],render=(activeStoreId,available=stores)=>act(async()=>root.render(React.createElement(module.exports.default,{api,stores:available,activeStoreId})));
  try{
    await render("");await act(async()=>[...document.querySelectorAll("button")].find(el=>el.textContent==="Βοηθός Ιδιοκτήτη").click());assert.equal(calls.filter(x=>x.includes("owner-assistant")).length,0);assert.equal(document.querySelector("select").value,"");
    await render("foreign");assert.equal(calls.filter(x=>x.includes("owner-assistant")).length,0);
    await render("b");assert.equal(calls.filter(x=>x.includes("owner-assistant")).at(-1),"/api/owner-assistant/stores/b/status");assert.equal(document.querySelector("select").value,"b");
    const before=calls.filter(x=>x.includes("owner-assistant")).length;await render("b",[stores[0]]);assert.equal(document.querySelector("select").value,"");assert.equal(calls.filter(x=>x.includes("owner-assistant")).length,before);assert.equal(document.querySelector('button[type="submit"]').disabled,true);
  }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of prior)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}
});
