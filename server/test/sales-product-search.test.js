import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {greeceRangeDate} from '../../shared/greece-time.mjs';
import {salesProductSearch,matchesSalesProductSearch} from '../src/lib/sales-product-search.js';
import {installSalesProductActions} from '../../client/src/components/commerce/salesProductActions.js';

test('search folds Greek accents/case and treats SQL wildcard characters literally',()=>{
 assert.equal(salesProductSearch('  ΝΕΡΌ  ').normalized,'νερο');
 assert.equal(salesProductSearch('a%_\\').like,'%a\\%\\_\\\\%');
 assert.equal(matchesSalesProductSearch(salesProductSearch('νερο'),'ΝΕΡΌ 500ML'),true);
 assert.equal(matchesSalesProductSearch(salesProductSearch('%'),'ordinary'),false);
 assert.throws(()=>salesProductSearch({q:'x'}),{status:400});
});

const tick=()=>new Promise(r=>setTimeout(r,25));
async function application(){
 const dom=new JSDOM('<div class="kiosk-top-controls"><select><option value="WRONG-OUTER">Outer</option></select></div><div class="kiosk-sales"><main class="kiosk-main"><div class="kiosk-top-controls"><select><option value="s">Store</option><option value="other">Other</option></select></div><div class="kiosk-subtabs"></div></main></div>',{url:'https://test.invalid'});
 const w=dom.window,calls=[],blobs=[];
 w.localStorage.setItem('token','test-only');w.URL.createObjectURL=b=>{blobs.push(b);return'blob:test'};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
 const read=async url=>{calls.push(url);const q=new URL(url,'https://test.invalid').searchParams,search=q.get('q')||'';
  if(url.includes('unsold-products'))return {ok:true,json:async()=>({storeId:q.get('storeId'),search,products:[{id:'p',sku:'P',name:'Filtered water'}]})};
  if(url.includes('sales/journal'))return {ok:true,json:async()=>({search,rows:[{id:'receipt',total:20,lines:[{productId:'p',description:'Filtered water',quantity:1},{productId:'q',description:'Second product',quantity:2}],payments:[{method:'CASH',amount:20}]}]})};
  return {ok:true,json:async()=>({storeId:q.get('storeId'),search,period:{calendarFrom:q.get('from'),calendarTo:q.get('to'),days:28},sourceCoverage:{complete:true},summary:{productCount:1,quantity:28,revenue:56,dailyRevenue:2,dailyQuantity:1,days:28},products:[{productId:'p',description:'Filtered water',category:'Water',quantity:28,revenue:56,dailyQuantity:1,dailyRevenue:2}],categories:[{category:'Water',quantity:28,revenue:56}]})};
 };
 const source=await readFile(new URL('../../client/src/components/commerce/installSalesAnalysisSuite.js',import.meta.url),'utf8');
 const run=new Function('greeceDateInput','greeceRangeDate','installSalesProductActions','document','window','MutationObserver','Element','requestAnimationFrame','localStorage','fetch','Blob','URL',source.replace(/^import .*;$/gm,'').replace('export function installSalesAnalysisSuite','function installSalesAnalysisSuite')+';return installSalesAnalysisSuite;');
 run(()=> '2026-11-28',greeceRangeDate,installSalesProductActions,w.document,w,w.MutationObserver,w.Element,f=>f(),w.localStorage,read,Blob,w.URL)();
 return {dom,w,calls,blobs};
}

test('all five real tabs keep the product query and scoped dates; dirty filters disable exports, clear resets the query',async()=>{
 const {dom,w,calls,blobs}=await application();
 try{
  for(const tab of ['items','results','categories','unsold','journal']){
   w.document.querySelector(`[data-tab="${tab}"]`).click();await tick();
   const term='ΝΕΡΟ '+tab,input=w.document.querySelector('[data-product-search]');input.value=term;input.dispatchEvent(new w.Event('input',{bubbles:true}));
   const button=w.document.querySelector('[data-export]');if(button)assert.equal(button.disabled,true);
   input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick();
   const query=new URL(calls.at(-1),'https://test.invalid').searchParams;
   assert.equal(query.get('storeId'),'s');assert.equal(query.get('q'),term);
   assert.ok(w.document.querySelector('[data-product-id="p"]'));
   assert.ok(w.document.querySelector('.sas-content').textContent.includes('Φίλτρο αποτελεσμάτων: '+term));
   if(tab==='journal'){assert.match(w.document.querySelector('.sas-content').textContent,/Second product/);assert.ok(w.document.querySelector('[data-product-id="q"]'));assert.match(w.document.querySelector('.sas-content').textContent,/20,00/)}
   if(tab==='items'){w.document.querySelector('[data-export]').click();assert.ok((await blobs[0].text()).includes('Filtered water'))}
  }
  w.document.querySelector('[data-clear-search]').click();await tick();assert.equal(new URL(calls.at(-1),'https://test.invalid').searchParams.get('q'),'');assert.equal(w.document.querySelector('[data-product-search]').value,'');
 }finally{dom.window.close()}
});

test('context actions route exact product/store to the native Warehouse card; stale scopes never navigate',async()=>{
 const dom=new JSDOM('<section id="root"><div tabindex="0" data-product-id="p">A</div><div tabindex="0" data-product-id="q">B</div></section>',{url:'https://test.invalid'}),w=dom.window,root=w.document.querySelector('#root'),calls=[];
 let context={storeId:'s',from:'2026-11-01',to:'2026-11-28',query:'',token:'t',tab:'items',generation:1,valid:true};
 root.addEventListener('mws:price-catalog-full-card',e=>{calls.push(e.detail);e.preventDefault()});
 installSalesProductActions(root,()=>context,async()=>({}),async()=>({openInventoryPurchases:async d=>{calls.push({productId:d.productId,storeId:d.storeId,nativePurchases:true});await d.api('/native-test');return null}}));
 const show=()=>root.querySelector('[data-product-id="q"]').dispatchEvent(new w.MouseEvent('contextmenu',{bubbles:true,clientX:50,clientY:50,cancelable:true}));
 try{
  show();w.document.querySelector('[data-kind="purchases"]').click();await tick();assert.deepEqual(calls[0],{productId:'q',storeId:'s',nativePurchases:true});assert.equal(w.document.querySelector('[role="dialog"]'),null);assert.equal(w.document.querySelector('[role="menu"]'),null);
  show();w.document.querySelector('[data-kind="card"]').click();assert.deepEqual(calls[1],{productId:'q',storeId:'s'});
  show();context={...context,storeId:'other'};w.document.querySelector('[data-kind="card"]').click();assert.equal(calls.length,2);root.dispatchEvent(new w.CustomEvent('sas:scope-change'));assert.equal(w.document.querySelector('[role="menu"]'),null);
  root.firstElementChild.focus();w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(w.document.activeElement,root.firstElementChild);
  context={...context,storeId:'s'};show();context={...context,token:'renewed'};await new Promise(r=>setTimeout(r,280));assert.equal(w.document.querySelector('[role="menu"]'),null);assert.equal(calls.length,2);
  context={...context,valid:false};show();assert.equal(w.document.querySelector('[role="menu"]'),null);
 }finally{root.remove();await tick();w.close()}
});

test('delayed native purchase reads cannot render after a store or token change',async()=>{
 const dom=new JSDOM('<section id="root"><div data-product-id="p">Product</div></section>',{url:'https://test.invalid'}),w=dom.window,root=w.document.querySelector('#root');
 let context={storeId:'s',valid:true,token:'t'},resolve,rendered=0;
 installSalesProductActions(root,()=>context,()=>new Promise(r=>{resolve=r}),async()=>({openInventoryPurchases:async d=>{await d.api('/purchases');rendered++;return null}}));
 try{
  root.firstElementChild.dispatchEvent(new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));w.document.querySelector('[data-kind="purchases"]').click();await tick();
  context={storeId:'other',valid:true,token:'renewed'};root.dispatchEvent(new w.CustomEvent('sas:scope-change'));resolve({purchases:[]});await tick();assert.equal(rendered,0);assert.equal(w.document.querySelector('[role="dialog"]'),null);
 }finally{root.remove();await tick();w.close()}
});

test('native history export is blocked immediately when its scope changes',async()=>{
 const dom=new JSDOM('<section id="root"><div data-product-id="p">Product</div></section>',{url:'https://test.invalid'}),w=dom.window,root=w.document.querySelector('#root');let context={storeId:'s',valid:true,token:'t'},exports=0;
 installSalesProductActions(root,()=>context,async()=>({}),async()=>({openInventoryPurchases:async()=>{const view=w.document.createElement('div');view.innerHTML='<button data-export>CSV</button>';view.firstElementChild.onclick=()=>exports++;w.document.body.append(view);return view}}));
 try{root.firstElementChild.dispatchEvent(new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));w.document.querySelector('[data-kind="purchases"]').click();await tick();context={...context,storeId:'other'};w.document.querySelector('[data-export]').click();assert.equal(exports,0);assert.equal(w.document.querySelector('[data-export]'),null)}finally{root.remove();await tick();w.close()}
});
