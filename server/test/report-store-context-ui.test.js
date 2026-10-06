import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';

// Real report installers and DOM events; in-memory GET responses only.
// This is regression coverage, not live authentication or LAB evidence.
test('store reports inherit CommerceHub and discard previous-store responses', async t => {
  const hubSource=await readFile(new URL('../../client/src/components/commerce/CommerceHub.jsx',import.meta.url),'utf8');
  assert.match(hubSource,/data-report-store-id=\{stores\.find\(store=>store\.id===storeId\)\?\.id\|\|""\}/);
  const dom = new JSDOM('<div class="commerce-hub" data-report-store-id="A" data-report-store-name="Κατάστημα Α"><section><div class="commerce-module-strip"></div></section></div>',
    {url:'https://isolated.invalid/?supportStore=wrong-url-store'});
  const names = ['window','document','location','localStorage','MutationObserver','fetch','alert'];
  const previous = new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const calls = [], pending = [];
  let delayedStore = null;
  for (const name of names) Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:dom.window[name]});
  localStorage.setItem('user',JSON.stringify({role:'SUPER_ADMIN'}));
  globalThis.alert=()=>{};
  const response = path => {
    const url=new URL(path,location.href),store=url.searchParams.get('storeId');
    if(url.pathname.endsWith('/availability'))return {reports:{}};
    return {superAdmin:true,selectedStoreId:store,companies:[{id:'C',name:'Company'}],
      stores:[{id:'A',name:'Κατάστημα Α'},{id:'B',name:'Κατάστημα Β'}],
      items:[{id:`event-${store}`,name:`row-${store}`,description:`row-${store}`,documentNumber:`row-${store}`,storeName:`Κατάστημα ${store}`,createdAt:'2026-10-06T12:00:00Z'}]};
  };
  globalThis.fetch=async path=>{
    calls.push(path);
    if(new URL(path,location.href).searchParams.get('storeId')===delayedStore)
      await new Promise(resolve=>pending.push(resolve));
    return {ok:true,json:async()=>response(path)};
  };
  const tick=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  const root=()=>document.querySelector('.kiosk-reports-suite');
  const click=selector=>{const button=document.querySelector(selector);assert.ok(button,selector);button.click();};
  const hub=document.querySelector('.commerce-hub');
  const selectStore=async id=>{hub.dataset.reportStoreName=`Κατάστημα ${id}`;hub.dataset.reportStoreId=id;await tick();};
  try {
    const {installKioskReportsSuite,syncKioskReportStore}=await import('../../client/src/components/commerce/installKioskReportsSuite.js');
    const {installKioskReportsAuditV2}=await import('../../client/src/components/commerce/installKioskReportsAuditV2.js');
    const {installKioskReportsSalesV4}=await import('../../client/src/components/commerce/installKioskReportsSalesV4.js');
    const {installKioskReportsStockV3}=await import('../../client/src/components/commerce/installKioskReportsStockV3.js');
    const {installKioskReportsDeliveryV5}=await import('../../client/src/components/commerce/installKioskReportsDeliveryV5.js');
    installKioskReportsAuditV2();installKioskReportsSalesV4();installKioskReportsStockV3();installKioskReportsDeliveryV5();installKioskReportsSuite();
    const observer=new MutationObserver(syncKioskReportStore);observer.observe(hub,{attributes:true,attributeFilter:["data-report-store-id"]});
    click('[data-kiosk-reports-launch]');await tick();
    await t.test('initial criteria contain only the selected store and every GET is scoped',async()=>{
      const select=root().querySelector('[data-kr-store]');
      assert.equal(select.value,'A');assert.equal(select.disabled,true);assert.equal(select.options.length,1);
      assert.ok(calls.some(path=>path.startsWith('/api/reports/destructions?')));
      assert.ok(calls.every(path=>new URL(path,location.href).searchParams.get('storeId')==='A'));
    });
    await t.test('Audit overrides stale URL/company/store filters and search/refresh preserve scope',async()=>{
      root().dataset.auditStoreId='B';root().dataset.auditCompanyId='wrong-company';
      click('[data-kr-tab="audit-events"]');await tick();
      const url=new URL(calls.at(-1),location.href);
      assert.equal(url.searchParams.get('storeId'),'A');assert.equal(url.searchParams.has('companyId'),false);
      assert.equal(root().querySelector('[data-kr-audit-store]'),null);
      assert.equal(root().querySelector('[data-kr-audit-company]'),null);
      assert.match(root().textContent,/row-A/);
      click('[data-kr-search]');await tick();click('[data-kr-refresh]');await tick();
      assert.equal(new URL(calls.at(-1),location.href).searchParams.get('storeId'),'A');
    });
    for (const mode of ['audit-events','destructions','sales-stats','stock-stats','delivery']) {
      await t.test(`${mode}: change store while old response is pending`,async()=>{
        delayedStore=null;await selectStore('A');
        click(`[data-kr-tab="${mode}"]`);await tick();
        delayedStore='A';click('[data-kr-refresh]');await tick();
        assert.ok(pending.length);
        await selectStore('B');
        assert.equal(root().querySelector('[data-kr-store]').value,'B');
        assert.equal(root().querySelector('[data-kr-store]').options.length,1);
        assert.ok(calls.some(path=>new URL(path,location.href).searchParams.get('storeId')==='B'));
        assert.doesNotMatch(root().textContent,/row-A/);
        assert.match(root().textContent,/row-B/);
        for(const resolve of pending.splice(0))resolve();await tick();
        assert.doesNotMatch(root().textContent,/row-A/);
        assert.match(root().textContent,/row-B/);
        delayedStore=null;
      });
    }
    await t.test('missing store clears results and sends no global report request',async()=>{
      const count=calls.length;await selectStore('');
      assert.equal(calls.length,count);assert.doesNotMatch(root().textContent,/row-[AB]/);
      assert.match(root().textContent,/Επίλεξε κατάστημα/);
      click('[data-kiosk-reports-launch]');await tick();assert.equal(calls.length,count);
    });
  } finally {
    for(const resolve of pending)resolve();dom.window.close();
    for(const [name,descriptor] of previous)descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];
  }
});
