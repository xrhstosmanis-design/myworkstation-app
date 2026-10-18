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
 await f.db.$executeRawUnsafe('ALTER TABLE "StoreTransaction" ADD COLUMN "shiftId" text,ADD COLUMN "terminalId" text,ADD COLUMN "operatorId" text');
 await f.db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "shiftId"='original-shift',"terminalId"='original-terminal',"operatorId"='original-operator'`);
 await f.db.$executeRawUnsafe('CREATE TABLE "User"("id" text PRIMARY KEY,"companyId" text)');
 await f.db.$executeRawUnsafe(`INSERT INTO "User" VALUES('owner','c')`);
 await reopen.ensurePurchaseOrderReopenSchema(f.db);
 const posting=await handlers('../src/routes/purchase-order-posting-guard.js',f.db);
 const packHandlers=await handlers('../src/routes/purchase-order-unresolved-guard.js',f.db);
 // Load the actual pack function from the same runtime route, not a mirrored calculation.
 const packSrc=(await readFile(new URL('../src/routes/purchase-order-unresolved-guard.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export default router;','return {applyPackStockCorrection,ensureSchema};');
 const packRoute=new Function('Router','prisma','crypto','purchaseOrderTotalReconciliationGuard','lockInvoiceStore',packSrc)(()=>({use(){},patch(){}}),f.db,crypto,()=>{},common.lockInvoiceStore);
 // Real middleware prepares these columns before posting; avoid altering a prepared SELECT * result between cycles.
 await packRoute.ensureSchema();const pack=packRoute.applyPackStockCorrection;
 const patch=body=>invoke(posting['PATCH /:orderId'],{orderId:'pos'},body);
 const finalize=async(version=0)=>{const r=await patch({status:'FINAL',expectedReopenVersion:version});assert.ifError(r.failure);await pack({orderId:'pos',companyId:'c',userId:'owner',userName:'Isolated',expectedReopenVersion:version});assert.ifError((await patch({status:'INVOICED',expectedReopenVersion:version})).failure)};
 const stock=async()=>Number((await f.db.$queryRawUnsafe(`SELECT "currentStock" FROM "StoreProduct" WHERE "id"='stock'`))[0].currentStock);
 const preserved=async()=>JSON.stringify(await f.db.$queryRawUnsafe(`SELECT jsonb_build_object('payments',(SELECT jsonb_agg(t ORDER BY t."id") FROM "StoreTransaction" t),'files',(SELECT jsonb_agg(t ORDER BY t."id") FROM "DocumentAttachment" t),'jobs',(SELECT jsonb_agg(t ORDER BY t."id") FROM "AiReaderJob" t),'control',(SELECT row_to_json(t) FROM "StoreProduct" t WHERE t."id"='control-stock')) AS value`));
 return {...f,patch,finalize,stock,preserved,pack,packHandlers};
}

test('reopen rejects unauthorized actors and malformed requests before database access',async()=>{
 const db=new Proxy({},{get(){throw new Error('Database must not be accessed')}});
 for(const role of ['SUPER_ADMIN','OWNER','ADMIN','MANAGER'])assert.doesNotThrow(()=>reopen.requireReopenActor({...actor,role},'s'));
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
  assert.ifError((await f.patch({status:'FINAL',expectedReopenVersion:1})).failure);
  const beforeDelayedPack=await f.snapshot();
  await assert.rejects(f.pack({orderId:'pos',companyId:'c',userId:'owner',userName:'Old cycle',expectedReopenVersion:0}),e=>e.status===409);
  assert.equal(await f.snapshot(),beforeDelayedPack,'a delayed old-cycle pack callback cannot mutate the new finalization');
  await f.pack({orderId:'pos',companyId:'c',userId:'owner',userName:'Current cycle',expectedReopenVersion:1});
  assert.ifError((await f.patch({status:'INVOICED',expectedReopenVersion:1})).failure);
  assert.equal(await f.stock(),22);assert.equal(await f.preserved(),keep);
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
 for(const kind of ['adjustment','credit','foreign-product','missing-movement']){const f=await fixture();try{
  await f.finalize();
  if(kind==='adjustment'){await f.db.$executeRawUnsafe('CREATE TABLE "PurchaseDocumentAdjustment"("id" text,"companyId" text,"purchaseDocumentId" text,"status" text)');await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseDocumentAdjustment" VALUES('adjustment','c','pos','APPROVED')`)}
  if(kind==='missing-movement')await f.db.$executeRawUnsafe(`DELETE FROM "StockMovement" WHERE "sourceId"='pos'`);
  if(kind==='credit')await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "documentType"='CREDIT_NOTE' WHERE "id"='pos'`);
  if(kind==='foreign-product')await f.db.$executeRawUnsafe(`UPDATE "Product" SET "companyId"='foreign' WHERE "id"='p'`);
  const before=await f.snapshot();await assert.rejects(reopen.previewPurchaseOrderReopen(f.db,actor,'pos','s'),e=>e.status===409);assert.equal(await f.snapshot(),before);
 }finally{await f.close()}}
});

test('native registered HTTP reopen routes enforce actor/scope and perform one confirmed transition',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();let server;try{
  await f.finalize();const {default:express,Router}=await import('express');const src=(await readFile(new URL('../src/routes/purchase-order-reopen.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export default router;','return router;');
  const router=new Function('Router','prisma','previewPurchaseOrderReopen','reopenPurchaseOrder',src)(Router,f.db,reopen.previewPurchaseOrderReopen,reopen.reopenPurchaseOrder);
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=req.headers['x-fixture-role']==='operator'?{...actor,tokenType:'STORE_OPERATOR'}:actor;next()});app.use('/api/purchase-orders',router);app.use((err,req,res,next)=>res.status(err.status||400).json({error:err.message}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const url=`http://127.0.0.1:${server.address().port}/api/purchase-orders/pos`;
  const denied=await fetch(url+'/reopen-preview?storeId=s',{headers:{'x-fixture-role':'operator'}});assert.equal(denied.status,403);
  assert.equal((await fetch(url+'/reopen-preview?storeId=control')).status,404);
  const response=await fetch(url+'/reopen-preview?storeId=s');assert.equal(response.status,200);const p=await response.json();assert.equal(await f.stock(),13);
  const opened=await fetch(url+'/reopen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(confirmed(p))});assert.equal(opened.status,200);assert.equal((await opened.json()).status,'NEW');assert.equal(await f.stock(),10);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await f.close()}
});

test('native actual inventory ledger SQL reconciles full reopened history without synthetic double subtraction or false duplicate cycles',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();try{
  await f.db.$executeRawUnsafe('ALTER TABLE "StockMovement" ADD COLUMN "createdAt" timestamptz DEFAULT NOW()');
  await f.db.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "fullName" text');
  for(const [name,columns] of Object.entries({Sale:'"id" text,"companyId" text,"storeId" text,"status" text,"source" text',SaleLine:'"id" text,"saleId" text,"productId" text,"quantity" numeric',OnlineOrder:'"id" text,"companyId" text,"storeId" text,"status" text',OnlineOrderLine:'"id" text,"orderId" text,"productId" text,"quantity" numeric',PreparationRecipeLine:'"companyId" text,"productId" text,"automatic" boolean,"ingredientProductId" text,"quantity" numeric'}))await f.db.$executeRawUnsafe(`CREATE TABLE "${name}"(${columns})`);
  await f.db.$executeRawUnsafe(`INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity","sourceType","sourceId") VALUES('opening','s','p','OPENING',10,'INITIAL','initial')`);
  const source=await readFile(new URL('../src/routes/inventory-product-ledger.js',import.meta.url),'utf8'),queries=[...source.matchAll(/prisma\.\$queryRaw`([\s\S]*?)`/g)].map(m=>m[1]);
  const sql=fragment=>new Function('prisma','companyId','storeId','productId','from','to','return prisma.$queryRaw`'+fragment+'`;')(f.db,'c','s','p',new Date('2000-01-01'),new Date('2100-01-01'));
  const verify=async(expected)=>{const totals=await sql(queries.find(q=>q.includes('AS "ledgerStock"')));assert.equal(Number(totals[0].ledgerStock),expected);assert.equal(await f.stock(),expected);
   const manual=await sql(queries.find(q=>q.includes('FROM "StockMovement" sm LEFT JOIN'))),purchases=await sql(queries.find(q=>q.includes("'PURCHASE'::text")));assert.equal([...manual,...purchases].reduce((sum,m)=>sum+Number(m.quantity),0),expected);
   assert.deepEqual(await sql(queries.find(q=>q.includes('HAVING COUNT(*)>1'))),[]);
  };
  await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrderLine" SET "stockUnitsPerInvoiceUnit"=2 WHERE "orderId"='pos'`);
  for(let cycle=0;cycle<2;cycle++){await f.finalize(cycle);await verify(16);const preview=await reopen.previewPurchaseOrderReopen(f.db,actor,'pos','s');await reopen.reopenPurchaseOrder(f.db,actor,'pos',confirmed(preview));await verify(10)}
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "StockMovement"'))[0].n,9);
 }finally{await f.close()}
});
