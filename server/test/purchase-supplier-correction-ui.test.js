import {installMyDataPrintedEconomicsNotice} from '../../client/src/lib/mydata-printed-economics-notice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {showPurchaseSupplierCorrection} from '../../client/src/components/commerce/purchaseSupplierCorrection.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function mount({payment=true,officialLookup=false}={}){
 const dom=new JSDOM('<div id="root"></div><div id="parent"></div>'),document=dom.window.document,calls=[];let current=true,refreshes=0,finishGet,finishPost,failPost;
 const api=(path,options={})=>{calls.push({path,options});return new Promise((resolve,reject)=>{if(options.method==='POST'){finishPost=resolve;failPost=reject}else finishGet=resolve})};
 const modal=html=>{const m=document.createElement('div');m.innerHTML=html;document.body.append(m);m.addEventListener('click',event=>{if(event.target.closest('[data-po-close]'))m.remove()});return m};
 const preview={version:'a'.repeat(64),beforeSupplier:{name:'Old <supplier>'},targetSupplier:{name:'Verified <target>',taxId:'099939837'},totalGross:73.44,payment:payment?{id:'original',amount:73.43}:null};
 const open=()=>showPurchaseSupplierCorrection({root:document.querySelector('#root'),parent:document.querySelector('#parent'),order:{id:'order',storeId:'s',supplierId:'old',supplierName:'Old',invoiceNumber:'Original'},suppliers:[{id:'old',name:'Old',taxId:null},{id:'target',name:'Verified',taxId:'099939837'},{id:'unverified',name:'No VAT',taxId:null}],api,modal,esc,money:n=>n.toFixed(2),refresh:()=>refreshes++,current:()=>current,officialLookup});
 const choose=async()=>{const m=open(),form=m.querySelector('form');assert.equal(form.elements.supplierId.options.length,2);form.elements.supplierId.value='target';form.querySelector('[data-preview]').click();finishGet(preview);await tick();return {m,form}};
 return {dom,document,calls,open,choose,preview,resolveGet:v=>finishGet(v),resolvePost:v=>finishPost(v),rejectPost:e=>failPost(e),setCurrent:v=>current=v,refreshes:()=>refreshes};
}
test('mounted supplier correction requires original/reason/payment review, escapes names, cancels with no write and sends exactly one existing-order action',async()=>{
 const f=mount();try{
  let {m,form}=await f.choose();assert.equal(form.querySelector('[type=submit]').disabled,true);assert.equal(form.querySelectorAll('supplier,target').length,0);assert.match(form.querySelector('[data-save-status]').textContent,/έλεγξες το πρωτότυπο/);assert.match(form.textContent,/Old <supplier>/);
  form.querySelector('[data-po-close]').click();assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
  ({m,form}=await f.choose());form.elements.original.checked=true;form.elements.reason.value='Correct original supplier';form.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));assert.equal(form.querySelector('[type=submit]').disabled,true);assert.match(form.querySelector('[data-save-status]').textContent,/υπάρχουσας πληρωμής/);
  form.elements.payment.checked=true;form.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));assert.equal(form.querySelector('[type=submit]').disabled,false);
  form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);const sent=JSON.parse(f.calls.at(-1).options.body);assert.equal(sent.storeId,'s');assert.equal(sent.supplierId,'target');assert.equal(sent.confirmPaymentSupplier,true);assert.equal(sent.version,f.preview.version);assert.equal(sent.status,undefined);
  f.resolvePost({ok:true});await tick();assert.equal(f.refreshes(),1);assert.equal(m.isConnected,false);
 }finally{f.dom.window.close()}
});

test("official AFM check is optional, read-only and discards results after selection changes",async()=>{
 const disabled=mount(),enabled=mount({officialLookup:true});
 try{
  assert.equal(disabled.open().querySelector('[data-official-supplier]'),null);
  const form=enabled.open().querySelector('form'),button=form.querySelector('[data-official-supplier]'),field=form.elements.supplierId;
  assert.equal(button.disabled,true);
  field.value='target';
  field.dispatchEvent(new enabled.dom.window.Event('change',{bubbles:true}));
  button.click();
  assert.equal(enabled.calls.length,1);
  assert.match(enabled.calls[0].path,/storeId=s&taxId=099939837&official=1$/);
  assert.equal(enabled.calls[0].options.method,undefined);
  field.value='';
  field.dispatchEvent(new enabled.dom.window.Event('change',{bubbles:true}));
  enabled.resolveGet({name:'<result>',address:'Synthetic address'});
  await tick();
  assert.equal(form.querySelector('[data-official-supplier-result]').textContent,'');
  assert.equal(form.querySelector('[type=submit]').disabled,true);
 }finally{disabled.dom.window.close();enabled.dom.window.close()}
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
  const show=new Function('document','window','localStorage','fetch','greeceDateInput','installInvoiceProductMatcher','showPurchaseSupplierCorrection','installMyDataPrintedEconomicsNotice',source+';return showOrder;')(document,dom.window,dom.window.localStorage,async()=>{throw Error('No implicit requests')},()=> '2026-10-19',()=>{},()=>opened++,installMyDataPrintedEconomicsNotice);
  show(document.querySelector('#root'),{order:{id:'o',storeId:'s',sourceType:'POS_OCR_DRAFT',status},lines:[],totals:{net:0,gross:0}});assert.equal(document.querySelector('[data-order-supplier]').disabled,true);document.querySelector('[data-correct-supplier]').click();assert.equal(opened,1);dom.window.close();
 }
});

test('mounted failed correction invalidates its preview and reports the server reason',async()=>{
 const f=mount();try{const {form}=await f.choose();form.elements.original.checked=true;form.elements.payment.checked=true;form.elements.reason.value='Correct original supplier';form.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));f.rejectPost(new Error('Stale original payment'));await tick();assert.equal(form.querySelector('[role=alert]').textContent,'Stale original payment');assert.equal(f.document.activeElement,form.querySelector('[role=alert]'));assert.equal(form.querySelector('[type=submit]').disabled,true);assert.equal(f.refreshes(),0);form.dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1)}finally{f.dom.window.close()}
});

test('supplier creation reaches its own handler without opening OCR mutation access',async()=>{
 const {default:express}=await import('express');
 const {default:ocr}=await import('../src/routes/purchase-order-ocr-resolution.js');
 const app=express();
 app.use((req,res,next)=>{
  req.user={id:'staff',companyId:'synthetic',storeId:'lab',role:'EMPLOYEE',staffAccess:true};
  req.staffGrant={capability:'invoices.supplier-create'};
  next();
 });
 app.use('/api/commerce/purchase-orders',ocr);
 app.post('/api/commerce/purchase-orders/:orderId/issuer-supplier',(req,res)=>res.status(201).json({id:'synthetic-supplier'}));
 const server=app.listen(0,'127.0.0.1');
 try{
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api/commerce/purchase-orders/order`;
  const issuer=await fetch(base+'/issuer-supplier',{method:'POST'});
  assert.equal(issuer.status,201);
  assert.deepEqual(await issuer.json(),{id:'synthetic-supplier'});
  const ocrWrite=await fetch(base+'/ocr-lines/row/create-product',{method:'POST'});
  assert.equal(ocrWrite.status,403);
 }finally{
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
