import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

test('free inventory UI has one entry, no product picker, preserves existing counts on explicit conversion',async()=>{
  const output=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/inventory/InventoryV2Center.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom','react-dom/client','react/jsx-runtime'],loader:{'.css':'empty'},plugins:[{name:'isolated-count-child',setup(b){b.onLoad({filter:/InventoryFastCount\.jsx$/},()=>({contents:'import React from "react";export default function Count(){return <div>Count fixture</div>}',loader:'jsx'}))}}]});
  const module={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','MutationObserver','confirm','IS_REACT_ACT_ENVIRONMENT'];
  const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  let confirmed=true,confirms=0;
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='confirm'?()=>{confirms++;return confirmed}:dom.window[key]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
  const root=createRoot(document.getElementById('root')),writes=[],draft={id:'take',name:'Virtual take',status:'DRAFT',scopeType:'PARTIAL_PRODUCTS',storeId:'store',lines:[],events:[]};let stocktake=draft,release;
  const api=async(path,options)=>{
    if(path.endsWith('/free')){writes.push({path,body:JSON.parse(options.body)});stocktake={...draft,scopeType:'FREE',lines:[{id:'line',productId:'p',countedQuantity:3}]};return {ok:true}}
    if(path.endsWith('/finalize')){writes.push({path,body:JSON.parse(options.body)});await new Promise(r=>{release=r});stocktake={...draft,status:'FINALIZED',snapshotJson:{reason:writes.at(-1).body.reason}};return {ok:true}}
    if(path.endsWith('/audit'))return {summary:{lineCount:0,countedCount:0,totalDifference:0},header:{snapshot:stocktake.snapshotJson},lines:[]};
    if(path.endsWith('/stocktakes'))return [stocktake];
    if(path.includes('/zones'))return [];
    return stocktake;
  };
  const button=()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Οριστικοποίηση'));
  const type=async(value)=>act(async()=>{const input=document.querySelector('.inv2-finalization textarea');Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});
  try{
    await act(async()=>root.render(React.createElement(module.exports.default,{api,stores:[{id:'store',name:'Virtual store'}],catalog:[]})));
    await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Virtual take')).click());
    assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent.includes('Νέα Ολική')),false);
    assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent.includes('Νέα Μερική')),false);
    assert.equal(document.querySelector('.inv2-products'),null);
    const conversion=()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Συνέχεια ως ελεύθερη'));
    confirmed=false;await act(async()=>conversion().click());assert.equal(writes.length,0);
    confirmed=true;await act(async()=>{conversion().click();conversion().click()});assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{confirmed:true});
    assert.equal(conversion(),undefined);const save=[...document.querySelectorAll('button')].find(b=>b.textContent==='Καταχώρηση απογραφής');assert.equal(save.disabled,false);
    assert.equal(document.querySelector('.inv2-finalization textarea').value,'Καταχώρηση καταμετρημένων ειδών');
  }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,d] of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}}
});
