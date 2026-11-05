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

async function run({azure={...complete(),azurePageCount:2},openai=fallback(),openaiConfigured=true,azureConfigured=true,mimeType='application/pdf',dataUrl=`data:${mimeType};base64,c3ludGhldGlj`,durable=[],operatorStore='store-a',storeExists=true,transportSteps=null,timingOptions={},transportNow=null,transportTimeout=null}={}){
  let handler,result,error,status=200,walletScopes=0;
  const timings=[];
  const calls=[],requests=[],queries=[],transportRequests=[],originalAzure=snapshot(azure),originalDurable=structuredClone(durable);
  const sum=lines=>round2(lines.reduce((n,line)=>n+Number(line.grossAmount||0),0));
  const deps={
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

    recoverVatSummaryInvoiceTotal,recoverBalancedInvoicePayable,throwIfWalletError,
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
  deps.reconciledFastProductLines=new Function('finalizeV244ProductLines','reconcileInvoiceLines','round2','POS_STORED_LINES_TOLERANCE',`${reconcileSource}\nreturn reconciledFastProductLines;`)(deps.finalizeV244ProductLines,deps.reconcileInvoiceLines,round2,.05);
  if(transportSteps){
    const fakeFetch=async(url,options)=>{
      const index=transportRequests.length;
      transportRequests.push({url,method:options.method,body:JSON.parse(options.body),signal:options.signal});
      const step=transportSteps[index];assert.notEqual(step,undefined,'unexpected extra provider attempt');
      if(typeof step==='function')return step();
      if(step instanceof Error)throw step;
      if(step.httpStatus)return {ok:false,status:step.httpStatus,text:async()=>step.detail||'synthetic provider failure'};
      return {ok:true,json:async()=>step.rawResponse??{output_text:JSON.stringify(step.parsed??openai)}};
    };
    const actualProvider=new Function('fetch','process','AbortSignal','console','throwIfWalletError','FAST_OPENAI_HEADER_TOTAL_TIMEOUT_MS','FAST_OPENAI_HEADER_ATTEMPTS','Date',`${schemaSource}\n${providerSource}\nreturn callFastOpenAiHeader;`)(fakeFetch,deps.process,transportTimeout?{timeout:transportTimeout}:AbortSignal,deps.console,throwIfWalletError,timeoutMs,attempts,transportNow?{now:transportNow}:Date);
    deps.callFastOpenAiHeader=async request=>{calls.push('openai');requests.push(request);return actualProvider(request);};
  }
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
  if(azure instanceof Error&&String(azure.code||'').startsWith('AI_WALLET_')&&![400,402,403,404,409].includes(originalAzure.status))originalAzure.status=409;
  assert.deepEqual(snapshot(azure),originalAzure,'provider input unchanged except existing wallet error-status normalization');
  assert.deepEqual(durable,originalDurable,'durable source unchanged');
  assert.ok(calls.filter(x=>x==='azure').length<=1,'no added Azure call');
  assert.ok(calls.filter(x=>x==='openai').length<=1,'no added fallback call at route boundary');
  for(const query of queries)assert.deepEqual(query.values,['company-a','store-a',crypto.createHash('sha256').update(Buffer.from('synthetic')).digest('hex')]);
  return {result,error,status,calls,requests,queries,walletScopes,transportRequests,timings};
}

const printedVat='ΑΝΑΛΥΣΗ ΥΠΟΛΟΓΙΣΜΟΥ ΦΠΑ\nΣΥΝΟΛΑ 10,00 2,40 12,40';
const printedPayable='ΚΑΘΑΡΗ ΑΞΙΑ 10,00\nΦΠΑ 2,40\nΠΛΗΡΩΤΕΟ 12,40';
const fullVat='ΑΝΑΛΥΣΗ ΥΠΟΛΟΓΙΣΜΟΥ ΦΠΑ\nΣΥΝΟΛΑ 20,00 4,80 24,80';
const receiptAndAccount='ΑΠΟΔΕΙΞΗ ΕΙΣΠΡΑΞΗΣ 70,36\nΑΝΑΛΥΣΗ ΥΠΟΛΟΓΙΣΜΟΥ ΦΠΑ\nΣΥΝΟΛΑ 66,90 8,70 75,60\nΝΕΟ ΥΠΟΛΟΙΠΟ 300,00';

for(const [label,rawText,parse,expected]of [
 ['VAT summary',printedVat,recoverVatSummaryInvoiceTotal,12.4],
 ['labelled payable',printedPayable,recoverBalancedInvoicePayable,12.4],
 ['full VAT summary',fullVat,recoverVatSummaryInvoiceTotal,24.8],
 ['thousands separator','ΑΝΑΛΥΣΗ ΥΠΟΛΟΓΙΣΜΟΥ ΦΠΑ ΣΥΝΟΛΑ 1.000,00 240,00 1.240,00',recoverVatSummaryInvoiceTotal,1240],
 ['accented/lowercase','ανάλυση υπολογισμού φπα σύνολα 10,00 2,40 12,40',recoverVatSummaryInvoiceTotal,12.4],
 ['unbalanced VAT','ΑΝΑΛΥΣΗ ΥΠΟΛΟΓΙΣΜΟΥ ΦΠΑ ΣΥΝΟΛΑ 10,00 2,40 14,90',recoverVatSummaryInvoiceTotal,0],
 ['unlabelled values','10,00 2,40 ΠΛΗΡΩΤΕΟ 12,40',recoverBalancedInvoicePayable,0],
 ['receipt section excluded','PAYMENT RECEIPT ΚΑΘΑΡΗ ΑΞΙΑ 10,00 ΦΠΑ 2,40 ΠΛΗΡΩΤΕΟ 12,40',recoverBalancedInvoicePayable,0],
 ['receipt/account VAT correction',receiptAndAccount,recoverVatSummaryInvoiceTotal,75.6],
])test(`production parser: ${label}`,()=>{assert.equal(parse(rawText),expected);});

test('production parser can accept the FIRST balanced page footer: regression is not a constant-return mock',()=>{
 assert.equal(recoverVatSummaryInvoiceTotal(printedVat+'\nPAGE 2\n'+fullVat),12.4);
});

for(const [label,pageCount]of [['multi-page',2],['unknown',undefined],['string-one','1'],['zero',0]]){
 for(const [kind,rawText]of [['VAT',printedVat],['payable',printedPayable]]){
  const azure=()=>({...complete(),azurePageCount:pageCount,rawText,productLines:[row()]});
  test(`actual parsers / ${label} / ${kind}: partial footer must not replace full-reader 24.80`,async()=>{
   const r=await run({azure:azure(),transportSteps:[{}]});assert.ifError(r.error);assert.equal(r.result.totalGross,24.8);assert.deepEqual(r.result.productLines,[]);assert.equal(r.transportRequests.length,1);
  });
  test(`actual parsers / ${label} / ${kind}: missing full-reader amount cannot inherit 12.40`,async()=>{
   const r=await run({azure:azure(),transportSteps:[{parsed:{...fallback(),totalGross:0}}]});assert.equal(r.result,undefined);assert.equal(r.error?.code,'FAST_HEADER_PDF_TOTAL_UNVERIFIED');assert.equal(r.error?.status,502);
  });
  test(`actual parsers / ${label} / ${kind}: no key cannot return partial money`,async()=>{
   const r=await run({azure:azure(),openaiConfigured:false});assert.equal(r.result,undefined);assert.equal(r.error?.status,502);assert.deepEqual(r.calls,['azure']);
  });
  test(`actual parsers / ${label} / ${kind}: two real wrapper failures cannot return partial money`,async()=>{
   const r=await run({azure:azure(),transportSteps:[{httpStatus:503},{httpStatus:503}]});assert.equal(r.result,undefined);assert.equal(r.error?.status,502);assert.equal(r.transportRequests.length,2);assert.match(r.error?.cause?.message||'',/HTTP 503/);
  });
 }
}

test('two successive balanced page footers do not displace the full-document result',async()=>{
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat+'\nPAGE 2\n'+fullVat},transportSteps:[{}]});assert.ifError(r.error);assert.equal(r.result.totalGross,24.8);
});
test('full-page table is retained only after the actual return predicate agrees with 24.80',async()=>{
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat,productLines:[{...row(),code:'PAGE-1'},{...row(),code:'PAGE-2'}]},transportSteps:[{}]});assert.ifError(r.error);assert.equal(r.result.totalGross,24.8);assert.deepEqual(r.result.productLines.map(x=>x.code),['PAGE-1','PAGE-2']);
});

for(const [label,opts]of [['image',{mimeType:'image/jpeg'}],['known single-page PDF',{}]]){
 test(`${label}: real VAT parser still corrects adjacent receipt/account amount without fallback`,async()=>{
  const r=await run({...opts,azure:{...complete(),azurePageCount:1,rawText:receiptAndAccount,totalGross:70.36},transportSteps:[]});assert.ifError(r.error);assert.equal(r.result.totalGross,75.6);assert.deepEqual(r.calls,['azure']);
 });
 test(`${label}: real payable parser still corrects a wrong full-reader amount after fallback`,async()=>{
  const r=await run({...opts,azure:{...complete(),azurePageCount:1,documentNumber:'',rawText:printedPayable},transportSteps:[{}]});assert.ifError(r.error);assert.equal(r.result.totalGross,12.4);assert.equal(r.transportRequests.length,1);
 });
 test(`${label}: ordinary two-attempt failure retains the prior useful-header policy`,async()=>{
  const r=await run({...opts,azure:{...complete(),azurePageCount:1,documentNumber:'',rawText:printedVat},transportSteps:[{httpStatus:503},{httpStatus:503}]});assert.ifError(r.error);assert.equal(r.result.totalGross,12.4);assert.equal(r.transportRequests.length,2);
 });
}

for(const [name,firstStep]of [
 ['HTTP 400',{httpStatus:400,detail:'synthetic invalid request'}],
 ['empty content',{rawResponse:{output_text:''}}],
 ['malformed JSON',{rawResponse:{output_text:'{'}}],
 ['array JSON',{rawResponse:{output_text:'[]'}}],
 ['null JSON',{rawResponse:{output_text:'null'}}],
 ['network failure',new TypeError('synthetic fetch failed')],
])test(`actual Responses wrapper retries ${name}, then keeps 24.80 not partial footer`,async()=>{
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat},transportSteps:[firstStep,{}]});assert.ifError(r.error);assert.equal(r.result.totalGross,24.8);assert.equal(r.transportRequests.length,2);assert.deepEqual(r.calls,['azure','openai']);
});
for(const [label,parsed]of [['zero',{...fallback(),totalGross:0}],['missing',{}],['null amount',{...fallback(),totalGross:null}]])test(`actual Responses wrapper valid JSON with ${label} total stays blocked`,async()=>{
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat},transportSteps:[{parsed}]});assert.equal(r.result,undefined);assert.equal(r.error?.code,'FAST_HEADER_PDF_TOTAL_UNVERIFIED');assert.equal(r.transportRequests.length,1);
});

test('actual Responses request retains complete PDF data URL and strict production header schema',async()=>{
 const r=await run({transportSteps:[{}]});assert.ifError(r.error);const request=r.transportRequests[0];assert.equal(request.url,'https://api.openai.com/v1/responses');assert.equal(request.method,'POST');assert.deepEqual(request.body.input[0].content[1],{type:'input_file',filename:'synthetic.pdf',file_data:'data:application/pdf;base64,c3ludGhldGlj'});assert.equal(request.body.text.format.name,'invoice_fast_header');assert.equal(request.body.text.format.strict,true);assert.equal(request.body.text.format.schema.properties.totalGross.minimum,0);assert.ok(request.signal instanceof AbortSignal);
});
test('actual Responses request retains image transport unchanged',async()=>{
 const r=await run({mimeType:'image/jpeg',azure:{...complete(),documentNumber:''},transportSteps:[{}]});assert.ifError(r.error);assert.deepEqual(r.transportRequests[0].body.input[0].content[1],{type:'input_image',image_url:'data:image/jpeg;base64,c3ludGhldGlj',detail:'high'});
});
test('actual Responses wrapper accepts nested output text as before',async()=>{
 const r=await run({transportSteps:[{rawResponse:{output:[{content:[{type:'output_text',text:JSON.stringify(fallback())}]}]}}]});assert.ifError(r.error);assert.equal(r.result.totalGross,24.8);assert.equal(r.transportRequests.length,1);
});

for(const provider of ['azure','openai'])for(const originalStatus of [400,402,403,404,409,503]){
 test(`actual wallet guard: ${provider} status ${originalStatus} refuses fallback success/retry`,async()=>{
  const failure=Object.assign(new Error('synthetic wallet hold'),{code:'AI_WALLET_USAGE_REVIEW',status:originalStatus});
  const opts=provider==='azure'?{azure:failure,transportSteps:[]}:{azure:{...complete(),azurePageCount:2,rawText:printedVat},transportSteps:[failure]};
  const r=await run(opts);assert.equal(r.result,undefined);assert.equal(r.error,failure);assert.equal(failure.status,originalStatus===503?409:originalStatus);assert.equal(r.transportRequests.length,provider==='azure'?0:1);assert.deepEqual(r.calls,provider==='azure'?['azure']:['azure','openai']);
 });
}
test('foreign store cannot reach real parsers/provider/wallet scope',async()=>{const r=await run({operatorStore:'store-other',transportSteps:[]});assert.equal(r.status,403);assert.equal(r.walletScopes,0);assert.deepEqual(r.queries,[]);assert.deepEqual(r.transportRequests,[]);});
test('foreign company/store cannot reach real parsers/provider/wallet scope',async()=>{const r=await run({storeExists:false,transportSteps:[]});assert.equal(r.status,404);assert.equal(r.walletScopes,0);assert.deepEqual(r.transportRequests,[]);});
test('verified durable cache retains bypass without reaching actual provider wrapper',async()=>{
 const durable=[{supplierId:'supplier-a',supplierName:'DURABLE SYNTHETIC',resultJson:{posHandoff:{documentNumber:'SYN-42',documentDate:'2026-11-04',totalGross:12.4},productLines:[row()]}}];
 const r=await run({durable,transportSteps:[]});assert.ifError(r.error);assert.equal(r.result.provider,'DURABLE_POS_JOB');assert.deepEqual(r.calls,[]);assert.deepEqual(r.transportRequests,[]);
});

// V3: monetary safety and timing are exercised together, not just injected.
const outcomes=events=>events.map(({stage,outcome,attempt})=>[stage,outcome,...(attempt===undefined?[]:[attempt])]);
const prefix=[['exact_file_lookup','ok'],['azure_header','ok'],['azure_supplier_match','ok']];

test('V3 successful full-document total retains the complete timing trace and one request total',async()=>{
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat},transportSteps:[{}]});
 assert.ifError(r.error);assert.equal(r.result.totalGross,24.8);
 assert.deepEqual(outcomes(r.timings),[...prefix,['openai_attempt','ok',1],['openai_header','ok'],['openai_supplier_match','ok'],['request_total','finished']]);
});
test('V3 missing full-document amount is a policy error even when provider transport finishes',async()=>{
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat},transportSteps:[{parsed:{...fallback(),totalGross:0}}]});
 assert.equal(r.result,undefined);assert.equal(r.error?.code,'FAST_HEADER_PDF_TOTAL_UNVERIFIED');
 assert.deepEqual(outcomes(r.timings),[...prefix,['openai_attempt','ok',1],['openai_header','ok'],['openai_supplier_match','ok'],['request_total','finished']]);
});
test('V3 two failed provider attempts preserve wrapped error, timing and no successful subtotal',async()=>{
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat},transportSteps:[{httpStatus:503},{httpStatus:503}]});
 assert.equal(r.result,undefined);assert.equal(r.error?.status,502);
 assert.deepEqual(outcomes(r.timings),[...prefix,['openai_attempt','error',1],['openai_attempt','error',2],['openai_header','error'],['request_total','finished']]);
});
test('V3 missing fallback configuration records no phantom fallback span and returns no subtotal',async()=>{
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat},openaiConfigured:false});
 assert.equal(r.result,undefined);assert.equal(r.error?.status,502);
 assert.deepEqual(outcomes(r.timings),[...prefix,['request_total','finished']]);
});
test('V3 wallet hold remains original normalized error and a single failed attempt',async()=>{
 const failure=Object.assign(new Error('secret wallet failure'),{code:'AI_WALLET_USAGE_REVIEW',status:503});
 const r=await run({transportSteps:[failure]});
 assert.equal(r.error,failure);assert.equal(r.error.status,409);assert.equal(r.result,undefined);
 assert.deepEqual(outcomes(r.timings),[...prefix,['openai_attempt','error',1],['openai_header','error'],['request_total','finished']]);
});
for(const asynchronous of [false,true])test(`V3 ${asynchronous?'asynchronous':'synchronous'} telemetry failure cannot enable unsafe money`,async()=>{
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat},transportSteps:[{parsed:{...fallback(),totalGross:0}}],timingOptions:{emit(){const e=new Error('secret sink');if(asynchronous)return Promise.reject(e);throw e;}}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(r.result,undefined);assert.equal(r.error?.code,'FAST_HEADER_PDF_TOTAL_UNVERIFIED');assert.equal(r.transportRequests.length,1);
});
test('V3 shared 70-second provider budget is unchanged on retry',async()=>{
 let current=1000;const budgets=[];
 const first=()=>({ok:false,status:503,text:async()=>{current=51000;return 'secret retry failure';}});
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat},transportSteps:[first,{}],transportNow:()=>current,transportTimeout:ms=>{budgets.push(ms);return undefined;}});
 assert.ifError(r.error);assert.equal(r.result.totalGross,24.8);assert.deepEqual(budgets,[70000,20000]);
 assert.deepEqual(outcomes(r.timings.filter(e=>e.stage==='openai_attempt')),[['openai_attempt','error',1],['openai_attempt','ok',2]]);
});
test('V3 exhausted shared provider budget cannot return partial money or emit a phantom attempt',async()=>{
 let current=1000;const budgets=[];
 const first=()=>({ok:false,status:503,text:async()=>{current=70500;return 'secret exhausted deadline';}});
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat},transportSteps:[first],transportNow:()=>current,transportTimeout:ms=>{budgets.push(ms);return undefined;}});
 assert.equal(r.result,undefined);assert.equal(r.error?.status,502);assert.deepEqual(budgets,[70000]);assert.equal(r.transportRequests.length,1);
 assert.deepEqual(outcomes(r.timings.filter(e=>e.stage==='openai_attempt')),[['openai_attempt','error',1]]);
});
