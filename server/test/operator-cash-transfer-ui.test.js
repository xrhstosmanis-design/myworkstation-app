import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

test("mounted cash transfer validates reason, locks duplicate click and preserves retry request key",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:"https://isolated.invalid"}),keys=["window","document","navigator","HTMLElement","Event","MutationObserver","IS_REACT_ACT_ENVIRONMENT"],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[k]});
 const React=await import("react"),{createRoot}=await import("react-dom/client"),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StoreCashTransferModal.jsx',import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",external:["react","react-dom","react/jsx-runtime"],loader:{".css":"empty"}}),m={exports:{}};
 new Function("require","module","exports",compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const requests=[];let reject,resolve,closed=0,changed=0;
 const api=async(path,options)=>{if(!options)return {openSession:{id:"shift",terminalPos:"MAIN"},openSessions:[{id:"shift",terminalPos:"MAIN"}]};requests.push({path,...options});return new Promise((yes,no)=>{resolve=yes;reject=no})};
 const root=createRoot(document.getElementById("root")),props={api,store:{id:"store",name:"Virtual"},onClose:()=>closed++,onChanged:()=>changed++};
 const settle=async fn=>act(async()=>{await fn();await new Promise(r=>setTimeout(r,5))});
 const submit=()=>document.querySelector("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
 const fill=async(index,value)=>settle(()=>{const input=document.querySelectorAll("input")[index];Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}))});
 try{
  await settle(()=>root.render(React.createElement(m.exports.default,props)));
  await settle(submit);assert.equal(requests.length,0);
  await fill(0,"2,50");await settle(submit);assert.equal(requests.length,0);assert.match(document.querySelector('[role="alert"]').textContent,/αιτιολογία/);
  await fill(1,"Virtual transfer");await settle(()=>{submit();submit()});assert.equal(requests.length,1);assert.equal(document.querySelector('button[type="submit"]').disabled,true);
  await settle(()=>reject(new Error("Virtual network failure")));await settle(submit);assert.equal(requests.length,2);assert.deepEqual(JSON.parse(requests[0].body),JSON.parse(requests[1].body));assert.equal(JSON.parse(requests[1].body).direction,"OUT");
  await settle(()=>resolve({ok:true}));assert.equal(changed,1);await settle(submit);assert.equal(requests.length,2);
  await settle(()=>root.render(React.createElement(m.exports.default,{...props,allowed:false})));assert.equal(closed,1);
  const incomingApi=async(path,options)=>{if(!options)return {openSession:{id:"shift",terminalPos:"MAIN"},openSessions:[{id:"shift",terminalPos:"MAIN"},{id:"control",terminalPos:"CONTROL"}]};requests.push({path,...options});return {ok:true}};
  await settle(()=>root.render(React.createElement(m.exports.default,{...props,key:"incoming",direction:"IN",api:incomingApi})));
  await settle(()=>{const select=document.querySelector("select");select.value="control";select.dispatchEvent(new Event("change",{bubbles:true}))});
  await fill(0,"3");await fill(1,"Virtual owner cash");await settle(submit);assert.equal(requests.length,3);assert.equal(requests[2].headers["x-mws-terminal-pos"],"CONTROL");assert.equal(JSON.parse(requests[2].body).sessionId,"control");assert.equal(JSON.parse(requests[2].body).direction,"IN");
 }finally{await act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=previous.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
