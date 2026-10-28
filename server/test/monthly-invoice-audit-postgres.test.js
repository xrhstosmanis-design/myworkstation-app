import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import express from 'express';
import {readMonthlyInvoiceAudit} from '../src/services/monthly-invoice-audit.js';
import {createMonthlyInvoiceAuditRouter} from '../src/routes/monthly-invoice-audit.js';

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const now=new Date('2026-10-28T12:00:00Z'),owner={id:'owner',companyId:'c',role:'OWNER'},request={storeId:'s',month:'2026-10'};
const definitions={
 User:'"id" text PRIMARY KEY,"role" text,"companyId" text',
 Company:'"id" text PRIMARY KEY,"name" text,"active" bool,"licenseStatus" text,"subscriptionEndsAt" timestamp',
 CompanyModule:'"id" text PRIMARY KEY,"companyId" text,"moduleKey" text,"active" bool,"startsAt" timestamp,"endsAt" timestamp',
 Store:'"id" text PRIMARY KEY,"companyId" text,"name" text,"active" bool',
 StorePaidModule:'"companyId" text,"storeId" text,"moduleKey" text,"active" bool,"startsAt" timestamp,"endsAt" timestamp',
 OwnerCompanyAccess:'"ownerId" text,"companyId" text',
 Supplier:'"id" text PRIMARY KEY,"companyId" text,"name" text,"taxId" text',
 PurchaseDocument:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"supplierId" text,"documentType" text,"documentNumber" text,"documentDate" timestamp,"totalGross" numeric,"status" text,"sourceType" text,"purchaseOrderId" text,"paymentTransactionId" text,"createdAt" timestamp DEFAULT NOW()',
 PurchaseOrder:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"supplierId" text,"status" text,"invoiceNumber" text,"sourceDocumentId" text,"createdAt" timestamp DEFAULT NOW()',
 MyDataInboundDocument:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"inboxId" text,"mark" text,"issuerVat" text,"series" text,"documentNumber" text,"issueDate" date,"invoiceType" text,"totalGross" numeric,"rawPayload" jsonb,"fetchedAt" timestamptz DEFAULT NOW()',
 DocumentInbox:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"attachmentId" text,"status" text,"receivedAt" timestamp DEFAULT NOW()',
 AiReaderJob:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"attachmentId" text,"purchaseDocumentId" text,"status" text,"resultJson" jsonb DEFAULT \'{}\',"createdAt" timestamp DEFAULT NOW()',
 DocumentAttachment:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"mimeType" text,"checksum" text,"contentData" text',
 InvoiceDraftAlias:'"aliasOrderId" text PRIMARY KEY,"aliasDocumentId" text,"companyId" text,"storeId" text,"canonicalOrderId" text,"canonicalDocumentId" text,"inboxId" text,"mark" text,"details" jsonb',
 PurchaseOrderPosting:'"orderId" text PRIMARY KEY,"companyId" text,"purchaseDocumentId" text',
 InvoiceStockPosting:'"companyId" text,"storeId" text,"orderId" text,"sourceDocumentId" text,"postedDocumentId" text,"path" text',
 StoreTransaction:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"supplierId" text,"supplierName" text,"amount" numeric,"actorId" text,"actorName" text,"occurredAt" timestamptz,"invoiceDocumentNumber" text,"attachmentMimeType" text,"attachmentFilename" text,"attachmentChecksum" text,"attachmentData" text,"paymentMethod" text,"subtractFromShift" bool,"sessionId" text,"type" text,"reversedAt" timestamptz',
 StoreOperatorAudit:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"eventType" text,"actorId" text,"details" jsonb',
 PosInvoiceBackgroundTask:'"jobId" text,"companyId" text,"storeId" text'
};

test('native monthly invoice audit executes the registered reader with complete paging, aliases, pending separation and zero report writes',{
 skip:!isolated()&&process.env.CI!=='true'?'Isolated PostgreSQL unavailable locally':false,timeout:180000
},async t=>{
 assert.ok(isolated(),'Isolated PostgreSQL is mandatory in CI');
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='invoice_month_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()}),other=new PrismaClient({datasourceUrl:url.toString()});
 await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
 const read=(input=request,actor=owner,target=db)=>readMonthlyInvoiceAudit(target,actor,input,{now});
 const digest=async()=>JSON.stringify(await Promise.all(Object.keys(definitions).map(async table=>(await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n,md5(COALESCE(string_agg(row_to_json(t)::text,',' ORDER BY row_to_json(t)::text),'')) AS digest FROM "${table}" t`))[0])));
 try{
  for(const [name,columns]of Object.entries(definitions))await db.$executeRawUnsafe(`CREATE TABLE "${name}"(${columns})`);
  await db.$executeRawUnsafe(`INSERT INTO "Company" VALUES('c','Synthetic',true,'ACTIVE',NULL),('x','Foreign',true,'ACTIVE',NULL),('platform','Platform',true,'ACTIVE',NULL)`);
  await db.$executeRawUnsafe(`INSERT INTO "User" VALUES('owner','OWNER','c'),('sa','SUPER_ADMIN','platform'),('employee','EMPLOYEE','c')`);
  await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES('s','c','Synthetic LAB',true),('control','c','CONTROL',true),('foreign','x','FOREIGN',true),('inactive','c','INACTIVE',false)`);
  await db.$executeRawUnsafe(`INSERT INTO "CompanyModule" VALUES('module','c','INVENTORY',true,NULL,NULL)`);
  await db.$executeRawUnsafe(`INSERT INTO "Supplier" VALUES('sup','c','Synthetic supplier','099999999')`);
  await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" VALUES
   ('source','c','s','sup','INVOICE','A 001','2026-10-03',12.34,'DRAFT','POS_OCR_DRAFT','order',NULL,'2026-10-03'),
   ('projection','c','s','sup','INVOICE','A 1','2026-10-03',12.34,'APPROVED','PURCHASE_ORDER','order',NULL,'2026-11-01'),
   ('other','c','s','sup','INVOICE','A 1','2026-10-03',12.34,'DRAFT','MANUAL',NULL,NULL,'2026-10-03'),
   ('alias','c','s','sup','INVOICE','OLD 99','2026-09-05',99,'MERGED','POS_OCR_DRAFT','alias-order',NULL,'2026-09-05'),
   ('foreign-doc','x','foreign',NULL,'INVOICE','A 1','2026-10-03',999,'DRAFT','MANUAL',NULL,NULL,'2026-10-03')`);
  await db.$executeRawUnsafe(`INSERT INTO "PurchaseOrder" VALUES('order','c','s','sup','INVOICED','A 1','source','2026-11-01'),('alias-order','c','s','sup','MERGED','OLD 99','alias','2026-09-05')`);
  await db.$executeRawUnsafe(`INSERT INTO "PurchaseOrderPosting" VALUES('order','c','projection')`);
  await db.$executeRawUnsafe(`INSERT INTO "InvoiceStockPosting" VALUES('c','s','order','source','projection','PURCHASE_ORDER')`);
  await db.$executeRaw`INSERT INTO "DocumentAttachment" VALUES('original','c','s','application/pdf',${'a'.repeat(64)},'SECRET-ORIGINAL-NOT-FOR-REPORT')`;
  await db.$executeRawUnsafe(`INSERT INTO "DocumentInbox" VALUES('inbox','c','s','original','IN_REVIEW','2026-11-01')`);
  await db.$executeRawUnsafe(`INSERT INTO "AiReaderJob"("id","companyId","storeId","attachmentId","purchaseDocumentId","status") VALUES('job','c','s','original','source','AWAITING_APPROVAL')`);
  await db.$executeRaw`INSERT INTO "MyDataInboundDocument" VALUES('inbound','c','s','inbox','MARK','099999999','A','1','2026-10-03','1.1',12.34,${JSON.stringify({mydataDraftOrderId:'order'})}::jsonb,'2026-11-01')`;
  const receipt={completed:true,orderId:'order',documentId:'source',inboxId:'inbox',mark:'MARK',aliasOrderIds:['alias-order']};
  await db.$executeRaw`INSERT INTO "InvoiceDraftAlias" VALUES('alias-order','alias','c','s','order','source','inbox','MARK',${JSON.stringify(receipt)}::jsonb)`;
  await db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","supplierName","amount","actorId","actorName","occurredAt","invoiceDocumentNumber","paymentMethod","subtractFromShift","sessionId","type") SELECT 'pending-'||n,'c','s','sup','Pending supplier',1,'owner','Synthetic owner','2026-10-01'::timestamptz,'P'||n,'CASH',false,NULL,'SUPPLIER_PAYMENT' FROM generate_series(1,75)n`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorAudit" SELECT 'audit-'||n,'c','s','POS_INVOICE_PENDING_CREATED','owner',jsonb_build_object('version','POS_DEFERRED_INVOICE_V1','transactionId','pending-'||n,'paymentMethod','CASH','paymentSource','EXTERNAL','supplierId','sup','documentNumber','P'||n,'documentDate','2025-01-01','amountCents',100,'contextSessionId','synthetic-session','terminalPos','SYNTHETIC','fingerprint',repeat('b',64)) FROM generate_series(1,75)n`);

  await t.test('actual SQL collapses confirmed source/projection/myDATA/alias once and preserves original bytes',async()=>{
   const before=await digest(),r=await read();assert.equal(r.coverage.complete,true);assert.equal(r.summary.logicalRecords,2);assert.equal(r.summary.possibleDuplicates,2);assert.equal(r.summary.unposted,1);assert.equal(r.summary.identityReview,0);
   assert.equal(r.pendingOriginals.period,'ALL_MONTHS');assert.equal(r.pendingOriginals.counts.total,75);assert.equal(r.pendingOriginals.items.length,50);assert.equal(r.pendingOriginals.truncated,true);assert.ok(r.pendingOriginals.items.every(p=>p.documentDate==='2025-01-01'));assert.equal(r.allClear,false);
   assert.equal(JSON.stringify(r).includes('SECRET-ORIGINAL'),false);assert.equal(JSON.stringify(r).includes('foreign-doc'),false);assert.equal(await digest(),before);
  });

  await t.test('native dangling, foreign and mismatched posting targets cannot report posted or all-clear',async()=>{
   const original=await digest();
   for(const target of ['missing-posted-document','foreign-doc','other']){
    await db.$executeRaw`UPDATE "PurchaseOrderPosting" SET "purchaseDocumentId"=${target} WHERE "orderId"='order'`;
    const before=await digest(),r=await read();assert.equal(r.allClear,false);assert.ok(r.summary.identityReview>0);assert.equal(r.items.find(d=>d.id==='doc:source').status,'UNPOSTED');assert.equal(await digest(),before);
   }
   await db.$executeRawUnsafe(`UPDATE "PurchaseOrderPosting" SET "purchaseDocumentId"='projection' WHERE "orderId"='order'`);
   assert.equal(await digest(),original);
  });

  await t.test('real route and current persisted role/module/scope deny without business writes',async()=>{
   const before=await digest();
   for(const storeId of ['', 'foreign','inactive'])await assert.rejects(read({...request,storeId}));
   await assert.rejects(read(request,{...owner,tokenType:'STORE_OPERATOR'}));
   await db.$executeRawUnsafe(`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='owner'`);await assert.rejects(read(),e=>e.status===403);await db.$executeRawUnsafe(`UPDATE "User" SET "role"='OWNER' WHERE "id"='owner'`);
   await db.$executeRawUnsafe(`INSERT INTO "StorePaidModule" VALUES('c','s','INVENTORY',false,NULL,NULL)`);await assert.rejects(read(),e=>e.status===403);await db.$executeRawUnsafe(`DELETE FROM "StorePaidModule"`);
   const support={id:'sa',companyId:'c',role:'OWNER',isSuperAdmin:true,platformRole:'SUPER_ADMIN',supportContext:{companyId:'c',storeId:'s'}};assert.equal((await read(request,support)).store.id,'s');await assert.rejects(read(request,{...support,supportContext:{companyId:'c',storeId:'control'}}),e=>e.status===403);
   const app=express();app.use((req,res,next)=>{req.user=owner;next()});app.use('/api/reports/invoice-month-audit',createMonthlyInvoiceAuditRouter(db));const server=app.listen(0,'127.0.0.1');await once(server,'listening');
   try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/reports/invoice-month-audit?storeId=s&month=2026-10');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).summary.logicalRecords,2)}finally{await new Promise(resolve=>server.close(resolve))}
   assert.equal(await digest(),before);
  });

  await t.test('full month counts survive details paging and document dates are not replaced by arrival dates',async()=>{
   await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" VALUES('credit','c','s','sup','CREDIT_NOTE','A 1','2026-10-03',12.34,'APPROVED','MANUAL',NULL,NULL,'2026-10-03'),('unknown','c','s','sup','INVOICE','U 1',NULL,1,'DRAFT','MANUAL',NULL,NULL,'2026-10-05'),('old-received-now','c','s','sup','INVOICE','OLD 1','2026-09-30',1,'DRAFT','MANUAL',NULL,NULL,'2026-10-05')`);
   await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" SELECT 'paged-'||n,'c','s','sup','INVOICE','PAGE '||n,'2026-10-10'::timestamp,1,'DRAFT','MANUAL',NULL,NULL,'2026-10-10'::timestamp FROM generate_series(1,60)n`);
   const before=await digest(),first=await read();assert.equal(first.summary.logicalRecords,64);assert.equal(first.summary.credits,1);assert.equal(first.summary.identityReview,1);assert.equal(first.summary.possibleDuplicates,2);assert.equal(first.items.length,50);assert.ok(first.nextPage);
   const second=await read({...request,page:first.nextPage});assert.equal(second.items.length,14);assert.equal(second.summary.logicalRecords,64);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,64);assert.equal(JSON.stringify([...first.items,...second.items]).includes('old-received-now'),false);assert.equal(await digest(),before);
  });

  await t.test('one read-only RepeatableRead source snapshot excludes an independently committed document until next refresh',async()=>{
   let inserted=false;const snapshots=new Set();
   const instrument={$transaction:(fn,options)=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){
    if(key==='$queryRawUnsafe')return async(sql,...values)=>{const value=await target.$queryRawUnsafe(sql,...values);const [state]=await target.$queryRawUnsafe("SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS readonly,txid_current_snapshot()::text AS snapshot");assert.equal(state.isolation,'repeatable read');assert.equal(state.readonly,'on');snapshots.add(state.snapshot);if(!inserted&&sql.startsWith('SELECT source.')&&sql.includes('FROM "PurchaseDocument" d')){inserted=true;await other.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" VALUES('concurrent','c','s','sup','INVOICE','NEW 1','2026-10-11',1,'DRAFT','MANUAL',NULL,NULL,'2026-10-11')`)}return value};
    const value=target[key];return typeof value==='function'?value.bind(target):value;
   }})),options)};
   const old=await read(request,owner,instrument),fresh=await read();assert.equal(inserted,true);assert.equal(snapshots.size,1);assert.equal(old.summary.logicalRecords,64);assert.equal(fresh.summary.logicalRecords,65);assert.notEqual(old.fingerprint,fresh.fingerprint);await assert.rejects(read({...request,page:old.nextPage}),e=>e.code==='INVOICE_MONTH_AUDIT_STALE_PAGE');
  });

  await t.test('absent optional source is visibly unavailable and never initialized by GET',async()=>{
   await db.$executeRawUnsafe('ALTER TABLE "InvoiceDraftAlias" RENAME TO "SavedInvoiceDraftAlias"');
   const r=await read();assert.equal(r.coverage.complete,false);assert.equal(r.summary,null);assert.deepEqual(r.items,[]);assert.equal(r.allClear,false);
   const [exists]=await db.$queryRawUnsafe(`SELECT to_regclass('"InvoiceDraftAlias"') IS NOT NULL AS exists`);assert.equal(exists.exists,false);await db.$executeRawUnsafe('ALTER TABLE "SavedInvoiceDraftAlias" RENAME TO "InvoiceDraftAlias"');
  });

  await t.test('actual SQL count above safe source cap suppresses findings rather than exposing partial exact totals',async()=>{
   await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" SELECT 'large-'||n,'c','s','sup','INVOICE','LARGE '||n,'2026-10-12'::timestamp,1,'DRAFT','MANUAL',NULL,NULL,'2026-10-12'::timestamp FROM generate_series(1,20001)n`);
   const before=await digest(),r=await read();assert.equal(r.coverage.complete,false);assert.ok(r.coverage.sourceCounts.documents>20000);assert.ok(r.coverage.limited.includes('documents'));assert.equal(r.summary,null);assert.deepEqual(r.items,[]);assert.equal(r.nextPage,null);assert.equal(r.allClear,false);assert.equal(await digest(),before);
  });
 }finally{await db.$disconnect();await other.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
