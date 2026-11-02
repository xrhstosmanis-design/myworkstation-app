import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
import {previewInvoiceReconciliation,reconcileInvoiceDrafts,invoiceAlias} from '../src/lib/invoice-common-draft.js';
import {attachMyDataPosReceipt} from '../src/lib/mydata-pos-receipt.js';

const scope={companyId:'c',storeId:'s',inboxId:'inbox'},native={skip:!isolatedInvoiceDb()};
const confirmation=(preview,posOrderId='pos',extra={})=>({posOrderId,expectedVersion:preview.version,confirmSameInvoice:true,confirmMark:preview.mark,confirmHeaderCorrection:true,confirmPaymentDiscrepancy:true,reason:'Synthetic originals compared and stable table verified',actorId:'synthetic-owner',...extra});
async function rows(f,table){return f.db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY row_to_json(t)::text`)}
async function all(f){const out={};for(const table of ['PurchaseOrder','PurchaseDocument','PurchaseOrderLine','PurchaseDocumentLine','DocumentAttachment','DocumentInbox','AiReaderJob','MyDataInboundDocument','InvoiceDraftAlias','PurchaseOrderPosting','InvoiceStockPosting'])out[table]=await rows(f,table);out.moneyStock=await f.snapshot();return JSON.stringify(out)}
async function protectedState(f){
 const out={moneyStock:await f.snapshot()};
 for(const table of ['PurchaseOrderLine','PurchaseDocumentLine','DocumentAttachment'])out[table]=await rows(f,table);
 out.rootOrder=await f.db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "PurchaseOrder" t WHERE "id"='pos'`);
 out.rootDocument=await f.db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "PurchaseDocument" t WHERE "id"='d-pos'`);
 out.firstAlias=await f.db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "InvoiceDraftAlias" t WHERE "aliasOrderId"='mydata'`);
 out.originals=await f.db.$queryRawUnsafe(`SELECT "id","attachmentId","createdAt" FROM "AiReaderJob" ORDER BY "id"`);
 return JSON.stringify(out);
}
async function addMember(f,id='third',{lines=true,payment=null}={}){
 const documentId='d-'+id,attachmentId='photo-'+id,jobId='j-'+id;
 await f.db.$executeRaw`INSERT INTO "PurchaseDocument"("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalGross","status","sourceType","purchaseOrderId","paymentTransactionId","settlementMode") VALUES(${documentId},'c','s','sup','INVOICE','21-ΤΔΑ 0006836',${new Date('2026-10-12')},3.39,'DRAFT','POS_OCR_DRAFT',${id},${payment},'CREDIT')`;
 await f.db.$executeRaw`INSERT INTO "PurchaseOrder"("id","companyId","storeId","supplierId","status","invoiceNumber","description","sourceType","sourceDocumentId") VALUES(${id},'c','s','sup','NEW','21-ΤΔΑ 0006836','Synthetic additional source','POS_OCR_DRAFT',${documentId})`;
 if(lines)await f.db.$executeRaw`INSERT INTO "PurchaseOrderLine"("id","orderId","productId","description","quantity","unitCost","netAmount","vatRate","vatAmount","grossAmount") VALUES(${'line-'+id},${id},'p','Historical additional printed row',3,1,3,13,.39,3.39)`;
 await f.db.$executeRaw`INSERT INTO "DocumentAttachment"("id","companyId","storeId","filename","mimeType","contentData","checksum") VALUES(${attachmentId},'c','s',${id+'.jpg'},'image/jpeg','data:image/jpeg;base64,cGhvdG8=',${id+'-hash'})`;
 await f.db.$executeRaw`INSERT INTO "AiReaderJob"("id","companyId","storeId","purchaseDocumentId","attachmentId","createdAt","resultJson") VALUES(${jobId},'c','s',${documentId},${attachmentId},${new Date('2026-10-12T05:00:00Z')},'{}')`;
}
async function completedPair(f,{rootLines=true,payment=true,posFirst=false}={}){
 await f.seed({posLines:rootLines?1:0,payment});
 if(posFirst)await f.db.$executeRawUnsafe(`UPDATE "AiReaderJob" SET "createdAt"='2026-10-12T04:00:00Z' WHERE "id"='j-pos'`);
 const preview=await previewInvoiceReconciliation(f.db,scope);
 await f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,confirmation(preview)));
}
async function continueMember(f,id='third',extra={}){
 const preview=await previewInvoiceReconciliation(f.db,scope);
 return f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,confirmation(preview,id,{selectedRowsOrderId:'pos',...extra})));
}

test('native reviewed third member retains one stable root, both flat aliases and every original/row/payment/stock source',native,async()=>{
 const f=await invoiceDbFixture();try{
  await completedPair(f);await addMember(f);const before=await protectedState(f);
  const result=await continueMember(f);assert.equal(result.orderId,'pos');assert.equal(result.documentId,'d-pos');assert.equal(result.reused,false);assert.equal(result.paymentChanged,false);assert.equal(result.stockUpdated,false);assert.deepEqual(result.aliasOrderIds,['mydata','third']);
  assert.equal(await protectedState(f),before,'canonical table/header/payment, first alias history, original files/jobs and all source rows are unchanged');
  for(const id of ['mydata','third']){const alias=await invoiceAlias(f.db,'c',{orderId:id});assert.equal(alias.canonicalOrderId,'pos');assert.equal(alias.canonicalDocumentId,'d-pos');}
  const orders=await f.db.$queryRawUnsafe(`SELECT "id","status" FROM "PurchaseOrder" ORDER BY "id"`);assert.deepEqual(orders,[{id:'mydata',status:'MERGED'},{id:'pos',status:'NEW'},{id:'third',status:'MERGED'}]);
  const after=await previewInvoiceReconciliation(f.db,scope);assert.equal(after.additionalDraftReviewSupported,true);assert.deepEqual(after.commonDraft.aliasOrderIds,['mydata','third']);assert.equal(after.orders.length,1);assert.equal(after.files.length,3);
  const jobs=await f.db.$queryRawUnsafe(`SELECT "purchaseDocumentId","resultJson" FROM "AiReaderJob"`);for(const job of jobs){assert.equal(job.purchaseDocumentId,'d-pos');assert.deepEqual(job.resultJson.commonDraft.aliasOrderIds,['mydata','third']);}
  const state=await all(f),replay=await f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,confirmation(after,'third',{expectedVersion:'0'.repeat(64)})));assert.equal(replay.reused,true);assert.equal(replay.orderId,'pos');assert.equal(await all(f),state);
 }finally{await f.close()}
});

test('native same additional member concurrent retries commit one alias; different member stale race refuses the losing action',native,async()=>{
 for(const same of [true,false]){const f=await invoiceDbFixture();try{
  await completedPair(f);await addMember(f);if(!same)await addMember(f,'fourth');const before=await protectedState(f),preview=await previewInvoiceReconciliation(f.db,scope);
  const results=await Promise.allSettled(['third',same?'third':'fourth'].map(id=>f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,confirmation(preview,id,{selectedRowsOrderId:'pos'})),{timeout:20000})));
  if(same){assert.equal(results.filter(r=>r.status==='fulfilled').length,2);assert.equal(results.filter(r=>r.status==='fulfilled'&&!r.value.reused).length,1)}
  else{assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'INVOICE_RECONCILIATION_STALE')}
  assert.equal((await f.db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "InvoiceDraftAlias"`))[0].n,2);assert.equal(await protectedState(f),before);
 }finally{await f.close()}}
});

test('native continuation rejects alternate table, populated-to-empty root, automatic mode and stale line versions without writes',native,async()=>{
 for(const scenario of ['other-table','empty-root','empty-root-doc-lines','automatic','missing-version','stale']){const f=await invoiceDbFixture();try{
  await completedPair(f,{rootLines:!scenario.startsWith('empty-root')});await addMember(f,'third',{lines:scenario!=='empty-root-doc-lines'});
  if(scenario==='empty-root-doc-lines')await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseDocumentLine"("id","purchaseDocumentId","description","quantity","unitCost","netAmount","vatRate","vatAmount","grossAmount") VALUES('document-third-row','d-third','Historical document-only row',3,1,3,13,.39,3.39)`);
  const preview=await previewInvoiceReconciliation(f.db,scope);
  if(scenario==='stale')await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrderLine" SET "description"='Changed after preview' WHERE "orderId"='third'`);
  const before=await all(f),extra=scenario==='other-table'?{selectedRowsOrderId:'third'}:scenario==='automatic'?{automatic:true}:scenario==='missing-version'?{expectedVersion:null}:{};
  const args=confirmation(preview,'third',{selectedRowsOrderId:scenario.startsWith('empty-root')?null:'pos',...extra});
  await assert.rejects(f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,args)),e=>e.status===409);assert.equal(await all(f),before,scenario);
 }finally{await f.close()}}
});

test('native continuation rejects finalized/approved/posted families and extra-only payment linkage with all records unchanged',native,async()=>{
 const mutations=[
  `UPDATE "PurchaseOrder" SET "status"='FINAL' WHERE "id"='pos'`,
  `UPDATE "PurchaseDocument" SET "status"='APPROVED' WHERE "id"='d-pos'`,
  `UPDATE "PurchaseOrder" SET "status"='FINAL' WHERE "id"='third'`,
  `INSERT INTO "PurchaseOrderPosting"("orderId","companyId","purchaseDocumentId") VALUES('pos','c','d-pos')`,
  `INSERT INTO "InvoiceStockPosting"("companyId","sourceDocumentId","storeId","orderId","postedDocumentId","path") VALUES('c','d-pos','s','pos','d-pos','synthetic')`
 ];
 for(const mutation of mutations){const f=await invoiceDbFixture();try{
  await completedPair(f);await addMember(f);await f.db.$executeRawUnsafe(mutation);const before=await all(f);await assert.rejects(continueMember(f),e=>e.status===409);assert.equal(await all(f),before);
 }finally{await f.close()}}
 const f=await invoiceDbFixture();try{
  await completedPair(f,{payment:false});
  await f.db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","invoiceDocumentNumber") VALUES('extra-payment','c','s','sup','SUPPLIER_PAYMENT',3.39,'21-ΤΔΑ 6836')`);
  await addMember(f,'third',{payment:'extra-payment'});const before=await all(f);
  await assert.rejects(continueMember(f),e=>e.code==='INVOICE_COMMON_CONTINUATION_PAYMENT');assert.equal(await all(f),before);
 }finally{await f.close()}
});

test('native continuation rejects contradictory/missing family metadata and root aliases; protected pair audit is never rewritten',native,async()=>{
 const mutations=[
  `UPDATE "MyDataInboundDocument" SET "rawPayload"=jsonb_set("rawPayload",'{commonDraft,aliasOrderIds}','[]')`,
  `UPDATE "MyDataInboundDocument" SET "rawPayload"=jsonb_set("rawPayload",'{commonDraft,documentId}','"different-root"')`,
  `UPDATE "InvoiceDraftAlias" SET "canonicalOrderId"='third',"canonicalDocumentId"='d-third'`,
  `UPDATE "InvoiceDraftAlias" SET "storeId"='control'`,
  `UPDATE "InvoiceDraftAlias" SET "details"='{}'`,
  `DELETE FROM "InvoiceDraftAlias"`,
  `UPDATE "PurchaseDocument" SET "purchaseOrderId"='third' WHERE "id"='d-pos'`,
  `UPDATE "PurchaseDocument" SET "sourceType"='MANUAL' WHERE "id"='d-pos'`,
  `INSERT INTO "InvoiceDraftAlias"("aliasOrderId","aliasDocumentId","companyId","storeId","canonicalOrderId","canonicalDocumentId","inboxId","mark","details") VALUES('pos','d-pos','c','s','third','d-third','inbox','400015624303633','{}')`,
  `UPDATE "PurchaseOrder" SET "status"='NEW' WHERE "id"='mydata'`,
  `INSERT INTO "PurchaseOrderPosting"("orderId","companyId","purchaseDocumentId") VALUES('mydata','c','d-mydata')`
 ];
 for(const mutation of mutations){const f=await invoiceDbFixture();try{
  await completedPair(f);await addMember(f);await f.db.$executeRawUnsafe(mutation);const before=await all(f);await assert.rejects(continueMember(f),e=>e.status===409);assert.equal(await all(f),before,mutation);
 }finally{await f.close()}}
});


test('native completed canonical header drift is not silently accepted or corrected during an additional merge',native,async()=>{
 const mutations=[
  `UPDATE "PurchaseDocument" SET "documentNumber"='OTHER 9922' WHERE "id"='d-pos'`,
  `UPDATE "PurchaseDocument" SET "documentType"='CREDIT_NOTE' WHERE "id"='d-pos'`,
  `UPDATE "PurchaseDocument" SET "documentDate"='2026-10-13' WHERE "id"='d-pos'`,
  `UPDATE "PurchaseDocument" SET "totalGross"=7.88 WHERE "id"='d-pos'`
 ];
 for(const mutation of mutations){const f=await invoiceDbFixture();try{
  await completedPair(f);await addMember(f);await f.db.$executeRawUnsafe(mutation);const before=await all(f);
  await assert.rejects(continueMember(f),e=>e.code==='INVOICE_COMMON_FAMILY_REVIEW_REQUIRED');assert.equal(await all(f),before,mutation);
 }finally{await f.close()}}
});

test('native reviewed wrong-supplier extra preserves established canonical supplier and all financial rows',native,async()=>{
 const f=await invoiceDbFixture();try{
  await completedPair(f);await addMember(f);
  await f.db.$executeRawUnsafe(`INSERT INTO "Supplier"("id","companyId","taxId","name") VALUES('wrong','c','011111111','Synthetic wrong supplier')`);
  await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "supplierId"='wrong' WHERE "id"='third'`);
  await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "supplierId"='wrong' WHERE "id"='d-third'`);
  const before=await protectedState(f),preview=await previewInvoiceReconciliation(f.db,scope);
  assert.equal(preview.orders.find(o=>o.orderId==='third').supplierReviewRequired,true);
  const result=await f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,confirmation(preview,'third',{selectedRowsOrderId:'pos',verifiedSupplierId:'sup',confirmSupplierCorrection:true})));
  assert.equal(result.orderId,'pos');assert.equal(result.paymentChanged,false);assert.equal(await protectedState(f),before);
 }finally{await f.close()}
});

test('native existing myDATA row-table canonical remains stable when another POS member joins',native,async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({posLines:1,mydataLines:1});let preview=await previewInvoiceReconciliation(f.db,scope);
  const first=await f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,confirmation(preview,'pos',{selectedRowsOrderId:'mydata'})));assert.equal(first.orderId,'mydata');
  await addMember(f);const before=await f.snapshot(),lines=JSON.stringify(await rows(f,'PurchaseOrderLine'));
  const root=JSON.stringify(await f.db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "PurchaseDocument" t WHERE "id"='d-mydata'`));
  preview=await previewInvoiceReconciliation(f.db,scope);
  const result=await f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,confirmation(preview,'third',{selectedRowsOrderId:'mydata'})));
  assert.equal(result.orderId,'mydata');assert.deepEqual(result.aliasOrderIds,['pos','third']);assert.equal(await f.snapshot(),before);assert.equal(JSON.stringify(await rows(f,'PurchaseOrderLine')),lines);
  assert.equal(JSON.stringify(await f.db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "PurchaseDocument" t WHERE "id"='d-mydata'`)),root);
  for(const id of ['pos','third'])assert.equal((await invoiceAlias(f.db,'c',{orderId:id})).canonicalOrderId,'mydata');
 }finally{await f.close()}
});


async function firstPaidReceipt(f){
 await completedPair(f,{payment:false,posFirst:true});
 await f.db.$executeRawUnsafe(`CREATE TABLE "SupplierPaymentAllocation"("id" text,"companyId" text,"purchaseDocumentId" text,"settlementId" text)`);
 await f.db.$executeRawUnsafe(`CREATE TABLE "SupplierPaymentSettlement"("id" text,"companyId" text,"transactionId" text,"status" text)`);
 await f.db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","invoiceDocumentNumber") VALUES('first-payment','c','s','sup','SUPPLIER_PAYMENT',3.39,'21-ΤΔΑ 6836')`);
 const identity={companyId:'c',storeId:'s',supplierId:'sup',supplierTaxId:'099999999',documentNumber:'21-ΤΔΑ 6836',documentDate:'2026-10-12',totalGross:3.39,documentType:'INVOICE'};
 const linked=await attachMyDataPosReceipt(f.db,identity,[{checksum:'photo-hash',filename:'POS.jpg',mimeType:'image/jpeg',dataUrl:'data:image/jpeg;base64,cGhvdG8='}],{id:'first-payment'},{id:'synthetic-payer'});
 assert.equal(linked.receiptLinked,true);
}

test('native continuation freezes recorded nonnull payment and prior nonnull alias payment evidence',native,async()=>{
 for(const scenario of ['removed','replaced','alias-conflict']){const f=await invoiceDbFixture();try{
  await completedPair(f);await addMember(f);
  if(scenario==='removed')await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "paymentTransactionId"=NULL WHERE "id"='d-pos'`);
  else{
   await f.db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","invoiceDocumentNumber") VALUES('other-payment','c','s','sup','SUPPLIER_PAYMENT',3.39,'21-ΤΔΑ 6836')`);
   await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "paymentTransactionId"='other-payment' WHERE "id"='d-pos'`);
   if(scenario==='alias-conflict')await f.db.$executeRawUnsafe(`UPDATE "MyDataInboundDocument" SET "rawPayload"=jsonb_set("rawPayload",'{commonDraft,paymentTransactionId}','"other-payment"')`);
  }
  const before=await all(f);await assert.rejects(continueMember(f),e=>e.code==='INVOICE_COMMON_FAMILY_REVIEW_REQUIRED');assert.equal(await all(f),before,scenario);
 }finally{await f.close()}}
});

test('native canonical purchase-order invoice number must still certify the inbound full identity',native,async()=>{
 for(const invoiceNumber of ['OTHER 6836','21-ΤΔΑ 9999','6836']){const f=await invoiceDbFixture();try{
  await completedPair(f);await addMember(f);await f.db.$executeRaw`UPDATE "PurchaseOrder" SET "invoiceNumber"=${invoiceNumber} WHERE "id"='pos'`;
  const before=await all(f);await assert.rejects(continueMember(f),e=>e.code==='INVOICE_COMMON_FAMILY_REVIEW_REQUIRED');assert.equal(await all(f),before,invoiceNumber);
 }finally{await f.close()}}
});

test('native legitimate first payment linked by existing POS receipt writer can follow an unpaid common pair without rewriting old null audit',native,async()=>{
 const f=await invoiceDbFixture();try{
  await firstPaidReceipt(f);await addMember(f);
  const preview=await previewInvoiceReconciliation(f.db,scope);assert.equal(preview.commonDraft.paymentTransactionId,null);
  const initialAlias=(await f.db.$queryRawUnsafe(`SELECT "details" FROM "InvoiceDraftAlias" WHERE "aliasOrderId"='mydata'`))[0].details;assert.equal(initialAlias.paymentTransactionId,null);
  const oldPhoto=(await f.db.$queryRawUnsafe(`SELECT "resultJson" FROM "AiReaderJob" WHERE "id"='j-pos'`))[0].resultJson;
  assert.equal(oldPhoto.mydataPosReceipt.paymentTransactionId,null,'older photo receipt can remain null before the legitimate transition is reviewed');
  const before=await protectedState(f),result=await continueMember(f);assert.equal(result.orderId,'pos');assert.equal(result.paymentChanged,false);assert.equal(await protectedState(f),before);
  const after=await previewInvoiceReconciliation(f.db,scope);assert.equal(after.commonDraft.paymentTransactionId,'first-payment');assert.deepEqual(after.commonDraft.aliasOrderIds,['mydata','third']);
  assert.equal((await f.db.$queryRawUnsafe(`SELECT "details" FROM "InvoiceDraftAlias" WHERE "aliasOrderId"='mydata'`))[0].details.paymentTransactionId,null);
 }finally{await f.close()}
});

test('native bare first-payment link and missing/contradictory dual receipt evidence refuse without writes',native,async()=>{
 const scenarios=['bare-link','raw-missing','job-missing','receipt-time','receipt-attachments','attachment-scope','ledger-identity'];
 for(const scenario of scenarios){const f=await invoiceDbFixture();try{
  if(scenario==='bare-link'){
   await completedPair(f,{payment:false});
   await f.db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","invoiceDocumentNumber") VALUES('first-payment','c','s','sup','SUPPLIER_PAYMENT',3.39,'21-ΤΔΑ 6836')`);
   await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "paymentTransactionId"='first-payment',"settlementMode"='PAID' WHERE "id"='d-pos'`);
  }else{
   await firstPaidReceipt(f);
   const mutations={
    'raw-missing':`UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"-'mydataPosReceipt'`,
    'job-missing':`UPDATE "AiReaderJob" SET "resultJson"="resultJson"-'mydataPosReceipt' WHERE "id"='j-pdf'`,
    'receipt-time':`UPDATE "MyDataInboundDocument" SET "rawPayload"=jsonb_set("rawPayload",'{mydataPosReceipt,receivedAt}','"2026-01-01T00:00:00Z"')`,
    'receipt-attachments':`UPDATE "MyDataInboundDocument" SET "rawPayload"=jsonb_set("rawPayload",'{mydataPosReceipt,attachmentIds}','["pdf"]')`,
    'attachment-scope':`UPDATE "DocumentAttachment" SET "storeId"='control' WHERE "id"='photo'`,
    'ledger-identity':`UPDATE "StoreTransaction" SET "invoiceDocumentNumber"='OTHER 9999' WHERE "id"='first-payment'`
   };
   await f.db.$executeRawUnsafe(mutations[scenario]);
  }
  await addMember(f);const before=await all(f);await assert.rejects(continueMember(f),e=>e.code==='INVOICE_COMMON_FAMILY_REVIEW_REQUIRED');assert.equal(await all(f),before,scenario);
 }finally{await f.close()}}
});
