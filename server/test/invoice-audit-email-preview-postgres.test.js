import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import express from 'express';
import {readInvoiceAuditEmailPreview} from '../src/services/invoice-audit-email-preview.js';
import {readMonthlyInvoiceAudit} from '../src/services/monthly-invoice-audit.js';
import {createInvoiceAuditEmailPreviewRouter} from '../src/routes/invoice-audit-email-preview.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const owner={id:'owner',companyId:'c',role:'OWNER'},input={storeId:'s',month:'2026-10'};
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
definitions.AutomaticReportRecipient='"recipientId" text PRIMARY KEY,"companyId" text,"storeId" text,"email" text,"version" bigint,"verifiedAt" timestamptz,"revokedAt" timestamptz';
definitions.AutomaticReportRecipientConsent='"recipientId" text PRIMARY KEY,"companyId" text,"storeId" text,"recipientVersion" bigint,"active" bool,"allowedFrequencies" text[],"lifecycleGeneration" bigint,"consentedAt" timestamptz,"proofHash" text,"revokedAt" timestamptz';
definitions.StoreLifecycleFence='"storeId" text PRIMARY KEY,"companyId" text,"generation" bigint,"maintenance" bool,"retired" bool';

test('native registered invoice email preview reads actual known findings and fresh recipient metadata without business writes',{
 skip:!isolated()&&process.env.CI!=='true'?'Isolated PostgreSQL unavailable locally':false,timeout:180000
},async t=>{
 assert.ok(isolated(),'Isolated PostgreSQL is mandatory in CI');
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='invoice_email_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
 const read=(patch={},actor=owner,options={})=>readInvoiceAuditEmailPreview(db,actor,{...input,...patch},options);
 const digest=async()=>JSON.stringify(await Promise.all(Object.keys(definitions).map(async table=>(await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n,md5(COALESCE(string_agg(row_to_json(t)::text,',' ORDER BY row_to_json(t)::text),'')) AS digest FROM "${table}" t`))[0])));
 try{
  for(const [name,columns]of Object.entries(definitions))await db.$executeRawUnsafe(`CREATE TABLE "${name}"(${columns})`);
  await db.$executeRawUnsafe(`INSERT INTO "Company" VALUES('c','Synthetic',true,'ACTIVE',NULL),('x','Foreign',true,'ACTIVE',NULL),('platform','Platform',true,'ACTIVE',NULL)`);
  await db.$executeRawUnsafe(`INSERT INTO "User" VALUES('owner','OWNER','c'),('sa','SUPER_ADMIN','platform')`);
  await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES('s','c','Synthetic LAB',true),('control','c','Control',true),('foreign','x','Foreign',true)`);
  await db.$executeRawUnsafe(`INSERT INTO "CompanyModule" VALUES('module','c','INVENTORY',true,NULL,NULL)`);
  await db.$executeRawUnsafe(`INSERT INTO "Supplier" VALUES('sup','c','Synthetic supplier','099999999')`);
  await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" VALUES('doc','c','s','sup','INVOICE','A 1','2026-10-03',12.34,'DRAFT','MANUAL',NULL,NULL,'2026-10-03')`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","supplierName","amount","actorId","actorName","occurredAt","invoiceDocumentNumber","paymentMethod","subtractFromShift","sessionId","type") VALUES('pending','c','s','sup','Synthetic supplier',1,'owner','Owner','2026-10-01','OLD 1','CASH',false,NULL,'SUPPLIER_PAYMENT')`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorAudit" VALUES('audit','c','s','POS_INVOICE_PENDING_CREATED','owner',jsonb_build_object('version','POS_DEFERRED_INVOICE_V1','transactionId','pending','paymentMethod','CASH','paymentSource','EXTERNAL','supplierId','sup','documentNumber','OLD 1','documentDate','2025-01-01','amountCents',100,'contextSessionId','synthetic','terminalPos','SYNTHETIC','fingerprint',repeat('b',64)))`);
  await db.$executeRawUnsafe(`INSERT INTO "AutomaticReportRecipient" VALUES('r','c','s','alice@example.test',2,'2026-01-01',NULL),('foreign-r','x','foreign','PRIVATE-FOREIGN@example.test',1,'2026-01-01',NULL)`);
  await db.$executeRawUnsafe(`INSERT INTO "AutomaticReportRecipientConsent" VALUES('r','c','s',2,true,ARRAY['MONTHLY'],0,'2026-01-02',repeat('a',64),NULL)`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence" VALUES('s','c',0,false,false)`);

  await t.test('actual GET exposes exact known counts and findings, masked verified identity, no send or source-private data',async()=>{
   const before=await digest(),app=express();app.use((req,res,next)=>{req.user=owner;next()});app.use('/api/reports/invoice-audit-email-preview',createInvoiceAuditEmailPreviewRouter(db));const server=app.listen(0,'127.0.0.1');await once(server,'listening');
   try{
    const base='http://127.0.0.1:'+server.address().port+'/api/reports/invoice-audit-email-preview';
    const response=await fetch(base+'?storeId=s&month=2026-10');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const r=await response.json();
    assert.equal(r.payload.coverage.complete,true);assert.equal(r.payload.summary.logicalRecords,1);assert.equal(r.payload.summary.unposted,1);assert.match(r.payload.body,/A 1/);assert.match(r.payload.body,/Δεν έχει καταχωριστεί/);assert.equal(r.payload.pendingOriginals.counts.total,1);assert.match(r.payload.body,/2025-01-01/);assert.match(r.payload.body,/Όλοι οι μήνες/);assert.equal(r.recipients.verifiedCount,1);assert.equal(r.recipients.monthlyConsentEligibleCount,1);assert.equal(r.sendingEnabled,false);assert.equal(r.purposeConsent,'NOT_ASSUMED');assert.equal(r.separateSnapshots,true);assert.ok(Number.isFinite(Date.parse(r.reportObservedAt)));assert.ok(Number.isFinite(Date.parse(r.recipientObservedAt)));assert.doesNotMatch(JSON.stringify(r),/alice@example|PRIVATE-FOREIGN|fingerprint|proofHash/);
    for(const query of ['&asOf=2000-01-01','&send=true','&recipient=evil@example.test','&page=x','&storeId=control','&month=2026-09'])assert.equal((await fetch(base+'?storeId=s&month=2026-10'+query)).status,400);
    assert.equal((await fetch(base+'?storeId=foreign&month=2026-10')).status,404);assert.equal((await fetch(base+'?storeId=s&month=2026-10',{method:'POST'})).status,404);
   }finally{await new Promise(resolve=>server.close(resolve))}
   assert.equal(await digest(),before);
  });

  await t.test('current verification, consent revision/generation and revocation are observed without repairing records',async()=>{
   for(const sql of [`UPDATE "AutomaticReportRecipientConsent" SET "recipientVersion"=1`,`UPDATE "AutomaticReportRecipientConsent" SET "lifecycleGeneration"=1`,`UPDATE "AutomaticReportRecipientConsent" SET "active"=false`,`UPDATE "AutomaticReportRecipientConsent" SET "revokedAt"=NOW()`]){
    await db.$executeRawUnsafe(sql);const before=await digest(),r=await read();assert.equal(r.recipients.verifiedCount,1);assert.equal(r.recipients.monthlyConsentEligibleCount,0);assert.equal(await digest(),before);await db.$executeRawUnsafe(`UPDATE "AutomaticReportRecipientConsent" SET "recipientVersion"=2,"lifecycleGeneration"=0,"active"=true,"revokedAt"=NULL`);
   }
   await db.$executeRawUnsafe(`UPDATE "AutomaticReportRecipient" SET "verifiedAt"=NULL WHERE "recipientId"='r'`);assert.equal((await read()).recipients.verifiedCount,0);await db.$executeRawUnsafe(`UPDATE "AutomaticReportRecipient" SET "verifiedAt"='2026-01-01',"revokedAt"=NOW() WHERE "recipientId"='r'`);assert.equal((await read()).recipients.verifiedCount,0);await db.$executeRawUnsafe(`UPDATE "AutomaticReportRecipient" SET "revokedAt"=NULL WHERE "recipientId"='r'`);
  });

  await t.test('role and license revoked BETWEEN report and recipient observation deny the complete preview',async()=>{
   const actual=async(target,actor,request,options)=>readMonthlyInvoiceAudit(target,actor,request,options);
   for(const [revoke,restore]of [[`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='owner'`,`UPDATE "User" SET "role"='OWNER' WHERE "id"='owner'`],[`UPDATE "Company" SET "licenseStatus"='EXPIRED' WHERE "id"='c'`,`UPDATE "Company" SET "licenseStatus"='ACTIVE' WHERE "id"='c'`]]){
    await assert.rejects(read({},owner,{readAudit:async(...args)=>{const r=await actual(...args);await db.$executeRawUnsafe(revoke);return r}}),e=>e.status===403);await db.$executeRawUnsafe(restore);
   }
   await assert.rejects(read({}, {...owner,tokenType:'STORE_OPERATOR'}),e=>e.status===403);
   const support={id:'sa',companyId:'c',role:'OWNER',isSuperAdmin:true,platformRole:'SUPER_ADMIN',supportContext:{companyId:'c',storeId:'s'}};assert.equal((await read({},support)).store.id,'s');await assert.rejects(read({}, {...support,supportContext:{companyId:'c',storeId:'control'}}),e=>e.status===403);
  });

  await t.test('missing recipient schema is unavailable, never bootstrapped; missing report source remains unknown',async()=>{
   await db.$executeRawUnsafe('ALTER TABLE "AutomaticReportRecipient" RENAME TO "SavedRecipient"');
   const r=await read();assert.equal(r.recipients.available,false);assert.equal(r.recipients.verifiedCount,null);assert.equal(r.payload.summary.unposted,1);const [exists]=await db.$queryRawUnsafe(`SELECT to_regclass('"AutomaticReportRecipient"') IS NOT NULL AS exists`);assert.equal(exists.exists,false);await db.$executeRawUnsafe('ALTER TABLE "SavedRecipient" RENAME TO "AutomaticReportRecipient"');
   await db.$executeRawUnsafe('ALTER TABLE "InvoiceDraftAlias" RENAME TO "SavedAlias"');const unknown=await read();assert.equal(unknown.payload.coverage.complete,false);assert.equal(unknown.payload.summary,null);assert.match(unknown.payload.body,/ΑΓΝΩΣΤΗ/);await db.$executeRawUnsafe('ALTER TABLE "SavedAlias" RENAME TO "InvoiceDraftAlias"');
  });

  await t.test('both source observations are read-only snapshots and an over-limit recipient source is never partial exact',async()=>{
   const states=[];const instrument={$transaction:(fn,options)=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='$queryRawUnsafe')return async(...args)=>{const rows=await target.$queryRawUnsafe(...args);const [state]=await target.$queryRawUnsafe("SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS readonly");states.push(state);return rows};const value=target[key];return typeof value==='function'?value.bind(target):value}})),options)};
   const before=await digest(),r=await readInvoiceAuditEmailPreview(instrument,owner,input);assert.equal(r.separateSnapshots,true);assert.ok(states.length>3);assert.ok(states.every(s=>s.isolation==='repeatable read'&&s.readonly==='on'));assert.equal(await digest(),before);
   await db.$executeRawUnsafe(`INSERT INTO "AutomaticReportRecipient" SELECT 'extra-'||n,'c','s','extra'||n||'@example.test',1,'2026-01-01'::timestamptz,NULL FROM generate_series(1,5)n`);const overflow=await read();assert.equal(overflow.recipients.available,false);assert.equal(overflow.recipients.verifiedCount,null);assert.deepEqual(overflow.recipients.identities,[]);
  });
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
