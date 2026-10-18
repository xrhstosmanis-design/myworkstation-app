import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('mounted central recovery requires receipt/reason, prevents double submit, refreshes after success and ignores old-store responses',async()=>{
 const result=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/PosRemoteRecovery.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}}),m={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));let resolvePost,resolveGet,holdGet=false,complete=false,calls=[];
 const row={id:'request',terminalPos:'POS1',total:2.7,paymentMethod:'CASH',createdAt:'2026-10-18T20:00:00Z',preview:'a'.repeat(64),items:[{name:'Product',quantity:1}]};
 const request=async(path,options={})=>{calls.push({path,options});if(options.method==='POST')return new Promise(resolve=>{resolvePost=()=>{complete=true;resolve({companyId:'company',storeId:'A',saleId:'sale'})}});const data={companyId:'company',storeId:path.includes('/stores/A/')?'A':'B',requests:complete?[]:[row]};return holdGet?new Promise(resolve=>{resolveGet=()=>resolve(data)}):data};
 const render=storeId=>act(async()=>root.render(React.createElement(m.exports.default,{key:storeId,companyId:'company',storeId,request})));
 const buttons=()=>[...document.querySelectorAll('button')];const click=text=>act(async()=>buttons().find(x=>x.textContent===text).click());
 try{
  await render('A');assert.equal(calls.length,0);await click('Έλεγχος εκκρεμοτήτων POS');await click('Έλεγχος / Ανάκτηση');assert.equal(buttons().find(x=>x.textContent==='Ολοκλήρωση υπάρχουσας συναλλαγής').disabled,true);
  await act(async()=>document.querySelector('input[type=checkbox]').click());await act(async()=>{const el=document.querySelector('textarea');Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(el,'Already printed');el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));el.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
  const submit=()=>act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  await submit();await submit();assert.equal(calls.filter(x=>x.options.method==='POST').length,1);assert.deepEqual(JSON.parse(calls.at(-1).options.body),{preview:row.preview,receiptPrinted:true,reason:'Already printed'});
  await act(async()=>resolvePost());assert.equal(document.querySelector('form'),null);assert.match(document.querySelector('[role=status]').textContent,/καταχωρίστηκε/);
  complete=false;holdGet=true;await click('Έλεγχος εκκρεμοτήτων POS');await render('B');await act(async()=>resolveGet());assert.equal(document.querySelector('article'),null);assert.equal(document.querySelector('[role=status]'),null);assert.ok(calls.every(x=>x.path.includes('/stores/A/')));
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
});
