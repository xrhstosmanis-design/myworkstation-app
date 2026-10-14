import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import * as common from '../src/lib/invoice-common-draft.js';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';

test('cross-supplier review requires full normalized invoice identity and retains series/date/type/total boundaries',()=>{
 const a={documentNumber:'505 / 0017113',documentDate:'2026-10-14',documentType:'INVOICE',totalGross:77.66};
 const b={...a,documentNumber:'505 17113',totalGross:77.63};
 assert.equal(common.sameInvoiceIdentityForReview(a,b),true);
 for(const patch of [{documentNumber:'506 17113'},{documentNumber:'17113'},{documentNumber:'505 171130'},{documentDate:'2026-10-13'},{documentType:'CREDIT_NOTE'},{totalGross:77.72},{totalGross:0},{totalGross:NaN}])assert.equal(common.sameInvoiceIdentityForReview(a,{...b,...patch}),false,JSON.stringify(patch));
 assert.equal(common.sameInvoiceIdentityForReview({...a,documentNumber:'21-ΤΔΑ 006836'},{...a,documentNumber:'21 ΤΔΑ 6836'}),true);
});

const scope={companyId:'c',storeId:'s',inboxId:'inbox'};
async function wrongVatFixture({vat=null,pos=true,mydata=true,lines=true}={}){
 const f=await invoiceDbFixture();await f.seed({pos,mydata,posLines:lines?1:0,mydataLines:lines?1:0});
 await f.db.$executeRaw`INSERT INTO "Supplier"("id","companyId","taxId","name") VALUES('ocr-supplier','c',${vat},'Short OCR name')`;
 await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "invoiceNumber"=CASE WHEN "id"='pos' THEN '505/0017113' ELSE '505 17113' END,"supplierId"=CASE WHEN "id"='pos' THEN 'ocr-supplier' ELSE "supplierId" END`);
 await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "documentNumber"=CASE WHEN "id"='d-pos' THEN '505/0017113' ELSE '505 17113' END,"supplierId"=CASE WHEN "id"='d-pos' THEN 'ocr-supplier' ELSE "supplierId" END,"totalGross"=77.66`);
 await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrderLine" SET "quantity"=1,"unitCost"=68.73,"netAmount"=68.73,"vatAmount"=8.93,"grossAmount"=77.66`);
 await f.db.$executeRawUnsafe(`UPDATE "MyDataInboundDocument" SET "series"='505',"documentNumber"='17113',"totalGross"=77.66`);
 await f.db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "supplierId"='ocr-supplier',"amount"=77.66`);
 return f;
}
async function draftSnapshot(db){
 const out={};for(const t of ['PurchaseOrder','PurchaseDocument','PurchaseOrderLine','AiReaderJob','MyDataInboundDocument','DocumentAttachment','InvoiceDraftAlias','InvoiceStockPosting'])out[t]=await db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${t}" t ORDER BY row_to_json(t)::text`);return JSON.stringify(out);
}
async function handlers(path,db){
 const found={},router={use:()=>{},get:()=>{},post:(p,...f)=>found['POST '+p]=f.at(-1),patch:(p,...f)=>found['PATCH '+p]=f.at(-1),delete:()=>{}};
 const deps={Router:()=>router,z,crypto,prisma:db,requireCompanyModule:()=>()=>{},...common};
 const src=(await readFile(new URL(path,import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export default router;','return router;');
 new Function(...Object.keys(deps),src)(...Object.values(deps));return found;
}
async function invoke(handler,params,body={}){
 let result,failure,status=200;const req={params,body,user:{companyId:'c',id:'owner',role:'OWNER',fullName:'Fixture owner'}},res={json:v=>{result=v},status:v=>(status=v,res)};
 await handler(req,res,e=>failure=e);return {result,failure,status};
}
for(const vat of [null,'011111111'])test('native missing/wrong supplier VAT is a review candidate, never exact reuse, and blocks both real posting routes: '+vat,{skip:!isolatedInvoiceDb()},async()=>{
 const f=await wrongVatFixture({vat});try{
  await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseDocumentLine"("id","purchaseDocumentId","productId","description","quantity","unit","unitCost","netAmount","vatRate","vatAmount","grossAmount") VALUES('dl-pos','d-pos','p','Fixture',1,'PIECE',68.73,68.73,13,8.93,77.66),('dl-mydata','d-mydata','p','Fixture',1,'PIECE',68.73,68.73,13,8.93,77.66)`);
  const before=await f.snapshot(),drafts=await draftSnapshot(f.db),preview=await common.previewInvoiceReconciliation(f.db,scope);
  assert.equal(preview.orders.length,2);assert.equal(preview.orders.find(o=>o.orderId==='pos').supplierReviewRequired,true);assert.equal(preview.orders.find(o=>o.orderId==='pos').exact,false);assert.equal(preview.orders.find(o=>o.orderId==='mydata').exact,true);assert.equal(preview.files.length,2);
  const attachment=await f.db.$transaction(tx=>common.attachInboundToExistingDraft(tx,scope,'owner'));assert.equal(attachment.reconciliationRequired,true);
  const identity={companyId:'c',storeId:'s',supplierTaxId:vat,documentNumber:'505/17113',documentDate:'2026-10-12',documentType:'INVOICE',totalGross:77.66};
  await assert.rejects(common.assertNoUnresolvedInbound(f.db,identity),e=>e.code==='INVOICE_SUPPLIER_IDENTITY_REVIEW');
  await assert.rejects(f.db.$transaction(tx=>common.reuseInboundDraftForPosJob(tx,identity,{jobId:'j-pos',paymentTransactionId:'payment'})),e=>e.code==='INVOICE_SUPPLIER_IDENTITY_REVIEW');
  await common.assertNoUnresolvedInbound(f.db,{...identity,supplierTaxId:'099999999'});
  await assert.rejects(f.db.$transaction(tx=>common.reconcileInvoiceDrafts(tx,scope,{posOrderId:'pos',expectedVersion:preview.version,confirmSameInvoice:true,confirmMark:preview.mark,reason:'Compared originals',actorId:'owner'})),/ΑΦΜ/);
  for(const [orderId,documentId] of [['pos','d-pos'],['mydata','d-mydata']]){
   await assert.rejects(f.db.$transaction(tx=>common.assertInvoiceStockAvailable(tx,{companyId:'c',storeId:'s',sourceDocumentId:documentId})),e=>e.code==='INVOICE_DUPLICATE_REVIEW_REQUIRED','document-only entry must also refuse duplicate');
  }
  const orders=await handlers('../src/routes/purchase-order-posting-guard.js',f.db),docs=await handlers('../src/routes/commerce-invoice-draft-approval.js',f.db);
  const results=await Promise.all([
   invoke(orders['PATCH /:orderId'],{orderId:'pos'},{status:'FINAL'}),
   invoke(orders['PATCH /:orderId'],{orderId:'mydata'},{status:'FINAL'}),
   invoke(docs['POST /purchases/:documentId/approve'],{documentId:'d-pos'}),
   invoke(docs['POST /purchases/:documentId/approve'],{documentId:'d-mydata'})
  ]);
  for(const r of results){assert.equal(r.failure?.code,'INVOICE_DUPLICATE_REVIEW_REQUIRED');assert.equal(r.result,undefined)}
  assert.equal(await f.snapshot(),before,'one original payment, stocks and control remain identical');assert.equal(await draftSnapshot(f.db),drafts,'both rowsets/originals/jobs/references remain intact, no alias/posting/write');
 }finally{await f.close()}
});

test('native POS-first missing supplier VAT prevents a second myDATA shell; myDATA-first prevents a second POS receipt',{skip:!isolatedInvoiceDb()},async()=>{
 for(const first of ['pos','mydata']){const f=await wrongVatFixture({pos:first==='pos',mydata:first==='mydata',lines:false});try{
  const before=await f.snapshot(),drafts=await draftSnapshot(f.db);
  if(first==='pos'){const result=await f.db.$transaction(tx=>common.attachInboundToExistingDraft(tx,scope,'owner'));assert.equal(result.reconciliationRequired,true);assert.deepEqual(result.candidateOrderIds,['pos']);}
  else await assert.rejects(f.db.$transaction(tx=>common.reuseInboundDraftForPosJob(tx,{companyId:'c',storeId:'s',supplierTaxId:null,documentNumber:'505 /17113',documentDate:'2026-10-12',documentType:'INVOICE',totalGross:77.66},{jobId:'j-pos',paymentTransactionId:'payment'})),e=>e.code==='INVOICE_SUPPLIER_IDENTITY_REVIEW');
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "PurchaseOrder"'))[0].n,1);assert.equal(await f.snapshot(),before);assert.equal(await draftSnapshot(f.db),drafts);
 }finally{await f.close()}}
});

test('native review scope excludes different series/day/type/amount, canceled rows, other store and other company',{skip:!isolatedInvoiceDb()},async()=>{
 const changes=[
  `UPDATE "PurchaseDocument" SET "documentNumber"='506 17113' WHERE "id"='d-mydata'; UPDATE "PurchaseOrder" SET "invoiceNumber"='506 17113' WHERE "id"='mydata'; UPDATE "MyDataInboundDocument" SET "series"='506'`,
  `UPDATE "PurchaseDocument" SET "documentDate"='2026-10-13' WHERE "id"='d-mydata'; UPDATE "MyDataInboundDocument" SET "issueDate"='2026-10-13'`,
  `UPDATE "PurchaseDocument" SET "documentType"='CREDIT_NOTE' WHERE "id"='d-mydata'; UPDATE "MyDataInboundDocument" SET "invoiceType"='5.1'`,
  `UPDATE "PurchaseDocument" SET "totalGross"=77.72 WHERE "id"='d-mydata'; UPDATE "MyDataInboundDocument" SET "totalGross"=77.72`,
  `UPDATE "PurchaseOrder" SET "status"='CANCELLED' WHERE "id"='mydata'; UPDATE "PurchaseDocument" SET "status"='CANCELLED' WHERE "id"='d-mydata'; DELETE FROM "MyDataInboundDocument"`,
  `UPDATE "PurchaseOrder" SET "storeId"='control' WHERE "id"='mydata'; UPDATE "PurchaseDocument" SET "storeId"='control' WHERE "id"='d-mydata'; UPDATE "MyDataInboundDocument" SET "storeId"='control'`,
  `UPDATE "PurchaseOrder" SET "companyId"='foreign' WHERE "id"='mydata'; UPDATE "PurchaseDocument" SET "companyId"='foreign' WHERE "id"='d-mydata'; UPDATE "MyDataInboundDocument" SET "companyId"='foreign'`
 ];
 for(const change of changes){const f=await wrongVatFixture();try{
  for(const sql of change.split(';').map(s=>s.trim()).filter(Boolean))await f.db.$executeRawUnsafe(sql);
  const before=await f.snapshot();await f.db.$transaction(tx=>common.assertInvoiceStockAvailable(tx,{companyId:'c',storeId:'s',sourceDocumentId:'d-pos',orderId:'pos'}));
  await common.assertNoUnresolvedInbound(f.db,{companyId:'c',storeId:'s',supplierTaxId:null,documentNumber:'505/17113',documentDate:'2026-10-12',documentType:'INVOICE',totalGross:77.66});
  assert.equal(await f.snapshot(),before);
 }finally{await f.close()}}
});

