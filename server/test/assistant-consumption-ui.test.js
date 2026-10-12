import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const report={kind:"consumption",scope:"OWNER_SELECTED_STORE",companyId:"c",companyName:"Company",storeId:"s",storeName:"Store",consumptionKind:"SELF_CONSUMPTION",from:"2026-10-10",to:"2026-10-10",timeZone:"Europe/Athens",result:"matched",incompletePeriod:false,rows:[{eventId:"e",line:0,recordedAt:"2026-10-10T08:47:54Z",name:"<img src=x>",sku:"2269",quantity:1.5,referenceValue:.75,operatorName:"Χειριστής"}],totals:{referenceValue:.75}};
async function bundle(path){const {build}=await import("esbuild"),out=await build({stdin:{contents:`export {default} from "./${path}";`,resolveDir:fileURLToPath(new URL("../../",import.meta.url)),loader:"jsx"},bundle:true,write:false,format:"cjs",platform:"node",loader:{".css":"empty"},external:["react","react-dom","react-dom/client","react/jsx-runtime"],plugins:[{name:"unrelated-credit",setup(b){b.onLoad({filter:/AiCreditAlert\.jsx$/},()=>({contents:"export default function Panel(){return null}",loader:"jsx"}))}}]});const m={exports:{}};new Function("require","module","exports",out.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);return m.exports.default;}
test("consumption evidence renders exact source names, operator and reference value; incomplete source never shows zero cash",async()=>{
 const Panel=await bundle("client/src/components/voice/ConsumptionAssistantEvidence.jsx"),React=await import("react"),{renderToStaticMarkup}=await import("react-dom/server"),render=r=>renderToStaticMarkup(React.createElement(Panel,{evidence:[r]}));
 const html=render(report);assert.match(html,/Ιδιοκατανάλωση/);assert.match(html,/1,5/);assert.match(html,/0,75/);assert.match(html,/Χειριστής/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|Έλεγχος Ταμείων|cash_details/);assert.match(html,/δεν είναι τζίρος/);
 const limited=render({...report,result:"source_limited",rows:[],totals:null,reason:"Ελλιπής πηγή"});assert.match(limited,/Ελλιπής πηγή/);assert.doesNotMatch(limited,/<table|Συνολική αξία|0,00/);
 const empty=render({...report,result:"no_records",rows:[],totals:{referenceValue:0}});assert.match(empty,/Δεν βρέθηκαν καταχωρημένα συμβάντα/);assert.doesNotMatch(empty,/<table|Συνολική αξία/);
 assert.match(render({...report,consumptionKind:"PRODUCT_DESTRUCTION"}),/Καταστροφή προϊόντων/);
});
test("mounted Owner and Platform panels display consumption source, discard raw cash prose and withdraw after store change",async()=>{
 const React=await import("react"),{createRoot}=await import("react-dom/client"),{JSDOM}=await import("jsdom"),{act}=React;
 for(const platform of [false,true]){
  const Panel=await bundle(platform?"client/src/components/platform/AiCommandCenter.jsx":"client/src/components/voice/OwnerAssistantPanel.jsx"),dom=new JSDOM('<div id="root"></div>',{url:"https://fixture.invalid"});
  const keys=["window","document","navigator","HTMLElement","Event","IS_REACT_ACT_ENVIRONMENT"],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
  let recording,post;class Recognition{constructor(){recording=this}start(){}abort(){}stop(){}}window.SpeechRecognition=Recognition;Object.defineProperty(window,"isSecureContext",{configurable:true,value:true});
  if(platform)window.localStorage.setItem("token","fixture.central");
  const scope={companyId:"c",storeId:"s",storeName:"Store"},api=async(url,opts={})=>{if(opts.method==="POST"){post=JSON.parse(opts.body);return {scope,answer:"PRIVATE BUSINESS_SNAPSHOT cash_details",highlights:[],limitations:"PRIVATE",evidence:[{...report,scope:platform?"PLATFORM_SELECTED_STORE":"OWNER_SELECTED_STORE"}]}}if(url.includes("owner-assistant"))return {available:true,scope,supported:["consumption_details"]};return {companies:[],rows:[],totals:{},overview:{},recurring:[],correlations:[],devices:[],services:[]}};
  const companies=[{id:"c",name:"Company",active:true,stores:[{id:"s",name:"Store",active:true}]}],root=createRoot(document.getElementById("root")),props=platform?{request:api,companies}:{api,storeId:"s",storeName:"Store"},click=el=>act(async()=>el.dispatchEvent(new window.MouseEvent("click",{bubbles:true})));
  try{
   await act(async()=>root.render(React.createElement(Panel,props)));await click(document.querySelector(".mws-voice-input-actions button"));await act(async()=>{recording.onstart();recording.onresult({results:[Object.assign([{transcript:"ιδιοκατανάλωση 10/10/2026"}],{isFinal:true})]});recording.onend()});await click(document.querySelector(platform?'.ai-command-ask button[type="submit"]':'button[type="submit"]'));
   assert.ok(post);assert.ok(document.querySelector(".mws-consumption-evidence"));assert.equal(document.querySelector(".mws-cash-evidence"),null);assert.equal(document.querySelector(".mws-consumption-evidence img"),null);assert.doesNotMatch(document.querySelector(platform?".ai-command-answer":"article").textContent,/PRIVATE|BUSINESS_SNAPSHOT|cash_details/);
   await act(async()=>root.render(React.createElement(Panel,platform?{...props,companies:[]}:{...props,storeId:"",storeName:""})));assert.equal(document.querySelector(".mws-consumption-evidence"),null);assert.equal(document.querySelector("textarea").value,"");
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,v] of prior)v?Object.defineProperty(globalThis,k,v):delete globalThis[k]}
 }
});
