import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('mounted payment correction requires reason, shows cash difference, prevents double submission and stale-store response',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/PaymentAmountCorrectionAction.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));let calls=[],changed=0,fail=true,resolvePost,resolveContext,hold=false;
 const api=async(path,options={})=>{calls.push({path,options});const storeId=path.match(/stores\/([^/]+)/)[1];if(options.method==='POST'){if(fail)throw Error('network lost');return new Promise(r=>{resolvePost=()=>r({storeId,transactionId:'payment',ok:true})})}const context={storeId,transactionId:'payment',amount:3,subtractFromShift:true,expectedCorrectionId:null,allocations:[]};return hold?new Promise(r=>{resolveContext=()=>r(context)}):context};
 const render=storeId=>act(async()=>root.render(React.createElement(m.exports.default,{api,storeId,transactionId:'payment',onChanged:()=>changed++})));
 const click=selector=>act(async()=>document.querySelector(selector).click());
 const fill=(selector,value)=>act(async()=>{const el=document.querySelector(selector);Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));el.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
 const submit=()=>act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
 try{
  await render('A');assert.equal(calls.length,0);await click('.payment-correction-action');assert.match(document.querySelector('form').textContent,/3,00/);
  await fill('input','5');await submit();assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
  await fill('textarea','Typing mistake');assert.match(document.querySelector('form').textContent,/-2,00/);await submit();assert.match(document.querySelector('[role=alert]').textContent,/network lost/);
  const first=JSON.parse(calls.at(-1).options.body);assert.equal(first.amount,5);assert.equal(first.expectedAmount,3);assert.equal(first.expectedCorrectionId,null);
  fail=false;await submit();const second=JSON.parse(calls.at(-1).options.body);assert.equal(second.idempotencyKey,first.idempotencyKey);const n=calls.length;await submit();assert.equal(calls.length,n);
  await act(async()=>resolvePost());assert.equal(changed,1);assert.equal(document.querySelector('form'),null);
  hold=true;await click('.payment-correction-action');await render('B');await act(async()=>resolveContext());assert.equal(document.querySelector('form'),null);assert.equal(changed,1);assert.ok(calls.every(c=>c.path.includes('/stores/A/')));
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
});
