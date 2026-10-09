import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createInvoiceCatalogLookup} from '../src/lib/invoice-catalog-lookup.js';
import {catalogTokens,rankCatalogMatches} from '../../shared/invoice-catalog-match.mjs';
import {installInvoiceProductMatcher} from '../../client/src/invoice-product-matcher.js';

test('supplier abbreviations rank honey/lemon sugar-free and cocoa/vanilla ahead of unrelated variants',()=>{
 const rows=['HALLS CHERRY','HALLS COOLWAVE ΛΕΜΟΝΙ','HALLS ΜΕΛΙ ΛΕΜΟΝΙ ΧΩΡΙΣ ΖΑΧΑΡΗ 32GR'].map((name,i)=>({id:String(i),name}));
 assert.equal(rankCatalogMatches(rows,'ΚΑΡ HLS ΜΕΛ/ΛΕΜΟΝΙ Χ/Ζ 32GX20')[0].id,'2');
 const minis=['7DAYS MINI ΚΡΟΥΑΣΑΝ ΒΑΝΙΛΙΑ 103GR','7DAYS MINI ΚΡΟΥΑΣΑΝ ΚΑΚΑΟ ΒΑΝΙΛΙΑ 103GR'].map((name,i)=>({id:String(i),name}));
 assert.equal(rankCatalogMatches(minis,'7D MINI ΚΡΣΝ ΚΑΚ-ΒΑΝ 103GX12')[0].id,'1');
 assert.ok(catalogTokens('μέλι λεμόνι').includes('ΜΕΛΙ'));
});

test('catalog lookup uses owned line and own-store active products; barcode is exact and name results are paged',async()=>{
 const calls=[],products=Array.from({length:28},(_,i)=>({id:String(i),name:`HALLS ${i}`,barcodes:['5200000000000']}));
 const db={$queryRaw:async(strings,...values)=>{const sql=strings.join('?');calls.push({sql,values});return sql.includes('PurchaseOrderLine')?[{storeId:'store-A'}]:products}};
 const lookup=createInvoiceCatalogLookup(db);
 const run=async(query={},user={companyId:'co'})=>{const req={params:{orderId:'order',lineId:'line'},query,user},res={statusCode:200,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};let error;await lookup(req,res,e=>error=e);if(error)throw error;return res};
 let res=await run({q:'halls',storeId:'store-A'});assert.equal(res.body.rows.length,25);assert.equal(res.body.hasMore,true);res=await run({q:'halls',offset:'25'});assert.equal(res.body.rows.length,3);assert.equal(res.body.hasMore,false);
 res=await run({barcode:'5200000000000'});assert.equal(res.body.exact,true);const call=calls.at(-1);assert.match(call.sql,/b\."barcode"=\?/);assert.match(call.sql,/sp\."storeId"=\?/);assert.match(call.sql,/p\."companyId"=\?/);assert.ok(call.values.includes('store-A'));assert.ok(call.values.includes('co'));assert.doesNotMatch(call.sql,/ILIKE|MasterProduct/);
 const before=calls.length;assert.equal((await run({barcode:'123'})).statusCode,400);assert.equal(calls.length,before+1);
 assert.equal((await run({q:'halls',storeId:'store-B'})).statusCode,404);
 assert.equal((await run({q:'halls'},{companyId:'co',tokenType:'STORE_OPERATOR',storeId:'store-B'})).statusCode,404);
 assert.equal((await run({q:'halls'},{companyId:null})).statusCode,403);
 let missing=createInvoiceCatalogLookup({$queryRaw:async()=>[]});let code;await missing({user:{companyId:'foreign'},params:{},query:{}},{status(n){code=n;return this},json(){}},assert.fail);assert.equal(code,404);
 assert.ok(calls.every(c=>!/(?:INSERT|UPDATE|DELETE)/.test(c.sql)));
});

test('actual matching DOM selects exact barcodes, keeps invoice name, blocks failed/stale/ambiguous saves and exposes next page',async()=>{
 const dom=new JSDOM('<main></main>',{url:'https://isolated.invalid'}),keys=['window','document','MutationObserver'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:dom.window[key]});
 const product={id:'existing',name:'Warehouse name',sku:'SKU',barcodes:['5200000000000'],salePrice:1},supplierName='ΚΑΡ HLS ΜΕΛ/ΛΕΜΟΝΙ Χ/Ζ 32GX20';
 const tick=()=>new Promise(r=>setTimeout(r,5));
 try{
  function fixture(api){
   const modal=document.createElement('section');modal.innerHTML=`<input data-product-q><button data-product-search>Search</button><div data-product-results></div><form><input name="description" value="${supplierName}"><fieldset data-new-product-barcode><input type="radio" name="barcodeMode" value="NONE" checked><input type="radio" name="barcodeMode" value="PROVIDED"><input type="radio" name="barcodeMode" value="GENERATED"><input name="barcode"></fieldset></form>`;document.body.appendChild(modal);
   let selected=null;const matcher=installInvoiceProductMatcher({modal,orderId:'same-order',storeId:'store-A',lineId:'same-line',description:supplierName,api,onSelect:p=>selected=p,esc:s=>String(s),money:s=>String(s)});
   const form=modal.querySelector('form'),enter=value=>{form.querySelector('[value="PROVIDED"]').checked=true;form.elements.barcode.value=value;form.elements.barcode.dispatchEvent(new dom.window.Event('change',{bubbles:true}))};
   return {modal,form,matcher,enter,selected:()=>selected};
  }
  const calls=[];let barcodeRows=[product],failure=false;
  const f=fixture(async path=>{calls.push(path);if(failure)throw Error('Unavailable');const q=new URL(path,'https://isolated.invalid').searchParams;return q.has('barcode')?{rows:barcodeRows,total:barcodeRows.length,exact:true,offset:0}:{rows:[],total:0,hasMore:false,offset:0}});await tick();f.enter('5200000000000');await tick();assert.equal(f.selected().id,'existing');assert.equal(f.form.elements.description.value,supplierName);assert.match(f.modal.querySelector('[data-product-results]').textContent,/περιγραφή.*παραμένει ίδια/);const count=calls.length;await f.matcher.beforeSave();assert.equal(calls.length,count+1);
  f.modal.querySelector('[data-clear-product]').click();assert.equal(f.selected(),null);barcodeRows=[];f.enter('5200000000001');await tick();assert.match(f.modal.querySelector('[data-barcode-check]').textContent,/Δεν βρέθηκε άλλο είδος/);await f.matcher.beforeSave();assert.equal(f.selected(),null);
  failure=true;await assert.rejects(f.matcher.beforeSave(),/Unavailable/);failure=false;barcodeRows=[product,{...product,id:'second'}];f.enter('5200000000000');await tick();assert.equal(f.selected(),null);await assert.rejects(f.matcher.beforeSave(),/Επίλεξε/);f.modal.querySelector('[data-product-pick="1"]').click();await f.matcher.beforeSave();assert.equal(f.selected().id,'second');assert.equal(f.form.elements.description.value,supplierName);f.modal.remove();
  let finish;const g=fixture(async path=>new URL(path,'https://isolated.invalid').searchParams.has('barcode')?new Promise(r=>finish=r):{rows:[],total:0,offset:0});await tick();g.enter('5200000000000');g.form.elements.barcode.value='5200000000001';finish({rows:[product]});await tick();assert.equal(g.selected(),null);g.modal.remove();
  let finishSaving;const h=fixture(async path=>new URL(path,'https://isolated.invalid').searchParams.has('barcode')?new Promise(r=>finishSaving=r):{rows:[],total:0,offset:0});await tick();h.form.querySelector('[value="PROVIDED"]').checked=true;h.form.elements.barcode.value='5200000000000';const saving=h.matcher.beforeSave();h.form.elements.barcode.value='5200000000001';finishSaving({rows:[product]});await assert.rejects(saving,/barcode άλλαξε/);h.modal.remove();
  const paged=fixture(async path=>{const offset=Number(new URL(path,'https://isolated.invalid').searchParams.get('offset')||0);return {rows:[product],offset,total:26,hasMore:offset===0}});await tick();assert.ok(paged.modal.querySelector('[data-match-next]'));paged.modal.querySelector('[data-match-next]').click();await tick();assert.match(paged.modal.querySelector('[data-product-results]').textContent,/26–26/);assert.ok(paged.modal.querySelector('[data-match-previous]'));paged.modal.remove();
 }finally{document.querySelectorAll('section').forEach(n=>n.remove());await tick();dom.window.close();for(const[k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
});
