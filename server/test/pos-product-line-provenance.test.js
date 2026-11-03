import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {normalizePersistedInvoiceEconomics} from '../src/routes/commerce-pos-v244-core.js';

const core=readFileSync(new URL('../src/routes/commerce-pos-v244-core.js',import.meta.url),'utf8');
const alternate=readFileSync(new URL('../src/routes/commerce-pos-ai-recheck.js',import.meta.url),'utf8');
const schemaStart=core.indexOf('const lineSchema=z.object(');
const schemaEnd=core.indexOf('\n\nasync function duplicateInvoice',schemaStart);
assert.ok(schemaStart>=0&&schemaEnd>schemaStart);
const lineSchema=new Function('z',core.slice(schemaStart,schemaEnd)+';return lineSchema;')(z);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v||0)));
function handler(source,method,path,deps){
 const start=source.indexOf(`router.${method}("${path}"`);assert.ok(start>=0);
 const next=source.indexOf('\nrouter.',start+1);
 const block=source.slice(start,next<0?source.indexOf('\nexport default router',start):next).trim();
 const body=block.slice(block.indexOf('async(req,res,next)=>')).replace(/\);\s*$/,'');
 return new Function(...Object.keys(deps),'return '+body)(...Object.values(deps));
}
const row=(index=0)=>({rawText:`SYNTHETIC ${index}`,code:`LAB-${index}`,description:`SYNTHETIC ITEM ${index}`,quantity:2,unit:'ΤΜΧ',unitCost:5,netAmount:10,exciseTotal:0,vatRate:24,grossAmount:12.4,confidence:99,sourceColumnsVerified:true});
const mapped=()=>[[0,1],[0,2],[1,1]].map(([sourceFileIndex,sourcePage],i)=>({...row(i),sourceFileIndex,sourcePage}));
const coordinates=rows=>rows.map(r=>[r.sourceFileIndex,r.sourcePage]);
async function runPut(kind,rows,{foreign=false,locked=false}={}){
 let saved,result,error,status=200;const calls=[];
 const background=kind==='background';
 const job={id:'job-a',storeId:'store-a',status:locked?'CONFIRMED':'AI_COMPLETE',purchaseDocumentId:background||locked?'document-a':null,resultJson:{retained:'original',posHandoff:{original:true}},documentSourceType:'POS_OCR_DRAFT',documentStatus:'DRAFT'};
 const prisma={
  $queryRaw:async(strings,...values)=>{calls.push({kind:'read',sql:strings.join('?'),values});return [job];},
  $executeRaw:async(strings,...values)=>{calls.push({kind:'write',sql:strings.join('?'),values});saved=JSON.parse(values[0]);return 1;}
 };
 const h=handler(kind==='core'?core:alternate,'put','/ai-reader/jobs/:jobId/product-lines',{z,lineSchema,prisma,clamp,decimalText:String});
 const req={params:{jobId:'job-a'},user:{id:'operator-a',companyId:'company-a',storeId:foreign?'store-other':'store-a',tokenType:background?'POS_BACKGROUND':'STORE_OPERATOR'},body:{source:kind==='review'?'V2.4.4_USER_REVIEW':'V2.4.4',productLines:rows}};
 const res={status(code){status=code;return this;},json(value){result=value;return this;}};
 await h(req,res,e=>{error=e;});return {saved,result,error,status,calls};
}
async function intake(resultJson,{foreign=false,locked=false}={}){
 let parsed,result,error,status=200;const calls=[];
 const prisma={
  $queryRaw:async(strings,...values)=>{const sql=strings.join('?');calls.push({sql,values});if(sql.includes('FROM "AiReaderJob"'))return [{id:'job-a',storeId:'store-a',status:locked?'CONFIRMED':'AI_COMPLETE',purchaseDocumentId:locked?'document-a':null,resultJson}];if(sql.includes('FROM "Supplier"'))return [];throw new Error('Unexpected query');},
  $executeRaw:async()=>{throw new Error('No intake write permitted in parser-boundary test');}
 };
 // Exercise the real handler through its persisted schema and real economic
 // normalization; stop at the next unrelated boundary (supplier lookup).
 const h=handler(core,'post','/ai-reader/jobs/:jobId/pos-intake',{z,lineSchema,prisma,normalizePersistedInvoiceEconomics,restoreUniqueExactGrossGap:lines=>{parsed=lines;return {lines};}});
 const req={params:{jobId:'job-a'},user:{companyId:'company-a',storeId:foreign?'store-other':'store-a',tokenType:'STORE_OPERATOR'},body:{supplierId:'supplier-a',documentNumber:'LAB-PROVENANCE-1',totalGross:37.2,settlementMode:'CREDIT'}};
 const res={status(code){status=code;return this;},json(value){result=value;return this;}};
 await h(req,res,e=>{error=e;});return {parsed,result,error,status,calls};
}

for(const kind of ['core','background','review']){
 test(`${kind} actual PUT preserves two PDF pages plus a photo in saved JSON and response`,async()=>{
  const r=await runPut(kind,mapped());assert.ifError(r.error);assert.equal(r.status,200);
  assert.deepEqual(coordinates(r.saved.productLines),[[0,1],[0,2],[1,1]]);
  assert.deepEqual(coordinates(r.result.productLines),[[0,1],[0,2],[1,1]]);
  assert.equal(r.saved.retained,'original');assert.deepEqual(r.saved.posHandoff,{original:true});
  assert.deepEqual(r.saved.productLines.map(x=>[x.code,x.quantity,x.unitCost,x.netAmount,x.vatRate,x.grossAmount]),mapped().map(x=>[x.code,x.quantity,x.unitCost,x.netAmount,x.vatRate,x.grossAmount]));
  assert.deepEqual(r.calls.map(x=>x.kind),['read','write']);
 });
 test(`${kind} legacy rows retain absent coordinates and identical database call count`,async()=>{
  const legacy=await runPut(kind,[row()]),withSource=await runPut(kind,[{...row(),sourceFileIndex:0,sourcePage:1}]);assert.ifError(legacy.error);assert.ifError(withSource.error);
  for(const key of ['sourceFileIndex','sourcePage'])assert.equal(Object.hasOwn(legacy.saved.productLines[0],key),false);
  assert.deepEqual(legacy.calls.map(x=>x.kind),withSource.calls.map(x=>x.kind));
  const withoutSource={...withSource.saved.productLines[0]};delete withoutSource.sourceFileIndex;delete withoutSource.sourcePage;assert.deepEqual(withoutSource,legacy.saved.productLines[0]);
 });
 test(`${kind} shared BackOffice route preserves page six without imposing POS page limits`,async()=>{
  const r=await runPut(kind,[{...row(),sourceFileIndex:5,sourcePage:6}]);assert.ifError(r.error);assert.deepEqual(coordinates(r.saved.productLines),[[5,6]]);
 });
 test(`${kind} preserves independent coordinates and the exact safe integer boundary without guessing`,async()=>{
  for(const fields of [{sourceFileIndex:0},{sourcePage:2},{sourceFileIndex:Number.MAX_SAFE_INTEGER,sourcePage:Number.MAX_SAFE_INTEGER}]){
   const r=await runPut(kind,[{...row(),...fields}]);assert.ifError(r.error);
   const actual=Object.fromEntries(Object.entries(r.saved.productLines[0]).filter(([key])=>['sourceFileIndex','sourcePage'].includes(key)));
   assert.deepEqual(actual,fields);
  }
 });
 for(const [key,value] of [['sourceFileIndex',-1],['sourcePage',0],['sourcePage',1.5],['sourceFileIndex','0'],['sourcePage',null],['sourcePage',Infinity],['sourceFileIndex',Number.MAX_SAFE_INTEGER+1]]){
  test(`${kind} rejects ${key}=${String(value)} before database access`,async()=>{
   const r=await runPut(kind,[{...row(),[key]:value}]);assert.ok(r.error instanceof z.ZodError);assert.deepEqual(r.calls,[]);assert.equal(r.saved,undefined);
  });
 }
}
for(const kind of ['core','review']){
 for(const [name,options,status] of [['foreign store',{foreign:true},403],['locked document',{locked:true},409]]){
  test(`${kind} ${name} still refuses mapped rows without a write`,async()=>{
   const r=await runPut(kind,mapped(),options);assert.ifError(r.error);assert.equal(r.status,status);assert.equal(r.saved,undefined);assert.deepEqual(r.calls.map(x=>x.kind),['read']);
  });
 }
}
test('core PUT saved JSON survives actual intake schema and economic normalization in physical order',async()=>{
 const written=await runPut('core',mapped());assert.ifError(written.error);const r=await intake(written.saved);assert.ifError(r.error);assert.equal(r.status,404);assert.deepEqual(coordinates(r.parsed),[[0,1],[0,2],[1,1]]);assert.deepEqual(r.parsed.map(x=>x.grossAmount),[12.4,12.4,12.4]);assert.equal(r.calls.length,2);
});
test('intake legacy rows remain coordinate-free',async()=>{
 const written=await runPut('core',[row()]);const r=await intake(written.saved);assert.ifError(r.error);for(const key of ['sourceFileIndex','sourcePage'])assert.equal(Object.hasOwn(r.parsed[0],key),false);
});
for(const [name,options,status] of [['foreign store',{foreign:true},403],['locked document',{locked:true},409]]){
 test(`intake ${name} refuses before processing source coordinates`,async()=>{
  const r=await intake({v244Finalized:true,productLines:mapped()},options);assert.ifError(r.error);assert.equal(r.status,status);assert.equal(r.parsed,undefined);assert.equal(r.calls.length,1);
 });
}
