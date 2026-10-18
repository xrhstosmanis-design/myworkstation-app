import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {greeceDateTimeInput,greeceDateTimeToIso} from '../../shared/greece-time.mjs';

// Actual installer/DOM/GET/download fixtures, never a hosted or physical PASS.
test('hourly report is explicit, scoped and separate from product CSV',async t=>{
 const dom=new JSDOM('<div class="commerce-hub" data-report-store-id="s"><div class="kiosk-reports-suite" data-report-store-id="s"><div class="kr-filter"><div><input data-kr-from value="2026-10-25"><input data-kr-to value="2026-10-25"><select data-kr-store><option value="s">Store</option><option value="">All</option></select><input data-kr-q value="Water"></div></div><button data-kr-tab="sales-stats">Sales</button><button data-kr-tab="other">Other</button><div class="kr-toolbar"><button data-kr-refresh>Refresh</button><button data-kr-export>CSV</button></div></div></div>',{url:'https://isolated.invalid/'});
 const names=['window','document','localStorage','fetch','alert','URL'],previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:dom.window[name]});
 const item={productId:'p',name:'Water',sku:'W',storeId:'s',salesQuantity:2,grossSales:3,netSales:2.65,vatValue:.35,costValue:1,profit:1.65};
 const bucket=(from,normalSaleCount,reversalCount,quantities)=>{const localStart=greeceDateTimeInput(from,true);return{from,toExclusive:new Date(Date.parse(from)+3600000).toISOString(),localStart,utcOffsetSeconds:(Date.parse(localStart+'Z')-Date.parse(from))/1000,normalSaleCount,reversalCount,quantities:quantities.map(q=>({...q}))};};
 const quantities=[{unit:'KG',normalQuantity:.5,reversalQuantity:-.1,netQuantity:.4},{unit:'PIECE',normalQuantity:2,reversalQuantity:-1,netQuantity:1}];
 const fixture=url=>{const fromDay=url.searchParams.get('from'),toDay=url.searchParams.get('to'),next=new Date(Date.parse(toDay+'T12:00:00Z')+86400000).toISOString().slice(0,10),from=greeceDateTimeToIso(fromDay+'T00:00:00'),toExclusive=greeceDateTimeToIso(next+'T00:00:00');
  return {items:[item],totalQuantity:2,totalGross:3,totalNet:2.65,totalVat:.35,totalCost:1,totalProfit:1.65,normalSaleCount:2,reversalCount:1,storeId:'s',period:{calendarFrom:fromDay,calendarTo:toDay,timeZone:'Europe/Athens',from,toExclusive},sourceCoverage:{complete:true,returnedGroupCount:1,totalGroupCount:1,limit:10000,totalsScope:'COMPLETE_SOURCE'},hourlyActivity:{complete:true,totalsScope:'COMPLETE_FILTERED_SOURCE',bucketBasis:'UTC_HOUR',timeZone:'Europe/Athens',from,toExclusive,normalSaleCount:2,reversalCount:1,hours:[bucket('2026-10-25T00:00:00.000Z',1,0,quantities),bucket('2026-10-25T01:00:00.000Z',1,1,[{unit:null,normalQuantity:-.5,reversalQuantity:.25,netQuantity:-.25}])]}};
 };
 let mutate=x=>x,pending=null,blob=null,download=null;const calls=[];
 globalThis.fetch=async(path,options)=>{const url=new URL(path,'https://isolated.invalid');calls.push({url,options});const response=mutate(fixture(url));if(pending)await pending;return{ok:true,json:async()=>response};};
 globalThis.alert=()=>assert.fail('unexpected alert');URL.createObjectURL=value=>{blob=value;return'blob:isolated';};URL.revokeObjectURL=()=>{};dom.window.HTMLAnchorElement.prototype.click=function(){download=this.download;};
 const tick=async()=>{for(let i=0;i<3;i++)await new Promise(resolve=>setTimeout(resolve,0));};
 const click=async selector=>{document.querySelector(selector).click();await tick();};
 const change=async(selector,value)=>{const el=document.querySelector(selector);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await tick();};
 const hourly=()=>document.querySelector('.kr-sales-hourly'),cards=()=>[...document.querySelectorAll('.kr-sales-cards b')].map(x=>x.textContent);
 try{
  const {installKioskReportsSalesV4}=await import('../../client/src/components/commerce/installKioskReportsSalesV4.js');installKioskReportsSalesV4();
  await t.test('legacy default sends neither timeZone nor hourly and does not trust unsolicited data',async()=>{
   await click('[data-kr-tab="sales-stats"]');assert.equal(document.querySelector('[data-kr-athens]').checked,false);assert.equal(document.querySelector('[data-kr-hourly]').checked,false);assert.equal(document.querySelector('[data-kr-hourly]').disabled,true);assert.equal(calls.at(-1).url.searchParams.has('includeHourly'),false);assert.equal(calls.at(-1).url.searchParams.has('timeZone'),false);assert.equal(hourly(),null);
   const count=calls.length;await change('[data-kr-athens]',true);assert.equal(calls.length,count);assert.equal(document.querySelector('[data-kr-hourly]').disabled,false);
   await change('[data-kr-store]','');assert.equal(document.querySelector('[data-kr-hourly]').disabled,true);await change('[data-kr-store]','s');assert.equal(document.querySelector('[data-kr-hourly]').disabled,false);
  });
  await t.test('opt-in reloads scoped GET and renders repeated Athens hour with distinct offsets and per-unit signed quantities',async()=>{
   const before=cards();await change('[data-kr-hourly]',true);assert.equal(calls.at(-1).url.searchParams.get('includeHourly'),'1');assert.equal(calls.at(-1).url.searchParams.get('timeZone'),'Europe/Athens');assert.equal(calls.at(-1).url.searchParams.get('storeId'),'s');assert.equal(calls.at(-1).options.method,undefined);assert.match(hourly().textContent,/2026-10-25 03:00:00 \(UTC\+03:00\)/);assert.match(hourly().textContent,/2026-10-25 03:00:00 \(UTC\+02:00\)/);assert.match(hourly().textContent,/KG/);assert.match(hourly().textContent,/PIECE/);assert.match(hourly().textContent,/Μη καταγεγραμμένη μονάδα/);assert.match(hourly().textContent,/−?0,25|-0,25/);assert.match(hourly().textContent,/Δεν αθροίζονται διαφορετικές μονάδες/);assert.equal(hourly().querySelectorAll('tbody tr').length,2);assert.deepEqual(cards(),before);
   // Editing draft filters must never relabel already loaded observations.
   document.querySelector('[data-kr-q]').value='Draft <img src=x>';document.querySelector('[data-kr-from]').value='2026-10-24';assert.match(hourly().textContent,/αναζήτηση: Water/);assert.doesNotMatch(hourly().textContent,/Draft/);assert.match(hourly().textContent,/2026-10-25 έως και 2026-10-25/);document.querySelector('[data-kr-from]').value='2026-10-25';document.querySelector('[data-kr-q]').value='Water';
  });
  await t.test('product CSV retains its exact schema and drilldown does not inherit hourly flag',async()=>{
   await click('[data-kr-export]');assert.equal(download,'anafores-statistika-poliseon.csv');const csv=await blob.text();assert.equal(csv.replace(/^\uFEFF/,'').split('\r\n')[0],Object.keys(item).join(';'));assert.doesNotMatch(csv,/hourlyActivity|UTC_HOUR|Ωριαία/);
   await click('[data-sales-product]');assert.equal(calls.at(-1).url.pathname,'/api/reports/sales-analysis/p');assert.equal(calls.at(-1).url.searchParams.has('includeHourly'),false);
  });
  await t.test('invalid or missing hourly data warns without fabricating rows or changing product amounts',async()=>{
   const malformed=[x=>delete x.hourlyActivity,x=>x.hourlyActivity.complete=false,x=>x.hourlyActivity.totalsScope='RETURNED_GROUPS',x=>x.hourlyActivity.bucketBasis='LOCAL_HOUR',x=>x.storeId='foreign',x=>x.period.calendarFrom='2026-10-24',x=>x.period.from='2026-10-24T00:00:00.000Z',x=>x.hourlyActivity.from='2026-10-24T00:00:00.000Z',x=>x.hourlyActivity.normalSaleCount=3,x=>x.hourlyActivity.hours[0].normalSaleCount=.5,x=>x.hourlyActivity.hours[0].normalSaleCount=-1,x=>x.hourlyActivity.hours[0].normalSaleCount=Number.MAX_SAFE_INTEGER+1,x=>x.hourlyActivity.hours[0].utcOffsetSeconds=7200,x=>x.hourlyActivity.hours[0].localStart='2026-10-25T04:00:00',x=>x.hourlyActivity.hours[0].toExclusive='2026-10-25T00:30:00.000Z',x=>x.hourlyActivity.hours.reverse(),x=>x.hourlyActivity.hours.push(x.hourlyActivity.hours[0]),x=>x.hourlyActivity.hours[0].quantities.push({...x.hourlyActivity.hours[0].quantities[0]}),x=>x.hourlyActivity.hours[0].quantities[0].netQuantity=50,x=>x.hourlyActivity.hours[0].quantities[0].normalQuantity='0.5',x=>x.hourlyActivity.hours[0].quantities[0].normalQuantity=Infinity,x=>x.hourlyActivity.hours[0].quantities[0].unit={},x=>x.hourlyActivity.hours[0].quantities[0].unit='x'.repeat(129),x=>x.hourlyActivity.hours[0].quantities=Array.from({length:33},(_,i)=>({unit:String(i),normalQuantity:1,reversalQuantity:0,netQuantity:1})),x=>x.hourlyActivity.hours=Array(8786).fill(x.hourlyActivity.hours[0]),x=>x.hourlyActivity.hours[0].normalSaleCount=0];
   for(const bad of malformed){mutate=x=>{bad(x);return x;};await click('[data-kr-refresh]');assert.match(hourly().textContent,/δεν επιβεβαιώνεται/);assert.equal(hourly().querySelector('table'),null);assert.match(document.querySelector('.kr-sales-cards').textContent,/3,00/);}
   mutate=x=>x;
  });
  await t.test('empty full source is distinct from missing evidence and spring gap is not invented',async()=>{
   mutate=x=>{x.normalSaleCount=x.reversalCount=x.hourlyActivity.normalSaleCount=x.hourlyActivity.reversalCount=0;x.hourlyActivity.hours=[];return x;};await click('[data-kr-refresh]');assert.match(hourly().textContent,/Δεν καταγράφηκε ωριαία κίνηση/);assert.doesNotMatch(hourly().textContent,/δεν επιβεβαιώνεται/);
   document.querySelector('[data-kr-from]').value=document.querySelector('[data-kr-to]').value='2026-03-29';mutate=x=>{x.hourlyActivity.hours=[bucket('2026-03-29T00:00:00.000Z',1,0,[{unit:'PIECE',normalQuantity:1,reversalQuantity:0,netQuantity:1}]),bucket('2026-03-29T01:00:00.000Z',1,1,[{unit:'KG',normalQuantity:2,reversalQuantity:-1,netQuantity:1}])];return x;};await click('[data-kr-refresh]');assert.match(hourly().textContent,/2026-03-29 02:00:00/);assert.match(hourly().textContent,/2026-03-29 04:00:00/);assert.doesNotMatch(hourly().textContent,/2026-03-29 03:00:00/);assert.equal(hourly().querySelectorAll('tbody tr').length,2);
   document.querySelector('[data-kr-from]').value=document.querySelector('[data-kr-to]').value='2026-10-25';mutate=x=>x;
  });
  await t.test('hourly rows are bounded to 100 per page with full counts and stale scope fencing',async()=>{
   document.querySelector('[data-kr-from]').value='2026-10-21';
   mutate=x=>{x.normalSaleCount=x.hourlyActivity.normalSaleCount=101;x.reversalCount=x.hourlyActivity.reversalCount=0;x.hourlyActivity.hours=Array.from({length:101},(_,i)=>bucket(new Date(Date.parse(x.hourlyActivity.from)+i*3600000).toISOString(),1,0,[{unit:i===100?'<img src=x onerror=bad>':'PIECE',normalQuantity:1,reversalQuantity:0,netQuantity:1}]));return x;};
   await click('[data-kr-refresh]');assert.equal(hourly().querySelectorAll('tbody tr').length,100);assert.match(hourly().textContent,/σελίδα 1 από 2/);assert.match(hourly().textContent,/Καταγεγραμμένες ώρες: 101/);
   await click('[data-kr-hourly-page="1"]');assert.equal(hourly().querySelectorAll('tbody tr').length,1);assert.match(hourly().textContent,/σελίδα 2 από 2/);assert.match(hourly().textContent,/<img src=x onerror=bad>/);assert.equal(hourly().querySelector('img'),null);
   await click('[data-kr-hourly-page="0"]');assert.equal(hourly().querySelectorAll('tbody tr').length,100);
   document.querySelector('.commerce-hub').dataset.reportStoreId='other';await click('[data-kr-hourly-page="1"]');assert.match(hourly().textContent,/σελίδα 1 από 2/);document.querySelector('.commerce-hub').dataset.reportStoreId='s';
   await click('[data-kr-tab="other"]');await click('[data-kr-hourly-page="1"]');assert.match(hourly().textContent,/σελίδα 1 από 2/);
   document.querySelector('[data-kr-from]').value='2026-10-25';mutate=x=>x;await click('[data-kr-tab="sales-stats"]');assert.equal(hourly().querySelectorAll('tbody tr').length,2);
  });
  await t.test('Athens off clears and disables hourly while keeping legacy opt-in semantics',async()=>{
   await change('[data-kr-athens]',false);assert.equal(document.querySelector('[data-kr-hourly]').checked,false);assert.equal(document.querySelector('[data-kr-hourly]').disabled,true);assert.equal(hourly(),null);assert.equal(calls.at(-1).url.searchParams.has('includeHourly'),false);assert.equal(calls.at(-1).url.searchParams.has('timeZone'),false);await change('[data-kr-athens]',true);assert.equal(document.querySelector('[data-kr-hourly]').checked,false);assert.equal(hourly(),null);
  });
  await t.test('request-generation and selected-store guards reject old hourly observations',async()=>{
   let release;pending=new Promise(resolve=>{release=resolve;});document.querySelector('[data-kr-hourly]').checked=true;document.querySelector('[data-kr-hourly]').dispatchEvent(new dom.window.Event('change',{bubbles:true}));await tick();document.querySelector('[data-kr-hourly]').checked=false;document.querySelector('[data-kr-hourly]').dispatchEvent(new dom.window.Event('change',{bubbles:true}));await tick();release();pending=null;await tick();assert.equal(hourly(),null);
   pending=new Promise(resolve=>{release=resolve;});document.querySelector('[data-kr-hourly]').checked=true;document.querySelector('[data-kr-refresh]').click();await tick();document.querySelector('.commerce-hub').dataset.reportStoreId='other';release();pending=null;await tick();assert.equal(hourly(),null);assert.equal(document.querySelector('.kr-sales-v4'),null);
  });
 }finally{dom.window.close();for(const[name,descriptor]of previous)descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];}
});
