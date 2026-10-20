import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('video receiver rejects stale store/session results, bounds streamed bytes, and revokes hidden previews',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT','fetch'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)if(k!=='fetch')Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 Object.defineProperty(document,'hidden',{configurable:true,value:false});dom.window.HTMLMediaElement.prototype.pause=function(){};dom.window.HTMLMediaElement.prototype.load=function(){};
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;let created=0,revoked=0,session='one';URL.createObjectURL=()=>`blob:fixture-${++created}`;URL.revokeObjectURL=()=>revoked++;
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/ChatVideoAttachment.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById('root'));let resolve,fetchCalls=0,signal;
 const response=(size=3)=>({ok:true,headers:new Map([['Content-Type','video/mp4']]),body:new ReadableStream({start(c){c.enqueue(new Uint8Array(size));c.close();}})});
 const props=storeId=>({storeId,messageId:'message',sessionKey:session,getToken:()=>session});
 const flush=async()=>{await new Promise(r=>setTimeout(r,0));};
 try{
  globalThis.fetch=(_url,options)=>{fetchCalls++;signal=options.signal;assert.equal(options.cache,'no-store');return new Promise(r=>resolve=r)};
  await act(async()=>root.render(React.createElement(module.exports.default,props('old'))));assert.equal(fetchCalls,0,'no automatic download');
  await act(async()=>document.querySelector('button').click());await act(async()=>root.render(React.createElement(module.exports.default,props('new'))));assert.equal(signal.aborted,true);
  await act(async()=>{resolve(response());await flush()});assert.equal(created,0,'late old-store payload must not create a blob');assert.equal(document.querySelector('video'),null);
  globalThis.fetch=async()=>response();await act(async()=>{document.querySelector('button').click();await flush()});assert.equal(created,1);assert.ok(document.querySelector('video'));
  Object.defineProperty(document,'hidden',{configurable:true,value:true});await act(async()=>document.dispatchEvent(new dom.window.Event('visibilitychange')));assert.equal(revoked,1);assert.equal(document.querySelector('video'),null);
  Object.defineProperty(document,'hidden',{configurable:true,value:false});globalThis.fetch=async()=>response(12*1024*1024+1);await act(async()=>{document.querySelector('button').click();await flush()});assert.equal(created,1);assert.match(document.querySelector('[role=alert]').textContent,/12 MB/);
  globalThis.fetch=()=>new Promise(r=>resolve=r);await act(async()=>document.querySelector('button').click());session='other';await act(async()=>{resolve(response());await flush()});assert.equal(created,1,'changed credential must reject pending result');
 }finally{await act(async()=>root.unmount());URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;dom.window.close();for(const k of keys){const d=previous.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});
