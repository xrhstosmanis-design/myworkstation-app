import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
for(const method of ['CASH','CARD'])test(`mounted ftext ${method} finalizes only CONFIRMED, never resends checkout, ignores stale stores and commits once`,async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/useFtextCashCheckout.js',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react']});const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')),{act}=React;
 const oldInterval=globalThis.setInterval,oldClear=globalThis.clearInterval;let tick;globalThis.setInterval=fn=>(tick=fn,1);globalThis.clearInterval=()=>{};
 const calls=[],commits=[],errors=[],updates=[];let status='DISPATCHED',release;
 const api=async(url,options={})=>{calls.push({url,options});if(url.includes('/stores/old/'))return new Promise(r=>release=r);if(options.method==='POST')return {saleId:'sale'};return {request:{id:'request-a',storeId:'store-a',kind:'FTEXT_CASH',paymentMethod:method,status}}};
 const pending={request:{id:'request-a',kind:'FTEXT_CASH'}};
 function Harness({storeId='store-a',value=pending}){module.exports.default({api,storeId,pending:value,onCommitted:r=>commits.push(r),onRequest:r=>updates.push(r),onError:e=>errors.push(e)});return null}
 const render=props=>act(async()=>root.render(React.createElement(Harness,props)));
 try{
  await render({storeId:'old'});await render({});await act(async()=>release({request:{id:'request-a',storeId:'old',kind:'FTEXT_CASH',status:'SALE_COMMITTED'}}));assert.equal(commits.length,0);
  assert.equal(calls.filter(c=>c.options.method==='POST').length,0);status='REQUIRES_CHECK';await act(async()=>tick());assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
  status='CONFIRMED';await act(async()=>tick());assert.equal(calls.filter(c=>c.options.method==='POST').length,1);assert.ok(calls.find(c=>c.options.method==='POST').url.endsWith('/ftext-cash/request-a/finalize'));
  status='SALE_COMMITTED';await act(async()=>tick());await act(async()=>tick());assert.equal(commits.length,1);assert.equal(commits[0].paymentMethod,method);assert.equal(errors.length,0);assert.ok(updates.length>=3);assert.ok(calls.every(c=>!c.url.endsWith('/checkout')));
  const before=calls.length;await render({value:{request:{id:'rbs',kind:'RBS'}}});assert.equal(calls.length,before);
 }finally{await act(async()=>root.unmount());globalThis.setInterval=oldInterval;globalThis.clearInterval=oldClear;dom.window.close();for(const[key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]}
});

test('mounted confirmed cancellation closes only its own request once and never finalizes/resends',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/useFtextCashCheckout.js',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react']});const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const dom=new JSDOM('<div id="root"></div>'),keys=['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')),{act}=React;let tick,status='REQUIRES_CHECK',cancelled=0;
 const oldInterval=globalThis.setInterval,oldClear=globalThis.clearInterval;globalThis.setInterval=fn=>(tick=fn,1);globalThis.clearInterval=()=>{};
 const calls=[],api=async(url,options={})=>{calls.push({url,options});return {request:{id:'original',storeId:'store-a',kind:'FTEXT_CASH',status}}};
 function Harness(){module.exports.default({api,storeId:'store-a',pending:{request:{id:'original',kind:'FTEXT_CASH'}},onRequest:()=>{},onCancelled:()=>cancelled++,onCommitted:()=>assert.fail('cancellation committed sale'),onError:message=>assert.fail(message)});return null}
 try{await act(async()=>root.render(React.createElement(Harness)));assert.equal(cancelled,0);status='CANCELLED';await act(async()=>tick());await act(async()=>tick());assert.equal(cancelled,1);assert.equal(calls.filter(c=>c.options.method==='POST').length,0)}finally{await act(async()=>root.unmount());globalThis.setInterval=oldInterval;globalThis.clearInterval=oldClear;dom.window.close();for(const[key,d]of previous)d?Object.defineProperty(globalThis,key,d):delete globalThis[key]}
});
