import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('mounted reopen preview cancels without mutation, submits once with reason, handles errors and ignores stale context',async()=>{
 const dom=new JSDOM('<div id="root"></div><div id="parent"></div>',{url:'https://fixture.invalid'}),doc=dom.window.document,calls=[];
 const source=(await readFile(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const state={current:true},preview={version:'a'.repeat(64),expenseDelta:-10,negativeStockCount:1,stockChanges:[{name:'<fixture>',before:1,delta:-3,after:-2}],lineAudit:{lineCount:1,truncated:false,lines:[{description:'<img data-injected src=x>',quantity:'2',grossAmount:'10.00'}]}};let resolvePost,refreshes=0;
 const fetch=async(path,options={})=>{calls.push({path,options});if(options.method==='POST')return new Promise(resolve=>resolvePost=resolve);return {ok:true,json:async()=>preview}};
 const show=new Function('document','window','localStorage','fetch','greeceDateInput','installInvoiceProductMatcher',source+';return showReopen;')(doc,dom.window,dom.window.localStorage,fetch,()=> '2026-10-18',()=>{});
 const root=doc.querySelector('#root'),parent=doc.querySelector('#parent'),order={id:'fixture',storeId:'s'};
 const open=()=>show(root,parent,order,()=>refreshes++,()=>state.current);
 await open();let form=doc.querySelector('[data-reopen-form]');assert.ok(form);assert.equal(form.querySelectorAll('tbody')[1].querySelector('td').textContent,'<fixture>');assert.equal(form.querySelectorAll('fixture').length,0);assert.ok(form.querySelector('[data-reopen-line-audit]'));assert.equal(form.querySelector('[data-reopen-line-audit] tbody tr td:nth-child(2)').textContent,'<img data-injected src=x>');assert.equal(doc.querySelector('img[data-injected]'),null);
 form.querySelector('[data-po-close]').click();assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
 await open();form=doc.querySelector('[data-reopen-form]');form.elements.reason.value='Correct invoice quantities';form.elements.confirm.checked=true;form.elements.negative.checked=true;
 form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await tick();assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
 const sent=JSON.parse(calls.at(-1).options.body);assert.equal(sent.storeId,'s');assert.equal(sent.confirmNegativeStock,true);assert.equal(sent.reason,'Correct invoice quantities');
 resolvePost({ok:false,json:async()=>({error:'Stale preview'})});await tick();await tick();assert.equal(form.querySelector('[role=alert]').textContent,'Stale preview');assert.equal(refreshes,0);
 form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await tick();state.current=false;resolvePost({ok:true,json:async()=>({ok:true})});await tick();await tick();assert.equal(refreshes,0);
 dom.window.close();
});

test('actual finalized, invoiced and reopened order editors open without mutating OCR reconciliation and preserve identity controls',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),doc=dom.window.document,calls=[];
 dom.window.localStorage.setItem('user',JSON.stringify({role:'SUPER_ADMIN'}));
 const source=(await readFile(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
 let order={id:'same',storeId:'s',status:'INVOICED',sourceType:'POS_OCR_DRAFT',supplierId:'supplier',invoiceNumber:'FIXTURE'};
 const fetch=async(path,options={})=>{calls.push({path,options});assert.equal(options.method,undefined);return {ok:true,json:async()=>({order,lines:[],totals:{net:0,gross:0}})}};
 const open=new Function('document','window','localStorage','fetch','greeceDateInput','installInvoiceProductMatcher',source+';return openOrder;')(doc,dom.window,dom.window.localStorage,fetch,()=> '2026-10-18',()=>{});
 await open(doc.querySelector('#root'),'same');assert.equal(calls.length,1);assert.ok(doc.querySelector('[data-reopen]'));assert.ok(doc.querySelector('[data-cancel-invoice]'));doc.querySelector('.po-modal-overlay').remove();
 order={...order,status:'FINAL'};await open(doc.querySelector('#root'),'same');assert.equal(calls.length,2);assert.ok(doc.querySelector('[data-reopen]'));assert.ok(doc.querySelector('[data-cancel-invoice]'));doc.querySelector('.po-modal-overlay').remove();
 order={...order,awaitingInvoice:true};await open(doc.querySelector('#root'),'same');
 assert.ok(doc.querySelector('[data-return-to-draft]'));assert.equal(doc.querySelector('[data-reopen]'),null);assert.equal(doc.querySelector('[data-cancel-invoice]'),null);
 assert.equal(doc.querySelector('[data-invoice]').disabled,false);doc.querySelector('.po-modal-overlay').remove();
 order={...order,status:'NEW',awaitingInvoice:false,reopenVersion:1};await open(doc.querySelector('#root'),'same');assert.equal(calls.length,4);assert.equal(doc.querySelector('[data-order-supplier]').disabled,true);assert.equal(doc.querySelector('[data-order-invoice]').disabled,true);assert.equal(doc.querySelector('[data-add-line]').disabled,false);assert.ok(doc.querySelector('[data-invoice-assistant]'));assert.equal(doc.querySelector('[data-cancel-invoice]'),null);doc.querySelector('.po-modal-overlay').remove();
 order={...order,status:'CANCELLED',reopenVersion:2};await open(doc.querySelector('#root'),'same');assert.equal(doc.querySelector('[data-cancel-invoice]'),null);assert.equal(doc.querySelector('[data-reopen]'),null);assert.equal(doc.querySelector('[data-add-line]').disabled,true);assert.match(doc.querySelector('.po-status-large').textContent,/Ακυρωμένη/);
 dom.window.close();
});

test('delayed reopen previews cannot open after changing store or closing the source order',async()=>{
 const source=(await readFile(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
 for(const mode of ['store-change','closed-order']){
  const dom=new JSDOM('<div id="root"></div><div id="parent"></div>',{url:'https://fixture.invalid'}),doc=dom.window.document,calls=[];let finishGet,current=true,refreshes=0;
  const fetch=async(path,options={})=>{calls.push({path,options});return new Promise(resolve=>finishGet=resolve)};
  const show=new Function('document','window','localStorage','fetch','greeceDateInput','installInvoiceProductMatcher',source+';return showReopen;')(doc,dom.window,dom.window.localStorage,fetch,()=> '2026-10-18',()=>{});
  const parent=doc.querySelector('#parent'),pending=show(doc.querySelector('#root'),parent,{id:'same',storeId:'s'},()=>refreshes++,()=>current);
  if(mode==='store-change')current=false;else parent.remove();
  finishGet({ok:true,json:async()=>({version:'a'.repeat(64),stockChanges:[],negativeStockCount:0,expenseDelta:0})});await pending;
  assert.equal(doc.querySelector('[data-reopen-form]'),null);assert.equal(refreshes,0);assert.equal(calls.length,1);assert.equal(calls[0].options.method,undefined);assert.equal(parent.dataset.reopenBusy,undefined);
  dom.window.close();
 }
});

test('reopen line audit limits large previews to 100 rows and handles missing audit from older server versions',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),doc=dom.window.document;
 const source=(await readFile(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const render=new Function('document','window','localStorage','fetch','greeceDateInput','installInvoiceProductMatcher',source+';return reopenLineAuditHtml;')(doc,dom.window,dom.window.localStorage,async()=>{},()=> '2026-10-18',()=>{});
 const preview={lineAudit:{lineCount:120,truncated:false,lines:Array.from({length:120},(_,i)=>({description:`Product ${i+1}`,quantity:i+1}))}};
 const wrapper=doc.createElement('div');wrapper.innerHTML=render(preview);
 assert.equal(wrapper.querySelectorAll('tbody tr').length,100);
 assert.match(wrapper.querySelector('[data-reopen-line-audit-truncated]').textContent,/100 από 120/);
 assert.match(render({}),/data-reopen-line-audit-unavailable/);
 dom.window.close();
});

test('cancel dialog requires explicit owner confirmation, previews inverse stock and posts only once',async()=>{
 const dom=new JSDOM('<div id="root"></div><div id="parent"></div>',{url:'https://fixture.invalid'}),doc=dom.window.document,calls=[];
 dom.window.localStorage.setItem('user',JSON.stringify({role:'OWNER'}));
 const source=(await readFile(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const preview={version:'c'.repeat(64),expenseDelta:-25,negativeStockCount:1,stockChanges:[{name:'<fixture>',before:2,delta:-3,after:-1}],lineAudit:{lineCount:1,truncated:false,lines:[{description:'<img src=x>',quantity:3}]}};
 let resolvePost,refreshes=0;
 const fetch=async(path,options={})=>{calls.push({path,options});if(options.method==='POST')return new Promise(resolve=>resolvePost=resolve);return {ok:true,json:async()=>preview}};
 const cancel=new Function('document','window','localStorage','fetch','greeceDateInput','installInvoiceProductMatcher',source+';return showCancel;')(doc,dom.window,dom.window.localStorage,fetch,()=> '2026-10-18',()=>{});
 const root=doc.querySelector('#root'),parent=doc.querySelector('#parent'),order={id:'fixture',storeId:'s',status:'INVOICED',awaitingInvoice:false};
 await cancel(root,parent,order,()=>refreshes++,()=>true);
 const form=doc.querySelector('[data-cancel-form]');assert.ok(form);assert.ok(form.querySelector('[data-reopen-line-audit]'));assert.equal(form.querySelectorAll('img').length,0);
 assert.equal(form.elements.confirm.required,true);assert.equal(form.elements.negative.required,true);assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
 form.elements.reason.value='Verified duplicate supplier invoice';form.elements.confirm.checked=true;form.elements.negative.checked=true;
 form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await tick();
 const posts=calls.filter(c=>c.options.method==='POST');assert.equal(posts.length,1);assert.equal(posts[0].path,'/api/purchase-orders/fixture/cancel');
 assert.deepEqual(JSON.parse(posts[0].options.body),{storeId:'s',version:preview.version,reason:'Verified duplicate supplier invoice',confirm:true,confirmNegativeStock:true});
 resolvePost({ok:true,json:async()=>({ok:true,status:'CANCELLED'})});await tick();await tick();assert.equal(refreshes,1);
 const before=calls.length;dom.window.localStorage.setItem('user',JSON.stringify({role:'CASHIER'}));await cancel(root,parent,order,()=>{},()=>true);assert.equal(calls.length,before);
 dom.window.close();
});

test('cancel preview does not open when source order or selected store becomes stale',async()=>{
 const dom=new JSDOM('<div id="root"></div><div id="parent"></div>',{url:'https://fixture.invalid'}),doc=dom.window.document;
 dom.window.localStorage.setItem('user',JSON.stringify({role:'SUPER_ADMIN'}));
 const source=(await readFile(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
 let finishGet,current=true;
 const fetch=async()=>new Promise(resolve=>finishGet=resolve);
 const cancel=new Function('document','window','localStorage','fetch','greeceDateInput','installInvoiceProductMatcher',source+';return showCancel;')(doc,dom.window,dom.window.localStorage,fetch,()=> '2026-10-18',()=>{});
 const root=doc.querySelector('#root'),parent=doc.querySelector('#parent');
 const pending=cancel(root,parent,{id:'fixture',storeId:'s',status:'INVOICED'},()=>{},()=>current);
 current=false;finishGet({ok:true,json:async()=>({version:'c'.repeat(64),stockChanges:[],negativeStockCount:0,expenseDelta:0})});
 await pending;assert.equal(doc.querySelector('[data-cancel-form]'),null);
 dom.window.close();
});
