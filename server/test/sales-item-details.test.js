import test from 'node:test';
import assert from 'node:assert/strict';
import {readSalesItemDetails} from '../src/services/sales-item-details.js';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const filters={companyId:'c',storeId:'s',from:'2026-03-28',to:'2026-03-30',timeZone:'Europe/Athens'};
function fixture({items=null,complete=true,owned=true}={}){
 const calls=[];
 const db={$queryRaw:async(strings,...values)=>{const sql=strings.join('?');calls.push({sql,values});
  if(sql.includes('FROM "Store"'))return owned?[{id:'s'}]:[];
  if(sql.includes('FROM "Product"'))return [{id:'p',sku:'P',unit:'PIECE',categoryName:'Κατάστημα',subcategoryName:'Υποκατηγορία',brandName:'Brand',currentRetail:'3.5',productCompanyId:'maker'}];
  if(sql.includes('to_regclass'))return [{available:true}];
  if(sql.includes('FROM "ManagementProductCompany"'))return [{id:'maker',name:'Εταιρεία'}];
  throw Error('Unexpected read');
 }};
 const sourceItems=items??[{productId:'p',storeId:'s',name:'Same name',unit:'PIECE',salesQuantity:9,grossSales:33.48,netSales:27,costValue:9,discountValue:0,_costIncomplete:false}];
 const readSource=async(scope,options)=>{calls.push({scope,options});return {items:sourceItems,sourceCoverage:{complete},period:{timeZone:'Europe/Athens'}}};
 return {db,readSource,calls};
}

test('item details preserve source cost and selected-store metadata; daily divisor includes DST and zero-sale calendar days',async()=>{
 const f=fixture(),out=await readSalesItemDetails(filters,f),r=out.products[0];
 assert.equal(out.period.days,3);assert.equal(r.dailyQuantity,3);assert.ok(Math.abs(r.dailyRevenue-11.16)<1e-9);
 assert.equal(r.profit,18);assert.ok(Math.abs(r.margin-66.6666666667)<1e-8);assert.equal(r.currentRetail,3.5);
 assert.equal(r.category,'Κατάστημα');assert.equal(r.companyName,'Εταιρεία');
 const source=f.calls.find(c=>c.scope);assert.equal(source.scope.from.toISOString(),'2026-03-27T22:00:00.000Z');assert.equal(source.scope.to.toISOString(),'2026-03-30T21:00:00.000Z');assert.equal(source.options.strictRead,true);
 const meta=f.calls.find(c=>c.sql?.includes('FROM "Product"'));assert.deepEqual(meta.values.slice(0,2),['s','c']);assert.ok(meta.sql.includes('"categoryIdOverride"'));
});

test('unavailable cost stays unknown, measured zero stays zero and identical descriptions never merge product identities',async()=>{
 const items=[{productId:'p',storeId:'s',name:'Same',salesQuantity:3,grossSales:12,netSales:10,costValue:0,_costIncomplete:true,unit:'PIECE'},
 {productId:'q',storeId:'s',name:'Same',salesQuantity:2,grossSales:6,netSales:5,costValue:0,_costIncomplete:false,unit:'PIECE'}];
 const out=await readSalesItemDetails(filters,fixture({items}));assert.equal(out.products.length,2);
 assert.equal(out.products[0].costValue,null);assert.equal(out.products[0].profit,null);
 assert.equal(out.products[1].costValue,0);assert.equal(out.products[1].profit,5);assert.equal(out.summary.profit,null);assert.equal(out.summary.missingCostProducts,1);
});

test('all source groups beyond legacy100 are retained, incomplete caps fail, mixed units are not averaged together',async()=>{
 const items=Array.from({length:101},(_,i)=>({productId:'p'+i,storeId:'s',name:'Same',unit:i?'PIECE':'KG',salesQuantity:1,grossSales:2,netSales:2,costValue:1,_costIncomplete:false}));
 const out=await readSalesItemDetails(filters,fixture({items}));assert.equal(out.products.length,101);assert.equal(out.summary.revenue,202);assert.equal(out.summary.dailyQuantity,null);assert.equal(out.summary.mixedUnits,true);
 await assert.rejects(readSalesItemDetails(filters,fixture({complete:false})),{status:422});
 await assert.rejects(readSalesItemDetails(filters,fixture({owned:false})),{status:404});
 await assert.rejects(readSalesItemDetails({...filters,storeId:''},fixture()),{status:400});
 await assert.rejects(readSalesItemDetails({...filters,to:'2026-02-30'},fixture()),{status:400});
 await assert.rejects(readSalesItemDetails(filters,fixture({items:[{storeId:'foreign'}]})),{status:502});
});

test('empty reports use the selected calendar divisor and perform no product/catalog reads',async()=>{
 const f=fixture({items:[]}),out=await readSalesItemDetails({...filters,from:'2026-11-01',to:'2026-11-27'},f);
 assert.equal(out.period.days,27);assert.equal(out.summary.revenue,0);assert.equal(out.summary.dailyRevenue,0);assert.deepEqual(out.products,[]);assert.equal(f.calls.filter(x=>x.sql).length,1);
});

test('actual installed items table renders metadata, daily averages and matching CSV without HTML injection',async()=>{
 const source=await readFile(new URL('../../client/src/components/commerce/installSalesAnalysisSuite.js',import.meta.url),'utf8');
 const dom=new JSDOM('<div class="kiosk-sales"><main class="kiosk-main"><div class="kiosk-top-controls"><select><option value="s">STORE</option></select></div><div class="kiosk-subtabs"></div></main></div>',{url:'https://test.invalid'});
 const window=dom.window,calls=[],blobs=[];let response=await readSalesItemDetails({...filters,from:'2026-11-01',to:'2026-11-27'},fixture());
 response.products[0].description='<img src=x onerror=alert(1)>';
 window.localStorage.setItem('token','test-only');
 window.URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:test'};window.URL.revokeObjectURL=()=>{};window.HTMLAnchorElement.prototype.click=function(){};
 const fetchImpl=async(url)=>{calls.push(url);return {ok:true,json:async()=>response}};
 const run=new Function('greeceDateInput','document','window','MutationObserver','Element','requestAnimationFrame','localStorage','fetch','Blob','URL',source.replace(/^import .*;$/gm,'').replace('export function installSalesAnalysisSuite','function installSalesAnalysisSuite')+'\nreturn installSalesAnalysisSuite;');
 try{
  const install=run(()=> '2026-11-27',window.document,window,window.MutationObserver,window.Element,fn=>fn(),window.localStorage,fetchImpl,Blob,window.URL);install();
  window.document.querySelector('[data-tab="items"]').click();await new Promise(r=>setTimeout(r,30));
  assert.match(calls[0],/itemDetails=1/);assert.match(calls[0],/from=2026-11-01/);assert.match(calls[0],/storeId=s/);
  const panel=window.document.querySelector('.sas-content');assert.match(panel.textContent,/Εταιρεία/);assert.match(panel.textContent,/Υποκατηγορία/);assert.match(panel.textContent,/27/);assert.equal(panel.querySelector('img'),null);
  const row=panel.querySelector('.sas-table.items .sas-row:not(.head)');assert.equal(row.children.length,12);assert.equal(row.children[3].textContent,'<img src=x onerror=alert(1)>');assert.match(row.children[9].textContent,/3,50/);
  panel.querySelector('[data-export]').click();assert.equal(blobs.length,1);const csv=await blobs[0].text();assert.ok(csv.includes('Μ.Ο. αξίας / ημέρα'));assert.ok(csv.includes(row.children[11].textContent));
 }finally{window.close()}
});
