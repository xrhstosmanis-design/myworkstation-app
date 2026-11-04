import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
import {applySupplierCreditCash} from '../src/lib/supplier-credit-cash.js';
import {previewInvoiceReconciliation,reconcileInvoiceDrafts} from '../src/lib/invoice-common-draft.js';
const scope={companyId:'c',storeId:'s',inboxId:'inbox'};
async function fixture(mode='OFFSET'){
 const f=await invoiceDbFixture();await f.seed({payment:false,posLines:1,mydataLines:1});
 for(const sql of [
 'CREATE TABLE "CashShiftSession"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"status" text,"terminalPos" text,"openedAt" timestamptz DEFAULT NOW())',
 'CREATE TABLE "StoreOperatorAudit"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb,"createdAt" timestamptz DEFAULT NOW())',
 'CREATE TABLE "SupplierPaymentSettlement"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"transactionId" text,"supplierId" text,"status" text)',
 'CREATE TABLE "SupplierPaymentAllocation"("id" text PRIMARY KEY,"companyId" text,"settlementId" text,"purchaseDocumentId" text,"amount" numeric)',
 'ALTER TABLE "StoreTransaction" ADD COLUMN "sessionId" text,ADD COLUMN "subtractFromShift" boolean,ADD COLUMN "paymentMethod" text,ADD COLUMN "actorId" text,ADD COLUMN "actorName" text,ADD COLUMN "supplierName" text,ADD COLUMN "attachmentMimeType" text'
 ])await f.db.$executeRawUnsafe(sql);
 await f.db.$executeRawUnsafe(`INSERT INTO "CashShiftSession"("id","companyId","storeId","status","terminalPos") VALUES('shift','c','s','OPEN','MAIN')`);
 for(const sql of [`UPDATE "PurchaseDocument" SET "documentType"='CREDIT_NOTE',"documentNumber"='CN 0040'`,`UPDATE "PurchaseOrder" SET "invoiceNumber"='CN 0040'`,`UPDATE "MyDataInboundDocument" SET "series"='CN',"documentNumber"='40',"invoiceType"='5.1'`])await f.db.$executeRawUnsafe(sql);
 await f.db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","invoiceDocumentNumber","sessionId","subtractFromShift","paymentMethod","actorId") VALUES('positive','c','s','sup','SUPPLIER_PAYMENT',50,'INV 123','shift',true,'CASH_SHIFT','operator')`);
 await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument"("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalGross","status","paymentTransactionId") VALUES('original-invoice','c','s','sup','INVOICE','INV 123','2026-10-12',50,'DRAFT','positive')`);
 const d=(await f.db.$queryRawUnsafe(`SELECT "updatedAt",md5(row_to_json(d)::text) AS version FROM "PurchaseDocument" d WHERE "id"='d-mydata'`))[0];
 f.cashScope={companyId:'c',storeId:'s',terminalPos:'MAIN',user:{companyId:'c',id:'operator',fullName:'Original operator',role:'OWNER'}};
 f.input={type:'SUPPLIER_PAYMENT',paymentSource:'CASH_SHIFT',supplierId:'sup',creditDocumentId:'d-mydata',mode,invoicePaymentId:mode==='OFFSET'?'positive':null,expectedCreditAmount:3.39,expectedCreditUpdatedAt:d.updatedAt.toISOString(),expectedCreditVersion:d.version,expectedPaymentAmount:mode==='OFFSET'?50:null,expectedAppliedAmount:0,confirmOriginal:true,reason:'Synthetic original credit confirmed',idempotencyKey:crypto.randomUUID()};
 f.applied=await applySupplierCreditCash(f.db,f.cashScope,f.input);
 f.protected=async()=>{const data={};for(const table of ['StoreTransaction','StoreOperatorAudit','SupplierPaymentSettlement','SupplierPaymentAllocation','StoreProduct','StockMovement','DocumentAttachment'])data[table]=await f.db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY row_to_json(t)::text`);data.credit=await f.db.$queryRawUnsafe(`SELECT row_to_json(d) AS row FROM "PurchaseDocument" d WHERE "id"='d-mydata'`);data.lines=await f.db.$queryRawUnsafe(`SELECT row_to_json(l) AS row FROM "PurchaseOrderLine" l ORDER BY l."id"`);return data};return f;
}
const args=p=>({posOrderId:'pos',expectedVersion:p.version,confirmSameInvoice:true,confirmMark:p.mark,selectedRowsOrderId:'mydata',reason:'Compared original credit note and all rows',actorId:'reviewer'});
test('native actual OFFSET and CASH_RETURN retain original credit identity, one signed payment and writer replay after reviewed consolidation',{skip:!isolatedInvoiceDb()},async()=>{
 for(const mode of ['OFFSET','CASH_RETURN']){const f=await fixture(mode);try{
  const before=await f.protected(),preview=await previewInvoiceReconciliation(f.db,scope);assert.equal(preview.documentType,'CREDIT_NOTE');assert.equal(preview.orders.find(o=>o.isMyData).creditPaymentVerified,true);
  const results=await Promise.all([0,1].map(()=>f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,args(preview)),{timeout:20000})));
  assert.equal(results.filter(r=>!r.reused).length,1);assert.equal(results[0].orderId,'mydata');assert.equal(results[0].paymentDifference??0,0);assert.deepEqual(await f.protected(),before);
  const repeated=await applySupplierCreditCash(f.db,f.cashScope,f.input);assert.equal(repeated.duplicate,true);assert.equal(repeated.transactionId,f.applied.transactionId);assert.deepEqual(await f.protected(),before);
  const p=await previewInvoiceReconciliation(f.db,scope);assert.equal(p.commonDraft.orderId,'mydata');assert.equal(p.commonDraft.paymentTransactionId,f.applied.transactionId);
 }finally{await f.close()}}
});
test('native additional third credit retains flat aliases, original rows/audit/cash and rejects canonical replacement',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();try{
  let preview=await previewInvoiceReconciliation(f.db,scope);const before=await f.protected();
  await assert.rejects(f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,{...args(preview),selectedRowsOrderId:'pos'})),e=>e.code==='INVOICE_CREDIT_CANONICAL_CHANGE');assert.deepEqual(await f.protected(),before);
  await f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,args(preview)));
  await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" SELECT 'd-third',"companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalNet","totalVat","totalGross",'DRAFT',"sourceType",'third',NULL,'CREDIT',"createdByUserId","updatedAt" FROM "PurchaseDocument" WHERE "id"='d-mydata'`);
  await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseOrder"("id","companyId","storeId","supplierId","status","invoiceNumber","sourceType","sourceDocumentId") VALUES('third','c','s','sup','NEW','CN 00040','POS_OCR_DRAFT','d-third')`);
  preview=await previewInvoiceReconciliation(f.db,scope);const protectedBefore=await f.protected();
  const result=await f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,{...args(preview),posOrderId:'third'}));assert.equal(result.orderId,'mydata');assert.deepEqual(result.aliasOrderIds,['pos','third']);assert.deepEqual(await f.protected(),protectedBefore);
 }finally{await f.close()}
});
test('native changed audit and reversed original offset invalidate preview without merging or changing cash',{skip:!isolatedInvoiceDb()},async()=>{
 for(const changed of ['audit','positive']){const f=await fixture();try{
  const preview=await previewInvoiceReconciliation(f.db,scope);
  if(changed==='audit')await f.db.$executeRawUnsafe(`UPDATE "StoreOperatorAudit" SET "details"="details"||'{"reason":"new stored evidence"}'::jsonb`);
  else await f.db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "reversedAt"=NOW() WHERE "id"='positive'`);
  const before=await f.protected();await assert.rejects(f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,args(preview))),e=>e.code==='INVOICE_RECONCILIATION_STALE');assert.deepEqual(await f.protected(),before);
  assert.equal((await f.db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "InvoiceDraftAlias"`))[0].n,0);
 }finally{await f.close()}}
});

// The only new exception is a series-only OCR error on an additional unpaid
// credit. Use the real credit writer and real PostgreSQL family/row locks.
async function seriesFixture(mode='OFFSET',withRows=true){
 const f=await fixture(mode);
 try{
  const first=await previewInvoiceReconciliation(f.db,scope);
  await f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,args(first)));
  await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument"("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalGross","status","sourceType","purchaseOrderId","settlementMode") VALUES('d-third','c','s','sup','CREDIT_NOTE','OCR 00040','2026-10-12',3.39,'DRAFT','POS_OCR_DRAFT','third','CREDIT')`);
  await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseOrder"("id","companyId","storeId","supplierId","status","invoiceNumber","sourceType","sourceDocumentId") VALUES('third','c','s','sup','NEW','OCR 00040','POS_OCR_DRAFT','d-third')`);
  if(withRows)await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseOrderLine"("id","orderId","productId","description","quantity","netAmount","vatAmount","grossAmount") VALUES('line-third','third','p','Unpaid copy retained in history',3,3,.39,3.39)`);
  await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseDocumentLine"("id","purchaseDocumentId","productId","description","quantity","netAmount","vatAmount","grossAmount") VALUES('doc-line-root','d-mydata','p','Original credit row',3,3,.39,3.39)`);
  if(withRows)await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseDocumentLine"("id","purchaseDocumentId","productId","description","quantity","netAmount","vatAmount","grossAmount") VALUES('doc-line-third','d-third','p','Historical extra row',3,3,.39,3.39)`);
  await f.db.$executeRawUnsafe(`INSERT INTO "DocumentAttachment" VALUES('third-photo','c','s','third.jpg','image/jpeg','data:image/jpeg;base64,cGhvdG8=','third-hash')`);
  await f.db.$executeRawUnsafe(`INSERT INTO "AiReaderJob"("id","companyId","storeId","purchaseDocumentId","attachmentId") VALUES('j-third','c','s','d-third','third-photo')`);
  f.seriesProtected=async()=>({
   ...await f.protected(),
   canonicalOrder:await f.db.$queryRawUnsafe(`SELECT row_to_json(o) AS row FROM "PurchaseOrder" o WHERE "id"='mydata'`),
   originalInvoice:await f.db.$queryRawUnsafe(`SELECT row_to_json(d) AS row FROM "PurchaseDocument" d WHERE "id"='original-invoice'`),
   documentLines:await f.db.$queryRawUnsafe(`SELECT row_to_json(l) AS row FROM "PurchaseDocumentLine" l ORDER BY "id"`),
   previousAlias:await f.db.$queryRawUnsafe(`SELECT row_to_json(a) AS row FROM "InvoiceDraftAlias" a WHERE "aliasOrderId"='pos'`),
   shift:await f.db.$queryRawUnsafe(`SELECT row_to_json(s) AS row FROM "CashShiftSession" s ORDER BY "id"`)
  });
  f.allState=async()=>{
   const data={};for(const table of ['PurchaseOrder','PurchaseDocument','PurchaseOrderLine','PurchaseDocumentLine','InvoiceDraftAlias','MyDataInboundDocument','AiReaderJob','DocumentInbox','DocumentAttachment','StoreTransaction','StoreOperatorAudit','SupplierPaymentSettlement','SupplierPaymentAllocation','CashShiftSession','StoreProduct','StockMovement','PurchaseOrderPosting','InvoiceStockPosting'])data[table]=await f.db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY row_to_json(t)::text`);
   return data;
  };
  return f;
 }catch(e){await f.close();throw e}
}
const seriesArgs=p=>({...args(p),posOrderId:'third',confirmHeaderCorrection:true});
for(const mode of ['OFFSET','CASH_RETURN'])test(`native reviewed series-only third ${mode} retains original credit, rows, files, audit and replay`,{skip:!isolatedInvoiceDb()},async()=>{
 for(const withRows of [true,false]){const f=await seriesFixture(mode,withRows);try{
  const p=await previewInvoiceReconciliation(f.db,scope),extra=p.orders.find(o=>o.orderId==='third');
  assert.equal(p.additionalCreditSeriesReviewSupported,true);assert.equal(extra.headerReviewRequired,true);assert.equal(extra.additionalCreditSeriesReviewEligible,true);
  const baseline=await f.allState();
  await assert.rejects(f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,{...seriesArgs(p),selectedRowsOrderId:null})),e=>e.code==='INVOICE_CREDIT_REVIEW_REQUIRED');
  assert.deepEqual(await f.allState(),baseline,'explicit root-table selection is mandatory even with no extra rows');
  const before=await f.seriesProtected();
  const results=await Promise.all([0,1].map(()=>f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,seriesArgs(p)),{timeout:20000})));
  assert.equal(results.filter(r=>r.reused===false).length,1);assert.equal(results.filter(r=>r.reused===true).length,1);
  assert.ok(results.every(r=>r.orderId==='mydata'&&r.documentId==='d-mydata'&&r.paymentChanged===false&&r.stockUpdated===false));
  assert.deepEqual(await f.seriesProtected(),before);
  const aliases=await f.db.$queryRawUnsafe(`SELECT * FROM "InvoiceDraftAlias" ORDER BY "aliasOrderId"`);
  assert.deepEqual(aliases.map(a=>a.aliasOrderId),['pos','third']);assert.ok(aliases.every(a=>a.canonicalOrderId==='mydata'&&a.canonicalDocumentId==='d-mydata'));
  const audit=aliases.find(a=>a.aliasOrderId==='third').details;
  assert.equal(audit.reviewedAdditionalCreditSeries,true);assert.equal(audit.selectedRowsOrderId,'mydata');assert.equal(audit.paymentTransactionId,f.applied.transactionId);
  const open=await f.db.$queryRawUnsafe(`SELECT "id" FROM "PurchaseOrder" WHERE "id" IN ('pos','mydata','third') AND "status"='NEW' ORDER BY "id"`);assert.deepEqual(open,[{id:'mydata'}]);
  const after=await f.allState();
  for(const table of ['PurchaseOrder','PurchaseDocument']){
   const id=table==='PurchaseOrder'?'third':'d-third',old=baseline[table].find(x=>x.row.id===id).row,now=after[table].find(x=>x.row.id===id).row;
   assert.equal(now.status,'MERGED');const {status:oldStatus,updatedAt:oldTime,...oldData}=old,{status:newStatus,updatedAt:newTime,...newData}=now;assert.deepEqual(newData,oldData,'extra identity/header/payment fields stay historical');
  }
  const repeated=await applySupplierCreditCash(f.db,f.cashScope,f.input);assert.equal(repeated.duplicate,true);assert.equal(repeated.transactionId,f.applied.transactionId);
  assert.deepEqual(await f.allState(),after,'retry does not create money or additional merge state');
 }finally{await f.close()}}
});
test('native series-only continuation refuses missing confirmations and every non-series/paid/foreign/posted variant without writes',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await seriesFixture();try{
  const valid=await previewInvoiceReconciliation(f.db,scope),before=await f.allState();
  for(const patch of [{confirmHeaderCorrection:false},{confirmHeaderCorrection:'true'},{confirmSameInvoice:false},{confirmMark:'wrong'},{reason:'short'},{expectedVersion:null},{expectedVersion:'old'},{automatic:true},{selectedRowsOrderId:'third'}]){
   await assert.rejects(f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,{...seriesArgs(valid),...patch})));assert.deepEqual(await f.allState(),before);
  }
  const variants=[
   `UPDATE "PurchaseDocument" SET "documentDate"='2026-10-13' WHERE "id"='d-third'`,
   `UPDATE "PurchaseDocument" SET "totalGross"=3.40 WHERE "id"='d-third'`,
   `UPDATE "PurchaseDocument" SET "totalGross"=8 WHERE "id"='d-third'`,
   `UPDATE "PurchaseDocument" SET "documentNumber"='OCR 41' WHERE "id"='d-third'`,
   `UPDATE "PurchaseOrder" SET "invoiceNumber"='OTHER 40' WHERE "id"='third'`,
   `UPDATE "PurchaseDocument" SET "documentType"='INVOICE' WHERE "id"='d-third'`,
   `UPDATE "PurchaseDocument" SET "supplierId"='other' WHERE "id"='d-third'`,
   `UPDATE "PurchaseDocument" SET "settlementMode"='PAID' WHERE "id"='d-third'`,
   `UPDATE "PurchaseDocument" SET "paymentTransactionId"=(SELECT "paymentTransactionId" FROM "PurchaseDocument" WHERE "id"='d-mydata') WHERE "id"='d-third'`,
   `UPDATE "PurchaseDocument" SET "status"='APPROVED' WHERE "id"='d-third'`,
   `UPDATE "PurchaseOrder" SET "status"='FINAL' WHERE "id"='third'`,
   `UPDATE "PurchaseOrder" SET "storeId"='control' WHERE "id"='third'`,
   `UPDATE "PurchaseOrder" SET "companyId"='foreign' WHERE "id"='third'`,
   `UPDATE "InvoiceDraftAlias" SET "canonicalDocumentId"='drift' WHERE "aliasOrderId"='pos'`,
   `UPDATE "StoreTransaction" SET "reversedAt"=NOW() WHERE "id"='positive'`
  ];
  // Each deliberate fixture corruption is rolled back after proving that
  // the refused merge itself left the corrupted baseline unchanged.
  for(const sql of variants){
   await assert.rejects(f.db.$transaction(async tx=>{
    await tx.$executeRawUnsafe(sql);
    const snapshot=async()=>{const data={};for(const table of Object.keys(before))data[table]=await tx.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY row_to_json(t)::text`);return data};
    const baseline=await snapshot(),preview=await previewInvoiceReconciliation(tx,scope);
    if(!sql.includes('InvoiceDraftAlias'))assert.notEqual(preview.orders.find(o=>o.orderId==='third')?.additionalCreditSeriesReviewEligible,true,sql);
    await assert.rejects(reconcileInvoiceDrafts(tx,scope,{...seriesArgs(preview),additionalCreditSeriesReviewEligible:true}),undefined,sql);
    assert.deepEqual(await snapshot(),baseline,sql);throw Object.assign(new Error('rollback synthetic variant'),{syntheticRollback:true});
   },{timeout:20000}),e=>e.syntheticRollback===true);
   assert.deepEqual(await f.allState(),before);
  }
 }finally{await f.close()}
});
test('native series preview becomes stale when the original applied-credit proof changes',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await seriesFixture();try{
  const p=await previewInvoiceReconciliation(f.db,scope);
  await f.db.$executeRawUnsafe(`UPDATE "StoreOperatorAudit" SET "details"="details"||'{"reason":"different stored proof"}'::jsonb WHERE "eventType"='SUPPLIER_CREDIT_CASH_APPLIED'`);
  const before=await f.allState();await assert.rejects(f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,seriesArgs(p))),e=>e.code==='INVOICE_RECONCILIATION_STALE');
  assert.deepEqual(await f.allState(),before);
 }finally{await f.close()}
});
