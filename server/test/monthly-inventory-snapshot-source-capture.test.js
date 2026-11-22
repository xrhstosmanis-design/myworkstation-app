import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlySnapshotPurchaseUnitCost as cost,readMonthlyInventorySnapshotSourcesInTransaction as read,normalizeMonthlyInventorySnapshotActor as actorCopy,normalizeMonthlyInventorySnapshotSourceInput as inputCopy} from '../src/services/monthly-inventory-snapshot-source.js';
import {captureMonthlyInventorySnapshot,captureMonthlyInventorySnapshotForAutomation} from '../src/services/monthly-inventory-snapshot-capture.js';
import {buildMonthlyInventorySnapshotCandidate as build} from '../src/services/monthly-inventory-snapshot-payload.js';
const actor={id:'sa',companyId:'c',role:'SUPER_ADMIN'},input={storeId:'s',month:'2000-01',lifecycleGeneration:'0'};
const required={
 Supplier:['id','companyId','name','taxId'],PurchaseDocument:['id','companyId','storeId','supplierId','documentType','documentNumber','documentDate','totalGross','status','sourceType','purchaseOrderId','paymentTransactionId','createdAt'],
 PurchaseOrder:['id','companyId','storeId','supplierId','status','invoiceNumber','sourceDocumentId','createdAt'],MyDataInboundDocument:['id','companyId','storeId','inboxId','mark','issuerVat','series','documentNumber','issueDate','invoiceType','totalGross','rawPayload','fetchedAt'],DocumentInbox:['id','companyId','storeId','attachmentId','status','receivedAt'],AiReaderJob:['id','companyId','storeId','attachmentId','purchaseDocumentId','status'],DocumentAttachment:['id','companyId','storeId','mimeType','checksum','contentData'],InvoiceDraftAlias:['aliasOrderId','aliasDocumentId','companyId','storeId','canonicalOrderId','canonicalDocumentId','inboxId','mark','details'],PurchaseOrderPosting:['orderId','companyId','purchaseDocumentId'],InvoiceStockPosting:['companyId','storeId','orderId','sourceDocumentId','postedDocumentId','path'],StoreTransaction:['id','companyId','storeId','supplierId','supplierName','amount','actorId','actorName','occurredAt','invoiceDocumentNumber','attachmentMimeType','attachmentFilename','attachmentChecksum','attachmentData','paymentMethod','subtractFromShift','sessionId','type','reversedAt'],StoreOperatorAudit:['id','companyId','storeId','eventType','actorId','details'],
 StoreProduct:['id','storeId','productId','currentStock','salePrice','active'],Product:['id','companyId','name','sku','unit','salePrice','costPrice','active'],PurchaseDocumentLine:['id','purchaseDocumentId','productId','unit','unitCost','unitsPerPackage']
};
const raw=(id,patch={})=>({id,name:'Συνθετικό',sku:'SKU',unit:'PIECE',quantity:'-2.5000',retailUnitPrice:'0',found:false,cost:null,costUnit:null,packageQuantity:null,ambiguous:false,fallbackCost:'1.234567',...patch});
function fixture({rows=[raw('p')],baseCount=rows.length,links,stats={},state={},generation={},missing=[],role='SUPER_ADMIN',clockChangeAt=Infinity}={}){
 const calls=[];let clocks=0;const clock={readOnly:'on',isolation:'repeatable read',transactionStartedAt:'2026-10-30T10:00:00.000Z',readAt:'2026-10-30T10:00:01.000Z',ageMs:'1000',...state};
 const tx={user:{findUnique:async()=>({id:'sa',role,companyId:'c'})},store:{findFirst:async()=>({id:'s',companyId:'c',name:'Synthetic'})},
 async $queryRawUnsafe(sql,...args){calls.push(sql);
  if(sql.includes('transaction_timestamp()')){clocks++;return [{...clock,...(clocks>=clockChangeAt?{ageMs:'30001',readAt:'2026-10-30T10:00:30.001Z'}:{})}]}
  if(sql.includes("current_setting('transaction_read_only')"))return [clock];
  if(sql.includes('current_schema() AS schema'))return [{schema:'public',fence:'public."StoreLifecycleFence"'}];
  if(sql.includes('FROM "public"."StoreLifecycleFence"'))return [{companyId:'c',generation:'0',maintenance:false,retired:false,...generation}];
  if(sql.includes('FROM pg_class'))return Object.entries(required).flatMap(([table,names])=>missing.includes(table)?[]:names.map(column=>({table,column})));
  if(sql.startsWith('SELECT source.'))return [];
  if(sql.startsWith('SELECT COUNT(*)::text AS count FROM "StoreProduct"'))return [{count:String(baseCount)}];
  if(sql.startsWith('SELECT COUNT(*)::text AS count,COUNT(p.'))return [{count:String(baseCount),linked:String(baseCount),unique_count:String(baseCount),...links}];
  if(sql.startsWith('WITH source AS MATERIALIZED'))return [{count:String(rows.length),linked:String(rows.length),unique_count:String(rows.length),valid_count:String(rows.length),invalid_cost_count:'0',active_count:'0',bytes:String(Buffer.byteLength(JSON.stringify(rows))),rows,...stats}];
  throw Error(sql);
 },async $queryRaw(query){const sql=query.sql??query.join('');calls.push(sql);if(sql.includes('WITH required('))return [{full:true,jobs:true,jobTable:true,hasIntents:false}];if(sql.includes('WITH scoped_audits'))return [{count:0,missingCount:0,uploadedCount:0,reviewCount:0,digest:'synthetic',rows:[]}];throw Error(sql)}
 };
 return {tx,calls};
}
const fact=(patch={})=>({found:true,cost:'1',unit:'PACKAGE',packageQuantity:'8',ambiguous:false,fallbackCost:'7',...patch});

test('exact package rational arithmetic preserves signed/zero facts and explicitly marks only unrepresentable or ambiguous costs',()=>{
 for(const [amount,pack,expected]of [['1','8','0.125'],['-10','4','-2.5'],['0','3','0'],['1.2000','0.3000','4'],['999999999999999999','1','999999999999999999']])assert.deepEqual(cost(fact({cost:amount,packageQuantity:pack})),{value:expected,limitation:null});
 for(const [amount,pack]of [['1','3'],['1','8192'],['999999999999999999','0.1']])assert.deepEqual(cost(fact({cost:amount,packageQuantity:pack})),{value:false,limitation:'NON_REPRESENTABLE_PACKAGE_COST'});
 assert.deepEqual(cost(fact({ambiguous:true})),{value:false,limitation:'AMBIGUOUS_LATEST_PURCHASE_COST'});
 assert.deepEqual(cost(fact({found:false,cost:null,unit:null,packageQuantity:null,fallbackCost:null})),{value:null,limitation:null});
 assert.deepEqual(cost(fact({cost:null,fallbackCost:'0.0000'})),{value:'0',limitation:null});
 for(const patch of [{packageQuantity:'0'},{packageQuantity:'-1'},{cost:'NaN'},{cost:1},{packageQuantity:'1e2'},{unit:'UNKNOWN'},{fallbackCost:'Infinity',cost:null}])assert.throws(()=>cost(fact(patch)));
 for(const value of ['1\n','1\r',' 1','1 '])for(const patch of [{cost:value},{packageQuantity:value},{fallbackCost:value,cost:null}])assert.throws(()=>cost(fact(patch)),{code:'STOCK_SNAPSHOT_NUMERIC_INVALID'});
});

test('complete source preserves every assignment and composes actual D1 unknown valuation without a false zero',async()=>{
 const rows=[raw('a'),raw('b',{quantity:'0',found:true,cost:'1',costUnit:'PACKAGE',packageQuantity:'3'}),raw('c',{unit:'kg',quantity:'1.2345',found:true,cost:'2',costUnit:'PIECE',ambiguous:true})];
 const f=fixture({rows}),before=structuredClone(rows),r=await read(f.tx,actor,input);
 assert.equal(r.products.length,3);assert.equal(r.stockPopulation.basis,'ALL_STORE_PRODUCT_ROWS');assert.equal(r.stockPopulation.inactiveCount,3);assert.equal(r.products[0].quantity,'-2.5');assert.equal(r.products[0].retailUnitPrice,'0');assert.equal(r.products[0].purchaseUnitCost,'1.234567');
 assert.deepEqual(r.stockCostLimitations,{NON_REPRESENTABLE_PACKAGE_COST:1,AMBIGUOUS_LATEST_PURCHASE_COST:1});assert.deepEqual(rows,before);
 const candidate=build({companyId:r.companyId,storeId:r.storeId,lifecycleGeneration:r.lifecycleGeneration,issueMonth:input.month,sourceObservedAt:r.observation.readFinishedAt,sourceRevision:'a'.repeat(40),valuationBasis:'CURRENT_OPERATIONAL_V1',coverage:r.coverage,products:r.products,invoices:r.invoices,pendingOriginals:r.pendingOriginals});
 assert.equal(candidate.products[1].purchaseUnknownReason,'INVALID');assert.equal(candidate.quantityByUnit.find(u=>u.unit==='PIECE').purchaseValue,null);assert.equal(candidate.persisted,false);assert.equal(candidate.candidateOnly,true);
});

test('actual shared transaction admission, expected epoch and capability checks refuse unsafe source reads',async()=>{
 for(const state of [{readOnly:'off'},{isolation:'read committed'},{ageMs:'30001'}]){const f=fixture({state});await assert.rejects(read(f.tx,actor,input));assert.equal(f.calls.some(sql=>sql.startsWith('WITH source')),false)}
 for(const generation of [{generation:'1'},{maintenance:true},{retired:true}]){const f=fixture({generation});await assert.rejects(read(f.tx,actor,input));assert.equal(f.calls.some(sql=>sql.startsWith('WITH source')),false)}
 const missing=fixture({missing:['PurchaseDocumentLine']});await assert.rejects(read(missing.tx,actor,input),{code:'STOCK_SNAPSHOT_SOURCE_UNAVAILABLE'});
 const role=fixture({role:'EMPLOYEE'});await assert.rejects(read(role.tx,actor,input),e=>e.status===403);
 const future=fixture();await assert.rejects(read(future.tx,actor,{...input,month:'2026-10'}),{code:'SNAPSHOT_BEFORE_DUE'});
 const final=fixture({clockChangeAt:4});await assert.rejects(read(final.tx,actor,input),{code:'INVOICE_SNAPSHOT_TRANSACTION_STALE'});
});

test('row, join and byte guards prevent partial stock results before expanding product facts',async()=>{
 const cap=fixture({baseCount:20001});await assert.rejects(read(cap.tx,actor,input),{code:'STOCK_SNAPSHOT_ROW_LIMIT'});assert.equal(cap.calls.some(sql=>sql.startsWith('WITH source')),false);
 for(const links of [{linked:'0'},{count:'2'},{unique_count:'0'}]){const f=fixture({links});await assert.rejects(read(f.tx,actor,input),{code:'STOCK_SNAPSHOT_LINKS_INVALID'});assert.equal(f.calls.some(sql=>sql.startsWith('WITH source')),false)}
 for(const [stats,code]of [[{valid_count:'0'},'STOCK_SNAPSHOT_SOURCE_FIELDS_INVALID'],[{invalid_cost_count:'1'},'STOCK_SNAPSHOT_COST_INVALID'],[{bytes:'4194301',rows:[]},'STOCK_SNAPSHOT_PAYLOAD_LIMIT'],[{rows:[]},'STOCK_SNAPSHOT_SOURCE_INCOMPLETE']])await assert.rejects(read(fixture({stats}).tx,actor,input),{code});
});

test('source and coordinator reject clocks, revisions, accessors and missing epochs before business reads',async()=>{
 let touched=0;const f=fixture();
 for(const patch of [{now:'2026-10-30'},{sourceRevision:'a'.repeat(40)},{lifecycleGeneration:undefined}])await assert.rejects(read(f.tx,actor,{...input,...patch}));
 const getter={...input};Object.defineProperty(getter,'storeId',{enumerable:true,get(){touched++;throw Error('must not run')}});await assert.rejects(read(f.tx,actor,getter));assert.equal(touched,0);assert.equal(f.calls.length,0);
 let opened=0;await assert.rejects(captureMonthlyInventorySnapshot({$transaction:async()=>{opened++;throw Error('must not open')}},actor,{...input,now:'x'}));assert.equal(opened,0);
});

test('scope and actor snapshots remain detached without reading private getters or dropping restrictive authorization flags',async()=>{
 const original={...actor,supportContext:{companyId:'c',storeId:'s'},isSuperAdmin:true,platformRole:'SUPER_ADMIN',ownerCompanyId:'c',tokenType:'BACKOFFICE_USER'},request={...input};let touched=0;
 Object.defineProperty(original,'privateToken',{get(){touched++;throw Error('private')}});
 const detached=actorCopy(original),selected=inputCopy(request);original.id='other';original.companyId='x';original.supportContext.storeId='foreign';request.lifecycleGeneration='1';request.storeId='foreign';
 assert.equal(detached.id,'sa');assert.equal(detached.companyId,'c');assert.equal(detached.supportContext.storeId,'s');assert.equal(detached.isSuperAdmin,true);assert.equal(detached.platformRole,'SUPER_ADMIN');assert.equal(selected.lifecycleGeneration,'0');assert.equal(selected.storeId,'s');assert.equal(touched,0);assert.ok(Object.isFrozen(detached.supportContext));
 for(const patch of [{quantity:'1\n'},{retailUnitPrice:'1\n'}])await assert.rejects(read(fixture({rows:[raw('p',patch)]}).tx,actor,input),{code:'STOCK_SNAPSHOT_NUMERIC_INVALID'});
});

test('raw automation and a cloned empty attempt cannot enter the source coordinator or touch SQL',async()=>{
 let opened=0;const db={$transaction(){opened++;throw Error('must not open')}};
 const execution={type:'SERVICE_DELEGATION',purpose:'MONTHLY_INVENTORY_CAPTURE',executor:'MONTHLY_INVENTORY_CAPTURE_V1',jobId:'job',leaseToken:'a'.repeat(64)};
 await assert.rejects(captureMonthlyInventorySnapshotForAutomation(db,execution),{code:'MONTHLY_CAPTURE_ATTEMPT_REQUIRED'});
 await assert.rejects(captureMonthlyInventorySnapshotForAutomation(db,execution,Object.freeze({})),{code:'MONTHLY_CAPTURE_ATTEMPT_REQUIRED'});
 await assert.rejects(captureMonthlyInventorySnapshotForAutomation(db,execution,structuredClone(Object.freeze({}))),{code:'MONTHLY_CAPTURE_ATTEMPT_REQUIRED'});
 await assert.rejects(captureMonthlyInventorySnapshotForAutomation(db,execution,{},()=>({enabled:true})),{code:'MONTHLY_CAPTURE_ATTEMPT_REQUIRED'});
 assert.equal(opened,0);
});

test('typed automation does not accept supplied period, principal or clocks even with an apparent attempt object',async()=>{
 let opened=0;const db={$transaction(){opened++;throw Error('must not open')}};
 const execution={type:'SERVICE_DELEGATION',purpose:'MONTHLY_INVENTORY_CAPTURE',executor:'MONTHLY_INVENTORY_CAPTURE_V1',jobId:'job',leaseToken:'a'.repeat(64)};
 for(const extra of [{month:'2026-01'},{companyId:'foreign'},{now:'2026-01-01'},{principal:{role:'OWNER'}},{fingerprint:'forged'}])await assert.rejects(captureMonthlyInventorySnapshotForAutomation(db,{...execution,...extra},Object.freeze({})),{code:'MONTHLY_CAPTURE_INPUT_INVALID'});
 assert.equal(opened,0);
});
