import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountInvoiceProducts} from '../../client/src/invoice-assistant-products.js';
const flush=()=>new Promise(r=>setTimeout(r,0));
const detail={lines:[{id:'first',description:'Chips 100GR'},{id:'second',description:'Juice 250ML'}]};
const proposal=id=>({storeId:'store',lineId:id,version:'a'.repeat(64),line:{id,description:id==='first'?'Chips 100GR':'Juice 250ML',quantity:1,invoiceUnit:'PIECE',stockUnitsPerInvoiceUnit:1,vatRate:13},proposal:{name:'Chips 100GR',barcode:'',categoryId:'cat',subcategoryId:'sub',vatDepartmentId:'',salePrice:null,costPrice:1},candidates:[{id:'existing',name:'Existing Chips 100GR',unit:'PIECE',vatDepartmentId:'vat13',salePrice:2}],categories:[{id:'cat',name:'Food'}],subcategories:[{id:'sub',categoryId:'cat',name:'Chips'}],vatDepartments:[{id:'vat13',description:'Food13',vatRate:13},{id:'second13',description:'Other13',vatRate:13}],identities:[],reference:null,notice:'Review originals'});
test('mounted actual preparation: auto-read only, stale responses, explicit fiscal choice, no-barcode save, double-click/retry identity and detached response',async()=>{
 const dom=new JSDOM('<div id="host"></div>',{url:'https://isolated.invalid'}),previous=globalThis.document;globalThis.document=dom.window.document;
 const host=document.getElementById('host'),calls=[],waiting=[];let saveResolve,saves=0,active=true,completed=0;
 const api=async(path,options)=>{calls.push({path,options});if(options){saves++;return new Promise(r=>{saveResolve=r})}return new Promise(resolve=>waiting.push({path,resolve}))};
 const mounted=mountInvoiceProducts(host,{api,orderId:'order',storeId:'store',isActive:()=>active,onSaved:()=>{completed++}});
 const field=name=>host.querySelector(`[name="${name}"]`),change=(name,value)=>{const el=field(name);el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));el.dispatchEvent(new dom.window.Event('input',{bubbles:true}))};
 try{
 mounted.refresh(detail);assert.equal(saves,0);assert.match(waiting[0].path,/storeId=store/);
 host.querySelector('[data-product-prepare="second"]').click();waiting[0].resolve(proposal('first'));await flush();assert.equal(host.querySelector('form'),null);
 waiting[1].resolve(proposal('second'));await flush();assert.equal(field('vatDepartmentId').value,'');assert.equal(saves,0);
 change('mode','NEW');change('salePrice','2.50');change('vatDepartmentId','second13');assert.equal(field('allowPosPriceChange').checked,true);assert.equal(field('barcode').value,'');assert.equal(field('subcategoryId').value,'sub');
 const form=host.querySelector('form');form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await flush();assert.equal(saves,0,'review confirmation required');
 field('reviewed').checked=true;form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await flush();assert.equal(saves,1);
 const body=JSON.parse(calls.find(x=>x.options).options.body);assert.equal(body.barcode,'');assert.equal(body.mode,'NEW');assert.equal(body.storeId,'store');assert.equal(body.vatDepartmentId,'second13');assert.equal(body.salePrice,2.5);assert.equal(body.allowPosPriceChange,true);assert.equal(body.reviewed,true);assert.equal(body.version,'a'.repeat(64));
 saveResolve({productId:'created'});await flush();assert.equal(completed,1);assert.doesNotMatch(host.querySelector('[data-product-list]').textContent,/Juice/);assert.match(host.textContent,/Δεν άλλαξαν/);
 mounted.refresh(detail);active=false;waiting.at(-1).resolve(proposal('first'));await flush();assert.equal(host.querySelector('form'),null);assert.equal(saves,1);
 }finally{dom.window.close();if(previous)globalThis.document=previous;else delete globalThis.document}
});
test('mounted existing selection preserves card values and uses blank barcode; failed transport retries same request identity',async()=>{
 const dom=new JSDOM('<div id="host"></div>',{url:'https://isolated.invalid'}),previous=globalThis.document;globalThis.document=dom.window.document;const host=document.getElementById('host'),bodies=[];
 try{const mounted=mountInvoiceProducts(host,{api:async(path,options)=>{if(!options)return proposal('first');bodies.push(JSON.parse(options.body));if(bodies.length===1)throw Error('Connection lost');return {productId:'existing'}},orderId:'order',storeId:'store',isActive:()=>true});mounted.refresh(detail);await flush();const selected=host.querySelector('[name=productId]');selected.value='existing';selected.dispatchEvent(new dom.window.Event('change'));assert.equal(host.querySelector('[name=vatDepartmentId]').value,'vat13');host.querySelector('[name=reviewed]').checked=true;const form=host.querySelector('form');form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await flush();assert.match(host.textContent,/Connection lost/);form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await flush();assert.equal(bodies.length,2);assert.equal(bodies[0].requestId,bodies[1].requestId);assert.equal(bodies[0].productId,'existing');assert.equal(bodies[0].barcode,'');assert.equal(bodies[0].mode,'EXISTING');}finally{dom.window.close();if(previous)globalThis.document=previous;else delete globalThis.document}
});
