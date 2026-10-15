import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const sourcePath=fileURLToPath(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url));
const compiled=await build({stdin:{contents:readFileSync(sourcePath,'utf8')+'\nexport {editLine};',resolveDir:fileURLToPath(new URL('../../client/src/components/commerce/',import.meta.url)),sourcefile:sourcePath},bundle:true,write:false,format:'cjs',platform:'node',external:['pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'}});

const tick=()=>new Promise(r=>setTimeout(r,15));

async function fixture(run,{barcodeOnly=false}={}){
 const dom=new JSDOM('<main id="root"></main><section id="parent"></section>',{url:'https://isolated.invalid'});
 const keys=['window','document','MutationObserver','FormData','localStorage','fetch','alert'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:dom.window[key]});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const line={id:'line',description:'CAMEL RYO BLUE 30gr',quantity:3,unitCost:7.4,discount1:0,discount2:0,discount3:0,exciseTotal:0,vatRate:0,invoiceUnit:'PIECE',stockUnitsPerInvoiceUnit:1,markupPercent:0,proposedSalePrice:0};
 const data={order:{id:'order',storeId:'store-A',status:'NEW',sourceType:'POS_OCR_DRAFT'},lines:[line],totals:{net:22.2,vat:0,gross:22.2}};
 const product={id:'existing',name:'CAMEL ΚΑΠΝΟΣ BLUE 30GR',sku:'6364',barcodes:['5213003614371'],salePrice:'7.60'};
 const calls=[],alerts=[];
 globalThis.alert=message=>alerts.push(message);
 globalThis.fetch=async(path,options={})=>{calls.push({path,options});let result={};if(path.includes('catalog-matches'))result={rows:barcodeOnly&&!path.includes('barcode=')?[]:[product],total:1,offset:0};else if(path.endsWith('/detail'))result=data;return {ok:true,json:async()=>result}};
 try{
  module.exports.editLine(document.querySelector('#root'),data,'line',document.querySelector('#parent'));await tick();
  const form=document.querySelector('.po-line-form');
  const enterBarcode=async()=>{form.querySelector('[name="barcodeMode"][value="PROVIDED"]').click();form.elements.barcode.value=product.barcodes[0];form.elements.barcode.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await tick()};
  const input=(name,value)=>{form.elements[name].value=String(value);form.elements[name].dispatchEvent(new dom.window.Event('input',{bubbles:true}))};
  const save=async()=>{const button=form.querySelector('button.primary[type="submit"]');button.click();button.click();await tick();const writes=calls.filter(c=>['POST','PATCH'].includes(c.options.method)&&!c.path.endsWith('/reconcile-ocr-total'));assert.equal(writes.length,1);assert.equal(writes[0].options.method,'PATCH');assert.equal(writes[0].path,'/api/purchase-orders/order/lines/line');assert.equal(alerts.length,0);return JSON.parse(writes[0].options.body)};
  await run({dom,form,product,calls,input,save,enterBarcode});
 }finally{document.body.replaceChildren();await tick();dom.window.close();for(const[k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
}

test('name selection shows distinct retail and copies 7.60, markup and PATCH without changing purchase fields',async()=>fixture(async({form,save,calls})=>{
 const row=document.querySelector('.po-match-candidate');assert.match(row.querySelector('.po-match-retail').textContent,/Λιανική:.*7,60/);assert.equal(row.querySelector('.po-match-identity small').textContent.includes('7,60'),false);
 row.querySelector('[data-product-pick]').click();
 assert.equal(form.elements.proposedSalePrice.value,'7.60');assert.equal(form.elements.markupPercent.value,'2.703');
 assert.match(document.querySelector('[data-product-results] .po-match-retail').textContent,/7,60/);
 assert.equal(calls.some(c=>c.options.method==='PATCH'),false);
 const body=await save();assert.equal(body.productId,'existing');assert.equal(body.proposedSalePrice,7.6);assert.equal(body.calculateFrom,'RETAIL');assert.equal(body.unitCost,7.4);assert.equal(body.quantity,3);assert.equal(body.description,'CAMEL RYO BLUE 30gr');assert.equal(body.vatRate,0);
}));

test('barcode revalidation preserves manually edited retail and recalculates markup on quantity/cost edits',async()=>fixture(async({form,enterBarcode,input,save})=>{
 await enterBarcode();assert.equal(form.elements.proposedSalePrice.value,'7.60');
 input('proposedSalePrice',8);input('unitCost',7.5);input('quantity',4);
 assert.equal(form.elements.proposedSalePrice.value,'8');assert.equal(form.elements.markupPercent.value,'6.667');
 const body=await save();assert.equal(body.proposedSalePrice,8);assert.equal(body.markupPercent,6.667);assert.equal(body.unitCost,7.5);assert.equal(body.quantity,4);
},{barcodeOnly:true}));

test('first barcode match during submit is included in fresh submitted values',async()=>fixture(async({form,product,save})=>{
 form.querySelector('[name="barcodeMode"][value="PROVIDED"]').click();form.elements.barcode.value=product.barcodes[0];
 const body=await save();assert.equal(body.productId,'existing');assert.equal(body.proposedSalePrice,7.6);assert.equal(body.markupPercent,2.703);assert.equal(body.calculateFrom,'RETAIL');
},{barcodeOnly:true}));

test('clear restores prior proposal; reselect transfers zero price and missing retail is not invented',async()=>fixture(async({form,product,input})=>{
 input('proposedSalePrice',9);document.querySelector('[data-product-pick]').click();assert.equal(form.elements.proposedSalePrice.value,'7.60');
 document.querySelector('[data-clear-product]').click();assert.equal(form.elements.proposedSalePrice.value,'9');
 product.salePrice=0;document.querySelector('[data-product-search]').click();await tick();document.querySelector('[data-product-pick]').click();assert.equal(form.elements.proposedSalePrice.value,'0.00');assert.equal(form.elements.markupPercent.value,'-100.000');
 document.querySelector('[data-clear-product]').click();product.salePrice=null;document.querySelector('[data-product-search]').click();await tick();assert.match(document.querySelector('.po-match-retail').textContent,/Μη διαθέσιμη/);document.querySelector('[data-product-pick]').click();assert.equal(form.elements.proposedSalePrice.value,'9');
}));
