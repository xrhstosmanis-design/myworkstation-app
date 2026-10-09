// Production assistant with delayed API fixtures. No provider/production mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

test('minimize retains pending reading, edited rows, history and selections; reopen does not reread',async()=>{
 const dom=new JSDOM('<main>POS</main><div data-pos-invoice-modal="1" id="invoice">Invoice editor</div>',{url:'https://isolated.invalid'});
 const keys=['window','document','MutationObserver','FormData','localStorage'];
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:dom.window[key]});
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/invoice-assistant-pos-client.js',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'}});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const {openPosInvoiceAssistant}=module.exports,calls=[],events=[];
 let finishSource,finishPreview,completed=0;
 const sourcePromise=new Promise(r=>finishSource=r),previewPromise=new Promise(r=>finishPreview=r);
 const line={id:'row',description:'Fixture product',productId:'p',quantity:2,unitCost:1,vatRate:24};
 const order={invoiceNumber:'MIN-ONE',supplierName:'Fixture'};
 const api=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/source'))return sourcePromise;if(path.endsWith('/preview'))return previewPromise;return {order,lines:[line],totals:{net:2,vat:.48,gross:2.48}}};
 document.addEventListener('mws:invoice-assistant-visibility',e=>events.push(e.detail.minimized));
 const tick=()=>new Promise(r=>setTimeout(r,5));
 try{
  const opening=openPosInvoiceAssistant('one',order,()=>completed++,api);
  const overlay=document.querySelector('[data-minimize]').closest('[data-pos-invoice-modal]');
  document.querySelector('[data-minimize]').click();await tick();
  assert.equal(overlay.style.display,'none');assert.equal(document.getElementById('invoice').style.display,'none');
  assert.equal(document.querySelector('[data-invoice-assistant-restore]').hidden,false);
  const message=overlay.querySelector('[data-message]');message.value='CHECK-ONE';
  finishSource({document:{totalGross:2.48,supplierTaxId:'123456789'},pages:[]});await opening;
  // Restoring via the existing entry preserves the same window, even during source/preview.
  await openPosInvoiceAssistant('one',order,()=>completed++,api);
  assert.equal(overlay.style.display,'block');assert.equal(message.value,'CHECK-ONE');
  overlay.querySelector('[data-ask]').click();await tick();
  overlay.querySelector('[data-minimize]').click();await tick();
  assert.match(document.querySelector('[data-invoice-assistant-restore]').textContent,/συγκρίνει/);
  finishPreview({pagesComplete:true,printedTotal:2.48,assistantMessage:'RETAINED ANSWER',printedLines:[{description:'Fixture product',supplierCode:'CODE',matchingLineId:'row',quantity:2,unitCost:1,discount1:0,discount2:0,discount3:0,exciseTotal:0,vatRate:24,invoiceUnit:'PIECE',stockUnitsPerInvoiceUnit:1,confidence:'certain'}],corrections:[]});await tick();
  assert.equal(overlay.style.display,'none');assert.match(document.querySelector('[data-invoice-assistant-restore]').textContent,/ολοκληρώθηκε/);
  const restore=document.querySelector('[data-invoice-assistant-restore]');restore.click();await tick();
  assert.equal(overlay.querySelector('[data-message]'),message);assert.equal(message.value,'CHECK-ONE');
  assert.match(overlay.querySelector('[data-history]').textContent,/CHECK-ONE/);assert.equal(overlay.querySelector('[data-answer]').textContent,'RETAINED ANSWER');
  const field=overlay.querySelector('[data-field="quantity"]'),selection=overlay.querySelector('[data-edit-select]');
  field.value='3';field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));selection.checked=true;
  overlay.querySelector('[data-minimize]').click();restore.click();await tick();
  assert.equal(overlay.querySelector('[data-field="quantity"]'),field);assert.equal(field.value,'3');assert.equal(selection.checked,true);
  assert.equal(calls.filter(c=>c.path.endsWith('/source')).length,1);assert.equal(calls.filter(c=>c.path.endsWith('/preview')).length,1);
  assert.equal(calls.some(c=>['PUT','PATCH','DELETE'].includes(c.options.method)),false);assert.equal(completed,0);
  overlay.querySelector('[data-close]').click();await tick();assert.equal(overlay.isConnected,false);assert.equal(document.querySelector('[data-invoice-assistant-restore]'),null);assert.equal(document.getElementById('invoice').style.display,'');
  assert.deepEqual(events,[true,false,true,false,true,false,false]);
  // Permission/session teardown removes the minimized dock, not just the fullscreen window.
  await openPosInvoiceAssistant('two',order,null,api);document.querySelector('[data-minimize]').click();
  document.querySelector('[data-minimize]').closest('[data-pos-invoice-modal]').remove();await tick();
  assert.equal(document.querySelector('[data-invoice-assistant-restore]'),null);
 }finally{document.querySelectorAll("[data-pos-invoice-modal]").forEach(node=>node.remove());await tick();dom.window.close();for(const[k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}}
});
