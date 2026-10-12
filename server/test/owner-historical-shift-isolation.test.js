import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const route=await readFile(new URL('../src/routes/owner-shifts.js',import.meta.url),'utf8');
const start=route.indexOf('router.get("/:sessionId/detail",'),source=route.slice(start,route.indexOf('\nrouter.post(',start));
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const n=v=>Number(v||0);
function handler(db){let fn;vm.runInNewContext(source,{router:{get(_,f){fn=f}},prisma:db,ensureSchema:async()=>{},normalizeShift:r=>r,normalizeTx:r=>({...r,amount:n(r.amount)}),n});return fn}
async function read(db,sessionId='online',companyId='C'){let body,status,error;await handler(db)({params:{sessionId},user:{companyId}},{status(v){status=v;return this},json(v){body=v}},e=>error=e);if(error)throw error;return{body,status}}
test('historical detail rejects an absent or foreign session before aggregate reads',async()=>{let reads=0;const result=await read({$queryRaw:async()=>{reads++;return[]}},'foreign');assert.equal(result.status,404);assert.equal(reads,1)});
test('native actual historical detail isolates overlapping shifts and counts mixed sale once',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='historical_shift_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Store"("id" text,"companyId" text,"name" text)',
   'CREATE TABLE "CashShiftSession"("id" text,"companyId" text,"storeId" text,"openedAt" timestamptz,"closedAt" timestamptz,"status" text,"cashSales" numeric DEFAULT 0,"cardSales" numeric DEFAULT 0,"openingOperational" numeric DEFAULT 0,"actualOperational" numeric DEFAULT 0,"variance" numeric DEFAULT 0)',
   'CREATE TABLE "Sale"("id" text,"companyId" text,"storeId" text,"status" text,"source" text,"total" numeric,"occurredAt" timestamptz)',
   'CREATE TABLE "StoreOperatorAudit"("id" text,"companyId" text,"storeId" text,"eventType" text,"details" jsonb)',
   'CREATE TABLE "StoreTransaction"("id" text,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric,"description" text,"supplierId" text,"supplierName" text,"subtractFromShift" boolean DEFAULT false,"actorId" text,"actorName" text,"occurredAt" timestamptz DEFAULT NOW(),"createdAt" timestamptz DEFAULT NOW(),"reversedAt" timestamptz,"reversedBy" text,"reversedByName" text,"reversalReason" text,"sourceType" text,"attachmentData" text,"attachmentFilename" text)',
   'CREATE TABLE "SaleLine"("id" text,"saleId" text,"productId" text,"description" text,"quantity" numeric,"unitPrice" numeric,"lineTotal" numeric,"createdAt" timestamptz DEFAULT NOW())',
   'CREATE TABLE "Product"("id" text,"companyId" text,"categoryId" text)',
   'CREATE TABLE "ProductCategory"("id" text,"companyId" text,"name" text)',
   'CREATE TABLE "Payment"("id" text,"saleId" text,"method" text,"amount" numeric)',
   `INSERT INTO "Store" VALUES('A','C','LAB'),('B','C','CONTROL'),('D','D','FOREIGN')`,
   `INSERT INTO "CashShiftSession"("id","companyId","storeId","openedAt","closedAt","status","cashSales") VALUES('online','C','A','2026-10-11','2026-10-13','CLOSED',1.4),('main','C','A','2026-10-11','2026-10-13','CLOSED',2.2),('other-store','C','B','2026-10-11','2026-10-13','CLOSED',0),('foreign','D','D','2026-10-11','2026-10-13','CLOSED',0)`,
   `INSERT INTO "Product" VALUES('pastry','C','cat')`, `INSERT INTO "ProductCategory" VALUES('cat','C','ΣΦΟΛΙΑΤΕΣ')`
  ])await db.$executeRawUnsafe(sql);
  const sales=[['online-sale','C','A','COMPLETED','ONLINE_POS',1.4],['main-sale','C','A','COMPLETED','POS',2.2],['unmapped','C','A','COMPLETED','ONLINE_POS',99],['prefix','C','A','COMPLETED','ONLINE_POS',99],['conflict','C','A','COMPLETED','POS',99],['unpaid','C','A','OPEN','ONLINE_POS',99],['foreign-sale','D','D','COMPLETED','ONLINE_POS',99],['other-store-sale','C','B','COMPLETED','ONLINE_POS',99]];
  for(const [id,company,store,status,kind,total] of sales){
   await db.$executeRaw`INSERT INTO "Sale" VALUES(${id},${company},${store},${status},${kind},${total},'2026-10-12T16:19:32Z')`;
   await db.$executeRaw`INSERT INTO "SaleLine"("id","saleId","productId","description","quantity","unitPrice","lineTotal") VALUES(${id},${id},'pastry','ΤΥΡΟΠΙΤΑ',1,${total},${total})`;
  }
  for(const [id,company,store,session,sale] of [['online','C','A','online','online-sale'],['main','C','A','main','main-sale'],['conflict','C','A','online','conflict'],['unpaid','C','A','online','unpaid'],['foreign','D','D','online','unmapped'],['other','C','B','online','prefix'],['foreign-sale','D','D','foreign','foreign-sale'],['other-store-sale','C','B','other-store','other-store-sale']])await db.$executeRaw`INSERT INTO "StoreOperatorAudit" VALUES(${id},${company},${store},'POS_SALE_COMPLETED',${JSON.stringify({sessionId:session,saleId:sale,onlineOrderNumber:'ONL-003'})}::jsonb)`;
  await db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","sessionId","type","amount","description","subtractFromShift") VALUES('online-cash','C','A','online','SALE_CASH',1,'ONLINE ΠΑΡΑΓΓΕΛΙΑ ONL-003 · ΜΕΤΡΗΤΑ',false),('online-card','C','A','online','SALE_CARD',.4,'ONLINE ΠΑΡΑΓΓΕΛΙΑ ONL-003 · ΚΑΡΤΑ',false),('expense','C','A','online','OTHER_EXPENSE',24,'OLD EXPENSE',true),('main-cash','C','A','main','SALE_CASH',2,'POS πώληση main-sale · ΜΕΤΡΗΤΑ',false),('main-card','C','A','main','SALE_CARD',.2,'POS πώληση main-sale · ΚΑΡΤΑ',false),('conflict-ledger','C','A','main','SALE_CASH',99,'POS πώληση conflict · ΜΕΤΡΗΤΑ',false),('prefix-ledger','C','A','online','SALE_CASH',99,'POS πώληση prefix-extra · ΜΕΤΡΗΤΑ',false)`);
  await db.$executeRawUnsafe(`INSERT INTO "Payment" VALUES('o-cash','online-sale','CASH',1),('o-card','online-sale','CARD',.4),('m-cash','main-sale','CASH',2),('m-card','main-sale','CARD',.2)`);
  let result=(await read(db)).body;
  assert.ok(result.transactions.find(r=>r.id==="expense").createdAt instanceof Date);
  assert.equal(result.sales.count,1);assert.equal(result.sales.total,1.4);assert.equal(result.categories.length,1);assert.equal(result.categories[0].quantity,1);assert.equal(result.categories[0].sales,1);assert.equal(result.categories[0].revenue,1.4);
  assert.equal(result.paymentMethods.length,2);assert.equal(result.paymentMethods.reduce((sum,r)=>sum+r.amount,0),1.4);assert.equal(result.transactions.filter(r=>r.description.startsWith('ONLINE ΠΑΡΑΓΓΕΛΙΑ')).length,2);assert.equal(result.difference.deductedOtherExpenses,24);assert.equal(result.difference.cashSales,1.4);assert.equal(result.sourceStatus.vatFiscal,false);
  result=(await read(db,'main')).body;assert.equal(result.sales.count,1);assert.equal(result.sales.total,2.2);assert.equal(result.categories[0].revenue,2.2);
  // A reversal's original-sale reference is not new session evidence for the
  // original purchase. The negative sale belongs only to its own ledger.
  for(const sql of [`INSERT INTO "CashShiftSession"("id","companyId","storeId","openedAt","closedAt","status") VALUES('return-session','C','A','2026-10-12','2026-10-13','CLOSED')`, `INSERT INTO "Sale" VALUES('return-sale','C','A','COMPLETED','POS_REVERSAL',-2.2,'2026-10-12T17:00:00Z')`, `INSERT INTO "SaleLine"("id","saleId","productId","description","quantity","unitPrice","lineTotal") VALUES('return-line','return-sale','pastry','ΤΥΡΟΠΙΤΑ',-1,2.2,-2.2)`, `INSERT INTO "Payment" VALUES('return-payment','return-sale','CASH',-2.2)`, `INSERT INTO "StoreTransaction"("id","companyId","storeId","sessionId","type","amount","description") VALUES('return-ledger','C','A','return-session','SALE_CASH',-2.2,'ΟΛΙΚΗ ΕΠΙΣΤΡΟΦΗ · αρχική main-sale · επιστροφή return-sale')`])await db.$executeRawUnsafe(sql);
  assert.equal((await read(db,'main')).body.sales.total,2.2);
  result=(await read(db,'return-session')).body;assert.equal(result.sales.count,1);assert.equal(result.sales.total,-2.2);assert.equal(result.categories[0].quantity,-1);
  // Old normal POS without checkout audit remains linked by exact ledger ID.
  await db.$executeRaw`DELETE FROM "StoreOperatorAudit" WHERE "id"='main'`;
  assert.equal((await read(db,'main')).body.sales.total,2.2);
  await db.$executeRaw`DELETE FROM "StoreOperatorAudit" WHERE "id"='online'`;
  result=(await read(db)).body;assert.equal(result.sales.count,0);assert.equal(result.categories.length,0);assert.equal(result.paymentMethods.length,0);assert.equal(result.difference.cashSales,1.4); // immutable ledger remains intact
  assert.equal((await read(db,'foreign')).status,404);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
