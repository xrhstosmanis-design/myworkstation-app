import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
const url=process.env.DATABASE_URL;
test('actual VAT startup SQL: observed null categories are read-only; fiscal mismatches roll back',{skip:process.env.NODE_ENV!=='test'||!url,timeout:30000},async()=>{
 const target=new URL(url);assert.ok(['localhost','127.0.0.1','[::1]'].includes(target.hostname));assert.match(target.pathname,/_test$/);
 const schema='vat_startup_'+randomUUID().replaceAll('-',''),admin=new PrismaClient({datasourceUrl:url});let db;
 const company='cmulmjjoa000oqlbfyi0h53ju';
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);target.searchParams.set('schema',schema);db=new PrismaClient({datasourceUrl:target.href});
  await db.$executeRawUnsafe('CREATE TABLE "ManagementVatDepartment" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"description" TEXT,"vatRate" NUMERIC,"cashRegisterDepartment" INT,"legacyVatCode" TEXT,"updatedAt" TIMESTAMP)');
  await db.$executeRawUnsafe('CREATE TABLE "ProductCategory" ("id" TEXT PRIMARY KEY,"name" TEXT)');
  await db.$executeRawUnsafe('CREATE TABLE "Product" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"vatDepartmentId" TEXT,"categoryId" TEXT,"vatRate" NUMERIC,"updatedAt" TIMESTAMP)');
  await db.$executeRaw`INSERT INTO "ManagementVatDepartment" VALUES ('t',${company},'1.ΚΑΠΝΙΚΑ',0,1,'12',NULL),('s',${company},'ΕΙΔΗ 24',24,6,'15',NULL)`;
  await db.$executeRawUnsafe(`INSERT INTO "ProductCategory" VALUES ('tobacco','ΚΑΠΝΙΚΑ'),('other','OTHER')`);
  await db.$executeRaw`INSERT INTO "Product" SELECT 'p'||n,${company},'t',CASE WHEN n<=568 THEN 'tobacco' ELSE NULL END,0,NULL FROM generate_series(1,570) n`;
  const source=fs.readFileSync(new URL('../scripts/repair-diadoxou-vat.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor,execute=new AsyncFunction('prisma','console',source);
  // The actual transaction runs against isolated real tables; retain connection for assertions.
  const adapter={$transaction:fn=>db.$transaction(fn),$disconnect:async()=>{}};
  const snapshot=async()=>JSON.stringify(await db.$queryRaw`SELECT row_to_json(p)::text row FROM "Product" p ORDER BY "id"`);
  const before=await snapshot();await execute(adapter,{log(){}});assert.equal(await snapshot(),before);
  for(const rate of [24,null]){
   await db.$executeRaw`UPDATE "Product" SET "vatRate"=${rate} WHERE "id"='p570'`;
   const control=await snapshot();await assert.rejects(execute(adapter,{log(){}}),/unexpected data/);assert.equal(await snapshot(),control);
  }
  await db.$executeRawUnsafe(`UPDATE "Product" SET "vatRate"=0,"categoryId"='other' WHERE "id"='p570'`);
  await assert.rejects(execute(adapter,{log(){}}),/unexpected data/);
  await db.$executeRawUnsafe(`UPDATE "Product" SET "categoryId"=NULL WHERE "id"='p570'`);
  await db.$executeRawUnsafe(`UPDATE "ManagementVatDepartment" SET "cashRegisterDepartment"=2 WHERE "id"='t'`);
  await assert.rejects(execute(adapter,{log(){}}),/unexpected data/);
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int n FROM "Product" WHERE "updatedAt" IS NOT NULL`)[0].n,0);
  assert.equal((await db.$queryRaw`SELECT COUNT(*)::int n FROM "ManagementVatDepartment" WHERE "updatedAt" IS NOT NULL`)[0].n,0);
 }finally{if(db)await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
