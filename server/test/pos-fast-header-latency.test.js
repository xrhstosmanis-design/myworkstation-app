import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import {EventEmitter} from 'node:events';

const root=new URL('../../',import.meta.url).pathname;
const load=relative=>import(pathToFileURL(path.join(root,relative)).href);
const {finalizeV244ProductLines}=await load('client/src/lib/invoice-v244.js');
const {reconcileInvoiceLines,reusableVerifiedPrintedTable}=await load('server/src/invoice-line-reconciliation.js');
const {recoverVatSummaryInvoiceTotal,recoverBalancedInvoicePayable}=await load('server/src/lib/invoice-total-reading.js');
const {createFastHeaderTiming}=await load('server/src/lib/pos-fast-header-timing.js');
const source=readFileSync(path.join(root,'server/src/routes/commerce-pos-v244.js'),'utf8');
const a=source.indexOf('router.post("/ai-reader/fast-header"'),b=source.indexOf('\nrouter.post("/ai-reader/fast-duplicate-check"',a);
assert.ok(a>=0&&b>a);
const callback=source.slice(a,b).slice(source.slice(a,b).indexOf('async(req,res,next)=>')).trim().replace(/\);$/,'');
const declarations=['round2','cleanTaxId','norm','normalizeIntakeDate'].map(name=>{
 const line=source.split('\n').find(line=>line.startsWith(`const ${name}=`));assert.ok(line,name);return line;
}).join('\n');
const reconcileStart=source.indexOf('const reconciledFastProductLines='),reconcileEnd=source.indexOf('\n\nrouter.get(',reconcileStart);
assert.ok(reconcileStart>=0&&reconcileEnd>reconcileStart);
const walletSource=readFileSync(path.join(root,'server/src/services/ai-wallet-invoice-metering.js'),'utf8');
const walletStart=walletSource.indexOf('export function throwIfWalletError'),walletEnd=walletSource.indexOf('\nexport function invoiceWalletFeatures',walletStart);
const throwIfWalletError=new Function(`${walletSource.slice(walletStart,walletEnd).replace(/^export /,'')}\nreturn throwIfWalletError;`)();
const row={code:'SYNTHETIC-1',description:'SYNTHETIC ITEM',quantity:1,unit:'TEM',unitCost:10,initialAmount:10,discount1:0,discount1Amount:0,netAmount:10,exciseTotal:0,vatRate:24,grossAmount:12.4,sourceColumnsVerified:true,quantitySource:'AI_COMPLETE_PRINTED_TABLE_VERIFIED'};
const complete=()=>({supplier:{name:'SYNTHETIC SUPPLIER',taxId:'099999999'},documentNumber:'SYN-42',documentDate:'2026-11-02',totalGross:12.4,aiConfidence:98,rawText:'',productLines:[]});
const fallback=()=>({supplierName:'FALLBACK SUPPLIER',supplierTaxId:'088888888',documentNumber:'FB-43',documentDate:'2026-11-01',totalGross:24.8,confidence:90,documentType:'INVOICE'});
function createHarness({azure=complete(),openai=fallback(),durable=[],operatorStore='store-a',storeExists=true,matched=null,openaiConfigured=true,transport=false,transportResponses=[],transportNow,transportTimeout,fastModel,generalModel,mimeType='image/jpeg',dataUrl=`data:${mimeType};base64,c3ludGhldGlj`,timingOptions={},autoFinish=true,onResponse}={}){
 const calls=[],queries=[],requests=[],timings=[],responses=[];let walletScopes=0;
 const responseTimings=new WeakMap();
 const deps={Buffer,crypto,process:{env:{AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT:'https://synthetic.invalid',AZURE_DOCUMENT_INTELLIGENCE_KEY:'synthetic',OPENAI_API_KEY:openaiConfigured?'synthetic':'',...(fastModel===undefined?{}:{OPENAI_INVOICE_FAST_MODEL:fastModel}),...(generalModel===undefined?{}:{OPENAI_INVOICE_MODEL:generalModel})}},console:{warn(){},error(){}},FAST_AZURE_HEADER_TIMEOUT_MS:35000,POS_STORED_LINES_TOLERANCE:0.05,finalizeV244ProductLines,reconcileInvoiceLines,reusableVerifiedPrintedTable,recoverVatSummaryInvoiceTotal,recoverBalancedInvoicePayable,throwIfWalletError,
  createFastHeaderTiming:res=>createFastHeaderTiming(res,{...timingOptions,emit:event=>{timings.push(event);responseTimings.get(res).push(event);return timingOptions.emit?.(event)}}),
  prisma:{store:{findFirst:async q=>{assert.deepEqual(q,{where:{id:'store-a',companyId:'company-a'},select:{id:true}});return storeExists?{id:'store-a'}:null}},$queryRaw:async(strings,...values)=>{queries.push({sql:strings.join('?'),values});if(durable instanceof Error)throw durable;return durable}},
  walletActivityFromRequest:(req,scope)=>{assert.equal(req.user.companyId,'company-a');assert.deepEqual(scope,{storeId:'store-a',purpose:'PAYMENT_HEADER_READ'});return {purpose:scope.purpose}},
  withInvoiceWalletScope:async(scope,work)=>{walletScopes++;assert.deepEqual(scope,{companyId:'company-a',storeId:'store-a',activity:{purpose:'PAYMENT_HEADER_READ'}});return work()},
  callAzure:async options=>{calls.push('azure');assert.equal(options.mimeType,mimeType);if(typeof azure==='function')return azure(options);assert.equal(options.contentData,dataUrl);if(azure instanceof Error)throw azure;return azure},
  // Provider transport normalization is outside this return-predicate change.
  normalizeAzure:value=>value,
  azureSupplierMatch:async(companyId,supplier)=>{assert.equal(companyId,'company-a');if(typeof azure!=='function')assert.deepEqual(supplier,azure.supplier);return matched},
  callFastOpenAiHeader:async()=>{calls.push('openai');if(openai instanceof Error)throw openai;return openai},
  matchSupplier:async companyId=>{assert.equal(companyId,'company-a');return null},
 };
 if(transport){
  const start=source.indexOf('async function callFastOpenAiHeader('),end=source.indexOf('\nasync function matchSupplier(',start);
  const schemaStart=source.indexOf('const fastHeaderSchema='),schemaEnd=source.indexOf('\nconst reconciledFastProductLines=',schemaStart);
  const outputStart=source.indexOf('function outputText('),outputEnd=source.indexOf('\nasync function callFastOpenAiHeader(',outputStart);
  assert.ok(start>=0&&end>start&&schemaStart>=0&&schemaEnd>schemaStart&&outputStart>=0);
  const fetch=async(url,options)=>{calls.push('openai');requests.push({url,method:options.method,body:JSON.parse(options.body)});const response=transportResponses[requests.length-1];if(response instanceof Error)throw response;return response||{ok:true,json:async()=>({output_text:JSON.stringify(openai)})}};
  const providerLimits=['FAST_OPENAI_HEADER_TOTAL_TIMEOUT_MS','FAST_OPENAI_HEADER_ATTEMPTS'].map(name=>{const line=source.split('\n').find(value=>value.startsWith(`const ${name}=`));assert.ok(line,name);return line}).join('\n');
  deps.callFastOpenAiHeader=new Function('fetch','process','AbortSignal','console','throwIfWalletError','Date',`${providerLimits}\n${source.slice(schemaStart,schemaEnd)}\n${source.slice(outputStart,outputEnd)}\n${source.slice(start,end)}\nreturn callFastOpenAiHeader;`)(fetch,deps.process,transportTimeout?{timeout:transportTimeout}:AbortSignal,deps.console,throwIfWalletError,transportNow?{now:transportNow}:Date);
 }
 const fn=new Function(...Object.keys(deps),`${declarations}\n${source.slice(reconcileStart,reconcileEnd)}\nreturn ${callback}`)(...Object.values(deps));
 return {handler:fn,calls,queries,requests,timings,responses,async execute({body={}}={}){
  let result,status=200,error;
  const events=[];
  const req={body:{storeId:'store-a',filename:mimeType==='application/pdf'?'synthetic.pdf':'synthetic.jpg',mimeType,dataUrl,...body},user:{companyId:'company-a',tokenType:'STORE_OPERATOR',storeId:operatorStore}};
  const res=new EventEmitter();res.statusCode=200;
  res.status=value=>{status=value;res.statusCode=value;return res};
  res.finish=()=>{res.writableFinished=true;res.emit('finish')};
  res.json=value=>{assert.equal(result,undefined,'one response only');result=value;if(autoFinish)res.finish();return res};
  responseTimings.set(res,events);responses.push(res);onResponse?.(res);
  await fn(req,res,value=>{error=value});
  // Express's error middleware finishes the response after next(error). No
  // business response is fabricated here; the original error remains visible.
  if(error&&autoFinish){res.statusCode=error.status||500;res.finish()}
  return {calls,queries,requests,result,status,error,walletScopes,timings:events,res};
 }};
}
const run=async options=>createHarness(options).execute();

test('actual FAST PDF fallback sends original PDF data URL through actual Responses request body',async()=>{
 const bytes=readFileSync(path.join(root,'CHECKPOINTS/EVIDENCE/invoice-physical-pages-20261102/fixtures/two-physical-pages.pdf'));
 const dataUrl=`data:application/pdf;base64,${bytes.toString('base64')}`;
 const r=await run({transport:true,mimeType:'application/pdf',dataUrl,azure:{...complete(),azurePageCount:2,productLines:[row]}});
 assert.ifError(r.error);assert.deepEqual(r.calls,['azure','openai']);assert.equal(r.requests.length,1);assert.equal(r.requests[0].url,'https://api.openai.com/v1/responses');assert.equal(r.requests[0].method,'POST');
 const file=r.requests[0].body.input[0].content[1];assert.equal(file.type,'input_file');assert.equal(file.filename,'synthetic.pdf');assert.equal(file.file_data,dataUrl);assert.deepEqual(Buffer.from(file.file_data.split(',')[1],'base64'),bytes);assert.equal(r.result.totalGross,24.8);
 assert.equal(r.requests[0].body.text.format.name,'invoice_fast_header');assert.equal(r.requests[0].body.text.format.strict,true);
});
test('actual FAST GPT-5 exact models receive low reasoning without changing PDF transport or schema',async()=>{
  const bytes=readFileSync(path.join(root,'CHECKPOINTS/EVIDENCE/invoice-physical-pages-20261102/fixtures/two-physical-pages.pdf'));
  const dataUrl=`data:application/pdf;base64,${bytes.toString('base64')}`;
  for(const model of ['gpt-5','gpt-5-2025-08-07']){
    const r=await run({transport:true,fastModel:model,generalModel:'gpt-5-mini',mimeType:'application/pdf',dataUrl,azure:{...complete(),azurePageCount:2,productLines:[row]}});
    assert.ifError(r.error);assert.equal(r.requests.length,1);
    const body=r.requests[0].body;
    assert.deepEqual(Object.keys(body).sort(),['input','model','reasoning','text']);
    assert.equal(body.model,model);assert.deepEqual(body.reasoning,{effort:'low'});
    assert.deepEqual(body.input,[{role:'user',content:[{type:'input_text',text:body.input[0].content[0].text},{type:'input_file',filename:'synthetic.pdf',file_data:dataUrl}]}]);
    assert.equal(typeof body.input[0].content[0].text,'string');assert.ok(body.input[0].content[0].text.length>0);
    assert.equal(body.text.format.name,'invoice_fast_header');assert.equal(body.text.format.strict,true);
    assert.deepEqual(body.text.format.schema.required,['confidence','documentType','supplierName','supplierTaxId','documentNumber','documentDate','totalGross']);
  }
});
test('actual FAST model resolution changes reasoning only for exact GPT-5 targets',async()=>{
  const cases=[
    {fastModel:'gpt-5',generalModel:'gpt-5-mini',expected:'gpt-5',low:true},
    {fastModel:'',generalModel:'gpt-5-2025-08-07',expected:'gpt-5-2025-08-07',low:true},
    {fastModel:'gpt-5-mini',generalModel:'gpt-5',expected:'gpt-5-mini',low:false},
    {fastModel:'',generalModel:'',expected:'gpt-5-mini',low:false},
    {fastModel:'gpt-5-2025-08-07-preview',generalModel:'gpt-5',expected:'gpt-5-2025-08-07-preview',low:false},
    {fastModel:'gpt-5.1',generalModel:'gpt-5',expected:'gpt-5.1',low:false},
    {fastModel:'GPT-5',generalModel:'gpt-5',expected:'GPT-5',low:false}
  ];
  for(const option of cases){
    const r=await run({transport:true,azure:{...complete(),documentNumber:''},...option});
    assert.ifError(r.error);assert.equal(r.requests.length,1);
    const body=r.requests[0].body;assert.equal(body.model,option.expected);
    assert.deepEqual(Object.keys(body).sort(),option.low?['input','model','reasoning','text']:['input','model','text']);
    if(option.low)assert.deepEqual(body.reasoning,{effort:'low'});
  }
});
test('actual GPT-5 retry preserves identical low-reasoning body and original shared deadline',async()=>{
  let current=1000;const budgets=[];
  const first={ok:false,status:503,text:async()=>{current=51000;return 'synthetic provider failure'}};
  const r=await run({transport:true,fastModel:'gpt-5',azure:{...complete(),documentNumber:''},transportResponses:[first],transportNow:()=>current,transportTimeout:milliseconds=>{budgets.push(milliseconds);return undefined}});
  assert.ifError(r.error);assert.deepEqual(budgets,[70000,20000]);assert.equal(r.requests.length,2);
  assert.deepEqual(r.requests[0].body,r.requests[1].body);assert.deepEqual(r.requests[0].body.reasoning,{effort:'low'});
  assert.deepEqual(stageOutcomes(r.timings.filter(event=>event.stage==='openai_attempt')),[['openai_attempt','error',1],['openai_attempt','ok',2]]);
});

test('actual FAST image fallback keeps image data URL through actual Responses request body',async()=>{
 const dataUrl='data:image/jpeg;base64,c3ludGhldGlj';const r=await run({transport:true,dataUrl,azure:{...complete(),documentNumber:''}});assert.ifError(r.error);assert.deepEqual(r.calls,['azure','openai']);assert.deepEqual(r.requests[0].body.input[0].content[1],{type:'input_image',image_url:dataUrl,detail:'high'});assert.equal(r.result.totalGross,24.8);
});

test('actual FAST route returns complete Azure header without a second provider or fabricated rows',async()=>{
 const r=await run();assert.ifError(r.error);assert.deepEqual(r.calls,['azure']);assert.equal(r.result.provider,'AZURE_DOCUMENT_INTELLIGENCE');assert.equal(r.result.documentNumber,'SYN-42');assert.equal(r.result.totalGross,12.4);assert.deepEqual(r.result.productLines,[]);assert.equal(r.walletScopes,1);
 assert.equal(r.queries.length,1);assert.match(r.queries[0].sql,/a\."companyId"=\? AND a\."storeId"=\? AND a\."checksum"=\?/);assert.deepEqual(r.queries[0].values,['company-a','store-a',crypto.createHash('sha256').update(Buffer.from('synthetic')).digest('hex')]);
});
test('complete Azure header discards unreconciled table without a second header provider',async()=>{
 const azure={...complete(),productLines:[{...row,netAmount:20,unitCost:20,initialAmount:20,grossAmount:24.8}]};const r=await run({azure});assert.ifError(r.error);assert.deepEqual(r.calls,['azure']);assert.deepEqual(r.result.productLines,[]);assert.equal(r.result.totalGross,12.4);
});
test('complete Azure header keeps a reconciled printed table',async()=>{
 const r=await run({azure:{...complete(),productLines:[row]}});assert.ifError(r.error);assert.deepEqual(r.calls,['azure']);assert.equal(r.result.productLines.length,1);assert.equal(r.result.productLines[0].code,row.code);assert.equal(r.result.productLines[0].quantity,1);assert.equal(r.result.productLines[0].netAmount,10);
});
test('new supplier complete header needs recognized identity rather than a pre-existing supplier ID',async()=>{
 const r=await run({matched:null});assert.ifError(r.error);assert.deepEqual(r.calls,['azure']);assert.equal(r.result.supplierId,'');assert.equal(r.result.supplierName,'SYNTHETIC SUPPLIER');assert.equal(r.result.supplierTaxId,'099999999');
});
for(const [name,patch]of [['supplier',{supplier:{name:'',taxId:''}}],['number',{documentNumber:''}],['number without digits',{documentNumber:'INVOICE'}],['date',{documentDate:''}],['malformed date',{documentDate:'02/11/2026'}],['total',{totalGross:0}],['finite total',{totalGross:Infinity}]]){
 test(`partial Azure header missing ${name} continues to configured fallback`,async()=>{
  const r=await run({azure:{...complete(),...patch}});assert.ifError(r.error);assert.deepEqual(r.calls,['azure','openai']);assert.equal(r.result.documentNumber,'FB-43');assert.equal(r.result.totalGross,24.8);
 });
}
test('empty Azure header still reaches fallback',async()=>{
 const r=await run({azure:{supplier:{},documentNumber:'',documentDate:'',totalGross:0,productLines:[]}});assert.ifError(r.error);assert.deepEqual(r.calls,['azure','openai']);assert.equal(r.result.documentNumber,'FB-43');
});
test('legacy useful header plus reconciled table retains its existing early return',async()=>{
 const r=await run({azure:{...complete(),documentNumber:'',productLines:[row]}});assert.ifError(r.error);assert.deepEqual(r.calls,['azure']);assert.equal(r.result.documentNumber,'');assert.equal(r.result.productLines.length,1);
});
test('ordinary fallback provider failure preserves useful Azure partial header',async()=>{
 const r=await run({azure:{...complete(),documentNumber:''},openai:new Error('synthetic provider unavailable')});assert.ifError(r.error);assert.deepEqual(r.calls,['azure','openai']);assert.equal(r.result.documentNumber,'');assert.equal(r.result.supplierName,'SYNTHETIC SUPPLIER');assert.equal(r.result.provider,'AZURE_DOCUMENT_INTELLIGENCE');
});
test('Azure wallet failure stops before fallback and cannot become a partial success',async()=>{
 const failure=Object.assign(new Error('synthetic funding required'),{code:'AI_WALLET_LOW_BALANCE',status:402});const r=await run({azure:failure});assert.equal(r.error,failure);assert.deepEqual(r.calls,['azure']);assert.equal(r.result,undefined);
});
test('fallback wallet failure cannot return a useful Azure partial success',async()=>{
 const failure=Object.assign(new Error('synthetic review required'),{code:'AI_WALLET_USAGE_REVIEW',status:503});const r=await run({azure:{...complete(),documentNumber:''},openai:failure});assert.equal(r.error,failure);assert.equal(r.error.status,409);assert.deepEqual(r.calls,['azure','openai']);assert.equal(r.result,undefined);
});
test('verified exact-file durable reading bypasses both external providers',async()=>{
 const durable=[{supplierId:'supplier-a',supplierName:'STORED SUPPLIER',supplierTaxId:'099999999',resultJson:{posHandoff:{documentNumber:'STORED-42',documentDate:'2026-11-02',totalGross:12.4},productLines:[row]}}];
 const r=await run({durable});assert.ifError(r.error);assert.deepEqual(r.calls,[]);assert.equal(r.result.provider,'DURABLE_POS_JOB');assert.equal(r.result.documentNumber,'STORED-42');assert.equal(r.result.productLines.length,1);
});
test('non-reconciled durable reading cannot bypass the normal provider path',async()=>{
 const durable=[{supplierId:'supplier-a',resultJson:{posHandoff:{documentNumber:'STORED-42',documentDate:'2026-11-02',totalGross:99},productLines:[row]}}];
 const r=await run({durable});assert.ifError(r.error);assert.deepEqual(r.calls,['azure']);assert.equal(r.result.documentNumber,'SYN-42');assert.equal(r.result.provider,'AZURE_DOCUMENT_INTELLIGENCE');
});
test('foreign store operator is refused before wallet, cache or provider access',async()=>{
 const r=await run({operatorStore:'store-other'});assert.ifError(r.error);assert.equal(r.status,403);assert.equal(r.walletScopes,0);assert.deepEqual(r.queries,[]);assert.deepEqual(r.calls,[]);
});
test('store outside selected company is refused before wallet, cache or provider access',async()=>{
 const r=await run({storeExists:false});assert.ifError(r.error);assert.equal(r.status,404);assert.equal(r.walletScopes,0);assert.deepEqual(r.queries,[]);assert.deepEqual(r.calls,[]);
});

test('complete credit header returns the balanced printed invoice total rather than an adjacent receipt',async()=>{
 const azure={...complete(),documentType:'CREDIT_NOTE',totalGross:70.36,rawText:'ΑΠΟΔΕΙΞΗ ΕΙΣΠΡΑΞΗΣ 70,36\nΑΝΑΛΥΣΗ ΥΠΟΛΟΓΙΣΜΟΥ ΦΠΑ\nΣΥΝΟΛΑ 66,90 8,70 75,60\nΝΕΟ ΥΠΟΛΟΙΠΟ 300,00'};
 const r=await run({azure});assert.ifError(r.error);assert.deepEqual(r.calls,['azure']);assert.equal(r.result.totalGross,75.6);assert.equal(r.result.documentType,'CREDIT_NOTE');assert.deepEqual(r.result.productLines,[]);
});

test('ordinary Azure failure retains configured header fallback',async()=>{
 const r=await run({azure:new Error('synthetic transport failure')});assert.ifError(r.error);assert.deepEqual(r.calls,['azure','openai']);assert.equal(r.result.documentNumber,'FB-43');
});


test('single-page PDF with known numeric page count keeps complete-header bypass',async()=>{
 const r=await run({mimeType:'application/pdf',azure:{...complete(),azurePageCount:1}});assert.ifError(r.error);assert.deepEqual(r.calls,['azure']);assert.equal(r.result.documentNumber,'SYN-42');assert.equal(r.result.totalGross,12.4);assert.deepEqual(r.result.productLines,[]);
});
for(const [name,count]of [['two pages',2],['missing',undefined],['zero',0],['negative',-1],['numeric string','1'],['non-numeric','invalid'],['non-finite',Infinity],['null',null]]){
 test(`PDF header-only ${name} page count continues to fallback`,async()=>{
  const r=await run({mimeType:'application/pdf',azure:{...complete(),azurePageCount:count}});assert.ifError(r.error);assert.deepEqual(r.calls,['azure','openai']);assert.equal(r.result.documentNumber,'FB-43');assert.equal(r.result.totalGross,24.8);assert.deepEqual(r.result.productLines,[]);
 });
}
for(const count of [2,undefined,0,-1,'1','invalid',Infinity,null]){
 for(const documentNumber of ['SYN-42','']){
  test(`PDF reconciled subtotal with page count ${String(count)} and ${documentNumber?'complete':'partial'} header continues to fallback`,async()=>{
   const r=await run({mimeType:'application/pdf',azure:{...complete(),azurePageCount:count,documentNumber,productLines:[row]}});assert.ifError(r.error);assert.deepEqual(r.calls,['azure','openai']);assert.equal(r.result.documentNumber,'FB-43');assert.equal(r.result.totalGross,24.8);assert.deepEqual(r.result.productLines,[]);
  });
 }
}
for(const documentNumber of ['SYN-42','']){
 test(`single-page PDF keeps reconciled-table shortcut with ${documentNumber?'complete':'partial'} header`,async()=>{
  const r=await run({mimeType:'application/pdf',azure:{...complete(),azurePageCount:1,documentNumber,productLines:[row]}});assert.ifError(r.error);assert.deepEqual(r.calls,['azure']);assert.equal(r.result.documentNumber,documentNumber);assert.equal(r.result.productLines.length,1);assert.equal(r.result.totalGross,12.4);
 });
}
test('multi-page PDF fallback failure retains the existing useful Azure fallback limit',async()=>{
 const r=await run({mimeType:'application/pdf',azure:{...complete(),azurePageCount:2,productLines:[row]},openai:new Error('synthetic unavailable')});assert.ifError(r.error);assert.deepEqual(r.calls,['azure','openai']);assert.equal(r.result.provider,'AZURE_DOCUMENT_INTELLIGENCE');assert.equal(r.result.totalGross,12.4);
});
test('multi-page PDF without configured fallback retains the existing useful Azure fallback limit',async()=>{
 const r=await run({mimeType:'application/pdf',azure:{...complete(),azurePageCount:2,productLines:[row]},openaiConfigured:false});assert.ifError(r.error);assert.deepEqual(r.calls,['azure']);assert.equal(r.result.provider,'AZURE_DOCUMENT_INTELLIGENCE');assert.equal(r.result.totalGross,12.4);
});
test('multi-page PDF fallback wallet refusal cannot return a useful reconciled subtotal',async()=>{
 const failure=Object.assign(new Error('synthetic funding required'),{code:'AI_WALLET_LOW_BALANCE',status:402});
 const r=await run({mimeType:'application/pdf',azure:{...complete(),azurePageCount:2,productLines:[row]},openai:failure});assert.equal(r.error,failure);assert.deepEqual(r.calls,['azure','openai']);assert.equal(r.result,undefined);
});
test('image header-only bypass remains unchanged even when page count is not one',async()=>{
 const r=await run({azure:{...complete(),azurePageCount:2}});assert.ifError(r.error);assert.deepEqual(r.calls,['azure']);assert.equal(r.result.documentNumber,'SYN-42');assert.deepEqual(r.result.productLines,[]);
});


test('actual two-page PDF text cannot promote a page subtotal through header-only bypass',async()=>{
 const bytes=readFileSync(path.join(root,'CHECKPOINTS/EVIDENCE/invoice-physical-pages-20261102/fixtures/two-physical-pages.pdf'));
 const {getDocument}=await load('node_modules/pdfjs-dist/legacy/build/pdf.mjs');
 const task=getDocument({data:new Uint8Array(bytes),disableWorker:true,useSystemFonts:true});
 let rawText='',pageCount;
 try{
  const pdf=await task.promise;pageCount=pdf.numPages;assert.equal(pageCount,2);
  for(let index=1;index<=pageCount;index++){
   const page=await pdf.getPage(index),content=await page.getTextContent();
   rawText+=content.items.map(item=>item.str||'').join(' ')+'\n';
  }
 }finally{await task.destroy();}
 assert.match(rawText,/LAB-A/);assert.match(rawText,/LAB-B/);assert.match(rawText,/24\.80/);
 assert.equal(recoverVatSummaryInvoiceTotal(rawText),0);assert.equal(recoverBalancedInvoicePayable(rawText),0);
 const azure={...complete(),azurePageCount:pageCount,rawText,productLines:[{...row,code:'LAB-A'},{...row,code:'LAB-B'}]};
 const r=await run({mimeType:'application/pdf',dataUrl:`data:application/pdf;base64,${bytes.toString('base64')}`,azure});
 assert.ifError(r.error);assert.deepEqual(r.calls,['azure','openai']);assert.equal(r.queries.length,1);assert.equal(r.result.totalGross,24.8);assert.equal(r.result.documentNumber,'FB-43');assert.deepEqual(r.result.productLines.map(line=>line.code),['LAB-A','LAB-B']);
});

const timingStages=new Set(['request_total','exact_file_lookup','azure_header','azure_supplier_match','openai_header','openai_attempt','openai_supplier_match']);
function assertSanitizedTimings(events){
 assert.ok(events.length,'actual handler must emit diagnostics');
 for(const event of events){
  const expected=['correlationId','elapsedMs','outcome','stage'];
  if(event.stage==='openai_attempt')expected.push('attempt');
  assert.deepEqual(Object.keys(event).sort(),expected.sort(),'only the fixed diagnostic schema is logged');
  assert.match(event.correlationId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,'correlation is a new random UUID, never an invoice/request ID');
  assert.ok(timingStages.has(event.stage));
  assert.ok((event.stage==='request_total'?['finished','closed']:['ok','error']).includes(event.outcome));
  assert.equal(typeof event.elapsedMs,'number');assert.ok(Number.isFinite(event.elapsedMs)&&event.elapsedMs>=0);
  if(event.stage==='openai_attempt')assert.ok([1,2].includes(event.attempt));
 }
 assert.equal(new Set(events.map(event=>event.correlationId)).size,1,'one correlation per request');
 assert.doesNotMatch(JSON.stringify(events),/SYNTHETIC|synthetic|company-a|store-a|supplier-a|SYN-42|FB-43|099999999|088888888|secret|data:|base64|filename|taxId|totalGross|documentNumber|Authorization/i);
}
const stageOutcomes=events=>events.map(({stage,outcome,attempt})=>[stage,outcome,...(attempt===undefined?[]:[attempt])]);
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}};

test('actual FAST Azure response emits sanitized stage spans and one total through finish then close',async()=>{
 const r=await run();assert.ifError(r.error);
 assertSanitizedTimings(r.timings);
 assert.deepEqual(stageOutcomes(r.timings),[['exact_file_lookup','ok'],['azure_header','ok'],['azure_supplier_match','ok'],['request_total','finished']]);
 assert.deepEqual(r.calls,['azure']);assert.equal(r.result.provider,'AZURE_DOCUMENT_INTELLIGENCE');assert.equal(r.result.documentNumber,'SYN-42');assert.equal(r.result.totalGross,12.4);
 const total=r.timings.at(-1).elapsedMs;
 assert.ok(r.timings.slice(0,-1).every(event=>event.elapsedMs<=total));
 r.res.emit('close');r.res.emit('finish');
 assert.equal(r.timings.filter(event=>event.stage==='request_total').length,1);
});

test('actual durable-header reuse logs only lookup and response completion with no provider call',async()=>{
 const durable=[{supplierId:'supplier-a',supplierName:'STORED SUPPLIER',supplierTaxId:'099999999',resultJson:{posHandoff:{documentNumber:'STORED-42',documentDate:'2026-11-02',totalGross:12.4},productLines:[row]}}];
 const r=await run({durable});assert.ifError(r.error);assertSanitizedTimings(r.timings);
 assert.deepEqual(stageOutcomes(r.timings),[['exact_file_lookup','ok'],['request_total','finished']]);
 assert.deepEqual(r.calls,[]);assert.equal(r.result.provider,'DURABLE_POS_JOB');assert.equal(r.result.productLines.length,1);
});

test('actual PDF fallback correlates both providers and matching without changing the Responses payload',async()=>{
 const r=await run({transport:true,mimeType:'application/pdf',azure:{...complete(),azurePageCount:2,productLines:[row]}});
 assert.ifError(r.error);assertSanitizedTimings(r.timings);
 assert.deepEqual(stageOutcomes(r.timings),[['exact_file_lookup','ok'],['azure_header','ok'],['azure_supplier_match','ok'],['openai_attempt','ok',1],['openai_header','ok'],['openai_supplier_match','ok'],['request_total','finished']]);
 assert.deepEqual(r.calls,['azure','openai']);assert.equal(r.result.totalGross,24.8);assert.equal(r.result.documentNumber,'FB-43');assert.equal(r.requests.length,1);
 assert.deepEqual(Object.keys(r.requests[0].body).sort(),['input','model','text']);
 assert.equal(r.requests[0].body.model,'gpt-5-mini');
 assert.equal(r.requests[0].body.input[0].content[1].file_data,'data:application/pdf;base64,c3ludGhldGlj');
 assert.equal(r.requests[0].body.text.format.strict,true);
});

test('actual fallback retry keeps the shared 70-second deadline and exactly two bounded attempt events',async()=>{
 let current=1000;const budgets=[];
 const first={ok:false,status:503,text:async()=>{current=51000;return 'secret-provider-body'}};
 const r=await run({transport:true,azure:{...complete(),documentNumber:''},transportResponses:[first],transportNow:()=>current,transportTimeout:milliseconds=>{budgets.push(milliseconds);return undefined}});
 assert.ifError(r.error);assertSanitizedTimings(r.timings);
 assert.deepEqual(budgets,[70000,20000],'second attempt receives only the remaining original deadline');
 assert.deepEqual(r.calls,['azure','openai','openai']);assert.equal(r.requests.length,2);assert.deepEqual(r.requests[0].body,r.requests[1].body);
 assert.deepEqual(stageOutcomes(r.timings.filter(event=>event.stage==='openai_attempt')),[['openai_attempt','error',1],['openai_attempt','ok',2]]);
 assert.equal(r.timings.filter(event=>event.stage==='openai_header').length,1);
 assert.equal(r.result.documentNumber,'FB-43');assert.equal(r.result.totalGross,24.8);
});

test('actual fallback emits no phantom attempt after the shared budget is exhausted',async()=>{
 let current=1000;const budgets=[];
 const first={ok:false,status:503,text:async()=>{current=70500;return 'secret-provider-body'}};
 const r=await run({transport:true,azure:{...complete(),documentNumber:''},transportResponses:[first],transportNow:()=>current,transportTimeout:milliseconds=>{budgets.push(milliseconds);return undefined}});
 assert.ifError(r.error);assertSanitizedTimings(r.timings);
 assert.deepEqual(budgets,[70000]);assert.deepEqual(r.calls,['azure','openai']);assert.equal(r.requests.length,1);
 assert.deepEqual(stageOutcomes(r.timings.filter(event=>event.stage==='openai_attempt')),[['openai_attempt','error',1]]);
 assert.deepEqual(stageOutcomes(r.timings.filter(event=>event.stage==='openai_header')),[['openai_header','error']]);
 assert.equal(r.result.provider,'AZURE_DOCUMENT_INTELLIGENCE');assert.equal(r.result.totalGross,12.4,'existing useful-Azure fallback is preserved');
});

test('actual two-attempt failure preserves its original wrapped error and last cause',async()=>{
 const first=new Error('secret first provider failure'),last=new Error('secret last provider failure');
 const r=await run({transport:true,azure:new Error('secret Azure failure'),transportResponses:[first,last]});
 assert.equal(r.error.status,502);assert.equal(r.error.cause,last);assert.equal(r.result,undefined);assertSanitizedTimings(r.timings);
 assert.deepEqual(r.calls,['azure','openai','openai']);assert.equal(r.requests.length,2);
 assert.deepEqual(stageOutcomes(r.timings),[['exact_file_lookup','ok'],['azure_header','error'],['openai_attempt','error',1],['openai_attempt','error',2],['openai_header','error'],['request_total','finished']]);
});

test('actual Azure wallet refusal preserves the same error and stops before supplier or fallback work',async()=>{
 const failure=Object.assign(new Error('secret funding refusal'),{code:'AI_WALLET_LOW_BALANCE',status:402});
 const r=await run({azure:failure});assert.equal(r.error,failure);assert.equal(r.result,undefined);assertSanitizedTimings(r.timings);
 assert.deepEqual(r.calls,['azure']);assert.equal(r.walletScopes,1);
 assert.deepEqual(stageOutcomes(r.timings),[['exact_file_lookup','ok'],['azure_header','error'],['request_total','finished']]);
});

test('actual OpenAI wallet refusal preserves the same normalized error without retry or useful-Azure success',async()=>{
 const failure=Object.assign(new Error('secret wallet review'),{code:'AI_WALLET_USAGE_REVIEW',status:503});
 const r=await run({transport:true,azure:{...complete(),documentNumber:''},transportResponses:[failure]});
 assert.equal(r.error,failure);assert.equal(r.error.status,409);assert.equal(r.result,undefined);assertSanitizedTimings(r.timings);
 assert.deepEqual(r.calls,['azure','openai']);assert.equal(r.requests.length,1);
 assert.deepEqual(stageOutcomes(r.timings.filter(event=>event.stage.startsWith('openai'))),[['openai_attempt','error',1],['openai_header','error']]);
});

test('actual exact-file lookup failure preserves its original error and makes no provider call',async()=>{
 const failure=new Error('secret database lookup failure');const r=await run({durable:failure});
 assert.equal(r.error,failure);assert.equal(r.result,undefined);assert.deepEqual(r.calls,[]);assert.equal(r.queries.length,1);assertSanitizedTimings(r.timings);
 assert.deepEqual(stageOutcomes(r.timings),[['exact_file_lookup','error'],['request_total','finished']]);
});

test('actual access refusal logs only response completion and still performs no wallet, lookup or provider work',async()=>{
 const r=await run({operatorStore:'store-other'});assert.ifError(r.error);assert.equal(r.status,403);assertSanitizedTimings(r.timings);
 assert.deepEqual(stageOutcomes(r.timings),[['request_total','finished']]);assert.equal(r.walletScopes,0);assert.deepEqual(r.calls,[]);assert.deepEqual(r.queries,[]);
});

test('diagnostic sink failure cannot replace actual successful fallback fields or add provider attempts',async()=>{
 const options={transport:true,mimeType:'application/pdf',azure:{...complete(),azurePageCount:2,productLines:[row]}};
 const reference=await run(options);let emitted=0;
 const r=await run({...options,timingOptions:{emit(){emitted++;throw new Error('secret logger unavailable')}}});
 assert.ifError(r.error);assert.ok(emitted>0);assert.deepEqual(r.result,reference.result);assert.deepEqual(r.calls,reference.calls);assert.deepEqual(r.requests,reference.requests);assert.equal(r.walletScopes,reference.walletScopes);assertSanitizedTimings(r.timings);
});

test('diagnostic sink failure cannot replace an actual wallet error or resume provider work',async()=>{
 const failure=Object.assign(new Error('secret funding refusal'),{code:'AI_WALLET_LOW_BALANCE',status:402});
 const r=await run({azure:failure,timingOptions:{emit(){throw new Error('secret logger unavailable')}}});
 assert.equal(r.error,failure);assert.equal(r.result,undefined);assert.deepEqual(r.calls,['azure']);assertSanitizedTimings(r.timings);
});

test('actual response close during Azure work records one interrupted total and does not cancel or duplicate the existing provider operation',async()=>{
 const started=deferred(),release=deferred();let res,current=100;
 const harness=createHarness({azure:async()=>{started.resolve();await release.promise;return complete()},timingOptions:{now:()=>current},onResponse:value=>{res=value}});
 const pending=harness.execute();await started.promise;
 current=140;res.emit('close');
 assert.deepEqual(stageOutcomes(harness.timings.filter(event=>event.stage==='request_total')),[['request_total','closed']]);
 assert.equal(harness.timings.find(event=>event.stage==='request_total').elapsedMs,40);
 current=170;release.resolve();const r=await pending;
 assert.ifError(r.error);assertSanitizedTimings(r.timings);assert.deepEqual(r.calls,['azure']);assert.equal(r.result.documentNumber,'SYN-42');
 assert.equal(r.timings.filter(event=>event.stage==='request_total').length,1);res.emit('finish');res.emit('close');assert.equal(r.timings.filter(event=>event.stage==='request_total').length,1);
});

test('two concurrent calls to the same actual FAST handler retain independent random correlations and elapsed times',async()=>{
 const firstEntered=deferred(),secondEntered=deferred(),releaseFirst=deferred(),releaseSecond=deferred();let current=1000;
 const firstData='data:image/jpeg;base64,Zmlyc3Q=',secondData='data:image/jpeg;base64,c2Vjb25k';
 const harness=createHarness({timingOptions:{now:()=>current},azure:async({contentData})=>{
  if(contentData===firstData){firstEntered.resolve();await releaseFirst.promise;return {...complete(),documentNumber:'FIRST-1'}}
  assert.equal(contentData,secondData);secondEntered.resolve();await releaseSecond.promise;return {...complete(),documentNumber:'SECOND-2'};
 }});
 // Both calls execute the one compiled function, with overlapping provider
 // awaits. A mutable module/global current-request timer would mix these spans.
 const sharedHandler=harness.handler;
 const first=harness.execute({body:{dataUrl:firstData,filename:'secret-first.jpg',correlationId:'secret-client-id'}});await firstEntered.promise;
 current=1500;const second=harness.execute({body:{dataUrl:secondData,filename:'secret-second.jpg',correlationId:'secret-client-id'}});await secondEntered.promise;
 assert.equal(harness.handler,sharedHandler);
 current=1700;releaseFirst.resolve();const a=await first;
 current=1800;releaseSecond.resolve();const b=await second;
 assert.ifError(a.error);assert.ifError(b.error);assert.equal(a.result.documentNumber,'FIRST-1');assert.equal(b.result.documentNumber,'SECOND-2');
 assertSanitizedTimings(a.timings);assertSanitizedTimings(b.timings);assert.notEqual(a.timings[0].correlationId,b.timings[0].correlationId);
 assert.equal(a.timings.find(event=>event.stage==='request_total').elapsedMs,700);assert.equal(b.timings.find(event=>event.stage==='request_total').elapsedMs,300);
 assert.equal(a.timings.find(event=>event.stage==='azure_header').elapsedMs,700);assert.equal(b.timings.find(event=>event.stage==='azure_header').elapsedMs,300);
 assert.deepEqual(harness.calls,['azure','azure']);assert.equal(harness.queries.length,2);assert.equal(harness.responses.length,2);
 assert.equal(harness.timings.filter(event=>event.stage==='request_total').length,2);
});
