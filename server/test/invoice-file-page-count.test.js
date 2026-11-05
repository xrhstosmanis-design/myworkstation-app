import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fastInvoiceHeaderRequest} from '../../client/src/lib/invoice-fast-header-request.js';
import {MAX_PAGE_COUNT_BYTES,countInvoicePdfPages,invoiceFileSource,invoiceFileKind,
  sameInvoiceFileSources,invoiceFileCountLabel,invoiceFileCountModel} from '../../client/src/lib/invoice-file-page-count.js';
const pdf='data:application/pdf;base64,'+Buffer.from('%PDF-1.7\nsynthetic').toString('base64');
const image='data:image/jpeg;base64,/9j/2Q==';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
const next=()=>new Promise(r=>setImmediate(r));
function harness(...values){
  const count=values.length?values[0]:2;
  let loads=0,destroys=0,request=null;
  const options={loadPdfJs:async()=>({getDocument(input){loads++;request=input;return{promise:Promise.resolve({numPages:count}),destroy(){destroys++}}}})};
  return{options,stats:()=>({loads,destroys,request})};
}

test('retained original has priority and external URLs are never substituted or fetched',()=>{
  const source={originalDataUrl:'https://example.invalid/original.pdf',dataUrl:pdf};
  assert.equal(invoiceFileSource(source),source.originalDataUrl);assert.equal(invoiceFileKind(invoiceFileSource(source)),'unknown');
  assert.equal(invoiceFileSource({originalDataUrl:'',dataUrl:pdf}),pdf);assert.equal(invoiceFileSource(null),'');
  assert.equal(invoiceFileSource({originalDataUrl:pdf,dataUrl:image}),pdf);
});
for(const value of ['',null,undefined,'https://example.invalid/x.pdf','javascript:alert(1)',image,'data:image/svg+xml;base64,PHN2Zz4=','data:application/pdf;base64,','data:application/pdf;base64,!!!=','data:application/pdf;base64,AAA','data:application/pdf;base64,A===']){
  test(`unsupported or malformed input does not import or create a PDF task: ${String(value).slice(0,45)}`,async()=>{
    let imports=0;assert.equal(await countInvoicePdfPages(value,{loadPdfJs:async()=>{imports++;throw Error('not reached')}}),null);assert.equal(imports,0);
  });
}
test('oversized local metadata input is unknown without parser allocation',async()=>{
  const input='data:application/pdf;base64,'+'A'.repeat(Math.ceil(MAX_PAGE_COUNT_BYTES/3)*4+4);let imports=0;
  assert.equal(await countInvoicePdfPages(input,{loadPdfJs:async()=>{imports++}}),null);assert.equal(imports,0);
});
for(const count of [1,2,5,6,123])test(`valid count ${count} is preserved, never capped to the number of files`,async()=>{
  const h=harness(count);assert.equal(await countInvoicePdfPages(pdf,h.options),count);const {loads,destroys,request}=h.stats();assert.equal(loads,1);assert.equal(destroys,1);assert.equal('url' in request,false);assert.ok(request.data instanceof Uint8Array);assert.equal(Buffer.from(request.data).toString(),'%PDF-1.7\nsynthetic');assert.equal(request.isEvalSupported,false);assert.equal(request.stopAtErrors,true);
});
for(const count of [0,-1,NaN,Infinity,1.5,'2',undefined,null,Number.MAX_SAFE_INTEGER+1])test(`invalid parser count ${String(count)} becomes unknown, not one page`,async()=>{
  const h=harness(count);assert.equal(await countInvoicePdfPages(pdf,h.options),null);assert.equal(h.stats().destroys,1);
});
test('worker-owned bytes are separate from the retained source and no page rendering occurs',async()=>{
  const original=pdf;let destroys=0;
  assert.equal(await countInvoicePdfPages(pdf,{loadPdfJs:async()=>({getDocument({data}){data.fill(0);return{promise:Promise.resolve({numPages:2,getPage(){throw Error('must not render')}}),destroy(){destroys++}}}})}),2);
  assert.equal(pdf,original);assert.equal(destroys,1);
});
test('loader failure is unknown and creates no task',async()=>{assert.equal(await countInvoicePdfPages(pdf,{loadPdfJs:async()=>{throw Error('offline module')}}),null)});
test('parser constructor failure is unknown',async()=>{assert.equal(await countInvoicePdfPages(pdf,{loadPdfJs:async()=>({getDocument(){throw Error('malformed document')}})}),null)});
test('password or malformed-document rejection cleans up and remains unknown',async()=>{
  for(const name of ['PasswordException','InvalidPDFException']){let destroys=0;assert.equal(await countInvoicePdfPages(pdf,{loadPdfJs:async()=>({getDocument(){return{promise:Promise.reject(Object.assign(Error('synthetic'),{name})),destroy(){destroys++}}}})}),null);assert.equal(destroys,1)}
});
for(const asyncFailure of [false,true])test(`cleanup ${asyncFailure?'rejection':'throw'} cannot replace a count or escape as an unhandled rejection`,async()=>{
  let destroys=0;assert.equal(await countInvoicePdfPages(pdf,{loadPdfJs:async()=>({getDocument(){return{promise:Promise.resolve({numPages:2}),destroy(){destroys++;if(asyncFailure)return Promise.reject(Error('cleanup'));throw Error('cleanup')}}}})}),2);await next();assert.equal(destroys,1);
});
test('already aborted request never imports the parser',async()=>{const controller=new AbortController();controller.abort();let loads=0;assert.equal(await countInvoicePdfPages(pdf,{signal:controller.signal,loadPdfJs:async()=>{loads++}}),null);assert.equal(loads,0)});
test('abort during import prevents a late task from starting',async()=>{
  const controller=new AbortController(),load=deferred();let tasks=0;
  const result=countInvoicePdfPages(pdf,{signal:controller.signal,loadPdfJs:()=>load.promise});controller.abort();assert.equal(await result,null);
  load.resolve({getDocument(){tasks++;throw Error('late task')}});await next();assert.equal(tasks,0);
});
test('timeout during import prevents a late task from starting',async()=>{
  const load=deferred();let tasks=0;assert.equal(await countInvoicePdfPages(pdf,{timeoutMs:5,loadPdfJs:()=>load.promise}),null);
  load.resolve({getDocument(){tasks++}});await next();assert.equal(tasks,0);
});
for(const cause of ['abort','timeout'])test(`${cause} destroys a pending worker once and ignores its late count`,async()=>{
  const doc=deferred(),controller=new AbortController();let destroys=0;
  const result=countInvoicePdfPages(pdf,{signal:controller.signal,timeoutMs:cause==='timeout'?5:1000,loadPdfJs:async()=>({getDocument(){return{promise:doc.promise,destroy(){destroys++}}}})});
  await next();if(cause==='abort')controller.abort();assert.equal(await result,null);assert.equal(destroys,1);doc.resolve({numPages:99});await next();controller.abort();assert.equal(destroys,1);
});
test('normal completion removes the abort listener and does not destroy twice',async()=>{
  const c=new AbortController(),h=harness();assert.equal(await countInvoicePdfPages(pdf,{...h.options,signal:c.signal}),2);c.abort();assert.equal(h.stats().destroys,1);
});
test('one PDF with two pages is one file, not one page',()=>{
  const m=invoiceFileCountModel([pdf],[2]);assert.equal(m.fileCount,1);assert.equal(m.pdfCount,1);assert.equal(m.countedPdfPages,2);assert.equal(m.files[0].pages,2);assert.equal(invoiceFileCountLabel(m.fileCount),'1 αρχείο');
});
test('images, partial counts, unknown and pending PDFs remain distinct',()=>{
  const m=invoiceFileCountModel([image,pdf,pdf,pdf,'https://invalid.test/a.pdf'],[null,2,null,undefined,1]);
  assert.equal(m.fileCount,5);assert.equal(m.imageCount,1);assert.equal(m.pdfCount,3);assert.equal(m.countedPdfPages,2);assert.equal(m.pendingPdfCount,1);assert.equal(m.unknownPdfCount,1);assert.equal(m.files[0].pages,null);assert.equal(m.files[4].pages,null);
});
test('identical bytes with replacement header objects remain a stable source; order changes do not',()=>{
  assert.equal(sameInvoiceFileSources([pdf,image],[pdf,image]),true);assert.equal(sameInvoiceFileSources([pdf,image],[image,pdf]),false);assert.equal(sameInvoiceFileSources([pdf],[]),false);assert.equal(invoiceFileCountModel([]).fileCount,0);assert.equal(invoiceFileCountLabel(2),'2 αρχεία');
});
test('FAST uses independent display metadata, keeps source-based transport and no count-based settlement gate',()=>{
  const source=readFileSync(new URL('../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx',import.meta.url),'utf8');
  assert.match(source,/<InvoiceFilePageSummary pages=\{pages\} scopeKey=\{store.id\}/);
  assert.doesNotMatch(source,/await\s+countInvoicePdfPages|numPages|countedPdfPages/);
  assert.doesNotMatch(source,/σελίδα έτοιμη|σελίδες έτοιμες|Επιλογή έως 5 σελίδων \/ PDF/);
  assert.match(source,/Επιλογή έως 5 αρχείων \(εικόνες \/ PDF\)/);
  assert.match(source,/fastInvoiceHeaderRequest\(\{storeId:store\.id,sourcePage\}\)/);
  const sourcePage={file:{name:'two.pdf',type:'application/pdf'},dataUrl:pdf,originalDataUrl:'data:application/pdf;base64,original'};
  const unchanged=structuredClone(sourcePage);
  assert.deepEqual(fastInvoiceHeaderRequest({storeId:'LAB',sourcePage}),{storeId:'LAB',filename:'two.pdf',mimeType:'application/pdf',dataUrl:pdf,pdfHeaderPriority:true});
  assert.deepEqual(sourcePage,unchanged);
  assert.match(source,/dataUrl:page.originalDataUrl\|\|page.dataUrl/);
  assert.match(source,/incoming.length>5-pages.length/);assert.match(source,/Η λίστα αρχείων άλλαξε/);
});
