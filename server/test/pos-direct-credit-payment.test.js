import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import {settleUploadedCredit} from '../../client/src/lib/pos-uploaded-credit-cash.js';

const context={credits:[{id:'credit',documentNumber:'CN 0040',documentDate:'2026-10-12T00:00:00.000Z',totalGross:7,updatedAt:'2026-10-12T00:00:00.000Z',version:'a'.repeat(32)}],payments:[{id:'payment',documentNumber:'INV 100',amount:50,appliedAmount:0,remainingAmount:50}]};
test('uploaded credit reuses the exact signed request after a lost response and holds stale originals',async()=>{
 const calls=[],attempt={},selection={mode:'OFFSET',payment:context.payments[0],reason:'Original and net cash checked'};
 let fail=true;
 const api=async(path,opt={})=>{calls.push({path,...opt});if(opt.method==='POST'){if(fail)throw Error('lost response');return {duplicate:true}}return context};
 const args={api,storeId:'s',supplierId:'sup',documentNumber:'CN 0040',documentDate:'2026-10-12',totalGross:7,documentId:'credit',selection,attempt};
 await assert.rejects(settleUploadedCredit(args),/lost response/);fail=false;await settleUploadedCredit(args);
 assert.equal(calls.length,3);assert.equal(calls[1].body,calls[2].body);assert.equal(JSON.parse(calls[1].body).expectedCreditAmount,7);
 for(const change of [{totalGross:8},{documentDate:'2026-10-13'},{documentNumber:'CN 41'},{documentId:'other'},{selection:{...selection,payment:{...selection.payment,amount:51}}}])await assert.rejects(settleUploadedCredit({...args,...change,attempt:{}}));
 assert.equal(calls.filter(c=>c.method==='POST').length,2);
});

test('mounted original POS upload shows negative/net before one confirmation, retries no handoff or positive payment',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'},plugins:[{name:'camera-input-only',setup(b){
  b.onResolve({filter:/\/InvoiceVatInbox\.jsx$/},()=>({path:'header',namespace:'synthetic-input'}));
  b.onResolve({filter:/\/useMobileDocumentPhotos\.js$/},()=>({path:'mobile',namespace:'synthetic-input'}));
  b.onResolve({filter:/\/(DocumentCameraFocus|MobileDocumentPhotosQr|InvoiceQrCamera|InvoiceQrScanner)\.jsx$/},()=>({path:'unused',namespace:'synthetic-input'}));
  b.onLoad({filter:/.*/,namespace:'synthetic-input'},a=>({loader:'jsx',contents:a.path==='header'?`import React from 'react'; export default function Input(p){return <button onClick={()=>p.onRead({file:{name:'credit.jpg',type:'image/jpeg'},dataUrl:'data:image/jpeg;base64,synthetic',pageCount:1,header:{documentType:'CREDIT_NOTE',supplierTaxId:'099999999',supplierName:'Synthetic supplier',documentNumber:'CN 0040',documentDate:'2026-10-12',totalGross:7}})}>Synthetic original</button>}`:a.path==='mobile'?'export default ()=>({pending:false})':'export default ()=>null'}));
 }}]});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Event','CustomEvent','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));
 const calls=[],messages=[],drawer=[];let failed=true,completed=0;
 window.addEventListener('myworkstation:cash-drawer-request',e=>drawer.push(e.detail));
 const api=async(path,opt={})=>{calls.push({path,...opt});if(path.endsWith('fast-handoff'))return {purchaseDocumentId:'credit',jobId:'same-job'};if(opt.method==='POST'){if(failed)throw Error('lost response');return {creditAmount:7,negativePaymentAmount:-7,netCashAmount:43}}return context};
 const select=(label,value)=>act(async()=>{const e=document.querySelector(`select[aria-label="${label}"]`);e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}))});
 const submit=()=>act(async()=>document.querySelector('.pos-primary-action').click());
 try{
  await act(async()=>root.render(React.createElement(m.exports.default,{api,store:{id:'s'},suppliers:[{id:'sup',name:'Synthetic supplier',taxId:'099999999'}],setMessage:v=>messages.push(v),onCompleted:()=>completed++})));
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Synthetic original').click());
  assert.match(document.body.textContent,/-7,00/);assert.equal(document.querySelector('.pos-primary-action').disabled,true);assert.equal(calls.filter(c=>c.method==='POST').length,0);
  await select('Τρόπος αρνητικής πληρωμής','OFFSET');await select('Πληρωμή για άμεσο συμψηφισμό','payment');assert.match(document.body.textContent,/43,00/);
  await act(async()=>{const e=document.querySelector('textarea');Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(e,'Original and net cash checked');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))});
  await submit();assert.equal(calls.filter(c=>c.method==='POST').length,0);
  await act(async()=>document.querySelector('input[type=checkbox]').click());await submit();assert.match(messages.at(-1),/lost response/);
  failed=false;await submit();assert.equal(calls.filter(c=>c.path.endsWith('fast-handoff')).length,1);assert.equal(calls.filter(c=>c.path==='/api/transactions/stores/s').length,0);
  const posts=calls.filter(c=>c.path.endsWith('supplier-credit-cash')&&c.method==='POST');assert.equal(posts.length,2);assert.equal(posts[0].body,posts[1].body);assert.equal(JSON.parse(posts[0].body).invoicePaymentId,'payment');
  assert.equal(completed,1);assert.equal(drawer.length,0);assert.match(messages.at(-1),/-7.00/);assert.match(messages.at(-1),/43.00/);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
});

test('actual background persistence uses the guarded cash settlement before updating the same credit draft',()=>{
 const s=fs.readFileSync(new URL('../src/routes/commerce-pos-v244-core.js',import.meta.url),'utf8');
 const a=s.indexOf('const readSettlement='),b=s.indexOf('stage="create-purchase-order"',a);
 assert.ok(a>0&&b>a);assert.match(s.slice(a,b),/await creditCashReadSettlement\(tx/);assert.match(s.slice(a,b),/"settlementMode"=\$\{readSettlement\}/);
});

test('direct cash return submits a negative credit intent without selecting an invoice payment',async()=>{
 let posted;
 await settleUploadedCredit({api:async(path,opt={})=>{if(opt.method==='POST'){posted=JSON.parse(opt.body);return {negativePaymentAmount:-7}}return context},storeId:'s',supplierId:'sup',documentNumber:'CN 0040',documentDate:'2026-10-12',totalGross:7,documentId:'credit',selection:{mode:'CASH_RETURN',reason:'Cash physically returned'},attempt:{}});
 assert.equal(posted.mode,'CASH_RETURN');assert.equal(posted.invoicePaymentId,null);assert.equal(posted.expectedPaymentAmount,null);assert.equal(posted.expectedCreditAmount,7);assert.equal(posted.confirmOriginal,true);
});
