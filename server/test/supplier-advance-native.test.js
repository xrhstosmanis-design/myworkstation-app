import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {z} from 'zod';
import express,{Router} from 'express';
import {enforceBackofficeStaff,requireStaffGrant,requireStaffAction} from '../src/services/backoffice-staff-access.js';
import {installStaffActionPolicy} from './helpers/backoffice-staff-actions-fixture.js';
import {supplierAdvanceContext,associateExpenseAsAdvance,allocateSupplierAdvance} from '../src/lib/supplier-advance.js';
function registered(db){
 const handlers=new Map();let ledger;
 const Router=()=>({use(...args){const fn=args.at(-1);if(fn.name==='requireLedgerAccess')ledger=fn},...Object.fromEntries(['get','post'].map(method=>[method,(path,...args)=>handlers.set(method+path,args)]))});
 const source=fs.readFileSync(new URL('../src/routes/store-transactions.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export default .*;\n/gm,'');
 new Function('Router','prisma','crypto','z','auth','executeHotTableBootstrap','supplierAdvanceContext','associateExpenseAsAdvance','allocateSupplierAdvance',source)(Router,db,crypto,z,()=>{},async()=>{},supplierAdvanceContext,associateExpenseAsAdvance,allocateSupplierAdvance);
 return (method,path,params,body,user)=>new Promise(resolve=>{let status=200;const req={method:method.toUpperCase(),params,body,user,query:{},headers:{},originalUrl:'/api/transactions'+path},res={status(n){status=n;return this},json(data){resolve({status,data})}};const chain=[ledger,...handlers.get(method+path)];let index=0;const next=()=>chain[index++]?.(req,res,next);next()});
}
// Real registered Express routes and canonical live staff policy; identity injection
// is an isolated fixture boundary, not a hosted login/JWT acceptance claim.
async function withRecoveryHttp(db,users,run){
 const auth=async(req,res,next)=>{req.user=users[req.get('x-fixture-actor')];if(!req.user)return res.status(401).json({error:'fixture identity missing'});try{await enforceBackofficeStaff(db,req,res);next()}catch(e){res.status(e.status||500).json({error:e.message,code:e.code})}};
 const source=fs.readFileSync(new URL('../src/routes/store-transactions.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export default .*;\n/gm,'');
 const router=new Function('Router','prisma','crypto','z','auth','executeHotTableBootstrap','supplierAdvanceContext','associateExpenseAsAdvance','allocateSupplierAdvance','requireStaffAction','requireStaffGrant',source+'\nreturn router;')(Router,db,crypto,z,auth,async()=>{},supplierAdvanceContext,associateExpenseAsAdvance,allocateSupplierAdvance,requireStaffAction,requireStaffGrant);
 const app=express();app.use(express.json());app.use('/api/transactions',router);const server=await new Promise(resolve=>{const v=app.listen(0,'127.0.0.1',()=>resolve(v))});
 const request=async(actor,path,{body,storeId='store'}={})=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/transactions${path}`,{method:body?'POST':'GET',headers:{'x-fixture-actor':actor,'x-backoffice-store-id':storeId,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()}};
 try{return await run(request)}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const user={id:'owner',role:'OWNER',tokenType:'USER',companyId:'company',fullName:'Virtual Owner'};
const scope={companyId:'company',storeId:'store',transactionId:'expense',user};
test('advance reassociation refuses operator and foreign owner before reading any ledger',async()=>{
 const db=new Proxy({},{get(){throw Error('unexpected database access')}});
 await assert.rejects(supplierAdvanceContext(db,{...scope,user:{...user,tokenType:'STORE_OPERATOR'}}),e=>e.status===403);
 await assert.rejects(supplierAdvanceContext(db,{...scope,companyId:'foreign'}),e=>e.status===403);
 await assert.rejects(allocateSupplierAdvance(db,{...scope,user:{...user,companyId:'foreign'}},{}),e=>e.status===403);
});
test('native advance: once-only cash-preserving reassociation, review boundary, future allocation, stale/scope rejection and atomic rollback',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),name='supplier_advance_'+crypto.randomBytes(6).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',name);
 await admin.$executeRawUnsafe(`CREATE SCHEMA "${name}"`);const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
 try{
  await db.$executeRawUnsafe('CREATE TABLE "Store"("id" text primary key,"companyId" text,"active" boolean)');
  await db.$executeRaw`INSERT INTO "Store" VALUES ('store','company',true)`;
  await db.$executeRawUnsafe('CREATE TABLE "StoreTransaction"("id" text primary key,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric(14,2),"description" text,"supplierId" text,"supplierName" text,"invoiceDocumentNumber" text,"invoicePaymentKey" text,"paymentMethod" text,"subtractFromShift" boolean,"reversedAt" timestamptz,"occurredAt" timestamptz,"actorId" text,"actorName" text,"attachmentFilename" text,"attachmentData" text)');
  await db.$executeRawUnsafe('CREATE TABLE "Supplier"("id" text primary key,"companyId" text,"name" text,"taxId" text,"active" boolean)');
  await db.$executeRawUnsafe('CREATE TABLE "OtherExpenseReview"("id" text primary key,"companyId" text,"storeId" text,"transactionId" text UNIQUE,"createdAt" timestamptz DEFAULT now(),"status" text,"reviewedBy" text,"reviewedAt" timestamptz,"reviewNote" text)');
  await db.$executeRawUnsafe('CREATE TABLE "SupplierPaymentSettlement"("id" text primary key,"companyId" text,"storeId" text,"transactionId" text UNIQUE,"supplierId" text,"status" text,"paymentMethod" text,"paidAt" timestamptz,"note" text,"createdBy" text,"createdByName" text)');
  await db.$executeRawUnsafe('CREATE TABLE "SupplierPaymentAllocation"("id" text primary key,"companyId" text,"settlementId" text,"purchaseDocumentId" text,"amount" numeric(14,2),UNIQUE("settlementId","purchaseDocumentId"))');
  await db.$executeRawUnsafe('CREATE TABLE "PurchaseDocument"("id" text primary key,"companyId" text,"storeId" text,"supplierId" text,"documentNumber" text,"totalGross" numeric(14,2),"status" text,"settlementMode" text,"documentType" text)');
  await db.$executeRawUnsafe('CREATE TABLE "StoreOperatorAudit"("id" text primary key,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb)');
  await db.$executeRawUnsafe('CREATE TABLE "BankLedgerEntry"("id" text primary key,"companyId" text,"sourceTransactionId" text,"amount" numeric(14,2))');
  await db.$executeRawUnsafe('CREATE TABLE "WorkforceEmployeePayment"("id" text primary key,"companyId" text,"storeId" text,"sourceId" text)');
  await db.$executeRawUnsafe('CREATE TABLE "Control"("id" text primary key,"cash" numeric(14,2),"stock" int)');
  await db.$executeRaw`INSERT INTO "Control" VALUES ('other-terminal',44.10,100)`;
  await db.$executeRaw`INSERT INTO "Supplier" VALUES ('supplier','company','VIRTUAL SUPPLIER','000',true),('foreign','foreign','FOREIGN','111',true)`;
  await db.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","paymentMethod","subtractFromShift","occurredAt","actorId") VALUES ('expense','company','store','closed-historical-shift','OTHER_EXPENSE',6.17,'virtual supplier difference','CASH_SHIFT',true,'2026-10-19T17:23:48Z','operator'),('control','company','store','other-shift','OTHER_EXPENSE',2,'control','CASH_SHIFT',true,'2026-10-19T17:23:48Z','operator')`;
  await db.$executeRaw`INSERT INTO "OtherExpenseReview" ("id","companyId","storeId","transactionId","status") VALUES ('review','company','store','expense','PENDING_REVIEW')`;
  await db.$executeRaw`INSERT INTO "PurchaseDocument" VALUES ('invoice','company','store','supplier','VIRTUAL-002',20,'DRAFT','CREDIT','INVOICE'),('other-store','company','other-store','supplier','FOREIGN',20,'DRAFT','CREDIT','INVOICE')`;
  await db.$executeRawUnsafe('ALTER TABLE "PurchaseDocument" ADD COLUMN "paymentTransactionId" text');
  await db.$executeRaw`INSERT INTO "WorkforceEmployeePayment" VALUES ('payroll','company','store','expense')`;
  await assert.rejects(supplierAdvanceContext(db,scope),e=>e.status===409);await db.$executeRawUnsafe('TRUNCATE "WorkforceEmployeePayment"');
  await db.$executeRaw`UPDATE "PurchaseDocument" SET "paymentTransactionId"='expense' WHERE "id"='invoice'`;await assert.rejects(supplierAdvanceContext(db,scope),e=>e.status===409);await db.$executeRaw`UPDATE "PurchaseDocument" SET "paymentTransactionId"=NULL`;
  const immutable=async()=>JSON.stringify({rows:await db.$queryRaw`SELECT "id","amount","sessionId","occurredAt","actorId","subtractFromShift","paymentMethod","description","reversedAt" FROM "StoreTransaction" ORDER BY "id"`,control:await db.$queryRaw`SELECT * FROM "Control"`,bank:await db.$queryRaw`SELECT * FROM "BankLedgerEntry"`,docs:await db.$queryRaw`SELECT * FROM "PurchaseDocument" ORDER BY "id"`});
  const http=registered(db),path='/other-expenses/:reviewId/supplier-advance';
  assert.equal((await http('get',path,{reviewId:'review'},null,{...user,companyId:'foreign'})).status,404);
  assert.equal((await http('get',path,{reviewId:'review'},null,{...user,tokenType:'STORE_OPERATOR',permissions:['STORE_LEDGER']})).status,403);
  const response=await http('get',path,{reviewId:'review'},null,user);assert.equal(response.status,200);
  const before=await immutable(),ctx=response.data,body={supplierId:'supplier',expectedVersion:ctx.expectedVersion,expectedAmount:6.17,reason:'virtual supplier advance correction',acknowledged:true,idempotencyKey:crypto.randomUUID()};
  await assert.rejects(associateExpenseAsAdvance(db,scope,{...body,supplierId:'foreign'}),e=>e.status===404);
  await assert.rejects(associateExpenseAsAdvance(db,scope,{...body,expectedVersion:'a'.repeat(64)}),e=>e.status===409);
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "SupplierPaymentSettlement"`)[0].n,0);
  const responses=await Promise.all([http('post',path,{reviewId:'review'},body,user),http('post',path,{reviewId:'review'},body,user)]);assert.deepEqual(responses.map(r=>r.status),[200,200]);const results=responses.map(r=>r.data);assert.equal(results.filter(r=>r.duplicate).length,1);const result=results[0];
  assert.equal(await immutable(),before);assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "StoreTransaction"`)[0].n,2);assert.equal((await db.$queryRaw`SELECT * FROM "StoreTransaction" WHERE "id"='expense'`)[0].type,'SUPPLIER_PAYMENT');assert.equal((await db.$queryRaw`SELECT * FROM "OtherExpenseReview"`)[0].status,'CANCELLED');assert.equal((await db.$queryRaw`SELECT * FROM "SupplierPaymentSettlement"`)[0].status,'PENDING_REVIEW');
  await assert.rejects(associateExpenseAsAdvance(db,scope,{...body,reason:'changed reason'}),e=>e.status===409);
  const allocationScope={companyId:'company',storeId:'store',settlementId:result.settlementId,user};
  const allocation={expectedAvailable:6.17,allocations:[{purchaseDocumentId:'invoice',amount:2}],idempotencyKey:crypto.randomUUID()};
  await assert.rejects(allocateSupplierAdvance(db,allocationScope,allocation),e=>e.status===409);
  await db.$executeRaw`UPDATE "SupplierPaymentSettlement" SET "status"='CONFIRMED' WHERE "id"=${result.settlementId}`;
  await assert.rejects(allocateSupplierAdvance(db,allocationScope,{...allocation,allocations:[{purchaseDocumentId:'other-store',amount:2}]}),e=>e.status===409);
  const allocated=await Promise.all([allocateSupplierAdvance(db,allocationScope,allocation),allocateSupplierAdvance(db,allocationScope,allocation)]);assert.equal(allocated.filter(r=>r.duplicate).length,1);assert.equal(allocated[0].advanceAmount,4.17);assert.equal(await immutable(),before);
  assert.equal(Number((await db.$queryRaw`SELECT SUM("amount") AS n FROM "SupplierPaymentAllocation"`)[0].n),2);
  await assert.rejects(allocateSupplierAdvance(db,allocationScope,{...allocation,idempotencyKey:crypto.randomUUID()}),e=>e.status===409);
  await assert.rejects(allocateSupplierAdvance(db,allocationScope,{expectedAvailable:4.17,allocations:[{purchaseDocumentId:'invoice',amount:5}],idempotencyKey:crypto.randomUUID()}),e=>e.status===409);
  const failAudit=new Proxy(db,{get(t,k){if(k==='$transaction')return cb=>t.$transaction(tx=>cb(new Proxy(tx,{get(target,key){if(key==='$executeRaw')return (strings,...values)=>{if(strings.join('').includes('INSERT INTO "StoreOperatorAudit"'))throw Error('virtual audit failure');return target.$executeRaw(strings,...values)};const v=target[key];return typeof v==='function'?v.bind(target):v}})));const v=t[k];return typeof v==='function'?v.bind(t):v}});
  await assert.rejects(allocateSupplierAdvance(failAudit,allocationScope,{expectedAvailable:4.17,allocations:[{purchaseDocumentId:'invoice',amount:1}],idempotencyKey:crypto.randomUUID()}),/virtual audit failure/);
  assert.equal(Number((await db.$queryRaw`SELECT SUM("amount") AS n FROM "SupplierPaymentAllocation"`)[0].n),2);assert.equal(await immutable(),before);
  // Reassociation itself also rolls back if its mandatory audit cannot commit.
  await db.$executeRaw`UPDATE "StoreTransaction" SET "type"='OTHER_EXPENSE',"supplierId"=NULL,"supplierName"=NULL WHERE "id"='expense'`;
  await db.$executeRawUnsafe('TRUNCATE "SupplierPaymentAllocation","SupplierPaymentSettlement","StoreOperatorAudit"');await db.$executeRaw`UPDATE "OtherExpenseReview" SET "status"='PENDING_REVIEW'`;
  const fresh=await supplierAdvanceContext(db,scope);await assert.rejects(associateExpenseAsAdvance(failAudit,scope,{...body,expectedVersion:fresh.expectedVersion}),/virtual audit failure/);assert.equal((await db.$queryRaw`SELECT "type" FROM "StoreTransaction" WHERE "id"='expense'`)[0].type,'OTHER_EXPENSE');assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "SupplierPaymentSettlement"`)[0].n,0);assert.equal((await db.$queryRaw`SELECT "status" FROM "OtherExpenseReview"`)[0].status,'PENDING_REVIEW');
  // Actual delegated identity/grants/modules; original owner behavior above is retained.
  const delegated=await installStaffActionPolicy(db,{companyId:'company',storeId:'store',capabilities:['payments.read','payments.supplier-recovery']});
  const delegatedScope={...scope,user:delegated};
  const delegatedContext=await supplierAdvanceContext(db,delegatedScope);
  await assert.rejects(supplierAdvanceContext(db,{...delegatedScope,storeId:'other-store'}),e=>e.status===403);
  await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "capabilities"='["payments.read","approvals.read"]'::jsonb`;
  await assert.rejects(supplierAdvanceContext(db,delegatedScope),e=>e.status===403);
  await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "capabilities"='["payments.read","payments.supplier-recovery"]'::jsonb`;
  const delegatedBody={...body,expectedVersion:delegatedContext.expectedVersion,idempotencyKey:crypto.randomUUID()};
  await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "active"=false`;
  await assert.rejects(associateExpenseAsAdvance(db,delegatedScope,delegatedBody),e=>e.status===403);
  await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "active"=true`;
  await db.$executeRaw`UPDATE "CompanyModule" SET "active"=false WHERE "moduleKey"='CASH_CONTROL'`;
  await assert.rejects(supplierAdvanceContext(db,delegatedScope),e=>e.code==='MODULE_DISABLED');
  await db.$executeRaw`UPDATE "CompanyModule" SET "active"=true`;
  await db.$executeRawUnsafe('CREATE TABLE "StoreLifecycleFence" ("storeId" text,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)');
  await db.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES ('store','company',0,true,false)`;
  await assert.rejects(supplierAdvanceContext(db,delegatedScope),e=>e.code==='STORE_LIFECYCLE_MAINTENANCE');
  await db.$executeRaw`UPDATE "StoreLifecycleFence" SET "maintenance"=false`;
  const beforeDelegated=await immutable();
  // Fail the last fresh grant check after audit insertion: all financial writes roll back.
  const revokeAtEnd=new Proxy(db,{get(target,key){if(key==='$transaction')return cb=>target.$transaction(tx=>cb(new Proxy(tx,{get(t,k){if(k==='$executeRaw')return async(strings,...values)=>{const value=await t.$executeRaw(strings,...values);if(strings.join('').includes('INSERT INTO "StoreOperatorAudit"'))await t.$executeRaw`UPDATE "BackofficeStaffGrant" SET "active"=false`;return value};const v=t[k];return typeof v==='function'?v.bind(t):v}})));const v=target[key];return typeof v==='function'?v.bind(target):v}});
  await assert.rejects(associateExpenseAsAdvance(revokeAtEnd,delegatedScope,delegatedBody),e=>e.status===403);
  assert.equal((await db.$queryRaw`SELECT "active" FROM "BackofficeStaffGrant"`)[0].active,true);
  assert.equal((await db.$queryRaw`SELECT "type" FROM "StoreTransaction" WHERE "id"='expense'`)[0].type,'OTHER_EXPENSE');
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "SupplierPaymentSettlement"`)[0].n,0);
  await db.$executeRawUnsafe(`ALTER TABLE "Store" ADD COLUMN "name" text DEFAULT 'Synthetic store'`);
  const delegatedResults=await withRecoveryHttp(db,{owner:user,staff:delegated,manager:{...user,role:'MANAGER'}},async request=>{
   const base='/stores/store/invoice-recovery';
   const list=await request('staff',base);assert.equal(list.status,200);assert.equal(list.data.items.length,1);assert.equal(list.data.items[0].transactionId,'expense');assert.deepEqual(list.data.companies,[]);
   assert.equal((await request('owner',base+'/expense/supplier')).status,200);
   assert.equal((await request('manager',base)).status,403);
   assert.equal((await request('staff','/stores/other-store/invoice-recovery')).status,403);
   assert.equal((await request('staff',base+'/expense/supplier',{storeId:'foreign'})).status,403);
   await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "capabilities"='["payments.read","approvals.read"]'::jsonb`;
   assert.equal((await request('staff',base)).status,403);
   await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "capabilities"='["payments.read","payments.supplier-recovery"]'::jsonb`;
   assert.equal((await request('staff',base+'/expense/supplier',{body:{...delegatedBody,companyId:'foreign'}})).status,400);
   const replies=await Promise.all([request('staff',base+'/expense/supplier',{body:delegatedBody}),request('staff',base+'/expense/supplier',{body:delegatedBody})]);assert.deepEqual(replies.map(r=>r.status),[200,200]);return replies.map(r=>r.data);
  });
  assert.equal(delegatedResults.filter(r=>r.duplicate).length,1);assert.equal(await immutable(),beforeDelegated);
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "StoreTransaction"`)[0].n,2);
  assert.equal((await db.$queryRaw`SELECT "status" FROM "SupplierPaymentSettlement"`)[0].status,'PENDING_REVIEW');
  await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "active"=false`;
  await assert.rejects(associateExpenseAsAdvance(db,delegatedScope,delegatedBody),e=>e.status===403);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);await admin.$disconnect()}
});
