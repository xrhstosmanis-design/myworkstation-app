import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import {z} from 'zod';
import * as common from '../src/lib/invoice-common-draft.js';
import * as reopen from '../src/services/purchase-order-reopen.js';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
const actor={id:'owner',companyId:'c',role:'OWNER',fullName:'Isolated owner'};
const confirmed=p=>({storeId:'s',version:p.version,reason:'Accidental finalization correction',confirm:true});
async function handlers(file,db,extra={}){
 const h={},router={use(){},get:(p,...f)=>h['GET '+p]=f.at(-1),post:(p,...f)=>h['POST '+p]=f.at(-1),patch:(p,...f)=>h['PATCH '+p]=f.at(-1),delete(){}};
 const deps={Router:()=>router,z,crypto,prisma:db,requireCompanyModule:()=>()=>{},purchaseOrderTotalReconciliationGuard:()=>{},...common,...reopen,...extra};
 const src=(await readFile(new URL(file,import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export default router;','return router;');
 new Function(...Object.keys(deps),src)(...Object.values(deps));return h;
}
async function invoke(handler,params,body={},user=actor,query={}){let result,failure,status=200;const res={json:v=>(result=v,res),status:v=>(status=v,res)};await handler({params,body,user,query},res,e=>failure=e);return {result,failure,status};}
async function fixture(){
 const f=await invoiceDbFixture();await f.seed({mydata:false,posLines:1});
 await f.db.$executeRawUnsafe('DELETE FROM "MyDataInboundDocument"');
 await f.db.$executeRawUnsafe('ALTER TABLE "Product" ADD COLUMN "name" text,ADD COLUMN "sku" text');
 await f.db.$executeRawUnsafe('CREATE TABLE "User"("id" text PRIMARY KEY,"companyId" text)');
 await f.db.$executeRawUnsafe(`INSERT INTO "User" VALUES('owner','c')`);
 await reopen.ensurePurchaseOrderReopenSchema(f.db);
 const posting=await handlers('../src/routes/purchase-order-posting-guard.js',f.db);
 const packHandlers=await handlers('../src/routes/purchase-order-unresolved-guard.js',f.db);
 // Load the actual pack function from the same runtime route, not a mirrored calculation.
 const packSrc=(await readFile(new URL('../src/routes/purchase-order-unresolved-guard.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export default router;','return applyPackStockCorrection;');
 const pack=new Function('Router','prisma','crypto','purchaseOrderTotalReconciliationGuard','lockInvoiceStore',packSrc)(()=>({use(){},patch(){}}),f.db,crypto,()=>{},common.lockInvoiceStore);
 const patch=body=>invoke(posting['PATCH /:orderId'],{orderId:'pos'},body);
 const finalize=async(version=0)=>{const r=await patch({status:'FINAL',expectedReopenVersion:version});assert.ifError(r.failure);await pack({orderId:'pos',companyId:'c',userId:'owner',userName:'Isolated'});assert.ifError((await patch({status:'INVOICED',expectedReopenVersion:version})).failure)};
 const stock=async()=>Number((await f.db.$queryRawUnsafe(`SELECT "currentStock" FROM "StoreProduct" WHERE "id"='stock'`))[0].currentStock);
 const preserved=async()=>JSON.stringify(await f.db.$queryRawUnsafe(`SELECT jsonb_build_object('payments',(SELECT jsonb_agg(t ORDER BY t."id") FROM "StoreTransaction" t),'files',(SELECT jsonb_agg(t ORDER BY t."id") FROM "DocumentAttachment" t),'jobs',(SELECT jsonb_agg(t ORDER BY t."id") FROM "AiReaderJob" t),'control',(SELECT row_to_json(t) FROM "StoreProduct" t WHERE t."id"='control-stock')) AS value`));
 return {...f,patch,finalize,stock,preserved,pack,packHandlers};
}

test('reopen rejects unauthorized actors and malformed requests before database access',async()=>{
 const db=new Proxy({},{get(){throw new Error('Database must not be accessed')}});
 for(const user of [null,{...actor,role:'CASHIER'},{...actor,tokenType:'STORE_OPERATOR'},{...actor,storeId:'other'}])await assert.rejects(reopen.previewPurchaseOrderReopen(db,user,'pos','s'),e=>e.status===403);
 assert.throws(()=>reopen.reopenSchema.parse({...confirmed({version:'a'.repeat(64)}),unexpected:true}));
 assert.throws(()=>reopen.assertReopenedIdentity({reopenVersion:1,supplierId:'a',invoiceNumber:'x'},{supplierId:'b'}));
});

test('native full posting, pack inversion, corrected re-post and second reopen retain same order, documents, original payment and control store',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();try{
  await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrderLine" SET "stockUnitsPerInvoiceUnit"=12 WHERE "orderId"='pos'`);
  await f.finalize();assert.equal(await f.stock(),46);const keep=await f.preserved();
  const beforeDocs=await f.db.$queryRawUnsafe('SELECT "id","documentDate","createdByUserId" FROM "PurchaseDocument" ORDER BY "id"');
  const p=await reopen.previewPurchaseOrderReopen(f.db,actor,'pos','s');assert.equal(p.stockChanges[0].delta,-36);assert.equal(await f.stock(),46);
  const results=await Promise.all([reopen.reopenPurchaseOrder(f.db,actor,'pos',confirmed(p)),reopen.reopenPurchaseOrder(f.db,actor,'pos',confirmed(p))]);
  assert.equal(results.filter(r=>!r.idempotent).length,1);assert.equal(await f.stock(),10);assert.equal(await f.preserved(),keep);
  const stale=await f.patch({status:'FINAL'});assert.equal(stale.failure?.status,409);
  const docs=await handlers('../src/routes/commerce-invoice-draft-approval.js',f.db);const approval=await invoke(docs['POST /purchases/:documentId/approve'],{documentId:'d-pos'});assert.equal(approval.failure?.status,409);
  await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrderLine" SET "quantity"=2,"netAmount"=2,"vatAmount"=.26,"grossAmount"=2.26,"stockUnitsPerInvoiceUnit"=6 WHERE "orderId"='pos'`);
  await f.finalize(1);assert.equal(await f.stock(),22);assert.equal(await f.preserved(),keep);
  assert.deepEqual(await f.db.$queryRawUnsafe('SELECT "id","documentDate","createdByUserId" FROM "PurchaseDocument" ORDER BY "id"'),beforeDocs);
  await assert.rejects(reopen.reopenPurchaseOrder(f.db,actor,'pos',confirmed(p)),e=>e.status===409);
  const p2=await reopen.previewPurchaseOrderReopen(f.db,actor,'pos','s');assert.equal(p2.stockChanges[0].delta,-12);await reopen.reopenPurchaseOrder(f.db,actor,'pos',confirmed(p2));assert.equal(await f.stock(),10);
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "PurchaseOrderReopenAudit"'))[0].n,2);
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "PurchaseOrderReopenMovement"'))[0].n,4);
 }finally{await f.close()}
});

test('native stale stock, wrong scope, negative-stock acknowledgment and audit failure are atomic',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();try{
  await f.finalize();const p=await reopen.previewPurchaseOrderReopen(f.db,actor,'pos','s');
  await assert.rejects(reopen.previewPurchaseOrderReopen(f.db,{...actor,companyId:'foreign'},'pos','s'),e=>e.status===404);
  await assert.rejects(reopen.previewPurchaseOrderReopen(f.db,actor,'pos','control'),e=>e.status===404);
  await f.db.$executeRawUnsafe(`UPDATE "StoreProduct" SET "currentStock"=1 WHERE "id"='stock'`);
  await assert.rejects(reopen.reopenPurchaseOrder(f.db,actor,'pos',confirmed(p)),/άλλαξε/);
  const negative=await reopen.previewPurchaseOrderReopen(f.db,actor,'pos','s');assert.equal(negative.negativeStockCount,1);
  await assert.rejects(reopen.reopenPurchaseOrder(f.db,actor,'pos',confirmed(negative)),e=>e.status===400);
  const snapshot=await f.snapshot();await f.db.$executeRawUnsafe(`ALTER TABLE "StoreOperatorAudit" ADD CONSTRAINT "reject_reopen_test" CHECK ("eventType"<>'PURCHASE_ORDER_REOPENED')`);
  await assert.rejects(reopen.reopenPurchaseOrder(f.db,actor,'pos',{...confirmed(negative),confirmNegativeStock:true}));assert.equal(await f.snapshot(),snapshot);
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "PurchaseOrderReopenAudit"'))[0].n,0);
  await f.db.$executeRawUnsafe('ALTER TABLE "StoreOperatorAudit" DROP CONSTRAINT "reject_reopen_test"');
  await reopen.reopenPurchaseOrder(f.db,actor,'pos',{...confirmed(negative),confirmNegativeStock:true});assert.equal(await f.stock(),-2);
 }finally{await f.close()}
});

test('native approved adjustments, credit documents and corrupt movement ownership cannot be reopened',{skip:!isolatedInvoiceDb()},async()=>{
 for(const kind of ['adjustment','credit','foreign-product']){const f=await fixture();try{
  await f.finalize();const before=await f.snapshot();
  if(kind==='adjustment'){await f.db.$executeRawUnsafe('CREATE TABLE "PurchaseDocumentAdjustment"("id" text,"companyId" text,"purchaseDocumentId" text,"status" text)');await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseDocumentAdjustment" VALUES('adjustment','c','pos','APPROVED')`)}
  if(kind==='credit')await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "documentType"='CREDIT_NOTE' WHERE "id"='pos'`);
  if(kind==='foreign-product')await f.db.$executeRawUnsafe(`UPDATE "Product" SET "companyId"='foreign' WHERE "id"='p'`);
  await assert.rejects(reopen.previewPurchaseOrderReopen(f.db,actor,'pos','s'),e=>e.status===409);assert.equal(await f.snapshot(),before);
 }finally{await f.close()}}
});
