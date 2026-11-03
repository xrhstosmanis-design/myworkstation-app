import {findCompetingPosDraftReview} from "../src/lib/pos-invoice-duplicate-review.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {invoiceToken} from '../src/lib/invoice-payment-reuse.js';
import {z} from 'zod';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
import {lockInvoiceStore} from '../src/lib/invoice-common-draft.js';

// Execute the actual creation guard, not a reimplementation of its query.
const source=fs.readFileSync(new URL('../src/routes/commerce-pos-v244-core.js',import.meta.url),'utf8');
const start=source.indexOf('async function duplicateInvoice('),end=source.indexOf('\nasync function productsForLines',start);
const guard=new Function('findCompetingPosDraftReview','normalizeDocumentNumber',source.slice(start,end)+';return duplicateInvoice;')(findCompetingPosDraftReview,v=>String(v||'').trim().toUpperCase().replace(/\s+/g,''));
const identity={companyId:'c',storeId:'s',supplierId:'sup',documentNumber:'21-NT 006836',documentDate:'2026-10-12',documentType:'INVOICE',totalGross:3.39};
const native={skip:!isolatedInvoiceDb()};
async function snapshot(f){
 const rows={moneyStock:await f.snapshot()};
 for(const table of ['PurchaseDocument','PurchaseOrder','PurchaseDocumentLine','PurchaseOrderLine','AiReaderJob','DocumentAttachment','InvoiceDraftAlias'])rows[table]=await f.db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY row_to_json(t)::text`);
 return JSON.stringify(rows);
}

test('creation guard reaches review fallback for numeric padding and uncertain series, without automatic reuse',async()=>{
 let calls=0;
 const db={$queryRaw:async()=>++calls===3?[{id:'existing',status:'DRAFT',documentNumber:'21-ΤΔΑ 6836'}]:[]};
 const result=await guard(db,identity);assert.equal(calls,3);assert.equal(result.reviewRequired,true);assert.equal(result.id,'existing');
 for(const patch of [{storeId:null},{documentDate:'invalid'},{totalGross:0},{totalGross:NaN},{documentNumber:'no-number'}]){
  let n=0;assert.equal(await guard({$queryRaw:async()=>{n++;return []}},{...identity,...patch}),null);assert.equal(n,2);
 }
 for(const documentDate of [undefined,null]){
  let n=0;const result=await guard({$queryRaw:async()=>++n===3?[{id:'existing',status:'DRAFT'}]:[]},{...identity,documentDate});
  assert.equal(n,3);assert.equal(result.reviewRequired,true,'an absent date cannot bypass uncertain-number review');
  assert.equal(await guard({$queryRaw:async()=>[]},{...identity,documentDate}),null,'no competing candidate preserves first intake');
 }
});

test('native creation guard detects padded and misread-series POS drafts with no changes, including concurrent locked checks',native,async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({mydata:false,posLines:1});const before=await snapshot(f);
  for(const documentNumber of ['21-ΤΔΑ 6836','21-NT 006836','21-ΤΔΑ 0006836']){
   const results=await Promise.all([0,1].map(()=>f.db.$transaction(async tx=>{await lockInvoiceStore(tx,'c','s');return guard(tx,{...identity,documentNumber})})));
   for(const result of results){assert.equal(result.id,'d-pos');assert.equal(result.reviewRequired,true)}
  }
  assert.equal(await snapshot(f),before);
  assert.equal(await guard(f.db,{...identity,excludeDocumentId:'d-pos'}),null,'own shell can receive its lines without finding itself');
  assert.equal(await snapshot(f),before);
 }finally{await f.close()}
});

test('native uncertain-number review respects supplier, store, issue day, type, total, number and cancellation',native,async()=>{
 for(const patch of [{supplierId:'other'},{companyId:'foreign'},{storeId:'control'},{documentDate:'2026-10-13'},{documentType:'CREDIT_NOTE'},{totalGross:3.45},{documentNumber:'21-NT 7777'}]){
  const f=await invoiceDbFixture();try{await f.seed({mydata:false});const before=await snapshot(f);assert.equal(await guard(f.db,{...identity,...patch}),null,JSON.stringify(patch));assert.equal(await snapshot(f),before)}finally{await f.close()}
 }
 const f=await invoiceDbFixture();try{
  await f.seed({mydata:false});await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "status"='CANCELLED'`);await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "status"='CANCELLED'`);
  const before=await snapshot(f);assert.equal(await guard(f.db,identity),null);assert.equal(await snapshot(f),before);
 }finally{await f.close()}
});

test('native exact-number company-wide prevention is retained outside the selected store',native,async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({mydata:false});const before=await snapshot(f);
  const result=await guard(f.db,{...identity,storeId:'control',documentNumber:'21-ΤΔΑ 006836'});
  assert.equal(result.id,'d-pos');assert.equal(result.reviewRequired,undefined);assert.equal(await snapshot(f),before);
 }finally{await f.close()}
});


test('native actual new POS shell route refuses competing padded draft before any insert or financial helper',native,async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({mydata:false,posLines:1});
  await f.db.$executeRawUnsafe(`INSERT INTO "AiReaderJob"("id","companyId","storeId","attachmentId") VALUES('new-job','c','s','photo')`);
  const before=await snapshot(f);
  const a=source.indexOf('router.post("/ai-reader/jobs/:jobId/pos-draft"'),b=source.indexOf('\n});',a)+4;
  const body=source.slice(a,b),handler=body.slice(body.indexOf('async(req,res,next)=>'),-2).trim();
  const forbidden=()=>{throw new Error('Unexpected payment or insertion')};
  const deps={z,prisma:f.db,id:forbidden,ensureInvoiceCommonDraftSchema:async()=>{},lockInvoiceStore,
   assertNoUnresolvedInbound:async()=>{},findInvoicePayment:forbidden,assertReusableInvoicePayment:forbidden,
   reuseInboundDraftForPosJob:async()=>null,findUnlinkedMyDataOriginal:async()=>null,bindUnlinkedMyDataOriginal:forbidden,duplicateInvoice:guard};
  const route=new Function(...Object.keys(deps),'return '+handler)(...Object.values(deps));
  let error,result;const res={status:()=>res,json:value=>{result=value;return res}};
  await route({params:{jobId:'new-job'},user:{companyId:'c',id:'synthetic-owner'},body:{...identity,settlementMode:'CREDIT'}},res,e=>{error=e});
  assert.equal(error?.status,409);assert.equal(error?.code,'INVOICE_DUPLICATE_REVIEW_REQUIRED');assert.equal(result,undefined);
  assert.equal(await snapshot(f),before,'original/new job, all documents, rows, original files, money and stock remain unchanged');
 }finally{await f.close()}
});


test('native missing issue date broadens review across years without inventing dates or changing source records',native,async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({mydata:false,posLines:1});
  for(const issueDay of ['2026-10-12','2025-10-12']){
   await f.db.$executeRaw`UPDATE "PurchaseDocument" SET "documentDate"=${new Date(issueDay)} WHERE "id"='d-pos'`;
   const before=await snapshot(f);
   for(const documentDate of [undefined,null]){
    const found=await guard(f.db,{...identity,documentDate});assert.equal(found.id,'d-pos');assert.equal(found.reviewRequired,true);
    assert.equal(await guard(f.db,{...identity,documentDate,excludeDocumentId:'d-pos'}),null,'own shell is never its competing candidate');
    assert.equal(await guard(f.db,{...identity,documentDate,documentNumber:'21-NT 7777'}),null,'absent date alone never matches another number');
   }
   assert.equal(await guard(f.db,{...identity,documentDate:'2024-10-12'}),null,'an explicit distinct issue day retains its existing boundary');
   assert.equal(await snapshot(f),before);
  }
 }finally{await f.close()}
});

test('native absent issue date with no stored candidate preserves first intake without changes',native,async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({pos:false,mydata:false,payment:false});const before=await snapshot(f);
  for(const documentDate of [undefined,null])assert.equal(await guard(f.db,{...identity,documentDate}),null);
  assert.equal(await snapshot(f),before);
 }finally{await f.close()}
});

test('native zero invoice number never matches a candidate with missing numeric suffix',native,async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({mydata:false,posLines:1});
  for(const documentNumber of [null,'','NO-NUMBER']){
   await f.db.$executeRaw`UPDATE "PurchaseDocument" SET "documentNumber"=${documentNumber} WHERE "id"='d-pos'`;
   await f.db.$executeRaw`UPDATE "PurchaseOrder" SET "invoiceNumber"=${documentNumber} WHERE "id"='pos'`;
   const before=await snapshot(f);
   assert.equal(await guard(f.db,{...identity,documentNumber:'OTHER 0000'}),null);
   assert.equal(await snapshot(f),before);
  }
  await f.db.$executeRaw`UPDATE "PurchaseDocument" SET "documentNumber"='SERIES 000' WHERE "id"='d-pos'`;
  await f.db.$executeRaw`UPDATE "PurchaseOrder" SET "invoiceNumber"='SERIES 000' WHERE "id"='pos'`;
  const before=await snapshot(f),found=await guard(f.db,{...identity,documentNumber:'OTHER 0000'});
  assert.equal(found.id,'d-pos');assert.equal(found.reviewRequired,true,'a real printed all-zero suffix still has numeric identity');
  assert.equal(await snapshot(f),before);
 }finally{await f.close()}
});


test('native actual pos-intake cannot bypass duplicate review with omitted or null issue date',native,async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({mydata:false,posLines:1});
  const line={description:'Synthetic row',quantity:1,unitCost:3,netAmount:3,vatRate:13,grossAmount:3.39};
  await f.db.$executeRaw`INSERT INTO "AiReaderJob"("id","companyId","storeId","attachmentId","status","resultJson") VALUES('new-intake','c','s','photo','AI_COMPLETE',${JSON.stringify({v244Finalized:true,productLines:[line]})}::jsonb)`;
  const before=await snapshot(f),a=source.indexOf('router.post("/ai-reader/jobs/:jobId/pos-intake"'),b=source.indexOf('\n});',a)+4;
  const registration=source.slice(a,b),handler=registration.slice(registration.indexOf('async(req,res,next)=>'),-2).trim();
  const sa=source.indexOf('const lineSchema='),sb=source.indexOf('\nasync function duplicateInvoice',sa),lineSchema=new Function('z',source.slice(sa,sb)+';return lineSchema;')(z);
  const deps={z,lineSchema,prisma:f.db,crypto,norm:invoiceToken,normalizePersistedInvoiceEconomics:x=>x,restoreUniqueExactGrossGap:lines=>({lines}),exactLearnedInvoiceCandidate:()=>null,hasLearnedInvoiceIdentity:()=>false,ensureInvoiceCommonDraftSchema:async()=>{},lockInvoiceStore,duplicateInvoice:guard,id:()=>{throw Error('Unexpected insertion')}};
  const route=new Function(...Object.keys(deps),'return '+handler)(...Object.values(deps));
  for(const documentDate of [undefined,null]){
   let error,result;const res={status:()=>res,json:value=>{result=value;return res}};
   await route({params:{jobId:'new-intake'},user:{companyId:'c',id:'synthetic-owner'},body:{...identity,documentDate,settlementMode:'CREDIT'}},res,e=>{error=e});
   assert.equal(error?.status,409);assert.equal(error?.code,'INVOICE_DUPLICATE_REVIEW_REQUIRED');assert.equal(result,undefined);assert.equal(await snapshot(f),before);
  }
 }finally{await f.close()}
});
