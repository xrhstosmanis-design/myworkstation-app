import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import vm from 'node:vm';

test('live central permission enforcement rejects internal refund POST without returnItems',()=>{
 const source=fs.readFileSync(new URL('../src/middleware/auth.js',import.meta.url),'utf8');
 const start=source.indexOf('function enforceStorePosPermissions('),end=source.indexOf('function exposeStorePosRuntimeAccess(',start);
 const enforce=vm.runInNewContext('('+source.slice(start,end).trim()+')');
 const req={method:'POST',originalUrl:'/api/store-pos/stores/A/sales/receipt/internal-return',query:{}};let status;const res={status(n){status=n;return this},json(){}};
 assert.equal(enforce(req,res,[]),false);assert.equal(status,403);assert.equal(enforce(req,res,['RETURN_ITEMS']),true);
});
test('actual mounted RBS refund modal uses exact dropdown, explicit refund method/confirmation, one linked POST and no fiscal command',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'];
 const old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StorePosStandardModals.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const sale={id:'receipt',sessionId:'shift',source:'POS',fiscalStatus:'ISSUED',canInternalReturn:true,total:3,lines:[{id:'line',description:'VIRTUAL WATER',quantity:3,unitPrice:1,lineTotal:3}],payments:[{method:'CASH',amount:3}]};
 const posts=[],messages=[],errors=[];let closed=0,confirmation=false;
 window.confirm=()=>confirmation;
 const props={active:'RETURN',cart:[],store:{id:'store'},api:async(path,opts)=>{if(opts?.method==='POST'){posts.push({path,body:JSON.parse(opts.body)});return {total:-3}}return path.includes('sales/recent')?{rows:[sale,{...sale,id:'already-returned',internalReturnPending:true}]}:{openSession:{id:'shift'}}},onClose(){closed++},setMessage(m){messages.push(m)},setError(e){errors.push(e)}};
 const root=createRoot(document.getElementById('root'));
 const change=async(el,value)=>act(async()=>{el.value=value;el.dispatchEvent(new window.Event('change',{bubbles:true}))});
 try{
  await act(async()=>{root.render(React.createElement(m.exports.default,props));await new Promise(r=>setTimeout(r,20))});
  const reason=document.querySelector('[aria-label="Αιτιολογία επιστροφής"]');assert.ok(reason);assert.deepEqual([...reason.options].filter(o=>o.value).map(o=>o.value),['Λάθος χειριστή','Επιστροφή από πελάτη','Λάθος καταχώρηση']);
  const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Καταχώριση εσωτερικής επιστροφής RBS');assert.ok(button.disabled);assert.equal(document.querySelectorAll('.pos-return-sales>button').length,1);assert.match(document.body.textContent,/Εκκρεμεί φορολογική επιστροφή RBS/);
  await change(reason,'Λάθος καταχώρηση');assert.ok(button.disabled);await change(document.querySelector('[aria-label="Τρόπος επιστροφής χρημάτων"]'),'CASH');assert.equal(button.disabled,false);
  await act(async()=>button.click());assert.equal(posts.length,0);
  confirmation=true;await act(async()=>button.click());assert.equal(posts.length,1);assert.equal(posts[0].path,'/api/store-pos/stores/store/sales/receipt/internal-return');assert.deepEqual(posts[0].body,{items:[{lineId:'line',quantity:3}],reason:'Λάθος καταχώρηση',refundMethod:'CASH',confirmed:true});assert.equal(closed,1);assert.match(messages[0],/Εκκρεμεί φορολογική επιστροφή RBS/);assert.deepEqual(errors,[]);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=old.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
