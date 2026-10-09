import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('production invoice form saves barcode match to existing product with supplier description and no duplicate creation',async()=>{
 const dom=new JSDOM('<main id="root"></main><section id="parent"></section>',{url:'https://isolated.invalid'}),keys=['window','document','MutationObserver','FormData','localStorage','fetch','alert'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:dom.window[key]});
 const supplierDescription='ΚΑΡ HLS ΜΕΛ/ΛΕΜΟΝΙ ΧΖ 32GX20',line={id:'line',description:supplierDescription,quantity:20,unitCost:1.05,discount1:48.666667,discount2:0,discount3:0,exciseTotal:0,vatRate:13,invoiceUnit:'PIECE',stockUnitsPerInvoiceUnit:1,markupPercent:0,proposedSalePrice:0};
 const order={id:'order',storeId:'store-A',status:'NEW',sourceType:'POS_OCR_DRAFT'},data={order,lines:[line],totals:{net:10.78,vat:1.4,gross:12.18}},calls=[],alerts=[];
 globalThis.alert=message=>alerts.push(message);
 globalThis.fetch=async(path,options={})=>{calls.push({path,options});let result={};if(path.includes('catalog-matches'))result=path.includes('barcode=')?{rows:[{id:'existing',name:'HALLS warehouse name',sku:'SKU',barcodes:['5200000000000'],salePrice:1.2}],total:1,offset:0,exact:true}:{rows:[],total:0,offset:0};else if(path.endsWith('/detail'))result=data;else if(path.includes('supplier-profile'))result={};return {ok:true,json:async()=>result}};
 const sourcePath=fileURLToPath(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url));
 const compiled=await build({stdin:{contents:readFileSync(sourcePath,'utf8')+'\nexport {editLine};',resolveDir:fileURLToPath(new URL('../../client/src/components/commerce/',import.meta.url)),sourcefile:sourcePath},bundle:true,write:false,format:'cjs',platform:'node',external:['pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'}});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const tick=()=>new Promise(r=>setTimeout(r,10));
 try{
  module.exports.editLine(document.querySelector('#root'),data,'line',document.querySelector('#parent'));await tick();
  const form=document.querySelector('.po-line-form');form.querySelector('[name="barcodeMode"][value="PROVIDED"]').click();form.elements.barcode.value='5200000000000';form.elements.barcode.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await tick();
  assert.equal(form.elements.description.value,supplierDescription);assert.match(document.querySelector('[data-product-results]').textContent,/HALLS warehouse name/);
  const button=form.querySelector('button.primary[type="submit"]');button.click();button.click();await tick();
  const writes=calls.filter(c=>['POST','PATCH'].includes(c.options.method)&&!c.path.endsWith('/reconcile-ocr-total'));assert.equal(writes.length,1);assert.equal(writes[0].options.method,'PATCH');assert.equal(writes[0].path,'/api/purchase-orders/order/lines/line');const body=JSON.parse(writes[0].options.body);assert.equal(body.productId,'existing');assert.equal(body.description,supplierDescription);assert.equal(body.quantity,20);assert.equal(body.unitCost,1.05);assert.ok(calls.filter(c=>c.path.includes('barcode=')).length>=2);assert.equal(writes.some(c=>c.path.endsWith('/create-product')),false);
 }finally{document.body.replaceChildren();await tick();dom.window.close();for(const[k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
});
