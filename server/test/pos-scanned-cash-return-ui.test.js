import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import fs from 'node:fs';
test('central live permission enforcement denies scanned returns without both return and cash rights',()=>{
 const s=fs.readFileSync(new URL('../src/middleware/auth.js',import.meta.url),'utf8');const a=s.indexOf('function enforceStorePosPermissions('),b=s.indexOf('function exposeStorePosRuntimeAccess(',a);const enforce=vm.runInNewContext('('+s.slice(a,b).trim()+')');
 for(const suffix of ['cash-returns','cash-returns/quote','cash-returns/cancel']){
  const req={method:'POST',originalUrl:`/api/store-pos/stores/store/${suffix}`,query:{},body:{}};let status;const res={status(n){status=n;return this},json(){}};
  for(const rights of [[],['RETURN_ITEMS'],['POS_CASH']]){assert.equal(enforce(req,res,rights),false);assert.equal(status,403)}
  assert.equal(enforce(req,res,['RETURN_ITEMS','POS_CASH']),true);
 }
});
test('mounted scanned return confirms cash amount, blocks double click, survives lost response and reload with same identity',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','sessionStorage','IS_REACT_ACT_ENVIRONMENT'];
 const old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/PosScannedCashReturn.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom','react/jsx-runtime']});const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const calls=[],completed=[];let first=true,release;
 const quote={items:[{productId:'pack24',name:'Virtual water 24',quantity:1,totalCents:735}],refundCents:735,sessionId:'shift',quoteHash:'a'.repeat(64)};
 const api=async(path,opts)=>{const body=JSON.parse(opts.body);calls.push({path,body});if(path.endsWith('/quote'))return quote;if(first){first=false;await new Promise(r=>{release=r});throw new Error('Network response lost')}return {ok:true,total:-7.35,saleId:'return',replayed:true}};
 const props={api,storeId:'store',actorId:'actor',cart:[{id:'pack24',quantity:1}],onClose(){},onCompleted:r=>completed.push(r)};
 let root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>{root.render(React.createElement(m.exports.default,props));await new Promise(r=>setTimeout(r,10))});
  assert.match(document.body.textContent,/7,35/);assert.match(document.body.textContent,/μετρητά/);assert.equal(calls[0].body.items[0].productId,'pack24');
  const end=[...document.querySelectorAll('button')].find(b=>b.textContent==='Τέλος');
  await act(async()=>{end.click();end.click()});assert.equal(calls.filter(c=>!c.path.endsWith('/quote')).length,1);
  const stored=JSON.parse(sessionStorage.getItem(m.exports.cashReturnStorageKey('store','actor')));assert.ok(stored.payload.requestId);assert.equal(stored.payload.confirmed,true);
  await act(async()=>{release();await new Promise(r=>setTimeout(r,5))});assert.equal(completed.length,0);assert.match(document.body.textContent,/χρειάζεται έλεγχο/);
  await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(m.exports.default,props)));
  assert.equal(calls.filter(c=>c.path.endsWith('/quote')).length,1);
  await act(async()=>{[...document.querySelectorAll('button')].find(b=>b.textContent==='Τέλος').click();await new Promise(r=>setTimeout(r,5))});
  assert.deepEqual(calls.at(-1).body,stored.payload);assert.equal(completed.length,1);assert.equal(sessionStorage.getItem(m.exports.cashReturnStorageKey('store','actor')),null);
  assert.ok(calls.every(c=>!c.path.includes('eftpos')&&!c.path.includes('checkout')));
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d] of old){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
