// Actual client DOM with isolated API fixtures; no production invoice mutations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

test('manual draft transfer retains page warnings and requires fresh human confirmation',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/invoice-assistant-pos-client.js',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'}});
 const row={sequence:1,supplierCode:'FIXTURE',description:'Fixture product',quantity:2,unitCost:1,discount1:0,discount2:0,discount3:0,exciseTotal:0,vatRate:24,netAmount:2,grossAmount:2.48,invoiceUnit:'PIECE',stockUnitsPerInvoiceUnit:1,confidence:'certain'};
 async function scenario(overrides,check){
  const dom=new JSDOM('<main>POS</main>',{url:'https://isolated.invalid'}),keys=['window','document','MutationObserver','FormData','localStorage'];
  const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:dom.window[key]});
  const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  let preview={pagesComplete:false,pageWarning:'PAGE WARNING. Οι προτάσεις δεν εφαρμόζονται.',printedTotal:2.48,printedLines:[{...row}],corrections:[],...overrides},lines=[],confirmation=false,confirms=0,closed=false;
  const writes=[],calls=[],order={invoiceNumber:'FIXTURE',supplierName:'Fixture',status:'NEW',sourceType:'POS_OCR_DRAFT'};
  const api=async(path,options={})=>{
   calls.push({path,options});
   if(path.endsWith('/source'))return {document:{totalGross:2.48,supplierTaxId:'123456789'},pages:[]};
   if(path.endsWith('/preview'))return preview;
   if(path.endsWith('/detail'))return {order:{...order,status:closed?'CLOSED':'NEW'},lines:lines.map(x=>({...x})),totals:{net:lines.length*2,vat:lines.length*.48,gross:lines.length*2.48}};
   if(options.method){writes.push({path,...options});const line={...JSON.parse(options.body),id:`line-${writes.length}`,netAmount:2,grossAmount:2.48};lines.push(line);return {id:line.id}}
   throw new Error(`Unexpected fixture path ${path}`);
  };
  dom.window.confirm=()=>{confirms++;return confirmation};
  const tick=()=>new Promise(r=>setTimeout(r,10));
  try{
   await module.exports.openPosInvoiceAssistant('same-draft',order,null,api);await tick();
   const q=selector=>document.querySelector(selector);
   const select=()=>{q('[data-select-all]').checked=true;q('[data-select-all]').dispatchEvent(new dom.window.Event('change',{bubbles:true}))};
   const edit=(field,value)=>{q(`[data-field="${field}"]`).value=String(value);q(`[data-field="${field}"]`).dispatchEvent(new dom.window.Event('input',{bubbles:true}))};
   await check({q,select,edit,tick,writes,calls,confirm:()=>confirmation=true,confirms:()=>confirms,closeDraft:()=>closed=true,preview:value=>preview=value,dom});
  }finally{document.querySelector('[data-close]')?.click();await tick();dom.window.close();for(const[k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
 }
 await scenario({},async s=>{
  assert.equal(s.q('[data-apply]').hidden,false);assert.match(s.q('[role="alert"]').textContent,/PAGE WARNING/);assert.doesNotMatch(s.q('[role="alert"]').textContent,/Οι προτάσεις δεν εφαρμόζονται/);
  s.select();s.q('[data-apply]').click();await s.tick();assert.equal(s.writes.length,0);assert.equal(s.confirms(),1);
  s.q('[data-minimize]').click();s.q('[data-invoice-assistant-restore]').click();assert.equal(s.q('[data-apply]').hidden,false);
  s.confirm();s.q('[data-apply]').click();s.q('[data-apply]').click();await s.tick();assert.equal(s.writes.length,1);assert.match(s.writes[0].path,/same-draft\/lines$/);assert.equal(s.writes[0].method,'POST');assert.match(s.q('[role="alert"]').textContent,/PAGE WARNING/);
  s.select();s.q('[data-apply]').click();await s.tick();assert.equal(s.writes.length,1);
  s.preview({pagesComplete:false,pageWarning:'SECOND WARNING',printedTotal:2.48,printedLines:[{...row,matchingLineId:'line-1',description:'Corrected'}],corrections:[]});s.q('[data-ask]').click();await s.tick();s.select();s.q('[data-apply]').click();await s.tick();assert.equal(s.confirms(),3);assert.equal(s.writes.length,2);assert.equal(s.writes[1].method,'PATCH');
 });
 await scenario({pagesComplete:true},async s=>{s.select();s.q('[data-apply]').click();await s.tick();assert.equal(s.writes.length,1);assert.equal(s.confirms(),0)});
 await scenario({printedLines:[{...row,unitCost:2,netAmount:4,grossAmount:4.96}]},async s=>{assert.equal(s.q('[data-apply]').hidden,false);s.confirm();s.select();s.q('[data-apply]').click();await s.tick();assert.equal(s.writes.length,0);assert.equal(s.confirms(),0);s.edit('discount1',50);s.q('[data-apply]').click();await s.tick();assert.equal(s.writes.length,1);assert.equal(JSON.parse(s.writes[0].body).discount1,50)});
 await scenario({printedLines:[{...row,invoiceUnit:''}]},async s=>{s.confirm();s.select();s.q('[data-apply]').click();await s.tick();assert.equal(s.writes.length,0);assert.equal(s.confirms(),0);s.edit('invoiceUnit','PIECE');s.q('[data-apply]').click();await s.tick();assert.equal(s.writes.length,1)});
 await scenario({printedQuantityTotal:3},async s=>{s.confirm();s.select();assert.equal(s.q('[data-apply]').disabled,true);s.q('[data-confirm-quantity]').checked=true;s.q('[data-confirm-quantity]').dispatchEvent(new s.dom.window.Event('change',{bubbles:true}));assert.equal(s.q('[data-apply]').disabled,false);s.q('[data-apply]').click();await s.tick();assert.equal(s.writes.length,1);assert.equal(s.confirms(),1)});
 await scenario({},async s=>{s.confirm();s.select();s.closeDraft();s.q('[data-apply]').click();await s.tick();assert.equal(s.writes.length,0);assert.match(s.q('[data-status]').textContent,/δεν είναι πλέον/)});
 await scenario({printedLines:[]},async s=>{assert.equal(s.q('[data-apply]').hidden,true);assert.equal(s.writes.length,0)});
});
