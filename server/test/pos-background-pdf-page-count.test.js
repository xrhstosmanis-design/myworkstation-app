import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// Dependency injection keeps this actual reader test free of provider/DB calls.
const root=new URL('../../',import.meta.url).pathname;
const load=relative=>import(pathToFileURL(`${root}/${relative}`).href);
const {invoiceAssistantPageCount,invoiceAssistantPageLayout}=await import(pathToFileURL(`${root}/server/src/lib/invoice-assistant-page-count.js`).href);
const {assessInvoicePages,normalizedAssistantPages}=await load('server/src/routes/invoice-assistant-review.js');
const {rawRowSupportsStructuredLine}=await load('server/src/lib/invoice-line-review.js');
const {invoiceAssistantDiscounts}=await load('server/src/lib/invoice-assistant-discounts.js');
const {default:sharp}=await load('node_modules/sharp/lib/index.js');
const photoBytes=await sharp({create:{width:900,height:1600,channels:3,background:'white'}}).jpeg().toBuffer();
const imageViewSource=readFileSync(`${root}/server/src/lib/invoice-assistant-image-views.js`,'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const realImageViews=new Function('sharp',`${imageViewSource}\nreturn invoiceAssistantImageViews;`)(sharp);
const source=readFileSync(`${root}/server/src/lib/pos-invoice-assistant-reading.js`,'utf8')
 .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');

function pdf(pageCount){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Count ${pageCount} /Kids [${Array.from({length:pageCount},(_,i)=>`${i+3} 0 R`).join(' ')}] >>`,...Array.from({length:pageCount},()=> '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> >>')];
 let data='%PDF-1.4\n';const offsets=[0];
 objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(data));data+=`${index+1} 0 obj\n${object}\nendobj\n`});
 const xref=Buffer.byteLength(data);
 data+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return {filename:'synthetic.pdf',mimeType:'application/pdf',contentData:`data:application/pdf;base64,${Buffer.from(data).toString('base64')}`};
}
const photo=()=>({filename:'synthetic.jpg',mimeType:'image/jpeg',contentData:`data:image/jpeg;base64,${photoBytes.toString('base64')}`});
const modelReading=(pageCount)=>({
 expectedPageCount:pageCount,visiblePageNumbers:Array.from({length:pageCount},(_,i)=>i+1),singlePageComplete:false,
 printedQuantityTotal:String(pageCount),printedNetTotal:String(pageCount),printedVatTotal:'0',printedTotal:String(pageCount),
 lines:Array.from({length:pageCount},(_,i)=>({page:String(i+1),rawText:`00${i+1} SYNTHETIC PRODUCT 1 1.00 1.00 0%`,code:`00${i+1}`,description:'SYNTHETIC PRODUCT',quantity:'1',unit:'PIECE',unitsPerPackage:'1',unitCost:'1',unitDiscountAmount:'0',lineDiscountAmount:'0',discount1:'0',discount2:'0',discount3:'0',netAmount:'1',exciseTotal:'0',vatRate:'0',grossAmount:'1',confidence:'certain'})),
});

function fixture(attachments,{reading=modelReading(2),totalGross=Number(reading.printedTotal)}={}){
 const pageJobIds=attachments.map((_,i)=>`existing-job-${i+1}`),queries=[],requests=[],viewCalls=[],scopeCalls=[];
 const deps={process:{env:{OPENAI_API_KEY:'synthetic-not-a-real-key'}},AbortSignal,
  invoiceAssistantPageCount,invoiceAssistantPageLayout,assessInvoicePages,normalizedAssistantPages,rawRowSupportsStructuredLine,invoiceAssistantDiscounts,
  assertCustomerDemoOutboundAllowed:scope=>assert.deepEqual(scope,{companyId:'synthetic-company',storeId:'synthetic-store'}),
  withInvoiceWalletScope:async(scope,work)=>{scopeCalls.push(scope);return work()},
  throwIfWalletError:error=>{throw error},
  prisma:{$queryRaw:async(strings,...values)=>{
   queries.push({sql:strings.join('?'),values});
   assert.deepEqual(values,[pageJobIds[queries.length-1],'synthetic-company','synthetic-store']);
   assert.match(strings.join('?'),/^SELECT a\."filename"/);
   return [attachments[queries.length-1]];
  }},
  invoiceAssistantImageViews:async pages=>{viewCalls.push(pages);return realImageViews(pages)},
  invoiceAssistantProviderError:()=>{throw Error('unexpected provider failure mapper')},
  fetch:async(url,options)=>{
   assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.method,'POST');
   const body=JSON.parse(options.body);requests.push(body);
   return {ok:true,json:async()=>({output_text:JSON.stringify(reading)})};
  },
 };
 const read=new Function(...Object.keys(deps),`${source}\nreturn readPosInvoiceWithAssistant;`)(...Object.values(deps));
 return {pageJobIds,queries,requests,viewCalls,scopeCalls,read:()=>read({companyId:'synthetic-company',storeId:'synthetic-store',pageJobIds,totalGross,activity:{purpose:'SYNTHETIC_ONLY'}})};
}

test('single existing two-page PDF job accepts model evidence for two physical pages',async()=>{
 const f=fixture([pdf(2)]);const rows=await f.read();
 assert.equal(f.pageJobIds.length,1);assert.equal(f.queries.length,1);assert.equal(f.requests.length,1);assert.equal(f.viewCalls.length,1);
 assert.match(f.requests[0].input[0].content[0].text,/ΟΛΕΣ τις 2/);
 assert.equal(f.requests[0].input[0].content.filter(part=>part.type==='input_file').length,1);
 assert.deepEqual(rows.map(row=>[row.sourceFileIndex,row.sourcePage]),[[0,1],[0,2]]);assert.ok(rows.every(row=>row.sourceColumnsVerified));
 assert.deepEqual(f.scopeCalls,[{companyId:'synthetic-company',storeId:'synthetic-store',activity:{purpose:'SYNTHETIC_ONLY'}}]);
});
test('two-page PDF plus photo is three physical pages and retains two attachment job IDs',async()=>{
 const f=fixture([pdf(2),photo()],{reading:modelReading(3)});const rows=await f.read();
 assert.equal(f.pageJobIds.length,2);assert.equal(f.queries.length,2);assert.equal(f.requests.length,1);
 assert.match(f.requests[0].input[0].content[0].text,/ΟΛΕΣ τις 3/);
 assert.deepEqual(rows.map(row=>[row.sourceFileIndex,row.sourcePage]),[[0,1],[0,2],[1,1]]);
});
test('two photos retain existing two-page acceptance and attachment identities',async()=>{
 const f=fixture([photo(),photo()]);const rows=await f.read();
 assert.equal(f.pageJobIds.length,2);assert.equal(f.queries.length,2);assert.equal(f.requests.length,1);
 assert.deepEqual(rows.map(row=>[row.sourceFileIndex,row.sourcePage]),[[0,1],[1,1]]);
});
test('six-page PDF refuses before image transport or provider',async()=>{
 const f=fixture([pdf(6)],{reading:modelReading(6)});
 await assert.rejects(f.read(),/5 φυσικές/);assert.equal(f.requests.length,0);assert.equal(f.viewCalls.length,0);
});
test('malformed PDF refuses before image transport or provider',async()=>{
 const f=fixture([{mimeType:'application/pdf',filename:'malformed.pdf',contentData:'data:application/pdf;base64,bm90LXBkZg=='}]);
 await assert.rejects(f.read());assert.equal(f.requests.length,0);assert.equal(f.viewCalls.length,0);
});
test('model cannot declare one page for a bound two-page PDF',async()=>{
 const f=fixture([pdf(2)],{reading:modelReading(1)});
 await assert.rejects(f.read(),/όλες τις φυσικές σελίδες/);assert.equal(f.requests.length,1);
});
test('model cannot declare three pages for a bound two-page PDF',async()=>{
 const f=fixture([pdf(2)],{reading:modelReading(3)});
 await assert.rejects(f.read(),/όλες τις φυσικές σελίδες/);assert.equal(f.requests.length,1);
});


test('physical page layout preserves file boundaries and legacy count results',async()=>{
 const pages=[photo(),pdf(2),pdf(2)];
 const before=JSON.stringify(pages);
 assert.deepEqual(await invoiceAssistantPageLayout(pages),{pageCount:5,pageSources:[{sourceFileIndex:0,sourcePage:1},{sourceFileIndex:1,sourcePage:1},{sourceFileIndex:1,sourcePage:2},{sourceFileIndex:2,sourcePage:1},{sourceFileIndex:2,sourcePage:2}]});
 assert.equal(await invoiceAssistantPageCount(pages),5);assert.equal(JSON.stringify(pages),before);
 await assert.rejects(invoiceAssistantPageLayout([...pages,photo()]),/5 φυσικές/);
 await assert.rejects(invoiceAssistantPageLayout([]),/5 φυσικές/);
});

test('direct converter without source layout retains existing photo provenance',()=>{
 const convert=new Function(...Object.keys({assessInvoicePages,normalizedAssistantPages,rawRowSupportsStructuredLine,invoiceAssistantDiscounts}),`${source}\nreturn assistantRowsToProductLines;`)(assessInvoicePages,normalizedAssistantPages,rawRowSupportsStructuredLine,invoiceAssistantDiscounts);
 const rows=convert(modelReading(2),{pageCount:2,totalGross:2});
 assert.deepEqual(rows.map(row=>row.sourceFileIndex),[0,1]);assert.ok(rows.every(row=>row.sourcePage===undefined));
 for(const pageSources of [[],[{sourceFileIndex:0,sourcePage:1},{sourceFileIndex:0,sourcePage:1}],[{sourceFileIndex:0,sourcePage:1},{sourceFileIndex:2,sourcePage:1}]])assert.throws(()=>convert(modelReading(2),{pageCount:2,totalGross:2,pageSources}),/αντιστοίχιση/);
});

test('actual recovery matcher cannot collapse equal product codes across PDF pages and photo',async()=>{
 const rows=await fixture([pdf(2),photo()],{reading:modelReading(3)}).read();
 const sourceText=readFileSync(`${root}/server/src/routes/commerce-pos-ai-recheck.js`,'utf8');
 const start=sourceText.indexOf('function mergeRecoveredLines('),end=sourceText.indexOf('\nfunction restorePrintedRepeatedLine(',start);
 assert.ok(start>=0&&end>start);
 const {sourceOrder}=await load('server/src/lib/invoice-column-reading.js');
 const merge=new Function('normalizeProductLine','norm','descriptionsClose','sourceOrder',`${sourceText.slice(start,end)}\nreturn mergeRecoveredLines;`)(line=>({...line}),value=>String(value||'').toUpperCase(),(a,b)=>a===b,sourceOrder);
 const current=rows.map((row,index)=>({...row,code:'SAME',description:'SAME PRODUCT',sourceTable:0,sourceRow:1,netAmount:index+1,grossAmount:index+1}));
 const recovered=current.slice().reverse().map(row=>({...row,quantity:2,netAmount:row.netAmount*2,grossAmount:row.grossAmount*2}));
 const result=merge(current,recovered);
 assert.equal(result.length,3);assert.deepEqual(result.map(row=>[row.sourceFileIndex,row.sourcePage,row.netAmount]),[[0,1,2],[0,2,4],[1,1,6]]);
});


test('combined three-page PDFs reject before transport and provider',async()=>{
 const f=fixture([pdf(3),pdf(3)],{reading:modelReading(6)});
 await assert.rejects(f.read(),/5 φυσικές/);assert.equal(f.requests.length,0);assert.equal(f.viewCalls.length,0);
 await assert.rejects(invoiceAssistantPageCount([pdf(3),pdf(3)]),/5 φυσικές/);
});
