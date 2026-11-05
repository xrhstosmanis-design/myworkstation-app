/**
 * Actual FAST route + production footer parsers, wallet error guard, existing
 * table-return predicate and actual Responses wrapper. Network, Azure
 * normalization, database, wallet settlement and line arithmetic remain mocked.
 * No live provider/OCR, full database/HTTP/UI or LAB acceptance is claimed.
 * Complete repository: node --test server/test/pos-fast-header-pdf-real-helpers.test.js
 * Evidence package: OCR_EVIDENCE_ROOT=. OCR_SOURCE=fixtures/fast-header.after.js
 *                   node --test tests/pos-fast-header-pdf-real-helpers.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import crypto from 'node:crypto';
import {EventEmitter} from 'node:events';
import {pathToFileURL as timingFileUrl} from 'node:url';
const {createFastHeaderTiming}=await import(process.env.OCR_EVIDENCE_ROOT?timingFileUrl(resolve(process.env.OCR_EVIDENCE_ROOT,'production/pos-fast-header-timing.mjs')):new URL('../src/lib/pos-fast-header-timing.js',import.meta.url));
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const evidenceRoot=process.env.OCR_EVIDENCE_ROOT?resolve(process.env.OCR_EVIDENCE_ROOT):null;
const productionUrl=(relative,evidenceFile)=>evidenceRoot?pathToFileURL(resolve(evidenceRoot,'production',evidenceFile)):new URL(relative,import.meta.url);
const {recoverVatSummaryInvoiceTotal,recoverBalancedInvoicePayable}=await import(productionUrl('../src/lib/invoice-total-reading.js','invoice-total-reading.mjs'));
const source=readFileSync(process.env.OCR_SOURCE?resolve(process.env.OCR_SOURCE):new URL('../src/routes/commerce-pos-v244.js',import.meta.url),'utf8');
const extract=(text,a,b)=>{const i=text.indexOf(a),j=text.indexOf(b,i);assert.ok(i>=0&&j>i,`source boundaries ${a}`);return text.slice(i,j);};
const walletSource=readFileSync(productionUrl('../src/services/ai-wallet-invoice-metering.js','wallet-error.excerpt.mjs'),'utf8');
const walletFunction=evidenceRoot?walletSource:extract(walletSource,'export function throwIfWalletError','\nexport function invoiceWalletFeatures');
const throwIfWalletError=new Function(`${walletFunction.replace(/^export /,'')}\nreturn throwIfWalletError;`)();
const providerSource=evidenceRoot?readFileSync(resolve(evidenceRoot,'production/fast-provider.excerpt.js'),'utf8'):extract(source,'function outputText(','\nasync function matchSupplier(');
const schemaSource=evidenceRoot?readFileSync(resolve(evidenceRoot,'production/fast-schema.excerpt.js'),'utf8'):extract(source,'const fastHeaderSchema=','\nconst reconciledFastProductLines=');
const reconcileSource=evidenceRoot?readFileSync(resolve(evidenceRoot,'production/fast-reconciliation.excerpt.js'),'utf8'):extract(source,'const reconciledFastProductLines=','\n\nrouter.get(');
const constant=(name,fallback)=>{if(evidenceRoot)return fallback;const match=source.match(new RegExp(`const ${name}=([^;]+);`));assert.ok(match,name);return new Function(`return ${match[1]};`)();};
const timeoutMs=constant('FAST_OPENAI_HEADER_TOTAL_TIMEOUT_MS',70000);
const attempts=constant('FAST_OPENAI_HEADER_ATTEMPTS',2);

const start=source.indexOf('router.post("/ai-reader/fast-header"');
assert.ok(start>=0,'registered FAST route exists');
const end=source.indexOf('\nrouter.post("/ai-reader/fast-duplicate-check"',start);
const registration=source.slice(start,end<0?source.length:end);
const snapshot=value=>value instanceof Error?{name:value.name,message:value.message,code:value.code,status:value.status}:structuredClone(value);
const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const complete=()=>({supplier:{name:'SYNTHETIC SUPPLIER',taxId:'099999999'},documentNumber:'SYN-42',documentDate:'2026-11-04',totalGross:12.4,aiConfidence:98,rawText:'',productLines:[]});
const fallback=()=>({supplierName:'FULL DOCUMENT SUPPLIER',supplierTaxId:'088888888',documentNumber:'FULL-43',documentDate:'2026-11-04',totalGross:24.8,confidence:90,documentType:'INVOICE'});
const row=()=>({code:'SYNTHETIC-1',quantity:1,grossAmount:12.4,sourceColumnsVerified:true});
const unknownCounts=[['two pages',2],['three pages',3],['missing',undefined],['zero',0],['negative',-1],['string one','1'],['string two','2'],['null',null],['NaN',NaN],['Infinity',Infinity],['boolean',true]];


const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}};
function sharedHarness({cases,now,emit}={}){
 let handler;
 const traces=new WeakMap(),allEvents=[],calls=[],queries=[],responses=[];
 const keyOf=data=>Buffer.from(String(data).split(',')[1],'base64').toString();
 const deps={
  Buffer,crypto,round2,FAST_AZURE_HEADER_TIMEOUT_MS:20000,POS_STORED_LINES_TOLERANCE:.05,
  process:{env:{AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT:'https://synthetic.invalid',AZURE_DOCUMENT_INTELLIGENCE_KEY:'synthetic',OPENAI_API_KEY:'synthetic'}},
  console:{warn(){},error(){}},
  router:{post(_path,_guard,fn){assert.equal(handler,undefined);handler=fn;}},requireCompanyModule:()=>()=>{},
  createFastHeaderTiming:res=>createFastHeaderTiming(res,{now,emit:event=>{traces.get(res).push(event);allEvents.push(event);return emit?.(event)}}),
  cleanTaxId:value=>String(value||'').replace(/\D/g,''),norm:value=>String(value||'').toUpperCase(),normalizeIntakeDate:value=>value,
  finalizeV244ProductLines:lines=>structuredClone(lines),reconcileInvoiceLines:lines=>({grossTotal:round2(lines.reduce((sum,x)=>sum+Number(x.grossAmount||0),0))}),
  reusableVerifiedPrintedTable:()=>false,recoverVatSummaryInvoiceTotal,recoverBalancedInvoicePayable,throwIfWalletError,
  prisma:new Proxy({store:{findFirst:async()=>({id:'store-a'})},$queryRaw:async(strings,...values)=>{const sql=strings.join('?');assert.match(sql,/^\s*SELECT/);assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE)\b/);queries.push({sql,values});return [];}},{get(target,key){assert.ok(key in target,`unexpected DB operation ${String(key)}`);return target[key];}}),
  walletActivityFromRequest:(_req,scope)=>scope,
  withInvoiceWalletScope:async(scope,work)=>{assert.equal(scope.companyId,'company-a');assert.equal(scope.storeId,'store-a');return work()},
  callAzure:async({contentData})=>{const key=keyOf(contentData),c=cases[key];assert.ok(c);calls.push([key,'azure']);c.entered.resolve();await c.release.promise;return {...complete(),azurePageCount:2,rawText:'ΚΑΘΑΡΗ ΑΞΙΑ 10,00 ΦΠΑ 2,40 ΠΛΗΡΩΤΕΟ 12,40'}},
  normalizeAzure:value=>value,azureSupplierMatch:async()=>null,matchSupplier:async()=>null,
 };
 deps.reconciledFastProductLines=new Function('finalizeV244ProductLines','reconcileInvoiceLines','round2','POS_STORED_LINES_TOLERANCE',`${reconcileSource}\nreturn reconciledFastProductLines;`)(deps.finalizeV244ProductLines,deps.reconcileInvoiceLines,round2,.05);
 const transport=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body),key=keyOf(body.input[0].content[1].file_data);calls.push([key,'openai']);return {ok:true,json:async()=>({output_text:JSON.stringify({...fallback(),documentNumber:key,totalGross:cases[key].total})})};};
 deps.callFastOpenAiHeader=new Function('fetch','process','AbortSignal','console','throwIfWalletError','FAST_OPENAI_HEADER_TOTAL_TIMEOUT_MS','FAST_OPENAI_HEADER_ATTEMPTS',`${schemaSource}\n${providerSource}\nreturn callFastOpenAiHeader;`)(transport,deps.process,AbortSignal,deps.console,throwIfWalletError,timeoutMs,attempts);
 new Function(...Object.keys(deps),registration)(...Object.values(deps));
 const execute=async key=>{
  let result,error,status=200;
  const events=[],res=new EventEmitter();traces.set(res,events);responses.push(res);
  res.status=value=>{status=value;return res};
  res.json=value=>{assert.equal(result,undefined);result=value;res.emit('finish');return res};
  cases[key].res=res;
  const req={body:{storeId:'store-a',filename:`secret-${key}.pdf`,mimeType:'application/pdf',dataUrl:`data:application/pdf;base64,${Buffer.from(key).toString('base64')}`},user:{companyId:'company-a',tokenType:'STORE_OPERATOR',storeId:'store-a'}};
  await handler(req,res,value=>{assert.equal(error,undefined);error=value;res.emit('finish');});
  res.emit('close');res.emit('finish');
  assert.equal(events.filter(e=>e.stage==='request_total').length,1);
  assert.equal(new Set(events.map(e=>e.correlationId)).size,1);
  assert.doesNotMatch(JSON.stringify(events),/secret|company-a|store-a|SYN|FULL|totalGross|documentNumber|data:|base64|filename/);
  return {result,error,status,events,res};
 };
 return {execute,handler,calls,queries,allEvents};
}

test('V3 overlapping PDF reads through ONE handler isolate failed money and successful total, correlations and clocks',async()=>{
 let current=1000;
 const cases={'PRIVATE-A1':{total:0,entered:deferred(),release:deferred()},'PRIVATE-B2':{total:24.8,entered:deferred(),release:deferred()}};
 const h=sharedHarness({cases,now:()=>current}),same=h.handler;
 const first=h.execute('PRIVATE-A1');await cases['PRIVATE-A1'].entered.promise;
 current=1500;const second=h.execute('PRIVATE-B2');await cases['PRIVATE-B2'].entered.promise;
 assert.equal(h.handler,same);
 current=1700;cases['PRIVATE-A1'].release.resolve();const a=await first;
 current=1800;cases['PRIVATE-B2'].release.resolve();const b=await second;
 assert.equal(a.result,undefined);assert.equal(a.error?.code,'FAST_HEADER_PDF_TOTAL_UNVERIFIED');
 assert.ifError(b.error);assert.equal(b.result.totalGross,24.8);assert.equal(b.result.documentNumber,'PRIVATE-B2');
 assert.notEqual(a.events[0].correlationId,b.events[0].correlationId);
 assert.equal(a.events.find(e=>e.stage==='request_total').elapsedMs,700);
 assert.equal(b.events.find(e=>e.stage==='request_total').elapsedMs,300);
 assert.equal(a.events.find(e=>e.stage==='azure_header').elapsedMs,700);
 assert.equal(b.events.find(e=>e.stage==='azure_header').elapsedMs,300);
 assert.deepEqual(h.calls,[['PRIVATE-A1','azure'],['PRIVATE-B2','azure'],['PRIVATE-A1','openai'],['PRIVATE-B2','openai']]);
 assert.equal(h.queries.length,2);
 assert.doesNotMatch(JSON.stringify(h.allEvents),/PRIVATE-A1|PRIVATE-B2/);
});

test('V3 early response close during a blocked PDF read keeps one closed total and no silent subtotal',async()=>{
 let current=100;
 const cases={'PRIVATE-C3':{total:0,entered:deferred(),release:deferred()}};
 const h=sharedHarness({cases,now:()=>current});
 const pending=h.execute('PRIVATE-C3');await cases['PRIVATE-C3'].entered.promise;
 current=140;cases['PRIVATE-C3'].res.emit('close');
 current=170;cases['PRIVATE-C3'].release.resolve();const r=await pending;
 assert.equal(r.result,undefined);assert.equal(r.error?.code,'FAST_HEADER_PDF_TOTAL_UNVERIFIED');
 const totals=r.events.filter(e=>e.stage==='request_total');assert.equal(totals.length,1);assert.equal(totals[0].outcome,'closed');assert.equal(totals[0].elapsedMs,40);
 assert.deepEqual(h.calls,[['PRIVATE-C3','azure'],['PRIVATE-C3','openai']]);
 assert.equal(r.events.find(e=>e.stage==='azure_header').elapsedMs,70);
});
