import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pendingInventoryPurchaseDocuments} from '../src/lib/inventory-product-merge.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test('posted POS source is historical only with complete company/store/reciprocal approved-posting proof',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client');
 const admin=new PrismaClient(),schema='merge_source_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);
 url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await db.$executeRawUnsafe('CREATE TABLE "PurchaseDocument" ("id" text primary key,"companyId" text,"storeId" text,"status" text,"purchaseOrderId" text,"sourceType" text)');
  await db.$executeRawUnsafe('CREATE TABLE "PurchaseDocumentLine" ("id" text primary key,"purchaseDocumentId" text,"productId" text,"quantity" numeric,"grossAmount" numeric)');
  await db.$executeRawUnsafe('CREATE TABLE "PurchaseOrder" ("id" text primary key,"companyId" text,"storeId" text,"status" text,"sourceDocumentId" text,"sourceType" text)');
  await db.$executeRawUnsafe('CREATE TABLE "PurchaseOrderPosting" ("orderId" text primary key,"companyId" text,"purchaseDocumentId" text)');
  await db.$executeRaw`INSERT INTO "PurchaseDocument" VALUES ('source','co','A','DRAFT','order','POS_OCR_DRAFT'),('approved','co','A','APPROVED',NULL,'PURCHASE_ORDER')`;
  await db.$executeRaw`INSERT INTO "PurchaseDocumentLine" VALUES ('line','source','selected',3,7.5)`;
  await db.$executeRaw`INSERT INTO "PurchaseOrder" VALUES ('order','co','A','INVOICED','source','POS_OCR_DRAFT')`;
  await db.$executeRaw`INSERT INTO "PurchaseOrderPosting" VALUES ('order','co','approved')`;
  const snapshot=async()=>({
   docs:await db.$queryRaw`SELECT * FROM "PurchaseDocument" ORDER BY "id"`,
   lines:await db.$queryRaw`SELECT * FROM "PurchaseDocumentLine" ORDER BY "id"`,
   orders:await db.$queryRaw`SELECT * FROM "PurchaseOrder" ORDER BY "id"`,
   postings:await db.$queryRaw`SELECT * FROM "PurchaseOrderPosting" ORDER BY "orderId"`
  });
  const read=()=>pendingInventoryPurchaseDocuments(db,'co','A',['selected']);
  const initial=await snapshot();
  assert.deepEqual(await read(),[]);
  assert.deepEqual(await snapshot(),initial,'preview is strictly read-only; no approval, quantity or financial changes');
  await db.$executeRaw`UPDATE "PurchaseOrder" SET "status"='FINAL'`;
  assert.deepEqual(await read(),[],'FINAL already posts inventory and also qualifies');
  await db.$executeRaw`UPDATE "PurchaseOrder" SET "status"='INVOICED'`;

  // Any missing or inconsistent proof must keep the source as a blocker.
  const cases=[
   ['PurchaseDocument','approved','status','DRAFT','APPROVED'],
   ['PurchaseDocument','approved','storeId','B','A'],
   ['PurchaseDocument','approved','companyId','foreign','co'],
   ['PurchaseDocument','source','sourceType','OCR_DRAFT','POS_OCR_DRAFT'],
   ['PurchaseDocument','source','purchaseOrderId','missing','order'],
   ['PurchaseOrder','order','sourceType','MANUAL','POS_OCR_DRAFT'],
   ['PurchaseOrder','order','status','NEW','INVOICED'],
   ['PurchaseOrder','order','status','CANCELLED','INVOICED'],
   ['PurchaseOrder','order','sourceDocumentId','other','source'],
   ['PurchaseOrder','order','storeId','B','A'],
   ['PurchaseOrder','order','companyId','foreign','co'],
  ];
  for(const [table,id,column,bad,good] of cases){
   await db.$executeRawUnsafe(`UPDATE "${table}" SET "${column}"=$1 WHERE "id"=$2`,bad,id);
   const before=await snapshot();
   assert.equal((await read()).length,1,`${table}.${column}=${bad} must block`);
   assert.deepEqual(await snapshot(),before);
   await db.$executeRawUnsafe(`UPDATE "${table}" SET "${column}"=$1 WHERE "id"=$2`,good,id);
  }
  for(const [column,bad,good] of [['companyId','foreign','co'],['purchaseDocumentId','missing','approved'],['orderId','other','order']]){
   await db.$executeRawUnsafe(`UPDATE "PurchaseOrderPosting" SET "${column}"=$1`,bad);
   assert.equal((await read()).length,1,`posting.${column} mismatch must block`);
   await db.$executeRawUnsafe(`UPDATE "PurchaseOrderPosting" SET "${column}"=$1`,good);
  }
  await db.$executeRaw`DELETE FROM "PurchaseOrderPosting"`;
  assert.equal((await read()).length,1,'INVOICED status alone is insufficient');
  await db.$executeRaw`INSERT INTO "PurchaseOrderPosting" VALUES ('order','co','approved')`;
  await db.$executeRaw`INSERT INTO "PurchaseDocument" VALUES ('genuine','co','A','DRAFT',NULL,'OCR_DRAFT')`;
  await db.$executeRaw`INSERT INTO "PurchaseDocumentLine" VALUES ('genuine-line','genuine','selected',2,5)`;
  assert.equal((await read()).length,1,'a separate real pending draft still blocks');
  assert.deepEqual(await pendingInventoryPurchaseDocuments(db,'co','A',['unselected']),[]);
  await db.$executeRaw`UPDATE "PurchaseDocument" SET "storeId"='B' WHERE "id"='genuine'`;
  assert.deepEqual(await read(),[],'other-store drafts excluded');
  await db.$executeRaw`UPDATE "PurchaseDocument" SET "storeId"='A',"companyId"='foreign' WHERE "id"='genuine'`;
  assert.deepEqual(await read(),[],'foreign-company drafts excluded');
  assert.deepEqual(await pendingInventoryPurchaseDocuments(db,'co','B',['selected']),[]);
 }finally{
  await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();
 }
});
