import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readMyDataPdfDraftReadiness as read} from '../src/lib/mydata-pdf-draft-readiness.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native PDF readiness reads actual same-draft counts and rejects duplicate dangling and foreign sources without writes',{skip:!isolated()&&process.env.CI!=='true'?'Isolated PostgreSQL unavailable locally':false,timeout:120000},async()=>{
 assert.ok(isolated(),'Native PostgreSQL is mandatory in CI');const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='pdf_readiness_'+randomUUID().replaceAll('-','');await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()}),input={companyId:'c',storeId:'s',inboxId:'i',orderId:'o'};
 const definitions={MyDataInboundDocument:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"inboxId" text',DocumentInbox:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"attachmentId" text,"status" text',DocumentAttachment:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"mimeType" text,"contentData" text',AiReaderJob:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"attachmentId" text,"purchaseDocumentId" text',PurchaseOrder:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"sourceDocumentId" text,"status" text,"sourceType" text',PurchaseDocument:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"status" text,"sourceType" text',PurchaseOrderLine:'"id" text PRIMARY KEY,"orderId" text',PurchaseDocumentLine:'"id" text PRIMARY KEY,"purchaseDocumentId" text'};
 const digest=()=>Promise.all(Object.keys(definitions).map(table=>db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count,md5(COALESCE(string_agg(row_to_json(t)::text,',' ORDER BY "id"),'')) AS digest FROM "${table}" t`)));
 const check=async(state,patch={})=>{const before=await digest(),result=await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');return read(tx,{...input,...patch})},{isolationLevel:'RepeatableRead'});assert.equal(result.state,state);assert.equal(result.needsPdfReading,state==='NEEDS_READING');assert.deepEqual(await digest(),before);return result};
 try{
  for(const [name,columns]of Object.entries(definitions))await db.$executeRawUnsafe(`CREATE TABLE "${name}"(${columns})`);
  await db.$executeRawUnsafe(`INSERT INTO "MyDataInboundDocument" VALUES('m','c','s','i');`);
  await db.$executeRawUnsafe(`INSERT INTO "DocumentInbox" VALUES('i','c','s','a','IN_REVIEW')`);
  await db.$executeRawUnsafe(`INSERT INTO "DocumentAttachment" VALUES('a','c','s','application/pdf','data:application/pdf;base64,JVBERi1zeW50aGV0aWM=')`);
  await db.$executeRawUnsafe(`INSERT INTO "AiReaderJob" VALUES('j','c','s','a','d')`);
  await db.$executeRawUnsafe(`INSERT INTO "PurchaseOrder" VALUES('o','c','s','d','NEW','POS_OCR_DRAFT')`);
  await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" VALUES('d','c','s','DRAFT','POS_OCR_DRAFT')`);
  assert.equal((await check('NEEDS_READING')).orderLineCount,0);
  await db.$executeRawUnsafe(`INSERT INTO "PurchaseOrderLine" VALUES('ol','o')`);assert.equal((await check('HAS_LINES')).orderLineCount,1);await db.$executeRawUnsafe(`DELETE FROM "PurchaseOrderLine"`);
  await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocumentLine" VALUES('dl','d')`);assert.equal((await check('HAS_LINES')).documentLineCount,1);await db.$executeRawUnsafe(`DELETE FROM "PurchaseDocumentLine"`);
  await db.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "status"='FINAL'`);await check('READ_ONLY');await db.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "status"='NEW'`);
  await db.$executeRawUnsafe(`UPDATE "DocumentInbox" SET "status"='PROCESSED'`);await check('READ_ONLY');await db.$executeRawUnsafe(`UPDATE "DocumentInbox" SET "status"='IN_REVIEW'`);
  for(const [table,restore]of [['PurchaseOrder','NEW'],['PurchaseDocument','DRAFT'],['DocumentInbox','IN_REVIEW']]){
   for(const status of [null,'UNKNOWN','CANCELLED','DELETED','MERGED']){
    await db.$executeRawUnsafe(`UPDATE "${table}" SET "status"=$1`,status);
    try{await check('UNAVAILABLE')}finally{await db.$executeRawUnsafe(`UPDATE "${table}" SET "status"=$1`,restore)}
   }
  }
  await db.$executeRawUnsafe(`INSERT INTO "AiReaderJob" VALUES('duplicate','c','s','a','d')`);await check('UNAVAILABLE');await db.$executeRawUnsafe(`DELETE FROM "AiReaderJob" WHERE "id"='duplicate'`);
  await db.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "sourceDocumentId"='deleted-document'`);await check('UNAVAILABLE');await db.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "sourceDocumentId"='d'`);
  for(const patch of [{companyId:'foreign'},{storeId:'foreign'},{inboxId:'foreign'},{orderId:'foreign'}])await check('UNAVAILABLE',patch);
  await db.$executeRawUnsafe(`UPDATE "DocumentAttachment" SET "storeId"='foreign'`);await check('UNAVAILABLE');await db.$executeRawUnsafe(`UPDATE "DocumentAttachment" SET "storeId"='s',"mimeType"='image/png'`);await check('UNAVAILABLE');
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
