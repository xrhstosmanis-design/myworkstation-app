import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('expected receipts UI: explicit conversion, stable retry key, stale store response and unavailable state',async()=>{
  const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/ExpectedReceiptsPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',packages:'external'});
  const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const Panel=module.exports.default,dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'});
  const keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],prior=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root'));
  const products=[{productId:'p',name:'Pack',unitLabel:'τεμ.'}],data=storeId=>({storeId,rows:[],suppliers:[{id:'sup',name:'Supplier '+storeId}],canWrite:true,sourceSupportNote:'Τα αυτόνομα παραστατικά χρειάζονται χωριστό έλεγχο.'});
  const render=(api,storeId)=>act(async()=>root.render(React.createElement(Panel,{api,storeId,products,onChanged:()=>{},onClose:()=>{}})));
  const set=async(element,value)=>act(async()=>{const prototype=element.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));});
  try{
    const writes=[];let fail=true;
    const api=async(path,options)=>{if(options){writes.push(JSON.parse(options.body));if(fail)throw Error('Διακοπή δικτύου');return {id:'receipt'}}return data('A')};
    await render(api,'A');
    const selects=dom.window.document.querySelectorAll('select');await set(selects[0],'p');await set(selects[1],'sup');
    const inputs=dom.window.document.querySelectorAll('input');await set(inputs[0],'2');await set(inputs[2],'6');
    assert.match(dom.window.document.body.textContent,/Αναγωγή για επιβεβαίωση: 12 τεμ/);assert.match(dom.window.document.body.textContent,/αυτόνομα/);assert.equal(writes.length,0);
    const submit=()=>act(async()=>dom.window.document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
    await submit();assert.equal(writes.length,1);assert.match(dom.window.document.body.textContent,/Διακοπή/);
    fail=false;await submit();assert.equal(writes.length,2);assert.equal(writes[0].idempotencyKey,writes[1].idempotencyKey);assert.equal(writes[1].storeId,'A');assert.equal(writes[1].invoiceQuantity,'2');assert.equal(writes[1].stockUnitsPerInvoiceUnit,'6');
    let resolve;const delayed=()=>new Promise(done=>{resolve=done});await render(delayed,'OLD');
    const next=async()=>data('NEW');await render(next,'NEW');await act(async()=>resolve(data('OLD')));
    assert.ok(dom.window.document.querySelector('form'));assert.equal(dom.window.document.querySelector('[role="alert"]'),null);assert.match(dom.window.document.body.textContent,/Supplier NEW/);assert.doesNotMatch(dom.window.document.body.textContent,/Supplier OLD/);
    await render(async()=>{throw Error('Οι αναμενόμενες παραλαβές περιμένουν εγκατάσταση.');},'EMPTY');
    assert.match(dom.window.document.querySelector('[role="alert"]').textContent,/εγκατάσταση/);assert.equal(dom.window.document.querySelector('form'),null);
  }finally{
    await act(async()=>root.unmount());dom.window.close();for(const key of keys){const descriptor=prior.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  }
});
