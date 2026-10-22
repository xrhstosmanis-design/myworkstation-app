import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

test('mounted wallet clears previous-store balances and late results, explains company scope and shows renewal instructions without payment actions',async()=>{
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const bundle=await build({stdin:{contents:'export {default} from "./client/src/components/voice/AiOwnerWallet.jsx"',resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
  const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  const dom=new JSDOM('<div id="root"></div>',{url:'https://synthetic.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root')),calls=[];let late;
  const data=id=>({runtimeEnabled:true,enabled:true,companyId:'company',storeId:id,availableMicros:id==='a'?'1110000':'2220000',reservedMicros:'0',state:'LOW',usage:[],entries:[],notices:[],paymentInstructions:'Πληρωμή στο MyWorkStation · συνθετικές οδηγίες'});
  const api=async(path,options)=>{calls.push({path,...options});return path.includes('/slow')?new Promise(resolve=>late=resolve):data(path.endsWith('/a')?'a':'b')};
  const render=(storeId,enabled=true)=>act(async()=>root.render(React.createElement(module.exports.default,{api,storeId,enabled})));
  try{
    await render('',true);assert.equal(calls.length,0);await render('a',false);assert.equal(calls.length,0);
    await render('a');assert.match(document.body.textContent,/1,11/);assert.match(document.body.textContent,/Κοινό υπόλοιπο/);
    await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Ανανέωση υπολοίπου AI').click());assert.match(document.body.textContent,/συνθετικές οδηγίες/);assert.equal(calls.length,1);assert.equal(calls[0].method,undefined);
    await render('slow');assert.doesNotMatch(document.body.textContent,/1,11|συνθετικές οδηγίες/);const old=calls.at(-1);await render('b');assert.equal(old.signal.aborted,true);await act(async()=>late(data('a')));assert.match(document.body.textContent,/2,22/);assert.doesNotMatch(document.body.textContent,/1,11/);
    await render('b',false);assert.equal(document.body.textContent,'');
  }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of prior)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}
});
