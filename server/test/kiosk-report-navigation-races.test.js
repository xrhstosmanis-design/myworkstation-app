import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

// Real Suite target handlers and Sales capture handler; isolated GETs only.
// A sales-only fixture with an unbound "other" button cannot prove this race.
test('ordinary report navigation preserves the newest real tab and store',async t=>{
 const dom=new JSDOM('<div class="commerce-hub" data-report-store-id="A" data-report-store-name="Store A"><section><div class="commerce-module-strip"></div></section></div>',{url:'https://isolated.invalid/?supportStore=wrong'});
 const names=['window','document','location','localStorage','fetch','alert','URL'];
 const previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:dom.window[name]});
 const calls=[],held=[];let delay=null,blob=null,download=null;
 const sale=label=>({items:[{productId:label,name:label,sku:label,storeId:'A',salesQuantity:2,grossSales:3,netSales:2.65,vatValue:.35,costValue:1,profit:1.65}],totalQuantity:2,totalGross:3,totalNet:2.65,totalVat:.35,totalCost:1,totalProfit:1.65,normalSaleCount:1,reversalCount:0,sourceCoverage:{complete:true,returnedGroupCount:1,totalGroupCount:1,limit:10000,totalsScope:'COMPLETE_SOURCE'}});
 const payload=path=>{const url=new URL(path,location.href);return url.pathname.endsWith('/sales-analysis')?sale(`sales-${url.searchParams.get('storeId')}`):{items:[{documentNumber:`document-${url.searchParams.get('storeId')}`,name:'document'}]};};
 globalThis.fetch=async(path,options)=>{
  calls.push({path,options});
  let value=payload(path);
  if(delay&&path.includes(delay))value=await new Promise((resolve,reject)=>held.push({resolve,reject,path}));
  return {ok:true,json:async()=>value};
 };
 globalThis.alert=()=>assert.fail('unexpected empty export');
 URL.createObjectURL=value=>{blob=value;return 'blob:fixture';};URL.revokeObjectURL=()=>{};
 dom.window.HTMLAnchorElement.prototype.click=function(){download=this.download;};
 localStorage.setItem('user',JSON.stringify({role:'SUPER_ADMIN'}));localStorage.setItem('token','isolated-token');
 const tick=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setTimeout(resolve,0));};
 const root=()=>document.querySelector('.kiosk-reports-suite');
 const click=async selector=>{const target=document.querySelector(selector);assert.ok(target,selector);target.click();await tick();};
 const heading=()=>root().querySelector('.kr-panel h3')?.textContent;
 const latest=()=>held.shift();
 try{
  const {installKioskReportsSuite,syncKioskReportStore}=await import('../../client/src/components/commerce/installKioskReportsSuite.js');
  const {installKioskReportsSalesV4}=await import('../../client/src/components/commerce/installKioskReportsSalesV4.js');
  installKioskReportsSalesV4();installKioskReportsSuite();await click('[data-kiosk-reports-launch]');
  await t.test('late sales success and error cannot replace the real documents tab',async()=>{
   for(const reject of [false,true]){
    delay='/sales-analysis';await click('[data-kr-tab="sales-stats"]');const old=latest();assert.ok(old);
    delay=null;await click('[data-kr-tab="documents"]');assert.equal(heading(),'Παραστατικά');
    if(reject)old.reject(new Error('STALE_SALES_ERROR'));else old.resolve(sale('STALE_SALES'));
    await tick();assert.equal(heading(),'Παραστατικά');assert.match(root().textContent,/document-A/);assert.doesNotMatch(root().textContent,/STALE_SALES/);
   }
  });
  await t.test('late documents response cannot replace a newer sales tab',async()=>{
   delay='/documents';await click('[data-kr-tab="documents"]');const old=latest();assert.ok(old);
   delay=null;await click('[data-kr-tab="sales-stats"]');assert.equal(heading(),'Στατιστικά πωλήσεων');
   old.resolve({items:[{documentNumber:'STALE_DOCUMENT'}]});await tick();
   assert.equal(heading(),'Στατιστικά πωλήσεων');assert.match(root().textContent,/sales-A/);assert.doesNotMatch(root().textContent,/STALE_DOCUMENT/);
  });
  await t.test('sales reentry keeps the newest response and CSV after older request settles',async()=>{
   delay='/sales-analysis';await click('[data-kr-refresh]');const old=latest();assert.ok(old);
   delay=null;await click('[data-kr-tab="documents"]');await click('[data-kr-tab="sales-stats"]');
   old.resolve(sale('STALE_REENTRY'));await tick();assert.match(root().textContent,/sales-A/);assert.doesNotMatch(root().textContent,/STALE_REENTRY/);
   await click('[data-kr-export]');assert.equal(download,'anafores-statistika-poliseon.csv');const csv=await blob.text();assert.match(csv,/sales-A/);assert.doesNotMatch(csv,/STALE_REENTRY/);
   assert.equal(root().querySelector('[data-kr-athens]').checked,false);
   assert.match(root().textContent,/Πλήρης κάλυψη: 1/);assert.match(root().textContent,/Μοναδικές πωλήσεις: 1/);
  });
  await t.test('changing store removes the old report root before a pending reply settles',async()=>{
   delay='/sales-analysis';await click('[data-kr-refresh]');const old=latest(),oldRoot=root();assert.ok(old);
   const hub=document.querySelector('.commerce-hub');hub.dataset.reportStoreId='B';hub.dataset.reportStoreName='Store B';delay=null;syncKioskReportStore();await tick();
   assert.equal(oldRoot.isConnected,false);assert.equal(root().querySelector('[data-kr-store]').value,'B');assert.match(root().textContent,/sales-B/);
   old.resolve(sale('STALE_STORE_A'));await tick();assert.match(root().textContent,/sales-B/);assert.doesNotMatch(root().textContent,/STALE_STORE_A|sales-A/);
   assert.equal(root().querySelector('[data-kr-store]').options.length,1);
   const before=calls.length;hub.dataset.reportStoreId='';syncKioskReportStore();await tick();assert.equal(calls.length,before);assert.match(root().textContent,/Επίλεξε κατάστημα/);
  });
  assert.ok(calls.length>5);for(const {path,options}of calls){assert.ok(['A','B'].includes(new URL(path,location.href).searchParams.get('storeId')));assert.equal(options.headers.Authorization,'Bearer isolated-token');assert.equal(options.method,undefined);}
 }finally{
  for(const pending of held)pending.resolve({items:[]});dom.window.close();
  for(const [name,descriptor]of previous)descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];
 }
});
