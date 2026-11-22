import {reviewFastSupplierVat} from "../src/lib/invoice-fast-vat-role.js";
/**
 * Execute the actual registered FAST handler, with isolated I/O and arithmetic
 * test doubles. These tests prove return-policy/control-flow only, NOT OCR,
 * footer parsing, taxation arithmetic, billing settlement, HTTP/UI, or full CI.
 *
 * From a complete repo after applying the source patch:
 *   node --test server/test/pos-fast-header-pdf-total-safety.test.js
 * From the evidence package:
 *   OCR_SOURCE=fixtures/fast-header.after.js node --test tests/*.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import crypto from 'node:crypto';
import {EventEmitter} from 'node:events';
import {pathToFileURL as timingFileUrl} from 'node:url';
const {createFastHeaderTiming}=await import(process.env.OCR_EVIDENCE_ROOT?timingFileUrl(resolve(process.env.OCR_EVIDENCE_ROOT,'production/pos-fast-header-timing.mjs')):new URL('../src/lib/pos-fast-header-timing.js',import.meta.url));
import {resolve} from 'node:path';

const source=readFileSync(process.env.OCR_SOURCE?resolve(process.env.OCR_SOURCE):new URL('../src/routes/commerce-pos-v244.js',import.meta.url),'utf8');
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

async function run({azure={...complete(),azurePageCount:2},openai=fallback(),openaiConfigured=true,azureConfigured=true,mimeType='application/pdf',dataUrl=`data:${mimeType};base64,c3ludGhldGlj`,durable=[],operatorStore='store-a',storeExists=true,footerVat=0,footerPayable=0,timingOptions={}}={}){
  let handler,result,error,status=200,walletScopes=0;
  const timings=[];
  const calls=[],requests=[],queries=[],originalAzure=snapshot(azure),originalDurable=structuredClone(durable);
  const sum=lines=>round2(lines.reduce((n,line)=>n+Number(line.grossAmount||0),0));
  const deps={reviewFastSupplierVat,
    Buffer,crypto,round2,
    createFastHeaderTiming:res=>createFastHeaderTiming(res,{...timingOptions,emit:event=>{timings.push(event);return timingOptions.emit?.(event)}}),
    process:{env:{AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT:azureConfigured?'https://synthetic.invalid':'',AZURE_DOCUMENT_INTELLIGENCE_KEY:azureConfigured?'synthetic':'',OPENAI_API_KEY:openaiConfigured?'synthetic':''}},
    console:{warn(){},error(){}},FAST_AZURE_HEADER_TIMEOUT_MS:20000,POS_STORED_LINES_TOLERANCE:0.05,
    router:{post(path,_guard,fn){assert.equal(path,'/ai-reader/fast-header');assert.equal(handler,undefined);handler=fn;}},
    requireCompanyModule:key=>{assert.equal(key,'AI_READER');return ()=>{};},
    cleanTaxId:value=>String(value||'').replace(/\D/g,''),
    norm:value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleUpperCase('el-GR').replace(/[^A-ZΑ-Ω0-9]/g,''),
    normalizeIntakeDate:value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?value:null,
    finalizeV244ProductLines:lines=>structuredClone(lines),
    reconcileInvoiceLines:lines=>({grossTotal:sum(lines)}),
    reusableVerifiedPrintedTable:(lines,total)=>lines.length>0&&lines.every(x=>x.sourceColumnsVerified===true)&&Math.abs(sum(lines)-total)<=0.05,
    reconciledFastProductLines:(lines,total)=>Array.isArray(lines)&&lines.length&&total>0&&Math.abs(sum(lines)-total)<=0.05?structuredClone(lines):[],
    recoverVatSummaryInvoiceTotal:()=>footerVat,
    recoverBalancedInvoicePayable:()=>footerPayable,
    throwIfWalletError:err=>{if(String(err?.code||'').startsWith('AI_WALLET_'))throw err;},
    prisma:new Proxy({
      store:{findFirst:async q=>{assert.deepEqual(q,{where:{id:'store-a',companyId:'company-a'},select:{id:true}});return storeExists?{id:'store-a'}:null;}},
      $queryRaw:async(strings,...values)=>{const sql=strings.join('?');assert.match(sql,/^\s*SELECT/);assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE)\b/);queries.push({sql,values});return durable;},
    },{get(target,key){if(!(key in target))throw new Error(`Unexpected database operation: ${String(key)}`);return target[key];}}),
    walletActivityFromRequest:(req,scope)=>{assert.equal(req.user.companyId,'company-a');assert.deepEqual(scope,{storeId:'store-a',purpose:'PAYMENT_HEADER_READ'});return scope;},
    withInvoiceWalletScope:async(scope,work)=>{assert.equal(scope.companyId,'company-a');assert.equal(scope.storeId,'store-a');walletScopes++;return work();},
    callAzure:async options=>{calls.push('azure');assert.equal(options.contentData,dataUrl);assert.equal(options.mimeType,mimeType);assert.equal(options.timeoutMs,20000);if(azure instanceof Error)throw azure;return azure;},
    normalizeAzure:value=>value,
    azureSupplierMatch:async companyId=>{assert.equal(companyId,'company-a');return null;},
    callFastOpenAiHeader:async request=>{calls.push('openai');requests.push(request);if(openai instanceof Error)throw openai;return openai;},
    matchSupplier:async companyId=>{assert.equal(companyId,'company-a');return null;},
  };
  new Function(...Object.keys(deps),registration)(...Object.values(deps));
  assert.equal(typeof handler,'function');
  const req={body:{storeId:'store-a',filename:'synthetic.pdf',mimeType,dataUrl},user:{companyId:'company-a',tokenType:'STORE_OPERATOR',storeId:operatorStore}};
  const res=new EventEmitter();
  res.status=value=>{status=value;return res};
  res.json=value=>{assert.equal(result,undefined,'one response only');result=value;res.emit('finish');return res};
  await handler(req,res,value=>{assert.equal(error,undefined);error=value;res.emit('finish');});
  res.emit('close');res.emit('finish');
  if(!timingOptions.disableAssert){
    assert.equal(timings.filter(e=>e.stage==='request_total').length,1,'exactly one terminal timing event');
    assert.equal(new Set(timings.map(e=>e.correlationId)).size,1,'request-local correlation');
    for(const e of timings){
      assert.deepEqual(Object.keys(e).sort(),(e.stage==='openai_attempt'?['attempt','correlationId','elapsedMs','outcome','stage']:['correlationId','elapsedMs','outcome','stage']));
      assert.ok(Number.isFinite(e.elapsedMs)&&e.elapsedMs>=0);
      assert.match(e.correlationId,/^[0-9a-f-]{36}$/i);
    }
    assert.doesNotMatch(JSON.stringify(timings),/SYNTHETIC|synthetic|company-a|store-a|supplier-a|SYN-42|FULL-43|099999999|088888888|secret|data:|base64|filename|taxId|totalGross|documentNumber|Authorization/i);
  }
  assert.deepEqual(snapshot(azure),originalAzure,'original provider object unchanged');
  assert.deepEqual(durable,originalDurable,'durable source unchanged');
  assert.ok(calls.filter(x=>x==='azure').length<=1,'no added Azure call');
  assert.ok(calls.filter(x=>x==='openai').length<=1,'no added fallback call at route boundary');
  for(const query of queries)assert.deepEqual(query.values,['company-a','store-a',crypto.createHash('sha256').update(Buffer.from('synthetic')).digest('hex')]);
  return {result,error,status,calls,requests,queries,walletScopes,timings};
}

for(const [name,count]of unknownCounts){
  test(`PDF ${name}: absent fallback key cannot expose the Azure subtotal`,async()=>{
    const r=await run({azure:{...complete(),azurePageCount:count,productLines:[row()]},openaiConfigured:false});
    assert.ok(r.error,'unsafe PDF must not silently succeed');assert.equal(r.error.status,502);assert.equal(r.result,undefined);assert.deepEqual(r.calls,['azure']);
  });
  test(`PDF ${name}: fallback failure cannot expose the Azure subtotal`,async()=>{
    const failure=new Error('synthetic fallback failure');
    const r=await run({azure:{...complete(),azurePageCount:count,productLines:[row()]},openai:failure});
    assert.equal(r.error,failure);assert.equal(r.result,undefined);assert.deepEqual(r.calls,['azure','openai']);
  });
  test(`PDF ${name}: missing fallback amount cannot inherit Azure money`,async()=>{
    const r=await run({azure:{...complete(),azurePageCount:count},openai:{...fallback(),totalGross:0}});
    assert.equal(r.result,undefined);assert.equal(r.error?.code,'FAST_HEADER_PDF_TOTAL_UNVERIFIED');assert.equal(r.error?.status,502);
  });
  for(const footer of ['vat','payable'])test(`PDF ${name}: balanced partial ${footer} footer cannot overwrite the full-reader amount`,async()=>{
    const r=await run({azure:{...complete(),azurePageCount:count,productLines:[row()]},footerVat:footer==='vat'?12.4:0,footerPayable:footer==='payable'?12.4:0});
    assert.ifError(r.error);assert.equal(r.result.totalGross,24.8);assert.deepEqual(r.result.productLines,[]);assert.deepEqual(r.calls,['azure','openai']);
  });
}

for(const [name,value]of [['missing',undefined],['negative',-1],['NaN',NaN],['Infinity',Infinity]])test(`PDF fallback ${name} amount is not successful`,async()=>{
  const r=await run({openai:{...fallback(),totalGross:value}});assert.equal(r.result,undefined);assert.equal(r.error?.code,'FAST_HEADER_PDF_TOTAL_UNVERIFIED');
});
for(const [label,options]of [['image',{mimeType:'image/jpeg'}],['one-page PDF',{azure:{...complete(),azurePageCount:1}}]]){
  test(`${label}: complete Azure shortcut preserved`,async()=>{const r=await run(options);assert.ifError(r.error);assert.equal(r.result.totalGross,12.4);assert.deepEqual(r.calls,['azure']);});
  for(const cause of ['no key','failure'])test(`${label}: legacy useful-header fallback preserved on ${cause}`,async()=>{
    const r=await run({...options,azure:{...(options.azure||complete()),documentNumber:''},...(cause==='no key'?{openaiConfigured:false}:{openai:new Error('synthetic failure')})});
    assert.ifError(r.error);assert.equal(r.result.totalGross,12.4);assert.equal(r.result.provider,'AZURE_DOCUMENT_INTELLIGENCE');assert.deepEqual(r.calls,cause==='no key'?['azure']:['azure','openai']);
  });
  test(`${label}: existing invoice-footer correction remains intact`,async()=>{
    const r=await run({...options,azure:{...(options.azure||complete()),documentNumber:''},footerVat:75.6});assert.ifError(r.error);assert.equal(r.result.totalGross,75.6);
  });
}
test('PDF success retains full data URL, filename, identity and existing provider-call count',async()=>{
  const r=await run({openai:{...fallback(),supplierName:'',supplierTaxId:'',documentNumber:'',documentDate:''}});assert.ifError(r.error);assert.equal(r.result.totalGross,24.8);assert.equal(r.result.documentNumber,'SYN-42');assert.equal(r.result.documentDate,'2026-11-04');assert.equal(r.result.supplierTaxId,'099999999');assert.deepEqual(r.requests[0].filePart,{type:'input_file',filename:'synthetic.pdf',file_data:'data:application/pdf;base64,c3ludGhldGlj'});assert.deepEqual(r.calls,['azure','openai']);
});
test('PDF credit identity is retained without a credit transaction',async()=>{const r=await run({azure:{...complete(),azurePageCount:2,documentType:'CREDIT_NOTE'},openai:{...fallback(),documentType:'INVOICE'}});assert.ifError(r.error);assert.equal(r.result.documentType,'CREDIT_NOTE');assert.equal(r.result.totalGross,24.8);});
for(const provider of ['azure','openai'])test(`${provider} wallet failure remains fail-stop`,async()=>{
  const failure=Object.assign(new Error('synthetic wallet hold'),{code:'AI_WALLET_USAGE_REVIEW',status:409});const r=await run({[provider]:failure});assert.equal(r.error,failure);assert.equal(r.result,undefined);assert.deepEqual(r.calls,provider==='azure'?['azure']:['azure','openai']);
});
test('verified exact-file durable result still bypasses providers',async()=>{
  const durable=[{supplierId:'supplier-a',supplierName:'DURABLE SYNTHETIC',resultJson:{posHandoff:{documentNumber:'SYN-42',documentDate:'2026-11-04',totalGross:12.4},productLines:[row()]}}];
  const r=await run({durable});assert.ifError(r.error);assert.deepEqual(r.calls,[]);assert.equal(r.result.provider,'DURABLE_POS_JOB');assert.equal(r.result.totalGross,12.4);
});
test('foreign-store operator is denied before wallet, cache or provider access',async()=>{const r=await run({operatorStore:'store-other'});assert.equal(r.status,403);assert.equal(r.walletScopes,0);assert.deepEqual(r.calls,[]);assert.deepEqual(r.queries,[]);});
test('unknown company/store is denied before wallet, cache or provider access',async()=>{const r=await run({storeExists:false});assert.equal(r.status,404);assert.equal(r.walletScopes,0);assert.deepEqual(r.calls,[]);assert.deepEqual(r.queries,[]);});
test('invalid PDF input is denied before cache/provider access',async()=>{const r=await run({dataUrl:'data:image/jpeg;base64,c3ludGhldGlj'});assert.equal(r.status,400);assert.deepEqual(r.calls,[]);assert.deepEqual(r.queries,[]);});
test('Azure unavailable still uses the existing full-document fallback',async()=>{const r=await run({azure:new Error('synthetic unavailable')});assert.ifError(r.error);assert.equal(r.result.totalGross,24.8);assert.deepEqual(r.calls,['azure','openai']);});
test('Azure not configured still permits a valid full-document result',async()=>{const r=await run({azureConfigured:false});assert.ifError(r.error);assert.equal(r.result.totalGross,24.8);assert.deepEqual(r.calls,['openai']);});
test('Azure not configured cannot turn an unknown PDF amount into a success',async()=>{const r=await run({azureConfigured:false,openai:{...fallback(),totalGross:0}});assert.equal(r.result,undefined);assert.equal(r.error?.code,'FAST_HEADER_PDF_TOTAL_UNVERIFIED');});
