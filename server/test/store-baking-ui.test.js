import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
test('mounted baking modal shows the raw link, posts additions once and retries the same identity',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'];
 const old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StoreBakingModal.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const posts=[];let changed=0,first=true;
 const api=async(path,opts)=>{assert.match(path,/stores\/selected\/baking$/);if(opts?.method==='POST'){posts.push(JSON.parse(opts.body));if(first){first=false;throw new Error('Διακοπή σύνδεσης')}return {quantity:2}}return {products:[{productId:'baked',sourceProductId:'raw',name:'Τυρόπιτα ψημένη',sourceName:'Τυρόπιτα άψητη',currentStock:1,sourceStock:10}],history:[]}};
 const root=createRoot(document.getElementById('root'));
 try{
 await act(async()=>{root.render(React.createElement(m.exports.default,{api,store:{id:'selected',name:'Selected'},onClose(){},onChanged(){changed++}}));await new Promise(r=>setTimeout(r,10))});
 const select=document.querySelector('select');await act(async()=>{select.value='baked';select.dispatchEvent(new window.Event('change',{bubbles:true}))});assert.match(document.body.textContent,/Τυρόπιτα άψητη/);
 const quantity=document.querySelector('input[type="number"]');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(quantity,'2');quantity.dispatchEvent(new window.Event('input',{bubbles:true}))});
 const submit=()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
 await act(async()=>submit());assert.equal(posts.length,1);assert.match(document.querySelector('[role="alert"]').textContent,/Διακοπή/);
 await act(async()=>submit());assert.equal(posts.length,2);assert.deepEqual(posts[1],posts[0]);assert.equal(posts[0].productId,'baked');assert.equal(posts[0].sourceProductId,'raw');assert.equal(posts[0].quantity,2);assert.equal(changed,1);assert.match(document.querySelector('[role="status"]').textContent,/2 ψημένα/);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=old.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
