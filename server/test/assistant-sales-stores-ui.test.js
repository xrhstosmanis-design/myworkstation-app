import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const evidence={kind:"sales_by_store",scope:"PLATFORM_AUTHORIZED_STORES",result:"matched",mode:"names",names:["ΝΕΡΟ 500ML"],from:"2026-10-01",to:"2026-10-31",incompletePeriod:true,asOf:"2026-10-11",stores:[{companyId:"c",companyName:"Company",storeId:"s",storeName:"Store",result:"complete",grossSales:2,quantities:[{unit:"PIECE",quantity:4}]}],rows:[{companyId:"c",companyName:"Company",storeId:"s",storeName:"Store",name:"<img src=x>",unit:"PIECE",salesQuantity:4,grossSales:2,netSales:1.7699115044247788,vatValue:.23008849557522124}],totals:{grossSales:2,quantities:[{unit:"PIECE",quantity:4}]},unavailable:[]};
async function bundle(path){
 const {build}=await import("esbuild"),out=await build({stdin:{contents:`export {default} from "./${path}";`,resolveDir:fileURLToPath(new URL("../../",import.meta.url)),loader:"jsx"},bundle:true,write:false,format:"cjs",platform:"node",loader:{".css":"empty"},external:["react","react-dom","react-dom/client","react/jsx-runtime"],plugins:[{name:"unrelated-credit",setup(b){b.onLoad({filter:/AiCreditAlert\.jsx$/},()=>({contents:"export default function Panel(){return null}",loader:"jsx"}))}}]});
 const module={exports:{}};new Function("require","module","exports",out.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);return module.exports.default;
}
test("sales list renders each store and exact Greek source amounts, escapes names, and withholds missing/capped totals",async()=>{
 const Panel=await bundle("client/src/components/voice/SalesStoresEvidence.jsx"),React=await import("react"),{renderToStaticMarkup}=await import("react-dom/server");
 const render=r=>renderToStaticMarkup(React.createElement(Panel,{evidence:[r]}));
 const html=render(evidence);assert.match(html,/4 τεμάχια/);assert.match(html,/1,77/);assert.match(html,/0,23/);assert.match(html,/δεν έχει ολοκληρωθεί/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|grossSales|1\.7699/);
 for(const result of ["ambiguous","no_match","source_limited"]){const h=render({...evidence,result,candidates:["Άλφα 500 κουτί","Άλφα 500 φιάλη"]});assert.doesNotMatch(h,/<table|Σύνολο:/)}
 assert.doesNotMatch(render({...evidence,totals:null,unavailable:[{storeName:"Hidden",reason:"Module unavailable"}]}),/Σύνολο:/);
});
test("mounted Platform explicitly selects all stores, shows readable name report, withdraws late answers and removed membership",async()=>{
 const Center=await bundle("client/src/components/platform/AiCommandCenter.jsx"),{JSDOM}=await import("jsdom"),dom=new JSDOM('<div id="root"></div>',{url:"https://fixture.invalid"});
 const keys=["window","document","navigator","HTMLElement","Event","IS_REACT_ACT_ENVIRONMENT"],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
 const companies=[{id:"c",name:"Company",active:true,stores:[{id:"s",name:"Store",active:true}]}];let posts=[],defer=false,late,recording;
 class Recognition{constructor(){recording=this}start(){}abort(){}stop(){}}window.SpeechRecognition=Recognition;Object.defineProperty(window,"isSecureContext",{configurable:true,value:true});
 const request=async(url,options={})=>{if(options.method==="POST"){posts.push(options);if(defer)return new Promise(resolve=>late=resolve);return {answer:"grossSales netSales1.769911",highlights:["raw PIECE"],evidence:[evidence]}}if(url.includes("cash-control"))return {totals:{},stores:[]};if(url.includes("invoice-learning"))return {state:{documents:[],profiles:{}}};return {items:[]}};
 const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React,root=createRoot(document.getElementById("root"));
 const all=()=>[...document.querySelectorAll('input[type="checkbox"]')].find(x=>x.parentElement.textContent.includes("όλα τα ενεργά καταστήματα")),click=el=>act(async()=>el.dispatchEvent(new window.MouseEvent("click",{bubbles:true})));
 const ask=async()=>{await click(document.querySelector(".mws-voice-input-actions button"));await act(async()=>{recording.onstart();recording.onresult({results:[Object.assign([{transcript:"Πόσα νερά από1/10 έως31/10 ανά κατάστημα;"}],{isFinal:true})]});recording.onend()});await click(document.querySelector('.ai-command-ask button[type="submit"]'))};
 try{
  await act(async()=>root.render(React.createElement(Center,{request,companies})));assert.equal(all().checked,false);
  await click(all());await ask();assert.equal(JSON.parse(posts[0].body).readScope,"all_stores");assert.equal(JSON.parse(posts[0].body).selection,null);assert.equal(document.querySelector(".mws-cash-evidence"),null);assert.ok(document.querySelector(".mws-sales-stores-evidence"));assert.equal(document.querySelector(".ai-command-answer img"),null);assert.doesNotMatch(document.querySelector(".ai-command-answer").textContent,/grossSales|netSales|PIECE|1\.7699/);
  await act(async()=>root.render(React.createElement(Center,{request,companies:[...companies]})));assert.ok(document.querySelector(".mws-sales-stores-evidence"));
  await act(async()=>root.render(React.createElement(Center,{request,companies:[]})));assert.equal(document.querySelector(".mws-sales-stores-evidence"),null);assert.equal(document.querySelector("textarea").value,"");
  await act(async()=>root.render(React.createElement(Center,{request,companies})));defer=true;await ask();await click(all());assert.equal(posts[1].signal.aborted,true);await act(async()=>late({answer:"LATE",evidence:[evidence]}));assert.equal(document.querySelector(".mws-sales-stores-evidence"),null);assert.doesNotMatch(document.body.textContent,/LATE/);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,v] of prior)v?Object.defineProperty(globalThis,k,v):delete globalThis[k]}
});
test("mounted Owner scope selection is explicit, posts own_stores and withdraws an answer on changed store membership",async()=>{
 const Panel=await bundle("client/src/components/voice/OwnerAssistantPanel.jsx"),{JSDOM}=await import("jsdom"),dom=new JSDOM('<div id="root"></div>',{url:"https://fixture.invalid"});
 const keys=["window","document","navigator","HTMLElement","Event","IS_REACT_ACT_ENVIRONMENT"],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
 let recording,scopeKey="initial",post;
 class Recognition{constructor(){recording=this}start(){}abort(){}stop(){}}window.SpeechRecognition=Recognition;Object.defineProperty(window,"isSecureContext",{configurable:true,value:true});
 const scope={companyId:"c",storeId:"s",storeName:"Store"},api=async(url,opts={})=>{if(opts.method==="POST"){post=JSON.parse(opts.body);return {scope,answer:"RAW",evidence:[{...evidence,scope:"OWNER_OWN_STORES"}]}}return {available:true,scope,supported:["sales_by_store"],salesScopeKey:url.includes("own_stores")?scopeKey:null}};
 const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React,root=createRoot(document.getElementById("root")),click=el=>act(async()=>el.dispatchEvent(new window.MouseEvent("click",{bubbles:true})));
 try{
  await act(async()=>root.render(React.createElement(Panel,{api,storeId:"s",storeName:"Store"})));assert.equal(document.querySelector('input[type="checkbox"]').checked,false);
  await click(document.querySelector('input[type="checkbox"]'));await click(document.querySelector(".mws-voice-input-actions button"));await act(async()=>{recording.onstart();recording.onresult({results:[Object.assign([{transcript:"Πόσα νερά χθες ανά κατάστημα;"}],{isFinal:true})]});recording.onend()});await click(document.querySelector('button[type="submit"]'));
  assert.equal(post.readScope,"own_stores");assert.ok(document.querySelector(".mws-sales-stores-evidence"));assert.equal(document.querySelector(".mws-cash-evidence"),null);
  scopeKey="revoked";await act(async()=>window.dispatchEvent(new window.Event("myworkstation:modules-updated")));assert.equal(document.querySelector(".mws-sales-stores-evidence"),null);assert.equal(document.querySelector("textarea").value,"");
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,v] of prior)v?Object.defineProperty(globalThis,k,v):delete globalThis[k]}
});
