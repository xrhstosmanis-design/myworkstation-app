import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('actual invoice grid derives previously linked markup from gross cost per piece and store retail without changing the line',async()=>{
 const file=fileURLToPath(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url));
 const compiled=await build({stdin:{contents:readFileSync(file,'utf8')+'\nexport {orderGrid};',resolveDir:fileURLToPath(new URL('../../client/src/components/commerce/',import.meta.url))},bundle:true,write:false,format:'cjs',platform:'node',external:['pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'}});
 const boot=new JSDOM(''),previous=globalThis.document;globalThis.document=boot.window.document;
 const module={exports:{}};try{new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);}finally{globalThis.document=previous;boot.window.close()}
 const line={id:'line',productId:'existing',description:'Synthetic',quantity:2,unitCost:12,invoiceUnit:'PACKAGE',stockUnitsPerInvoiceUnit:6,discount1:10,discount2:0,discount3:0,exciseTotal:0.4,vatRate:13,netAmount:21.6,grossAmount:24.86,currentSalePrice:3,markupPercent:0,proposedSalePrice:0};
 for(const [delta,expected] of [[{},(3*12/24.86-1)*100],[{proposedSalePrice:4},(4*12/24.86-1)*100],[{currentSalePrice:0},0],[{gift:true},0],[{stockUnitsPerInvoiceUnit:0},0]]){
  const value={...line,...delta},before=JSON.stringify(value),dom=new JSDOM(module.exports.orderGrid({order:{status:'NEW'},lines:[value],totals:{net:21.6,gross:24.86}}));
  const displayed=dom.window.document.querySelector('[title="Markup επί του μικτού κόστους ανά τεμάχιο αποθήκης"]').textContent;
  assert.equal(displayed,Number(expected).toLocaleString('el-GR',{useGrouping:false,maximumFractionDigits:2})+'%');assert.equal(JSON.stringify(value),before);dom.window.close();
 }
});
