import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('expected receipt journal survives ambiguous A/B/A, close/reload and actor/company/store changes',async()=>{
  const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/commerce/ExpectedReceiptsPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',packages:'external'});
  const module={exports:{}};
  new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const Panel=module.exports.default;
  const keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'});
  const installGlobals=()=>{
    for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  };
  installGlobals();
  const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');
  let root=createRoot(dom.window.document.getElementById('root')),closed=0;
  const products=[{productId:'p',name:'Pack',unitLabel:'τεμ.'}];
  const data=(storeId,actorId='owner',companyId='company')=>({actorId,companyId,storeId,rows:[],suppliers:[{id:'sup',name:'Supplier '+storeId}],canWrite:true,sourceSupportNote:'Τα αυτόνομα παραστατικά χρειάζονται χωριστό έλεγχο.'});
  const render=(api,storeId)=>act(async()=>root.render(React.createElement(Panel,{api,storeId,products,onChanged:()=>{},onClose:()=>{closed++}})));
  const set=async(element,value)=>act(async()=>{
    const prototype=element.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);
    element.dispatchEvent(new dom.window.Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));
  });
  const fill=async(quantity)=>{
    const selects=dom.window.document.querySelectorAll('select');await set(selects[0],'p');await set(selects[1],'sup');
    const inputs=dom.window.document.querySelectorAll('input');await set(inputs[0],quantity);await set(inputs[2],'6');
  };
  const submit=()=>act(async()=>dom.window.document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  const pending=()=>dom.window.document.querySelector('[aria-label="Εκκρεμές αίτημα παραλαβής"]');
  const retry=()=>act(async()=>[...dom.window.document.querySelectorAll('button')].find(button=>button.textContent==='Επανέλεγχος εκκρεμούς αιτήματος').click());
  try{
    const writes=[];let ambiguous=true,failReload=false;
    const api=async(path,options)=>{
      if(options){writes.push(JSON.parse(options.body));if(ambiguous)throw Error('Διακοπή μετά την αποθήκευση');return {id:'receipt'}}
      if(failReload)throw Error('Αποτυχία ανανέωσης');return data('A');
    };
    await render(api,'A');await fill('2');
    assert.match(dom.window.document.body.textContent,/Αναγωγή για επιβεβαίωση: 12 τεμ/);
    assert.match(dom.window.document.body.textContent,/αυτόνομα/);assert.equal(writes.length,0);
    await submit();assert.equal(writes.length,1);assert.ok(pending());
    assert.equal(dom.window.document.querySelector('fieldset').disabled,true);
    // A synthetic B submission must also be refused, even if DOM disabling is bypassed.
    await fill('3');await submit();assert.equal(writes.length,1);
    ambiguous=false;await retry();assert.equal(writes.length,2);assert.deepEqual(writes[1],writes[0]);assert.equal(pending(),null);
    await submit();assert.equal(writes.length,3);assert.equal(writes[2].invoiceQuantity,'3');assert.notEqual(writes[2].idempotencyKey,writes[0].idempotencyKey);

    ambiguous=true;await fill('4');await submit();const retained=writes.at(-1);assert.ok(pending());
    await act(async()=>[...dom.window.document.querySelectorAll('button')].find(button=>button.textContent==='Κλείσιμο').click());assert.equal(closed,1);
    await act(async()=>root.render(null));await render(api,'A');assert.ok(pending());assert.equal(writes.length,4);
    // A new document with the same session storage models refresh, independently of refs.
    const saved=Object.fromEntries(Object.keys(dom.window.sessionStorage).map(key=>[key,dom.window.sessionStorage.getItem(key)]));
    await act(async()=>root.unmount());dom.window.close();
    dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'});installGlobals();
    for(const [key,value] of Object.entries(saved))dom.window.sessionStorage.setItem(key,value);
    root=createRoot(dom.window.document.getElementById('root'));
    await render(api,'A');assert.ok(pending());assert.equal(writes.length,4);
    ambiguous=false;await retry();assert.deepEqual(writes.at(-1),retained);assert.equal(pending(),null);

    ambiguous=true;await fill('5');await submit();const isolated=writes.at(-1),beforeIsolation=writes.length;
    for(const [store,actor,company] of [['A','other','company'],['B','owner','company'],['A','owner','other-company']]){
      const otherApi=async()=>data(store,actor,company);await render(otherApi,store);
      assert.equal(pending(),null);assert.equal(dom.window.document.querySelector('fieldset').disabled,false);
      assert.equal(writes.length,beforeIsolation);
    }
    await render(api,'A');assert.ok(pending());assert.equal(writes.length,beforeIsolation);
    ambiguous=false;await retry();assert.deepEqual(writes.at(-1),isolated);assert.equal(pending(),null);
    assert.equal(writes.at(-1).intentActorId,'owner');assert.equal(writes.at(-1).intentCompanyId,'company');assert.equal(writes.at(-1).storeId,'A');

    // Success with a failed refresh retains the original key until the report is read.
    await fill('6');failReload=true;await submit();const refreshIntent=writes.at(-1);assert.ok(pending());
    failReload=false;await retry();assert.deepEqual(writes.at(-1),refreshIntent);assert.equal(pending(),null);
    const rejectedApi=async(path,options)=>options?{rejected:true,message:'Η ποσότητα χρειάζεται διόρθωση.'}:data('A');
    await render(rejectedApi,'A');await fill('7');await submit();assert.equal(pending(),null);
    assert.equal(dom.window.document.querySelector('fieldset').disabled,false);assert.match(dom.window.document.body.textContent,/ποσότητα χρειάζεται διόρθωση/);

    let resolve;await render(()=>new Promise(done=>{resolve=done}),'OLD');
    await render(async()=>data('NEW'),'NEW');await act(async()=>resolve(data('OLD')));
    assert.match(dom.window.document.body.textContent,/Supplier NEW/);assert.doesNotMatch(dom.window.document.body.textContent,/Supplier OLD/);
    await render(async()=>{throw Error('Οι αναμενόμενες παραλαβές περιμένουν εγκατάσταση.');},'EMPTY');
    assert.match(dom.window.document.querySelector('[role="alert"]').textContent,/εγκατάσταση/);assert.equal(dom.window.document.querySelector('form'),null);
  }finally{
    await act(async()=>root.unmount());dom.window.close();
    for(const key of keys){const descriptor=previous.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  }
});
