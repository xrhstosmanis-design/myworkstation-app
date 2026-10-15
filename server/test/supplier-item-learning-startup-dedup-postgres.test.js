import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/supplier-item-learning-bootstrap.js',import.meta.url),'utf8');
const sql=vm.runInNewContext(source.match(/`INSERT INTO "SupplierProductLink"[\s\S]*?`/)[0]);
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native startup learning backfill handles multiple aliases once, keeps deterministic latest code and preserves all mappings/tenant boundaries',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema=`supplier_start_${randomUUID().replaceAll('-','')}`,url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const statement of [
   'CREATE TABLE "Product"("id" text primary key,"companyId" text)',
   'CREATE TABLE "Supplier"("id" text primary key,"companyId" text)',
   'CREATE TABLE "SupplierProductMapping"("id" text primary key,"companyId" text,"supplierId" text,"productId" text,"supplierItemCode" text,"createdAt" timestamp,"updatedAt" timestamp,"lastSeenAt" timestamp,"confirmedAt" timestamp,UNIQUE("companyId","supplierId","supplierItemCode"))',
   'CREATE TABLE "SupplierProductLink"("id" text primary key,"companyId" text,"supplierId" text,"productId" text,"supplierCode" text,"active" bool,"source" text,"createdAt" timestamp,"updatedAt" timestamp,UNIQUE("companyId","supplierId","productId"))'
  ])await db.$executeRawUnsafe(statement);
  await db.$executeRaw`INSERT INTO "Product" VALUES('pa','a'),('card','a'),('pb','b')`;
  await db.$executeRaw`INSERT INTO "Supplier" VALUES('sa','a'),('sb','b')`;
  await db.$executeRaw`INSERT INTO "SupplierProductMapping" VALUES
   ('z-latest','a','sa','pa','LATEST','2026-10-01','2026-10-10','2026-10-11','2026-10-10'),
   ('a-old','a','sa','pa','OLD','2026-10-01','2026-10-01','2026-10-01','2026-10-01'),
   ('b-same-time','a','sa','pa','NEW','2026-10-01','2026-10-10','2026-10-11','2026-10-10'),
   ('b-tenant','b','sb','pb','B','2026-10-01','2026-10-05','2026-10-05','2026-10-05'),
   ('c-card','a','sa','card','','2026-10-01','2026-10-12','2026-10-12','2026-10-12'),
   ('foreign-supplier','a','sb','pa','WRONG-SUPPLIER','2026-10-01','2026-10-15','2026-10-15','2026-10-15'),
   ('foreign-product','a','sa','pb','WRONG-PRODUCT','2026-10-01','2026-10-15','2026-10-15','2026-10-15')`;
  await db.$executeRaw`INSERT INTO "SupplierProductLink" VALUES('existing-card','a','sa','card','CARD',false,'PRODUCT_CARD','2026-09-01','2026-10-01')`;
  const mappings=()=>db.$queryRaw`SELECT * FROM "SupplierProductMapping" ORDER BY "id"`,links=()=>db.$queryRaw`SELECT * FROM "SupplierProductLink" ORDER BY "companyId","supplierId","productId"`;
  const beforeMappings=await mappings(),beforeLinks=await links();
  // Exact former query: legitimate code aliases share one product-link target.
  const legacy=`INSERT INTO "SupplierProductLink" ("id","companyId","supplierId","productId","supplierCode","active","source","createdAt","updatedAt")
   SELECT md5(random()::text||clock_timestamp()::text),m."companyId",m."supplierId",m."productId",NULLIF(TRIM(m."supplierItemCode"),''),true,'INVOICE_LEARNING',m."createdAt",m."updatedAt"
   FROM "SupplierProductMapping" m JOIN "Product" p ON p."id"=m."productId" AND p."companyId"=m."companyId" JOIN "Supplier" s ON s."id"=m."supplierId" AND s."companyId"=m."companyId"
   ON CONFLICT ("companyId","supplierId","productId") DO UPDATE SET "supplierCode"=COALESCE(NULLIF(EXCLUDED."supplierCode",''),"SupplierProductLink"."supplierCode"),"active"=true,"source"=CASE WHEN "SupplierProductLink"."source"='PRODUCT_CARD' THEN "SupplierProductLink"."source" ELSE 'INVOICE_LEARNING' END,"updatedAt"=GREATEST("SupplierProductLink"."updatedAt",EXCLUDED."updatedAt")`;
  await assert.rejects(db.$transaction(tx=>tx.$executeRawUnsafe(legacy)),e=>e.meta?.code==='21000');
  assert.deepEqual(await links(),beforeLinks,'failed former statement must roll back');
  await db.$executeRawUnsafe(sql);
  const after=await links();assert.equal(after.length,3);assert.equal(after.find(x=>x.productId==='pa').supplierCode,'LATEST');assert.equal(after.find(x=>x.productId==='pb').companyId,'b');
  const card=after.find(x=>x.productId==='card');assert.equal(card.id,'existing-card');assert.equal(card.source,'PRODUCT_CARD');assert.equal(card.supplierCode,'CARD');assert.equal(card.active,true);assert.equal(card.createdAt.toISOString(),'2026-09-01T00:00:00.000Z');
  assert.deepEqual(await mappings(),beforeMappings,'all legitimate aliases must remain untouched');
  await db.$executeRawUnsafe(sql);assert.deepEqual(await links(),after,'repeat startup keeps stable link identities and values');assert.deepEqual(await mappings(),beforeMappings);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
