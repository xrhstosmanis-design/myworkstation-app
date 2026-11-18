import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePostingProjections,withPostingProjectionProvenance} from '../src/lib/invoice-posting-projection-view.js';
import {classifyInvoiceMonth,invoiceAuditMonth} from '../src/services/monthly-invoice-audit.js';
import {observeInvoicePayments} from '../src/lib/invoice-payment-observation.js';

const scope={companyId:'c',storeId:'s'};
const fixture=()=>({
 documents:[
  {id:'source',...scope,purchaseOrderId:'order',sourceType:'POS_OCR_DRAFT',status:'DRAFT',documentType:'INVOICE',documentNumber:'A 001',issueDay:'2026-10-02',totalGross:'12.34',supplierId:'supplier',supplierTaxId:'099999999',paymentTransactionId:'paid',createdAt:'2026-10-02'},
  {id:'order',...scope,purchaseOrderId:null,sourceType:'PURCHASE_ORDER',status:'APPROVED',documentType:'INVOICE',documentNumber:'A 1',issueDay:'2026-10-05',totalGross:'12.3432',supplierId:'supplier',supplierTaxId:'099999999',paymentTransactionId:null,createdAt:'2026-10-05'}
 ],
 orders:[{id:'order',...scope,sourceDocumentId:'source',supplierId:'supplier',invoiceNumber:'A 1',status:'INVOICED',createdAt:'2026-10-05'}],
 postings:[{orderId:'order',purchaseDocumentId:'order',companyId:'c'}],
 stockPostings:[{orderId:'order',sourceDocumentId:'source',postedDocumentId:'order',path:'PURCHASE_ORDER',...scope}],
 inbound:[],inbox:[],jobs:[],attachments:[],aliases:[]
});
const normalize=facts=>normalizePostingProjections(facts,scope);

test('proven posting inherits only original invoice date and exact amount in an immutable ordinary view',()=>{
 const facts=fixture(),before=JSON.stringify(facts),result=normalize(facts);
 assert.equal(JSON.stringify(facts),before);assert.notEqual(result.facts,facts);assert.notEqual(result.facts.documents,facts.documents);assert.equal(result.facts.documents[0],facts.documents[0]);
 assert.deepEqual(result.facts.documents[1],{...facts.documents[1],issueDay:'2026-10-02',totalGross:'12.34'});
 assert.deepEqual(result.projections,[{sourceDocumentId:'source',projectionDocumentId:'order',sourceIssueDay:'2026-10-02',sourceTotalGross:'12.34',recordedIssueDay:'2026-10-05',recordedTotalGross:'12.3432'}]);
 const raw=classifyInvoiceMonth(facts,invoiceAuditMonth('2026-10')),view=classifyInvoiceMonth(result.facts,invoiceAuditMonth('2026-10'));
 assert.equal(raw.counts.logicalRecords,2);assert.equal(raw.counts.unposted,1);assert.equal(view.counts.logicalRecords,1);assert.equal(view.counts.unposted,0);assert.equal(view.items[0].status,'POSTED');
 const enriched=withPostingProjectionProvenance(view.items,result.projections);assert.equal(enriched[0].postingProjections.length,1);assert.deepEqual(enriched[0].postingProjections,result.projections);assert.equal(view.items[0].postingProjections,undefined);
 const payment=observeInvoicePayments(enriched,result.facts,[{id:'paid',...scope,supplierId:'supplier',type:'SUPPLIER_PAYMENT',invoiceDocumentNumber:'A 1',amount:'12.34',settlementConfirmed:true}],{available:true});
 assert.equal(payment.items[0].payment.status,'PAID');assert.equal(payment.items[0].payment.paidCents,1234);assert.deepEqual(payment.items[0].postingProjections,result.projections);assert.deepEqual(classifyInvoiceMonth(facts,invoiceAuditMonth('2026-10')),raw);
});

test('explicitly backlinked approved projection is supported without making a second logical receipt',()=>{
 const facts=fixture();facts.documents[1].id='target';facts.documents[1].purchaseOrderId='order';facts.postings[0].purchaseDocumentId='target';facts.stockPostings[0].postedDocumentId='target';
 const result=normalize(facts),view=classifyInvoiceMonth(result.facts,invoiceAuditMonth('2026-10'));assert.equal(result.projections.length,1);assert.equal(view.counts.logicalRecords,1);assert.equal(view.counts.unposted,0);
});

test('cross-month posting follows original invoice month and never moves raw projection or unrelated originals',()=>{
 for(const [sourceDay,postingDay]of [['2026-09-30','2026-10-05'],['2026-10-31','2026-11-05']]){
  const facts=fixture();facts.documents[0].issueDay=sourceDay;facts.documents[1].issueDay=postingDay;
  facts.documents.push({...facts.documents[0],id:'independent',purchaseOrderId:null,paymentTransactionId:null,issueDay:postingDay});
  const before=JSON.stringify(facts),result=normalize(facts),originalMonth=classifyInvoiceMonth(result.facts,invoiceAuditMonth(sourceDay.slice(0,7))),postingMonth=classifyInvoiceMonth(result.facts,invoiceAuditMonth(postingDay.slice(0,7)));
  assert.equal(originalMonth.counts.logicalRecords,1);assert.equal(originalMonth.counts.unposted,0);assert.equal(originalMonth.items[0].issueDay,sourceDay);
  assert.equal(postingMonth.counts.logicalRecords,1);assert.equal(postingMonth.items[0].id,'doc:independent');assert.equal(postingMonth.counts.unposted,1);assert.equal(JSON.stringify(facts),before);
 }
});

test('exact existing five-cent proof bound includes boundary and rejects excess or malformed amounts',()=>{
 for(const [gross,accepted]of [['12.39',true],['12.39000001',false],['12.29',true],['12.28999999',false],['0',false],['-12.34',false],['NaN',false],[12.34,false],['12.340000001',false]]){
  const facts=fixture();facts.documents[1].totalGross=gross;assert.equal(normalize(facts).projections.length,accepted?1:0,String(gross));
 }
 const credit=fixture();credit.documents.forEach(d=>d.documentType='CREDIT_NOTE');assert.equal(normalize(credit).projections.length,1);
});

test('missing, foreign, contradictory or competing proof cannot normalize invoice identity',()=>{
 const variants={
  'duplicate-source-id':f=>f.documents.push({...f.documents[0]}),
  'duplicate-target-id':f=>f.documents.push({...f.documents[1]}),
  'duplicate-order-id':f=>f.orders.push({...f.orders[0]}),
  'competing-source-order':f=>f.orders.push({...f.orders[0],id:'other'}),
  'target-claimed-as-source':f=>f.orders.push({...f.orders[0],id:'other',sourceDocumentId:'order'}),
  'duplicate-posting':f=>f.postings.push({...f.postings[0]}),
  'target-posted-by-other-order':f=>f.postings.push({...f.postings[0],orderId:'other'}),
  'source-used-as-posting-target':f=>f.postings.push({orderId:'other',purchaseDocumentId:'source'}),
  'missing-posting':f=>f.postings=[],
  'missing-stock':f=>f.stockPostings=[],
  'duplicate-stock':f=>f.stockPostings.push({...f.stockPostings[0]}),
  'conflicting-order-stock':f=>f.stockPostings.push({...f.stockPostings[0],sourceDocumentId:'other'}),
  'conflicting-source-stock':f=>f.stockPostings.push({...f.stockPostings[0],orderId:'other'}),
  'conflicting-target-stock':f=>f.stockPostings.push({...f.stockPostings[0],orderId:'other',sourceDocumentId:'other'}),
  'source-was-another-stock-target':f=>f.stockPostings.push({...f.stockPostings[0],orderId:'other',sourceDocumentId:'other',postedDocumentId:'source'}),
  'target-is-another-stock-source':f=>f.stockPostings.push({...f.stockPostings[0],orderId:'other',sourceDocumentId:'order',postedDocumentId:'other'}),
  'extra-document-backlink':f=>f.documents.push({...f.documents[1],id:'other',purchaseOrderId:'order'}),
  'source-backlink':f=>f.documents[0].purchaseOrderId='other',
  'target-backlink':f=>f.documents[1].purchaseOrderId='other',
  'target-shape':f=>{f.documents[1].id='other';f.postings[0].purchaseDocumentId='other';f.stockPostings[0].postedDocumentId='other'},
  'source-is-projection':f=>f.documents[0].sourceType='PURCHASE_ORDER',
  'inactive-source':f=>f.documents[0].status='MERGED',
  'inactive-order':f=>f.orders[0].status='MERGED',
  'unconfirmed-order':f=>f.orders[0].status='FINAL',
  'unapproved-target':f=>f.documents[1].status='DRAFT',
  'target-source-type':f=>f.documents[1].sourceType='MANUAL',
  'unknown-source-type':f=>f.documents[0].documentType='UNKNOWN',
  'different-type':f=>f.documents[1].documentType='CREDIT_NOTE',
  'different-series':f=>f.documents[1].documentNumber='B 1',
  'different-order-number':f=>f.orders[0].invoiceNumber='A 2',
  'different-supplier':f=>f.documents[1].supplierId='other',
  'different-order-supplier':f=>f.orders[0].supplierId='other',
  'missing-vat':f=>f.documents[0].supplierTaxId=null,
  'different-vat':f=>f.documents[1].supplierTaxId='088888888',
  'invalid-source-date':f=>f.documents[0].issueDay='2026-02-30',
  'invalid-target-date':f=>f.documents[1].issueDay=null,
  'wrong-path':f=>f.stockPostings[0].path='DIRECT',
  'wrong-stock-source':f=>f.stockPostings[0].sourceDocumentId='other',
  'wrong-stock-target':f=>f.stockPostings[0].postedDocumentId='other',
  'self-source-target':f=>{f.orders[0].sourceDocumentId='order';f.stockPostings[0].sourceDocumentId='order'},
 };
 for(const[key,mutate]of Object.entries(variants)){const facts=fixture();mutate(facts);const before=JSON.stringify(facts),result=normalize(facts);assert.equal(result.projections.length,0,key);assert.equal(result.facts,facts,key);assert.equal(JSON.stringify(facts),before,key)}
 for(const array of ['documents','orders','postings','stockPostings'])for(const field of ['companyId','storeId']){const facts=fixture();facts[array][0][field]='foreign';assert.equal(normalize(facts).projections.length,0,array+field)}
 assert.equal(normalizePostingProjections(fixture()).projections.length,0);
});
