import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('mounted photo fills barcode and runs once-only scoped lookup; multi-code choice, same code, stale decode/store/error guarded',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/InventoryBarcodeLookup.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const calls=[],pending=[];let setCode;const readPhoto=(file,options)=>new Promise((resolve,reject)=>pending.push({file,options,resolve,reject}));
 function Harness({storeId}){const [code,set]=React.useState('5201222667919');setCode=set;return React.createElement(React.Fragment,null,React.createElement('input',{'aria-label':'barcode',value:code,readOnly:true}),React.createElement(module.exports.default,{api:async(path,options)=>{calls.push({path,options});return {found:true,source:'MYWORKSTATION',product:{name:'Existing'}}},storeId,barcode:code,onBarcode:set,onApply:()=>assert.fail('no automatic apply'),readPhoto}));}
 const root=createRoot(document.getElementById('root')),render=storeId=>act(async()=>root.render(React.createElement(Harness,{storeId}))),upload=()=>act(async()=>{const input=document.querySelector('input[type=file]');Object.defineProperty(input,'files',{configurable:true,value:[{type:'image/png',name:'5200000000000.png'}]});input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 try{
  await render('A');await upload();await act(async()=>pending[0].resolve(['0123456789012']));
  assert.equal(document.querySelector('[aria-label=barcode]').value,'0123456789012');assert.equal(calls.length,1);assert.match(calls[0].path,/0123456789012\?storeId=A$/);assert.match(document.body.textContent,/Existing/);assert.match(document.body.textContent,/Διαβάστηκε barcode/);
  await upload();await act(async()=>pending[1].resolve(['0123456789012']));assert.equal(calls.length,2);assert.equal(button('Αναζήτηση online').disabled,false,'same barcode cannot leave reading locked');
  await upload();await act(async()=>pending[2].resolve(['5201222667919','5201399030219']));assert.equal(calls.length,2);await act(async()=>button('5201399030219').click());assert.equal(calls.length,3);assert.equal(document.querySelector('[aria-label=barcode]').value,'5201399030219');
  await upload();await act(async()=>setCode('5201222667919'));await act(async()=>pending[3].resolve(['0123456789012']));assert.equal(calls.length,3);assert.equal(document.querySelector('[aria-label=barcode]').value,'5201222667919');
  await upload();await render('B');assert.equal(pending[4].options.signal.aborted,true);await act(async()=>pending[4].resolve(['0123456789012']));assert.equal(calls.length,3);
  await upload();await act(async()=>pending[5].resolve([]));assert.match(document.body.textContent,/Δεν διαβάστηκε barcode/);assert.equal(calls.length,3,'no filename inference or search on empty decode');
  assert.ok(calls.every(c=>!c.options?.method));
  await upload();await act(async()=>root.unmount());await act(async()=>pending[6].resolve(['0123456789012']));assert.equal(calls.length,3);
 }finally{dom.window.close();for(const [key,d] of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}}
});
