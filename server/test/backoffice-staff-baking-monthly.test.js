import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {readStoreBakingState} from '../src/store-baking.js';
import {sameProductBakingSchema} from '../src/store-baking-same-product.js';
import {enforceBackofficeStaff,requireStaffGrant,staffError} from '../src/services/backoffice-staff-access.js';
import {ownerRestrictedModuleKeys} from '../src/services/module-catalog.js';

const forbidden=()=>assert.fail('delegated read attempted DDL, mutation or baking');
const staff=()=>({id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0});
async function moduleRuntime(db){const source=await readFile(new URL('../src/middleware/module-access.js',import.meta.url),'utf8');return new Function('prisma','ownerRestrictedModuleKeys',source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nreturn {requireCompanyModule};')(db,ownerRestrictedModuleKeys);}
async function appFor(db,path,router,moduleGuard){
 const app=express();app.use(express.json());app.use(async(req,res,next)=>{req.user=staff();try{await enforceBackofficeStaff(db,req,res);next()}catch(error){next(error)}});app.use(path,...(moduleGuard?[moduleGuard]:[]),router);app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code,error:error.message}));
 const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle))});
 return {async request(suffix,{header='store',method='GET'}={}){const response=await fetch(`http://127.0.0.1:${server.address().port}${path}${suffix}`,{method,headers:{'x-backoffice-store-id':header}});return {status:response.status,body:await response.json()}},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}};
}

test('native baking view reads real selected-store stocks and both histories without schema initialization or posting',async()=>{
 let capabilities=['baking.read'],moduleActive=true,withdraw=false,moduleWithdraw=false,reads=0;
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'STORE_MODE',active:moduleActive}]})},
  store:{findFirst:async({where})=>where.id==='store'&&where.companyId==='company'&&where.active===true?{id:'store'}:null},$transaction:forbidden,$executeRaw:forbidden,$executeRawUnsafe:forbidden,
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');
   if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];
   if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];
   if(sql.includes('FROM "StorePaidModule"'))return [];
   reads++;assert.ok(values.includes('company'));assert.ok(values.includes('store'));assert.equal(values.includes('foreign'),false);
   if(withdraw)capabilities=[];if(moduleWithdraw)moduleActive=false;
   if(sql.includes('FROM "StoreBakingPolicy"')){assert.match(sql,/bp\."companyId"=\? AND bp\."storeId"=\?/);assert.match(sql,/b\."companyId"=\? AND b\."storeId"=\?/);return [{productId:'finished',sourceProductId:'raw',name:'Synthetic baked',currentStock:3,sourceStock:8},{productId:'same',sourceProductId:null,name:'Synthetic same',currentStock:5,sourceStock:9}];}
   assert.match(sql,/e\."companyId"=\? AND e\."storeId"=\?/);assert.doesNotMatch(sql,/e\.\*|idempotencyKey/);
   if(sql.includes('FROM "StoreBakingEntry"'))return [{id:'converted',createdAt:'2026-11-17T10:00:00Z',sourceBefore:10,sourceAfter:8,finishedBefore:1,finishedAfter:3}];
   if(sql.includes('FROM "StoreBakedBalanceEvent"'))return [{id:'same-entry',createdAt:'2026-11-18T10:00:00Z',unbakedBefore:11,unbakedAfter:9,bakedBefore:3,bakedAfter:5}];
   assert.fail('unexpected baking query');
  }
 };
 const modules=await moduleRuntime(db);
 const source=await readFile(new URL('../src/routes/store-baking.js',import.meta.url),'utf8');
 const router=new Function('Router','prisma','auth','ensureStoreBakingSchema','recordBaking','readBakingPolicy','readStoreBakingState','changeSameProductBakedStock','sameProductBakingSchema','requireStaffGrant','staffError',source.replace(/^import .*;\s*$/gm,'').replace('export default router;','return router;'))(express.Router,db,(_req,_res,next)=>next(),forbidden,forbidden,forbidden,readStoreBakingState,forbidden,sameProductBakingSchema,requireStaffGrant,staffError);
 const app=await appFor(db,'/api/store-pos',router,modules.requireCompanyModule('STORE_MODE'));
 try{
  const result=await app.request('/stores/store/baking');assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.companyId,'company');assert.equal(result.body.storeId,'store');assert.equal(result.body.products[0].sameProduct,false);assert.equal(result.body.products[1].sameProduct,true);assert.equal(result.body.history[0].id,'same-entry');assert.equal(result.body.history[0].sourceAfter,9);assert.equal(result.body.history[0].finishedAfter,5);assert.equal(reads,3);
  const before=reads;for(const [suffix,options] of [['/stores/foreign/baking',{}],['/stores/foreign/baking',{header:'foreign'}],['/stores/store/baking',{header:''}],['/stores/store/baking',{method:'POST'}]])assert.equal((await app.request(suffix,options)).status,403);assert.equal(reads,before);
  capabilities=['products.read'];assert.equal((await app.request('/stores/store/baking')).status,403);capabilities=['baking.read'];moduleActive=false;assert.equal((await app.request('/stores/store/baking')).status,403);moduleActive=true;
  moduleWithdraw=true;const disabled=await app.request('/stores/store/baking');assert.equal(disabled.status,403);assert.equal(Object.hasOwn(disabled.body,'products'),false);assert.equal(Object.hasOwn(disabled.body,'history'),false);moduleWithdraw=false;moduleActive=true;
  withdraw=true;const revoked=await app.request('/stores/store/baking');assert.equal(revoked.status,403);assert.equal(Object.hasOwn(revoked.body,'products'),false);assert.equal(Object.hasOwn(revoked.body,'history'),false);withdraw=false;const after=reads;assert.equal((await app.request('/stores/store/baking')).status,403);assert.equal(reads,after);
 }finally{await app.close()}
});

const invoiceSchema={
 Supplier:'id companyId name taxId',
 PurchaseDocument:'id companyId storeId supplierId documentType documentNumber documentDate totalGross status sourceType purchaseOrderId paymentTransactionId createdAt',
 PurchaseOrder:'id companyId storeId supplierId status invoiceNumber sourceDocumentId createdAt',
 MyDataInboundDocument:'id companyId storeId inboxId mark issuerVat series documentNumber issueDate invoiceType totalGross rawPayload fetchedAt',
 DocumentInbox:'id companyId storeId attachmentId status receivedAt',AiReaderJob:'id companyId storeId attachmentId purchaseDocumentId status stage resultJson',
 DocumentAttachment:'id companyId storeId mimeType checksum contentData',InvoiceDraftAlias:'aliasOrderId aliasDocumentId companyId storeId canonicalOrderId canonicalDocumentId inboxId mark details',
 PurchaseOrderPosting:'orderId companyId purchaseDocumentId',InvoiceStockPosting:'companyId storeId orderId sourceDocumentId postedDocumentId path',
 StoreTransaction:'id companyId storeId supplierId supplierName amount actorId actorName occurredAt invoiceDocumentNumber attachmentMimeType attachmentFilename attachmentChecksum attachmentData paymentMethod subtractFromShift sessionId type reversedAt',
 StoreOperatorAudit:'id companyId storeId eventType actorId details'
};

test('native monthly audit keeps the real actor, read-only source snapshot and fresh post-snapshot grant checks',async()=>{
 const {readMonthlyInvoiceAudit,readDelegatedMonthlyInvoiceAudit,readMonthlyInvoiceSnapshotProjectionInTransaction}=await import('../src/services/monthly-invoice-audit.js');
 const {createMonthlyInvoiceAuditRouter}=await import('../src/routes/monthly-invoice-audit.js');
 let capabilities=['monthly-invoice-audit.read'],moduleActive=true,withdraw=false,moduleWithdraw=false,inside=false,transactions=0,sourceReads=0,liveChecks=0;
 const statements=[];
 const company=async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'INVENTORY',active:moduleActive}]});
 const tx={user:{findUnique:forbidden},company:{findUnique:company},store:{findFirst:async({where})=>{
  assert.equal(inside,true);assert.deepEqual(where,{id:'store',companyId:'company',active:true});return {id:'store',companyId:'company',name:'Synthetic store'};
 }},$executeRaw:forbidden,$transaction:forbidden,
  $executeRawUnsafe:async sql=>{statements.push(sql);assert.equal(inside,true);assert.match(sql,/^(SET TRANSACTION READ ONLY|SET LOCAL statement_timeout = '8000ms')$/)},
  $queryRawUnsafe:async(sql,...values)=>{
   assert.equal(inside,true);
   if(sql.includes('FROM pg_class'))return Object.entries(invoiceSchema).flatMap(([table,columns])=>columns.split(' ').map(column=>({table,column})));
   assert.ok(sql.startsWith('SELECT source.'));assert.deepEqual(values,['company','store',20001]);assert.match(sql,/"companyId"=\$1/);assert.match(sql,/"storeId"=\$2/);sourceReads++;
   if(sql.includes('FROM "PurchaseDocument"'))return [{id:'document',supplierId:'supplier',supplierName:'Synthetic supplier',supplierTaxId:'099999999',documentType:'INVOICE',documentNumber:'A 001',issueDay:'2026-10-02',totalGross:'12.34',status:'DRAFT',sourceType:'MANUAL',purchaseOrderId:null,createdAt:'2026-10-03T10:00:00Z',_sourceCount:'1'}];
   return [];
  },
  $queryRaw:async(strings,...values)=>{
   assert.equal(inside,true);const sql=Array.isArray(strings)?strings.join('?'):strings.sql;
   assert.doesNotMatch(sql,/FOR SHARE|FOR UPDATE|UPDATE |INSERT INTO|DELETE FROM/);
   if(sql.includes('WITH required('))return [{full:true,jobs:true,jobTable:true,hasIntents:true}];
   assert.ok(sql.includes('WITH scoped_audits'));const bound=Array.isArray(strings)?values:strings.values;assert.ok(bound.includes('company'));assert.ok(bound.includes('store'));assert.equal(bound.includes('foreign'),false);
   return [{count:1,missingCount:1,uploadedCount:0,reviewCount:0,digest:'fixture-private-digest',rows:[{id:'pending',supplierName:'Synthetic supplier',amount:'2.30',documentNumber:'OLD1',documentDate:'2025-01-01',status:'AWAITING_INVOICE',fingerprint:'PRIVATE-FINGERPRINT'}]}];
  }
 };
 const db={company:{findUnique:company},user:{findUnique:forbidden},$executeRaw:forbidden,$executeRawUnsafe:forbidden,
  $queryRaw:async(strings,...values)=>{
   assert.equal(inside,false,'live grant query must run outside the held read-only snapshot');const sql=strings.join('?');
   if(sql.includes('FROM "BackofficeStaffAccount" a')){liveChecks++;return [{mustChangePassword:false}]}
   if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];
   if(sql.includes('FROM "StorePaidModule"'))return [];
   assert.fail('unexpected live query');
  },
  $transaction:async(fn,options)=>{
   assert.equal(inside,false);assert.deepEqual(options,{isolationLevel:'RepeatableRead',maxWait:2000,timeout:30000});transactions++;inside=true;
   try{return await fn(tx)}finally{inside=false;if(withdraw)capabilities=[];if(moduleWithdraw)moduleActive=false}
  }
 };
 const app=await appFor(db,'/api/reports/invoice-month-audit',createMonthlyInvoiceAuditRouter(db));
 try{
  const result=await app.request('?storeId=store&month=2026-10');assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.companyId,'company');assert.equal(result.body.storeId,'store');assert.equal(result.body.store.id,'store');assert.equal(result.body.period.month,'2026-10');assert.equal(result.body.summary.unposted,1);assert.equal(result.body.items[0].totalCents,1234);assert.equal(result.body.pendingOriginals.counts.total,1);assert.equal(result.body.pendingOriginals.items[0].amount,2.3);assert.equal(JSON.stringify(result.body).includes('PRIVATE-FINGERPRINT'),false);assert.equal(result.body.readOnly,true);assert.equal(result.body.immutableSnapshot,false);assert.equal(transactions,1);assert.equal(sourceReads,9);assert.ok(liveChecks>=3);assert.deepEqual(statements.slice(0,2),['SET TRANSACTION READ ONLY',"SET LOCAL statement_timeout = '8000ms'"]);
  const before=transactions;
  for(const [suffix,options] of [['?storeId=&month=2026-10',{}],['?storeId=foreign&month=2026-10',{}],['?storeId=foreign&month=2026-10',{header:'foreign'}],['?storeId=store&month=2026-10',{method:'POST'}]])assert.equal((await app.request(suffix,options)).status,403);
  assert.equal(transactions,before);assert.equal((await app.request('?storeId=store&month=2026-13')).status,400);assert.equal((await app.request('?storeId=store&month=2026-10&send=true')).status,400);assert.equal(transactions,before);
  capabilities=['invoices.read'];assert.equal((await app.request('?storeId=store&month=2026-10')).status,403);capabilities=['monthly-invoice-audit.read'];moduleActive=false;assert.equal((await app.request('?storeId=store&month=2026-10')).status,403);moduleActive=true;
  moduleWithdraw=true;const disabled=await app.request('?storeId=store&month=2026-10');assert.equal(disabled.status,403);assert.equal(Object.hasOwn(disabled.body,'items'),false);assert.equal(Object.hasOwn(disabled.body,'pendingOriginals'),false);moduleWithdraw=false;moduleActive=true;
  withdraw=true;const revoked=await app.request('?storeId=store&month=2026-10');assert.equal(revoked.status,403);assert.equal(Object.hasOwn(revoked.body,'summary'),false);assert.equal(Object.hasOwn(revoked.body,'items'),false);withdraw=false;
  const after=transactions;assert.equal((await app.request('?storeId=store&month=2026-10')).status,403);assert.equal(transactions,after);
  const req={method:'GET',user:{...staff(),storeId:'store'},staffGrant:{capability:'monthly-invoice-audit.read'}};
  await assert.rejects(readDelegatedMonthlyInvoiceAudit(db,{...req,method:'POST'},{storeId:'store',month:'2026-10'}),e=>e.status===403);
  await assert.rejects(readMonthlyInvoiceAudit(db,{...staff(),storeId:'store'},{storeId:'store',month:'2026-10'}),e=>e.status===403);
  await assert.rejects(readMonthlyInvoiceSnapshotProjectionInTransaction(tx,{...staff(),storeId:'store'},{storeId:'store',month:'2026-10'}),e=>e.status===403);
  assert.equal(transactions,after);
 }finally{await app.close()}
});
