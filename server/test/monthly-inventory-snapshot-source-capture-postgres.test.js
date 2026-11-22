import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readMonthlyInventorySnapshotSourcesInTransaction as source} from '../src/services/monthly-inventory-snapshot-source.js';
import {captureMonthlyInventorySnapshot as capture} from '../src/services/monthly-inventory-snapshot-capture.js';
import {provisionMonthlyInventorySnapshotSchema} from '../src/services/monthly-inventory-snapshot-schema.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}};
const owner={id:'owner',companyId:'c',role:'OWNER'},input={storeId:'s',month:'2000-01',lifecycleGeneration:'0'},q=v=>'"'+v.replaceAll('"','""')+'"';
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
 PosInvoiceBackgroundTask:'"jobId" text,"companyId" text,"storeId" text',
 Product:'"id" text PRIMARY KEY,"companyId" text,"name" text,"sku" text,"unit" text,"salePrice" numeric,"costPrice" numeric,"active" bool',
 StoreProduct:'"id" text PRIMARY KEY,"storeId" text,"productId" text,"currentStock" numeric,"salePrice" numeric,"active" bool',
 PurchaseDocumentLine:'"id" text PRIMARY KEY,"purchaseDocumentId" text,"productId" text,"unit" text,"unitCost" numeric,"unitsPerPackage" numeric',
 StoreLifecycleFence:'"storeId" text PRIMARY KEY,"companyId" text,"generation" bigint NOT NULL,"maintenance" bool NOT NULL,"retired" bool NOT NULL'
};

test('native complete stock/C2 capture uses actual coherent source reads, exact costs and immutable two-phase storage',{
 skip:!isolated()&&!process.env.CI?'Isolated PostgreSQL unavailable locally':false,timeout:240000
},async t=>{
 assert.ok(isolated(),'Native isolated PostgreSQL is mandatory in CI');
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),name='stock_capture_'+randomUUID().replaceAll('-','')+'_test';let db,other,created=false;
 const previousRevision=process.env.RENDER_GIT_COMMIT;process.env.RENDER_GIT_COMMIT='a'.repeat(40);
 try{
  await admin.$executeRawUnsafe(`CREATE DATABASE ${q(name)}`);created=true;const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;
  db=new PrismaClient({datasourceUrl:url.href});other=new PrismaClient({datasourceUrl:url.href});
  for(const [table,columns]of Object.entries(definitions))await db.$executeRawUnsafe(`CREATE TABLE ${q(table)}(${columns})`);
  await db.$executeRawUnsafe(`INSERT INTO "Company" VALUES('c','SYNTHETIC',true,'ACTIVE',NULL),('x','FOREIGN',true,'ACTIVE',NULL),('platform','PLATFORM',true,'ACTIVE',NULL)`);
  await db.$executeRawUnsafe(`INSERT INTO "User" VALUES('owner','OWNER','c'),('sa','SUPER_ADMIN','platform'),('employee','EMPLOYEE','c')`);
  await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES('s','c','SYNTHETIC',true),('control','c','CONTROL',true),('foreign','x','FOREIGN',true),('unenrolled','c','UNENROLLED',true),('empty','c','EMPTY',true)`);
  await db.$executeRawUnsafe(`INSERT INTO "CompanyModule" VALUES('module','c','INVENTORY',true,NULL,NULL)`);
  await db.$executeRawUnsafe(`INSERT INTO "Supplier" VALUES('sup','c','SYNTHETIC','099999999')`);
  await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" SELECT 'invoice-'||n,'c','s','sup','INVOICE','A '||n,'2000-01-03'::timestamp,1.000000000001,'DRAFT','MANUAL',NULL,NULL,'2000-01-03'::timestamp FROM generate_series(1,60)n`);
  await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" VALUES('cost','c','s','sup','INVOICE','COST 1','2000-01-06',1,'APPROVED','MANUAL',NULL,NULL,'2000-01-06'),('credit','c','s','sup','CREDIT_NOTE','CREDIT 1','2000-01-07',-3,'APPROVED','MANUAL',NULL,NULL,'2000-01-07'),('cost-draft','c','s','sup','INVOICE','DRAFT COST 1','2000-01-30',999,'DRAFT','MANUAL',NULL,NULL,'2000-01-30'),('foreign-doc','x','foreign',NULL,'INVOICE','FOREIGN 1','2000-01-03',999,'DRAFT','MANUAL',NULL,NULL,'2000-01-03')`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","supplierName","amount","actorId","actorName","occurredAt","invoiceDocumentNumber","paymentMethod","subtractFromShift","sessionId","type") SELECT 'pending-'||n,'c','s','sup','SYNTHETIC',1.000000000001,'owner','SYNTHETIC','2000-01-01'::timestamptz,'P'||n,'CASH',false,NULL,'SUPPLIER_PAYMENT' FROM generate_series(1,75)n`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorAudit" SELECT 'audit-'||n,'c','s','POS_INVOICE_PENDING_CREATED','owner',jsonb_build_object('version','POS_DEFERRED_INVOICE_V1','transactionId','pending-'||n,'paymentMethod','CASH','paymentSource','EXTERNAL','supplierId','sup','supplierName','SYNTHETIC','documentNumber','P'||n,'documentDate','2000-01-01','amountCents',100,'contextSessionId','synthetic-session','fingerprint',repeat('b',64)) FROM generate_series(1,75)n`);
  await db.$executeRawUnsafe(`INSERT INTO "Product" SELECT 'p-'||n,'c','Συνθετικό '||n,'SKU'||n,CASE WHEN n=5 THEN 'KG' ELSE 'PIECE' END,2.0000,CASE WHEN n=6 THEN NULL ELSE 7.123456 END,n<>59 FROM generate_series(1,60)n`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreProduct" SELECT 'sp-'||n,'s','p-'||n,CASE WHEN n=1 THEN -2.5 WHEN n=2 THEN 0 ELSE n END,CASE WHEN n=1 THEN 0 ELSE NULL END,n<>60 FROM generate_series(1,60)n`);
  await db.$executeRawUnsafe(`INSERT INTO "Product" VALUES('foreign-product','x','FOREIGN','FX','PIECE',999,999,true)`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreProduct" VALUES('sibling-stock','control','p-1',222,123,true),('foreign-stock','foreign','foreign-product',333,999,true)`);
  await db.$executeRawUnsafe(`INSERT INTO "PurchaseDocumentLine" VALUES('exact','cost','p-1','PACKAGE',1,8),('third','cost','p-2','PACKAGE',1,3),('tie-a','cost','p-3','PIECE',2,1),('tie-b','cost','p-3','PIECE',3,1),('signed-credit','credit','p-4','PIECE',-3,1),('unapproved','cost-draft','p-1','PIECE',999,1)`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence" VALUES('s','c',0,false,false),('control','c',0,false,false),('foreign','x',0,false,false),('empty','c',0,false,false)`);
  await provisionMonthlyInventorySnapshotSchema(db);
  const business=Object.keys(definitions),digest=async()=>JSON.stringify(await Promise.all(business.map(table=>db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n,md5(COALESCE(string_agg(row_to_json(t)::text,',' ORDER BY row_to_json(t)::text),'')) AS digest FROM ${q(table)} t`))));
  const read=(request=input,actor=owner,transaction=db,hook)=>transaction.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='8000ms'");
   const selected=hook?new Proxy(tx,{get(target,key){if(key==='$queryRawUnsafe')return async(sql,...args)=>hook(target,sql,args);const value=target[key];return typeof value==='function'?value.bind(target):value}}):tx;
   return source(selected,actor,request);
  },{isolationLevel:'RepeatableRead',maxWait:2000,timeout:35000});
  const before=await digest();let first;
  await t.test('more than50 complete stock, invoice and pending rows preserve inactive/signed/zero/package/credit facts with explicit unknown costs',async()=>{
   const facts=await read();assert.equal(facts.products.length,60);assert.equal(facts.invoices.items.length,63);assert.equal(facts.pendingOriginals.items.length,75);assert.equal(facts.stockPopulation.activeCount,58);assert.equal(facts.stockPopulation.inactiveCount,2);
   const p=id=>facts.products.find(p=>p.id===id);assert.equal(p('p-1').quantity,'-2.5');assert.equal(p('p-1').retailUnitPrice,'0');assert.equal(p('p-1').purchaseUnitCost,'0.125');assert.equal(p('p-2').quantity,'0');assert.equal(p('p-2').purchaseUnitCost,false);assert.equal(p('p-3').purchaseUnitCost,false);assert.equal(p('p-4').purchaseUnitCost,'-3');assert.equal(p('p-6').purchaseUnitCost,null);
   assert.deepEqual(facts.stockCostLimitations,{NON_REPRESENTABLE_PACKAGE_COST:1,AMBIGUOUS_LATEST_PURCHASE_COST:1});assert.equal(await digest(),before);
   first=await capture(db,owner,input);assert.equal(first.status,'STORED');assert.equal(first.sourceReadPerformed,true);assert.equal(first.newlyReadCandidateStored,true);assert.equal(first.receipt.sourceAuthenticityVerified,false);
   const candidate=JSON.parse(first.receipt.candidateJsonText);assert.equal(candidate.products.find(p=>p.id==='p-2').purchaseUnknownReason,'INVALID');assert.equal(candidate.products.find(p=>p.id==='p-6').purchaseUnknownReason,'MISSING');assert.equal(candidate.quantityByUnit.find(u=>u.unit==='PIECE').purchaseValue,null);assert.equal(candidate.persisted,false);assert.equal(candidate.candidateOnly,true);assert.deepEqual(first.receipt.sourceCoverage.stockCostLimitations,facts.stockCostLimitations);assert.equal(await digest(),before);
  });
  await t.test('replay returns original verified coverage without touching unavailable or changed stock sources',async()=>{
   await db.$executeRawUnsafe('ALTER TABLE "Product" RENAME TO "TemporarilyHiddenProduct"');
   try{const replay=await capture(db,owner,input);assert.equal(replay.status,'ALREADY_CAPTURED');assert.equal(replay.sourceReadPerformed,false);assert.equal(replay.newlyReadCandidateStored,false);assert.equal(replay.receipt.id,first.receipt.id);assert.equal(replay.receipt.candidateJsonText,first.receipt.candidateJsonText);assert.deepEqual(replay.receipt.sourceCoverage,first.receipt.sourceCoverage)}finally{await db.$executeRawUnsafe('ALTER TABLE "TemporarilyHiddenProduct" RENAME TO "Product"')}
   assert.equal(await digest(),before);
  });
  await t.test('concurrent complete producers preserve one immutable first result and honest replay metadata',async()=>{
   const request={...input,month:'2000-02'},results=await Promise.all([capture(db,owner,request),capture(other,owner,request)]);
   assert.deepEqual(results.map(r=>r.status).sort(),['ALREADY_CAPTURED','STORED']);assert.equal(results[0].receipt.id,results[1].receipt.id);assert.equal(results[0].receipt.candidateJsonText,results[1].receipt.candidateJsonText);assert.deepEqual(results[0].receipt.sourceCoverage,results[1].receipt.sourceCoverage);assert.equal(await digest(),before);
  });
  await t.test('one real held RR source snapshot excludes a concurrent stock change and the next source transaction sees it',async()=>{
   let changed=false;
   try{
    const held=await read(input,owner,db,async(tx,sql,args)=>{const result=await tx.$queryRawUnsafe(sql,...args);if(!changed&&sql.startsWith('SELECT COUNT(*)::text AS count FROM "StoreProduct"')){changed=true;await other.$executeRawUnsafe(`UPDATE "StoreProduct" SET "currentStock"=999 WHERE "id"='sp-1'`)}return result});
    assert.equal(changed,true);assert.equal(held.products.find(p=>p.id==='p-1').quantity,'-2.5');assert.equal((await read()).products.find(p=>p.id==='p-1').quantity,'999');
   }finally{await other.$executeRawUnsafe(`UPDATE "StoreProduct" SET "currentStock"=-2.5 WHERE "id"='sp-1'`)}
   assert.equal(await digest(),before);
  });
  await t.test('generation and current personal-role transitions after the read prevent a stale write',async()=>{
   for(const kind of ['generation','role']){
    let transitioned=false;const proxy={$transaction:async(fn,options)=>{const result=await db.$transaction(fn,options);if(options?.isolationLevel==='RepeatableRead'&&!transitioned){transitioned=true;await other.$transaction(async tx=>{if(kind==='generation'){await tx.$queryRawUnsafe(`SELECT 1 FROM "StoreLifecycleFence" WHERE "storeId"='s' FOR UPDATE`);await tx.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=1 WHERE "storeId"='s'`)}else await tx.$executeRawUnsafe(`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='owner'`)})}return result}};
    try{await assert.rejects(capture(proxy,owner,{...input,month:'2000-03'}),e=>kind==='generation'?e.code==='STORE_LIFECYCLE_STALE_GENERATION':e.status===403);assert.equal(transitioned,true)}finally{await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=0 WHERE "storeId"='s'`);await db.$executeRawUnsafe(`UPDATE "User" SET "role"='OWNER' WHERE "id"='owner'`)}
   }
   assert.equal((await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "MonthlyInventorySnapshot" WHERE "issueMonth"='2000-03'`))[0].n,0);assert.equal(await digest(),before);
  });
  await t.test('request and principal mutations during lookup cannot relabel expected epoch or authorization scope',async()=>{
   const request={...input,month:'2000-04'},principal={...owner,supportContext:null};let mutated=false;
   const proxy={$transaction:(fn,options)=>db.$transaction(async tx=>fn(new Proxy(tx,{get(target,key){if(key==='$queryRawUnsafe')return async(sql,...args)=>{const result=await target.$queryRawUnsafe(sql,...args);if(!mutated&&sql.includes('FROM "MonthlyInventorySnapshot" WHERE')){mutated=true;request.lifecycleGeneration='1';request.storeId='foreign';request.month='2000-05';principal.id='employee';principal.companyId='x';principal.supportContext={companyId:'x',storeId:'foreign'}}return result};const value=target[key];return typeof value==='function'?value.bind(target):value}})),options)};
   const result=await capture(proxy,principal,request);assert.equal(mutated,true);assert.equal(result.status,'STORED');assert.equal(result.receipt.storeId,'s');assert.equal(result.receipt.lifecycleGeneration,'0');assert.equal(result.receipt.issueMonth,'2000-04');assert.equal(result.receipt.companyId,'c');assert.equal(await digest(),before);
  });
  await t.test('an enrolled empty store is genuinely complete only while every required source capability exists',async()=>{
   const request={...input,storeId:'empty'},facts=await read(request);assert.deepEqual(facts.coverage,{complete:true,productCount:0,invoiceCount:0,pendingOriginalCount:0});assert.equal(facts.products.length,0);assert.equal((await capture(db,owner,request)).status,'STORED');
   await db.$executeRawUnsafe('ALTER TABLE "StoreProduct" RENAME TO "HiddenStoreProduct"');try{await assert.rejects(read(request),{code:'STOCK_SNAPSHOT_SOURCE_UNAVAILABLE'})}finally{await db.$executeRawUnsafe('ALTER TABLE "HiddenStoreProduct" RENAME TO "StoreProduct"')}
   assert.equal(await digest(),before);
  });
  await t.test('actual admission, schema, invalid units/numeric and scoped-link failures never create a partial success',async()=>{
   await assert.rejects(db.$transaction(tx=>source(tx,owner,input),{isolationLevel:'ReadCommitted'}),{code:'INVOICE_SNAPSHOT_TRANSACTION_REQUIRED'});
   await assert.rejects(read({...input,month:'2099-12'}),{code:'SNAPSHOT_BEFORE_DUE'});
   await assert.rejects(read({...input,lifecycleGeneration:'1'}),{code:'STORE_LIFECYCLE_STALE_GENERATION'});await assert.rejects(read({...input,storeId:'unenrolled'}),{code:'MONTHLY_SNAPSHOT_ENROLLMENT_REQUIRED'});await assert.rejects(read({...input,storeId:'foreign'}));
   await db.$executeRawUnsafe(`INSERT INTO "StorePaidModule" VALUES('c','s','INVENTORY',false,NULL,NULL)`);try{await assert.rejects(capture(db,owner,input),e=>e.status===403)}finally{await db.$executeRawUnsafe('DELETE FROM "StorePaidModule"')}
   await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "maintenance"=true WHERE "storeId"='s'`);try{await assert.rejects(read(),{code:'STORE_LIFECYCLE_MAINTENANCE'})}finally{await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "maintenance"=false WHERE "storeId"='s'`)}
   await db.$executeRawUnsafe('ALTER TABLE "Product" RENAME COLUMN "unit" TO "missingUnit"');try{await assert.rejects(read(),{code:'STOCK_SNAPSHOT_SOURCE_UNAVAILABLE'})}finally{await db.$executeRawUnsafe('ALTER TABLE "Product" RENAME COLUMN "missingUnit" TO "unit"')}
   await db.$executeRawUnsafe(`UPDATE "PurchaseDocumentLine" SET "unitsPerPackage"=0 WHERE "id"='exact'`);try{await assert.rejects(read(),{code:'STOCK_SNAPSHOT_COST_INVALID'})}finally{await db.$executeRawUnsafe(`UPDATE "PurchaseDocumentLine" SET "unitsPerPackage"=8 WHERE "id"='exact'`)}
   await db.$executeRawUnsafe(`INSERT INTO "StoreProduct" VALUES('foreign-link','s','foreign-product',1,NULL,true)`);try{await assert.rejects(read(),{code:'STOCK_SNAPSHOT_LINKS_INVALID'})}finally{await db.$executeRawUnsafe(`DELETE FROM "StoreProduct" WHERE "id"='foreign-link'`)}
   await db.$executeRawUnsafe(`INSERT INTO "StoreProduct" VALUES('duplicate-link','s','p-1',1,NULL,true)`);try{await assert.rejects(read(),{code:'STOCK_SNAPSHOT_LINKS_INVALID'})}finally{await db.$executeRawUnsafe(`DELETE FROM "StoreProduct" WHERE "id"='duplicate-link'`)}
   await db.$executeRawUnsafe('ALTER TABLE "PurchaseDocumentLine" ALTER COLUMN "unitCost" TYPE text USING "unitCost"::text');
   try{await db.$executeRawUnsafe(`UPDATE "PurchaseDocumentLine" SET "unitCost"=$1 WHERE "id"='tie-b'`,'1\n');assert.equal((await db.$queryRawUnsafe(`SELECT "unitCost" FROM "PurchaseDocumentLine" WHERE "id"='tie-b'`))[0].unitCost,'1\n');await assert.rejects(read(),{code:'STOCK_SNAPSHOT_COST_INVALID'});await db.$executeRawUnsafe(`UPDATE "PurchaseDocumentLine" SET "unitCost"='3' WHERE "id"='tie-b'`);await db.$executeRawUnsafe(`UPDATE "PurchaseDocumentLine" SET "unitCost"=repeat('9',10000) WHERE "id"='exact'`);await assert.rejects(read(),{code:'STOCK_SNAPSHOT_COST_INVALID'});await db.$executeRawUnsafe(`UPDATE "PurchaseDocumentLine" SET "unitCost"='1' WHERE "id"='exact'`)}finally{await db.$executeRawUnsafe('ALTER TABLE "PurchaseDocumentLine" ALTER COLUMN "unitCost" TYPE numeric USING "unitCost"::numeric')}
   await db.$executeRawUnsafe(`UPDATE "Product" SET "name"=repeat('X',200000) WHERE "id"='p-1'`);let bounded;
   try{await assert.rejects(read(input,owner,db,async(tx,sql,args)=>{const result=await tx.$queryRawUnsafe(sql,...args);if(sql.startsWith('WITH source AS MATERIALIZED'))bounded=result[0];return result}),{code:'STOCK_SNAPSHOT_SOURCE_FIELDS_INVALID'});assert.equal(bounded.rows.length,0);assert.equal(bounded.valid_count,'59');assert.ok(BigInt(bounded.bytes)<100000n)}finally{await db.$executeRawUnsafe(`UPDATE "Product" SET "name"='Συνθετικό 1' WHERE "id"='p-1'`)}
   assert.equal(await digest(),before);
  });
  await t.test('full source row and SQL aggregate byte limits reject without a truncated capture or evaluated oversized aggregate',async()=>{
   const add=async(n,name)=>{await db.$executeRawUnsafe(`INSERT INTO "Product" SELECT 'large-'||n,'c',repeat($2,512),repeat('S',128),'PIECE',1,1,true FROM generate_series(1,$1::int)n`,n,name);await db.$executeRawUnsafe(`INSERT INTO "StoreProduct" SELECT 'large-sp-'||n,'s','large-'||n,1,NULL,true FROM generate_series(1,$1::int)n`,n)};
   const remove=async()=>{await db.$executeRawUnsafe(`DELETE FROM "StoreProduct" WHERE "id" LIKE 'large-sp-%'`);await db.$executeRawUnsafe(`DELETE FROM "Product" WHERE "id" LIKE 'large-%'`)};
   try{await add(19941,'X');await assert.rejects(read(),{code:'STOCK_SNAPSHOT_ROW_LIMIT'})}finally{await remove()}
   let sql,parameters,observation;
   try{
    await add(7000,'X');await assert.rejects(read(input,owner,db,async(tx,text,args)=>{const result=await tx.$queryRawUnsafe(text,...args);if(text.startsWith('WITH source AS MATERIALIZED')){sql=text;parameters=args;observation=result[0]}return result}),{code:'STOCK_SNAPSHOT_PAYLOAD_LIMIT'});
    assert.equal(observation.rows.length,0);assert.ok(BigInt(observation.bytes)>4194304n);assert.equal(observation.count,'7060');
    // Put the individual row-byte sum just BELOW4MiB, while the complete
    // array is ABOVE4MiB once JSONB array separators are included.
    const shrink=Number((BigInt(observation.bytes)-(4194304n-BigInt(observation.count)))/7000n);assert.ok(shrink>0&&shrink<512);
    await db.$executeRawUnsafe(`UPDATE "Product" SET "name"=repeat('X',$1::int) WHERE "id" LIKE 'large-%'`,512-shrink);
    await assert.rejects(read(input,owner,db,async(tx,text,args)=>{const result=await tx.$queryRawUnsafe(text,...args);if(text.startsWith('WITH source AS MATERIALIZED'))observation=result[0];return result}),{code:'STOCK_SNAPSHOT_PAYLOAD_LIMIT'});
    assert.ok(BigInt(observation.bytes)<=4194304n);assert.ok(BigInt(observation.bytes)+2n*BigInt(observation.count)+2n>4194304n);assert.equal(observation.rows.length,0);
    const plan=await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='12000ms'");return tx.$queryRawUnsafe('EXPLAIN (ANALYZE, FORMAT JSON) '+sql,...parameters)},{isolationLevel:'RepeatableRead',timeout:20000});
    const visit=node=>[node,...(node.Plans||[]).flatMap(visit)],nodes=visit(plan[0]['QUERY PLAN'][0].Plan),subplans=nodes.filter(n=>n['Parent Relationship']==='SubPlan'||n['Parent Relationship']==='InitPlan');
    assert.ok(subplans.some(n=>n['Node Type']==='Aggregate'&&n['Actual Loops']===0),'the rejected array aggregation must not execute');
   }finally{await remove()}
   assert.equal(await digest(),before);
  });
 }finally{
  if(previousRevision===undefined)delete process.env.RENDER_GIT_COMMIT;else process.env.RENDER_GIT_COMMIT=previousRevision;
  await db?.$disconnect();await other?.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)} WITH (FORCE)`);await admin.$disconnect();
 }
});
