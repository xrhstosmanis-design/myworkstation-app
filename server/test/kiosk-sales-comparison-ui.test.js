import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {salesReportCalendar} from '../src/services/sales-report-calendar.js';
import {salesComparisonPolicy,summarizeSalesComparison} from '../src/services/sales-report-comparison.js';
import {comparisonView} from '../../client/src/components/commerce/installKioskReportsSalesV4.js';

const now=new Date('2026-11-02T08:00:00Z');
const complete=count=>({complete:true,returnedGroupCount:count,totalGroupCount:count,limit:10000,totalsScope:'COMPLETE_SOURCE'});
function report(first,last,gross=30){
 const calendar=salesReportCalendar(first,last);
 const item={productId:'p',name:'Water',sku:'W',storeId:'s',salesQuantity:2,grossSales:gross,netSales:gross,vatValue:0,costValue:1,profit:gross-1};
 return {companyId:'c',storeId:'s',reversalAware:true,period:{calendarFrom:first,calendarTo:last,timeZone:'Europe/Athens',from:calendar.from.toISOString(),toExclusive:calendar.to.toISOString()},items:[item],count:1,sourceCoverage:complete(1),totalQuantity:2,totalGross:gross,totalNet:gross,totalVat:0,totalCost:1,totalProfit:gross-1,normalSaleCount:1,reversalCount:0};
}
function fixture(url){
 const first=url.searchParams.get('from'),last=url.searchParams.get('to'),calendar=salesReportCalendar(first,last);
 const current=report(first,last),previous=report(url.searchParams.get('compareFrom')||'2026-10-19',url.searchParams.get('compareTo')||'2026-10-25',15);
 const policy=salesComparisonPolicy({companyId:'c',storeId:'s',calendar,from:calendar.from,to:calendar.to,q:url.searchParams.get('q')||null,compareFrom:previous.period.calendarFrom,compareTo:previous.period.calendarTo},now);
 return {...current,comparison:summarizeSalesComparison(current,previous,policy)};
}
function recompare(data,previousGross){
 const previous=report(data.comparison.previousPeriod.calendarFrom,data.comparison.previousPeriod.calendarTo,previousGross);
 const {coverage,status,currentGrossCents,previousGrossCents,deltaGrossCents,revenueChangePercent,percentUnavailableReason,...policy}=data.comparison;
 data.comparison=summarizeSalesComparison(data,previous,policy);return data;
}

test('mounted actual sales installer makes ended Athens comparison explicit and preserves existing report behavior',async t=>{
 const dom=new JSDOM('<div class="commerce-hub" data-report-store-id="s"><div class="kiosk-reports-suite" data-report-store-id="s"><div class="kr-filter"><div><input data-kr-from value="2026-10-26"><input data-kr-to value="2026-11-01"><select data-kr-store><option value="s">Store</option><option value="">All</option></select><input data-kr-q value="Water"></div></div><button data-kr-tab="sales-stats">Sales</button><button data-kr-tab="other">Other</button><button data-kr-search>Search</button><div class="kr-toolbar"><button data-kr-refresh>Refresh</button><button data-kr-export>CSV</button></div></div></div>',{url:'https://isolated.invalid/'});
 const names=['window','document','localStorage','fetch','alert','URL'],saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:dom.window[name]});
 let mutate=x=>x,delay=false,blob,download;const calls=[],pending=[];
 globalThis.fetch=async(path,options)=>{const url=new URL(path,'https://isolated.invalid');calls.push({url,options});const data=mutate(fixture(url));if(delay)await new Promise(resolve=>pending.push(resolve));return{ok:true,json:async()=>data};};
 globalThis.alert=()=>assert.fail('unexpected alert');URL.createObjectURL=value=>{blob=value;return'blob:isolated';};URL.revokeObjectURL=()=>{};dom.window.HTMLAnchorElement.prototype.click=function(){download=this.download;};
 const tick=async()=>{for(let i=0;i<3;i++)await new Promise(resolve=>setTimeout(resolve,0));};
 const click=async selector=>{document.querySelector(selector).click();await tick();};
 const change=async(selector,value)=>{const el=document.querySelector(selector);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await tick();};
 const comparison=()=>document.querySelector('.kr-sales-comparison');
 const setPrior=()=>{document.querySelector('[data-kr-compare-from]').value='2026-10-19';document.querySelector('[data-kr-compare-to]').value='2026-10-25';};
 try{
  const {installKioskReportsSalesV4}=await import('../../client/src/components/commerce/installKioskReportsSalesV4.js');installKioskReportsSalesV4();
  await t.test('default ignores unsolicited comparison and does not guess previous dates',async()=>{
   await click('[data-kr-tab="sales-stats"]');assert.equal(comparison(),null);assert.equal(calls.at(-1).url.searchParams.has('compareFrom'),false);assert.equal(calls.at(-1).url.searchParams.has('compareTo'),false);
   assert.equal(document.querySelector('[data-kr-compare]').checked,false);assert.equal(document.querySelector('[data-kr-compare]').disabled,true);assert.equal(document.querySelector('[data-kr-compare-from]').value,'');assert.equal(document.querySelector('[data-kr-compare-to]').value,'');
   const count=calls.length;await change('[data-kr-athens]',true);assert.equal(calls.length,count);assert.equal(document.querySelector('[data-kr-compare]').disabled,false);
   await change('[data-kr-store]','');assert.equal(document.querySelector('[data-kr-compare]').disabled,true);await change('[data-kr-store]','s');
   await change('[data-kr-compare]',true);assert.equal(calls.length,count);assert.equal(document.querySelector('[data-kr-compare-from]').disabled,false);assert.match(document.querySelector('.kr-error').textContent,/δύο ημερομηνίες/);
  });
  await t.test('explicit pair uses applied scoped request and discloses unequal DST hours without claiming weekday or financial equivalence',async()=>{
   setPrior();await click('[data-kr-search]');const request=calls.at(-1);assert.equal(request.url.searchParams.get('compareFrom'),'2026-10-19');assert.equal(request.url.searchParams.get('compareTo'),'2026-10-25');assert.equal(request.url.searchParams.get('timeZone'),'Europe/Athens');assert.equal(request.url.searchParams.get('storeId'),'s');assert.equal(request.url.searchParams.get('q'),'Water');assert.equal(request.url.searchParams.has('includeComparison'),false);
   assert.match(comparison().textContent,/2026-10-26 έως και 2026-11-01 \(168 ώρες\)/);assert.match(comparison().textContent,/2026-10-19 έως και 2026-10-25 \(169 ώρες\)/);assert.match(comparison().textContent,/7 ημερολογιακές ημέρες/);assert.match(comparison().textContent,/όχι απαραίτητα ίδιες ημέρες εβδομάδας/);assert.match(comparison().textContent,/όχι τελική οικονομική συμφωνία/);
   assert.deepEqual([...comparison().querySelectorAll('tbody td')].map(x=>x.textContent),['30,00 €','15,00 €','15,00 €','100,00%']);
   document.querySelector('[data-kr-q]').value='Draft <img src=x>';document.querySelector('[data-kr-compare-from]').value='2026-10-01';assert.match(comparison().textContent,/αναζήτηση: Water/);assert.doesNotMatch(comparison().textContent,/Draft|2026-10-01/);setPrior();document.querySelector('[data-kr-q]').value='Water';
  });
  await t.test('current product CSV and drilldown retain their existing query/schema and no comparison flags',async()=>{
   const keys=Object.keys(report('2026-10-26','2026-11-01').items[0]);await click('[data-kr-export]');assert.equal(download,'anafores-statistika-poliseon.csv');const csv=await blob.text();assert.equal(csv.replace(/^\uFEFF/,'').split('\r\n')[0],keys.join(';'));assert.doesNotMatch(csv,/comparison|GrossCents|previousPeriod/);
   await click('[data-sales-product]');assert.equal(calls.at(-1).url.pathname,'/api/reports/sales-analysis/p');assert.equal(calls.at(-1).url.searchParams.has('compareFrom'),false);assert.equal(calls.at(-1).url.searchParams.has('compareTo'),false);
  });
  await t.test('zero and negative previous bases have no invented percentage; negative current turnover is not clamped',async()=>{
   for(const [base,word]of[[0,/μηδενική προηγούμενη βάση/],[-15,/αρνητική προηγούμενη βάση/]]){mutate=x=>recompare(x,base);await click('[data-kr-refresh]');assert.match(comparison().textContent,word);assert.doesNotMatch(comparison().querySelector('tbody td:last-child').textContent,/%/);}
   mutate=x=>{x.items[0].grossSales=x.totalGross=-30;return recompare(x,15);};await click('[data-kr-refresh]');assert.equal(comparison().querySelector('tbody td:last-child').textContent,'-300,00%');assert.match(comparison().textContent,/−30,00 €/);
   mutate=x=>{Object.assign(x,{items:[],count:0,sourceCoverage:complete(0),normalSaleCount:0,reversalCount:0,totalGross:0,totalQuantity:0,totalNet:0,totalVat:0,totalCost:0,totalProfit:0});return recompare(x,15);};await click('[data-kr-refresh]');assert.equal(comparison().querySelector('tbody td:last-child').textContent,'-100,00%');assert.equal(document.querySelectorAll('[data-sales-row]').length,0);mutate=x=>x;
  });
  await t.test('partial current or previous coverage withholds all comparison money while keeping the original product report',async()=>{
   for(const which of ['current','previous']){
    mutate=x=>{if(which==='current')x.sourceCoverage={complete:false,returnedGroupCount:1,totalGroupCount:2,limit:1,totalsScope:'RETURNED_GROUPS'};recompare(x,15);if(which==='previous'){const c=x.comparison;c.status='SOURCE_LIMITED';c.unavailableReason='SOURCE_LIMITED';c.coverage.previous={complete:false,returnedGroupCount:1,totalGroupCount:2,limit:1,totalsScope:'RETURNED_GROUPS'};for(const key of ['currentGrossCents','previousGrossCents','deltaGrossCents','revenueChangePercent'])delete c[key];}return x;};
    await click('[data-kr-refresh]');assert.match(comparison().textContent,/Δεν εμφανίζονται συγκρινόμενα ποσά/);assert.equal(comparison().querySelector('table'),null);assert.match(document.querySelector('.kr-sales-cards').textContent,/30,00/);assert.equal(document.querySelectorAll('[data-sales-row]').length,1);
   }mutate=x=>x;
  });
  await t.test('inconsistent scope, period, coverage, finality and money metadata cannot produce comparison amounts',async()=>{
   const bad=[x=>delete x.comparison,x=>x.comparison.companyId='other',x=>x.comparison.storeId='other',x=>x.comparison.query='other',x=>x.comparison.asOf='bad',x=>x.comparison.asOf='2026-10-30T00:00:00.000Z',x=>x.comparison.dayCount=6,x=>x.comparison.currentPeriod.from='2026-10-26T00:00:00.000Z',x=>x.comparison.previousPeriod.elapsedHours=168,x=>x.comparison.policy='RAW_DURATION',x=>x.comparison.financialFinality='FINAL',x=>x.comparison.financialReconciliationComplete=true,x=>x.comparison.basisLimitations=[],x=>x.comparison.coverage.previous.complete=false,x=>x.comparison.coverage.current.returnedGroupCount=0,x=>x.comparison.currentGrossCents='3000',x=>x.comparison.deltaGrossCents=1501,x=>x.comparison.currentGrossCents=Number.MAX_SAFE_INTEGER+1,x=>x.comparison.previousGrossCents=2**40*100+1,x=>x.items[0].grossSales=2**40+.01,x=>x.count=2,x=>x.reversalAware=false,x=>x.normalSaleCount=-1,x=>x.reversalCount=.5,x=>{x.normalSaleCount=x.reversalCount=0;},x=>x.comparison.revenueChangePercent=Infinity,x=>x.comparison.revenueChangePercent=999,x=>x.comparison.percentUnavailableReason='ZERO_BASE',x=>x.totalGross=30.01,x=>{x.totalGross=x.items[0].grossSales=30.001;},x=>x.comparison.status='UNKNOWN',x=>{x.comparison.status='SOURCE_LIMITED';x.comparison.unavailableReason='SOURCE_LIMITED';}];
   for(const change of bad){mutate=x=>{change(x);return x;};await click('[data-kr-refresh]');assert.match(comparison().textContent,/δεν επιβεβαιώνεται/);assert.equal(comparison().querySelector('table'),null);}
   mutate=x=>x;
  });
  await t.test('valid canonical floating addition noise is accepted with checked exact row cents',async()=>{
   mutate=x=>{x.items=Array.from({length:3},(_,i)=>({...x.items[0],productId:'noise-'+i,grossSales:100000000.01}));x.count=3;x.sourceCoverage=complete(3);x.totalGross=x.items.reduce((sum,row)=>sum+row.grossSales,0);return recompare(x,15);};await click('[data-kr-refresh]');assert.equal(comparison().querySelectorAll('tbody tr').length,1);assert.match(comparison().textContent,/300\.000\.000,03 €/);mutate=x=>x;
  });
  await t.test('applied labels safely escape raw filter text and comparison can coexist with hourly opt-in',async()=>{
   document.querySelector('[data-kr-q]').value='<img src=x onerror=bad>';await click('[data-kr-refresh]');assert.match(comparison().textContent,/<img src=x onerror=bad>/);assert.equal(comparison().querySelector('img'),null);
   document.querySelector('[data-kr-q]').value='Water';await change('[data-kr-hourly]',true);assert.equal(calls.at(-1).url.searchParams.get('includeHourly'),'1');assert.equal(calls.at(-1).url.searchParams.get('compareFrom'),'2026-10-19');assert.equal(comparison().querySelectorAll('tbody tr').length,1);await change('[data-kr-hourly]',false);
  });
  await t.test('old comparison responses cannot override a newer default request or changed selected store',async()=>{
   delay=true;document.querySelector('[data-kr-refresh]').click();await tick();const first=pending.shift();await change('[data-kr-compare]',false);const second=pending.shift();second();await tick();assert.equal(comparison(),null);first();await tick();assert.equal(comparison(),null);
   delay=false;await change('[data-kr-compare]',true);
   delay=false;await click('[data-kr-tab="sales-stats"]');delay=true;document.querySelector('[data-kr-refresh]').click();await tick();const storeReply=pending.shift();document.querySelector('.commerce-hub').dataset.reportStoreId='other';storeReply();await tick();assert.equal(comparison(),null);assert.equal(document.querySelector('.kr-sales-v4'),null);document.querySelector('.commerce-hub').dataset.reportStoreId='s';delay=false;
  });
  await t.test('turning Athens off disables comparison and retains explicit old default',async()=>{
   await click('[data-kr-tab="sales-stats"]');await change('[data-kr-athens]',false);assert.equal(comparison(),null);assert.equal(document.querySelector('[data-kr-compare]').checked,false);assert.equal(document.querySelector('[data-kr-compare]').disabled,true);assert.equal(document.querySelector('[data-kr-compare-from]').disabled,true);assert.equal(calls.at(-1).url.searchParams.has('compareFrom'),false);assert.equal(calls.at(-1).url.searchParams.has('compareTo'),false);assert.equal(calls.at(-1).url.searchParams.has('timeZone'),false);
  });
 }finally{for(const done of pending)done();dom.window.close();for(const[name,descriptor]of saved)descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];}
});

test('actual comparison renderer accepts the canonical 10000-row reduce noise without relaxing one-cent agreement',()=>{
 const applied=new URLSearchParams({from:'2026-10-26',to:'2026-11-01',compareFrom:'2026-10-19',compareTo:'2026-10-25',timeZone:'Europe/Athens',storeId:'s',q:'Water'});
 const data=fixture(new URL('https://isolated.invalid/?'+applied));data.items=Array.from({length:10000},(_,i)=>({...data.items[0],productId:'n-'+i,grossSales:100.01}));data.count=10000;data.sourceCoverage=complete(10000);data.totalGross=data.items.reduce((sum,row)=>sum+row.grossSales,0);recompare(data,15);
 assert.notEqual(data.totalGross,1000100);const html=comparisonView(data,applied);assert.match(html,/1\.000\.100,00 €/);assert.doesNotMatch(html,/δεν επιβεβαιώνεται/);
 data.comparison.currentGrossCents+=1;data.comparison.deltaGrossCents+=1;data.comparison.revenueChangePercent=data.comparison.deltaGrossCents/data.comparison.previousGrossCents*100;
 assert.match(comparisonView(data,applied),/δεν επιβεβαιώνεται/);
});

test('actual comparison renderer accepts the conservative exact money boundary and rejects forged larger totals',()=>{
 const applied=new URLSearchParams({from:'2026-10-26',to:'2026-11-01',compareFrom:'2026-10-19',compareTo:'2026-10-25',timeZone:'Europe/Athens',storeId:'s',q:'Water'});
 const data=fixture(new URL('https://isolated.invalid/?'+applied));data.items[0].grossSales=data.totalGross=2**40;recompare(data,15);
 assert.match(comparisonView(data,applied),/1\.099\.511\.627\.776,00 €/);
 data.comparison.currentGrossCents+=1;data.comparison.deltaGrossCents+=1;data.comparison.revenueChangePercent=data.comparison.deltaGrossCents/data.comparison.previousGrossCents*100;
 assert.match(comparisonView(data,applied),/δεν επιβεβαιώνεται/);
});

test('actual Suite plus Sales navigation rejects a late comparison after switching to documents',async()=>{
 const dom=new JSDOM('<div class="commerce-hub" data-report-store-id="s" data-report-store-name="Store"><section><div class="commerce-module-strip"></div></section></div>',{url:'https://isolated.invalid/'});
 const names=['window','document','location','localStorage','fetch','alert','URL'],saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:dom.window[name]});
 let hold=false,release;
 globalThis.fetch=async path=>{const url=new URL(path,location.href);let data;
  if(url.pathname.endsWith('/sales-analysis')){data=fixture(url);if(hold)await new Promise(resolve=>{release=resolve;});}
  else data={items:[{documentNumber:'LATEST_DOCUMENT'}]};
  return {ok:true,json:async()=>data};
 };
 localStorage.setItem('user',JSON.stringify({role:'SUPER_ADMIN'}));localStorage.setItem('token','isolated-session');
 const tick=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setTimeout(resolve,0));};
 const click=async selector=>{const target=document.querySelector(selector);assert.ok(target,selector);target.click();await tick();};
 try{
  const {installKioskReportsSuite}=await import('../../client/src/components/commerce/installKioskReportsSuite.js');
  const {installKioskReportsSalesV4}=await import('../../client/src/components/commerce/installKioskReportsSalesV4.js');
  installKioskReportsSalesV4();installKioskReportsSuite();await click('[data-kiosk-reports-launch]');
  document.querySelector('[data-kr-from]').value='2026-10-26';document.querySelector('[data-kr-to]').value='2026-11-01';document.querySelector('[data-kr-q]').value='Water';await click('[data-kr-tab="sales-stats"]');
  document.querySelector('[data-kr-athens]').checked=true;document.querySelector('[data-kr-athens]').dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  document.querySelector('[data-kr-compare]').checked=true;document.querySelector('[data-kr-compare]').dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  document.querySelector('[data-kr-compare-from]').value='2026-10-19';document.querySelector('[data-kr-compare-to]').value='2026-10-25';await click('[data-kr-refresh]');assert.ok(document.querySelector('.kr-sales-comparison table'));
  hold=true;await click('[data-kr-refresh]');assert.equal(typeof release,'function');await click('[data-kr-tab="documents"]');assert.match(document.querySelector('.kr-panel').textContent,/LATEST_DOCUMENT/);
  release();await tick();assert.equal(document.querySelector('.kr-sales-comparison'),null);assert.equal(document.querySelector('.kr-panel h3').textContent,'Παραστατικά');assert.match(document.querySelector('.kr-panel').textContent,/LATEST_DOCUMENT/);
 }finally{release?.();dom.window.close();for(const[name,descriptor]of saved)descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];}
});
