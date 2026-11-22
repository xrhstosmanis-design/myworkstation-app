import test from 'node:test';
import assert from 'node:assert/strict';
import {composeAutomaticInvoiceIdentity} from '../src/lib/invoice-automatic-identity-view.js';
import {normalizePostingProjections} from '../src/lib/invoice-posting-projection-view.js';
import {classifyInvoiceMonth,invoiceAuditMonth} from '../src/services/monthly-invoice-audit.js';
import {observeInvoicePayments} from '../src/lib/invoice-payment-observation.js';

const scope={companyId:'company',storeId:'store'};
const fixture=()=>({documents:[{...scope,id:'document',supplierId:'supplier',supplierTaxId:'123456789',supplierName:'Saved supplier',documentNumber:'TEST-S 73001',documentType:'INVOICE',issueDay:'2026-11-12',totalGross:'123.4500',sourceType:'MANUAL',status:'APPROVED',purchaseOrderId:null,paymentTransactionId:'payment',createdAt:'2026-11-12'}],orders:[],inbound:[{...scope,id:'inbound',inboxId:'inbox',mark:'400000000000001',issuerVat:'123456789',series:'TEST-S',documentNumber:'073001',invoiceType:'1.1',issueDay:'2026-11-12',totalGross:'123.45',draftOrderId:null,createdAt:'2026-11-12'}],inbox:[{...scope,id:'inbox',status:'RECEIVED',attachmentId:null,createdAt:'2026-11-12'}],jobs:[],attachments:[],aliases:[],postings:[],stockPostings:[]});
const metadata=facts=>facts.inbound.map(row=>({id:row.id,identityLinksPresent:false,currencyAllowed:true,draftDocumentId:null,commonDraftDocumentId:null,commonDraftOrderId:null}));
const classify=facts=>classifyInvoiceMonth(facts,invoiceAuditMonth('2026-11')).items;
const run=(facts,{items=classify(facts),linkMetadata=metadata(facts),...options}={})=>composeAutomaticInvoiceIdentity(items,facts,{...scope,linkMetadata,linkMetadataAvailable:true,...options});
const draft=(facts,status='NEW')=>{Object.assign(facts.documents[0],{status:'DRAFT',sourceType:'POS_OCR_DRAFT',purchaseOrderId:'order'});facts.orders.push({...scope,id:'order',sourceDocumentId:'document',supplierId:'supplier',invoiceNumber:'TEST-S 73001',status,createdAt:'2026-11-12'});return facts};
const payment=(patch={})=>({...scope,id:'payment',supplierId:'supplier',type:'SUPPLIER_PAYMENT',amount:'123.45',invoiceDocumentNumber:'TEST-S 73001',settlementConfirmed:true,...patch});

test('unique approved standalone invoice and myDATA become one immutable ordinary family with the original id and payment only once',()=>{
 const facts=fixture(),items=classify(facts),before=JSON.stringify({facts,items}),result=run(facts,{items});
 assert.equal(result.matches.length,1);assert.equal(result.items.length,1);assert.equal(result.items[0].id,'doc:document');assert.equal(result.items[0].status,'POSTED');assert.deepEqual(result.items[0].categories,[]);assert.deepEqual(result.items[0].reasons,[]);assert.deepEqual(result.items[0].sources.map(s=>[s.kind,s.id]),[['DOCUMENT','document'],['MYDATA','inbound']]);assert.equal(result.items[0].automaticMatches[0].canonicalOrderId,null);assert.equal(result.items[0].automaticMatches[0].mark,'400000000000001');assert.equal(JSON.stringify({facts,items}),before);
 const observed=observeInvoicePayments(result.items,facts,[payment()],{available:true});assert.equal(observed.summary.paid,1);assert.equal(observed.items[0].payment.paidCents,12345);assert.deepEqual(observed.items[0].payment.transactionIds,['payment']);
 const again=run(facts,{items:result.items});assert.deepEqual(again.items,result.items);assert.equal(again.matches.length,0);
});

test('coherent NEW and FINAL drafts remain draft purchases after the automatic source union',()=>{
 for(const status of ['NEW','FINAL']){const facts=draft(fixture(),status),before=classify(facts),result=run(facts,{items:before});assert.equal(result.matches.length,1);assert.equal(result.items[0].id,'doc:document');assert.equal(result.items[0].status,'UNPOSTED');assert.ok(result.items[0].categories.includes('UNPOSTED_DOCUMENT'));assert.equal(result.matches[0].canonicalOrderId,'order');assert.equal(facts.orders[0].status,status)}
});

test('proven posting-normalizer family joins once and retains recorded projection provenance',()=>{
 const facts=draft(fixture(),'INVOICED');facts.documents.push({...facts.documents[0],id:'order',status:'APPROVED',sourceType:'PURCHASE_ORDER',purchaseOrderId:null,paymentTransactionId:null,issueDay:'2026-11-15',totalGross:'123.4532'});facts.postings.push({orderId:'order',purchaseDocumentId:'order'});facts.stockPostings.push({...scope,orderId:'order',sourceDocumentId:'document',postedDocumentId:'order',path:'PURCHASE_ORDER'});
 const normalized=normalizePostingProjections(facts,scope),items=classify(normalized.facts),result=run(normalized.facts,{items,projections:normalized.projections});assert.equal(result.matches.length,1);assert.equal(result.items.length,1);assert.equal(result.items[0].status,'POSTED');assert.deepEqual(result.items[0].sources.filter(s=>s.kind==='DOCUMENT').map(s=>s.id),['document','order']);
 assert.equal(run(normalized.facts,{items}).matches.length,0,'unproven projection cannot be treated as an original');assert.equal(facts.documents[1].issueDay,'2026-11-15');
});

test('five-cent boundary is exact and a larger difference or invalid amount never matches',()=>{
 for(const [value,expected]of [['123.50',1],['123.50000001',0],['123.40',1],['123.39999999',0],['0',0],['-123.45',0],['NaN',0],[123.45,0]]){const facts=fixture();facts.inbound[0].totalGross=value;assert.equal(run(facts).matches.length,expected,String(value))}
});

test('equal amounts and numeric tails never override a different supplier, series, date or invoice type',()=>{
 for(const change of [f=>f.inbound[0].issuerVat='987654321',f=>f.inbound[0].series='OTHER-S',f=>f.inbound[0].series='',f=>f.inbound[0].issueDay='2026-11-13',f=>f.inbound[0].invoiceType='5.1',f=>f.documents[0].documentType='CREDIT_NOTE',f=>f.inbound[0].mark=null,f=>f.inbound[0].series=null]){const facts=fixture();change(facts);assert.equal(run(facts).matches.length,0)}
});

test('complete raw competitors cannot be ignored because they are inactive, unposted, unsupported or outside eligible items',()=>{
 for(const patch of [{},{status:'CANCELLED'},{status:'MERGED'},{status:'DRAFT',purchaseOrderId:null},{documentType:'UNKNOWN'},{totalGross:'500.00'},{issueDay:null},{companyId:'foreign'},{storeId:'foreign'}]){
  const facts=fixture();facts.documents.push({...facts.documents[0],id:'competitor',paymentTransactionId:null,...patch});const items=classify(facts).filter(item=>item.sources.every(source=>source.id!=='competitor'));assert.equal(run(facts,{items}).matches.length,0,JSON.stringify(patch));
 }
 const facts=fixture();facts.orders.push({...scope,id:'dangling',sourceDocumentId:'deleted',supplierId:'supplier',invoiceNumber:'TEST-S 73001',status:'NEW',createdAt:'2026-11-12'});assert.equal(run(facts).matches.length,0);
});

test('multiple official MARKs, shared or missing inboxes and old claimed pointers fail closed',()=>{
 const mutations=[f=>f.inbound.push({...f.inbound[0],id:'second',inboxId:'second-inbox',mark:'400000000000002'}),f=>f.inbound.push({...f.inbound[0],id:'second',inboxId:'second-inbox'}),f=>f.inbox.push({...f.inbox[0]}),f=>f.inbox=[],f=>f.inbox[0].status='PROCESSED',f=>f.inbound[0].draftOrderId='deleted-order',f=>f.aliases.push({inboxId:'inbox',canonicalDocumentId:'document'})];
 for(const change of mutations){const facts=fixture();change(facts);assert.equal(run(facts).matches.length,0)}
 for(const field of ['draftDocumentId','commonDraftDocumentId','commonDraftOrderId']){const facts=fixture(),links=metadata(facts);links[0][field]='deleted-pointer';assert.equal(run(facts,{linkMetadata:links}).matches.length,0)}
 const facts=fixture();assert.equal(run(facts,{linkMetadata:[{id:'inbound',identityLinksPresent:true}]}).matches.length,0);
});

test('any previous inbox document/order/job claim prevents an incoming original from redirecting the canonical family',()=>{
 for(const via of ['draftDocumentId','commonDraftDocumentId','commonDraftOrderId','draftOrderId','job']){
  const facts=draft(fixture()),peer={...facts.inbound[0],id:'older',inboxId:'older-inbox',mark:'400000000000002',documentNumber:'9999',draftOrderId:null};facts.inbound.push(peer);facts.inbox.push({...scope,id:'older-inbox',status:'IN_REVIEW',attachmentId:'older-photo',createdAt:'2026-11-12'});facts.attachments.push({...scope,id:'older-photo'});const links=metadata(facts);
  if(via==='job')facts.jobs.push({...scope,id:'older-job',attachmentId:'older-photo',purchaseDocumentId:'document'});else if(via==='draftOrderId')peer.draftOrderId='order';else{links[1][via]=via.endsWith('OrderId')?'order':'document';links[1].identityLinksPresent=true}
  assert.equal(run(facts,{linkMetadata:links}).matches.length,0,via);
 }
});

test('unavailable or malformed pointer coverage, foreign scope and duplicate source identities never authorize a match',()=>{
 const facts=fixture();for(const options of [{linkMetadataAvailable:false},{linkMetadata:null},{linkMetadata:{}},{projections:null},{linkMetadata:[]},{linkMetadata:[...metadata(facts),...metadata(facts)]},{linkMetadata:[{id:'inbound',identityLinksPresent:'false'}]},{linkMetadata:[{id:'inbound',identityLinksPresent:false,draftDocumentId:{id:'bad'}}]},{companyId:'foreign'},{storeId:'foreign'}])assert.equal(run(facts,options).matches.length,0);
 for(const array of ['documents','orders','inbound','inbox','jobs','attachments']){
  const f=draft(fixture());if(array==='jobs'){f.jobs.push({...scope,id:'job',attachmentId:'photo',purchaseDocumentId:'document'});f.inbox[0].attachmentId='photo';f.attachments.push({...scope,id:'photo'})}if(array==='attachments'){f.inbox[0].attachmentId='photo';f.attachments.push({...scope,id:'photo'})}
  if(!f[array].length)continue;f[array][0].companyId='foreign';assert.equal(run(f).matches.length,0,array);
 }
 const duplicate=fixture();duplicate.documents.push({...duplicate.documents[0]});assert.equal(run(duplicate).matches.length,0);
});

test('unresolved canonical identity warnings and foreign/dangling attachment jobs remain visible and unchanged',()=>{
 const facts=fixture(),items=classify(facts);items.find(item=>item.id==='doc:document').categories.push('IDENTITY_OR_LINK_REVIEW');items.find(item=>item.id==='doc:document').reasons.push('Unresolved original identity');const before=JSON.stringify(items);assert.equal(run(facts,{items}).matches.length,0);assert.equal(JSON.stringify(items),before);
 for(const pointer of ['deleted','foreign']){const f=fixture();f.inbox[0].attachmentId='photo';f.attachments.push({...scope,id:'photo'});f.jobs.push({...scope,id:'job',attachmentId:'photo',purchaseDocumentId:pointer});assert.equal(run(f).matches.length,0)}
});

test('automatic invoice identity never manufactures or certifies a payment from matching headers',()=>{
 const facts=fixture();facts.documents[0].paymentTransactionId=null;const result=run(facts),observed=observeInvoicePayments(result.items,facts,[payment()],{available:true});assert.equal(result.matches.length,1);assert.equal(observed.items[0].payment.status,'NOT_LINKED');assert.equal(observed.items[0].payment.paidCents,null);assert.equal(facts.documents[0].paymentTransactionId,null);
 for(const patch of [{reversedAt:'2026-11-13'},{settlementConfirmed:false},{supplierId:'foreign'}]){const f=fixture(),matched=run(f),seen=observeInvoicePayments(matched.items,f,[payment(patch)],{available:true});assert.notEqual(seen.items[0].payment.status,'PAID')}
});

test('contradictory posting or stock receipts cannot hide behind an approved standalone header',()=>{
 for(const change of [f=>f.postings.push({orderId:'missing-order',purchaseDocumentId:'document'}),f=>f.stockPostings.push({...scope,sourceDocumentId:'document',postedDocumentId:'other',path:'DIRECT'}),f=>f.stockPostings.push({...scope,sourceDocumentId:'other',postedDocumentId:'document',path:'DIRECT'}),f=>f.stockPostings.push({...scope,sourceDocumentId:'document',postedDocumentId:'document',orderId:'missing-order',path:'DIRECT'})]){const f=fixture();change(f);assert.equal(run(f).matches.length,0)}
 const f=fixture();f.stockPostings.push({...scope,sourceDocumentId:'document',postedDocumentId:'document',orderId:null,path:'DIRECT'});assert.equal(run(f).matches.length,1,'a same-document standalone receipt does not fabricate an order');f.stockPostings.push({...f.stockPostings[0]});assert.equal(run(f).matches.length,0);
});

test('one thousand independent source pairs retain all canonical identities with bounded raw document visits',()=>{
 const facts=fixture();for(const key of Object.keys(facts))facts[key]=[];const size=1000;let visits=0;
 for(let i=0;i<size;i++){
  const f=fixture(),document={...f.documents[0],id:'document-'+i,paymentTransactionId:null},official={...f.inbound[0],id:'inbound-'+i,inboxId:'inbox-'+i,mark:String(400000000000000+i),documentNumber:String(i+1)},inbox={...f.inbox[0],id:'inbox-'+i};
  Object.defineProperty(document,'documentNumber',{enumerable:true,get(){visits++;return 'TEST-S '+(i+1)}});facts.documents.push(document);facts.inbound.push(official);facts.inbox.push(inbox);
 }
 const items=classify(facts);visits=0;const before=JSON.stringify(facts);visits=0;const result=run(facts,{items});assert.equal(result.matches.length,size);assert.equal(result.items.length,size);assert.equal(new Set(result.items.map(item=>item.id)).size,size);assert.ok(visits<size*20,'document accesses stay indexed rather than rescanning the store for each original');assert.equal(JSON.stringify(facts),before);
});

test('legacy FINAL posted family is eligible only through the actual normalizer FINAL receipt and effective backlink',()=>{
 const facts=draft(fixture(),'FINAL');facts.orders[0].reopenVersion=0;facts.documents.push({...facts.documents[0],id:'order',status:'APPROVED',sourceType:'PURCHASE_ORDER',purchaseOrderId:null,paymentTransactionId:null,issueDay:'2026-11-15',totalGross:'123.4532'});facts.postings.push({orderId:'order',purchaseDocumentId:'order'});facts.stockPostings.push({...scope,orderId:'order',sourceDocumentId:'document',postedDocumentId:'order',path:'PURCHASE_ORDER'});
 const before=JSON.stringify(facts),normalized=normalizePostingProjections(facts,scope);assert.equal(normalized.projections.length,1);assert.equal(normalized.projections[0].recordedOrderStatus,'FINAL');assert.equal(normalized.projections[0].effectivePurchaseOrderId,'order');
 const items=classify(normalized.facts),result=run(normalized.facts,{items,projections:normalized.projections});assert.equal(result.matches.length,1);assert.equal(result.items.length,1);assert.equal(result.items[0].status,'POSTED');assert.equal(result.matches[0].canonicalOrderId,'order');assert.equal(JSON.stringify(facts),before);
 for(const omitted of ['recordedOrderStatus','effectivePurchaseOrderId']){const proofs=normalized.projections.map(proof=>{const copy={...proof};delete copy[omitted];return copy});assert.equal(run(normalized.facts,{items,projections:proofs}).matches.length,0,omitted)}
 assert.equal(run(normalized.facts,{items,projections:[]}).matches.length,0);
 facts.stockPostings=[];const noReceipt=normalizePostingProjections(facts,scope);assert.equal(noReceipt.projections.length,0);assert.equal(run(noReceipt.facts,{projections:noReceipt.projections}).matches.length,0);
});

test('currency coverage must be typed and a foreign currency is an explicit exception without ignoring competing originals',()=>{
 const facts=fixture(),links=metadata(facts);links[0].currencyAllowed=false;let result=run(facts,{linkMetadata:links});assert.equal(result.matches.length,0);assert.ok(result.exceptions.some(exception=>exception.code==='UNSUPPORTED_CURRENCY'));
 for(const value of [undefined,null,'true',1]){const rows=metadata(facts);rows[0].currencyAllowed=value;result=run(facts,{linkMetadata:rows});assert.equal(result.matches.length,0);assert.ok(result.exceptions.some(exception=>exception.code==='LINK_METADATA_UNAVAILABLE'))}
 const peer={...facts.inbound[0],id:'foreign-currency',inboxId:'foreign-currency-inbox',mark:'400000000000002'};facts.inbound.push(peer);facts.inbox.push({...facts.inbox[0],id:peer.inboxId});const competing=metadata(facts);competing[1].currencyAllowed=false;result=run(facts,{linkMetadata:competing});assert.equal(result.matches.length,0,'a foreign-currency peer cannot be omitted to make the EUR original look unique');
});
