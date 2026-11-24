import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import express from 'express';
const url=process.env.POS_ORDER_PROPOSALS_TEST_DATABASE_URL||process.env.DATABASE_URL;
test('POS order proposal actual HTTP/PostgreSQL: grant, quantity, revoke, tenant and no business writes',{skip:!url||process.env.NODE_ENV!=='test',timeout:45000},async t=>{
 const target=new URL(url);assert.ok(['localhost','127.0.0.1','[::1]'].includes(target.hostname));assert.match(target.pathname,/_test$/);
 const schema='pos_proposals_'+randomUUID().replaceAll('-',''),admin=new PrismaClient({datasourceUrl:url});let db,server,globalDb;
 const previous=process.env.DATABASE_URL;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);target.searchParams.set('schema',schema);process.env.DATABASE_URL=target.href;db=new PrismaClient({datasourceUrl:target.href});
  const tables={Company:'"id" TEXT PRIMARY KEY,"name" TEXT,"active" BOOLEAN,"licenseStatus" TEXT,"subscriptionEndsAt" TIMESTAMP',CompanyModule:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"moduleKey" TEXT,"active" BOOLEAN,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP',Store:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"active" BOOLEAN',StorePaidModule:'"id" TEXT PRIMARY KEY,"storeId" TEXT,"moduleKey" TEXT,"active" BOOLEAN,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP',Product:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"sku" TEXT,"unit" TEXT,"active" BOOLEAN,"trackStock" BOOLEAN',StoreProduct:'"id" TEXT PRIMARY KEY,"storeId" TEXT,"productId" TEXT,"currentStock" NUMERIC,"minStock" NUMERIC,"active" BOOLEAN',Recipe:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"productId" TEXT,"active" BOOLEAN',PreparationRecipeLine:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"productId" TEXT,"automatic" BOOLEAN',Sale:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"status" TEXT,"source" TEXT,"occurredAt" TIMESTAMP',SaleLine:'"id" TEXT PRIMARY KEY,"saleId" TEXT,"productId" TEXT,"quantity" NUMERIC',PurchaseOrder:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"status" TEXT,"awaitingInvoice" BOOLEAN',PurchaseOrderLine:'"id" TEXT PRIMARY KEY,"orderId" TEXT,"productId" TEXT,"quantity" NUMERIC,"stockUnitsPerInvoiceUnit" NUMERIC',Employee:'"id" TEXT PRIMARY KEY,"storeId" TEXT,"active" BOOLEAN',StoreOperatorCredential:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"employeeId" TEXT,"active" BOOLEAN',StoreOperatorProfile:'"companyId" TEXT,"storeId" TEXT,"employeeId" TEXT,"permissions" JSONB,"posAccess" BOOLEAN'};
  for(const [name,columns] of Object.entries(tables))await db.$executeRawUnsafe(`CREATE TABLE "${name}" (${columns})`);
  for(const sql of [
   `INSERT INTO "Company" VALUES ('a','A',true,'ACTIVE',NULL),('b','B',true,'ACTIVE',NULL)`,
   `INSERT INTO "Store" VALUES ('a1','a','A1',true),('a2','a','A2',true),('b1','b','B1',true)`,
   `INSERT INTO "CompanyModule" VALUES ('m','a','ORDER_SUGGESTIONS',true,NULL,NULL)`,
   `INSERT INTO "Product" VALUES ('p','a','Water','P','PIECE',true,true),('foreign','b','Foreign','F','PIECE',true,true)`,
   `INSERT INTO "StoreProduct" VALUES ('sp','a1','p',2,5,true),('control','a2','p',99,5,true),('foreign','b1','foreign',50,10,true)`,
   `INSERT INTO "Employee" VALUES ('e','a1',true)`,
   `INSERT INTO "StoreOperatorCredential" VALUES ('op','a','a1','e',true)`,
   `INSERT INTO "StoreOperatorProfile" VALUES ('a','a1','e','{"orderSuggestionsPos":true}',true)`
  ])await db.$executeRawUnsafe(sql);
  const recent=new Date(Date.now()-86400000);await db.$executeRaw`INSERT INTO "Sale" VALUES ('s','a','a1','COMPLETED','POS',${recent})`;await db.$executeRaw`INSERT INTO "SaleLine" VALUES ('l','s','p',28)`;
  const {createPosOrderSuggestionsRouter}=await import('../src/routes/pos-order-suggestions.js');
  globalDb=(await import('../src/prisma.js')).prisma;
  let revokeDuringRead=false;
  const {readOrderSuggestions}=await import('../src/routes/order-suggestions.js');
  const router=createPosOrderSuggestionsRouter({db,read:async(connection,scope)=>{const result=await readOrderSuggestions(connection,scope);if(revokeDuringRead)await db.$executeRaw`UPDATE "StoreOperatorProfile" SET "permissions"='{}'::jsonb`;return result}});
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=req.get('x-actor')==='owner'?{id:'owner',companyId:'a',role:'OWNER'}:{id:'op',operatorId:'op',companyId:'a',storeId:'a1',tokenType:'STORE_OPERATOR',role:'EMPLOYEE',permissions:[]};next()});app.use(router);app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const root=`http://127.0.0.1:${server.address().port}`;
  const request=(path,options={})=>fetch(root+path,options);
  const grant=()=>db.$executeRaw`UPDATE "StoreOperatorProfile" SET "permissions"='{"orderSuggestionsPos":true}'::jsonb,"posAccess"=TRUE`;
  await t.test('real proposal is eight pieces, same store only, without creating an order or changing stock',async()=>{
   const allowed=await request('/stores/a1/permission');assert.equal(allowed.status,200);assert.equal(allowed.headers.get('cache-control'),'no-store');
   const response=await request('/stores/a1/proposal'),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.storeId,'a1');assert.equal(body.rows.length,1);assert.equal(body.rows[0].suggestedQuantity,8);assert.equal(body.rows[0].currentStock,2);assert.deepEqual(body.options,{historyDays:28,coverageDays:7,leadDays:3});
   assert.equal((await request('/stores/a2/proposal')).status,403);assert.equal((await request('/stores/b1/proposal',{headers:{'x-actor':'owner'}})).status,404);
   assert.equal((await request('/stores/a1/proposal?historyDays=0')).status,400);
   assert.equal((await request('/stores/a1/proposal',{method:'POST'})).status,404);
  });
  await t.test('revocation is checked after reading too, with no response data leakage',async()=>{
   revokeDuringRead=true;const response=await request('/stores/a1/proposal');assert.equal(response.status,403);assert.equal((await response.json()).rows,undefined);revokeDuringRead=false;
   assert.equal((await request('/stores/a1/permission')).status,403);await grant();
  });
  await t.test('inactive employee, credential, POS access and module all deny reads',async()=>{
   await db.$executeRaw`UPDATE "Employee" SET "active"=FALSE`;assert.equal((await request('/stores/a1/permission')).status,403);await db.$executeRaw`UPDATE "Employee" SET "active"=TRUE`;
   await db.$executeRaw`UPDATE "StoreOperatorCredential" SET "active"=FALSE`;assert.equal((await request('/stores/a1/permission')).status,403);await db.$executeRaw`UPDATE "StoreOperatorCredential" SET "active"=TRUE`;
   await db.$executeRaw`UPDATE "StoreOperatorProfile" SET "posAccess"=FALSE`;assert.equal((await request('/stores/a1/permission')).status,403);await grant();
   await db.$executeRaw`INSERT INTO "StorePaidModule" VALUES ('off','a1','ORDER_SUGGESTIONS',FALSE,NULL,NULL)`;assert.equal((await request('/stores/a1/permission')).status,403);
  });
  const stocks=await db.$queryRaw`SELECT "id","currentStock","minStock" FROM "StoreProduct" ORDER BY "id"`;assert.deepEqual(stocks.map(r=>[r.id,Number(r.currentStock),Number(r.minStock)]),[['control',99,5],['foreign',50,10],['sp',2,5]]);
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int n FROM "PurchaseOrder"`)[0].n,0);assert.equal((await db.$queryRaw`SELECT COUNT(*)::int n FROM "Sale"`)[0].n,1);
  const extra=await db.$queryRaw`SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${schema} AND relname LIKE 'WeeklyStockAlarm%'`;assert.equal(extra.length,0);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));if(globalDb)await globalDb.$disconnect();if(db)await db.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;
 }
});
