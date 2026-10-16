import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';

test('mounted POS credit form shows signed net, requires original confirmation, keeps retry identity and isolates stale stores',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StoreSupplierCreditCash.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'}});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 const calls=[],messages=[];let fail=true,resolvePost,completed=0,changed=0;
 const data={sessionId:'shift',credits:[{id:'credit',documentNumber:'CN 0040',documentDate:'2026-10-12',totalGross:7,updatedAt:'2026-10-12T00:00:00.000Z',version:'a'.repeat(32)}],payments:[{id:'payment',documentNumber:'INV 100',amount:50,appliedAmount:0,remainingAmount:50}]};
 const api=async(path,opt={})=>{calls.push({path,...opt});if(opt.method==='POST'){if(fail)throw Error('connection interrupted');return new Promise(r=>{resolvePost=()=>r({creditAmount:7,netCashAmount:43})})}return data};
 const render=(storeId='s',allowCash=true)=>act(async()=>root.render(React.createElement(m.exports.default,{key:storeId,api,store:{id:storeId},suppliers:[{id:'sup',name:'Synthetic supplier'}],allowCash,onChanged:()=>changed++,onCompleted:()=>completed++,setMessage:v=>messages.push(v)})));
 const select=(label,value)=>act(async()=>{const e=document.querySelector(`select[aria-label="${label}"]`);e.value=value;e.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
 const reason=()=>act(async()=>{const e=document.querySelector('textarea');Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(e,'Original and actual cash checked');e.dispatchEvent(new dom.window.Event('input',{bubbles:true}));e.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
 const confirm=()=>act(async()=>document.querySelector('input[type=checkbox]').click());
 const submit=()=>act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
 try{
  await render();await select('Προμηθευτής πιστωτικού','sup');await select('Διαθέσιμο πιστωτικό','credit');await select('Αρχική πληρωμή για συμψηφισμό','payment');
  assert.match(document.querySelector('form').textContent,/-7,00/);assert.match(document.querySelector('form').textContent,/43,00/);assert.equal(document.querySelector('button[type=submit]').disabled,true);
  await reason();await submit();assert.equal(calls.filter(c=>c.method==='POST').length,0);await confirm();await submit();assert.match(document.querySelector('[role=alert]').textContent,/connection interrupted/);
  const first=JSON.parse(calls.at(-1).body);assert.equal(first.mode,'OFFSET');assert.equal(first.invoicePaymentId,'payment');assert.equal(first.expectedCreditAmount,7);assert.equal(first.expectedPaymentAmount,50);
  fail=false;await submit();const second=JSON.parse(calls.at(-1).body);assert.equal(first.idempotencyKey,second.idempotencyKey);const n=calls.length;await submit();assert.equal(calls.length,n);
  await act(async()=>resolvePost());assert.equal(completed,1);assert.equal(changed,1);assert.match(messages[0],/43,00/);
  await select('Χρήση πιστωτικού','CASH_RETURN');assert.equal(document.querySelector('input[type=checkbox]').checked,false);await confirm();await submit();
  const refund=JSON.parse(calls.at(-1).body);assert.equal(refund.mode,'CASH_RETURN');assert.equal(refund.invoicePaymentId,null);assert.equal(refund.expectedPaymentAmount,null);assert.notEqual(refund.idempotencyKey,first.idempotencyKey);
  await render('other-store');await act(async()=>resolvePost());assert.equal(completed,1);assert.equal(changed,1,'late former-store success must not close or refresh another store');
  await render('no-cash',false);await select('Προμηθευτής πιστωτικού','sup');assert.match(document.querySelector('[role=alert]').textContent,/δικαίωμα/);assert.equal(document.querySelector('button[type=submit]'),null);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
});

test('registered POS credit endpoints keep tenant/store/terminal scope and explicit permission gate',async()=>{
 const source=fs.readFileSync(new URL('../src/routes/store-transactions.js',import.meta.url),'utf8');
 const gates=source.slice(source.indexOf('function requireLedgerAccess('),source.indexOf('async function virtualBankAccount('));
 const {requireLedgerAccess}=new Function(gates+';return {requireLedgerAccess};')();
 const user={tokenType:'STORE_OPERATOR',storeId:'s',companyId:'c',id:'actor',permissions:['SUPPLIER_PAYMENT','SAME_SHIFT_PAYMENTS']};
 let status,next=0;const res={status:v=>{status=v;return res},json:()=>res};
 requireLedgerAccess({method:'GET',originalUrl:'/api/transactions/stores/s/supplier-credit-cash?supplierId=sup',user},res,()=>next++);assert.equal(next,1);
 requireLedgerAccess({method:'GET',originalUrl:'/api/transactions/stores/s/supplier-credit-cash',user:{...user,permissions:[]}},res,()=>next++);assert.equal(status,403);assert.equal(next,1);
 for(const method of ['get','post']){
  const start=source.indexOf(`router.${method}("/stores/:storeId/supplier-credit-cash"`),end=source.indexOf('\n}));',start)+5,block=source.slice(start,end),fn=block.slice(block.indexOf('async(req,res)=>'),-3);
  let receivedScope,result;
  const deps={prisma:{},z:(await import('zod')).z,assertStoreAccess:(req,id)=>assert.equal(id,'s'),ownedStore:async(id,company)=>{assert.equal(id,'s');assert.equal(company,'c')},requestTerminal:async()=> 'MAIN',supplierCreditCashContext:async(db,scope,supplier)=>{receivedScope=scope;assert.equal(supplier,'sup');return {credits:[]}},applySupplierCreditCash:async(db,scope,body)=>{receivedScope=scope;assert.equal(body.confirmOriginal,true);return {ok:true}}};
  const handler=new Function(...Object.keys(deps),`return ${fn}`)(...Object.values(deps));
  await handler({params:{storeId:'s'},query:{supplierId:'sup'},body:{confirmOriginal:true},user},{json:v=>{result=v},status:()=>({json:v=>{result=v}})});
  assert.equal(receivedScope.companyId,'c');assert.equal(receivedScope.storeId,'s');assert.equal(receivedScope.terminalPos,'MAIN');assert.equal(receivedScope.user,user);assert.ok(result);
 }
});
