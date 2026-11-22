import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {JSDOM} from "jsdom";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {webcrypto} from "node:crypto";

async function component(path){const output=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",plugins:[{name:"icons-only",setup(b){b.onResolve({filter:/^lucide-react$/},()=>({path:"icons",namespace:"fixture"}));b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:"export const X=()=>null"}))}}]});const m={exports:{}};new Function("require","module","exports",output.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);return m.exports.default}
async function environment(run){const dom=new JSDOM("<div id=root></div>",{url:"https://myworkstation-app.onrender.com"}),previous=new Map();for(const key of ["window","document","navigator","HTMLElement","IS_REACT_ACT_ENVIRONMENT","fetch","URL","crypto"]){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:key==="crypto"?webcrypto:dom.window[key]})}const downloads=[],revoked=[];URL.createObjectURL=()=>"blob:setup-fixture";URL.revokeObjectURL=u=>revoked.push(u);dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,href:this.href})};const React=await import("react"),{createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"));const click=async text=>React.act(async()=>{const b=[...document.querySelectorAll("button")].find(b=>b.textContent===text);assert.ok(b,text);b.click();await new Promise(r=>setTimeout(r,20))});try{await run({React,root,dom,click,downloads,revoked})}finally{await React.act(async()=>root.unmount());dom.window.close();for(const[key,prior]of previous){if(prior)Object.defineProperty(globalThis,key,prior);else delete globalThis[key]}}}
async function data(){const bytes=new Uint8Array(2048);bytes[0]=77;bytes[1]=90;const h=Buffer.from(await webcrypto.subtle.digest("SHA-256",bytes)).toString("hex");return{bytes,manifest:{version:"1.0.0",size:2048,sha256:h,parts:[{name:"part-000.bin",size:2048,sha256:h}]}}}
test("mounted setup is explicit, verifies one download and discards late results after store change",async()=>{
 const View=await component("../../client/src/components/store/DeviceSetupPanel.jsx"),f=await data();await environment(async({React,root,click,downloads})=>{
  let calls=[],resolvePart=null;globalThis.fetch=async(url,options)=>{calls.push(url);if(url.endsWith("manifest.json"))return new Response(JSON.stringify(f.manifest));if(resolvePart===false)return new Promise(resolve=>resolvePart=resolve);return new Response(f.bytes)};
  const render=async scope=>React.act(async()=>root.render(React.createElement(View,{scopeKey:scope})));
  await render("A");assert.equal(calls.length,0);assert.equal(document.querySelector("dialog"),null);await click("Εγκατάσταση συσκευών");assert.equal(document.querySelector("dialog a").getAttribute("href"),"ms-settings:printers");assert.equal(calls.length,0);
  await click("Εγκατάσταση σαρωτή");for(let i=0;i<30&&!downloads.length;i++)await React.act(async()=>new Promise(r=>setTimeout(r,10)));assert.equal(downloads.length,1);assert.equal(downloads[0].name,"MyWorkStation-Scanner-Setup.exe");assert.match(document.body.textContent,/δεν σημαίνει ότι η συσκευή εγκαταστάθηκε/);assert.equal(calls.length,2);
  await click("Κλείσιμο");assert.equal(document.querySelector("dialog"),null);await click("Εγκατάσταση συσκευών");resolvePart=false;await click("Εγκατάσταση σαρωτή");assert.equal(typeof resolvePart,"function");await render("B");await React.act(async()=>resolvePart(new Response(f.bytes)));assert.equal(downloads.length,1);assert.equal(document.querySelector("dialog"),null);
  await render(null);assert.equal(document.querySelector("dialog"),null);assert.equal(document.querySelector("button").disabled,true);assert.ok(calls.every(u=>u.startsWith("/downloads/device-setup/v1/")));
 });
});
test("existing label settings opens device setup without a save and preserves the selected-store PUT",async()=>{
 const View=await component("../../client/src/components/platform/StoreLabelSettingsManager.jsx");await environment(async({React,root,click,dom})=>{
  const calls=[],saved=[],closed=[];globalThis.fetch=()=>assert.fail("Setup cannot fetch on open");
  const request=async(url,options)=>{calls.push({url,options});return{settings:JSON.parse(options.body)}};
  await React.act(async()=>root.render(React.createElement(View,{company:{id:"company"},store:{id:"store",name:"Fixture"},initialSettings:{widthMm:60,heightMm:38,printerName:"Fixture printer"},request,onSaved:s=>saved.push(s),onClose:()=>closed.push(true)})));
  await click("Εγκατάσταση εκτυπωτή καρτελακίων");assert.ok(document.querySelector("dialog"));assert.equal(calls.length,0);await click("Κλείσιμο");assert.equal(closed.length,0);
  await React.act(async()=>document.querySelector("form").dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true})));assert.equal(calls.length,1);assert.equal(calls[0].url,"/api/platform/companies/company/stores/store/label-settings");assert.equal(calls[0].options.method,"PUT");assert.deepEqual(saved[0],{widthMm:60,heightMm:38,printerName:"Fixture printer"});assert.equal(closed.length,1);
 });
});
