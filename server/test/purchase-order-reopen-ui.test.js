import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('mounted reopen preview cancels without mutation, submits once with reason, handles errors and ignores stale context',async()=>{
 const dom=new JSDOM('<div id="root"></div><div id="parent"></div>',{url:'https://fixture.invalid'}),doc=dom.window.document,calls=[];
 const source=(await readFile(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const state={current:true},preview={version:'a'.repeat(64),expenseDelta:-10,negativeStockCount:1,stockChanges:[{name:'<fixture>',before:1,delta:-3,after:-2}]};let resolvePost,refreshes=0;
 const fetch=async(path,options={})=>{calls.push({path,options});if(options.method==='POST')return new Promise(resolve=>resolvePost=resolve);return {ok:true,json:async()=>preview}};
 const show=new Function('document','window','localStorage','fetch','greeceDateInput','installInvoiceProductMatcher',source+';return showReopen;')(doc,dom.window,dom.window.localStorage,fetch,()=> '2026-10-18',()=>{});
 const root=doc.querySelector('#root'),parent=doc.querySelector('#parent'),order={id:'fixture',storeId:'s'};
 const open=()=>show(root,parent,order,()=>refreshes++,()=>state.current);
 await open();let form=doc.querySelector('[data-reopen-form]');assert.ok(form);assert.equal(form.querySelector('tbody td').textContent,'<fixture>');assert.equal(form.querySelectorAll('fixture').length,0);
 form.querySelector('[data-po-close]').click();assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
 await open();form=doc.querySelector('[data-reopen-form]');form.elements.reason.value='Correct invoice quantities';form.elements.confirm.checked=true;form.elements.negative.checked=true;
 form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await tick();assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
 const sent=JSON.parse(calls.at(-1).options.body);assert.equal(sent.storeId,'s');assert.equal(sent.confirmNegativeStock,true);assert.equal(sent.reason,'Correct invoice quantities');
 resolvePost({ok:false,json:async()=>({error:'Stale preview'})});await tick();await tick();assert.equal(form.querySelector('[role=alert]').textContent,'Stale preview');assert.equal(refreshes,0);
 form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await tick();state.current=false;resolvePost({ok:true,json:async()=>({ok:true})});await tick();await tick();assert.equal(refreshes,0);
 dom.window.close();
});

test('actual invoiced and reopened order editors open without mutating OCR reconciliation and preserve identity controls',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),doc=dom.window.document,calls=[];
 dom.window.localStorage.setItem('user',JSON.stringify({role:'SUPER_ADMIN'}));
 const source=(await readFile(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
 let order={id:'same',storeId:'s',status:'INVOICED',sourceType:'POS_OCR_DRAFT',supplierId:'supplier',invoiceNumber:'FIXTURE'};
 const fetch=async(path,options={})=>{calls.push({path,options});assert.equal(options.method,undefined);return {ok:true,json:async()=>({order,lines:[],totals:{net:0,gross:0}})}};
 const open=new Function('document','window','localStorage','fetch','greeceDateInput','installInvoiceProductMatcher',source+';return openOrder;')(doc,dom.window,dom.window.localStorage,fetch,()=> '2026-10-18',()=>{});
 await open(doc.querySelector('#root'),'same');assert.equal(calls.length,1);assert.ok(doc.querySelector('[data-reopen]'));doc.querySelector('.po-modal-overlay').remove();
 order={...order,status:'NEW',reopenVersion:1};await open(doc.querySelector('#root'),'same');assert.equal(calls.length,2);assert.equal(doc.querySelector('[data-order-supplier]').disabled,true);assert.equal(doc.querySelector('[data-order-invoice]').disabled,true);assert.equal(doc.querySelector('[data-add-line]').disabled,false);assert.equal(doc.querySelector('[data-invoice-assistant]'),null);
 dom.window.close();
});
