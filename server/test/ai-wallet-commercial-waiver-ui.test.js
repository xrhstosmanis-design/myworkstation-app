import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {commercialWaiverSchema,publicCommercialWaiver} from '../src/services/ai-wallet-commercial-waiver.js';
import {activityStatus,filterWalletActivity,walletActivityTotals} from '../../client/src/components/voice/ai-wallet-activity.mjs';

test('waiver acknowledgement never means confirmed zero supplier cost, and history separates released from spent money',()=>{
 const value={storeId:'s',entryIds:[randomUUID()],version:0,generation:'0',fingerprint:'a'.repeat(64),requestId:randomUUID(),reason:'Synthetic commercial waiver',customerWaiverConfirmed:true};
 assert.ok(commercialWaiverSchema.safeParse(value).success);
 for(const changed of [{customerWaiverConfirmed:false},{providerCostConfirmed:true},{amountMicros:'0'},{entryIds:[]}])assert.equal(commercialWaiverSchema.safeParse({...value,...changed}).success,false);
 const waiver={type:'COMMERCIAL_WAIVER',providerCostStatus:'UNKNOWN',releasedMicros:'1234567',reason:'private reason'};
 assert.deepEqual(publicCommercialWaiver(waiver),{type:'COMMERCIAL_WAIVER',providerCostStatus:'UNKNOWN',releasedMicros:'1234567'});
 assert.equal(publicCommercialWaiver({...waiver,providerCostStatus:'ZERO'}),null);
 const row={id:'waived',kind:'USAGE',status:'SETTLED',chargedMicros:'0',reservedMicros:'1234567',commercialWaiver:publicCommercialWaiver(waiver)};
 assert.equal(activityStatus(row),'WAIVED');assert.equal(filterWalletActivity([row],{status:'WAIVED'}).length,1);assert.equal(filterWalletActivity([row],{status:'REVIEW'}).length,0);assert.deepEqual(walletActivityTotals([row]),{charged:'0',reserved:'0',credited:'0'});
});
test('mounted waiver requires explicit selected store, preview and acknowledgement; ambiguous retry preserves exact identity',async()=>{
 const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
 const bundle=await build({stdin:{contents:'export {default} from "./client/src/components/platform/AiWalletCommercialWaiver.jsx"',resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 const a=randomUUID(),b=randomUUID(),common={kind:'USAGE',status:'REVIEW',chargedMicros:'0',reservedMicros:'1234567',createdAt:'2026-10-31T12:00:00Z'},entries=[{...common,id:a,storeId:'s',storeName:'Selected'},{...common,id:b,storeId:'other',storeName:'Other'}],calls=[],submitted=[];
 const api=async(path,options)=>{const body=JSON.parse(options.body);calls.push({path,body});return {companyId:'c',storeId:body.storeId,entryIds:body.entryIds,version:7,generation:'0',fingerprint:'a'.repeat(64),releasedMicros:'1234567'}};
 const button=text=>[...document.querySelectorAll('button')].find(e=>e.textContent===text),checkboxes=()=>[...document.querySelectorAll('input[type=checkbox]')];
 try{
  await act(async()=>root.render(React.createElement(mod.exports.default,{companyId:'c',entries,api,onWaive:body=>submitted.push(body)})));
  assert.equal(button('Προεπισκόπηση απαλλαγής').disabled,true);assert.ok(checkboxes().every(e=>!e.checked));
  await act(async()=>checkboxes()[0].click());await act(async()=>{const input=document.querySelector('input:not([type=checkbox])');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'Synthetic waiver reason');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});
  await act(async()=>checkboxes()[1].click());assert.equal(button('Προεπισκόπηση απαλλαγής').disabled,true);assert.match(document.body.textContent,/μόνο ενός καταστήματος/);
  await act(async()=>checkboxes()[1].click());await act(async()=>button('Προεπισκόπηση απαλλαγής').click());
  assert.equal(calls.length,1);assert.deepEqual(calls[0].body,{storeId:'s',entryIds:[a]});assert.match(document.body.textContent,/κόστος παρόχου παραμένει άγνωστο/);assert.equal(button('Καταχώριση απαλλαγής').disabled,true);
  await act(async()=>checkboxes().at(-1).click());await act(async()=>{const save=button('Καταχώριση απαλλαγής');save.click();save.click()});assert.equal(submitted.length,2);assert.deepEqual(submitted[0],submitted[1]);assert.ok(submitted[0].requestId);assert.equal(submitted[0].customerWaiverConfirmed,true);assert.equal(submitted[0].providerCostConfirmed,undefined);assert.ok(checkboxes().every(e=>e.disabled));
  await act(async()=>button('Επανάληψη ίδιας καταχώρισης').click());assert.equal(submitted.length,3);assert.deepEqual(submitted[0],submitted[2]);
  await act(async()=>root.render(React.createElement(mod.exports.default,{key:'new-company',companyId:'x',entries:[],api,onWaive:body=>submitted.push(body)})));assert.equal(document.querySelectorAll('input[type=checkbox]').length,0);assert.equal(submitted.length,3);assert.equal(button('Καταχώριση απαλλαγής'),undefined);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of prior)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
});
