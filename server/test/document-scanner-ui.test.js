import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {JSDOM} from "jsdom";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

test("mounted scanner pairs without scanning, delivers once, and discards cross-store/closed results",async()=>{
  const output=await build({entryPoints:[fileURLToPath(new URL("../../client/src/components/store/DocumentScanButton.jsx",import.meta.url))],bundle:true,write:false,format:"cjs",platform:"node",packages:"external"});
  const module={exports:{}};new Function("require","module","exports",output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const Control=module.exports.default;
  const dom=new JSDOM("<div id=root></div>",{url:"https://myworkstation-app.onrender.com"}),saved=new Map();
  const names=["window","document","navigator","HTMLElement","File","sessionStorage","IS_REACT_ACT_ENVIRONMENT","fetch"];
  for(const name of names){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[name]})}
  const React=await import("react"),{createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"));let resolve,calls=[],received=[];
  const fetcher=async(url,options)=>{calls.push({url,options});if(url.endsWith("/pair"))return{ok:true,status:200,text:async()=>JSON.stringify({token:"a".repeat(64)})};return new Promise(r=>resolve=r)};
  globalThis.fetch=fetcher;
  const click=async label=>React.act(async()=>{const button=[...document.querySelectorAll("button")].find(b=>b.textContent===label);assert.ok(button,label);button.click();await Promise.resolve()});
  const render=async(scope,disabled=false)=>React.act(async()=>root.render(React.createElement(Control,{scopeKey:scope,disabled,onFiles:files=>received.push({scope,files})})));
  const finish=()=>resolve({ok:true,status:200,text:async()=>JSON.stringify({pages:[{jpeg:"/9j/2Q=="}]})});
  try{
    await render("A");await click("Σάρωση εγγράφου");assert.equal(calls.length,0);assert.ok(document.querySelector("input"));
    await React.act(async()=>{const input=document.querySelector("input");Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set.call(input,"123456");input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));input.dispatchEvent(new dom.window.Event("change",{bubbles:true}))});
    await click("Σύνδεση σαρωτή");assert.equal(calls.length,1);assert.match(calls[0].url,/\/pair$/);assert.equal(received.length,0);
    await click("Σάρωση εγγράφου");assert.equal(calls.length,2);assert.equal(document.querySelector("button").disabled,true);
    await render("B");await React.act(async()=>finish());assert.equal(received.length,0);assert.equal(calls[1].options.signal.aborted,true);
    await click("Σάρωση εγγράφου");await React.act(async()=>finish());assert.equal(received.length,1);assert.equal(received[0].scope,"B");assert.equal(received[0].files.length,1);
    await click("Σάρωση εγγράφου");await React.act(async()=>root.unmount());await React.act(async()=>finish());assert.equal(received.length,1);assert.equal(calls.at(-1).options.signal.aborted,true);
  }finally{dom.window.close();for(const name of names){const prior=saved.get(name);if(prior)Object.defineProperty(globalThis,name,prior);else delete globalThis[name]}}
});
