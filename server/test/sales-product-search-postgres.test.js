import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {salesProductSearch} from '../src/lib/sales-product-search.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};

test('actual journal/unsold SQL matches barcode and literal Greek queries before caps, retains full receipts and isolates stores',{skip:!isolated(),timeout:60000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),db=new PrismaClient();
 try{await db.$transaction(async tx=>{
  const tables={
   Store:'"id" text,"companyId" text,"name" text',Product:'"id" text,"companyId" text,"name" text,"sku" text,"active" bool',
   StoreProduct:'"storeId" text,"productId" text,"active" bool',ProductBarcode:'"productId" text,"barcode" text',
   Sale:'"id" text,"companyId" text,"storeId" text,"receiptNumber" text,"total" numeric,"subtotal" numeric,"discount" numeric,"audience" text,"occurredAt" timestamp,"createdAt" timestamp,"status" text,"transactionMode" text,"delayedReason" text,"reversalState" text,"reversalKind" text,"originalSaleId" text,"fiscalStatus" text,"source" text,"customerId" text',
   SaleLine:'"id" text,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"lineTotal" numeric,"createdAt" timestamp',
   Payment:'"id" text,"saleId" text,"method" text,"amount" numeric,"createdAt" timestamp',Customer:'"id" text,"companyId" text,"name" text',
   StoreTransaction:'"companyId" text,"storeId" text,"actorName" text,"description" text,"occurredAt" timestamp'
  };
  for(const [name,columns] of Object.entries(tables))await tx.$executeRawUnsafe(`CREATE TEMP TABLE "${name}"(${columns}) ON COMMIT DROP`);
  await tx.$executeRawUnsafe(`INSERT INTO "Store" VALUES('s','c','Selected'),('other','c','Other'),('foreign','x','Foreign')`);
  await tx.$executeRawUnsafe(`INSERT INTO "Product" VALUES('p','c','Νερό','SKU-P',true),('q','c','Other','SKU-Q',true),('u','c','50% Δώρο','SKU-U',true),('f','x','FOREIGN','F',true)`);
  await tx.$executeRawUnsafe(`INSERT INTO "StoreProduct" VALUES('s','p',true),('s','q',true),('s','u',true),('foreign','f',true)`);
  await tx.$executeRawUnsafe(`INSERT INTO "ProductBarcode" VALUES('p','ABC12_34%'),('f','ABC12_34%'),('u','UNSOLD')`);
  await tx.$executeRawUnsafe(`INSERT INTO "Sale"("id","companyId","storeId","total","occurredAt","createdAt","status","source") SELECT 'noise'||g,'c','s',2,'2026-11-28','2026-11-28','COMPLETED','POS' FROM generate_series(1,501)g`);
  await tx.$executeRawUnsafe(`INSERT INTO "SaleLine" SELECT 'noise-line'||g,'noise'||g,'q','Other',1,2,2,'2026-11-28' FROM generate_series(1,501)g`);
  await tx.$executeRawUnsafe(`INSERT INTO "Sale"("id","companyId","storeId","total","occurredAt","createdAt","status","source") VALUES('older','c','s',12,'2026-11-01','2026-11-01','COMPLETED','POS'),('other','c','other',999,'2026-11-28','2026-11-28','COMPLETED','POS'),('foreign','x','foreign',999,'2026-11-28','2026-11-28','COMPLETED','POS')`);
  await tx.$executeRawUnsafe(`INSERT INTO "SaleLine" VALUES('p-line','older','p','Νερό',1,2,2,'2026-11-01'),('q-line','older','q','Other',5,2,10,'2026-11-01'),('other-line','other','p','Νερό',1,999,999,'2026-11-28'),('foreign-line','foreign','f','FOREIGN',1,999,999,'2026-11-28')`);
  await tx.$executeRawUnsafe(`INSERT INTO "Payment" VALUES('payment','older','CASH',12,'2026-11-01')`);
  const journalSource=await readFile(new URL('../src/routes/store-pos-sale-display.js',import.meta.url),'utf8'),commerce=await readFile(new URL('../src/routes/commerce-v1.js',import.meta.url),'utf8');
  const query=(source,startMarker,endMarker,args)=>{
   const tail=source.slice(source.indexOf(startMarker)),start=tail.indexOf('await prisma.$queryRaw`'),end=tail.indexOf(endMarker,start);
   assert.ok(start>=0&&end>start);
   const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
   return new AsyncFunction(...args,'return '+tail.slice(start,end));
  };
  const journal=query(journalSource,'router.get("/sales/journal"',';\n    res.json',['prisma','req','storeId','from','to','operatorStoreId','search']);
  const unsold=query(commerce,'router.get("/sales/unsold-products"',';\n    res.json',['prisma','req','storeId','from','to','search']);
  const from=new Date('2026-10-31T22:00:00Z'),to=new Date('2026-11-28T21:59:59.999Z'),req={user:{companyId:'c'}};
  const before=await tx.$queryRaw`SELECT (SELECT COUNT(*) FROM "Sale")::int AS sales,(SELECT SUM("lineTotal") FROM "SaleLine") AS gross`;
  const all=await journal(tx,req,'s',from,to,null,salesProductSearch(''));assert.equal(all.length,500);assert.ok(!all.some(r=>r.id==='older'));
  for(const term of ['abc12_34%','νερο','SKU-P']){
   const rows=await journal(tx,req,'s',from,to,null,salesProductSearch(term));assert.deepEqual(rows.map(r=>r.id),['older']);assert.equal(Number(rows[0].total),12);assert.equal(rows[0].lines.length,2);assert.equal(rows[0].payments.length,1);
  }
  const foreign=await journal(tx,{user:{companyId:'x'}},'s',from,to,null,salesProductSearch('abc'));assert.equal(foreign.length,0);
  for(const term of ['%','δωρο','UNSOLD']){const rows=await unsold(tx,req,'s',from,to,salesProductSearch(term));assert.deepEqual(rows.map(r=>r.id),['u'])}
  assert.deepEqual(await tx.$queryRaw`SELECT (SELECT COUNT(*) FROM "Sale")::int AS sales,(SELECT SUM("lineTotal") FROM "SaleLine") AS gross`,before);
 },{timeout:55000});}finally{await db.$disconnect()}
});
