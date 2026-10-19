import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import {z} from 'zod';
import * as correction from '../src/services/purchase-supplier-correction.js';
import * as common from '../src/lib/invoice-common-draft.js';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
const actor={id:'owner',companyId:'c',role:'OWNER',fullName:'Isolated owner'};
const request=p=>({storeId:'s',supplierId:'target',version:p.version,reason:'Correct supplier against original invoice',confirmOriginal:true,confirmPaymentSupplier:true});
async function registered(file,db){
 const handlers={},router={use(){},get:(p,...f)=>handlers['GET '+p]=f.at(-1),post:(p,...f)=>handlers['POST '+p]=f.at(-1),patch:(p,...f)=>handlers['PATCH '+p]=f.at(-1),delete(){}};
 const src=(await readFile(new URL(file,import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'').replace('default router;','return router;');
 const deps={Router:()=>router,prisma:db,crypto,z,...common,...correction,assertReopenedIdentity:()=>{},reuseReopenedPurchaseDocument:()=>{throw Error('Not reopened')}};
 new Function(...Object.keys(deps),src)(...Object.values(deps));return handlers;
}
async function fixture({posted=true,payment=true}={}){
 const f=await invoiceDbFixture();await f.seed({mydata:false,payment,posLines:1});
 await f.db.$executeRawUnsafe('ALTER TABLE "PurchaseOrder" ADD COLUMN "reopenVersion" integer DEFAULT 0');
 await f.db.$executeRawUnsafe(`INSERT INTO "Supplier"("id","companyId","taxId","name") VALUES('target','c','099939837','Verified target'),('foreign','other','099939837','Foreign')`);
 const posting=await registered('../src/routes/purchase-order-posting-guard.js',f.db);
 // The real posting middleware owns these existing tables in the hosted app.
 await f.db.$executeRawUnsafe(`CREATE TABLE "PurchaseOrderPosting"("orderId" text PRIMARY KEY,"companyId" text,"supplierId" text,"documentFingerprint" text,"purchaseDocumentId" text,"postedAt" timestamptz DEFAULT NOW(),"postedByUserId" text,"postedByName" text,"updatedAt" timestamptz DEFAULT NOW(),UNIQUE("companyId","documentFingerprint"))`);
 await f.db.$executeRawUnsafe(`CREATE TABLE "StoreOperatorAudit"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb,"createdAt" timestamptz DEFAULT NOW())`);
 if(posted){let error;await posting['PATCH /:orderId']({user:actor,params:{orderId:'pos'},body:{status:'FINAL'}},{json:()=>{},status:()=>({json:()=>{}})},e=>error=e);assert.ifError(error)}
 const snapshot=async()=>{const state={};for(const table of ['PurchaseOrder','PurchaseDocument','PurchaseOrderLine','PurchaseDocumentLine','StoreTransaction','StoreProduct','StockMovement','PurchaseOrderPosting','InvoiceStockPosting','DocumentAttachment','AiReaderJob','Supplier','SupplierProductLink','SupplierProductMapping'])state[table]=await f.db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY COALESCE(to_jsonb(t)->>'id',to_jsonb(t)->>'orderId',to_jsonb(t)->>'sourceDocumentId')`);return state};
 const preview=()=>correction.previewPurchaseSupplierCorrection(f.db,actor,'pos',{storeId:'s',supplierId:'target'});
 return {...f,preview,all:snapshot};
}
test('supplier correction validates privileged personal actors and deliberate original confirmation before database access',async()=>{
 const db=new Proxy({},{get(){throw Error('Unexpected database access')}});
 for(const role of ['SUPER_ADMIN','OWNER','ADMIN','MANAGER'])assert.doesNotThrow(()=>correction.requireSupplierCorrectionActor({...actor,role},'s'));
 for(const user of [null,{...actor,role:'CASHIER'},{...actor,tokenType:'STORE_OPERATOR'},{...actor,storeId:'other'}])await assert.rejects(correction.previewPurchaseSupplierCorrection(db,user,'pos',{storeId:'s',supplierId:'target'}),e=>e.status===403);
 assert.throws(()=>correction.supplierCorrectionSchema.parse({...request({version:'a'.repeat(64)}),confirmOriginal:false}));
 assert.throws(()=>correction.supplierCorrectionSchema.parse({...request({version:'a'.repeat(64)}),status:'NEW'}));
});
test('native posted correction updates only associations, retains full history and payment, serializes retry and preserves finalization idempotency',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();try{
  const before=await f.all(),beforePayment=JSON.parse(JSON.stringify((await f.db.$queryRawUnsafe('SELECT * FROM "StoreTransaction" ORDER BY "id"'))[0])),p=await f.preview();assert.equal(p.payment.amount,3.39);assert.equal(p.status,'FINAL');assert.deepEqual(await f.all(),before,'preview is read only');
  const results=await Promise.all([correction.correctPurchaseSupplier(f.db,actor,'pos',request(p)),correction.correctPurchaseSupplier(f.db,actor,'pos',request(p))]);
  assert.equal(results.filter(r=>r.idempotent).length,1);const after=await f.all();
  for(const table of ['PurchaseOrderLine','PurchaseDocumentLine','StoreProduct','StockMovement','InvoiceStockPosting','DocumentAttachment','AiReaderJob','Supplier','SupplierProductLink','SupplierProductMapping'])assert.deepEqual(after[table],before[table],table+' unchanged');
  assert.deepEqual(after.StoreTransaction,before.StoreTransaction.map(({row})=>({row:{...row,supplierId:'target'}})),'all original payment fields except supplier association retained');
  for(const table of ['PurchaseOrder','PurchaseDocument','PurchaseOrderPosting']){
   const clean=rows=>rows.map(({row})=>{const {supplierId,updatedAt,updatedByName,documentFingerprint,...rest}=row;return rest});assert.deepEqual(clean(after[table]),clean(before[table]),table+' identities/status/timestamps/economics retained');assert.ok(after[table].every(({row})=>row.supplierId==='target'));
  }
  const audit=await f.db.$queryRawUnsafe(`SELECT * FROM "StoreOperatorAudit" WHERE "eventType"='PURCHASE_SUPPLIER_CORRECTED'`);assert.equal(audit.length,1);assert.deepEqual(audit[0].details.before.payment,beforePayment);assert.equal(audit[0].details.reason,request(p).reason);
  const posting=await registered('../src/routes/purchase-order-posting-guard.js',f.db);let error,result;await posting['PATCH /:orderId']({user:actor,params:{orderId:'pos'},body:{status:'FINAL'}},{json:r=>result=r,status:()=>({json:()=>{}})},e=>error=e);assert.ifError(error);assert.equal(result.idempotent,true);assert.deepEqual(await f.all(),after);
 }finally{await f.close()}
});
test('native unpaid NEW and paid INVOICED correction retain original status without reopening or payment creation',{skip:!isolatedInvoiceDb()},async()=>{
 for(const mode of ['unpaid','invoiced']){const f=await fixture({posted:mode!=='unpaid',payment:mode!=='unpaid'});try{
  if(mode==='invoiced')await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "status"='INVOICED'`);
  const p=await f.preview(),before=await f.snapshot();await correction.correctPurchaseSupplier(f.db,actor,'pos',request(p));const after=await f.snapshot();
  assert.equal((await f.db.$queryRawUnsafe(`SELECT "status" FROM "PurchaseOrder" WHERE "id"='pos'`))[0].status,p.status);
  assert.equal(JSON.parse(after).StockMovement.length,JSON.parse(before).StockMovement.length);assert.equal(JSON.parse(after).StoreTransaction.length,mode==='unpaid'?0:1);
 }finally{await f.close()}}
});
test('native stale payment, document, line, supplier and posting previews refuse atomically; audit failure rolls back all associations',{skip:!isolatedInvoiceDb()},async()=>{
 for(const change of [`UPDATE "StoreTransaction" SET "description"='changed'`,`UPDATE "PurchaseDocument" SET "totalNet"=1 WHERE "id"='d-pos'`,`UPDATE "PurchaseOrderLine" SET "description"='changed'`,`UPDATE "Supplier" SET "name"='changed' WHERE "id"='target'`,`UPDATE "PurchaseOrderPosting" SET "postedByName"='changed'`]){const f=await fixture();try{const p=await f.preview();await f.db.$executeRawUnsafe(change);const before=await f.all();await assert.rejects(correction.correctPurchaseSupplier(f.db,actor,'pos',request(p)),e=>e.status===409);assert.deepEqual(await f.all(),before)}finally{await f.close()}}
 const f=await fixture();try{const p=await f.preview();await f.db.$executeRawUnsafe(`ALTER TABLE "StoreOperatorAudit" ADD CONSTRAINT "audit_failure" CHECK("eventType"<>'PURCHASE_SUPPLIER_CORRECTED')`);const before=await f.all();await assert.rejects(correction.correctPurchaseSupplier(f.db,actor,'pos',request(p)));assert.deepEqual(await f.all(),before)}finally{await f.close()}
});
test('native wrong company/store/target, settled/reversed/shared/credit/reopened/duplicate purchases cannot change associations',{skip:!isolatedInvoiceDb()},async()=>{
 for(const mode of ['foreign-company','foreign-store','foreign-supplier','inactive','no-vat','settled','reversed','shared','credit','reopened','duplicate','payment-confirmation']){const f=await fixture();try{
  let who=actor,scope={storeId:'s',supplierId:'target'};
  if(mode==='foreign-company')who={...actor,companyId:'other'};
  if(mode==='foreign-store')scope.storeId='control';if(mode==='foreign-supplier')scope.supplierId='foreign';
  const changes={inactive:`UPDATE "Supplier" SET "active"=false WHERE "id"='target'`,'no-vat':`UPDATE "Supplier" SET "taxId"=NULL WHERE "id"='target'`,reversed:`UPDATE "StoreTransaction" SET "reversedAt"=NOW()`,shared:`INSERT INTO "PurchaseDocument"("id","companyId","storeId","paymentTransactionId") VALUES('other-doc','other','control','payment')`,credit:`UPDATE "PurchaseDocument" SET "documentType"='CREDIT_NOTE' WHERE "id"='pos'`,reopened:`UPDATE "PurchaseOrder" SET "reopenVersion"=1`,duplicate:`INSERT INTO "PurchaseOrder"("id","companyId","storeId","supplierId","invoiceNumber","status") VALUES('duplicate','c','control','target','21-ΤΔΑ 006836','FINAL')`};
  if(changes[mode])await f.db.$executeRawUnsafe(changes[mode]);
  if(mode==='settled'){await f.db.$executeRawUnsafe('CREATE TABLE "SupplierPaymentSettlement"("id" text,"companyId" text,"transactionId" text)');await f.db.$executeRawUnsafe(`INSERT INTO "SupplierPaymentSettlement" VALUES('settled','c','payment')`)}
  const before=await f.all();if(mode==='payment-confirmation'){const p=await f.preview();await assert.rejects(correction.correctPurchaseSupplier(f.db,actor,'pos',{...request(p),confirmPaymentSupplier:false}),e=>e.status===400)}else await assert.rejects(correction.previewPurchaseSupplierCorrection(f.db,who,'pos',scope));assert.deepEqual(await f.all(),before,mode);
 }finally{await f.close()}}
});
test('native real registered supplier endpoints over loopback HTTP deny POS and require selected store and explicit payment confirmation',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await fixture();let server;try{
  const h=await registered('../src/routes/purchase-orders.js',f.db),{default:express}=await import('express'),app=express();app.use(express.json());app.use((req,res,next)=>{req.user=req.headers['x-fixture-pos']?{...actor,tokenType:'STORE_OPERATOR'}:actor;next()});
  app.get('/api/purchase-orders/:orderId/supplier-correction-preview',h['GET /:orderId/supplier-correction-preview']);app.post('/api/purchase-orders/:orderId/supplier-correction',h['POST /:orderId/supplier-correction']);app.use((err,req,res,next)=>res.status(err.status||400).json({error:err.message}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api/purchase-orders/pos`,url=base+'/supplier-correction-preview?storeId=s&supplierId=target';
  assert.equal((await fetch(url,{headers:{'x-fixture-pos':'1'}})).status,403);assert.equal((await fetch(base+'/supplier-correction-preview?supplierId=target')).status,400);
  const response=await fetch(url);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const p=await response.json();
  const send=body=>fetch(base+'/supplier-correction',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await send({...request(p),confirmPaymentSupplier:false})).status,400);assert.equal((await send(request(p))).status,200);assert.equal((await (await send(request(p))).json()).idempotent,true);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await f.close()}
});
