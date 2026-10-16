import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

async function mount(file){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.querySelector('#root'));
 const compiled=await build({entryPoints:[fileURLToPath(new URL(file,import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react'],loader:{'.css':'empty'}});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 return {dom,React,act,exports:m.exports,render:async(C,props)=>act(async()=>{root.render(React.createElement(C,props));await new Promise(r=>setTimeout(r,5))}),wait:async(ms=260)=>act(async()=>{await new Promise(r=>setTimeout(r,ms))}),click:async(el)=>{assert.ok(el);await act(async()=>{el.click();await new Promise(r=>setTimeout(r,10))})},input:async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,5))}),close:async()=>{await act(async()=>root.unmount());dom.window.close();for(const [k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}};
}
test('mounted pending modal shows full count, resolves refresh, preserves duplicate error, supports all-product search and discards old-store response',async()=>{
 const h=await mount('../../client/src/components/store/PosBarcodeRegistrationModal.jsx');
 try{
  let missing=301,rows=[{id:'p',sku:'new-id',name:'Roshen',salePrice:1.8,currentStock:0,barcodes:[]}],defer=null,postCount=0,conflict=true;
  const calls=[],api=async(path,options={})=>{
   calls.push(path);if(path.endsWith('/label-settings'))return{};
   if(options.method==='POST'){postCount++;if(conflict)throw Error('Το barcode υπάρχει ήδη στο προϊόν Roshen (100608).');rows=[];missing=0;return{message:'saved'}}
   if(defer){const pending=defer;defer=null;return pending}
   return {rows,missingCount:missing,totalMatches:missing};
  },C=h.exports.default,props={api,store:{id:'A'},onClose(){},onChanged(){}};
  await h.render(C,props);await h.wait();assert.match(document.body.textContent,/301/);assert.equal(document.querySelector('input[type=checkbox]').checked,true);assert.ok(calls.some(x=>x.includes('missingOnly=true')));
  await h.click([...document.querySelectorAll('.pos-barcode-results>button')][0]);
  await h.input(document.querySelector('input[placeholder="Σκάναρε ή πληκτρολόγησε"]'),'4823077625626');await h.click([...document.querySelectorAll('button')].find(b=>b.textContent==='Σύνδεση barcode με το προϊόν'));
  assert.equal(postCount,1);assert.match(document.querySelector('[role=alert]').textContent,/100608/);
  conflict=false;await h.click([...document.querySelectorAll('button')].find(b=>b.textContent==='Σύνδεση barcode με το προϊόν'));assert.equal(postCount,2);assert.match(document.body.textContent,/Όλα τα είδη έχουν barcode/);
  rows=[];missing=0;await h.act(async()=>{window.dispatchEvent(new h.dom.window.Event('focus'));await new Promise(r=>setTimeout(r,15))});assert.match(document.body.textContent,/Όλα τα είδη έχουν barcode/);assert.equal(document.querySelectorAll('.pos-barcode-results>button').length,0);
  await h.click(document.querySelector('input[type=checkbox]'));await h.wait();assert.ok(calls.some(x=>x.includes('missingOnly=false')));
  let resolve;defer=new Promise(r=>{resolve=r});await h.act(async()=>{window.dispatchEvent(new h.dom.window.Event('focus'));await new Promise(r=>setTimeout(r,5))});
  rows=[{id:'B',name:'Only B',barcodes:[]}];missing=1;await h.render(C,{...props,store:{id:'B'}});await h.wait();
  await h.act(async()=>{resolve({rows:[{id:'old',name:'STALE A'}],missingCount:999,totalMatches:999});await new Promise(r=>setTimeout(r,10))});assert.match(document.body.textContent,/Only B/);assert.doesNotMatch(document.body.textContent,/STALE A|999/);
 }finally{await h.close()}
});
test('mounted POS count hook scopes replies, refreshes on focus, and never converts an error to zero',async()=>{
 const h=await mount('../../client/src/hooks/useBarcodePendingCount.js');
 try{
  let resolveA,fail=false,count=5;const api=async(path)=>{if(path.includes('/A/'))return new Promise(r=>{resolveA=r});if(fail)throw Error('unavailable');return{missingCount:count}};
  function Counter({id,enabled=true}){const count=h.exports.useBarcodePendingCount(api,id,enabled);return h.React.createElement('span',null,count===null?'unknown':String(count))}
  await h.render(Counter,{id:'A'});await h.render(Counter,{id:'B'});await h.wait(10);assert.equal(document.body.textContent,'5');
  await h.act(async()=>{resolveA({missingCount:999});await new Promise(r=>setTimeout(r,10))});assert.equal(document.body.textContent,'5');
  fail=true;await h.act(async()=>{window.dispatchEvent(new h.dom.window.Event('focus'));await new Promise(r=>setTimeout(r,10))});assert.equal(document.body.textContent,'unknown');
  fail=false;count=0;await h.act(async()=>{window.dispatchEvent(new h.dom.window.Event('focus'));await new Promise(r=>setTimeout(r,10))});assert.equal(document.body.textContent,'0');
  await h.render(Counter,{id:'B',enabled:false});assert.equal(document.body.textContent,'unknown');
 }finally{await h.close()}
});

test('an old keyed modal cannot notify the next store when its in-flight save finishes',async()=>{
 const h=await mount('../../client/src/components/store/PosBarcodeRegistrationModal.jsx');
 try{
  let completeSave,changed=0;
  const api=async(path,options={})=>{
   if(path.endsWith('/label-settings'))return{};
   if(options.method==='POST')return new Promise(resolve=>{completeSave=resolve});
   return{rows:[{id:'p',name:'Pending',barcodes:[],salePrice:2}],missingCount:1,totalMatches:1};
  };
  const C=h.exports.default,props={api,store:{id:'A'},onClose(){},onChanged(){changed++}};
  await h.render(C,{...props,key:'A'});await h.wait();await h.click(document.querySelector('.pos-barcode-results>button'));
  await h.input(document.querySelector('input[placeholder="Σκάναρε ή πληκτρολόγησε"]'),'12345678');
  await h.click([...document.querySelectorAll('button')].find(b=>b.textContent==='Σύνδεση barcode με το προϊόν'));
  await h.render(C,{...props,key:'B',store:{id:'B'}});await h.wait();
  await h.act(async()=>{completeSave({message:'old A completed'});await new Promise(r=>setTimeout(r,10))});
  assert.equal(changed,0);assert.doesNotMatch(document.body.textContent,/old A completed/);
 }finally{await h.close()}
});
