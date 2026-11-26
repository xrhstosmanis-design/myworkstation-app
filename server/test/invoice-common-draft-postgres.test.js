import {recordPurchaseCostIncrease,recordSupplierDiscountReduction} from '../src/services/purchase-cost-increase-event.js';
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {readFile} from "node:fs/promises";
import {z} from "zod";
import {invoiceDbFixture,invoicePackPostingFixture,isolatedInvoiceDb,installPurchaseAlertFixture} from "./helpers/invoice-common-draft-fixture.js";
import * as common from "../src/lib/invoice-common-draft.js";
import {loadInvoiceAssistantSource} from "../src/lib/invoice-assistant-source.js";
import {acquireOriginal} from "../src/mydata-original.js";
const scope={companyId:'c',storeId:'s',inboxId:'inbox'};
const confirmed=preview=>({posOrderId:'pos',expectedVersion:preview.version,confirmSameInvoice:true,confirmMark:preview.mark,confirmPaymentDiscrepancy:true,reason:'Compared both original files',actorId:'owner'});

test('invoice identity normalizes numeric padding and punctuation without merging a different series',()=>{
 assert.equal(common.sameInvoiceNumber('21 - ΤΔΑ 006836','21-ΤΔΑ','6836'),true);
 assert.equal(common.sameInvoiceNumber('006836','21-ΤΔΑ','6836'),true);
 for(const s of ['21-1AA006836','21-ΠΤ6836','21-ΤΔΑ68360','22-ΤΔΑ6836'])assert.equal(common.sameInvoiceNumber(s,'21-ΤΔΑ','6836'),false,s);
 assert.deepEqual(common.invoiceNumberParts('A 000000000000012345678901234567890'),{series:'A',number:'12345678901234567890'});
});

test('native existing mismatched pair becomes one draft; immutable payment, both originals and source origins survive replay/concurrency', {skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({wrong:true});const before=await f.snapshot(),preview=await common.previewInvoiceReconciliation(f.db,scope);
  assert.equal(preview.orders.length,2);assert.equal(preview.files.length,2);assert.equal(preview.orders.find(o=>o.orderId==='pos').exact,false);
  await assert.rejects(f.db.$transaction(tx=>common.reconcileInvoiceDrafts(tx,scope,{...confirmed(preview),confirmPaymentDiscrepancy:false})),/διαφέρει/);assert.equal(await f.snapshot(),before);
  const results=await Promise.all([0,1].map(()=>f.db.$transaction(tx=>common.reconcileInvoiceDrafts(tx,scope,confirmed(preview)),{timeout:20000})));
  assert.equal(results.filter(r=>!r.reused).length,1);assert.equal(results[0].paymentChanged,false);assert.equal(results[0].stockUpdated,false);
  assert.equal(await f.snapshot(),before);
  const orders=await f.db.$queryRawUnsafe('SELECT "id","status","invoiceNumber" FROM "PurchaseOrder" ORDER BY "id"');assert.deepEqual(orders,[{id:'mydata',status:'MERGED',invoiceNumber:'21-ΤΔΑ 6836'},{id:'pos',status:'NEW',invoiceNumber:'21-ΤΔΑ 6836'}]);
  const pdf=await loadInvoiceAssistantSource(f.db,'c','pos',{inboxId:'inbox',storeId:'s'}),photo=await loadInvoiceAssistantSource(f.db,'c','pos');assert.equal(pdf.pages[0].mimeType,'application/pdf');assert.equal(photo.pages[0].filename,'POS.jpg');
  const doc=(await f.db.$queryRawUnsafe('SELECT * FROM "PurchaseDocument" WHERE "id"=\'d-pos\''))[0];assert.equal(Number(doc.totalGross),3.39);assert.equal(doc.paymentTransactionId,'payment');assert.equal(doc.documentDate.toISOString().slice(0,10),'2026-10-12');
  const audit=(await f.db.$queryRawUnsafe('SELECT "details" FROM "InvoiceDraftAlias"'))[0].details;assert.equal(audit.paymentDifference,2);assert.equal(audit.requiresPaymentReview,true);assert.equal(audit.before.find(o=>o.orderId==='pos').totalGross,5.39);
  assert.equal((await common.previewInvoiceReconciliation(f.db,scope)).commonDraft.orderId,'pos');
 }finally{await f.close()}
});

test('native myDATA-first consolidation keeps the existing POS payment handoff as its only payment binding', {skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed();
  await f.db.$executeRawUnsafe(`UPDATE "AiReaderJob" SET "resultJson"=jsonb_set("resultJson",'{posHandoff,paymentTransactionId}','"payment"') WHERE "id"='j-pos'`);
  const before=await f.snapshot();
  const result=await f.db.$transaction(tx=>common.reconcileInvoiceDrafts(tx,scope,{posOrderId:'pos',automatic:true,actorId:'owner'}));
  const jobs=await f.db.$queryRawUnsafe(`SELECT "id","purchaseDocumentId","resultJson" FROM "AiReaderJob" ORDER BY "createdAt"`);
  assert.equal(result.documentId,'d-pos');
  assert.equal(await f.snapshot(),before);
  assert.deepEqual(jobs.map(job=>job.purchaseDocumentId),['d-pos','d-pos']);
  assert.equal(jobs[0].resultJson.mydataPosReceipt.paymentTransactionId,null);
  assert.equal(jobs[1].resultJson.posHandoff.paymentTransactionId,'payment');
  assert.equal((await loadInvoiceAssistantSource(f.db,'c','pos')).pages[0].filename,'POS.jpg');
 }finally{await f.close()}
});

test('native POS-first reuses its padded-number draft; myDATA-first race binds stored POS pages to original draft with no new order', {skip:!isolatedInvoiceDb()},async()=>{
 for(const first of ['pos','mydata']){const f=await invoiceDbFixture();try{
  await f.seed({pos:first==='pos',mydata:first==='mydata'});const before=await f.snapshot();
  if(first==='pos'){
   const result=await f.db.$transaction(tx=>common.attachInboundToExistingDraft(tx,scope,'owner'));assert.equal(result.purchaseOrderId,'pos');
  }else{
   await f.db.$executeRawUnsafe(`UPDATE "AiReaderJob" SET "resultJson"=jsonb_set("resultJson",'{posHandoff,paymentTransactionId}','"payment"') WHERE "id"='j-pos'`);
   const result=await f.db.$transaction(async tx=>{await common.lockInvoiceStore(tx,'c','s');return common.reuseInboundDraftForPosJob(tx,{companyId:'c',storeId:'s',supplierTaxId:'099999999',documentNumber:'21-ΤΔΑ 006836',documentDate:'2026-10-12',totalGross:3.39,documentType:'INVOICE'},{jobId:'j-pos',paymentTransactionId:'payment'})});assert.equal(result.orderId,'mydata');
   const jobs=await f.db.$queryRawUnsafe(`SELECT "id","resultJson" FROM "AiReaderJob" ORDER BY "id"`);
   assert.equal(jobs[0].resultJson.mydataPosReceipt.paymentSourceJobId,'j-pos');
   assert.equal(jobs[1].resultJson.commonDraft.paymentTransactionId,'payment');
  }
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM "PurchaseOrder"'))[0].count,1);assert.equal(await f.snapshot(),before);
  const target=first==='pos'?'pos':'mydata';const source=await loadInvoiceAssistantSource(f.db,'c',target);assert.equal(source.pages[0].filename,'POS.jpg');assert.equal((await loadInvoiceAssistantSource(f.db,'c',target,{inboxId:'inbox',storeId:'s'})).pages[0].filename,'original.pdf');
 }finally{await f.close()}}
});

test('native original acquisition returns and reopens the registered canonical order after absorbing an exact POS draft', {skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({payment:false,mydataLines:1});
  await f.db.$executeRaw`UPDATE "PurchaseOrder" SET "status"='INVOICED' WHERE "id"='mydata'`;
  await f.db.$executeRaw`UPDATE "PurchaseDocument" SET "status"='APPROVED' WHERE "id"='d-mydata'`;
  await f.db.$executeRaw`INSERT INTO "PurchaseOrderPosting"("orderId","companyId","purchaseDocumentId") VALUES('mydata','c','d-mydata')`;
  const before=await f.snapshot();
  const acquire=()=>acquireOriginal(f.db,'c','s','inbox','owner',true,()=>assert.fail('The stored original should be reused'));
  const first=await acquire();
  assert.equal(first.purchaseOrderId,'mydata');assert.equal(first.reused,false);
  const retry=await acquire();
  assert.equal(retry.purchaseOrderId,'mydata');assert.equal(retry.reused,true);
  const orders=await f.db.$queryRaw`SELECT "id","status" FROM "PurchaseOrder" ORDER BY "id"`;
  assert.deepEqual(orders,[{id:'mydata',status:'INVOICED'},{id:'pos',status:'MERGED'}]);
  assert.equal(await f.snapshot(),before);
 }finally{await f.close()}
});

test('native original acquisition prefills the empty paid POS draft once without changing the payment', {skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({mydata:false});
  await f.db.$executeRaw`ALTER TABLE "MyDataInboundDocument" ADD COLUMN "totalNet" NUMERIC, ADD COLUMN "totalVat" NUMERIC`;
  await f.db.$executeRaw`ALTER TABLE "PurchaseOrderLine" ADD COLUMN "initialUnitCost" NUMERIC`;
  const xml='<invoiceDetails><itemDescr>Verified row</itemDescr><quantity>3</quantity><measurementUnit>1</measurementUnit><netValue>3</netValue><vatCategory>2</vatCategory><vatAmount>0.39</vatAmount></invoiceDetails>';
  await f.db.$executeRaw`UPDATE "MyDataInboundDocument" SET "totalNet"=3,"totalVat"=0.39,"rawPayload"=jsonb_build_object('xml',${xml}::text) WHERE "id"='m'`;
  await f.db.$executeRaw`UPDATE "DocumentInbox" SET "status"='RECEIVED' WHERE "id"='inbox'`;
  const before=await f.snapshot();
  const acquire=()=>acquireOriginal(f.db,'c','s','inbox','owner',true,()=>assert.fail('The stored original should be reused'));
  assert.equal((await acquire()).purchaseOrderId,'pos');
  const readLines=()=>f.db.$queryRaw`SELECT "id","orderId","description","grossAmount"::text FROM "PurchaseOrderLine"`;
  const lines=await readLines();
  assert.equal(lines.length,1);
  assert.deepEqual(lines.map(({orderId,description,grossAmount})=>({orderId,description,grossAmount})),[{orderId:'pos',description:'Verified row',grossAmount:'3.39'}]);
  assert.equal((await acquire()).purchaseOrderId,'pos');
  assert.deepEqual(await readLines(),lines);
  const [document]=await f.db.$queryRaw`SELECT "paymentTransactionId" FROM "PurchaseDocument" WHERE "id"='d-pos'`;
  assert.equal(document.paymentTransactionId,'payment');
  assert.equal(await f.snapshot(),before);
 }finally{await f.close()}
});

test('native November recovery links the original PDF and keeps POS photos on the same purchase', {skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({mydata:false,posLines:1});
  await f.db.$executeRaw`ALTER TABLE "DocumentAttachment" ADD COLUMN "documentType" text, ADD COLUMN "storageKey" text`;
  await f.db.$executeRaw`DELETE FROM "AiReaderJob" WHERE "id"='j-pdf'`;
  await f.db.$executeRaw`UPDATE "DocumentInbox" SET "attachmentId"=NULL,"status"='RECEIVED' WHERE "id"='inbox'`;
  await f.db.$executeRaw`DELETE FROM "DocumentAttachment" WHERE "id"='pdf'`;
  const novemberDate=new Date('2026-11-12');
  await f.db.$executeRaw`UPDATE "MyDataInboundDocument" SET "issueDate"=${novemberDate} WHERE "id"='m'`;
  await f.db.$executeRaw`UPDATE "PurchaseDocument" SET "documentDate"=${novemberDate} WHERE "id"='d-pos'`;
  const before=await f.snapshot();
  const lines=()=>f.db.$queryRaw`SELECT "id","orderId","description" FROM "PurchaseOrderLine" ORDER BY "id"`;
  const linesBefore=await lines();
  const bytes=Buffer.from('%PDF-1.4');
  let downloads=0;
  const acquire=()=>acquireOriginal(f.db,'c','s','inbox','owner',false,async()=>{
   downloads++;
   return {bytes,text:'verified sample',pageCount:1,checksum:'replacement-pdf-hash',filename:'recovered-original.pdf'};
  },{reconcileExisting:true});
  const result=await acquire();
  assert.equal(result.downloaded,true);
  assert.equal(result.purchaseOrderId,'pos');
  assert.equal(result.jobId,null);
  await acquire();
  assert.equal(downloads,1);
  assert.deepEqual(await f.db.$queryRaw`SELECT "id","status" FROM "PurchaseOrder"`,[{id:'pos',status:'NEW'}]);
  assert.deepEqual(await f.db.$queryRaw`SELECT "id","purchaseDocumentId" FROM "AiReaderJob"`,[{id:'j-pos',purchaseDocumentId:'d-pos'}]);
  assert.deepEqual(await lines(),linesBefore);
  const photo=await loadInvoiceAssistantSource(f.db,'c','pos');
  const pdf=await loadInvoiceAssistantSource(f.db,'c','pos',{inboxId:'inbox',storeId:'s'});
  assert.equal(photo.pages[0].filename,'POS.jpg');
  assert.equal(pdf.pages[0].filename,'recovered-original.pdf');
  assert.equal(pdf.pages[0].mimeType,'application/pdf');
  assert.equal(await f.snapshot(),before);
 }finally{await f.close()}
});

test('native wrong scope/MARK/stale values/populated conflicts and already double-posted invoices cannot mutate the pair', {skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({posLines:1,mydataLines:1});const preview=await common.previewInvoiceReconciliation(f.db,scope),before=await f.snapshot();
  for(const args of [{...confirmed(preview),confirmMark:'other'},{...confirmed(preview),expectedVersion:'0'.repeat(64)},confirmed(preview)])await assert.rejects(f.db.$transaction(tx=>common.reconcileInvoiceDrafts(tx,scope,args)));
  await assert.rejects(common.previewInvoiceReconciliation(f.db,{...scope,storeId:'control'}));await assert.rejects(common.previewInvoiceReconciliation(f.db,{...scope,companyId:'foreign'}));assert.equal(await f.snapshot(),before);
  await f.db.$executeRawUnsafe('DELETE FROM "PurchaseOrderLine"');
  const updated=await common.previewInvoiceReconciliation(f.db,scope);
  await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseOrderPosting"("orderId","companyId","purchaseDocumentId") VALUES('pos','c','d-pos'),('mydata','c','d-mydata')`);
  await assert.rejects(f.db.$transaction(tx=>common.reconcileInvoiceDrafts(tx,scope,confirmed(updated))),e=>e.code==='INVOICE_ALREADY_DOUBLE_POSTED');assert.equal(await f.snapshot(),before);
 }finally{await f.close()}
});

test('native nonempty reviewed rows move once with IDs and values preserved; row edits invalidate a preview', {skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({mydataLines:1});let preview=await common.previewInvoiceReconciliation(f.db,scope);
  await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrderLine" SET "description"='Reviewed edit' WHERE "id"='line-mydata'`);
  await assert.rejects(f.db.$transaction(tx=>common.reconcileInvoiceDrafts(tx,scope,confirmed(preview))),e=>e.code==='INVOICE_RECONCILIATION_STALE');
  preview=await common.previewInvoiceReconciliation(f.db,scope);await f.db.$transaction(tx=>common.reconcileInvoiceDrafts(tx,scope,confirmed(preview)));
  const rows=await f.db.$queryRawUnsafe('SELECT "id","orderId","description","quantity","unitCost" FROM "PurchaseOrderLine"');assert.equal(rows.length,1);assert.equal(rows[0].id,'line-mydata');assert.equal(rows[0].orderId,'pos');assert.equal(rows[0].description,'Reviewed edit');assert.equal(Number(rows[0].quantity),3);assert.equal(Number(rows[0].unitCost),1);
 }finally{await f.close()}
});

async function actualHandlers(path,db,extra={}){
 const handlers={};const router={use:()=>{},get:()=>{},post:(p,...f)=>handlers['POST '+p]=f.at(-1),patch:(p,...f)=>handlers['PATCH '+p]=f.at(-1),delete:()=>{}};
 const deps={recordPurchaseCostIncrease,recordSupplierDiscountReduction,Router:()=>router,z,crypto,prisma:db,requireCompanyModule:()=>()=>{},...common,...extra};
 const src=(await readFile(new URL(path,import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export default router;','return router;');new Function(...Object.keys(deps),src)(...Object.values(deps));return handlers;
}
async function invoke(handler,params,body={}){let result,failure,status=200;const req={params,body,user:{companyId:'c',id:'owner',role:'OWNER',fullName:'Fixture owner'}};const res={json:value=>{result=value},status:value=>(status=value,res)};await handler(req,res,e=>failure=e);return {result,failure,status};}

test('native actual approval/order-finalization paths serialize to one stock posting and retain the control store', {skip:!isolatedInvoiceDb()},async()=>{
 for(const first of ['order','document','race']){const f=await invoiceDbFixture();try{
  await f.seed({posLines:1});const preview=await common.previewInvoiceReconciliation(f.db,scope);await f.db.$transaction(tx=>common.reconcileInvoiceDrafts(tx,scope,confirmed(preview)));
  await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseDocumentLine"("id","purchaseDocumentId","productId","description","quantity","unit","unitCost","netAmount","vatRate","vatAmount","grossAmount") VALUES('dl','d-pos','p','Fixture',3,'PIECE',1,3,13,.39,3.39)`);
  const {applyPackStockCorrectionInTransaction}=await invoicePackPostingFixture(f.db);
  await installPurchaseAlertFixture(f.db);
  const orders=await actualHandlers('../src/routes/purchase-order-posting-guard.js',f.db,{applyPackStockCorrectionInTransaction}),docs=await actualHandlers('../src/routes/commerce-invoice-draft-approval.js',f.db);
  const order=()=>invoke(orders['PATCH /:orderId'],{orderId:'pos'},{status:'FINAL'}),document=()=>invoke(docs['POST /purchases/:documentId/approve'],{documentId:'d-pos'});
  if(first==='race'){
   const [review,approval]=await Promise.all([order(),document()]);
   assert.ifError(review.failure);
   if(review.result.awaitingInvoice)assert.equal(approval.failure?.code,'INVOICE_AWAITING_OWNER_POSTING');
   else assert.ok(approval.result);
  }else if(first==='order'){
   assert.equal((await order()).result.awaitingInvoice,true);
   assert.equal((await document()).failure?.code,'INVOICE_AWAITING_OWNER_POSTING');
  }else{
   assert.ifError((await document()).failure);
   const retry=await order();
   assert.equal(retry.result.idempotent,true);
  }
  if(first!=='document'){
   const status=(await f.db.$queryRaw`SELECT "awaitingInvoice" FROM "PurchaseOrder" WHERE "id"='pos'`)[0];
   if(status.awaitingInvoice)assert.ifError((await invoke(orders['PATCH /:orderId'],{orderId:'pos'},{status:'INVOICED'})).failure);
  }
  const stocks=await f.db.$queryRawUnsafe('SELECT "storeId","currentStock" FROM "StoreProduct" ORDER BY "storeId"');assert.deepEqual(stocks.map(s=>[s.storeId,Number(s.currentStock)]),[['control',20],['s',13]]);
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM "StockMovement"'))[0].count,1);assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM "InvoiceStockPosting"'))[0].count,1);
  const alias=await invoke(orders['PATCH /:orderId'],{orderId:'mydata'},{status:'FINAL'});assert.ok(alias.failure?.status===409||alias.status===409);assert.ok(alias.failure?.message||alias.result?.error);assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM "StockMovement"'))[0].count,1);
 }finally{await f.close()}}
});

test('native mismatched inbound blocks new POS headers before payment and active duplicate drafts block stock before reconciliation', {skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{await f.seed({wrong:true});const before=await f.snapshot();
  await assert.rejects(common.assertNoUnresolvedInbound(f.db,{companyId:'c',storeId:'s',supplierTaxId:'099999999',documentNumber:'21-1AA 006836',documentDate:'2023-10-12',totalGross:5.39}));
  await common.assertNoUnresolvedInbound(f.db,{companyId:'c',storeId:'s',supplierTaxId:'099999999',documentNumber:'21-ΤΔΑ006836',documentDate:'2026-10-12',totalGross:3.39});
  await assert.rejects(f.db.$transaction(tx=>common.assertInvoiceStockAvailable(tx,{companyId:'c',storeId:'s',sourceDocumentId:'d-pos',orderId:'pos'})),/δύο ενεργά πρόχειρα/);assert.equal(await f.snapshot(),before);
 }finally{await f.close()}
});

test('native legacy posting remains canonical and rejects a second source-document approval after merging its unposted duplicate',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed();await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "status"='FINAL' WHERE "id"='pos'`);
  await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseOrderPosting"("orderId","companyId","purchaseDocumentId") VALUES('pos','c','approved-pos')`);
  const before=await f.snapshot(),preview=await common.previewInvoiceReconciliation(f.db,scope);
  const result=await f.db.$transaction(tx=>common.reconcileInvoiceDrafts(tx,scope,confirmed(preview)));assert.equal(result.orderId,'pos');assert.equal(await f.snapshot(),before);
  await assert.rejects(f.db.$transaction(tx=>common.assertInvoiceStockAvailable(tx,{companyId:'c',storeId:'s',sourceDocumentId:'d-pos',orderId:'pos'})),e=>e.code==='INVOICE_ALREADY_POSTED');
  assert.equal(await f.snapshot(),before);
 }finally{await f.close()}
});

test('native deliberately deleted original draft is never resurrected by automatic or manual matching',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed();await f.db.$executeRawUnsafe(`DELETE FROM "PurchaseOrder" WHERE "id"='mydata'`);await f.db.$executeRawUnsafe(`DELETE FROM "PurchaseDocument" WHERE "id"='d-mydata'`);
  const before=await f.snapshot(),preview=await common.previewInvoiceReconciliation(f.db,scope);
  await assert.rejects(f.db.$transaction(tx=>common.attachInboundToExistingDraft(tx,scope,'owner')),/διαγραφεί/);
  await assert.rejects(f.db.$transaction(tx=>common.reconcileInvoiceDrafts(tx,scope,confirmed(preview))),/διαγραφεί/);
  assert.equal(await f.snapshot(),before);assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM "PurchaseOrder"'))[0].count,1);
 }finally{await f.close()}
});
