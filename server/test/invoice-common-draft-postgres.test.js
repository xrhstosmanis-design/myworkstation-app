import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {readFile} from "node:fs/promises";
import {z} from "zod";
import {invoiceDbFixture,isolatedInvoiceDb} from "./helpers/invoice-common-draft-fixture.js";
import * as common from "../src/lib/invoice-common-draft.js";
import {loadInvoiceAssistantSource} from "../src/lib/invoice-assistant-source.js";
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

test('native POS-first reuses its padded-number draft; myDATA-first race binds stored POS pages to original draft with no new order', {skip:!isolatedInvoiceDb()},async()=>{
 for(const first of ['pos','mydata']){const f=await invoiceDbFixture();try{
  await f.seed({pos:first==='pos',mydata:first==='mydata'});const before=await f.snapshot();
  if(first==='pos'){
   const result=await f.db.$transaction(tx=>common.attachInboundToExistingDraft(tx,scope,'owner'));assert.equal(result.purchaseOrderId,'pos');
  }else{
   const result=await f.db.$transaction(async tx=>{await common.lockInvoiceStore(tx,'c','s');return common.reuseInboundDraftForPosJob(tx,{companyId:'c',storeId:'s',supplierTaxId:'099999999',documentNumber:'21-ΤΔΑ 006836',documentDate:'2026-10-12',totalGross:3.39,documentType:'INVOICE'},{jobId:'j-pos',paymentTransactionId:'payment'})});assert.equal(result.orderId,'mydata');
  }
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM "PurchaseOrder"'))[0].count,1);assert.equal(await f.snapshot(),before);
  const target=first==='pos'?'pos':'mydata';const source=await loadInvoiceAssistantSource(f.db,'c',target);assert.equal(source.pages[0].filename,'POS.jpg');assert.equal((await loadInvoiceAssistantSource(f.db,'c',target,{inboxId:'inbox',storeId:'s'})).pages[0].filename,'original.pdf');
 }finally{await f.close()}}
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

async function actualHandlers(path,db){
 const handlers={};const router={use:()=>{},get:()=>{},post:(p,...f)=>handlers['POST '+p]=f.at(-1),patch:(p,...f)=>handlers['PATCH '+p]=f.at(-1),delete:()=>{}};
 const deps={Router:()=>router,z,crypto,prisma:db,requireCompanyModule:()=>()=>{},...common};
 const src=(await readFile(new URL(path,import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export default router;','return router;');new Function(...Object.keys(deps),src)(...Object.values(deps));return handlers;
}
async function invoke(handler,params,body={}){let result,failure,status=200;const req={params,body,user:{companyId:'c',id:'owner',role:'OWNER',fullName:'Fixture owner'}};const res={json:value=>{result=value},status:value=>(status=value,res)};await handler(req,res,e=>failure=e);return {result,failure,status};}

test('native actual approval/order-finalization paths serialize to one stock posting and retain the control store', {skip:!isolatedInvoiceDb()},async()=>{
 for(const first of ['order','document','race']){const f=await invoiceDbFixture();try{
  await f.seed({posLines:1});const preview=await common.previewInvoiceReconciliation(f.db,scope);await f.db.$transaction(tx=>common.reconcileInvoiceDrafts(tx,scope,confirmed(preview)));
  await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseDocumentLine"("id","purchaseDocumentId","productId","description","quantity","unit","unitCost","netAmount","vatRate","vatAmount","grossAmount") VALUES('dl','d-pos','p','Fixture',3,'PIECE',1,3,13,.39,3.39)`);
  const orders=await actualHandlers('../src/routes/purchase-order-posting-guard.js',f.db),docs=await actualHandlers('../src/routes/commerce-invoice-draft-approval.js',f.db);
  const order=()=>invoke(orders['PATCH /:orderId'],{orderId:'pos'},{status:'FINAL'}),document=()=>invoke(docs['POST /purchases/:documentId/approve'],{documentId:'d-pos'});
  if(first==='race'){const results=await Promise.all([order(),document()]);assert.ok(results.some(r=>r.result));assert.ok(results.every(r=>!r.failure||r.failure.code==='INVOICE_ALREADY_POSTED'));}
  else {const result=await(first==='order'?order():document());assert.ifError(result.failure);assert.ok(result.result);const second=await(first==='order'?document():order());if(first==='order')assert.equal(second.failure?.code,'INVOICE_ALREADY_POSTED');else assert.equal(second.result.idempotent,true);}
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
