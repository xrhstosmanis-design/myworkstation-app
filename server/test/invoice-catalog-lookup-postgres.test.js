import test from 'node:test';
import assert from 'node:assert/strict';
import {createInvoiceCatalogLookup} from '../src/lib/invoice-catalog-lookup.js';

const database=process.env.DATABASE_URL;
const isolated=()=>{try{const u=new URL(database);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('isolated PostgreSQL executes scoped exact barcode and ranked/paged name lookup without modifying products',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),db=new PrismaClient();
 try{await db.$transaction(async tx=>{
  // Temporary tables shadow any application tables, are private to this connection,
  // and disappear at commit. No persistent fixture or production connection allowed.
  await tx.$executeRawUnsafe('CREATE TEMP TABLE "Store" ("id" text,"companyId" text) ON COMMIT DROP');
  await tx.$executeRawUnsafe('CREATE TEMP TABLE "PurchaseOrder" ("id" text,"storeId" text,"companyId" text) ON COMMIT DROP');
  await tx.$executeRawUnsafe('CREATE TEMP TABLE "PurchaseOrderLine" ("id" text,"orderId" text) ON COMMIT DROP');
  await tx.$executeRawUnsafe('CREATE TEMP TABLE "Product" ("id" text,"companyId" text,"name" text,"sku" text,"active" boolean,"vatRate" numeric,"salePrice" numeric,"costPrice" numeric) ON COMMIT DROP');
  await tx.$executeRawUnsafe('CREATE TEMP TABLE "StoreProduct" ("storeId" text,"productId" text,"active" boolean,"salePrice" numeric) ON COMMIT DROP');
  await tx.$executeRawUnsafe('CREATE TEMP TABLE "ProductBarcode" ("productId" text,"barcode" text) ON COMMIT DROP');
  await tx.$executeRaw`INSERT INTO "Store" VALUES ('A','co'),('B','co'),('foreign','other')`;
  await tx.$executeRaw`INSERT INTO "PurchaseOrder" VALUES ('order','A','co'),('other-order','foreign','other')`;
  await tx.$executeRaw`INSERT INTO "PurchaseOrderLine" VALUES ('line','order'),('foreign-line','other-order')`;
  for(const [id,company,name,store,active] of [['match','co','HALLS μέλι λεμόνι ΧΩΡΙΣ ΖΑΧΑΡΗ 32GR','A',true],['cherry','co','HALLS CHERRY','A',true],['wrong-store','co','HALLS OTHER','B',true],['foreign','other','HALLS FOREIGN','foreign',true],['inactive','co','HALLS INACTIVE','A',false]]){
   await tx.$executeRaw`INSERT INTO "Product" VALUES (${id},${company},${name},${id},${active},13,1.2,1)`;
   await tx.$executeRaw`INSERT INTO "StoreProduct" VALUES (${store},${id},true,1.3)`;
   await tx.$executeRaw`INSERT INTO "ProductBarcode" VALUES (${id},'5200000000000')`;
  }
  const lookup=createInvoiceCatalogLookup(tx);
  const run=async(query,lineId='line')=>{const res={code:200,status(n){this.code=n;return this},json(data){this.body=data;return this}};let error;await lookup({user:{companyId:'co'},params:{orderId:'order',lineId},query},res,e=>error=e);if(error)throw error;return res};
  let result=await run({barcode:'5200000000000',storeId:'A'});assert.deepEqual(result.body.rows.map(p=>p.id).sort(),['cherry','match']);assert.equal(result.body.exact,true);
  assert.equal((await run({barcode:'5200000000001'})).body.rows.length,0);
  result=await run({q:'ΚΑΡ HLS ΜΕΛ/ΛΕΜΟΝΙ Χ/Ζ 32GX20'});assert.equal(result.body.rows[0].id,'match');assert.equal(result.body.total,2);
  assert.equal((await run({q:'halls',storeId:'B'})).code,404);assert.equal((await run({q:'halls'},'foreign-line')).code,404);
  for(let i=0;i<26;i++){await tx.$executeRaw`INSERT INTO "Product" VALUES (${`page-${i}`},'co',${`HALLS PAGE ${i}`},${`page-${i}`},true,13,1,1)`;await tx.$executeRaw`INSERT INTO "StoreProduct" VALUES ('A',${`page-${i}`},true,1)`}
  result=await run({q:'halls'});assert.equal(result.body.rows.length,25);assert.equal(result.body.total,28);assert.equal(result.body.hasMore,true);assert.equal((await run({q:'halls',offset:'25'})).body.rows.length,3);
  const unchanged=await tx.$queryRaw`SELECT COUNT(*)::int AS count FROM "Product"`;assert.equal(unchanged[0].count,31);
 },{timeout:15000})}finally{await db.$disconnect()}
});
