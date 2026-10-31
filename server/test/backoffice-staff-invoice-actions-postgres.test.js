import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
import {installStaffActionPolicy} from './helpers/backoffice-staff-actions-fixture.js';
import {requireStaffAction,requireStaffOrderAction} from '../src/services/backoffice-staff-access.js';
import * as common from '../src/lib/invoice-common-draft.js';

test('native delegated invoice metadata and canonical approval preserve one posting, actor, control stock and live withdrawal',{skip:!isolatedInvoiceDb(),timeout:90000},async()=>{
 const f=await invoiceDbFixture(),db=f.db;
 try{
  await f.seed({posLines:1});const scope={companyId:'c',storeId:'s',inboxId:'inbox'},preview=await common.previewInvoiceReconciliation(db,scope);
  await db.$transaction(tx=>common.reconcileInvoiceDrafts(tx,scope,{posOrderId:'pos',expectedVersion:preview.version,confirmSameInvoice:true,confirmMark:preview.mark,confirmPaymentDiscrepancy:true,reason:'Synthetic original comparison',actorId:'owner'}));
  const user=await installStaffActionPolicy(db,{capabilities:['invoices.read','invoices.edit']});
  await db.$executeRawUnsafe('ALTER TABLE "StockMovement" ADD CONSTRAINT "staff_actor_fk" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")');
  await db.$executeRawUnsafe('ALTER TABLE "PurchaseOrder" ADD COLUMN "reopenVersion" int DEFAULT 0');
  const source=await readFile(new URL('../src/routes/purchase-orders.js',import.meta.url),'utf8');
  const start=source.indexOf('router.patch("/:orderId",'),end=source.indexOf('\nrouter.get("/:orderId/detail",',start);let edit;
  const audit=source.slice(source.indexOf('async function writePurchaseAudit('),source.indexOf('const lineSchema='));
  const deps={router:{patch:(_path,h)=>edit=h},z,prisma:db,id:()=>crypto.randomUUID(),requireStaffOrderAction,
   order:async(companyId,orderId)=>(await db.$queryRaw`SELECT * FROM "PurchaseOrder" WHERE "id"=${orderId} AND "companyId"=${companyId}`)[0],
   editable:()=>{},lockPurchaseSupplierMetadata:async()=>{},supplier:()=>assert.fail('supplier must not change')};
  new Function(...Object.keys(deps),audit+source.slice(start,end))(...Object.values(deps));
  const invoke=async(handler,capability,body)=>{let result,failure,status=200;const req={params:{orderId:'pos'},body,user,staffGrant:{capability},get:()=> 'POS2'},res={json:value=>{result=value},status:value=>(status=value,res)};await handler(req,res,error=>failure=error);return {result,failure,status}};
  const before=await f.snapshot();const edited=await invoke(edit,'invoices.edit',{description:'Native reviewed metadata'});assert.ifError(edited.failure);assert.equal(edited.result.ok,true);
  assert.equal(await f.snapshot(),before);assert.equal((await db.$queryRaw`SELECT "description" FROM "PurchaseOrder" WHERE "id"='pos'`)[0].description,'Native reviewed metadata');
  assert.equal((await db.$queryRaw`SELECT "actorId" FROM "StoreOperatorAudit" WHERE "eventType"='PURCHASE_ORDER_DRAFT_UPDATED'`)[0].actorId,'delegated');
  const handlers={},router={use:()=>{},post:()=>{},delete:()=>{},patch:(path,h)=>handlers[path]=h};
  const posting=(await readFile(new URL('../src/routes/purchase-order-posting-guard.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export default router;','return router;');
  const bindings={Router:()=>router,crypto,prisma:db,requireStaffAction,...common};new Function(...Object.keys(bindings),posting)(...Object.values(bindings));
  const approve=()=>invoke(handlers['/:orderId'],'invoices.approve',{status:'FINAL'});
  assert.equal((await approve()).failure?.status,403);assert.equal(await f.snapshot(),before);
  await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "capabilities"='["invoices.read","invoices.edit","invoices.approve"]'::jsonb`;
  const results=await Promise.all([approve(),approve()]);for(const r of results){assert.ifError(r.failure);assert.equal(r.result.status,'FINAL')}
  assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS count FROM "StockMovement"`)[0].count),1);
  assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS count FROM "InvoiceStockPosting"`)[0].count),1);
  assert.equal((await db.$queryRaw`SELECT "createdByUserId" FROM "StockMovement"`)[0].createdByUserId,'delegated');
  const stocks=await db.$queryRaw`SELECT "storeId","currentStock" FROM "StoreProduct" ORDER BY "storeId"`;assert.deepEqual(stocks.map(r=>[r.storeId,Number(r.currentStock)]),[['control',20],['s',13]]);
  assert.equal((await invoke(edit,'invoices.edit',{description:'Forbidden after posting'})).failure?.code,'STAFF_DRAFT_CLOSED');
  const after=await f.snapshot();await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "active"=false`;
  assert.equal((await approve()).failure?.status,403);assert.equal(await f.snapshot(),after);
  assert.equal((await db.$queryRaw`SELECT "role" FROM "User" WHERE "id"='delegated'`)[0].role,'EMPLOYEE');
 }finally{await f.close()}
});
