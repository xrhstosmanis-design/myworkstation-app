import test from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
import {acquireOriginal,fetchOriginalPdf,providerOriginalRecoveryLinkPattern} from '../src/mydata-original.js';
import {recoverPanormouEpsilonFileOriginals} from '../src/services/mydata-panormou-epsilon-recovery.js';
import {readMonthlyInvoiceAudit,readMonthlyInvoiceAuditRecord} from '../src/services/monthly-invoice-audit.js';

const scope={companyId:'c',storeId:'s',inboxId:'delivery-inbox'};
const owner={id:'owner',companyId:'c',role:'OWNER'};
const now=new Date('2026-11-20T12:00:00Z');
const request={storeId:'s',month:'2026-11'};
const mark='400000000000093';
const original='https://einvoice.impact.gr/p/EL099999999/'+ 'a'.repeat(40)+'/'+ 'b'.repeat(32);
const xml=`<invoice><downloadingInvoiceUrl>${original}</downloadingInvoiceUrl></invoice>`;
const businessTables=['PurchaseOrder','PurchaseDocument','PurchaseOrderLine','PurchaseDocumentLine','AiReaderJob','StoreTransaction','SupplierPaymentSettlement','SupplierPaymentAllocation','StockMovement','StoreProduct','SupplierProductLink','SupplierProductMapping','InvoiceDraftAlias','PurchaseOrderPosting','InvoiceStockPosting','StoreOperatorAudit','PosInvoiceBackgroundTask'];

test('Panormou queue admits additional verified provider URLs with native PostgreSQL matching', {skip:!isolatedInvoiceDb(),timeout:30000}, async () => {
 const legacy = providerOriginalRecoveryLinkPattern({includeExistingImpact:true});
 const expanded = providerOriginalRecoveryLinkPattern({includeExistingImpact:true,includeAdditionalVerifiedFormats:true});
 const eInvoicing = 'https://e-invoicing.gr/edocuments/ViewInvoice/-1/12345678-abcd-1234-abcd-123456789abc_';
 const epsilon9 = 'https://epsilondigital9.epsilonnet.gr/fd/' + 'a'.repeat(32);
 const epsilon169 = 'https://epsilondigital-3rdparte.epsilonnet.gr/fd/' + 'b'.repeat(32);
 const checks = [
  [eInvoicing+'Ab1234',false,true],
  [eInvoicing+'Ab12345',true,true],
  [eInvoicing+'Ab123456',false,true],
  [eInvoicing+'Ab1234567',false,false],
  [epsilon9+':145',false,true],
  [epsilon169+':169/',false,true],
  [epsilon9+':169',false,false],
  [epsilon9+':145?token=example',false,false],
  [epsilon9.replace('epsilonnet.gr','epsilonnet.gr.example')+':145',false,false],
  [original,true,true],
 ];
 const f = await invoiceDbFixture();
 try {
  for (const [url, legacyMatch, expandedMatch] of checks) {
   const xml = `<n:downloadingInvoiceUrl> ${url} </n:downloadingInvoiceUrl>`;
   const [result] = await f.db.$queryRaw`SELECT ${xml} ~* ${legacy} AS legacy, ${xml} ~* ${expanded} AS expanded`;
   assert.deepEqual(result,{legacy:legacyMatch,expanded:expandedMatch});
  }
 } finally {
  await f.close();
 }
});

async function fixture(){
 const f=await invoiceDbFixture();
 try{
  const additions={
   Store:'"active" boolean DEFAULT true',
   PurchaseDocument:'"createdAt" timestamp DEFAULT NOW()',
   PurchaseOrderLine:'"ocrLineIndex" integer',
   DocumentInbox:'"receivedAt" timestamp DEFAULT NOW()',
   DocumentAttachment:'"documentType" text,"storageKey" text',
   AiReaderJob:'"localConfidence" numeric,"requestedByUserId" text',
   MyDataInboundDocument:'"currency" text DEFAULT \'EUR\',"totalNet" numeric DEFAULT 0,"totalVat" numeric DEFAULT 0',
   StoreTransaction:'"supplierName" text,"actorId" text,"actorName" text,"attachmentMimeType" text,"attachmentChecksum" text,"attachmentData" text,"paymentMethod" text,"subtractFromShift" boolean,"sessionId" text',
  };
  for(const [table,columns] of Object.entries(additions))for(const column of columns.split(/,(?=")/))await f.db.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN ${column}`);
  const definitions={
   User:'"id" text PRIMARY KEY,"role" text,"companyId" text',
   Company:'"id" text PRIMARY KEY,"name" text,"active" boolean,"licenseStatus" text,"subscriptionEndsAt" timestamp',
   CompanyModule:'"id" text PRIMARY KEY,"companyId" text,"moduleKey" text,"active" boolean,"startsAt" timestamp,"endsAt" timestamp',
   StorePaidModule:'"companyId" text,"storeId" text,"moduleKey" text,"active" boolean,"startsAt" timestamp,"endsAt" timestamp',
   OwnerCompanyAccess:'"ownerId" text,"companyId" text',
   SupplierPaymentSettlement:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"transactionId" text,"supplierId" text,"status" text',
   SupplierPaymentAllocation:'"id" text PRIMARY KEY,"companyId" text,"settlementId" text,"purchaseDocumentId" text,"amount" numeric',
   StoreOperatorAudit:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"eventType" text,"actorId" text,"details" jsonb',
   PosInvoiceBackgroundTask:'"jobId" text,"companyId" text,"storeId" text',
  };
  for(const [table,columns]of Object.entries(definitions))await f.db.$executeRawUnsafe(`CREATE TABLE "${table}"(${columns})`);
  await f.db.$executeRawUnsafe(`INSERT INTO "Company" VALUES('c','Synthetic',true,'ACTIVE',NULL),('x','Foreign',true,'ACTIVE',NULL)`);
  await f.db.$executeRawUnsafe(`INSERT INTO "User" VALUES('owner','OWNER','c')`);
  await f.db.$executeRawUnsafe(`INSERT INTO "CompanyModule" VALUES('inventory','c','INVENTORY',true,NULL,NULL)`);
  await f.db.$executeRawUnsafe(`INSERT INTO "Store"("id","companyId","name","active") VALUES('foreign','x','Foreign',true)`);
  await f.db.$executeRawUnsafe(`INSERT INTO "DocumentInbox"("id","companyId","storeId","status","note","receivedAt") VALUES('delivery-inbox','c','s','RECEIVED','Preserve original note','2026-11-12')`);
  await f.db.$executeRaw`INSERT INTO "MyDataInboundDocument"("id","companyId","storeId","inboxId","mark","issuerVat","counterpartVat","series","documentNumber","issueDate","invoiceType","currency","totalNet","totalVat","totalGross","rawPayload") VALUES('delivery','c','s','delivery-inbox',${mark},'099999999','088888888','DEL','93','2026-11-12','9.3','EUR',0,0,0,${JSON.stringify({source:'AADE_MYDATA_PRODUCTION',xml})}::jsonb)`;
  const [{schema}]=await f.db.$queryRawUnsafe('SELECT current_schema() AS schema');
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  const {PrismaClient}=await import('@prisma/client');
  const other=new PrismaClient({datasourceUrl:url.toString()});
  const digest=async(tables=businessTables)=>JSON.stringify(await Promise.all(tables.map(async table=>({table,...(await f.db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n,md5(COALESCE(string_agg(row_to_json(t)::text,',' ORDER BY row_to_json(t)::text),'')) AS digest FROM "${table}" t`))[0]}))));
  const originalClose=f.close;
  return {...f,other,digest,close:async()=>{await other.$disconnect();await originalClose();}};
 }catch(error){await f.close();throw error;}
}

let pdfPromise;
function actualPdf(){
 return pdfPromise??=new Promise((resolve,reject)=>{
  const doc=new PDFDocument({compress:false}),chunks=[];
  doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
  doc.font('Helvetica').fontSize(12).text(`${mark} 099999999 088888888 93`);doc.end();
 });
}
async function download(row){
 const bytes=await actualPdf();
 return fetchOriginalPdf(row,async(url,options)=>{
  assert.equal(url,original+'/pdf');assert.equal(options.redirect,'error');
  return new Response(bytes,{headers:{'content-type':'application/pdf'}});
 });
}
test('native exhausted Panormou Epsilon recovery is scoped, persists one draft, and stamps a failed replay', {
 skip:!isolatedInvoiceDb()&&process.env.CI!=='true'?'Isolated PostgreSQL unavailable locally':false,timeout:180000,
},async()=>{
 assert.ok(isolatedInvoiceDb(),'Isolated PostgreSQL is mandatory in CI');
 const f=await fixture();
 const storeId='cmwqvuxrx001is8g4uqlyzwg2',source='AADE_MYDATA_PRODUCTION';
 const epsilon='https://epsilondigital.epsilonnet.gr/fd/'+'b'.repeat(32)+':8';
 const flags=[
  ['epsilon-good',storeId,source,'2026-11-04',3,epsilon],
  ['epsilon-html',storeId,source,'2026-11-05',3,epsilon],
  ['epsilon-wrong-store','s',source,'2026-11-05',3,epsilon],
  ['epsilon-sandbox',storeId,'AADE_MYDATA_SANDBOX','2026-11-05',3,epsilon],
  ['epsilon-december',storeId,source,'2026-12-01',3,epsilon],
  ['epsilon-unexhausted',storeId,source,'2026-11-05',2,epsilon],
  ['epsilon-wrong-profile',storeId,source,'2026-11-05',3,epsilon.replace('epsilondigital.','epsilondigital3.').replace(':8',':84')],
 ];
 try{
  await f.db.$executeRaw`INSERT INTO "Store"("id","companyId","name","active") VALUES(${storeId},'c','Synthetic recovery',true)`;
  for(const [id,store,origin,date,attempts,url] of flags){
   await f.db.$executeRaw`INSERT INTO "DocumentInbox"("id","companyId","storeId","status") VALUES(${id},'c',${store},'RECEIVED')`;
   const raw=JSON.stringify({source:origin,xml:`<downloadingInvoiceUrl>${url}</downloadingInvoiceUrl>`,originalPending:true,originalAttempts:attempts});
   await f.db.$executeRaw`INSERT INTO "MyDataInboundDocument"
    ("id","companyId","storeId","inboxId","mark","issuerVat","counterpartVat","series","documentNumber","issueDate","invoiceType","currency","totalGross","rawPayload")
    VALUES(${id},'c',${store},${id},${mark},'099999999','088888888','E','93',${date}::date,'1.1','EUR',5,${raw}::jsonb)`;
  }
  const bytes=await actualPdf(),requested=[];
  const recover=()=>recoverPanormouEpsilonFileOriginals({db:f.db,companyId:'c',storeId,userId:'owner',source,
   acquire:async(db,company,store,inboxId,actor,enabled,download)=>{
    requested.push(inboxId);
    return acquireOriginal(db,company,store,inboxId,actor,enabled,row=>download(row,async(url,options)=>{
     assert.equal(new URL(url).pathname,'/filedocument/getfile');
     assert.equal(options.redirect,'error');
     return inboxId==='epsilon-good'?new Response(bytes,{headers:{'content-type':'application/pdf'}})
       :new Response('<html>login</html>',{headers:{'content-type':'text/html'}});
    }));
   },
  });
  assert.deepEqual(await recover(),{downloaded:1,failed:1});
  assert.deepEqual(await recover(),{downloaded:0,failed:0});
  assert.deepEqual(requested,['epsilon-good','epsilon-html']);
  const [readback]=await f.db.$queryRaw`SELECT i."status",o."status" AS "orderStatus",a."mimeType"
   FROM "MyDataInboundDocument" m JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
   JOIN "DocumentAttachment" a ON a."id"=i."attachmentId" AND a."companyId"=i."companyId" AND a."storeId"=i."storeId"
   JOIN "PurchaseOrder" o ON o."id"=m."rawPayload"->>'mydataDraftOrderId' AND o."companyId"=m."companyId" AND o."storeId"=m."storeId"
   WHERE m."id"='epsilon-good'`;
  assert.deepEqual(readback,{status:'IN_REVIEW',orderStatus:'NEW',mimeType:'application/pdf'});
  const [failed]=await f.db.$queryRaw`SELECT "rawPayload"->>'epsilonFileRecoveryVersion' AS version,("rawPayload"->>'originalAttempts')::int AS attempts
   FROM "MyDataInboundDocument" WHERE "id"='epsilon-html'`;
  assert.deepEqual(failed,{version:'epsilon-digital-file-v1',attempts:3});
  const [effects]=await f.db.$queryRaw`SELECT (SELECT count(*)::int FROM "StockMovement") AS stock,
   (SELECT count(*)::int FROM "StoreTransaction") AS transactions,(SELECT count(*)::int FROM "PurchaseOrder") AS orders`;
  assert.deepEqual(effects,{stock:0,transactions:0,orders:1});
 }finally{await f.close();}
});

const acquire=(db,loader=download,enabled=true)=>acquireOriginal(db,scope.companyId,scope.storeId,scope.inboxId,owner.id,enabled,loader);
async function state(db){
 const [inbox]=await db.$queryRaw`SELECT "attachmentId","status","note" FROM "DocumentInbox" WHERE "id"='delivery-inbox'`;
 const [inbound]=await db.$queryRaw`SELECT "rawPayload" FROM "MyDataInboundDocument" WHERE "id"='delivery'`;
 const [counts]=await db.$queryRaw`SELECT (SELECT COUNT(*)::int FROM "DocumentAttachment") AS attachments,(SELECT COUNT(*)::int FROM "AiReaderJob") AS jobs,(SELECT COUNT(*)::int FROM "PurchaseOrder") AS orders,(SELECT COUNT(*)::int FROM "PurchaseDocument") AS documents`;
 return {inbox,inbound,...counts};
}
async function neutral(f){
 const before=await f.digest(),list=await readMonthlyInvoiceAudit(f.db,owner,request,{now});
 assert.equal(list.coverage.complete,true);assert.equal(list.items.length,1);
 const row=list.items[0];assert.equal(row.documentType,'DELIVERY_NOTE');assert.equal(row.payment.status,'NOT_APPLICABLE');assert.equal(row.purchaseReview.status,'NON_FINANCIAL');
 for(const key of ['unposted','purchaseLinkReview','identityReview'])assert.equal(list.summary[key],0,key);
 assert.equal(list.financialSummary.reviewRequired,0);assert.equal(list.financialSummary.paid,0);
 const record=await readMonthlyInvoiceAuditRecord(f.db,owner,{...request,id:row.id,fingerprint:list.fingerprint},{now});
 assert.deepEqual(record.item,row);assert.equal(await f.digest(),before);return list;
}

test('native ordinary standalone original attaches a real verified PDF only; replay and monthly semantics remain neutral',{
 skip:!isolatedInvoiceDb()&&process.env.CI!=='true'?'Isolated PostgreSQL unavailable locally':false,timeout:180000,
},async t=>{
 assert.ok(isolatedInvoiceDb(),'Isolated PostgreSQL is mandatory in CI');
 await t.test('first download, replay, same inbox and unchanged business rows',async()=>{
  const f=await fixture();try{
   const before=await f.digest(),monthly=await neutral(f);let downloads=0;
   const loader=async row=>{downloads++;return download(row);};
   const first=await acquire(f.db,loader);assert.equal(first.downloaded,true);assert.equal(first.attachmentOnly,true);
   assert.equal(Object.hasOwn(first,'jobId'),false);assert.equal(Object.hasOwn(first,'purchaseOrderId'),false);
   const after=await state(f.db);assert.equal(after.attachments,1);assert.equal(after.jobs,0);assert.equal(after.orders,0);assert.equal(after.documents,0);
   assert.equal(after.inbox.status,'RECEIVED');assert.equal(after.inbox.note,'Preserve original note');assert.ok(after.inbox.attachmentId);
   assert.equal(Object.hasOwn(after.inbound.rawPayload,'originalJobId'),false);assert.equal(after.inbound.rawPayload.originalDownloaded,true);
   const second=await acquire(f.db,loader);assert.equal(second.reused,true);assert.equal(second.attachmentOnly,true);assert.equal(downloads,1);
   assert.deepEqual(await state(f.db),after);assert.equal(await f.digest(),before);
   const current=await neutral(f);assert.notEqual(current.fingerprint,monthly.fingerprint);
   await f.db.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"||'{"originalJobId":null}'::jsonb WHERE "id"='delivery'`;
   const linked=await readMonthlyInvoiceAudit(f.db,owner,request,{now});assert.equal(linked.items[0].payment.status,'REVIEW_REQUIRED');assert.notEqual(linked.items[0].purchaseReview.status,'NON_FINANCIAL');
   await assert.rejects(acquire(f.db,loader),e=>e.status===409);assert.equal(downloads,1);
  }finally{await f.close();}
 });
 await t.test('two actual clients may fetch concurrently but persist exactly one attachment',async()=>{
  const f=await fixture();try{
   const before=await f.digest();let entered=0,release;const barrier=new Promise(resolve=>release=resolve);
   const loader=async row=>{if(++entered===2)release();await barrier;return download(row);};
   const results=await Promise.all([acquire(f.db,loader),acquire(f.other,loader)]);
   assert.equal(entered,2);assert.ok(results.every(r=>r.attachmentOnly===true));assert.equal(results.filter(r=>r.downloaded===true).length,1);
   const after=await state(f.db);assert.equal(after.attachments,1);assert.equal(after.jobs,0);assert.equal(after.orders,0);assert.equal(Object.hasOwn(after.inbound.rawPayload,'originalJobId'),false);
   const id=after.inbox.attachmentId;await acquire(f.other,()=>{throw Error('Replay must not download');});assert.equal((await state(f.db)).inbox.attachmentId,id);
   assert.equal(await f.digest(),before);await neutral(f);
  }finally{await f.close();}
 });
 await t.test('a real SQL failure rolls back attachment, inbox and inbound updates together',async()=>{
  const f=await fixture();try{
   await f.db.$executeRawUnsafe(`CREATE FUNCTION reject_original_update() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Injected original write failure'; END$$`);
   await f.db.$executeRawUnsafe(`CREATE TRIGGER reject_original_update BEFORE UPDATE ON "DocumentInbox" FOR EACH ROW EXECUTE FUNCTION reject_original_update()`);
   const before=await f.digest(),sourceBefore=await state(f.db);
   await assert.rejects(acquire(f.db),/Injected original write failure/);
   assert.deepEqual(await state(f.db),sourceBefore);assert.equal(await f.digest(),before);
   await f.db.$executeRawUnsafe('DROP TRIGGER reject_original_update ON "DocumentInbox"');
   await neutral(f);
  }finally{await f.close();}
 });
 await t.test('identity, raw metadata, type, scope and status changes during fetch refuse stale attachment',async()=>{
  const changes=[
   `UPDATE "MyDataInboundDocument" SET "issuerVat"='077777777' WHERE "id"='delivery'`,
   `UPDATE "MyDataInboundDocument" SET "invoiceType"='1.1' WHERE "id"='delivery'`,
   `UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"||'{"originalJobId":null}'::jsonb WHERE "id"='delivery'`,
   `UPDATE "MyDataInboundDocument" SET "rawPayload"=jsonb_set("rawPayload",'{xml}','"changed XML"') WHERE "id"='delivery'`,
   `UPDATE "MyDataInboundDocument" SET "rawPayload"=jsonb_set("rawPayload",'{xml}',jsonb_build_array("rawPayload"->'xml')) WHERE "id"='delivery'`,
   `UPDATE "MyDataInboundDocument" SET "totalGross"=.004 WHERE "id"='delivery'`,
   `UPDATE "MyDataInboundDocument" SET "storeId"='control' WHERE "id"='delivery'`,
   `UPDATE "DocumentInbox" SET "status"='PROCESSED' WHERE "id"='delivery-inbox'`,
  ];
  for(const sql of changes){const f=await fixture();try{
   const before=await f.digest();let called=0;
   await assert.rejects(acquire(f.db,async row=>{called++;const pdf=await download(row);await f.other.$executeRawUnsafe(sql);return pdf;}),e=>e.status===409,sql);
   const after=await state(f.db);assert.equal(called,1);assert.equal(after.attachments,0);assert.equal(after.jobs,0);assert.equal(after.orders,0);assert.equal(after.inbox.attachmentId,null);assert.equal(await f.digest(),before);
  }finally{await f.close();}}
 });
 await t.test('initial non-string XML refuses before the provider is called',async()=>{
  for(const value of [[xml],{xml},null,93]){
   const f=await fixture();try{
    await f.db.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"=jsonb_set("rawPayload",'{xml}',${JSON.stringify(value)}::jsonb) WHERE "id"='delivery'`;
    const before=await f.digest(),sourceBefore=await state(f.db);let calls=0;
    await assert.rejects(acquire(f.db,()=>{calls++;throw Error('Invalid XML shape must not reach provider');}),e=>e.status===409);
    assert.equal(calls,0);assert.deepEqual(await state(f.db),sourceBefore);assert.equal(await f.digest(),before);
   }finally{await f.close();}
  }
 });
 await t.test('missing catalog, raw pointers, orphan and foreign links refuse attachment under the lock',async()=>{
  const cases=[
   `ALTER TABLE "SupplierPaymentAllocation" RENAME COLUMN "purchaseDocumentId" TO "missingDocumentId"`,
   `UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"||'{"originalJobId":null}'::jsonb WHERE "id"='delivery'`,
   `UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"||'{"mydataDraftOrderId":"missing-order"}'::jsonb WHERE "id"='delivery'`,
   `INSERT INTO "InvoiceDraftAlias"("aliasOrderId","aliasDocumentId","companyId","storeId","canonicalOrderId","canonicalDocumentId","inboxId","mark","details") VALUES('orphan','orphan-document','c','s','missing-order','missing-document','delivery-inbox','${mark}','{}')`,
   `INSERT INTO "StoreTransaction"("id","companyId","storeId","type","amount","attachmentFilename") VALUES('linked-payment','c','s','SUPPLIER_PAYMENT',1,'delivery-inbox')`,
   `INSERT INTO "AiReaderJob"("id","companyId","storeId","attachmentId","resultJson") VALUES('other-store-marked-job','c','control','unrelated-attachment','{"myDataMark":"${mark}"}')`,
   `INSERT INTO "AiReaderJob"("id","companyId","storeId","attachmentId","resultJson") VALUES('foreign-inbox-job','x','foreign','unrelated-attachment','{"inboxId":"delivery-inbox"}')`,
   `INSERT INTO "SupplierPaymentAllocation"("id","companyId","settlementId","purchaseDocumentId","amount") VALUES('orphan-allocation','c','missing-settlement','delivery-inbox',1)`,
   `INSERT INTO "DocumentAttachment"("id","companyId","storeId","mimeType","checksum","contentData") VALUES('foreign-pdf','x','foreign','application/pdf','${'a'.repeat(64)}','data:application/pdf;base64,JVBERi0='); UPDATE "DocumentInbox" SET "attachmentId"='foreign-pdf' WHERE "id"='delivery-inbox'`,
  ];
  for(const sql of cases){const f=await fixture();try{
   // Each string is fixed synthetic fixture SQL, never a customer-derived command.
   for(const statement of sql.split('; '))await f.db.$executeRawUnsafe(statement);
   const before=await f.digest(),sourceBefore=await state(f.db);let calls=0;
   await assert.rejects(acquire(f.db,async row=>{calls++;return download(row);}),e=>e.status===409,sql);
   // A provider fetch may precede the transactional metadata proof. Refusal
   // must preserve the persisted original and every business/link row.
   assert.equal(calls,sourceBefore.inbox.attachmentId?0:1);assert.deepEqual(await state(f.db),sourceBefore);assert.equal(await f.digest(),before);
  }finally{await f.close();}}
 });
 await t.test('an existing empty or truncated PDF body is refused without downloading or changing its pointer',async()=>{
  for(const body of ['data:application/pdf;base64,','data:application/pdf;base64,JVBERi0=']){
   const f=await fixture();try{
    await f.db.$executeRaw`INSERT INTO "DocumentAttachment"("id","companyId","storeId","mimeType","checksum","contentData") VALUES('invalid-body','c','s','application/pdf',${'a'.repeat(64)},${body})`;
    await f.db.$executeRaw`UPDATE "DocumentInbox" SET "attachmentId"='invalid-body' WHERE "id"='delivery-inbox'`;
    await f.db.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"||'{"originalDownloaded":true}'::jsonb WHERE "id"='delivery'`;
    const before=await f.digest(),sourceBefore=await state(f.db);let calls=0;
    await assert.rejects(acquire(f.db,()=>{calls++;throw Error('Existing invalid body must not be replaced');}),e=>e.status===409);
    assert.equal(calls,0);assert.deepEqual(await state(f.db),sourceBefore);assert.equal(await f.digest(),before);
   }finally{await f.close();}
  }
 });
 await t.test('failed real PDF identity never creates attachment and bulk false contract remains separate',async()=>{
  const f=await fixture();try{
   const before=await f.digest(),sourceBefore=await state(f.db);
   await assert.rejects(acquire(f.db,row=>download({...row,mark:'400000000000094'})),/δεν επιβεβαιώνει/);
   assert.deepEqual(await state(f.db),sourceBefore);assert.equal(await f.digest(),before);
   const bulk=await acquire(f.db,download,false);assert.equal(bulk.downloaded,true);assert.equal(Object.hasOwn(bulk,'attachmentOnly'),false);assert.equal(bulk.jobId,null);
   const after=await state(f.db);assert.equal(after.attachments,1);assert.equal(after.jobs,0);assert.equal(after.orders,0);assert.equal(Object.hasOwn(after.inbound.rawPayload,'originalJobId'),true);assert.equal(after.inbound.rawPayload.originalJobId,null);
   assert.equal(await f.digest(),before);
  }finally{await f.close();}
 });
});
