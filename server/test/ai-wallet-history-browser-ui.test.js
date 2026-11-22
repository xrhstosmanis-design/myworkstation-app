import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

test('mounted history navigates, retries without stale data and rejects late company/store/version results',async()=>{
 const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
 const bundle=await build({stdin:{contents:'export {default} from "./client/src/components/voice/AiWalletHistoryBrowser.jsx"',resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 const entry=id=>({id,kind:'USAGE',status:'REVIEW',feature:'INVOICE_OPENAI',reservedMicros:'100000',chargedMicros:'0',createdAt:'2026-11-03T12:00:00Z'});
 let scope={companyId:'c',storeId:'s',readKey:1},calls=[],pending=null,fail=false;
 const loadPage=async(cursor,{signal})=>{calls.push({cursor,signal});if(pending)return pending;if(fail)throw new Error('forbidden');return {runtimeEnabled:true,...scope,entries:[entry(cursor?'archive-two':'archive-one')],nextCursor:cursor?null:'cursor-two'}};
 const render=()=>act(async()=>root.render(React.createElement(mod.exports.default,{...scope,entries:[entry('recent-only')],loadPage})));
 const click=async text=>act(async()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);b.click()});
 const body=()=>document.body.textContent;
 try{
  await render();assert.equal(calls.length,0);assert.match(body(),/recent-only/);
  await click('Πλήρες ιστορικό AI');assert.equal(calls.length,1);assert.match(body(),/archive-one/);assert.doesNotMatch(body(),/recent-only/);assert.match(body(),/μόνο αυτή τη σελίδα/);
  await click('Επόμενη σελίδα');assert.equal(calls.at(-1).cursor,'cursor-two');assert.match(body(),/archive-two/);
  await click('Προηγούμενη σελίδα');assert.equal(calls.at(-1).cursor,null);assert.match(body(),/archive-one/);
  fail=true;await click('Ανανέωση σελίδας');assert.ok(document.querySelector('[role=alert]'));assert.doesNotMatch(body(),/archive-one|archive-two|recent-only/);
  fail=false;await click('Ανανέωση σελίδας');assert.match(body(),/archive-one/);
  for(const change of [{companyId:'new-company'},{storeId:'new-store'},{readKey:2}]){
   let resolve;pending=new Promise(r=>{resolve=r});const before=calls.length;
   await act(async()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Ανανέωση σελίδας');b.click();b.click()});assert.equal(calls.length,before+1);
   const oldCall=calls.at(-1);scope={...scope,...change};await render();assert.equal(oldCall.signal.aborted,true);assert.doesNotMatch(body(),/archive-one|archive-two/);
   await act(async()=>resolve({runtimeEnabled:true,companyId:'c',storeId:'s',entries:[entry('late-private')],nextCursor:null}));assert.doesNotMatch(body(),/late-private/);
   pending=null;await click('Πλήρες ιστορικό AI');assert.match(body(),/archive-one/);
  }
  await click('Πρόσφατες κινήσεις');assert.match(body(),/recent-only/);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d]of prior)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
});
