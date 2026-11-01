import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import express from 'express';
import {readMonthlyInvoiceAudit,readMonthlyInvoiceSnapshotProjectionInTransaction} from '../src/services/monthly-invoice-audit.js';
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

  await t.test('C2 actual bounded SQL recognizes stored operator date without raw bytes, posting authority or source writes',async()=>{
   const input={storeId:'control',month:'2026-10'},report=()=>read(input),snapshot=()=>db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');return readMonthlyInvoiceSnapshotProjectionInTransaction(tx,owner,input)},{isolationLevel:'RepeatableRead',timeout:30000});
   await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" VALUES('c2-source','c','control','sup','INVOICE','A 4201','2026-10-09',12.34,'DRAFT','POS_OCR_DRAFT','c2-order',NULL,'2026-10-28'),('c2-opaque','c','control','sup','INVOICE','OPAQUE-20261031-E','2026-10-31',1,'DRAFT','POS_OCR_DRAFT','c2-opaque-order',NULL,'2026-10-31')`);
   await db.$executeRawUnsafe(`INSERT INTO "PurchaseOrder" VALUES('c2-order','c','control','sup','NEW','A 4201','c2-source','2026-10-28'),('c2-opaque-order','c','control','sup','NEW','OPAQUE-20261031-E','c2-opaque','2026-10-31')`);
   await db.$executeRaw`INSERT INTO "DocumentAttachment" VALUES('c2-page0','c','control','image/jpeg',${'c'.repeat(64)},'PRIVATE-PAGE0'),('c2-page1','c','control','image/jpeg',${'d'.repeat(64)},'PRIVATE-PAGE1')`;
   await db.$executeRawUnsafe(`INSERT INTO "DocumentInbox" VALUES('c2-inbox0','c','control','c2-page0','IN_REVIEW','2026-10-28'),('c2-inbox1','c','control','c2-page1','IN_REVIEW','2026-10-28')`);
   const header={version:'POS_FAST_HANDOFF_V1',fullReader:'ASSISTANT',lifecycleGeneration:'0',documentType:'INVOICE',supplierId:'sup',documentNumber:'A 4201',documentDate:'2026-10-09',totalGross:12.34,pageCount:2};
   const primary={rawText:'PRIVATE-RAW-OCR',lines:[{private:'NOT-RETURNED'}],posHandoff:{...header,pageIndex:0,primaryJobId:'c2-primary',pageJobIds:['c2-primary','c2-secondary']},posBackground:{status:'COMPLETED_WITH_REVIEW',reconciliationRequired:true}},secondary={rawText:'PRIVATE-SECONDARY',posHandoff:{...header,pageIndex:1},posBackground:{status:'FAILED'}};
   const save=async(p=primary,s=secondary)=>{await db.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=${JSON.stringify(p)}::jsonb WHERE "id"='c2-primary'`;await db.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=${JSON.stringify(s)}::jsonb WHERE "id"='c2-secondary'`};
   await db.$executeRaw`INSERT INTO "AiReaderJob"("id","companyId","storeId","attachmentId","purchaseDocumentId","status","resultJson") VALUES('c2-primary','c','control','c2-page0','c2-source','AWAITING_APPROVAL',${JSON.stringify(primary)}::jsonb),('c2-secondary','c','control','c2-page1',NULL,'POS_FAILED',${JSON.stringify(secondary)}::jsonb)`;
   // Original minimal job schema has no stage. Old numeric facts stay complete,
   // but this optional recognition cannot assert a date or weaken HOLD.
   let before=await digest(),old=await report();assert.equal(old.coverage.complete,true);assert.equal(old.items.find(x=>x.id==='inbox:c2-inbox1').issueDay,null);assert.equal(old.items.find(x=>x.id==='doc:c2-source').sources.length,2);assert.equal((await snapshot()).freezeEligibility.eligible,false);assert.equal(await digest(),before);
   await db.$executeRawUnsafe('ALTER TABLE "AiReaderJob" ADD COLUMN "stage" text');
   await db.$executeRawUnsafe(`UPDATE "AiReaderJob" SET "stage"=CASE WHEN "id"='c2-primary' THEN 'POS_BACKGROUND_COMPLETE' WHEN "id"='c2-secondary' THEN 'POS_BACKGROUND_FAILED' ELSE 'LOCAL' END`);
   before=await digest();const good=await report(),row=good.items.find(x=>x.id==='inbox:c2-inbox1'),candidate=await snapshot();assert.equal(good.coverage.complete,true);assert.equal(good.coverage.sourceCounts.jobs,2);assert.equal(row.issueDay,'2026-10-09');assert.equal(row.status,'IDENTITY_UNKNOWN');assert.equal(row.totalCents,null);assert.equal(row.documentNumber,null);assert.match(row.reasons.join(' '),/κεφαλίδα χειριστή/);assert.match(row.reasons.join(' '),/εκκρεμή έλεγχο/);assert.equal(good.items.find(x=>x.id==='doc:c2-opaque').sources.length,2);assert.equal(good.items.find(x=>x.id==='doc:c2-opaque').status,'UNPOSTED');assert.equal(candidate.freezeEligibility.eligible,true);assert.equal(candidate.invoices.items.find(x=>x.id==='inbox:c2-inbox1').totalAmount,null);assert.equal(JSON.stringify(good).includes('PRIVATE-'),false);assert.equal(JSON.stringify(good).includes('pageJobIds'),false);assert.equal(await digest(),before);
   // A representation link is never a numeric posting proof, including a
   // self-target with plausible APPROVED/StockPosting rows.
   await db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "status"='APPROVED' WHERE "id"='c2-opaque'`);await db.$executeRawUnsafe(`INSERT INTO "PurchaseOrderPosting" VALUES('c2-opaque-order','c','c2-opaque')`);await db.$executeRawUnsafe(`INSERT INTO "InvoiceStockPosting" VALUES('c','control','c2-opaque-order','c2-opaque','c2-opaque','PURCHASE_ORDER')`);
   before=await digest();assert.equal((await report()).items.find(x=>x.id==='doc:c2-opaque').status,'UNPOSTED');assert.equal(await digest(),before);
   const invalid=[
    (p,s)=>{p.posHandoff.pageJobIds='not-an-array'},(p,s)=>{p.posHandoff.pageJobIds=['c2-primary',{}]},(p,s)=>{p.posHandoff.pageJobIds=['c2-primary','x'.repeat(129)]},(p,s)=>{p.posHandoff.pageJobIds=Array(6).fill('c2-secondary')},(p,s)=>{p.posHandoff.pageJobIds=['c2-primary','c2-primary']},
    (p,s)=>{s.posHandoff.documentNumber='é'.repeat(129)},(p,s)=>{s.posHandoff.documentDate='2026-10-09X'},(p,s)=>{s.posHandoff.documentNumber='A 4202'},(p,s)=>{s.posHandoff.supplierId='foreign'},(p,s)=>{s.posHandoff.totalGross='12.34000001'},(p,s)=>{s.posHandoff.documentDate=null},(p,s)=>{s.posHandoff.pageIndex=0},(p,s)=>{s.posHandoff.primaryJobId=null},(p,s)=>{s.posHandoff.pageJobIds={bad:true}},(p,s)=>{s.posHandoff.documentNumber=4201}
   ];
   for(const mutate of invalid){const p=structuredClone(primary),s=structuredClone(secondary);mutate(p,s);await save(p,s);before=await digest();const invalidReport=await report();assert.equal(invalidReport.items.find(x=>x.id==='inbox:c2-inbox1').issueDay,null,mutate.toString());assert.ok((await snapshot()).freezeEligibility.reasons.includes('INVOICE_ISSUE_DATE_UNKNOWN'));assert.equal(await digest(),before)}await save();
   await db.$executeRawUnsafe(`UPDATE "AiReaderJob" SET "stage"='LOCAL' WHERE "id"='c2-secondary'`);assert.equal((await report()).items.find(x=>x.id==='inbox:c2-inbox1').issueDay,null);await db.$executeRawUnsafe(`UPDATE "AiReaderJob" SET "stage"='POS_BACKGROUND_FAILED',"companyId"='x',"storeId"='foreign' WHERE "id"='c2-secondary'`);assert.equal((await report()).items.find(x=>x.id==='inbox:c2-inbox1').issueDay,null);await db.$executeRawUnsafe(`UPDATE "AiReaderJob" SET "companyId"='c',"storeId"='control' WHERE "id"='c2-secondary'`);
   // Known issue day controls both month directions; unknown remains receipt-
   // selected, and no original/source row is deleted by the reader.
   const oldPrimary=structuredClone(primary),oldSecondary=structuredClone(secondary);oldPrimary.posHandoff.documentDate=oldSecondary.posHandoff.documentDate='2026-09-30';await save(oldPrimary,oldSecondary);await db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "documentDate"='2026-09-30' WHERE "id"='c2-source'`);
   assert.equal((await report()).items.some(x=>x.id==='inbox:c2-inbox1'),false);assert.equal((await read({...input,month:'2026-09'})).items.find(x=>x.id==='inbox:c2-inbox1').issueDay,'2026-09-30');
   await save();await db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "documentDate"='2026-10-09' WHERE "id"='c2-source'`);await db.$executeRawUnsafe(`UPDATE "DocumentInbox" SET "receivedAt"='2026-11-01' WHERE "storeId"='control'`);assert.equal((await report()).items.find(x=>x.id==='inbox:c2-inbox1').issueDay,'2026-10-09');
   await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" SELECT 'c2-paged-'||n,'c','control','sup','INVOICE','C2 '||n,'2026-10-10'::timestamp,1,'DRAFT','MANUAL',NULL,NULL,'2026-10-10'::timestamp FROM generate_series(1,51)n`);const paged=await report();assert.ok(paged.nextPage);await save(primary,{...secondary,posHandoff:{...secondary.posHandoff,documentDate:'2026-10-08'}});await assert.rejects(read({...input,page:paged.nextPage}),e=>e.code==='INVOICE_MONTH_AUDIT_STALE_PAGE');await save();
   // Missing resultJson also fails closed without referencing the absent column.
   await db.$executeRawUnsafe(`UPDATE "DocumentInbox" SET "receivedAt"='2026-10-28' WHERE "storeId"='control'`);
   const beforeCapabilityLoss=await report();await db.$executeRawUnsafe('ALTER TABLE "AiReaderJob" RENAME COLUMN "resultJson" TO "SavedResultJson"');try{const missing=await report();assert.equal(missing.coverage.complete,true);assert.notEqual(missing.fingerprint,beforeCapabilityLoss.fingerprint);assert.ok((await snapshot()).freezeEligibility.reasons.includes('INVOICE_ISSUE_DATE_UNKNOWN'))}finally{await db.$executeRawUnsafe('ALTER TABLE "AiReaderJob" RENAME COLUMN "SavedResultJson" TO "resultJson"')}
  });

  await t.test('actual SQL count above safe source cap suppresses findings rather than exposing partial exact totals',async()=>{
   await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" SELECT 'large-'||n,'c','s','sup','INVOICE','LARGE '||n,'2026-10-12'::timestamp,1,'DRAFT','MANUAL',NULL,NULL,'2026-10-12'::timestamp FROM generate_series(1,20001)n`);
   const before=await digest(),r=await read();assert.equal(r.coverage.complete,false);assert.ok(r.coverage.sourceCounts.documents>20000);assert.ok(r.coverage.limited.includes('documents'));assert.equal(r.summary,null);assert.deepEqual(r.items,[]);assert.equal(r.nextPage,null);assert.equal(r.allClear,false);assert.equal(await digest(),before);
  });
 }finally{await db.$disconnect();await other.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
