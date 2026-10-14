import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import * as common from '../src/lib/invoice-common-draft.js';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
const scope={companyId:'c',storeId:'s',inboxId:'inbox'};
async function fixture(){
 const f=await invoiceDbFixture();await f.seed({posLines:1,mydataLines:1});
 for(const sql of `INSERT INTO "Supplier"("id","companyId","taxId","name") VALUES('ocr','c',NULL,'OCR supplier'),('foreign','foreign','099999999','Foreign'),('inactive','c','099999999','Inactive'); UPDATE "Supplier" SET "active"=false WHERE "id"='inactive'; UPDATE "PurchaseOrder" SET "supplierId"='ocr' WHERE "id"='pos'; UPDATE "PurchaseDocument" SET "supplierId"='ocr' WHERE "id"='d-pos'; UPDATE "StoreTransaction" SET "supplierId"='ocr' WHERE "id"='payment'`.split(';'))await f.db.$executeRawUnsafe(sql.trim());
 return f;
}
const args=p=>({posOrderId:'pos',expectedVersion:p.version,confirmSameInvoice:true,confirmMark:p.mark,reason:'Compared originals and both complete tables',verifiedSupplierId:'sup',confirmSupplierCorrection:true,confirmPaymentSupplierCorrection:true,selectedRowsOrderId:'mydata',actorId:'owner'});
async function snapshots(db){const out={};for(const t of ['PurchaseOrderLine','PurchaseDocumentLine','DocumentAttachment','StoreProduct','StockMovement','StoreTransaction','PurchaseOrder','PurchaseDocument','AiReaderJob','MyDataInboundDocument','InvoiceDraftAlias','InvoiceStockPosting','PurchaseOrderPosting'])out[t]=await db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${t}" t ORDER BY row_to_json(t)::text`);return out;}
async function registeredPost(db){
 const found={},router={use:()=>{},get:()=>{},post:(p,...f)=>found[p]=f.at(-1)};
 const prisma={store:{findFirst:async({where})=>(await db.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${where.id} AND "companyId"=${where.companyId}`)[0]||null},$queryRaw:db.$queryRaw.bind(db),$executeRawUnsafe:db.$executeRawUnsafe.bind(db),$transaction:db.$transaction.bind(db)};
 const src=(await readFile(new URL('../src/routes/invoice-common-draft.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export default router;','return router;');
 const deps={Router:()=>router,z,prisma,requireCompanyModule:()=>()=>{},...common};new Function(...Object.keys(deps),src)(...Object.values(deps));
 return async body=>{let result,failure;await found['/documents/inbox/:inboxId/reconcile-pos']({params:{inboxId:'inbox'},body,user:{companyId:'c',id:'owner',role:'OWNER'}},{json:r=>{result=r}},e=>{failure=e});if(failure)throw failure;return result;};
}
for(const selected of ['pos','mydata'])test('native reviewed supplier and row choice uses actual registered POST, concurrent retry keeps both complete tables and one payment: '+selected,{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();try{
  const before=await snapshots(f.db),preview=await common.previewInvoiceReconciliation(f.db,scope);assert.deepEqual(preview.verifiedSuppliers.map(s=>s.id),['sup']);assert.equal(preview.lines.length,2);
  const post=await registeredPost(f.db),body={storeId:'s',...args(preview),selectedRowsOrderId:selected};delete body.actorId;
  const results=await Promise.all([post(body),post(body)]);assert.equal(results.filter(r=>!r.reused).length,1);assert.ok(results.every(r=>r.orderId===selected&&r.paymentChanged===false&&r.stockUpdated===false));
  const after=await snapshots(f.db);
  for(const t of ['PurchaseOrderLine','PurchaseDocumentLine','DocumentAttachment','StoreProduct','StockMovement','InvoiceStockPosting','PurchaseOrderPosting'])assert.deepEqual(after[t],before[t],t+' unchanged');
  const paymentBefore=before.StoreTransaction[0].row,paymentAfter=after.StoreTransaction[0].row;assert.equal(paymentAfter.supplierId,'sup');assert.deepEqual({...paymentAfter,supplierId:paymentBefore.supplierId},paymentBefore,'only supplier association changed, all monetary/time/method/shift/operator/key fields remain');assert.equal(after.StoreTransaction.length,1);
  const orders=after.PurchaseOrder.map(x=>x.row);assert.equal(orders.find(o=>o.id===selected).status,'NEW');assert.equal(orders.find(o=>o.id!==selected).status,'MERGED');assert.equal(orders.find(o=>o.id===selected).supplierId,'sup');
  const doc=after.PurchaseDocument.find(x=>x.row.id==='d-'+selected).row;assert.equal(doc.paymentTransactionId,'payment');assert.equal(doc.supplierId,'sup');
  const audit=after.InvoiceDraftAlias[0].row.details;assert.equal(audit.selectedRowsOrderId,selected);assert.equal(audit.paymentBefore.supplierId,'ocr');assert.equal(audit.paymentSupplierCorrection,true);assert.equal(audit.before.length,2);
  assert.ok(after.AiReaderJob.every(j=>j.row.purchaseDocumentId==='d-'+selected));const again=await common.previewInvoiceReconciliation(f.db,scope);assert.equal(again.commonDraft.orderId,selected);assert.equal(again.files.length,2);
 }finally{await f.close()}
});
test('native reviewed resolution refuses missing decisions, foreign/inactive supplier, stale rows/payment, multiple/reversed payments and posted source without writes',{skip:!isolatedInvoiceDb()},async()=>{
 for(const variant of ['supplier','supplierConfirm','paymentConfirm','rows','foreign','inactive','staleRows','stalePayment','staleInbound','reversed','multiple','posted','settlement']){
  const f=await fixture();try{
   const p=await common.previewInvoiceReconciliation(f.db,scope),a=args(p);
   if(variant==='supplier')a.verifiedSupplierId=null;if(variant==='supplierConfirm')a.confirmSupplierCorrection=false;if(variant==='paymentConfirm')a.confirmPaymentSupplierCorrection=false;if(variant==='rows')a.selectedRowsOrderId=null;if(['foreign','inactive'].includes(variant))a.verifiedSupplierId=variant;
   if(variant==='staleRows')await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrderLine" SET "quantity"=4 WHERE "orderId"='mydata'`);
   if(variant==='stalePayment')await f.db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "description"='Changed after preview' WHERE "id"='payment'`);
   if(variant==='staleInbound')await f.db.$executeRawUnsafe(`UPDATE "MyDataInboundDocument" SET "totalGross"=3.40 WHERE "id"='m'`);
   if(variant==='reversed')await f.db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "reversedAt"=NOW() WHERE "id"='payment'`);
   if(variant==='multiple'){await f.db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount") VALUES('payment2','c','s','sup','SUPPLIER_PAYMENT',3.39)`);await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "paymentTransactionId"='payment2' WHERE "id"='d-mydata'`);}
   if(variant==='posted')await f.db.$executeRawUnsafe(`INSERT INTO "InvoiceStockPosting"("companyId","sourceDocumentId","storeId","postedDocumentId","path") VALUES('c','d-mydata','s','posted','invoice')`);
   if(variant==='settlement'){await f.db.$executeRawUnsafe(`CREATE TABLE "SupplierPaymentSettlement"("id" text,"companyId" text,"transactionId" text)`);await f.db.$executeRawUnsafe(`INSERT INTO "SupplierPaymentSettlement" VALUES('settled','c','payment')`);}
   const before=await snapshots(f.db);await assert.rejects(f.db.$transaction(tx=>common.reconcileInvoiceDrafts(tx,scope,a)));assert.deepEqual(await snapshots(f.db),before,variant);
  }finally{await f.close()}
 }
});
