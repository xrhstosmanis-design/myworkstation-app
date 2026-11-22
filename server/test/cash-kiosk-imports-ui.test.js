import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
async function mount(entry='CashKioskImportPanel.jsx'){
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/shared/'+entry,import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime'],loader:{'.css':'empty'}});
 const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/platform-admin'}),keys=['window','document','navigator','HTMLElement','Node','Event','FileReader','File','Blob','crypto','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:k==='crypto'?{randomUUID}:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 const render=props=>act(async()=>root.render(React.createElement(module.exports.default,props)));
 const click=el=>act(async()=>el.click());
 const change=(el,value)=>act(async()=>{const proto=el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});
 const file=async()=>act(async()=>{const el=document.querySelector('input[type="file"]');Object.defineProperty(el,'files',{configurable:true,value:[new dom.window.File(['synthetic workbook bytes for mounted transport'], 'source.xls',{type:'application/vnd.ms-excel'})]});el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 const tick=()=>act(async()=>new Promise(r=>setTimeout(r,10)));
 const wait=async condition=>{for(let i=0;i<100&&!condition();i++)await tick();assert(condition(),'mounted flow did not settle');};
 return {dom,render,click,change,file,tick,wait,act,cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}};
}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const field=text=>[...document.querySelectorAll('label')].find(l=>l.textContent.startsWith(text))?.querySelector('input,select,textarea');
const period={from:'2026-10-25',to:'2026-10-28'};
const props=extra=>({storeId:'A',storeName:'Store A',generation:'0',...period,...extra});
async function open(m){await m.act(async()=>{document.querySelector('details[aria-label="Αρχεία συμβάντων Kiosk"]').open=true;});await m.tick();}
test('actual mounted file input requires explicit store/source binding, sends one scoped request and never auto-uploads',async()=>{
 const m=await mount(),calls=[],busy=[];let changed=0;
 const api=async(path,options={})=>{calls.push({path,...options});return options.method?{storeId:'A',generation:'0',reused:false}:{storeId:'A',generation:'0',period,sources:[]};};
 try{
  await m.render(props({api,onChanged:()=>changed++,onBusyChange:v=>busy.push(v)}));assert.equal(calls.length,0);await open(m);assert.equal(calls.length,1);assert.equal(calls[0].method,undefined);
  await m.change(field('Περιεχόμενο'),'JOURNAL');await m.file();assert(button('Σύνδεση αρχείου με τον έλεγχο').disabled);
  await m.change(field('Αριθμός βάρδιας'),'436');await m.change(field('Κωδικός χειριστή'),'ΤΑΜΕΙΟ 6');await m.click(field('Επιβεβαίωσα ότι'));assert(!button('Σύνδεση αρχείου με τον έλεγχο').disabled);
  await m.click(button('Σύνδεση αρχείου με τον έλεγχο'));await m.wait(()=>calls.some(c=>c.method==='POST')&&changed===1);
  const posts=calls.filter(c=>c.method==='POST');assert.equal(posts.length,1);assert.equal(posts[0].path,'/api/cash-reconciliation/stores/A/kiosk-sources');const data=JSON.parse(posts[0].body);assert.deepEqual(data.binding,{kind:'JOURNAL',kioskShiftId:'436',kioskOperator:'ΤΑΜΕΙΟ 6'});assert.equal(data.selectedStoreConfirmed,true);assert.equal(data.generation,'0');assert.equal(data.contentData,Buffer.from('synthetic workbook bytes for mounted transport').toString('base64'));assert.deepEqual(busy,[true,false]);
  await m.tick();assert.equal(calls.filter(c=>c.method==='POST').length,1);
 }finally{await m.cleanup();}
});
test('mounted store switch discards late upload completion and clears file/binding/attestation without resubmission',async()=>{
 const m=await mount(),calls=[];let finish,changed=0;
 const api=async(path,options={})=>{calls.push({path,...options});if(options.method)return new Promise(r=>finish=()=>r({storeId:'A',generation:'0'}));return {storeId:path.includes('/A/')?'A':'B',generation:'0',period,sources:[]};};
 try{
  await m.render(props({api,onChanged:()=>changed++}));await open(m);await m.file();await m.click(field('Επιβεβαίωσα ότι'));await m.click(button('Σύνδεση αρχείου με τον έλεγχο'));await m.wait(()=>Boolean(finish));
  await m.render(props({api,storeId:'B',storeName:'Store B',onChanged:()=>changed++}));await m.act(async()=>finish());assert.equal(changed,0);assert.equal(calls.filter(c=>c.method==='POST').length,1);assert.match(document.body.textContent,/Store B/);assert.doesNotMatch(document.body.textContent,/Το αρχείο συνδέθηκε/);assert(!field('Επιβεβαίωσα ότι').checked);assert.equal(document.querySelector('input[type="file"]').value,'');
 }finally{await m.cleanup();}
});
test('unknown upload outcome stays visible, calls the refresh gate and never retries automatically',async()=>{
 const m=await mount(),calls=[];let uncertain=0;
 const api=async(path,options={})=>{calls.push({path,...options});if(options.method)throw Error('Η σύνδεση διακόπηκε.');return {storeId:'A',generation:'0',period,sources:[]};};
 try{
  await m.render(props({api,onUncertain:()=>uncertain++}));await open(m);await m.file();await m.click(field('Επιβεβαίωσα ότι'));await m.click(button('Σύνδεση αρχείου με τον έλεγχο'));await m.wait(()=>uncertain===1);
  assert.match(document.body.textContent,/Ανανέωσε τον έλεγχο/);await m.tick();assert.equal(calls.filter(c=>c.method==='POST').length,1);
 }finally{await m.cleanup();}
});
test('actual parent serializes the new upload with existing review controls and reloads the canonical report once',async()=>{
 const m=await mount('CashReconciliationPanel.jsx'),calls=[];let finish,reads=0;
 const report=()=>({storeId:'A',storeName:'Store A',generation:'0',period,head:'ROOT',rows:[],context:[],history:[],reportHash:'a'.repeat(64),text:++reads===1?'ORIGINAL REPORT':'FRESH CANONICAL REPORT',checkpoint:null,historyPage:0});
 const api=async(path,options={})=>{calls.push({path,...options});if(path.endsWith('/kiosk-sources')&&options.method)return new Promise(r=>finish=()=>r({storeId:'A',generation:'0',reused:false}));if(path.includes('/kiosk-sources'))return {storeId:'A',generation:'0',period,sources:[]};return report();};
 try{
  await m.render({api,storeId:'A',...period});await m.click(button('Έλεγχος με επανυπολογισμούς'));await open(m);await m.file();await m.click(field('Επιβεβαίωσα ότι'));await m.click(button('Σύνδεση αρχείου με τον έλεγχο'));await m.wait(()=>Boolean(finish));
  assert(button('Καταχώριση ελέγχου').disabled);assert(button('Ανανέωση ελέγχου').disabled);assert(button('Αντιγραφή ελεγμένης αναφοράς').disabled);
  await m.act(async()=>finish());await m.wait(()=>document.body.textContent.includes('FRESH CANONICAL REPORT'));assert.equal(reads,2);assert.equal(calls.filter(c=>c.method==='POST').length,1);assert(!calls.some(c=>c.path.endsWith('/reviews')));assert(!button('Ανανέωση ελέγχου').disabled);
 }finally{await m.cleanup();}
});
