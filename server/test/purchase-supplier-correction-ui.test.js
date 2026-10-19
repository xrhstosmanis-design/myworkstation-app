import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {showPurchaseSupplierCorrection} from '../../client/src/components/commerce/purchaseSupplierCorrection.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function mount({payment=true}={}){
 const dom=new JSDOM('<div id="root"></div><div id="parent"></div>'),document=dom.window.document,calls=[];let current=true,refreshes=0,finishGet,finishPost,failPost;
 const api=(path,options={})=>{calls.push({path,options});return new Promise((resolve,reject)=>{if(options.method==='POST'){finishPost=resolve;failPost=reject}else finishGet=resolve})};
 const modal=html=>{const m=document.createElement('div');m.innerHTML=html;document.body.append(m);m.addEventListener('click',event=>{if(event.target.closest('[data-po-close]'))m.remove()});return m};
 const preview={version:'a'.repeat(64),beforeSupplier:{name:'Old <supplier>'},targetSupplier:{name:'Verified <target>',taxId:'099939837'},totalGross:73.44,payment:payment?{id:'original',amount:73.43}:null};
 const open=()=>showPurchaseSupplierCorrection({root:document.querySelector('#root'),parent:document.querySelector('#parent'),order:{id:'order',storeId:'s',supplierId:'old',supplierName:'Old',invoiceNumber:'Original'},suppliers:[{id:'old',name:'Old',taxId:null},{id:'target',name:'Verified',taxId:'099939837'},{id:'unverified',name:'No VAT',taxId:null}],api,modal,esc,money:n=>n.toFixed(2),refresh:()=>refreshes++,current:()=>current});
 const choose=async()=>{const m=open(),form=m.querySelector('form');assert.equal(form.elements.supplierId.options.length,2);form.elements.supplierId.value='target';form.querySelector('[data-preview]').click();finishGet(preview);await tick();return {m,form}};
 return {dom,document,calls,open,choose,preview,resolveGet:v=>finishGet(v),resolvePost:v=>finishPost(v),rejectPost:e=>failPost(e),setCurrent:v=>current=v,refreshes:()=>refreshes};
}
test('mounted supplier correction requires original/reason/payment review, escapes names, cancels with no write and sends exactly one existing-order action',async()=>{
 const f=mount();try{
  let {m,form}=await f.choose();assert.equal(form.querySelector('[type=submit]').disabled,true);assert.equal(form.querySelectorAll('supplier,target').length,0);assert.match(form.textContent,/Old <supplier>/);
  form.querySelector('[data-po-close]').click();assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
  ({m,form}=await f.choose());form.elements.original.checked=true;form.elements.reason.value='Correct original supplier';form.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));assert.equal(form.querySelector('[type=submit]').disabled,true);
  form.elements.payment.checked=true;form.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));assert.equal(form.querySelector('[type=submit]').disabled,false);
  form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);const sent=JSON.parse(f.calls.at(-1).options.body);assert.equal(sent.storeId,'s');assert.equal(sent.supplierId,'target');assert.equal(sent.confirmPaymentSupplier,true);assert.equal(sent.version,f.preview.version);assert.equal(sent.status,undefined);
  f.resolvePost({ok:true});await tick();assert.equal(f.refreshes(),1);assert.equal(m.isConnected,false);
 }finally{f.dom.window.close()}
});
test('mounted supplier correction rejects stale store/closed parent/changed selection previews and forbids stale submissions',async()=>{
 for(const mode of ['store','parent','selection']){const f=mount();try{
  const m=f.open(),form=m.querySelector('form');form.elements.supplierId.value='target';form.querySelector('[data-preview]').click();
  if(mode==='store')f.setCurrent(false);if(mode==='parent')f.document.querySelector('#parent').remove();if(mode==='selection'){form.elements.supplierId.value='';form.elements.supplierId.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}))}
  f.resolveGet(f.preview);await tick();assert.equal(form.querySelector('[data-preview-result]').textContent,'');form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
 }finally{f.dom.window.close()}}
});
test('mounted unpaid correction has no fictitious payment acknowledgment',async()=>{
 const f=mount({payment:false});try{
  const {form}=await f.choose();assert.equal(form.elements.payment,undefined);form.elements.original.checked=true;form.elements.reason.value='Original supplier correction';form.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));
  f.resolvePost({ok:true});await tick();assert.equal(f.refreshes(),1);assert.equal(JSON.parse(f.calls.at(-1).options.body).confirmPaymentSupplier,false);
 }finally{f.dom.window.close()}
});
test('actual FINAL/INVOICED editor exposes the separate correction only to BackOffice; reopened identity and POS remain protected',async()=>{
 const source=(await readFile(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
 for(const status of ['FINAL','INVOICED']){
  const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),document=dom.window.document;dom.window.localStorage.setItem('user',JSON.stringify({role:'SUPER_ADMIN'}));let opened=0;
  const show=new Function('document','window','localStorage','fetch','greeceDateInput','installInvoiceProductMatcher','showPurchaseSupplierCorrection',source+';return showOrder;')(document,dom.window,dom.window.localStorage,async()=>{throw Error('No implicit requests')},()=> '2026-10-19',()=>{},()=>opened++);
  show(document.querySelector('#root'),{order:{id:'o',storeId:'s',sourceType:'POS_OCR_DRAFT',status},lines:[],totals:{net:0,gross:0}});assert.equal(document.querySelector('[data-order-supplier]').disabled,true);document.querySelector('[data-correct-supplier]').click();assert.equal(opened,1);dom.window.close();
 }
});

test('mounted failed correction invalidates its preview and reports the server reason',async()=>{
 const f=mount();try{const {form}=await f.choose();form.elements.original.checked=true;form.elements.payment.checked=true;form.elements.reason.value='Correct original supplier';form.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));f.rejectPost(new Error('Stale original payment'));await tick();assert.equal(form.querySelector('[role=alert]').textContent,'Stale original payment');assert.equal(form.querySelector('[type=submit]').disabled,true);assert.equal(f.refreshes(),0);form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1)}finally{f.dom.window.close()}
});
