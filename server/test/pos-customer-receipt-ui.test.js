import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../../',import.meta.url));
test('mounted receipt freezes the same payload after a lost response, survives reopen and recovers without a second payment',async()=>{
 const dir=await fs.mkdtemp(path.join(root,'node_modules','.customer-receipt-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.test'});
 const originals=new Map();for(const key of ['window','document','navigator','HTMLElement','sessionStorage','IS_REACT_ACT_ENVIRONMENT']){originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]})}
 try{
  await build({entryPoints:[path.join(root,'client/src/components/store/PosCustomerReceiptModal.jsx')],outfile:path.join(dir,'modal.mjs'),bundle:true,format:'esm',platform:'node',external:['react'],loader:{'.css':'empty'}});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
  const Modal=(await import(path.join(dir,'modal.mjs'))).default,host=document.getElementById('root'),calls=[];
  const props={store:{id:'store',name:'Virtual store'},customer:{id:'customer',name:'Virtual customer',balance:5},access:{cash:true,cards:true},receiptScope:'company:operator',onClose(){},onPaid(){},api:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});throw Error('Simulated lost response')}};
  let mounted=createRoot(host);await act(async()=>mounted.render(React.createElement(Modal,props)));
  const submit=()=>host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(host.querySelector('.pos-primary-action').disabled,true);
  await act(async()=>host.querySelector('input[type=checkbox]').click());
  await act(async()=>{submit();submit()});assert.equal(calls.length,1);assert.equal(calls[0].body.method,'CASH');assert.equal(calls[0].body.received,true);
  assert.equal(host.querySelector('input[inputmode=decimal]').disabled,true);assert.equal(host.querySelector('.pos-primary-action').textContent,'Ασφαλής επανάληψη ίδιας είσπραξης');
  await act(async()=>submit());assert.deepEqual(calls[1].body,calls[0].body);
  await act(async()=>mounted.unmount());mounted=createRoot(host);
  let result;const recovered={...props,customer:{...props.customer,balance:0},onPaid:v=>result=v,api:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {cancelled:true,customer:{id:'customer'},balance:0,points:0}}};
  await act(async()=>mounted.render(React.createElement(Modal,recovered)));assert.equal(host.querySelector('.pos-primary-action').disabled,false);
  const recover=[...host.querySelectorAll('button')].find(b=>b.textContent.includes('Έλεγχος κατάστασης'));
  await act(async()=>recover.click());assert.equal(calls.at(-1).url,'/api/store-pos/stores/store/customer-receipt-recovery');assert.deepEqual(calls.at(-1).body,calls[0].body);assert.equal(result.cancelled,true);assert.equal(sessionStorage.length,0);
  await act(async()=>mounted.unmount());
 }finally{dom.window.close();for(const [key,value]of originals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}await fs.rm(dir,{recursive:true,force:true})}
});

test('actual authorization guard rejects receipt/scan without customer rights and receipt without its method right',async()=>{
 const source=await fs.readFile(path.join(root,'server/src/middleware/auth.js'),'utf8'),start=source.indexOf('function enforceStorePosPermissions'),end=source.indexOf('\nfunction exposeStorePosRuntimeAccess',start);
 const guard=new Function(`${source.slice(start,end)};return enforceStorePosPermissions;`)();
 for(const [path,body,permissions]of [
  ['customer-card/scan',{cardCode:'VIRTUALCARD'},[]],['customer-balance-payment',{customerId:'customer',method:'CASH'},['CUSTOMERS_POS']],['customer-balance-payment',{customerId:'customer',method:'CARD'},['CUSTOMERS_POS']],['customer-receipt-recovery',{customerId:'customer'},[]],
 ]){let status;const response={status(v){status=v;return this},json(){}};assert.equal(guard({method:'POST',originalUrl:'/api/store-pos/stores/store/'+path,body},response,permissions),false);assert.equal(status,403)}
 assert.equal(guard({method:'POST',originalUrl:'/api/store-pos/stores/store/customer-balance-payment',body:{customerId:'customer',method:'CASH'}},{},['CUSTOMERS_POS','POS_CASH']),true);
});
