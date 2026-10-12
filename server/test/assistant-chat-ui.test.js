import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {assistantRequestedFile,downloadAssistantFile} from "../../client/src/components/voice/assistant-file-download.js";
async function panel(){const {build}=await import("esbuild"),out=await build({stdin:{contents:'export {default} from "./client/src/components/voice/AssistantChatPage.jsx"',resolveDir:fileURLToPath(new URL("../../",import.meta.url)),loader:"jsx"},bundle:true,write:false,format:"cjs",platform:"node",loader:{".css":"empty"},external:["react","react-dom","react-dom/client","react/jsx-runtime"]});const m={exports:{}};new Function("require","module","exports",out.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);return m.exports.default;}
test("download validates server filename, type, decoded length and rejects active artifacts",()=>{
 assert.equal(assistantRequestedFile("Λίστα σε Excel"),"xlsx");assert.equal(assistantRequestedFile("σε Word"),"docx");assert.equal(assistantRequestedFile("Πωλήσεις"),null);
 const file={filename:"myworkstation-report-20261012170000.csv",mimeType:"text/csv;charset=utf-8",size:1,base64:"QQ=="};
 for(const bad of [{filename:"report.html"},{mimeType:"text/html"},{size:2},{size:11000000},{base64:""}])assert.throws(()=>downloadAssistantFile({...file,...bad},{decode:()=>"A"}));
});
test("mounted chat preserves selected store, bounded follow-up and close/reopen history; store/session changes discard late reports and files",async()=>{
 const Chat=await panel(),React=await import("react"),{act}=React,{createRoot}=await import("react-dom/client"),{JSDOM}=await import("jsdom");
 for(const platform of [false,true]){
  const dom=new JSDOM('<div id="root"></div>',{url:"https://fixture.invalid"}),keys=["window","document","navigator","HTMLElement","Event","IS_REACT_ACT_ENVIRONMENT"],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
  let recording;class Recognition{constructor(){recording=this}start(){}abort(){}stop(){}}window.SpeechRecognition=Recognition;Object.defineProperty(window,"isSecureContext",{configurable:true,value:true});
  const scope={companyId:"c",storeId:"s",storeName:"Διαδόχου Παύλου"},other={companyId:"c",storeId:"s2"},calls=[],downloads=[];let late=null,hold=false;
  const claims={tokenType:"BACKOFFICE_USER",id:"actor",companyId:"c",sessionId:"session",sessionVersion:1,role:"OWNER",platformRole:platform?"SUPER_ADMIN":"OWNER",isSuperAdmin:platform,exp:Math.floor(Date.now()/1000)+3600};window.localStorage.setItem("token","fixture."+Buffer.from(JSON.stringify(claims)).toString("base64url")+".sig");
  const access={available:true,scope,supported:["consumption_details"]},report={kind:"consumption",scope:platform?"PLATFORM_SELECTED_STORE":"OWNER_SELECTED_STORE",...scope,source:"Συμβάντα POS",from:"2026-10-01",to:"2026-10-12",consumptionKind:"SELF_CONSUMPTION",result:"matched",rows:[{name:"ΝΕΡΟ",sku:"2269",quantity:1,referenceValue:.5,operatorName:"Χειριστής",recordedAt:"2026-10-10T08:00:00Z"}],totals:{referenceValue:.5}};
  const api=async(path,opts={})=>{if(opts.method!=="POST")return access;const body=JSON.parse(opts.body);calls.push({path,body});if(path.endsWith("/export")){if(hold)return new Promise(r=>late=r);return {filename:"fixture"}}if(hold)return new Promise(r=>late=r);return {scope,answer:"Έτοιμο",highlights:[],limitations:"",evidence:[report],exportTicket:platform?"fixture-ticket":null}};
  const companies=[{id:"c",name:"Εταιρεία",active:true,stores:[{id:"s",name:scope.storeName},{id:"s2",name:"Άλλο"}]}],root=createRoot(document.getElementById("root")),props={open:true,mode:platform?"platform":"owner",api,companies,initialSelection:scope,ownerStoreId:"s",ownerAccess:access,download:f=>downloads.push(f)},render=async p=>act(async()=>root.render(React.createElement(Chat,p))),click=async el=>act(async()=>el.dispatchEvent(new window.MouseEvent("click",{bubbles:true}))),input=async value=>{await click(document.querySelector(".mws-voice-input-actions button"));await act(async()=>{recording.onstart();recording.onresult({results:[Object.assign([{transcript:value}],{isFinal:true})]});recording.onend()})},submit=async()=>act(async()=>document.querySelector("form").dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true})));
  try{
   await render(props);await input("Ιδιοκατανάλωση από 1/10 έως12/10");await submit();assert.equal(calls.length,1);assert.equal(calls[0].body.readScope,"selected_store");if(platform){assert.deepEqual(calls[0].body.selection,{companyId:"c",storeId:"s"});assert.equal(calls[0].body.snapshot,null)}assert.ok(document.querySelector(".mws-consumption-evidence"));
   await input("Και χθες;");await submit();assert.equal(calls[1].body.history.length,2);assert.equal(calls[1].body.history[0].role,"user");assert.ok(calls[1].body.history[0].content.includes("Ιδιοκατανάλωση"));
   await render({...props,open:false});assert.equal(document.querySelector("textarea"),null);await render(props);assert.equal(document.querySelectorAll(".mws-chat-message.user").length,2);
   assert.equal(Boolean(document.querySelector(".mws-chat-exports")),platform);hold=true;
   if(platform)await click(document.querySelector(".mws-chat-exports button"));else {await input("Και σήμερα;");await submit()}
   assert.ok(late);await render(platform?{...props,initialSelection:other}:{...props,ownerStoreId:"s2",ownerAccess:{...access,scope:other}});await act(async()=>late(platform?{filename:"stale"}:{scope,answer:"STALE",evidence:[report]}));assert.equal(downloads.length,0);assert.doesNotMatch(document.body.textContent,/STALE/);assert.equal(document.querySelectorAll(".mws-chat-message").length,0);
   window.localStorage.setItem("token","changed-session");await act(async()=>window.dispatchEvent(new window.Event("focus")));assert.equal(document.querySelectorAll(".mws-chat-message").length,0);
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,v] of prior)v?Object.defineProperty(globalThis,k,v):delete globalThis[k]}
 }
});
