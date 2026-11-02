import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {JSDOM} from "jsdom";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

// Mount the real payments form and acquisition implementation. Supplier/bank,
// scanner, focus and image-quality boundaries have their own retained suites.
async function component(){
 const output=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/store/StorePosPaymentsModal.jsx",import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",loader:{".css":"empty"},plugins:[{name:"expense-boundaries",setup(b){
  b.onResolve({filter:/^react$/},()=>({path:"react",external:true}));
  b.onResolve({filter:/\.css$/},()=>({path:"style",namespace:"expense-fixture"}));b.onLoad({filter:/^style$/,namespace:"expense-fixture"},()=>({contents:""}));
  b.onResolve({filter:/^lucide-react$/},()=>({path:"icons",namespace:"expense-fixture"}));b.onLoad({filter:/^icons$/,namespace:"expense-fixture"},()=>({contents:"export const Camera=()=>null,FileText=()=>null,Upload=()=>null,Wallet=()=>null,X=()=>null;"}));
  b.onResolve({filter:/\.\/((StoreSupplier|StoreBank|StorePending|DocumentScan|DocumentCameraFocus).*)\.jsx$/},()=>({path:"child",namespace:"expense-fixture"}));b.onLoad({filter:/^child$/,namespace:"expense-fixture"},()=>({contents:"export default function Child(){return null}"}));
  b.onResolve({filter:/PosDialogFrame\.jsx$/},()=>({path:"frame",namespace:"expense-fixture"}));b.onLoad({filter:/^frame$/,namespace:"expense-fixture"},()=>({contents:'import React from "react";export default function Frame({children}){return React.createElement("div",null,children)}'}));
  b.onResolve({filter:/document-image-quality\.js$/},()=>({path:"quality",namespace:"expense-fixture"}));b.onLoad({filter:/^quality$/,namespace:"expense-fixture"},()=>({contents:"export async function prepareDocumentFile(file){return {file}}"}));
 }}]});
 const m={exports:{}};new Function("require","module","exports",output.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);return m.exports.default;
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
async function environment(run){
 const dom=new JSDOM("<div id='root'></div>",{url:"https://localhost"});
 const keys=["window","document","navigator","HTMLElement","File","FileReader","CustomEvent","localStorage","IS_REACT_ACT_ENVIRONMENT"],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
 const plays=[],pauses=[];let play=async()=>{};
 dom.window.HTMLMediaElement.prototype.play=function(){plays.push(this);return play(this)};
 dom.window.HTMLMediaElement.prototype.pause=function(){pauses.push(this)};
 dom.window.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
 dom.window.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new dom.window.Blob(["synthetic receipt"],{type:"image/jpeg"}))};
 globalThis.FileReader=class{readAsDataURL(){this.result="data:image/jpeg;base64,c3ludGhldGlj";queueMicrotask(()=>this.onload?.())}};
 const React=await import("react"),{createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"));
 const click=async text=>React.act(async()=>{const button=[...document.querySelectorAll("button")].find(x=>x.textContent===text);assert.ok(button,`button ${text}`);button.click();await Promise.resolve()});
 const change=async(el,value)=>React.act(async()=>{assert.ok(el);Object.getOwnPropertyDescriptor(el.tagName==="SELECT"?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,"value").set.call(el,value);el.dispatchEvent(new dom.window.Event("input",{bubbles:true}));el.dispatchEvent(new dom.window.Event("change",{bubbles:true}))});
 const field=text=>[...document.querySelectorAll("label")].find(x=>x.textContent.startsWith(text))?.querySelector("input,select");
 const media=value=>Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:{getUserMedia:value}});
 try{await run({React,root,dom,click,change,field,media,plays,pauses,setPlay:value=>{play=value}})}finally{await React.act(async()=>root.unmount());dom.window.close();for(const k of keys){const descriptor=saved.get(k);if(descriptor)Object.defineProperty(globalThis,k,descriptor);else delete globalThis[k]}}
}
const category=(id,description=id)=>({id,description,active:true});
function stream(){let stops=0;const track={getCapabilities:()=>({}),stop(){stops++}};return {getTracks:()=>[track],getVideoTracks:()=>[track],get stops(){return stops}}}
function fixture({categories=async()=>({items:[]}),post=async()=>({id:"expense"})}={}){
 const calls=[],errors=[];let closes=0;
 const api=async(path,options)=>{calls.push({path,options});if(path==="/api/management/expense-categories")return categories();if(path.endsWith("/overview"))return {openSession:{openedAt:new Date().toISOString()}};if(path.endsWith("/access"))return {access:{supplierPayment:true,thirdPartyPayment:true,sameShiftPayments:true}};if(path.endsWith("/payroll-employees"))return {items:[{id:"employee",fullName:"LAB EMPLOYEE"}]};if(options?.method==="POST")return post();return {items:[]}};
 return {api,calls,errors,get closes(){return closes},props:{api,store:{id:"own",name:"LAB"},runtimeAccess:{supplierPayment:true,thirdPartyPayment:true,sameShiftPayments:true},initialPaymentType:"OTHER_EXPENSE",onClose:()=>closes++,setMessage(){},setError:error=>errors.push(error)}};
}
async function readyExpense(h){await h.click("1");await h.change(h.field("Παρατηρήσεις"),"synthetic LAB expense");const ack=[...document.querySelectorAll('input[type="checkbox"]')].find(x=>x.parentElement.textContent.includes("Δήλωση ευθύνης"));await h.React.act(async()=>ack.click())}

const Modal=await component();
test("expense camera binds after delayed React commit instead of a lost zero-delay timer",async()=>environment(async h=>{
 const permission=deferred(),s=stream(),f=fixture();h.media(()=>permission.promise);
 await h.React.act(async()=>h.root.render(h.React.createElement(Modal,f.props)));await h.click(" Λήψη από κάμερα");
 // Hold the commit while the browser permission resolves. A setTimeout(0)
 // attachment runs without a video node and permanently loses the stream.
 await h.React.act(async()=>{permission.resolve(s);await new Promise(resolve=>setTimeout(resolve,25))});
 const video=document.querySelector("video");assert.ok(video);assert.equal(video.srcObject,s);assert.deepEqual(h.plays,[video]);assert.equal(f.calls.filter(x=>x.options?.method==="POST").length,0);
 await h.click("Κλείσιμο κάμερας");assert.equal(document.querySelector("video"),null);assert.equal(video.srcObject,null);assert.ok(s.stops>0);assert.ok(h.pauses.includes(video));
}));

test("pending permissions are fenced on return, unmount, store change and competing opens",async()=>{
 for(const action of ["return","unmount","store","competing"])await environment(async h=>{
  const a=deferred(),b=deferred(),old=stream(),fresh=stream(),f=fixture();let opens=0;h.media(()=>++opens===1?a.promise:b.promise);
  await h.React.act(async()=>h.root.render(h.React.createElement(Modal,f.props)));await h.click(" Λήψη από κάμερα");
  if(action==="return")await h.click("← Όλες οι πληρωμές");
  if(action==="unmount")await h.React.act(async()=>h.root.render(null));
  if(action==="store")await h.React.act(async()=>h.root.render(h.React.createElement(Modal,{...f.props,store:{id:"other"}})));
  if(action==="competing"){await h.click(" Λήψη από κάμερα");await h.React.act(async()=>b.resolve(fresh));assert.equal(document.querySelector("video")?.srcObject,fresh)}
  await h.React.act(async()=>a.resolve(old));assert.ok(old.stops>0);assert.notEqual(document.querySelector("video")?.srcObject,old);assert.equal(h.plays.length,action==="competing"?1:0);
 });
});

test("denial and playback failure show errors, stop tracks and allow a fresh open",async()=>environment(async h=>{
 const f=fixture(),s=stream();let opens=0;h.media(async()=>{if(++opens===1)throw Error("Permission denied");return opens===2?s:fresh});
 const fresh=stream();
 await h.React.act(async()=>h.root.render(h.React.createElement(Modal,f.props)));await h.click(" Λήψη από κάμερα");assert.match(document.body.textContent,/Permission denied/);assert.equal(document.querySelector("video"),null);
 h.setPlay(async()=>{throw Error("Playback denied")});await h.click(" Λήψη από κάμερα");assert.match(document.body.textContent,/Δεν άνοιξε η ζωντανή εικόνα/);assert.equal(document.querySelector("video"),null);assert.ok(s.stops>0);
 h.setPlay(async()=>{});await h.click(" Λήψη από κάμερα");assert.equal(document.querySelector("video")?.srcObject,fresh);
}));

test("late playback rejection cannot close or report against a newer camera",async()=>environment(async h=>{
 const f=fixture(),old=stream(),fresh=stream(),play=deferred();let opens=0;h.media(async()=>++opens===1?old:fresh);h.setPlay(()=>play.promise);
 await h.React.act(async()=>h.root.render(h.React.createElement(Modal,f.props)));await h.click(" Λήψη από κάμερα");await h.click("Κλείσιμο κάμερας");h.setPlay(async()=>{});await h.click(" Λήψη από κάμερα");
 await h.React.act(async()=>play.reject(Error("old playback")));assert.equal(document.querySelector("video")?.srcObject,fresh);assert.doesNotMatch(document.body.textContent,/old playback/);assert.equal(fresh.stops,0);
}));

test("captured camera frame attaches once for review without submitting an expense",async()=>environment(async h=>{
 const s=stream(),f=fixture();h.media(async()=>s);await h.React.act(async()=>h.root.render(h.React.createElement(Modal,f.props)));await h.click(" Λήψη από κάμερα");const video=document.querySelector("video");for(const [key,value] of Object.entries({readyState:2,videoWidth:1200,videoHeight:1600}))Object.defineProperty(video,key,{configurable:true,value});
 await h.click(" Φωτογράφιση");assert.equal(document.querySelector("video"),null);assert.match(document.body.textContent,/parastatiko-\d+\.jpg/);assert.equal(f.calls.filter(x=>x.options?.method==="POST").length,0);assert.equal(f.closes,0);assert.ok(s.stops>0);
}));

test("category dropdown stays visible while loading, empty and failed; retry loads central active choices",async()=>environment(async h=>{
 const first=deferred();let count=0;const f=fixture({categories:()=>++count===1?first.promise:Promise.resolve({items:[category("central","ΚΕΝΤΡΙΚΗ"),{...category("inactive"),active:false}]})});
 await h.React.act(async()=>h.root.render(h.React.createElement(Modal,f.props)));assert.ok(h.field("Κατηγορία εξόδου"));assert.equal(h.field("Κατηγορία εξόδου").disabled,true);assert.match(document.body.textContent,/Φόρτωση κατηγοριών/);
 await h.React.act(async()=>first.reject(Error("catalog unavailable")));assert.match(document.body.textContent,/catalog unavailable/);assert.equal(h.field("Κατηγορία εξόδου").disabled,true);await readyExpense(h);await h.click(" Καταχώριση εξόδου");assert.equal(f.calls.filter(x=>x.options?.method==="POST").length,0);
 await h.click("Επανάληψη");assert.equal(h.field("Κατηγορία εξόδου").disabled,false);assert.match(document.body.textContent,/ΚΕΝΤΡΙΚΗ/);assert.doesNotMatch(document.body.textContent,/inactive/);assert.equal(f.closes,0);
}));

test("empty catalog explains central setup and refresh picks new categories without closing form",async()=>environment(async h=>{
 let items=[];const f=fixture({categories:async()=>({items})});await h.React.act(async()=>h.root.render(h.React.createElement(Modal,f.props)));assert.ok(h.field("Κατηγορία εξόδου"));assert.match(document.body.textContent,/Διαχείριση → Κατηγορίες εξόδων/);
 await h.click("1");items=[category("new","ΝΕΑ ΚΕΝΤΡΙΚΗ")];await h.click("Ανανέωση κατηγοριών");assert.match(document.body.textContent,/ΝΕΑ ΚΕΝΤΡΙΚΗ/);assert.equal(h.field("Ποσό").value,"1");assert.equal(f.closes,0);
}));

test("category refresh clears deactivated selection and requires a current central choice before POST",async()=>environment(async h=>{
 let items=[category("a","Α"),category("b","Β")];const f=fixture({categories:async()=>({items})});await h.React.act(async()=>h.root.render(h.React.createElement(Modal,f.props)));await h.change(h.field("Κατηγορία εξόδου"),"a");await readyExpense(h);
 items=[category("b","Β")];await h.click("Ανανέωση κατηγοριών");assert.equal(h.field("Κατηγορία εξόδου").value,"");await h.click(" Καταχώριση εξόδου");assert.equal(f.calls.filter(x=>x.options?.method==="POST").length,0);assert.match(document.body.textContent,/Επίλεξε κατηγορία/);
 await h.change(h.field("Κατηγορία εξόδου"),"b");await h.click(" Καταχώριση εξόδου");const posts=f.calls.filter(x=>x.options?.method==="POST");assert.equal(posts.length,1);const body=JSON.parse(posts[0].options.body);assert.equal(body.expenseCategoryId,"b");assert.equal(body.type,"OTHER_EXPENSE");assert.equal(body.amount,1);assert.equal(body.evidenceMode,"NO_DOCUMENT");assert.equal(f.closes,1);
}));

test("catalog requests fence earlier responses across store switches",async()=>environment(async h=>{
 const old=deferred(),later=deferred();let requests=0;const f=fixture({categories:()=>++requests===1?old.promise:requests===2?later.promise:Promise.resolve({items:[category("latest")]})});
 await h.React.act(async()=>h.root.render(h.React.createElement(Modal,f.props)));await h.React.act(async()=>h.root.render(h.React.createElement(Modal,{...f.props,store:{id:"other",name:"OTHER"}})));await h.React.act(async()=>later.resolve({items:[category("new-store")]}));
 await h.React.act(async()=>old.resolve({items:[category("old-store")]}));assert.match(document.body.textContent,/new-store/);assert.doesNotMatch(document.body.textContent,/old-store/);assert.equal(h.field("Κατηγορία εξόδου").value,"");
 await h.click("Ανανέωση κατηγοριών");assert.match(document.body.textContent,/latest/);assert.doesNotMatch(document.body.textContent,/new-store/);
}));

test("payroll omits a carried category binding",async()=>environment(async h=>{
 const f=fixture({categories:async()=>({items:[category("normal")]})});await h.React.act(async()=>h.root.render(h.React.createElement(Modal,f.props)));await h.change(h.field("Κατηγορία εξόδου"),"normal");await h.click("← Όλες οι πληρωμές");await h.click("Μισθοδοσία");
 await h.change(h.field("Εργαζόμενος"),"employee");await h.change(h.field("Περίοδος μισθοδοσίας"),"2026-11");await h.change(h.field("Αιτιολογία"),"synthetic rest day");await h.click("1");const ack=[...document.querySelectorAll('input[type="checkbox"]')].find(x=>x.parentElement.textContent.includes("Δήλωση ευθύνης"));await h.React.act(async()=>ack.click());await h.click(" Καταχώριση μισθοδοσίας");
 const posts=f.calls.filter(x=>x.options?.method==="POST");assert.equal(posts.length,1);assert.equal(JSON.parse(posts[0].options.body).expenseCategoryId,undefined);assert.match(JSON.parse(posts[0].options.body).description,/ΜΙΣΘΟΔΟΣΙΑ/);
}));

test("an opened camera stops on store change or withdrawal of expense permission",async()=>{
 for(const action of ["store","permission"])await environment(async h=>{
  const s=stream(),f=fixture();h.media(async()=>s);await h.React.act(async()=>h.root.render(h.React.createElement(Modal,f.props)));await h.click(" Λήψη από κάμερα");const oldVideo=document.querySelector("video");assert.equal(oldVideo.srcObject,s);
  await h.React.act(async()=>h.root.render(h.React.createElement(Modal,action==="store"?{...f.props,store:{id:"other"}}:{...f.props,runtimeAccess:{supplierPayment:true,thirdPartyPayment:false,sameShiftPayments:true}})));
  assert.equal(document.querySelector("video"),null);assert.equal(oldVideo.srcObject,null);assert.ok(s.stops>0);assert.equal(f.calls.filter(x=>x.options?.method==="POST").length,0);
 });
});

test("a pending category refresh blocks ordinary expense, while an empty loaded catalog keeps legacy flow",async()=>environment(async h=>{
 const refresh=deferred();let requests=0;const f=fixture({categories:()=>++requests===1?Promise.resolve({items:[]}):refresh.promise});
 await h.React.act(async()=>h.root.render(h.React.createElement(Modal,f.props)));await readyExpense(h);await h.click("Ανανέωση κατηγοριών");await h.click(" Καταχώριση εξόδου");assert.equal(f.calls.filter(x=>x.options?.method==="POST").length,0);assert.match(document.body.textContent,/Περίμενε να φορτωθούν/);
 await h.React.act(async()=>refresh.resolve({items:[]}));await h.click(" Καταχώριση εξόδου");const posts=f.calls.filter(x=>x.options?.method==="POST");assert.equal(posts.length,1);assert.equal(JSON.parse(posts[0].options.body).expenseCategoryId,undefined);
}));

test("payroll works when the central category request fails",async()=>environment(async h=>{
 const f=fixture({categories:async()=>{throw Error("catalog unavailable")}});await h.React.act(async()=>h.root.render(h.React.createElement(Modal,{...f.props,initialPaymentType:"PAYROLL"})));
 assert.equal(h.field("Κατηγορία εξόδου"),undefined);await h.change(h.field("Εργαζόμενος"),"employee");await h.change(h.field("Περίοδος μισθοδοσίας"),"2026-11");await h.change(h.field("Αιτιολογία"),"synthetic rest day");await h.click("1");const ack=[...document.querySelectorAll('input[type="checkbox"]')].find(x=>x.parentElement.textContent.includes("Δήλωση ευθύνης"));await h.React.act(async()=>ack.click());await h.click(" Καταχώριση μισθοδοσίας");assert.equal(f.calls.filter(x=>x.options?.method==="POST").length,1);
}));

test("newer same-store category entry wins over a late manual refresh",async()=>environment(async h=>{
 const old=deferred(),latest=deferred();let requests=0;const f=fixture({categories:()=>++requests===1?Promise.resolve({items:[category("initial")]}):requests===2?old.promise:latest.promise});
 await h.React.act(async()=>h.root.render(h.React.createElement(Modal,f.props)));await h.click("Ανανέωση κατηγοριών");await h.click("← Όλες οι πληρωμές");await h.click("Λοιπά έξοδα");await h.React.act(async()=>latest.resolve({items:[category("latest")]}));await h.React.act(async()=>old.resolve({items:[category("outdated")]}));assert.match(document.body.textContent,/latest/);assert.doesNotMatch(document.body.textContent,/outdated|initial/);
}));
