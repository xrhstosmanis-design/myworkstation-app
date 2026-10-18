import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

// Actual installer and DOM events with isolated GET fixtures. Not hosted LAB evidence.
test('ordinary sales report discloses coverage without changing amounts, filters or CSV',async t=>{
 const dom=new JSDOM('<div class="commerce-hub" data-report-store-id="s"><div class="kiosk-reports-suite" data-report-store-id="s"><div class="kr-filter"><div><input data-kr-from value="2026-10-10"><input data-kr-to value="2026-10-10"><select data-kr-store><option value="s">Store</option></select><input data-kr-q value="TEST1"></div></div><button data-kr-tab="sales-stats">Sales</button><button data-kr-tab="other">Other</button><div class="kr-toolbar"><button data-kr-refresh>Refresh</button><button data-kr-export>CSV</button></div></div></div>',{url:'https://isolated.invalid/'});
 const names=['window','document','localStorage','fetch','alert','URL'];
 const previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:dom.window[name]});
 const item={productId:'p',name:'Fixture <script>bad</script>',sku:'TEST1',storeId:'s',salesQuantity:2,grossSales:3,netSales:2.65,vatValue:.35,costValue:1,profit:1.65,normalSaleCount:20,reversalCount:12};
 const fixture=(count=2,complete=true,total=count)=>({items:Array.from({length:count},(_,i)=>({...item,productId:`p${i}`})),totalQuantity:4,totalGross:6,totalNet:5.3,totalVat:.7,totalCost:2,totalProfit:3.3,normalSaleCount:1,reversalCount:1,sourceCoverage:{complete,returnedGroupCount:count,totalGroupCount:total,limit:10000,totalsScope:complete?'COMPLETE_SOURCE':'RETURNED_GROUPS'}});
 let response=fixture(),pending=null,download=null,blob=null;const calls=[];
 globalThis.fetch=async(path,options)=>{calls.push({path,options});if(pending)await pending;return {ok:true,json:async()=>response};};
 globalThis.alert=()=>assert.fail('unexpected alert');
 URL.createObjectURL=value=>{blob=value;return 'blob:isolated';};URL.revokeObjectURL=()=>{};
 dom.window.HTMLAnchorElement.prototype.click=function(){download=this.download;};
 localStorage.setItem('token','isolated-fixture');
 const tick=async()=>{for(let i=0;i<3;i++)await new Promise(resolve=>setTimeout(resolve,0));};
 const click=async selector=>{document.querySelector(selector).click();await tick();};
 const panel=()=>document.querySelector('.kr-sales-v4');
 const cards=()=>[...panel().querySelectorAll('.kr-sales-cards b')].map(el=>el.textContent);
 try{
  const {installKioskReportsSalesV4}=await import('../../client/src/components/commerce/installKioskReportsSalesV4.js');installKioskReportsSalesV4();
  await t.test('complete source uses unique top-level counts and preserves Athens opt-in and GET scope',async()=>{
   await click('[data-kr-tab="sales-stats"]');assert.match(panel().textContent,/Πλήρης κάλυψη: 2/);assert.match(panel().textContent,/Μοναδικές πωλήσεις: 1/);assert.match(panel().textContent,/Μοναδικές επιστροφές \/ ακυρώσεις: 1/);assert.doesNotMatch(panel().textContent,/Μοναδικές πωλήσεις: 40/);
   assert.equal(panel().querySelector('script'),null);assert.equal(document.querySelector('[data-kr-athens]').checked,false);
   let url=new URL(calls.at(-1).path,'https://isolated.invalid');assert.equal(url.searchParams.get('storeId'),'s');assert.equal(url.searchParams.get('q'),'TEST1');assert.equal(url.searchParams.has('timeZone'),false);
   document.querySelector('[data-kr-athens]').checked=true;await click('[data-kr-refresh]');url=new URL(calls.at(-1).path,'https://isolated.invalid');assert.equal(url.searchParams.get('timeZone'),'Europe/Athens');assert.equal(url.searchParams.get('from'),'2026-10-10');assert.equal(url.searchParams.get('to'),'2026-10-10');assert.equal(calls.at(-1).options.headers.Authorization,'Bearer isolated-fixture');
  });
  await t.test('declared-limit exact complete differs from truncated source and amounts remain unchanged',async()=>{
   const before=cards();response={...fixture(2),sourceCoverage:{...fixture(2).sourceCoverage,limit:2}};await click('[data-kr-refresh]');assert.match(panel().textContent,/Πλήρης κάλυψη: 2/);assert.doesNotMatch(panel().textContent,/Μερική κάλυψη/);
   response={...fixture(2,false,3),sourceCoverage:{...fixture(2,false,3).sourceCoverage,limit:2}};await click('[data-kr-refresh]');assert.match(panel().textContent,/Μερική κάλυψη: εμφανίζονται 2 από 3/);assert.match(panel().textContent,/χρηματικά σύνολα αφορούν μόνο τις εμφανιζόμενες ομάδες/);assert.equal(panel().querySelectorAll('.kr-sales-cards span').length,6);assert.ok([...panel().querySelectorAll('.kr-sales-cards span')].every(x=>x.textContent.includes('εμφανιζόμενες ομάδες')));assert.deepEqual(cards(),before);assert.match(panel().querySelector('.kr-summary').textContent,/Τζίρος \(εμφανιζόμενες ομάδες\)/);
  });
  await t.test('missing and inconsistent metadata withdraw complete claims and stale unique counts',async()=>{
   const cases=[undefined,{...fixture().sourceCoverage,returnedGroupCount:1},{...fixture().sourceCoverage,complete:false},{...fixture().sourceCoverage,totalGroupCount:'<img src=x onerror=bad>'},{...fixture().sourceCoverage,limit:0},{...fixture().sourceCoverage,limit:10001}];
   for(const c of cases){response=fixture();if(c===undefined)delete response.sourceCoverage;else response.sourceCoverage=c;await click('[data-kr-refresh]');assert.match(panel().textContent,/πληρότητα της πηγής δεν επιβεβαιώνεται/);assert.doesNotMatch(panel().textContent,/Πλήρης κάλυψη|Μερική κάλυψη|Μοναδικές πωλήσεις/);assert.equal(panel().querySelector('img'),null);assert.ok([...panel().querySelectorAll('.kr-sales-cards span')].every(x=>x.textContent.includes('μη επιβεβαιωμένη πληρότητα')));}
  });
  await t.test('empty complete source and invalid count do not invent basket counts',async()=>{
   response={...fixture(0),normalSaleCount:0,reversalCount:0};await click('[data-kr-refresh]');assert.match(panel().textContent,/Πλήρης κάλυψη: 0/);assert.match(panel().textContent,/Μοναδικές πωλήσεις: 0/);assert.match(panel().textContent,/Δεν βρέθηκαν πωλήσεις/);
   response={...fixture(),normalSaleCount:1.5};await click('[data-kr-refresh]');assert.doesNotMatch(panel().textContent,/Μοναδικές πωλήσεις/);
  });
  await t.test('CSV keeps existing row schema and exact values, disclosure stays outside data',async()=>{
   response=fixture();await click('[data-kr-refresh]');await click('[data-kr-export]');assert.equal(download,'anafores-statistika-poliseon.csv');const csv=await blob.text();assert.equal(csv.replace(/^\uFEFF/,'').split('\r\n')[0],Object.keys(response.items[0]).join(';'));assert.match(csv,/"3";"2.65";"0.35"/);assert.doesNotMatch(csv,/Πλήρης κάλυψη|sourceCoverage|Μοναδικές/);assert.match(panel().textContent,/Το CSV εξάγει τις εμφανιζόμενες γραμμές/);
  });
  await t.test('store invalidation suppresses a late complete-source response',async()=>{
   let release;pending=new Promise(resolve=>{release=resolve;});document.querySelector('[data-kr-refresh]').click();await tick();document.querySelector('.commerce-hub').dataset.reportStoreId='other';release();pending=null;await tick();assert.equal(panel(),null);assert.doesNotMatch(document.querySelector('.kiosk-reports-suite').textContent,/Πλήρης κάλυψη|Μοναδικές πωλήσεις/);
  });
 }finally{dom.window.close();for(const [name,descriptor]of previous)descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];}
});
