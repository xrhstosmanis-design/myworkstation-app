import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import {classifyInvoiceMonth,invoiceAuditMonth,readMonthlyInvoiceAudit} from '../src/services/monthly-invoice-audit.js';
import {createMonthlyInvoiceAuditRouter} from '../src/routes/monthly-invoice-audit.js';

const period=invoiceAuditMonth('2026-10'),actor={id:'owner',companyId:'c',role:'OWNER'},now=new Date('2026-10-28T12:00:00Z');
const empty=()=>({documents:[],orders:[],inbound:[],inbox:[],jobs:[],attachments:[],aliases:[],postings:[],stockPostings:[]});
const doc=(id,patch={})=>({id,supplierId:'sup',supplierName:'Συνθετικός προμηθευτής',supplierTaxId:'099999999',documentType:'INVOICE',documentNumber:'A '+id,issueDay:'2026-10-02',totalGross:'12.34',status:'DRAFT',sourceType:'MANUAL',purchaseOrderId:null,createdAt:'2026-10-03T10:00:00Z',...patch});
const schema={
 Supplier:['id','companyId','name','taxId'],
 PurchaseDocument:['id','companyId','storeId','supplierId','documentType','documentNumber','documentDate','totalGross','status','sourceType','purchaseOrderId','paymentTransactionId','createdAt'],
 PurchaseOrder:['id','companyId','storeId','supplierId','status','invoiceNumber','sourceDocumentId','createdAt'],
 MyDataInboundDocument:['id','companyId','storeId','inboxId','mark','issuerVat','series','documentNumber','issueDate','invoiceType','totalGross','rawPayload','fetchedAt'],
 DocumentInbox:['id','companyId','storeId','attachmentId','status','receivedAt'],AiReaderJob:['id','companyId','storeId','attachmentId','purchaseDocumentId','status'],
 DocumentAttachment:['id','companyId','storeId','mimeType','checksum','contentData'],
 InvoiceDraftAlias:['aliasOrderId','aliasDocumentId','companyId','storeId','canonicalOrderId','canonicalDocumentId','inboxId','mark','details'],
 PurchaseOrderPosting:['orderId','companyId','purchaseDocumentId'],InvoiceStockPosting:['companyId','storeId','orderId','sourceDocumentId','postedDocumentId','path'],
 StoreTransaction:['id','companyId','storeId','supplierId','supplierName','amount','actorId','actorName','occurredAt','invoiceDocumentNumber','attachmentMimeType','attachmentFilename','attachmentChecksum','attachmentData','paymentMethod','subtractFromShift','sessionId','type','reversedAt'],
 StoreOperatorAudit:['id','companyId','storeId','eventType','actorId','details']
};
const tables={documents:'PurchaseDocument',orders:'PurchaseOrder',inbound:'MyDataInboundDocument',inbox:'DocumentInbox',jobs:'AiReaderJob',attachments:'DocumentAttachment',aliases:'InvoiceDraftAlias',postings:'PurchaseOrderPosting',stockPostings:'InvoiceStockPosting'};
function fixture({facts=empty(),missing=[],role='OWNER',currentCompany='c',store=true,companyModule=true,override=null,pending=null,totals={}}={}){
 const trace=[];
 const tx={user:{findUnique:async()=>({id:'owner',role,companyId:currentCompany})},store:{findFirst:async({where})=>store&&where.id==='s'&&where.companyId==='c'?{id:'s',companyId:'c',name:'Συνθετικό κατάστημα'}:null},company:{findUnique:async()=>({id:'c',name:'C',active:true,licenseStatus:'ACTIVE',subscriptionEndsAt:null,modules:companyModule?[{moduleKey:'INVENTORY',active:true}]:[]})},
  async $executeRawUnsafe(sql){trace.push({sql});assert.match(sql,/^(SET TRANSACTION READ ONLY|SET LOCAL statement_timeout)/)},
  async $queryRawUnsafe(sql,...values){trace.push({sql,values});
   if(sql.includes('FROM pg_class'))return Object.entries(schema).flatMap(([table,columns])=>missing.includes(table)?[]:columns.map(column=>({table,column})));
   if(sql.includes('FROM "StorePaidModule"'))return override?[override]:[];
   if(sql.includes('FROM "OwnerCompanyAccess"'))return [];
   for(const[name,table]of Object.entries(tables))if(sql.startsWith('SELECT source.')&&sql.includes('FROM "'+table+'"'))return facts[name].map(row=>({...row,_sourceCount:String(totals[name]??facts[name].length)}));
   throw Error('Unexpected metadata query: '+sql);
  },
  async $queryRaw(strings,...values){const sql=Array.isArray(strings)?strings.join('?'):strings.sql;trace.push({sql,values});
   if(sql.includes('WITH required('))return [{full:true,jobs:true,jobTable:true,hasIntents:Boolean(pending)}];
   if(sql.includes('WITH scoped_audits'))return [{...pending,digest:'unchanged'}];
   throw Error('Unexpected trusted pending query: '+sql);
  }
 };
 const db={$transaction:async(fn,options)=>{trace.push({transaction:options});return fn(tx)}};
 return {db,tx,trace};
}
const read=(f,input={storeId:'s',month:'2026-10'},user=actor)=>readMonthlyInvoiceAudit(f.db,user,input,{now});

test('document issue month is strict and keeps leap/calendar boundaries',()=>{
 assert.equal(invoiceAuditMonth('2024-02').toDayExclusive,'2024-03-01');assert.equal(invoiceAuditMonth('2026-12').toDayExclusive,'2027-01-01');
 for(const value of ['2026-00','2026-13','2026-2','2026-10-01','1999-12',null,[]])assert.throws(()=>invoiceAuditMonth(value));
});

test('real reader uses one read-only snapshot, full source counters and distinct all-month pending counts',async()=>{
 const facts=empty();facts.documents=[doc('1')];
 const pending={count:75,missingCount:60,uploadedCount:10,reviewCount:5,rows:Array.from({length:50},(_,i)=>({id:'pending'+i,supplierName:'Pending',amount:1,documentNumber:'OLD '+i,documentDate:'2025-01-01',status:'AWAITING_INVOICE',fingerprint:'PRIVATE-HASH'}))};
 const f=fixture({facts,pending}),r=await read(f);
 assert.deepEqual(f.trace[0].transaction,{isolationLevel:'RepeatableRead',maxWait:2000,timeout:30000});assert.equal(f.trace[1].sql,'SET TRANSACTION READ ONLY');
 assert.equal(r.coverage.complete,true);assert.equal(r.summary.logicalRecords,1);assert.equal(r.summary.unposted,1);
 assert.equal(r.pendingOriginals.period,'ALL_MONTHS');assert.equal(r.pendingOriginals.counts.total,75);assert.equal(r.pendingOriginals.items.length,50);assert.equal(r.pendingOriginals.truncated,true);assert.equal(r.allClear,false);
 assert.equal(JSON.stringify(r).includes('PRIVATE-HASH'),false);assert.equal(r.immutableSnapshot,false);
 for(const call of f.trace.filter(t=>t.sql?.startsWith('SELECT source.')))assert.deepEqual(call.values,['c','s',20001]);
});

test('missing source and above-cap sources never expose partial findings as exact or an all-clear',async()=>{
 for(const missing of [['Supplier'],['MyDataInboundDocument'],['InvoiceDraftAlias'],['StoreTransaction']]){
  const f=fixture({missing}),r=await read(f);assert.equal(r.allClear,false);
  if(missing[0]!=='StoreTransaction'){assert.equal(r.coverage.complete,false);assert.equal(r.summary,null);assert.deepEqual(r.items,[])}
  if(['Supplier','StoreTransaction'].includes(missing[0]))assert.equal(r.pendingOriginals.available,false);
 }
 const facts=empty();facts.documents=[doc('1')];const r=await read(fixture({facts,totals:{documents:20001}}));
 assert.deepEqual(r.coverage.limited,['documents']);assert.equal(r.coverage.sourceCounts.documents,20001);assert.equal(r.summary,null);assert.deepEqual(r.items,[]);assert.equal(r.allClear,false);
});

test('current role, explicit selection, support binding and effective store entitlement are rechecked',async()=>{
 for(const user of [{...actor,tokenType:'STORE_OPERATOR'},{...actor,tokenType:'STORE_CHAT_OPERATOR'},{...actor,tokenType:'POS_BACKGROUND'},{...actor,id:''},{...actor,storeId:'other'}]){const f=fixture();await assert.rejects(read(f,undefined,user),e=>e.status===403);assert.equal(f.trace.length,0)}
 for(const input of [{storeId:'',month:'2026-10'},{storeId:'s',month:'2026-10',send:true},{storeId:['s'],month:'2026-10'}])await assert.rejects(read(fixture(),input));
 await assert.rejects(read(fixture({role:'EMPLOYEE'})),e=>e.status===403);
 await assert.rejects(read(fixture({store:false})),e=>e.status===404);
 await assert.rejects(read(fixture({currentCompany:'other'})),e=>e.status===403);
 await assert.rejects(read(fixture({companyModule:false})),e=>e.status===403);
 await assert.rejects(read(fixture({override:{active:false}})),e=>e.status===403);
 const support={...actor,isSuperAdmin:true,platformRole:'SUPER_ADMIN',supportContext:{companyId:'c',storeId:'s'}};
 assert.equal((await read(fixture({role:'SUPER_ADMIN',currentCompany:'platform'}),undefined,support)).store.id,'s');
 await assert.rejects(read(fixture({role:'SUPER_ADMIN'}),undefined,{...support,supportContext:{companyId:'c',storeId:'other'}}),e=>e.status===403);
 await assert.rejects(read(fixture({role:'OWNER'}),undefined,support),e=>e.status===403);
});

test('source/order/approved projection is one logical invoice and a distinct matching original is only a review candidate',()=>{
 const f=empty();f.documents=[doc('source',{documentNumber:'A 001',sourceType:'POS_OCR_DRAFT',purchaseOrderId:'order'}),doc('projection',{documentNumber:'A 1',status:'APPROVED',sourceType:'PURCHASE_ORDER',purchaseOrderId:'order'}),doc('other',{documentNumber:'A 1'})];
 f.orders=[{id:'order',supplierId:'sup',invoiceNumber:'A 1',sourceDocumentId:'source',status:'INVOICED',createdAt:'2026-11-01'}];f.postings=[{orderId:'order',purchaseDocumentId:'projection'}];f.stockPostings=[{orderId:'order',sourceDocumentId:'source',postedDocumentId:'projection',path:'PURCHASE_ORDER'}];
 const r=classifyInvoiceMonth(f,period);assert.equal(r.counts.logicalRecords,2);assert.equal(r.counts.unposted,1);assert.equal(r.counts.possibleDuplicates,2);assert.equal(r.counts.identityReview,0);assert.equal(r.items.find(x=>x.id==='doc:source').sources.length,3);
});

test('confirmed aliases retain corrected canonical identity; contradictory aliases and source links remain review',()=>{
 const f=empty();f.documents=[doc('canonical',{documentNumber:'A 1',sourceType:'POS_OCR_DRAFT',purchaseOrderId:'canonical-order'}),doc('old',{documentNumber:'OLD 99',issueDay:'2026-09-01',sourceType:'POS_OCR_DRAFT',purchaseOrderId:'old-order',status:'MERGED'})];
 f.orders=[{id:'canonical-order',supplierId:'sup',invoiceNumber:'A 1',sourceDocumentId:'canonical',status:'NEW'},{id:'old-order',supplierId:'sup',invoiceNumber:'OLD 99',sourceDocumentId:'old',status:'MERGED'}];
 f.inbound=[{id:'m',inboxId:'i',mark:'MARK',issuerVat:'099999999',series:'A',documentNumber:'1',issueDay:'2026-10-02',invoiceType:'1.1',totalGross:'12.34',draftOrderId:'canonical-order'}];f.inbox=[{id:'i',attachmentId:'pdf',createdAt:'2026-11-01'}];
 f.aliases=[{aliasOrderId:'old-order',aliasDocumentId:'old',canonicalOrderId:'canonical-order',canonicalDocumentId:'canonical',inboxId:'i',mark:'MARK',completed:true,auditOrderId:'canonical-order',auditDocumentId:'canonical',auditInboxId:'i',auditMark:'MARK',auditAliasOrderIds:['old-order']}];
 assert.equal(classifyInvoiceMonth(f,period).counts.logicalRecords,1);assert.equal(classifyInvoiceMonth(f,invoiceAuditMonth('2026-09')).counts.logicalRecords,0);
 f.aliases[0].completed=false;const broken=classifyInvoiceMonth(f,period);assert.ok(broken.counts.identityReview>0);assert.equal(broken.counts.possibleDuplicates,0);
});

test('series, issue date, credit and amount boundaries plus missing-VAT warning do not imply automatic merging',()=>{
 const f=empty();f.documents=[doc('1',{documentNumber:'A 1'}),doc('2',{documentNumber:'B 1'}),doc('3',{documentNumber:'A 1',documentType:'CREDIT_NOTE'}),doc('4',{documentNumber:'A 1',issueDay:'2026-09-30'}),doc('5',{documentNumber:'A 1',totalGross:'99'}),doc('6',{documentNumber:'A 1',supplierTaxId:null})];
 const r=classifyInvoiceMonth(f,period);assert.equal(r.counts.logicalRecords,5);assert.equal(r.counts.credits,1);assert.equal(r.counts.possibleDuplicates,0);assert.match(r.items.find(x=>x.id==='doc:6').reasons.join(' '),/ΑΦΜ/);assert.equal(r.counts.unposted,5);
});

test('uploaded original and unknown issue date remain explicit, while source acquisition month cannot replace known issue date',()=>{
 const f=empty();f.documents=[doc('a',{issueDay:'2026-09-30',createdAt:'2026-10-03'}),doc('b',{issueDay:null}),doc('c')];f.attachments=[{id:'attachment',hasContent:true,checksum:'a'.repeat(64),mimeType:'image/jpeg'}];f.jobs=[{id:'job',purchaseDocumentId:'c',attachmentId:'attachment',status:'AWAITING_APPROVAL'}];
 const r=classifyInvoiceMonth(f,period);assert.equal(r.counts.logicalRecords,2);assert.equal(r.counts.uploadedAwaitingReview,1);assert.match(r.items.find(x=>x.id==='doc:b').reasons.join(' '),/ημερομηνία έκδοσης/);
});

test('an incoming record without corroborating supplier VAT cannot disappear into a linked document',()=>{
 const f=empty();f.documents=[doc('source',{documentNumber:'A 1',purchaseOrderId:'order'})];f.orders=[{id:'order',supplierId:'sup',invoiceNumber:'A 1',sourceDocumentId:'source',status:'NEW'}];
 f.inbound=[{id:'incoming',issuerVat:null,series:'A',documentNumber:'1',issueDay:'2026-10-02',invoiceType:'1.1',totalGross:'12.34',draftOrderId:'order'}];
 const r=classifyInvoiceMonth(f,period);assert.equal(r.counts.logicalRecords,2);assert.ok(r.counts.identityReview>0);assert.equal(r.counts.possibleDuplicates,0);
});

test('complete findings counts survive paging and changed source invalidates the next-page cursor',async()=>{
 const facts=empty();facts.documents=Array.from({length:120},(_,i)=>doc(String(i).padStart(3,'0')));const f=fixture({facts}),first=await read(f);
 assert.equal(first.summary.logicalRecords,120);assert.equal(first.items.length,50);assert.ok(first.nextPage);
 const second=await read(f,{storeId:'s',month:'2026-10',page:first.nextPage});assert.equal(second.summary.logicalRecords,120);assert.equal(second.items.length,50);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,100);
 facts.documents.push(doc('new'));await assert.rejects(read(f,{storeId:'s',month:'2026-10',page:first.nextPage}),e=>e.code==='INVOICE_MONTH_AUDIT_STALE_PAGE');
 await assert.rejects(read(f,{storeId:'s',month:'2026-11',page:first.nextPage}));
});

test('registered route is GET-only, no-store and rejects malformed/scope input through the real reader',async()=>{
 const f=fixture(),app=express();app.use((req,res,next)=>{req.user=actor;next()});app.use('/api/reports/invoice-month-audit',createMonthlyInvoiceAuditRouter(f.db));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port+'/api/reports/invoice-month-audit';
 try{let r=await fetch(base+'?storeId=s&month=2026-10');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).readOnly,true);r=await fetch(base+'?month=2026-10');assert.equal(r.status,400);r=await fetch(base+'?storeId=s&month=2026-10',{method:'POST'});assert.equal(r.status,404)}finally{await new Promise(resolve=>server.close(resolve))}
});

test('different valid supplier VAT never becomes a duplicate from matching headers and amount',()=>{
 const f=empty();f.documents=[doc('one',{documentNumber:'A 1'}),doc('two',{documentNumber:'A 1',supplierId:'other-supplier',supplierTaxId:'088888888'})];
 assert.equal(classifyInvoiceMonth(f,period).counts.possibleDuplicates,0);
 f.documents[1].supplierTaxId='099999999';assert.equal(classifyInvoiceMonth(f,period).counts.possibleDuplicates,2);
 f.documents[1].supplierTaxId=null;const missing=classifyInvoiceMonth(f,period);assert.equal(missing.counts.possibleDuplicates,0);assert.equal(missing.counts.identityReview,1);
});


test('posted order needs its scoped approved target and stock proof; standalone approved stays posted',()=>{
 const f=empty();f.documents=[doc('source',{status:'APPROVED',documentNumber:'A 1',purchaseOrderId:'order'})];f.orders=[{id:'order',supplierId:'sup',invoiceNumber:'A 1',sourceDocumentId:'source',status:'INVOICED'}];
 for(const targetId of ['missing-posted-document','foreign-posted-document','wrong']){
  f.postings=[{orderId:'order',purchaseDocumentId:targetId}];f.documents=f.documents.filter(d=>d.id==='source');
  if(targetId==='wrong')f.documents.push(doc('wrong',{status:'APPROVED',purchaseOrderId:'other-order',documentNumber:'B 9'}));
  const r=classifyInvoiceMonth(f,period),source=r.items.find(d=>d.id==='doc:source');assert.equal(source.status,'UNPOSTED');assert.ok(source.categories.includes('IDENTITY_OR_LINK_REVIEW'));assert.ok(r.counts.unposted>0);
 }
 f.documents=[doc('source',{status:'APPROVED',documentNumber:'A 1',purchaseOrderId:'order'})];f.postings=[{orderId:'order',purchaseDocumentId:'source'}];
 assert.equal(classifyInvoiceMonth(f,period).items[0].status,'UNPOSTED');
 f.stockPostings=[{orderId:'order',sourceDocumentId:'source',postedDocumentId:'source',path:'PURCHASE_ORDER'}];assert.equal(classifyInvoiceMonth(f,period).items[0].status,'POSTED');
 f.orders=[];f.postings=[];f.stockPostings=[];f.documents=[doc('standalone',{status:'APPROVED',documentNumber:'A 1'})];const standalone=classifyInvoiceMonth(f,period);assert.equal(standalone.items[0].status,'POSTED');assert.equal(standalone.counts.identityReview,0);
});
