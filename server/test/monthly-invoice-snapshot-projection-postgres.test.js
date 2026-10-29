import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readMonthlyInvoiceAudit,readMonthlyInvoiceSnapshotProjectionInTransaction as project} from '../src/services/monthly-invoice-audit.js';
import {readPendingInvoices,readPendingInvoiceSnapshotRows} from '../src/services/pos-pending-invoices.js';
import {buildMonthlyInventorySnapshotCandidate} from '../src/services/monthly-inventory-snapshot-payload.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const owner={id:'owner',companyId:'c',role:'OWNER'},input={storeId:'s',month:'2000-01'};
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

test('native full invoice projection uses one actual bounded read-only snapshot, shared pending decisions and real D1 composition',{
 skip:!isolated()&&process.env.CI!=='true'?'Isolated PostgreSQL unavailable locally':false,timeout:180000
},async t=>{
 assert.ok(isolated(),'Isolated PostgreSQL is mandatory in CI');
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='invoice_snapshot_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()}),other=new PrismaClient({datasourceUrl:url.toString()});
 await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
 const read=(actor=owner,request=input)=>db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='8000ms'");return project(tx,actor,request)},{isolationLevel:'RepeatableRead',maxWait:2000,timeout:30000});
 const digest=async()=>JSON.stringify(await Promise.all(Object.keys(definitions).map(async table=>(await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n,md5(COALESCE(string_agg(row_to_json(t)::text,',' ORDER BY row_to_json(t)::text),'')) AS digest FROM "${table}" t`))[0])));
 try{
  for(const [name,columns]of Object.entries(definitions))await db.$executeRawUnsafe(`CREATE TABLE "${name}"(${columns})`);
  await db.$executeRawUnsafe(`INSERT INTO "Company" VALUES('c','Synthetic',true,'ACTIVE',NULL),('x','Foreign',true,'ACTIVE',NULL),('platform','Platform',true,'ACTIVE',NULL)`);
  await db.$executeRawUnsafe(`INSERT INTO "User" VALUES('owner','OWNER','c'),('sa','SUPER_ADMIN','platform'),('employee','EMPLOYEE','c')`);
  await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES('s','c','Synthetic LAB',true),('control','c','CONTROL',true),('foreign','x','FOREIGN',true),('inactive','c','INACTIVE',false)`);
  await db.$executeRawUnsafe(`INSERT INTO "CompanyModule" VALUES('module','c','INVENTORY',true,NULL,NULL)`);
  await db.$executeRawUnsafe(`INSERT INTO "Supplier" VALUES('sup','c',NULL,'099999999')`);
  await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" SELECT 'invoice-'||n,'c','s','sup','INVOICE','A '||n,'2000-01-03'::timestamp,1.000000000001,'DRAFT','MANUAL',NULL,NULL,'2000-01-03'::timestamp FROM generate_series(1,60)n`);
  await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" VALUES('credit','c','s','sup','CREDIT_NOTE','CREDIT 1','2000-01-04',-999999999999999999.123456789012,'APPROVED','MANUAL',NULL,NULL,'2000-01-04'),('foreign-doc','x','foreign',NULL,'INVOICE','FOREIGN 1','2000-01-03',999,'DRAFT','MANUAL',NULL,NULL,'2000-01-03')`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","supplierName","amount","actorId","actorName","occurredAt","invoiceDocumentNumber","paymentMethod","subtractFromShift","sessionId","type") SELECT 'pending-'||n,'c','s','sup',NULL,1.000000000001,'owner','Synthetic owner','2000-01-01'::timestamptz,'P'||n,'CASH',false,NULL,'SUPPLIER_PAYMENT' FROM generate_series(1,75)n`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorAudit" SELECT 'audit-'||n,'c','s','POS_INVOICE_PENDING_CREATED','owner',jsonb_build_object('version','POS_DEFERRED_INVOICE_V1','transactionId','pending-'||n,'paymentMethod','CASH','paymentSource','EXTERNAL','supplierId','sup','documentNumber','P'||n,'documentDate','1999-01-01','amountCents',100,'contextSessionId','synthetic-session','terminalPos','SYNTHETIC','fingerprint',repeat('b',64)) FROM generate_series(1,75)n`);

  await t.test('full75pending exact SQL decimal and61logical rows compose with unchanged real D1; legacy keeps50 and numeric money',async()=>{
   const before=await digest(),legacyBefore=await readMonthlyInvoiceAudit(db,owner,input),r=await read(),legacyAfter=await readMonthlyInvoiceAudit(db,owner,input);
   assert.equal(r.freezeEligibility.eligible,true);assert.equal(r.coverage.complete,true);assert.equal(r.invoices.items.length,61);assert.equal(r.pendingOriginals.items.length,75);assert.equal(r.pendingOriginals.items[0].amount,'1.000000000001');assert.equal(r.invoices.items.find(x=>x.id==='doc:credit').totalAmount,'-999999999999999999.123456789012');assert.equal(r.invoices.items[0].supplierName,'');
   const candidate=buildMonthlyInventorySnapshotCandidate({companyId:'c',storeId:'s',lifecycleGeneration:'0',issueMonth:input.month,sourceObservedAt:r.observation.readFinishedAt,sourceRevision:'a'.repeat(40),valuationBasis:'CURRENT_OPERATIONAL_V1',coverage:{complete:r.coverage.complete,productCount:1,invoiceCount:61,pendingOriginalCount:75},products:[{id:'synthetic-stock',companyId:'c',storeId:'s',name:'Synthetic stock only',sku:'S',unit:'PC',quantity:'-2',retailUnitPrice:'1',purchaseUnitCost:'1'}],invoices:r.invoices,pendingOriginals:r.pendingOriginals});
   assert.equal(candidate.candidateOnly,true);assert.equal(candidate.persisted,false);assert.match(candidate.payloadHash,/^[a-f0-9]{64}$/);assert.equal(candidate.pendingOriginals.items.length,75);assert.equal(candidate.pendingOriginals.items[0].amount,'1.000000000001');
   for(const legacy of [legacyBefore,legacyAfter]){assert.equal(legacy.items.length,50);assert.equal(legacy.pendingOriginals.items.length,50);assert.equal(typeof legacy.pendingOriginals.items[0].amount,'number');assert.equal(legacy.pendingOriginals.truncated,true)}
   assert.equal(legacyBefore.fingerprint,legacyAfter.fingerprint);assert.deepEqual(legacyBefore.items,legacyAfter.items);assert.deepEqual(legacyBefore.pendingOriginals,legacyAfter.pendingOriginals);assert.equal(await digest(),before);
   assert.equal(JSON.stringify(r).includes('foreign-doc'),false);assert.equal(JSON.stringify(r).includes('synthetic-session'),false);assert.equal(JSON.stringify(r).includes('actorName'),false);
   assert.equal(r.observation.snapshotBasis,'HELD_REPEATABLE_READ_TRANSACTION');assert.equal(r.observation.authorizationBasis,'ASSESSED_IN_HELD_TRANSACTION_SNAPSHOT');assert.ok(r.observation.readStartedAt>=r.observation.transactionStartedAt);assert.ok(r.observation.readFinishedAt>=r.observation.readStartedAt);
  });

  await t.test('full mode shares actual tombstone, uploaded and resolved plain-capture decisions with the legacy reader',async()=>{
   const original=await digest();
   await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorAudit" VALUES('tombstone','c','s','PURCHASE_ORDER_DELETED','owner','{"preservedPaymentTransactionId":"pending-1"}')`);
   await db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "attachmentData"='PRIVATE-ORIGINAL',"attachmentChecksum"=repeat('a',64),"attachmentMimeType"='application/pdf',"attachmentFilename"='original.pdf' WHERE "id"='pending-2'`);
   await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorAudit" VALUES('plain-proof','c','s','POS_INVOICE_PLAIN_CAPTURED','owner',jsonb_build_object('version','POS_DEFERRED_INVOICE_V1','sourceKind','PLAIN_CAPTURE','transactionId','pending-2','fingerprint',repeat('b',64),'supplierId','sup','documentNumber','P2','documentDate','1999-01-01','amountCents',100,'contextSessionId','synthetic-session','originalActorId','owner','checksum',repeat('a',64),'mimeType','application/pdf','filename','original.pdf','manifest',jsonb_build_array(jsonb_build_object('checksum',repeat('a',64),'mimeType','application/pdf'))))`);
   await db.$executeRawUnsafe(`INSERT INTO "DocumentAttachment" VALUES('uploaded','c','s','application/pdf',repeat('c',64),'PRIVATE-UPLOAD')`);
   await db.$executeRawUnsafe(`INSERT INTO "AiReaderJob"("id","companyId","storeId","attachmentId","status","resultJson") VALUES('page-one','c','s','uploaded','PROCESSING','{"posHandoff":{"paymentTransactionId":"pending-3","pageIndex":1}}')`);
   const before=await digest(),r=await read(),legacy=await readPendingInvoices(db,{companyId:'c',storeId:'s',user:owner});
   assert.equal(r.pendingOriginals.items.length,74);assert.equal(r.pendingOriginals.items.some(x=>x.id==='pending-2'),false);assert.equal(r.pendingOriginals.items.find(x=>x.id==='pending-1').status,'REVIEW_REQUIRED');assert.equal(r.pendingOriginals.items.find(x=>x.id==='pending-3').status,'UPLOADED_AWAITING_REVIEW');
   for(const row of legacy.rows)assert.equal(r.pendingOriginals.items.find(x=>x.id===row.id).status,row.status);
   await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');const old=await readPendingInvoices(tx,{companyId:'c',storeId:'s',user:owner}),full=await readPendingInvoiceSnapshotRows(tx,{companyId:'c',storeId:'s',user:owner});assert.equal(full.fingerprint,old.fingerprint);assert.equal(full.counts.total,old.count);assert.equal(full.counts.reviewRequired,old.reviewCount);assert.equal(full.counts.uploadedAwaitingReview,old.uploadedCount)},{isolationLevel:'RepeatableRead',timeout:30000});
   assert.equal(JSON.stringify(r).includes('PRIVATE-'),false);assert.equal(await digest(),before);
   await db.$executeRawUnsafe(`DELETE FROM "AiReaderJob" WHERE "id"='page-one'`);await db.$executeRawUnsafe(`DELETE FROM "DocumentAttachment" WHERE "id"='uploaded'`);await db.$executeRawUnsafe(`DELETE FROM "StoreOperatorAudit" WHERE "id" IN ('tombstone','plain-proof')`);await db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "attachmentData"=NULL,"attachmentChecksum"=NULL,"attachmentMimeType"=NULL,"attachmentFilename"=NULL WHERE "id"='pending-2'`);assert.equal(await digest(),original);
  });

  await t.test('full pending metadata preflight prevents row JSON aggregation for oversized source text',async()=>{
   await db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "supplierName"=repeat('x',513) WHERE "id"='pending-1'`);
   let captured;
   await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');const target=new Proxy(tx,{get(object,key){if(key==='$queryRaw')return async(query,...values)=>{if(query.sql?.includes('WITH scoped_audits'))captured=query;return object.$queryRaw(query,...values)};const value=object[key];return typeof value==='function'?value.bind(object):value}});
    await assert.rejects(readPendingInvoiceSnapshotRows(target,{companyId:'c',storeId:'s',user:owner}),e=>e.code==='PENDING_SNAPSHOT_TEXT_LIMIT');assert.ok(captured);
    const [explain]=await tx.$queryRawUnsafe('EXPLAIN (ANALYZE, VERBOSE, FORMAT JSON) '+captured.text,...captured.values),nodes=[];const walk=p=>{nodes.push(p);for(const child of p.Plans||[])walk(child)};walk(explain['QUERY PLAN'][0].Plan);
    assert.ok(nodes.some(p=>['InitPlan','SubPlan'].includes(p['Parent Relationship'])&&p['Actual Loops']===0&&JSON.stringify(p.Output||[]).includes('jsonb_agg')),'Guarded row JSON scalar subplan must not execute');
   },{isolationLevel:'RepeatableRead',timeout:30000});
   const legacy=await readPendingInvoices(db,{companyId:'c',storeId:'s',user:owner});assert.equal(legacy.rows.find(x=>x.id==='pending-1').supplierName.length,513);await db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "supplierName"=NULL WHERE "id"='pending-1'`);
   // NULL monetary facts remain unknown, but must still count every metadata
   // byte. SQL bool_and/SUM must never silently omit their bounded text.
   await db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "amount"=NULL WHERE "id"='pending-1'`);
   const estimate=()=>db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');const [value]=await tx.$queryRawUnsafe(captured.text,...captured.values);return value},{isolationLevel:'RepeatableRead',timeout:30000});
   const absentLabel=await estimate();await db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "supplierName"=repeat('n',512) WHERE "id"='pending-1'`);const withLabel=await estimate();assert.equal(withLabel._snapshotMetadataValid,true);assert.equal(BigInt(withLabel._snapshotBytes)-BigInt(absentLabel._snapshotBytes),510n);assert.equal(withLabel.rows.find(x=>x.id==='pending-1').amount,null);const legacyNull=await readPendingInvoices(db,{companyId:'c',storeId:'s',user:owner});assert.equal(legacyNull.rows.find(x=>x.id==='pending-1').amount,0);
   await db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","supplierName","amount","actorId","occurredAt","invoiceDocumentNumber","paymentMethod","subtractFromShift","type") SELECT 'null-budget-'||n,'c','s','sup',repeat('n',512),NULL,'owner','2000-01-01'::timestamptz,'N'||n,'CASH',false,'SUPPLIER_PAYMENT' FROM generate_series(1,7000)n`);
   await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorAudit" SELECT 'null-audit-'||n,'c','s','POS_INVOICE_PENDING_CREATED','owner',jsonb_build_object('version','POS_DEFERRED_INVOICE_V1','transactionId','null-budget-'||n,'paymentMethod','CASH','paymentSource','EXTERNAL','supplierId','sup','documentNumber','N'||n,'documentDate','1999-01-01','amountCents',100,'contextSessionId','synthetic-session','terminalPos','SYNTHETIC','fingerprint',repeat('b',64)) FROM generate_series(1,7000)n`);
   await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');const target=new Proxy(tx,{get(object,key){if(key==='$queryRaw')return async(query,...values)=>{if(query.sql?.includes('WITH scoped_audits'))captured=query;return object.$queryRaw(query,...values)};const value=object[key];return typeof value==='function'?value.bind(object):value}});
    await assert.rejects(readPendingInvoiceSnapshotRows(target,{companyId:'c',storeId:'s',user:owner}),e=>e.code==='PENDING_SNAPSHOT_PAYLOAD_LIMIT');const [raw]=await tx.$queryRawUnsafe(captured.text,...captured.values);assert.ok(raw.count<20000);assert.equal(raw._snapshotMetadataValid,true);assert.ok(BigInt(raw._snapshotBytes)>4193280n);assert.deepEqual(raw.rows,[]);
    const [explain]=await tx.$queryRawUnsafe('EXPLAIN (ANALYZE, VERBOSE, FORMAT JSON) '+captured.text,...captured.values),nodes=[];const walk=p=>{nodes.push(p);for(const child of p.Plans||[])walk(child)};walk(explain['QUERY PLAN'][0].Plan);assert.ok(nodes.some(p=>['InitPlan','SubPlan'].includes(p['Parent Relationship'])&&p['Actual Loops']===0&&JSON.stringify(p.Output||[]).includes('jsonb_agg')),'Oversized NULL-money row JSON must not aggregate');
   },{isolationLevel:'RepeatableRead',timeout:30000});
   await db.$executeRawUnsafe(`DELETE FROM "StoreOperatorAudit" WHERE "id" LIKE 'null-audit-%'`);await db.$executeRawUnsafe(`DELETE FROM "StoreTransaction" WHERE "id" LIKE 'null-budget-%'`);await db.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "amount"=1.000000000001,"supplierName"=NULL WHERE "id"='pending-1'`);

  });

  await t.test('actual writable and ReadCommitted transactions refuse before source data; native current role/license/company/store checks remain',async()=>{
   const before=await digest();await assert.rejects(db.$transaction(tx=>project(tx,owner,input),{isolationLevel:'RepeatableRead'}),e=>e.code==='INVOICE_SNAPSHOT_TRANSACTION_REQUIRED');
   await assert.rejects(db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');return project(tx,owner,input)},{isolationLevel:'ReadCommitted'}),e=>e.code==='INVOICE_SNAPSHOT_TRANSACTION_REQUIRED');
   for(const storeId of ['', 'foreign','inactive'])await assert.rejects(read(owner,{...input,storeId}));await assert.rejects(read({...owner,tokenType:'STORE_OPERATOR'}));
   await db.$executeRawUnsafe(`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='owner'`);await assert.rejects(read(),e=>e.status===403);await db.$executeRawUnsafe(`UPDATE "User" SET "role"='OWNER' WHERE "id"='owner'`);
   await db.$executeRawUnsafe(`INSERT INTO "StorePaidModule" VALUES('c','s','INVENTORY',false,NULL,NULL)`);await assert.rejects(read(),e=>e.status===403);await db.$executeRawUnsafe(`DELETE FROM "StorePaidModule"`);
   const support={id:'sa',companyId:'c',role:'OWNER',isSuperAdmin:true,platformRole:'SUPER_ADMIN',supportContext:{companyId:'c',storeId:'s'}};assert.equal((await read(support)).companyId,'c');await assert.rejects(read({...support,supportContext:{companyId:'x',storeId:'foreign'}}),e=>e.status===403);assert.equal(await digest(),before);
  });

  await t.test('same held database snapshot excludes concurrent new invoice and labels concurrent role revocation honestly',async()=>{
   let changed=false;const snapshots=new Set();
   const held=await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');return project(new Proxy(tx,{get(target,key){
    if(key==='$queryRawUnsafe')return async(sql,...values)=>{const result=await target.$queryRawUnsafe(sql,...values);const [state]=await target.$queryRawUnsafe("SELECT txid_current_snapshot()::text AS snapshot");snapshots.add(state.snapshot);
     if(!changed&&sql.startsWith('SELECT source.')&&sql.includes('FROM "PurchaseDocument" d')){changed=true;await other.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" VALUES('concurrent','c','s','sup','INVOICE','NEW 1','2000-01-11',1,'DRAFT','MANUAL',NULL,NULL,'2000-01-11')`);await other.$executeRawUnsafe(`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='owner'`)}return result};
    const value=target[key];return typeof value==='function'?value.bind(target):value;
   }}),owner,input)},{isolationLevel:'RepeatableRead',timeout:30000});
   assert.equal(changed,true);assert.equal(snapshots.size,1);assert.equal(held.invoices.items.length,61);assert.equal(held.observation.authorizationBasis,'ASSESSED_IN_HELD_TRANSACTION_SNAPSHOT');await assert.rejects(read(),e=>e.status===403);
   await db.$executeRawUnsafe(`UPDATE "User" SET "role"='OWNER' WHERE "id"='owner'`);assert.equal((await read()).invoices.items.length,62);
  });

  await t.test('optional source absence including zero intents remains incomplete; reader never initializes missing relations',async()=>{
   await db.$executeRawUnsafe('ALTER TABLE "PosInvoiceBackgroundTask" RENAME TO "SavedTask"');let r=await read();assert.equal(r.coverage.complete,false);assert.equal(r.freezeEligibility.eligible,false);assert.ok(r.freezeEligibility.reasons.includes('PENDING_SOURCE_UNAVAILABLE'));
   const backup=await db.$queryRawUnsafe('SELECT * FROM "StoreOperatorAudit"');await db.$executeRawUnsafe('ALTER TABLE "StoreOperatorAudit" RENAME TO "SavedAudit"');await db.$executeRawUnsafe(`CREATE TABLE "StoreOperatorAudit"(${definitions.StoreOperatorAudit})`);
   r=await read();assert.equal(r.pendingOriginals.items.length,0);assert.equal(r.coverage.complete,false);assert.equal(r.freezeEligibility.eligible,false);assert.equal((await db.$queryRawUnsafe(`SELECT to_regclass('"PosInvoiceBackgroundTask"') IS NULL AS missing`))[0].missing,true);
   await db.$executeRawUnsafe('DROP TABLE "StoreOperatorAudit"');await db.$executeRawUnsafe('ALTER TABLE "SavedAudit" RENAME TO "StoreOperatorAudit"');await db.$executeRawUnsafe('ALTER TABLE "SavedTask" RENAME TO "PosInvoiceBackgroundTask"');assert.equal(backup.length,75);
  });

  await t.test('unknown issue date and actual complete-source cap cannot become a complete partial candidate',async()=>{
   await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" VALUES('unknown','c','s','sup','INVOICE','U 1',NULL,1,'DRAFT','MANUAL',NULL,NULL,'2000-01-05')`);let r=await read();assert.equal(r.freezeEligibility.eligible,false);assert.ok(r.freezeEligibility.reasons.includes('INVOICE_ISSUE_DATE_UNKNOWN'));assert.ok(r.invoices.items.some(x=>x.id==='doc:unknown'&&x.issueDay===null));
   await db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","amount","actorId","occurredAt","invoiceDocumentNumber","paymentMethod","subtractFromShift","type") SELECT 'limit-'||n,'c','s','sup',1,'owner','2000-01-01'::timestamptz,'L'||n,'CASH',false,'SUPPLIER_PAYMENT' FROM generate_series(1,20001)n`);
   await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorAudit" SELECT 'limit-audit-'||n,'c','s','POS_INVOICE_PENDING_CREATED','owner',jsonb_build_object('version','POS_DEFERRED_INVOICE_V1','transactionId','limit-'||n,'paymentMethod','CASH','paymentSource','EXTERNAL','supplierId','sup','documentNumber','L'||n,'documentDate','1999-01-01','amountCents',100,'contextSessionId','synthetic-session','terminalPos','SYNTHETIC','fingerprint',repeat('b',64)) FROM generate_series(1,20001)n`);
   const before=await digest();await assert.rejects(read(),e=>e.code==='PENDING_SNAPSHOT_LIMIT');assert.equal(await digest(),before);
  });
 }finally{await db.$disconnect();await other.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
