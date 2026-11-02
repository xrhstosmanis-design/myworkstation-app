import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const root=new URL('../../',import.meta.url).pathname;
const load=relative=>import(pathToFileURL(path.join(root,relative)).href);
const {finalizeV244ProductLines}=await load('client/src/lib/invoice-v244.js');
const {reconcileInvoiceLines,reusableVerifiedPrintedTable}=await load('server/src/invoice-line-reconciliation.js');
const {recoverVatSummaryInvoiceTotal,recoverBalancedInvoicePayable}=await load('server/src/lib/invoice-total-reading.js');
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
async function run({azure=complete(),openai=fallback(),durable=[],operatorStore='store-a',storeExists=true,matched=null}={}){
 const calls=[],queries=[];let result,status=200,error,walletScopes=0;
 const deps={Buffer,crypto,process:{env:{AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT:'https://synthetic.invalid',AZURE_DOCUMENT_INTELLIGENCE_KEY:'synthetic',OPENAI_API_KEY:'synthetic'}},console:{warn(){},error(){}},FAST_AZURE_HEADER_TIMEOUT_MS:35000,POS_STORED_LINES_TOLERANCE:0.05,finalizeV244ProductLines,reconcileInvoiceLines,reusableVerifiedPrintedTable,recoverVatSummaryInvoiceTotal,recoverBalancedInvoicePayable,throwIfWalletError,
  prisma:{store:{findFirst:async q=>{assert.deepEqual(q,{where:{id:'store-a',companyId:'company-a'},select:{id:true}});return storeExists?{id:'store-a'}:null}},$queryRaw:async(strings,...values)=>{queries.push({sql:strings.join('?'),values});return durable}},
  walletActivityFromRequest:(req,scope)=>{assert.equal(req.user.companyId,'company-a');assert.deepEqual(scope,{storeId:'store-a',purpose:'PAYMENT_HEADER_READ'});return {purpose:scope.purpose}},
  withInvoiceWalletScope:async(scope,work)=>{walletScopes++;assert.deepEqual(scope,{companyId:'company-a',storeId:'store-a',activity:{purpose:'PAYMENT_HEADER_READ'}});return work()},
  callAzure:async options=>{calls.push('azure');assert.equal(options.contentData,'data:image/jpeg;base64,c3ludGhldGlj');if(azure instanceof Error)throw azure;return azure},
  // Provider transport normalization is outside this return-predicate change.
  normalizeAzure:value=>value,
  azureSupplierMatch:async(companyId,supplier)=>{assert.equal(companyId,'company-a');assert.deepEqual(supplier,azure.supplier);return matched},
  callFastOpenAiHeader:async()=>{calls.push('openai');if(openai instanceof Error)throw openai;return openai},
  matchSupplier:async companyId=>{assert.equal(companyId,'company-a');return null},
 };
 const fn=new Function(...Object.keys(deps),`${declarations}\n${source.slice(reconcileStart,reconcileEnd)}\nreturn ${callback}`)(...Object.values(deps));
 const req={body:{storeId:'store-a',filename:'synthetic.jpg',mimeType:'image/jpeg',dataUrl:'data:image/jpeg;base64,c3ludGhldGlj'},user:{companyId:'company-a',tokenType:'STORE_OPERATOR',storeId:operatorStore}};
 const res={status(value){status=value;return this},json(value){assert.equal(result,undefined,'one response only');result=value;return this}};
 await fn(req,res,value=>{error=value});
 return {calls,queries,result,status,error,walletScopes};
}

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
