import test from 'node:test';
import assert from 'node:assert/strict';
import {composeOrdinaryPurchaseReview} from '../src/lib/invoice-purchase-review-view.js';

const scope={companyId:'c',storeId:'s'};
const doc=(id,extra={})=>({id,...scope,supplierId:'supplier',supplierTaxId:'099999999',documentType:'INVOICE',documentNumber:'A 1',issueDay:'2026-11-02',totalGross:'12.34',status:'DRAFT',sourceType:'POS_OCR_DRAFT',purchaseOrderId:'order',...extra});
const order=(extra={})=>({id:'order',...scope,supplierId:'supplier',sourceDocumentId:'source',invoiceNumber:'A 1',status:'NEW',...extra});
const row=(extra={})=>({id:'doc:source',documentType:'INVOICE',documentNumber:'A 1',issueDay:'2026-11-02',supplierTaxId:'099999999',totalCents:1234,status:'UNPOSTED',categories:['UNPOSTED_DOCUMENT','UPLOADED_AWAITING_REVIEW'],reasons:[],sources:[{kind:'DOCUMENT',id:'source',status:'DRAFT'},{kind:'ORDER',id:'order',status:'NEW'}],payment:{status:'PAID',paidCents:1234},...extra});
const facts=()=>({documents:[doc('source')],orders:[order()],inbound:[]});
const run=(items=[row()],f=facts())=>composeOrdinaryPurchaseReview(items,f,scope);

test('coherent active invoice draft is a purchase draft independent of existing paid financial observation',()=>{
 for(const status of ['NEW','FINAL']){const f=facts();f.orders[0].status=status;const input=[row()],before=JSON.stringify({input,f}),result=run(input,f);
  assert.deepEqual(result.summary,{unposted:1,uploadedAwaitingReview:1,purchaseLinkReview:0});assert.equal(result.items[0].purchaseReview.status,'DRAFT_PURCHASE');assert.deepEqual(result.items[0].openTarget,{kind:'ORDER',orderId:'order',storeId:'s',basis:'EXPLICIT'});assert.equal(result.items[0].relatedOrders[0].storeId,'s');assert.deepEqual(result.items[0].payment,input[0].payment);assert.equal(JSON.stringify({input,f}),before);
 }
});

test('credit merged unknown unlinked and missing-identity rows stay visible for review without becoming draft purchases',()=>{
 const variants=[
  {f:()=>{const f=facts();f.documents[0].documentType='CREDIT_NOTE';return f},r:{documentType:'CREDIT_NOTE'},state:'CREDIT'},
  {f:()=>{const f=facts();f.documents[0].status='MERGED';f.orders[0].status='MERGED';return f},r:{sources:[{kind:'DOCUMENT',id:'source',status:'MERGED'},{kind:'ORDER',id:'order',status:'MERGED'}]},state:'INACTIVE'},
  {f:facts,r:{documentType:null},state:'LINK_REVIEW'},
  {f:facts,r:{categories:['UNPOSTED_DOCUMENT','IDENTITY_OR_LINK_REVIEW'],reasons:['Missing supplier']},state:'LINK_REVIEW'},
  {f:facts,r:{categories:['UNPOSTED_DOCUMENT','POSSIBLE_DUPLICATE'],reasons:['Duplicate']},state:'LINK_REVIEW'},
  {f:()=>({documents:[],orders:[],inbound:[{id:'incoming',totalGross:'12.34'}]}),r:{id:'inbound:incoming',sources:[{kind:'MYDATA',id:'incoming',status:null}]},state:'LINK_REVIEW'},
  {f:()=>({documents:[doc('source',{purchaseOrderId:null})],orders:[],inbound:[]}),r:{sources:[{kind:'DOCUMENT',id:'source',status:'DRAFT'}]},state:'LINK_REVIEW'}
 ];
 for(const variant of variants){const input=[row(variant.r)],result=run(input,variant.f());assert.deepEqual(result.summary,{unposted:0,uploadedAwaitingReview:0,purchaseLinkReview:1});assert.equal(result.items[0].purchaseReview.status,variant.state);assert.ok(result.items[0].categories.includes('PURCHASE_LINK_REVIEW'));assert.deepEqual(result.items[0].payment,input[0].payment)}
 const unknownInbox=run([row({status:'IDENTITY_UNKNOWN',sources:[{kind:'INBOX',id:'inbox',status:'RECEIVED'}],categories:['IDENTITY_OR_LINK_REVIEW']})],facts());assert.equal(unknownInbox.items[0].purchaseReview.status,'LINK_REVIEW');
});

test('standalone myDATA header may suggest unique existing order only for navigation and never payment or purchase eligibility',()=>{
 const f=facts();f.inbound=[{id:'incoming',totalGross:'12.34'}];const input=[row({id:'inbound:incoming',sources:[{kind:'MYDATA',id:'incoming',status:null}],payment:{status:'NOT_LINKED',paidCents:null}})],result=run(input,f);
 assert.deepEqual(result.items[0].openTarget,{kind:'ORDER',orderId:'order',storeId:'s',basis:'HEADER_CANDIDATE'});assert.equal(result.items[0].purchaseReview.status,'LINK_REVIEW');assert.equal(result.summary.unposted,0);assert.equal(result.summary.purchaseLinkReview,1);assert.deepEqual(result.items[0].payment,input[0].payment);assert.deepEqual(result.items[0].sources,input[0].sources);assert.equal(result.items[0].relatedOrders[0].basis,'HEADER_CANDIDATE');assert.equal(result.items[0].relatedOrders[0].storeId,'s');
});

test('ambiguous headers and foreign or mismatched candidates always fall back to existing-record preview',()=>{
 const input=[row({id:'inbound:incoming',sources:[{kind:'MYDATA',id:'incoming',status:null}]})];
 for(const variant of ['ambiguous','series','supplier','vat','day','amount','type','source-backlink','order-number','inactive','foreign-company','foreign-store','duplicate-source','duplicate-order']){
  const f=facts();f.inbound=[{id:'incoming',totalGross:'12.34'}];
  if(variant==='ambiguous'){f.documents.push(doc('other',{purchaseOrderId:'other'}));f.orders.push(order({id:'other',sourceDocumentId:'other'}))}
  if(variant==='series')f.documents[0].documentNumber='B 1';
  if(variant==='supplier')f.orders[0].supplierId='other';
  if(variant==='vat')f.documents[0].supplierTaxId='088888888';
  if(variant==='day')f.documents[0].issueDay='2026-11-03';
  if(variant==='amount')f.documents[0].totalGross='12.39000001';
  if(variant==='type')f.documents[0].documentType='CREDIT_NOTE';
  if(variant==='source-backlink')f.documents[0].purchaseOrderId='other';
  if(variant==='order-number')f.orders[0].invoiceNumber='A 2';
  if(variant==='inactive')f.documents[0].status='MERGED';
  if(variant==='foreign-company')f.orders[0].companyId='other';
  if(variant==='foreign-store')f.documents[0].storeId='other';
  if(variant==='duplicate-source')f.documents.push({...f.documents[0]});
  if(variant==='duplicate-order')f.orders.push({...f.orders[0]});
  const result=run(input,f);assert.deepEqual(result.items[0].openTarget,{kind:'PREVIEW',rowId:'inbound:incoming',storeId:'s'},variant);assert.equal(result.summary.unposted,0,variant);
 }
});

test('merged alias can suggest a unique active canonical header but cannot reopen merged order as explicit',()=>{
 const f=facts();f.documents.push(doc('old',{purchaseOrderId:'old',status:'MERGED'}));f.orders.push(order({id:'old',sourceDocumentId:'old',status:'MERGED'}));const input=[row({id:'doc:old',sources:[{kind:'DOCUMENT',id:'old',status:'MERGED'},{kind:'ORDER',id:'old',status:'MERGED'}]})],result=run(input,f);
 assert.equal(result.items[0].purchaseReview.status,'INACTIVE');assert.deepEqual(result.items[0].openTarget,{kind:'ORDER',orderId:'order',storeId:'s',basis:'HEADER_CANDIDATE'});assert.equal(result.summary.unposted,0);
});

test('large ambiguous candidate headers remain bounded and cannot choose an arbitrary order',()=>{
 const f={documents:[],orders:[],inbound:[{id:'incoming',totalGross:'12.34'}]};for(let i=0;i<100;i++){f.documents.push(doc('d'+i,{purchaseOrderId:'o'+i}));f.orders.push(order({id:'o'+i,sourceDocumentId:'d'+i}))}
 const result=run([row({id:'inbound:incoming',sources:[{kind:'MYDATA',id:'incoming',status:null}]})],f);assert.equal(result.items[0].openTarget.kind,'PREVIEW');assert.equal(result.items[0].relatedOrderCount,100);assert.equal(result.items[0].relatedOrders,undefined);
});

test('confirmed posted and credit records retain prior categories while open targets never create a draft',()=>{
 const result=run([row({status:'POSTED',categories:[],sources:[{kind:'DOCUMENT',id:'source',status:'DRAFT'},{kind:'ORDER',id:'order',status:'NEW'}]})]);assert.equal(result.items[0].purchaseReview.status,'POSTED_PURCHASE');assert.deepEqual(result.items[0].categories,[]);assert.equal(result.summary.unposted,0);assert.equal(result.items[0].openTarget.kind,'ORDER');
});

test('proven standalone nonfinancial delivery note is neutral; forged or conflicting evidence cannot hide purchase review',()=>{
 const f={documents:[],orders:[],inbound:[{id:'m',inboxId:'i',invoiceType:'9.3',totalGross:'0',deliveryNoteMetadataVerified:true}],inbox:[{id:'i',status:'RECEIVED'}]};
 const r=row({id:'inbound:m',documentType:'DELIVERY_NOTE',totalCents:0,nonFinancialBasis:'STANDALONE_ZERO_MYDATA_9_3_V1',sources:[{kind:'MYDATA',id:'m'}],payment:{status:'NOT_APPLICABLE'}});
 const before=JSON.stringify({r,f}),actual=run([r],f);assert.equal(actual.items[0].purchaseReview.status,'NON_FINANCIAL');assert.deepEqual(actual.items[0].categories,[]);assert.equal(actual.items[0].openTarget.kind,'PREVIEW');assert.equal(actual.summary.unposted,0);assert.equal(actual.summary.purchaseLinkReview,0);
 for(const patch of [{nonFinancialBasis:undefined},{nonFinancialBasis:'FAKE'},{totalCents:1},{payment:{status:'PAID'}},{sources:[{kind:'MYDATA',id:'m'},{kind:'DOCUMENT',id:'d'}]}])assert.notEqual(run([{...r,...patch}],f).items[0].purchaseReview.status,'NON_FINANCIAL');
 for(const changed of [{...f,inbound:[]},{...f,inbound:[{...f.inbound[0],deliveryNoteMetadataVerified:false}]},{...f,inbound:[{...f.inbound[0],totalGross:'0.004'}]},{...f,aliases:[{inboxId:'i'}]}])assert.notEqual(run([r],changed).items[0].purchaseReview.status,'NON_FINANCIAL');
 const unrelated=run([{...r,reasons:['Άλλο πρόβλημα.'],categories:[...r.categories,'IDENTITY_OR_LINK_REVIEW']}],f).items[0];assert.deepEqual(unrelated.reasons,['Άλλο πρόβλημα.']);assert.deepEqual(unrelated.categories,['IDENTITY_OR_LINK_REVIEW']);assert.equal(JSON.stringify({r,f}),before);
});
