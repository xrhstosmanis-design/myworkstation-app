import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {previewSharedCost,sharedCostExampleCompanies} from '../../client/src/components/platform/shared-cost-preview.mjs';
import {summarizeSharedCostReview} from '../../client/src/components/platform/shared-cost-review.mjs';

test('mounted persisted review makes no initial calls, fences stale quote, retries exact uncertain request and reads saved history after remount',async()=>{
 const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
 const bundle=await build({stdin:{contents:'export {default} from "./client/src/components/platform/SavedSharedCostReviews.jsx"',resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;let root=createRoot(document.getElementById('root'));
 const input={period:'2026-10',amount:'100.00',reference:'Synthetic source EUR',confirmed:true,participants:['A','B','C'].map((s,i)=>({storeId:'example-store-'+s,days:i===2?'16':'31'}))},result=previewSharedCost(input,sharedCostExampleCompanies),decisions={'example-A':'APPROVED_DRAFT','example-B':'WAIVED'};
 const quote={mode:'SYNTHETIC',period:input.period,proposalId:'synthetic-proposal',expectedVersion:0,quoteHash:'a'.repeat(64),input,result};
 let records=[],calls=[],locked=false,delay=null;
 const api=async(path,options={})=>{
  calls.push({path,...options});if(path.endsWith('/preview')){if(delay)return delay;return quote}
  if(path.includes('/history?'))return {records};
  const payload=JSON.parse(options.body);
  if(!records.length){records=[{...quote,proposalReference:payload.proposalReference,id:'saved-one',version:1,savedAt:'2026-11-02T12:00:00Z',actorName:'Synthetic administrator',decisions,review:summarizeSharedCostReview(result,decisions),posted:false}];throw Error('Synthetic lost reply')}
  return {...records[0],replayed:true};
 };
 const onLock=value=>{locked=value};let props={api,mode:'SYNTHETIC',period:input.period,input,result,decisions,onLock};
 const render=()=>act(async()=>root.render(React.createElement(mod.exports.default,props)));
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 const set=async(value)=>act(async()=>{const el=document.querySelector('input');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));el.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
 const click=async text=>act(async()=>button(text).click());
 try{
  await render();assert.equal(calls.length,0);await set('SYNTHETIC-REVIEW-ONE');
  let resolve;delay=new Promise(r=>{resolve=r});await click('Έλεγχος στον server');
  props={...props,input:{...input,amount:'200.00'},result:previewSharedCost({...input,amount:'200.00'},sharedCostExampleCompanies)};await render();await act(async()=>resolve(quote));assert.equal(document.querySelector('input[type=checkbox]'),null);
  delay=null;props={...props,input,result};await render();await click('Έλεγχος στον server');
  await act(async()=>document.querySelector('input[type=checkbox]').click());await click('Αποθήκευση αποφάσεων');
  assert.equal(locked,true);assert.match(document.body.textContent,/αβέβαιο/);assert.equal(document.querySelector('input').disabled,true);
  const first=calls.find(c=>c.path.endsWith('/save'));assert.ok(first);
  // External catalogue/result change must not destroy uncertain request identity.
  props={...props,result:null,input:null};await render();await click('Επανάληψη ίδιου αιτήματος αποθήκευσης');
  const saves=calls.filter(c=>c.path.endsWith('/save'));assert.equal(saves.length,2);assert.equal(saves[0].body,saves[1].body);assert.equal(locked,false);assert.match(document.body.textContent,/Αποθηκεύτηκε η απόφαση/);assert.match(document.body.textContent,/59,62/);assert.equal(records.length,1);
  await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));await render();await set('SYNTHETIC-REVIEW-ONE');await click('Ανάγνωση αποθηκευμένων ελέγχων');
  assert.match(document.querySelector('[aria-label="Αποθηκευμένοι έλεγχοι"]').textContent,/Synthetic administrator/);assert.match(document.body.textContent,/Δεν έχει καταχωριστεί χρέωση ή οφειλή/);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,d]of prior)d?Object.defineProperty(globalThis,key,d):delete globalThis[key]}
});
