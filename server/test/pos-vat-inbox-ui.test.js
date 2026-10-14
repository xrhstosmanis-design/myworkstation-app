import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

async function component(name='InvoiceVatInbox'){
 const compiled=await build({entryPoints:[fileURLToPath(new URL(`../../client/src/components/store/${name}.jsx`,import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',plugins:[{name:'invoice-ui-dependencies',setup(b){
  b.onResolve({filter:/lucide-react|DocumentCameraFocus|InvoiceQr(Camera|Scanner)|useMobileDocumentPhotos|MobileDocumentPhotosQr|document-image-quality|invoice-fast-header-merge|invoice-fast-supplier-match|document-photo-pdf|DocumentPhotoList|invoice-v244/},args=>({path:args.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.includes('useMobile')?'export default ()=>({pending:false,createQr:()=>{}})':args.path.includes('supplier-match')?'export const knownSupplierFromFastHeaders=(h,s)=>s.find(x=>x.taxId===h[0]?.supplierTaxId)':args.path.includes('document-photo-pdf')?'export const bundleDocumentPhotos=async files=>files[0],validatePhotoSelection=()=>{}':args.path.includes('document-image-quality')?'export const prepareDocumentFile=async file=>({file})':args.path.includes('header-merge')?'export const mergeFastInvoiceHeaders=()=>({})':args.path.includes('invoice-v244')?'export const finalizeV244ProductLines=x=>x':args.path.includes('lucide')?'export const Camera=()=>null,FileUp=()=>null,Wallet=()=>null':'export default ()=>null'}));
 }}]});
 const m={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);return m.exports.default;
}
async function environment(run){
 const dom=new JSDOM('<div id="root"></div>'),keys=['window','document','navigator','HTMLElement','File','FileReader','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));
 const click=async text=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===text||b.textContent.includes(text));assert.ok(b,text);await React.act(async()=>b.click())};
 const change=async(input,value)=>{await React.act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})};
 try{await run({React,root,dom,click,change})}finally{await React.act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=previous.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
}
const supplier={id:'sup',name:'LAB',taxId:'099999999'},header={supplierTaxId:'099999999',documentNumber:'A 12',documentDate:'2026-10-14',totalGross:11.30,documentType:'INVOICE'},pdf={inboxId:'inbox',filename:'original.pdf',dataUrl:'data:application/pdf;base64,'+Buffer.from('%PDF-'+ 'a'.repeat(110)).toString('base64'),pageCount:1,header};
test('mounted VAT lookup selects known supplier and exact PDF only after explicit choice, without payment/job calls',async()=>{
 const View=await component();await environment(async({React,root,click,change})=>{
  const calls=[],reads=[],selected=[];const api=async(path,opt)=>{calls.push([path,JSON.parse(opt.body)]);return JSON.parse(opt.body).inboxId?pdf:{items:[{inboxId:'inbox',header}],message:'Επίλεξε'}};
  await React.act(async()=>root.render(React.createElement(View,{api,store:{id:'s'},suppliers:[supplier],onSupplier:x=>selected.push(x),onRead:x=>reads.push(x)})));
  await change(document.querySelector('[aria-label="ΑΦΜ προμηθευτή"]'),'099999999');await click('Εύρεση προμηθευτή');assert.equal(selected[0].id,'sup');assert.equal(reads.length,0);assert.equal(calls.length,1);
  await click('Λήψη PDF');assert.equal(reads[0].file.type,'application/pdf');assert.equal(reads[0].inboxId,'inbox');assert.equal(calls.length,2);assert.ok(calls.every(([p])=>p==='/api/commerce/documents/pos-inbox'));
 });
});
test('mounted unknown supplier requires official response and explicit creation before invoice search; missing PDF leaves photos',async()=>{
 const View=await component();await environment(async({React,root,click,change})=>{
  const calls=[];const api=async(path,opt)=>{calls.push(path);if(path.includes('vat-lookup'))return {valid:true,taxId:supplier.taxId,name:'Official LAB'};if(path.endsWith('/suppliers'))return {...supplier,name:'Official LAB'};if(JSON.parse(opt.body).inboxId)throw Error('Ο πάροχος δεν έχει PDF');return {items:[{inboxId:'inbox',header}],message:'Επίλεξε'}};
  await React.act(async()=>root.render(React.createElement(View,{api,store:{id:'s'},onSupplier:()=>{},onRead:()=>assert.fail('missing PDF')})));
  await change(document.querySelector('[aria-label="ΑΦΜ προμηθευτή"]'),supplier.taxId);await click('Εύρεση προμηθευτή');assert.equal(calls.length,1);await click('Επιβεβαίωση και καταχώριση');assert.deepEqual(calls.slice(1),['/api/commerce/suppliers','/api/commerce/documents/pos-inbox']);await click('Λήψη PDF');assert.match(document.body.textContent,/Χρησιμοποίησε|χρησιμοποιήσεις φωτογραφίες/);
 });
});
test('mounted pending lookup is discarded after VAT edit or store change/unmount',async()=>{
 const View=await component();await environment(async({React,root,click,change})=>{
  let resolve;const api=()=>new Promise(r=>resolve=r),reads=[];
  const props={api,suppliers:[supplier],onSupplier:()=>{},onRead:x=>reads.push(x)};
  await React.act(async()=>root.render(React.createElement(View,{...props,store:{id:'s'}})));await change(document.querySelector('input'),supplier.taxId);await click('Εύρεση προμηθευτή');await change(document.querySelector('input'),'011111111');await React.act(async()=>resolve({items:[{inboxId:'inbox',header}],message:'STALE'}));assert.ok(!document.body.textContent.includes('STALE'));
  await change(document.querySelector('input'),supplier.taxId);await click('Εύρεση προμηθευτή');await React.act(async()=>root.render(React.createElement(View,{...props,store:{id:'other'}})));await React.act(async()=>resolve({items:[{inboxId:'inbox',header}],message:'STALE'}));assert.equal(document.querySelector('input').value,'');assert.equal(reads.length,0);assert.ok(!document.body.textContent.includes('STALE'));
 });
});
test('mounted Premium keeps an explicitly created official supplier selected after the inbox PDF fills the payment header',async()=>{
 const View=await component('StoreSupplierInvoicePremiumFast');await environment(async({React,root,click,change})=>{
  const calls=[],api=async(path,opt)=>{calls.push(path);if(path.includes('vat-lookup'))return {valid:true,taxId:supplier.taxId,name:'Official new supplier'};if(path.endsWith('/suppliers'))return {...supplier,name:'Official new supplier'};if(path.endsWith('/pos-inbox'))return JSON.parse(opt.body).inboxId?pdf:{items:[{inboxId:'inbox',header}],message:'Choose'};throw Error(path)};
  await React.act(async()=>root.render(React.createElement(View,{api,store:{id:'s'},suppliers:[],setMessage:()=>{}})));
  await change(document.querySelector('[aria-label="ΑΦΜ προμηθευτή"]'),supplier.taxId);await click('Εύρεση προμηθευτή');await click('Επιβεβαίωση και καταχώριση');await click('Λήψη PDF');
  const select=document.querySelector('.pos-invoice-fields-area select');assert.equal(select.value,'sup');assert.match(select.selectedOptions[0].textContent,/Official new supplier/);assert.equal(calls.filter(p=>p.endsWith('/suppliers')).length,1);assert.ok(!calls.some(p=>p.includes('/transactions')));
 });
});
for(const mode of ['PAID','CREDIT'])for(const name of ['StoreSupplierInvoicePremiumFast','StoreSupplierInvoiceFast'])test('mounted '+name+' '+mode+' fills amount/number first, preserves explicit paid/credit and payment-before-handoff ordering',async()=>{
 const View=await component(name);await environment(async({React,root,click,change})=>{
  const calls=[];let completed=0;const api=async(path,opt)=>{calls.push([path,opt?.body?JSON.parse(opt.body):null]);if(path.endsWith('/pos-inbox'))return JSON.parse(opt.body).inboxId?pdf:{items:[{inboxId:'inbox',header}],message:'Choose'};if(path.endsWith('fast-duplicate-check'))return {ok:true};if(path.startsWith('/api/transactions'))return {id:'pay'};if(path.endsWith('fast-handoff'))return {receiptLinked:true,jobId:'job'};throw Error(path)};
  await React.act(async()=>root.render(React.createElement(View,{api,store:{id:'s'},suppliers:[supplier],setMessage:()=>{},onCompleted:()=>completed++})));
  await change(document.querySelector('[aria-label="ΑΦΜ προμηθευτή"]'),supplier.taxId);await click('Εύρεση προμηθευτή');await click('Λήψη PDF');
  assert.ok([...document.querySelectorAll('input')].some(x=>x.value==='11,30'));assert.ok([...document.querySelectorAll('input')].some(x=>x.value==='A 12'));assert.equal(calls.length,2);assert.equal(document.querySelector('.pos-primary-action').disabled,true);
  await click(mode==='PAID'?'ΠΛΗΡΩΜΕΝΟ':'ΜΕ ΠΙΣΤΩΣΗ');assert.equal(document.querySelector('.pos-primary-action').disabled,false);await click(mode==='PAID'?'ΠΛΗΡΩΜΗ & ΕΠΙΣΤΡΟΦΗ':'ΚΑΤΑΧΩΡΙΣΗ ΜΕ ΠΙΣΤΩΣΗ');
  // FileReader delivers Basic's unchanged file asynchronously.
  await React.act(async()=>{await new Promise(done=>setTimeout(done,25))});
  const mutations=calls.slice(2);assert.deepEqual(mutations.map(x=>x[0]),mode==='PAID'?['/api/commerce/ai-reader/fast-duplicate-check','/api/transactions/stores/s','/api/commerce/ai-reader/fast-handoff']:['/api/commerce/ai-reader/fast-duplicate-check','/api/commerce/ai-reader/fast-handoff']);if(mode==='PAID'){assert.equal(mutations[1][1].amount,11.3);assert.equal(mutations[1][1].paymentMethod,'CASH_SHIFT')}assert.equal(mutations.at(-1)[1].paymentTransactionId,mode==='PAID'?'pay':null);assert.equal(mutations.at(-1)[1].settlementMode,mode);assert.equal(mutations.at(-1)[1].myDataInboxId,'inbox');assert.equal(completed,1);
 });
});
