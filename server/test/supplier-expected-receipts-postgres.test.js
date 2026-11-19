import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {once} from 'node:events';
import {createLifecycleFetch,lifecycleHeader} from '../../client/src/utils/store-lifecycle-fetch.js';
import {expectedReceiptIntentContext,createExpectedReceiptIntent,saveExpectedReceiptIntent,readExpectedReceiptIntent} from '../../client/src/components/commerce/expected-receipt-intents.js';
import {storeLifecycleRequestContext} from '../src/middleware/store-lifecycle-context.js';
import {readFile} from 'node:fs/promises';
import {createExpectedReceiptRouter} from '../src/routes/supplier-expected-receipts.js';
import {ownerRestrictedModuleKeys} from '../src/services/module-catalog.js';
import {PrismaClient} from '@prisma/client';
import {buildOrderSuggestions} from '../src/lib/order-suggestions.js';
import {ensureExpectedReceiptSchema,mutateExpectedReceipt,expectedReceiptRows,expectedReceiptReadiness,postedReceiptSource,rejectExpectedReceiptIntent,assertExpectedReceiptAuthority} from '../src/services/supplier-expected-receipts.js';

// Actual production service/SQL on a separate schema in the isolated CI database.
test('expected receipts: exact quantities, atomic allocation, authority and unchanged stock',{skip:!process.env.DATABASE_URL,timeout:90000},async t=>{
  const url=new URL(process.env.DATABASE_URL);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));assert.match(url.pathname,/_test$/);assert.equal(process.env.NODE_ENV,'test');
  const admin=new PrismaClient(),schema='expected_'+crypto.randomBytes(8).toString('hex');
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('schema',schema);
  const client=new PrismaClient({datasources:{db:{url:url.toString()}}});
  const wrap=raw=>({
    $queryRaw:raw.$queryRaw.bind(raw),$executeRaw:raw.$executeRaw.bind(raw),$queryRawUnsafe:raw.$queryRawUnsafe.bind(raw),$executeRawUnsafe:async sql=>{let result;for(const statement of sql.split(';').filter(part=>part.trim()))result=await raw.$executeRawUnsafe(statement);return result},
    store:{findUnique:async({where})=>(await raw.$queryRaw`SELECT * FROM "Store" WHERE "id"=${where.id}`)[0]},
    company:{findUnique:async({where})=>{const company=(await raw.$queryRaw`SELECT * FROM "Company" WHERE "id"=${where.id}`)[0];return company?{...company,modules:await raw.$queryRaw`SELECT * FROM "CompanyModule" WHERE "companyId"=${where.id}`}:null;}}
  });
  const db={...wrap(client),$transaction:(work,options)=>client.$transaction(tx=>work(wrap(tx)),options)};
  const scope={companyId:'c',storeId:'s'};
  const owner={user:{id:'owner',role:'OWNER',companyId:'c'},body:{}};
  const operation=(action,body,id,req=owner)=>mutateExpectedReceipt(db,{...req,body:{storeId:'s',idempotencyKey:crypto.randomUUID(),...body}},scope,action,id);
  try{
    const tables={
      Company:'"id" TEXT PRIMARY KEY,"active" BOOLEAN,"licenseStatus" TEXT,"subscriptionEndsAt" TIMESTAMPTZ',
      CompanyModule:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"moduleKey" TEXT,"active" BOOLEAN,"startsAt" TIMESTAMPTZ,"endsAt" TIMESTAMPTZ',
      Store:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"active" BOOLEAN',StorePaidModule:'"storeId" TEXT,"moduleKey" TEXT,"active" BOOLEAN,"startsAt" TIMESTAMPTZ,"endsAt" TIMESTAMPTZ',
      Product:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"unit" TEXT,"active" BOOLEAN',
      StoreProduct:'"storeId" TEXT,"productId" TEXT,"active" BOOLEAN,"currentStock" NUMERIC,PRIMARY KEY("storeId","productId")',
      Supplier:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"active" BOOLEAN',
      PurchaseOrder:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"supplierId" TEXT,"status" TEXT,"invoiceNumber" TEXT,"updatedAt" TIMESTAMPTZ,"reopenVersion" INTEGER',
      PurchaseOrderPosting:'"orderId" TEXT PRIMARY KEY,"companyId" TEXT,"purchaseDocumentId" TEXT,"supplierId" TEXT',
      PurchaseDocument:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"supplierId" TEXT,"status" TEXT,"documentType" TEXT,"updatedAt" TIMESTAMPTZ',
      InvoiceStockPosting:'"companyId" TEXT,"orderId" TEXT,"storeId" TEXT,"postedDocumentId" TEXT,"path" TEXT',
      StockMovement:'"id" TEXT PRIMARY KEY,"storeId" TEXT,"productId" TEXT,"sourceType" TEXT,"sourceId" TEXT,"movementType" TEXT,"quantity" NUMERIC,"unitCost" NUMERIC,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()',
      StoreOperatorAudit:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"actorId" TEXT,"eventType" TEXT,"details" JSONB',
      BackofficeStaffAccount:'"userId" TEXT PRIMARY KEY,"companyId" TEXT,"username" TEXT,"active" BOOLEAN,"revision" INTEGER',
      User:'"id" TEXT PRIMARY KEY,"companyId" TEXT,"fullName" TEXT,"email" TEXT,"mustChangePassword" BOOLEAN,"role" TEXT,"sessionVersion" INTEGER',
      UserSession:'"id" TEXT PRIMARY KEY,"userId" TEXT,"revokedAt" TIMESTAMPTZ,"expiresAt" TIMESTAMPTZ',
      BackofficeStaffGrant:'"userId" TEXT,"companyId" TEXT,"storeId" TEXT,"active" BOOLEAN,"profile" TEXT,"capabilities" JSONB,"revision" INTEGER'
    };
    for(const [name,columns] of Object.entries(tables))await db.$executeRawUnsafe(`CREATE TABLE "${name}"(${columns})`);
    await db.$executeRawUnsafe(`INSERT INTO "Company" VALUES('c',true,'ACTIVE',NULL),('foreign',true,'ACTIVE',NULL); INSERT INTO "Store" VALUES('s','c',true),('other','c',true),('foreign','foreign',true); INSERT INTO "CompanyModule" VALUES('d','c','DOCUMENTS',true,NULL,NULL),('i','c','INVENTORY',true,NULL,NULL),('o','c','ORDER_SUGGESTIONS',true,NULL,NULL); INSERT INTO "Product" VALUES('p','c','Pack','PIECE',true); INSERT INTO "StoreProduct" VALUES('s','p',true,9); INSERT INTO "Supplier" VALUES('supplier','c','Supplier',true); INSERT INTO "PurchaseOrder" VALUES('order','c','s','supplier','INVOICED','DOC',NOW(),0); INSERT INTO "PurchaseOrderPosting" VALUES('order','c','doc','supplier'); INSERT INTO "PurchaseDocument" VALUES('doc','c','s','supplier','APPROVED','INVOICE',NOW()); INSERT INTO "InvoiceStockPosting" VALUES('c','order','s','doc','PURCHASE_ORDER'); INSERT INTO "StockMovement"("id","storeId","productId","sourceType","sourceId","movementType","quantity","unitCost") VALUES('base','s','p','PURCHASE_ORDER','order','PURCHASE',1,6),('pack','s','p','PURCHASE_ORDER','order','PURCHASE_PACK_CORRECTION',5,1)`);
    await t.test('uninstalled receipt subsystem performs no schema writes and preserves explicit readiness',async()=>{
      const state=await expectedReceiptReadiness(db);assert.equal(state.available,false);assert.match(state.reason,/εγκατάστασης/);
      await assert.rejects(operation('confirm',{productId:'p',supplierId:'supplier',invoiceQuantity:'1',invoiceUnit:'PIECE',stockUnitsPerInvoiceUnit:'1'}),error=>error.status===503);
      assert.equal((await expectedReceiptReadiness(db)).available,false);
    });
    await ensureExpectedReceiptSchema(db);
    const confirm={productId:'p',supplierId:'supplier',invoiceQuantity:'2',invoiceUnit:'PACKAGE',stockUnitsPerInvoiceUnit:'6'};
    const stockBefore=await db.$queryRawUnsafe(`SELECT row_to_json(s) AS row FROM "StoreProduct" s ORDER BY "storeId","productId"`);
    await t.test('pack conversion is immutable and maximum accepted product retains twelve decimals',async()=>{
      const maximum=await operation('confirm',{...confirm,invoiceQuantity:'999999999.999999',stockUnitsPerInvoiceUnit:'999999999.999999'});
      assert.equal(maximum.expectedStockQuantity,'999999999999998000.000000000001');
      const saved=(await expectedReceiptRows(db,scope)).find(row=>row.id===maximum.id);assert.equal(saved.expectedStockQuantity,maximum.expectedStockQuantity);
      const tiny=await operation('confirm',{...confirm,invoiceQuantity:'0.000001',stockUnitsPerInvoiceUnit:'0.000001'});assert.equal(tiny.expectedStockQuantity,'0.000000000001');
      await assert.rejects(operation('confirm',{...confirm,invoiceQuantity:'1.0000001'}));
    });
    const created=await operation('confirm',confirm);assert.equal(created.expectedStockQuantity,'12');
    const source=await postedReceiptSource(db,scope,'order','p');assert.equal(source.quantity,'6');
    await t.test('same actor and payload replay returns original result; changed payload is rejected',async()=>{
      const body={storeId:'s',version:0,orderId:'order',sourceDigest:source.sourceDigest,quantity:'4',idempotencyKey:crypto.randomUUID()};
      const req={...owner,body};const first=await mutateExpectedReceipt(db,req,scope,'link',created.id);assert.equal(first.remainingQuantity,'8');
      assert.deepEqual(await mutateExpectedReceipt(db,req,scope,'link',created.id),first);
      await assert.rejects(mutateExpectedReceipt(db,{...owner,body:{...body,quantity:'5'}},scope,'link',created.id),/άλλα στοιχεία/);
    });
    await t.test('over-allocation and an injected audit failure roll back all receipt writes',async()=>{
      await assert.rejects(operation('link',{version:1,orderId:'order',sourceDigest:source.sourceDigest,quantity:'3'},created.id),/υπερβαίνει/);
      const before=await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "SupplierExpectedReceiptAllocation"`);
      const broken={...db,$transaction:(work,options)=>db.$transaction(tx=>work({...tx,$executeRaw:(parts,...values)=>{if(parts.join('').includes('INSERT INTO "StoreOperatorAudit"'))throw Error('audit failed');return tx.$executeRaw(parts,...values)}}),options)};
      await assert.rejects(mutateExpectedReceipt(broken,{...owner,body:{storeId:'s',version:1,orderId:'order',sourceDigest:source.sourceDigest,quantity:'1',idempotencyKey:crypto.randomUUID()}},scope,'link',created.id),/audit failed/);
      assert.deepEqual(await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "SupplierExpectedReceiptAllocation"`),before);
    });
    await t.test('concurrent consumers cannot allocate the same source capacity twice',async()=>{
      const second=await operation('confirm',confirm),third=await operation('confirm',confirm);
      const results=await Promise.allSettled([second,third].map(row=>operation('link',{version:0,orderId:'order',sourceDigest:source.sourceDigest,quantity:'2'},row.id)));
      assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
      assert.equal((await postedReceiptSource(db,scope,'order','p')).available,'0');
    });
    await t.test('cancel only remaining preserves allocations and source edits require review',async()=>{
      await operation('cancel',{version:1,reason:'Ακύρωση υπολοίπου'},created.id);
      let row=(await expectedReceiptRows(db,scope)).find(item=>item.id===created.id);assert.equal(row.remainingQuantity,'0');assert.equal(row.allocatedQuantity,'4');assert.equal(row.cancelledQuantity,'8');
      await db.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "reopenVersion"=1,"updatedAt"=NOW() WHERE "id"='order'`);
      row=(await expectedReceiptRows(db,scope)).find(item=>item.id===created.id);assert.match(row.reviewReason,/αγορά άλλαξε/);
      await db.$executeRawUnsafe(`UPDATE "Product" SET "unit"='KG' WHERE "id"='p'`);
      const unlinked=(await expectedReceiptRows(db,scope)).find(item=>item.allocatedQuantity==='0');assert.match(unlinked.reviewReason,/μονάδα/);
      await db.$executeRawUnsafe(`UPDATE "Product" SET "unit"='PIECE' WHERE "id"='p'`);
    });
    await t.test('authority rejects foreign scope, ordinary operator and disabled modules',async()=>{
      await assert.rejects(assertExpectedReceiptAuthority(db,owner,{companyId:'foreign',storeId:'foreign'},true));
      await assert.rejects(operation('confirm',confirm,null,{user:{id:'op',role:'EMPLOYEE',companyId:'c',tokenType:'STORE_OPERATOR'}}));
      await db.$executeRawUnsafe(`INSERT INTO "StorePaidModule" VALUES('s','ORDER_SUGGESTIONS',false,NULL,NULL)`);
      await assert.rejects(operation('confirm',confirm),/ενεργή/);
      await db.$executeRawUnsafe(`DELETE FROM "StorePaidModule"`);
    });
    await t.test('staff needs approve, active session and same store; revoked grant denies replay',async()=>{
      await db.$executeRawUnsafe(`INSERT INTO "BackofficeStaffAccount" VALUES('staff','c','manager',true,0); INSERT INTO "User" VALUES('staff','c','Manager','m@example.test',false,'EMPLOYEE',0); INSERT INTO "UserSession" VALUES('session','staff',NULL,NOW()+INTERVAL '1 day'); INSERT INTO "BackofficeStaffGrant" VALUES('staff','c','s',true,'MANAGER','["invoices.read"]',0)`);
      const staff={user:{id:'staff',companyId:'c',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0,storeId:'s'},staffGrant:{capability:'invoices.approve'}};
      await assert.rejects(operation('confirm',confirm,null,staff));
      await db.$executeRawUnsafe(`UPDATE "BackofficeStaffGrant" SET "capabilities"='["invoices.read","invoices.approve"]'`);
      const body={...confirm,storeId:'s',idempotencyKey:crypto.randomUUID()},request={...staff,body};
      const receipt=await mutateExpectedReceipt(db,request,scope,'confirm');assert.equal(receipt.expectedStockQuantity,'12');
      await db.$executeRawUnsafe(`UPDATE "BackofficeStaffGrant" SET "active"=FALSE`);
      await assert.rejects(mutateExpectedReceipt(db,request,scope,'confirm'));
      await assert.rejects(operation('confirm',confirm,null,{...staff,user:{...staff.user,storeId:'other'}}));
    });

    await t.test('durable rejection follows rollback and prevents an otherwise valid late original',async()=>{
      const body={...confirm,storeId:'s',supplierId:'later',intentActorId:'owner',intentCompanyId:'c',intentGeneration:'0',idempotencyKey:crypto.randomUUID()},request={...owner,body};
      let failure;try{await mutateExpectedReceipt(db,request,scope,'confirm')}catch(error){failure=error}
      assert.equal(failure.status,409);
      const rejected=await rejectExpectedReceiptIntent(db,request,scope,'confirm',null,failure);assert.equal(rejected.rejected,true);
      await db.$executeRawUnsafe(`INSERT INTO "Supplier" VALUES('later','c','Later supplier',true)`);
      assert.deepEqual(await mutateExpectedReceipt(db,request,scope,'confirm'),rejected);
      assert.equal((await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "SupplierExpectedReceiptLine" WHERE "supplierId"='later'`))[0].count,0);
    });
    await t.test('committed result wins rejection and concurrent late original/outcome share one receipt',async()=>{
      const makeRequest=()=>({...owner,body:{...confirm,storeId:'s',intentActorId:'owner',intentCompanyId:'c',intentGeneration:'0',idempotencyKey:crypto.randomUUID()}});
      const committedRequest=makeRequest(),committed=await mutateExpectedReceipt(db,committedRequest,scope,'confirm');
      const conflict=Object.assign(new Error('Απομονωμένη διένεξη'),{status:409});
      assert.deepEqual(await rejectExpectedReceiptIntent(db,committedRequest,scope,'confirm',null,conflict),committed);
      const racing=makeRequest(),before=(await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "SupplierExpectedReceiptLine"`))[0].count;
      const outcomes=await Promise.all([mutateExpectedReceipt(db,racing,scope,'confirm'),rejectExpectedReceiptIntent(db,racing,scope,'confirm',null,conflict)]);
      assert.deepEqual(outcomes[0],outcomes[1]);
      const after=(await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "SupplierExpectedReceiptLine"`))[0].count;
      assert.equal(after-before,outcomes[0].rejected?0:1);
      const count=await db.$queryRaw`SELECT COUNT(*)::int AS "count" FROM "SupplierExpectedReceiptOperation" WHERE "companyId"='c' AND "storeId"='s' AND "key"=${racing.body.idempotencyKey}`;
      assert.equal(count[0].count,1);
      await assert.rejects(rejectExpectedReceiptIntent(db,{...committedRequest,body:{...committedRequest.body,invoiceQuantity:'3'}},scope,'confirm',null,conflict),/άλλα στοιχεία/);
      assert.deepEqual(await mutateExpectedReceipt(db,committedRequest,scope,'confirm'),committed);
    });
    await t.test('failed rejection audit rolls back the outcome receipt and changed journal actor is denied',async()=>{
      const request={...owner,body:{...confirm,storeId:'s',intentActorId:'owner',intentCompanyId:'c',intentGeneration:'0',idempotencyKey:crypto.randomUUID()}};
      const broken={...db,$transaction:(work,options)=>db.$transaction(tx=>work({...tx,$executeRaw:(parts,...values)=>{if(parts.join('').includes('INSERT INTO "StoreOperatorAudit"'))throw Error('rejection audit failed');return tx.$executeRaw(parts,...values)}}),options)};
      await assert.rejects(rejectExpectedReceiptIntent(broken,request,scope,'confirm',null,Object.assign(new Error('Conflict'),{status:409})),/rejection audit failed/);
      const count=await db.$queryRaw`SELECT COUNT(*)::int AS "count" FROM "SupplierExpectedReceiptOperation" WHERE "companyId"='c' AND "storeId"='s' AND "key"=${request.body.idempotencyKey}`;
      assert.equal(count[0].count,0);
      await assert.rejects(mutateExpectedReceipt(db,{...request,body:{...request.body,intentActorId:'other'}},scope,'confirm'),error=>error.status===403);
    });
    await t.test('real HTTP route validates scope and exposes standalone unsupported reason',async()=>{
      const guardSource=await readFile(new URL('../src/middleware/module-access.js',import.meta.url),'utf8');
      const moduleGuard=new Function('prisma','ownerRestrictedModuleKeys',guardSource.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+';return requireStoreModule;')(db,ownerRestrictedModuleKeys);
      const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=owner.user;next()});app.use('/api/commerce',createExpectedReceiptRouter(db,{moduleGuard}));app.use((error,req,res,next)=>res.status(error.status||400).json({error:error.message}));
      const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/api/commerce`;
      try{
        const list=await fetch(base+'/expected-receipts?storeId=s');assert.equal(list.status,200);const data=await list.json();assert.equal(data.storeId,'s');assert.equal(data.actorId,'owner');assert.equal(data.companyId,'c');assert.equal(data.sourceSupport,'PURCHASE_ORDER_ONLY');assert.match(data.sourceSupportNote,/αυτόνομα/);
        assert.equal((await fetch(base+'/expected-receipts?storeId=foreign')).status,404);
        const response=await fetch(base+'/expected-receipts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({storeId:'s',...confirm,idempotencyKey:crypto.randomUUID(),unexpected:'field'})});assert.equal(response.status,400);
        const journalBody={storeId:'s',...confirm,intentActorId:'owner',intentCompanyId:'c',intentGeneration:'0',idempotencyKey:crypto.randomUUID(),unexpected:'field'};
        const journalPost=()=>fetch(base+'/expected-receipts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(journalBody)});
        const rejected=await journalPost();assert.equal(rejected.status,200);const rejection=await rejected.json();assert.equal(rejection.rejected,true);
        assert.deepEqual(await (await journalPost()).json(),rejection);
        const numericBody={storeId:'s',...confirm,invoiceQuantity:'1.0000001',intentActorId:'owner',intentCompanyId:'c',intentGeneration:'0',idempotencyKey:crypto.randomUUID()};
        const beforeNumeric=(await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "SupplierExpectedReceiptLine"`))[0].count;
        const numericPost=()=>fetch(base+'/expected-receipts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(numericBody)});
        const numericResponse=await numericPost();assert.equal(numericResponse.status,200);
        const numericRejection=await numericResponse.json();assert.equal(numericRejection.rejected,true);
        assert.deepEqual(await (await numericPost()).json(),numericRejection);
        assert.equal((await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "SupplierExpectedReceiptLine"`))[0].count,beforeNumeric);
        const numericOutcome=await db.$queryRaw`SELECT "result" FROM "SupplierExpectedReceiptOperation" WHERE "companyId"='c' AND "storeId"='s' AND "key"=${numericBody.idempotencyKey}`;
        assert.equal(numericOutcome.length,1);assert.deepEqual(numericOutcome[0].result,numericRejection);

      }finally{await new Promise(resolve=>server.close(resolve))}
    });
    await t.test('new unallocated posted stock requires review until explicit allocation without inferred order association',async()=>{
      await db.$executeRawUnsafe(`INSERT INTO "Product" VALUES('guard-p','c','Guard product','PIECE',true),('guard-other-p','c','Other product','PIECE',true); INSERT INTO "StoreProduct" VALUES('s','guard-p',true,3); INSERT INTO "Supplier" VALUES('guard-other-supplier','c','Other supplier',true)`);
      const addSource=async(name,store,product,supplier,amount)=>{
        await db.$executeRaw`INSERT INTO "PurchaseOrder" VALUES(${name},'c',${store},${supplier},'INVOICED',${name},NOW(),0)`;
        await db.$executeRaw`INSERT INTO "PurchaseDocument" VALUES(${name},'c',${store},${supplier},'APPROVED','INVOICE',NOW())`;
        await db.$executeRaw`INSERT INTO "PurchaseOrderPosting" VALUES(${name},'c',${name},${supplier})`;
        await db.$executeRaw`INSERT INTO "StockMovement"("id","storeId","productId","sourceType","sourceId","movementType","quantity","unitCost") VALUES(${name},${store},${product},'PURCHASE_ORDER',${name},'PURCHASE',${amount}::numeric,1)`;
      };
      await addSource('guard-before','s','guard-p','supplier','6');
      await db.$executeRawUnsafe(`UPDATE "StockMovement" SET "createdAt"=NOW()-INTERVAL '1 day' WHERE "id"='guard-before'`);
      const expected=await operation('confirm',{...confirm,productId:'guard-p',invoiceQuantity:'12',stockUnitsPerInvoiceUnit:'1'});
      const read=async()=>(await expectedReceiptRows(db,scope)).find(row=>row.id===expected.id);
      assert.equal((await read()).postedPurchaseReviewReason,null);
      await addSource('guard-other-supplier-order','s','guard-p','guard-other-supplier','4');
      await addSource('guard-other-store','other','guard-p','supplier','4');
      await addSource('guard-other-product','s','guard-other-p','supplier','4');
      assert.equal((await read()).postedPurchaseReviewReason,null);
      await addSource('guard-recent','s','guard-p','supplier','4');
      await db.$executeRawUnsafe(`UPDATE "StoreProduct" SET "currentStock"=7 WHERE "storeId"='s' AND "productId"='guard-p'`);
      const unlinked=await read();assert.match(unlinked.postedPurchaseReviewReason,/νεότερη καταχωρισμένη/);assert.equal(unlinked.remainingQuantity,'12');assert.equal(unlinked.reviewReason,null);
      const proposal=review=>buildOrderSuggestions([{productId:'guard-p',name:'Guard',unit:'PIECE',currentStock:7,minStock:30,soldQuantity:0,returnedQuantity:0,confirmedPendingStockQuantity:Number(review.remainingQuantity),expectedReceiptReviewReasons:[review.postedPurchaseReviewReason].filter(Boolean)}])[0];
      assert.equal(proposal(unlinked).suggestedQuantity,null);
      const posted=await postedReceiptSource(db,scope,'guard-recent','guard-p');
      const stock=await db.$queryRawUnsafe(`SELECT "currentStock"::text AS stock FROM "StoreProduct" WHERE "storeId"='s' AND "productId"='guard-p'`);
      await operation('link',{version:0,orderId:'guard-recent',sourceDigest:posted.sourceDigest,quantity:'4'},expected.id);
      const linked=await read();assert.equal(linked.remainingQuantity,'8');assert.equal(linked.postedPurchaseReviewReason,null);assert.equal(proposal(linked).suggestedQuantity,15);
      assert.deepEqual(await db.$queryRawUnsafe(`SELECT "currentStock"::text AS stock FROM "StoreProduct" WHERE "storeId"='s' AND "productId"='guard-p'`),stock);
      // Remove only this case's synthetic stock fixture before the original controls.
      await db.$executeRawUnsafe(`DELETE FROM "StockMovement" WHERE "id" LIKE 'guard-%'; DELETE FROM "StoreProduct" WHERE "productId"='guard-p'; DELETE FROM "Product" WHERE "id" IN ('guard-p','guard-other-p')`);
    });
    await t.test('actual wrapper, request middleware and native fence deny old generation retry without any operation outcome',async()=>{
      await db.$executeRawUnsafe(`CREATE TABLE "StoreLifecycleFence"("storeId" TEXT PRIMARY KEY,"companyId" TEXT,"generation" BIGINT,"maintenance" BOOLEAN,"retired" BOOLEAN); INSERT INTO "StoreLifecycleFence" VALUES('s','c',1,false,false)`);
      const guardSource=await readFile(new URL('../src/middleware/module-access.js',import.meta.url),'utf8');
      const moduleGuard=new Function('prisma','ownerRestrictedModuleKeys',guardSource.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+';return requireStoreModule;')(db,ownerRestrictedModuleKeys);
      const app=express();app.use(storeLifecycleRequestContext);app.use(express.json());app.use((req,res,next)=>{req.user=owner.user;next()});
      app.get('/api/lifecycle/stores/:storeId',async(req,res)=>{const rows=await db.$queryRaw`SELECT "generation"::text AS generation FROM "StoreLifecycleFence" WHERE "storeId"=${req.params.storeId}`;res.json({storeId:req.params.storeId,generation:rows[0].generation})});
      app.use('/api/commerce',createExpectedReceiptRouter(db,{moduleGuard}));app.use((error,req,res,next)=>res.status(error.status||400).json({error:error.message,code:error.code}));
      const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`,received=[];
      const transport=async(input,options)=>{if(options?.method==='POST')received.push(new Headers(options.headers).get(lifecycleHeader));return fetch(input,options)};
      try{
        const first=createLifecycleFetch({fetch:transport,origin});
        const data=await (await first.request(origin+'/api/commerce/expected-receipts?storeId=s',{headers:{Authorization:'fixture'}})).json();assert.equal(data.lifecycleGeneration,'1');
        const context=expectedReceiptIntentContext(data,'s');
        const fresh=createExpectedReceiptIntent(context,'/api/commerce/expected-receipts',confirm);
        const success=await first.request(origin+fresh.path,{method:'POST',headers:{Authorization:'fixture','Content-Type':'application/json',...fresh.headers},body:fresh.serializedBody});assert.equal(success.status,200);assert.ok((await success.json()).id);
        const pending=createExpectedReceiptIntent(context,fresh.path,confirm),saved=new Map(),storage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)};
        saveExpectedReceiptIntent(pending,storage);
        const snapshot=async()=>Promise.all(['SupplierExpectedReceiptLine','SupplierExpectedReceiptAllocation','SupplierExpectedReceiptOperation','StoreOperatorAudit','StockMovement'].map(async name=>(await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "${name}"`))[0].count));
        const before=await snapshot();await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=2 WHERE "storeId"='s'`);
        const second=createLifecycleFetch({fetch:transport,origin});
        const current=await (await second.request(origin+'/api/commerce/expected-receipts?storeId=s',{headers:{Authorization:'fixture'}})).json();assert.equal(current.lifecycleGeneration,'2');
        const restored=readExpectedReceiptIntent(expectedReceiptIntentContext(current,'s'),storage);assert.deepEqual(restored,pending);
        const stale=await second.request(origin+restored.path,{method:'POST',headers:{Authorization:'fixture','Content-Type':'application/json',...restored.headers},body:restored.serializedBody});
        assert.equal(stale.status,409);assert.equal((await stale.json()).code,'STORE_LIFECYCLE_STALE_GENERATION');assert.deepEqual(JSON.parse(received.at(-1)),{s:'1'});
        assert.deepEqual(await snapshot(),before);assert.deepEqual(readExpectedReceiptIntent(expectedReceiptIntentContext(current,'s'),storage),pending);
        const relabelled=await second.request(origin+restored.path,{method:'POST',headers:{Authorization:'fixture','Content-Type':'application/json',[lifecycleHeader]:JSON.stringify({s:'2'})},body:restored.serializedBody});
        assert.equal(relabelled.status,403);assert.deepEqual(await snapshot(),before);
      }finally{await new Promise(resolve=>server.close(resolve))}
    });
    assert.deepEqual(await db.$queryRawUnsafe(`SELECT row_to_json(s) AS row FROM "StoreProduct" s ORDER BY "storeId","productId"`),stockBefore);
    assert.equal((await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "StockMovement"`))[0].count,2);
  }finally{await client.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
