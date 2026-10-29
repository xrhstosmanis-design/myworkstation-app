import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyInvoiceMonth,invoiceAuditMonth,readMonthlyInvoiceAudit,readMonthlyInvoiceSnapshotProjectionInTransaction as project} from '../src/services/monthly-invoice-audit.js';
import {readPendingInvoices,readPendingInvoiceSnapshotRows} from '../src/services/pos-pending-invoices.js';
import {buildMonthlyInventorySnapshotCandidate} from '../src/services/monthly-inventory-snapshot-payload.js';
const actor={id:'owner',companyId:'c',role:'OWNER'},input={storeId:'s',month:'2026-09'};
const empty=()=>({documents:[],orders:[],inbound:[],inbox:[],jobs:[],attachments:[],aliases:[],postings:[],stockPostings:[]});
const doc=(id,extra={})=>({id,supplierId:'sup',supplierName:null,supplierTaxId:'099999999',documentType:'INVOICE',documentNumber:'A '+id,issueDay:'2026-09-02',totalGross:'-999999999999999999.123456789012',status:'DRAFT',sourceType:'MANUAL',createdAt:'2026-09-03T10:00:00Z',...extra});
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

function fixture({facts=empty(),pending=[],role='OWNER',capability=true,missing=[],totals={},state={},exit={},pendingCount=pending.length}={}){
 const calls=[],initial={readOnly:'on',isolation:'repeatable read',transactionStartedAt:'2026-10-29T10:00:00.000Z',readAt:'2026-10-29T10:00:01.000Z',ageMs:'1000.000',...state};let clocks=0;
 const tx={
  user:{findUnique:async()=>{calls.push('USER');return {id:'owner',role,companyId:'c'}}},
  store:{findFirst:async({where})=>where.id==='s'&&where.companyId==='c'?{id:'s',companyId:'c',name:'Synthetic'}:null},
  company:{findUnique:async()=>({id:'c',active:true,licenseStatus:'ACTIVE',subscriptionEndsAt:null,modules:[{moduleKey:'INVENTORY',active:true}]})},
  async $executeRawUnsafe(sql){calls.push(sql);assert.match(sql,/^SET /)},
  async $queryRawUnsafe(sql,...values){calls.push(sql);
   if(sql.includes('transaction_timestamp()'))return [{...initial,...(clocks++?exit:{})}];
   if(sql.includes("current_setting('transaction_read_only')"))return [initial];
   if(sql.includes('FROM pg_class'))return Object.entries(schema).flatMap(([table,columns])=>missing.includes(table)?[]:columns.map(column=>({table,column})));
   if(sql.includes('FROM "StorePaidModule"'))return [];
   for(const [name,table]of Object.entries(tables))if(sql.startsWith('SELECT source.')&&sql.includes('FROM "'+table+'"'))return facts[name].map(row=>({...row,_sourceCount:String(totals[name]??facts[name].length)}));
   throw Error(sql);
  },
  async $queryRaw(query){const sql=Array.isArray(query)?query.join(''):query.sql;calls.push(sql);
   if(sql.includes('WITH required('))return [{full:capability,jobs:capability,jobTable:capability,hasIntents:pending.length>0}];
   if(sql.includes('WITH scoped_audits')){const rows=sql.includes('LIMIT 50')?pending.slice(0,50):pending;return [{count:pendingCount,missingCount:rows.length===pending.length?pendingCount:pending.length,uploadedCount:0,reviewCount:0,digest:'same',rows}];}
   throw Error(sql);
  }
 };
 return {tx,calls,db:{$transaction:async fn=>fn(tx)}};
}
const pendingRows=n=>Array.from({length:n},(_,i)=>({id:'pending-'+i,documentNumber:'P '+i,supplierName:null,documentDate:null,status:'AWAITING_INVOICE',amount:'1.000000000001'}));
const candidate=r=>buildMonthlyInventorySnapshotCandidate({companyId:r.companyId,storeId:r.storeId,lifecycleGeneration:'0',issueMonth:r.period.month,sourceObservedAt:r.observation.readFinishedAt,sourceRevision:'a'.repeat(40),valuationBasis:'CURRENT_OPERATIONAL_V1',coverage:{complete:r.coverage.complete,productCount:1,invoiceCount:r.coverage.invoiceCount,pendingOriginalCount:r.coverage.pendingOriginalCount},products:[{id:'product',companyId:'c',storeId:'s',name:'Synthetic',sku:'S',unit:'PC',quantity:'1',retailUnitPrice:'1',purchaseUnitCost:'1'}],invoices:r.invoices,pendingOriginals:r.pendingOriginals});

test('full authorized source projection preserves exact primary decimal and51plus pending and composes with real D1',async()=>{
 const facts=empty();facts.documents=Array.from({length:60},(_,i)=>doc(String(i),i===0?{documentNumber:null}:{}));const pending=pendingRows(75);pending[74].amount=null;const f=fixture({facts,pending}),r=await project(f.tx,actor,input);
 assert.equal(r.invoices.items.length,60);assert.equal(r.pendingOriginals.items.length,75);assert.equal(r.freezeEligibility.eligible,true);assert.equal(r.coverage.complete,true);
 assert.equal(r.invoices.items[0].totalAmount,'-999999999999999999.123456789012');assert.equal(r.invoices.items[0].supplierName,'');assert.equal(r.invoices.items[0].documentNumber,'');assert.equal(r.pendingOriginals.items[0].supplierName,'');
 const built=candidate(r);assert.equal(built.candidateOnly,true);assert.equal(built.persisted,false);assert.match(built.payloadHash,/^[a-f0-9]{64}$/);assert.equal(built.invoices.items[0].totalAmount,'-999999999999999999.123456789012');assert.equal(built.pendingOriginals.items[0].amount,'1.000000000001');assert.equal(r.pendingOriginals.items.find(x=>x.id==='pending-74').amount,null);assert.equal(built.pendingOriginals.items.find(x=>x.id==='pending-74').amount,null);assert.equal(built.pendingOriginals.items.find(x=>x.id==='pending-74').amountUnknownReason,'MISSING');
 const legacy=await readMonthlyInvoiceAudit(f.db,actor,input,{now:new Date(r.observation.readFinishedAt)});assert.equal(legacy.items.length,50);assert.equal(legacy.summary.logicalRecords,60);assert.equal(legacy.pendingOriginals.items.length,50);assert.equal(typeof legacy.pendingOriginals.items[0].amount,'number');
 assert.deepEqual(classifyInvoiceMonth(facts,invoiceAuditMonth(input.month)).items,legacy.items.concat((await readMonthlyInvoiceAudit(f.db,actor,{...input,page:legacy.nextPage},{now:new Date(r.observation.readFinishedAt)})).items));
 assert.equal(JSON.stringify(r).includes('totalCents'),false);assert.equal(JSON.stringify(r).includes('registeredAt'),false);
});

test('unknown and outside-month primary dates stay visible but refuse freezing without changing public classification',async()=>{
 const facts=empty();facts.documents=[doc('unknown',{issueDay:null}),doc('primary',{issueDay:'2026-08-02',purchaseOrderId:'order'}),doc('projection',{issueDay:'2026-09-02',purchaseOrderId:'order',sourceType:'PURCHASE_ORDER',status:'APPROVED'})];facts.orders=[{id:'order',supplierId:'sup',invoiceNumber:'A primary',sourceDocumentId:'primary',status:'NEW',createdAt:'2026-09-03'}];
 // Source/posted linkage deliberately contradictory: no record is silently reassigned.
 const f=fixture({facts}),r=await project(f.tx,actor,input);assert.equal(r.freezeEligibility.eligible,false);assert.ok(r.freezeEligibility.reasons.includes('INVOICE_ISSUE_DATE_UNKNOWN'));assert.ok(r.invoices.items.some(x=>x.issueDay===null));assert.throws(()=>candidate(r));
 const outsideFacts=empty();outsideFacts.documents=[doc('old',{issueDay:'2026-08-02',purchaseOrderId:'old-order',documentNumber:'OLD 1',status:'MERGED',totalGross:'12.34'}),doc('canonical',{issueDay:'2026-09-02',purchaseOrderId:'canonical-order',documentNumber:'A 1',status:'MERGED',totalGross:'12.34'})];outsideFacts.orders=[{id:'old-order',supplierId:'sup',invoiceNumber:'BROKEN 999',sourceDocumentId:'old',status:'MERGED',totalGross:'12.34'},{id:'canonical-order',supplierId:'sup',invoiceNumber:'A 1',sourceDocumentId:'canonical',status:'MERGED',totalGross:'12.34'}];
 outsideFacts.inbound=[{id:'incoming',inboxId:'inbox',mark:'M',issuerVat:'099999999',series:'A',documentNumber:'1',issueDay:'2026-09-02',invoiceType:'1.1',totalGross:'12.34',draftOrderId:'canonical-order'}];outsideFacts.inbox=[];outsideFacts.aliases=[{aliasOrderId:'old-order',aliasDocumentId:'old',canonicalOrderId:'canonical-order',canonicalDocumentId:'canonical',inboxId:'inbox',mark:'M',completed:true,auditOrderId:'canonical-order',auditDocumentId:'canonical',auditInboxId:'inbox',auditMark:'M',auditAliasOrderIds:['old-order']}];
 const original=classifyInvoiceMonth(outsideFacts,invoiceAuditMonth(input.month)),outside=await project(fixture({facts:outsideFacts}).tx,actor,input);
 assert.equal(original.items.find(x=>x.id==='doc:canonical').issueDay,'2026-08-02');assert.equal(outside.invoices.items.find(x=>x.id==='doc:canonical').issueDay,'2026-08-02');assert.ok(outside.freezeEligibility.reasons.includes('INVOICE_PRIMARY_OUTSIDE_PERIOD'));assert.equal(outside.freezeEligibility.eligible,false);
 assert.deepEqual(Object.keys(original).sort(),['counts','items']);
});

test('transaction admission refuses writable/default/stale/future/malformed and caller clocks before source reads',async()=>{
 for(const state of [{readOnly:'off'},{isolation:'read committed'},{ageMs:'30000.001'},{ageMs:'-1'},{transactionStartedAt:'2026-10-29T10:00:02.000Z'},{readAt:'bad'}]){
  const f=fixture({state});await assert.rejects(project(f.tx,actor,input));assert.equal(f.calls.includes('USER'),false);
 }
 const f=fixture();for(const key of ['now','observedAt','asOf','sourceObservedAt'])await assert.rejects(project(f.tx,actor,{...input,[key]:'2026-10-29'}));await assert.rejects(project(f.tx,actor,input,{}));assert.equal(f.calls.length,0);
 const late=fixture({exit:{ageMs:'30001',readAt:'2026-10-29T10:00:30.001Z'}});await assert.rejects(project(late.tx,actor,input),e=>e.code==='INVOICE_SNAPSHOT_TRANSACTION_STALE');
 const serial=fixture({state:{isolation:'serializable'}});assert.equal((await project(serial.tx,actor,input)).observation.authorizationBasis,'ASSESSED_IN_HELD_TRANSACTION_SNAPSHOT');
});

test('current persisted role and caller scope deny while incomplete schema including empty pending never becomes freeze eligible',async()=>{
 const denied=fixture({role:'EMPLOYEE'});await assert.rejects(project(denied.tx,actor,input),e=>e.status===403);assert.equal(denied.calls.some(s=>s.startsWith('SELECT source.')),false);
 for(const user of [{...actor,tokenType:'STORE_OPERATOR'},{...actor,storeId:'other'}])await assert.rejects(project(fixture().tx,user,input));
 for(const args of [{capability:false},{missing:['InvoiceDraftAlias']},{missing:['StoreTransaction']}]){const r=await project(fixture(args).tx,actor,input);assert.equal(r.coverage.complete,false);assert.equal(r.freezeEligibility.eligible,false);assert.throws(()=>candidate(r));}
});

test('new full source requires exact complete materialized counts while legacy behavior is preserved',async()=>{
 const facts=empty();facts.documents=[doc('one')];const f=fixture({facts,totals:{documents:2}});await assert.rejects(project(f.tx,actor,input),e=>e.code==='INVOICE_SNAPSHOT_SOURCE_COUNT_MISMATCH');assert.equal((await readMonthlyInvoiceAudit(f.db,actor,input)).summary.logicalRecords,1);
 const limited=await project(fixture({facts,totals:{documents:20001}}).tx,actor,input);assert.equal(limited.coverage.complete,false);assert.equal(limited.invoices.items.length,0);assert.ok(limited.freezeEligibility.reasons.includes('SOURCE_LIMIT:documents'));
});

test('full pending count limits precede projection and do not widen legacy caller output',async()=>{
 for(const [pendingCount,n,code]of [[20001,1,'PENDING_SNAPSHOT_LIMIT'],[2,1,'PENDING_SNAPSHOT_COUNT_MISMATCH']]){const f=fixture({pending:pendingRows(n),pendingCount});await assert.rejects(project(f.tx,actor,input),e=>e.code===code);}
 const f=fixture({pending:pendingRows(75)}),p=await readPendingInvoices(f.tx,{companyId:'c',storeId:'s',user:actor});assert.equal(p.rows.length,50);assert.equal(p.truncated,true);
 await assert.rejects(readPendingInvoiceSnapshotRows(f.tx,{companyId:'c',storeId:'s',user:{...actor,tokenType:'STORE_OPERATOR'}}),e=>e.status===403);
 const nullable=pendingRows(1);nullable[0].amount=null;assert.equal((await readPendingInvoices(fixture({pending:nullable}).tx,{companyId:'c',storeId:'s',user:actor})).rows[0].amount,0);
});

test('projection text/private/size bounds and actual D1 enum/date validation remain strict',async()=>{
 for(const patch of [{supplierName:'😀'.repeat(129)},{id:'x'.repeat(161)},{totalGross:'1'.repeat(33)}]){const facts=empty();facts.documents=[doc('one',patch)];await assert.rejects(project(fixture({facts}).tx,actor,input));}
 const facts=empty();facts.documents=[doc('one')];const r=await project(fixture({facts,pending:pendingRows(1)}).tx,actor,input);assert.equal(Buffer.byteLength(JSON.stringify(r))<4*1024*1024,true);
 r.pendingOriginals.items[0].status='PAID';assert.throws(()=>candidate(r),e=>e.code==='SNAPSHOT_PENDING_STATUS_INVALID');r.pendingOriginals.items[0].status='AWAITING_INVOICE';r.invoices.items[0].issueDay='2026-08-01';assert.throws(()=>candidate(r),e=>e.code==='SNAPSHOT_INVOICE_PERIOD_INVALID');
 const large=empty();large.documents=Array.from({length:7000},(_,i)=>doc('size'+i,{supplierName:'x'.repeat(512)}));await assert.rejects(project(fixture({facts:large}).tx,actor,input),e=>e.code==='INVOICE_SNAPSHOT_PAYLOAD_LIMIT');
});
