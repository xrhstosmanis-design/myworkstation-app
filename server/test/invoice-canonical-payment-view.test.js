import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCanonicalPaymentObservations} from '../src/lib/invoice-canonical-payment-view.js';
import {observeInvoicePayments} from '../src/lib/invoice-payment-observation.js';
import {classifyInvoiceMonth,invoiceAuditMonth} from '../src/services/monthly-invoice-audit.js';

const scope={companyId:'c',storeId:'s',allocationsAvailable:true};
const fixture=(amount='14.34',difference='2.00')=>{
 const document={id:'source',companyId:'c',storeId:'s',supplierId:'supplier',supplierTaxId:'099999999',documentType:'INVOICE',documentNumber:'A 1',issueDay:'2026-10-12',totalGross:'12.34',status:'DRAFT',sourceType:'POS_OCR_DRAFT',purchaseOrderId:'order',paymentTransactionId:'payment',createdAt:'2026-10-12'};
 const alias={aliasOrderId:'alias-order',aliasDocumentId:'alias-doc',canonicalOrderId:'order',canonicalDocumentId:'source',inboxId:'inbox',mark:'400001',completed:true,auditOrderId:'order',auditDocumentId:'source',auditInboxId:'inbox',auditMark:'400001',auditAliasOrderIds:['alias-order']};
 const transaction={id:'payment',companyId:'c',storeId:'s',supplierId:'supplier',type:'SUPPLIER_PAYMENT',amount,invoiceDocumentNumber:'OCR-INCORRECT-0001',reversedAt:null,settlementConfirmed:true,settlementScopeValid:true,hasSettlement:false,settlementCount:0};
 const receipt={...alias,companyId:'c',storeId:'s',paymentTransactionId:'payment',paymentDifference:difference,requiresPaymentReview:Math.abs(Number(difference))>.05,beforeReversedAtPresent:true,paymentBefore:{id:'payment',companyId:'c',storeId:'s',supplierId:'supplier',type:'SUPPLIER_PAYMENT',amount,invoiceDocumentNumber:transaction.invoiceDocumentNumber,reversedAt:null}};
 const facts={documents:[document,{...document,id:'alias-doc',status:'MERGED',purchaseOrderId:'alias-order',paymentTransactionId:null}],orders:[{id:'order',companyId:'c',storeId:'s',supplierId:'supplier',sourceDocumentId:'source',invoiceNumber:'A 1',status:'NEW'},{id:'alias-order',companyId:'c',storeId:'s',supplierId:'supplier',sourceDocumentId:'alias-doc',invoiceNumber:'A 1',status:'MERGED'}],aliases:[alias],inbound:[{id:'official',companyId:'c',storeId:'s',inboxId:'inbox',mark:'400001',issuerVat:'099999999',series:'A',documentNumber:'1',issueDay:'2026-10-12',invoiceType:'1.1',totalGross:'12.34',draftOrderId:'order',currencyAllowed:true}],inbox:[{id:'inbox',companyId:'c',storeId:'s',status:'IN_REVIEW'}],attachments:[],jobs:[],postings:[],stockPostings:[],paymentAllocations:[]};
 const items=classifyInvoiceMonth(facts,invoiceAuditMonth('2026-10')).items;
 return {facts,items,transactions:[transaction],receipts:[receipt]};
};
const run=f=>normalizeCanonicalPaymentObservations(f.items,f.facts,f.transactions,f.receipts,scope);
const legacyFixture=()=>{
 const f=fixture(),r=f.receipts[0],t=f.transactions[0];r.paymentBefore=null;r.paymentBeforeFieldPresent=false;r.beforeReversedAtPresent=false;r.legacyBeforeValid=true;
 r.legacyBefore=[{orderId:'order',documentId:'source',supplierId:'supplier',taxId:'099999999',paymentTaxId:'099999999',paymentTransactionId:t.id,paymentTransactionIdPresent:true,paymentAmount:t.amount,paymentStoreId:'s',paymentSupplierId:'supplier',paymentType:'SUPPLIER_PAYMENT',invoiceNumber:t.invoiceDocumentNumber,documentNumber:t.invoiceDocumentNumber,paymentInvoiceNumber:null,paymentInvoiceNumberPresent:false,reversedAt:null,reversedAtPresent:true},
  {orderId:'alias-order',documentId:'alias-doc',paymentTransactionId:null,paymentTransactionIdPresent:true,paymentAmount:null,paymentStoreId:null,paymentSupplierId:null,paymentType:null,paymentTaxId:null,reversedAt:null,reversedAtPresent:true}];
 return f;
};

test('completed canonical receipt recovers unchanged existing cash number only in copied observation and retains real extra amount',()=>{
 const f=fixture(),before=JSON.stringify(f);assert.equal(f.items.length,1);assert.equal(observeInvoicePayments(f.items,f.facts,f.transactions,{available:true,allocationsAvailable:true}).items[0].payment.status,'REVIEW_REQUIRED');
 const actual=run(f);assert.notEqual(actual.transactions,f.transactions);assert.equal(actual.transactions[0].invoiceDocumentNumber,'A 1');assert.equal(actual.transactions[0].id,'payment');assert.equal(actual.transactions[0].amount,'14.34');assert.equal(JSON.stringify(f),before);
 assert.deepEqual(actual.proofs,[{itemId:f.items[0].id,transactionId:'payment',canonicalDocumentId:'source',canonicalOrderId:'order',inboxId:'inbox',mark:'400001',recordedInvoiceDocumentNumber:'OCR-INCORRECT-0001',effectiveInvoiceDocumentNumber:'A 1',paidCents:1434,invoiceCents:1234,paymentDifferenceCents:200,requiresPaymentReview:true}]);
 const observed=observeInvoicePayments(f.items,f.facts,actual.transactions,{available:true,allocationsAvailable:true});assert.equal(observed.items[0].payment.status,'OVERPAID');assert.equal(observed.items[0].payment.overpaymentCents,200);assert.equal(observed.items[0].payment.paymentCount,1);assert.deepEqual(observed.items[0].payment.transactionIds,['payment']);
});

test('explicit receipt keeps exact paid and partial results rather than hiding real monetary differences',()=>{
 for(const [amount,difference,status,remaining,extra]of [['12.34','0','PAID',0,0],['10.00','-2.34','PARTIALLY_PAID',234,0],['12.39','0.05','OVERPAID',0,5]]){
  const f=fixture(amount,difference),result=run(f);assert.equal(result.proofs.length,1);const observed=observeInvoicePayments(f.items,f.facts,result.transactions,{available:true,allocationsAvailable:true});assert.equal(observed.items[0].payment.status,status);assert.equal(observed.items[0].payment.remainingCents,remaining);assert.equal(observed.items[0].payment.overpaymentCents,extra);
 }
});

test('changed ledger, missing receipt fields or unconfirmed reversed foreign and split payments never recover a number',()=>{
 const variants={
  'ledger-number-changed':f=>f.transactions[0].invoiceDocumentNumber='OTHER 1',
  'ledger-amount-changed':f=>f.transactions[0].amount='14.35',
  'ledger-id-changed':f=>f.transactions[0].id='other',
  'ledger-type-changed':f=>f.transactions[0].type='OTHER_EXPENSE',
  'ledger-supplier-changed':f=>f.transactions[0].supplierId='other',
  'ledger-company-changed':f=>f.transactions[0].companyId='other',
  'ledger-store-changed':f=>f.transactions[0].storeId='other',
  'ledger-reversed':f=>f.transactions[0].reversedAt='2026-10-13',
  'ledger-unconfirmed':f=>f.transactions[0].settlementConfirmed=false,
  'ledger-scope-unknown':f=>f.transactions[0].settlementScopeValid=false,
  'settlement-present':f=>{f.transactions[0].hasSettlement=true;f.transactions[0].settlementCount=1},
  'allocation-present':f=>f.facts.paymentAllocations.push({transactionId:'payment',documentId:'source',amount:'12.34'}),
  'allocation-coverage-missing':f=>delete f.facts.paymentAllocations,
  'receipt-reversal-field-missing':f=>delete f.receipts[0].paymentBefore.reversedAt,
  'receipt-reversal-presence-unknown':f=>f.receipts[0].beforeReversedAtPresent=false,
  'receipt-before-amount-differs':f=>f.receipts[0].paymentBefore.amount='14.35',
  'receipt-difference-wrong':f=>f.receipts[0].paymentDifference='0',
  'receipt-review-flag-wrong':f=>f.receipts[0].requiresPaymentReview=false,
  'receipt-foreign':f=>f.receipts[0].storeId='other',
  'receipt-incomplete':f=>f.receipts[0].completed=false,
  'receipt-audit-wrong':f=>f.receipts[0].auditDocumentId='other',
  'receipt-mark-missing':f=>{f.receipts[0].mark=null;f.receipts[0].auditMark=null},
  'duplicate-transaction':f=>f.transactions.push({...f.transactions[0]}),
  'duplicate-receipt':f=>f.receipts.push({...f.receipts[0]}),
  'conflicting-receipt':f=>f.receipts.push({...f.receipts[0],paymentDifference:'0'}),
  'outside-active-claimant':f=>f.facts.documents.push({...f.facts.documents[0],id:'outside',purchaseOrderId:null}),
  'another-bound-installment':f=>f.transactions.push({...f.transactions[0],id:'installment',attachmentMimeType:'application/vnd.myworkstation.purchase-document',attachmentFilename:'source'}),
 };
 for(const [key,mutate]of Object.entries(variants)){const f=fixture();mutate(f);const before=JSON.stringify(f),result=run(f);assert.equal(result.transactions,f.transactions,key);assert.deepEqual(result.proofs,[],key);assert.equal(JSON.stringify(f),before,key)}
 const f=fixture();assert.deepEqual(normalizeCanonicalPaymentObservations(f.items,f.facts,f.transactions,f.receipts,{...scope,allocationsAvailable:false}).proofs,[]);
});

test('official identity and complete already-grouped canonical family are mandatory, never a header-only match',()=>{
 const variants={
  'official-wrong-vat':f=>f.facts.inbound[0].issuerVat='088888888',
  'official-wrong-series':f=>f.facts.inbound[0].series='B',
  'official-wrong-day':f=>f.facts.inbound[0].issueDay='2026-10-13',
  'official-wrong-gross':f=>f.facts.inbound[0].totalGross='12.35',
  'official-credit':f=>f.facts.inbound[0].invoiceType='5.1',
  'official-foreign-currency':f=>f.facts.inbound[0].currencyAllowed=false,
  'official-currency-unverified':f=>delete f.facts.inbound[0].currencyAllowed,
  'official-multiple-marks':f=>f.facts.inbound.push({...f.facts.inbound[0],id:'other',mark:'400002'}),
  'official-inbox-missing':f=>f.facts.inbox=[],
  'official-inbox-cancelled':f=>f.facts.inbox[0].status='CANCELLED',
  'official-inbox-deleted':f=>f.facts.inbox[0].status='DELETED',
  'official-not-grouped':f=>f.items[0].sources=f.items[0].sources.filter(row=>row.kind!=='MYDATA'),
  'source-not-bound':f=>f.facts.documents[0].paymentTransactionId=null,
  'source-order-backlink-wrong':f=>f.facts.documents[0].purchaseOrderId='other',
  'alias-not-merged':f=>f.facts.documents[1].status='DRAFT',
  'alias-order-not-merged':f=>f.facts.orders[1].status='NEW',
  'stale-group-order-status':f=>f.items[0].sources.find(row=>row.kind==='ORDER'&&row.id==='order').status='FINAL',
  'alias-not-grouped':f=>f.items[0].sources=f.items[0].sources.filter(row=>row.id!=='alias-doc'),
  'alias-family-missing':f=>f.facts.aliases=[],
  'alias-completion-wrong':f=>f.facts.aliases[0].completed=false,
  'alias-receipt-id-wrong':f=>f.facts.aliases[0].auditAliasOrderIds=['other'],
  'duplicate-canonical-source':f=>f.facts.documents.push({...f.facts.documents[0]}),
  'ambiguous-group':f=>f.items.push({...f.items[0],id:'duplicate-group'}),
  'identity-review':f=>f.items[0].categories.push('IDENTITY_OR_LINK_REVIEW'),
 };
 for(const [key,mutate]of Object.entries(variants)){const f=fixture();mutate(f);const result=run(f);assert.deepEqual(result.proofs,[],key);assert.equal(result.transactions,f.transactions,key)}
});

test('consistent multiple aliases in one canonical family give one proof and one payment',()=>{
 const f=fixture(),nextAlias={...f.facts.aliases[0],aliasOrderId:'alias-two',aliasDocumentId:'doc-two',auditAliasOrderIds:['alias-order','alias-two']};f.facts.aliases[0].auditAliasOrderIds=['alias-order','alias-two'];f.facts.aliases.push(nextAlias);
 f.facts.documents.push({...f.facts.documents[1],id:'doc-two',purchaseOrderId:'alias-two'});f.facts.orders.push({...f.facts.orders[1],id:'alias-two',sourceDocumentId:'doc-two'});
 f.receipts[0].auditAliasOrderIds=['alias-order','alias-two'];f.receipts.push({...f.receipts[0],aliasOrderId:'alias-two',aliasDocumentId:'doc-two'});f.items[0].sources.push({kind:'DOCUMENT',id:'doc-two',status:'MERGED'},{kind:'ORDER',id:'alias-two',status:'MERGED'});
 const result=run(f);assert.equal(result.proofs.length,1);assert.equal(result.transactions.length,1);assert.equal(observeInvoicePayments(f.items,f.facts,result.transactions,{available:true,allocationsAvailable:true}).items[0].payment.paymentCount,1);
 f.receipts[1].paymentBefore={...f.receipts[1].paymentBefore,invoiceDocumentNumber:'CONFLICT'};assert.deepEqual(run(f).proofs,[]);
});

test('an already matching recorded number needs no reinterpretation or extra proof',()=>{
 const f=fixture();f.transactions[0].invoiceDocumentNumber='A 0001';f.receipts[0].paymentBefore.invoiceDocumentNumber='A 0001';const result=run(f);assert.equal(result.transactions,f.transactions);assert.deepEqual(result.proofs,[]);
});

test('original legacy before pair independently proves the same unchanged payment without a modern paymentBefore field',()=>{
 const f=legacyFixture(),before=JSON.stringify(f),result=run(f);assert.equal(result.proofs.length,1);assert.equal(result.proofs[0].receiptBasis,'LEGACY_BEFORE_PAIR');assert.equal(result.transactions[0].invoiceDocumentNumber,'A 1');assert.equal(result.transactions[0].amount,'14.34');assert.equal(JSON.stringify(f),before);
 const observed=observeInvoicePayments(f.items,f.facts,result.transactions,{available:true,allocationsAvailable:true});assert.equal(observed.items[0].payment.status,'OVERPAID');assert.equal(observed.items[0].payment.overpaymentCents,200);assert.equal(observed.items[0].payment.paymentCount,1);
});

test('legacy before recovery requires complete typed pair IDs and immutable scoped payment snapshot, never fallback from malformed modern proof',()=>{
 const variants={
  'modern-field-present-invalid':f=>f.receipts[0].paymentBeforeFieldPresent=true,
  'modern-object-malformed':f=>f.receipts[0].paymentBefore={id:'payment'},
  'modern-object-contradicts-absent-flag':f=>{f.receipts[0].paymentBefore={...f.transactions[0]};f.receipts[0].beforeReversedAtPresent=true},
  'modern-presence-unknown':f=>delete f.receipts[0].paymentBeforeFieldPresent,
  'legacy-type-unknown':f=>f.receipts[0].legacyBeforeValid=false,
  'legacy-pair-missing':f=>f.receipts[0].legacyBefore.pop(),
  'legacy-extra-pair':f=>f.receipts[0].legacyBefore.push({...f.receipts[0].legacyBefore[1],orderId:'other'}),
  'legacy-paid-wrong-order':f=>f.receipts[0].legacyBefore[0].orderId='other',
  'legacy-paid-wrong-document':f=>f.receipts[0].legacyBefore[0].documentId='other',
  'legacy-peer-wrong-document':f=>f.receipts[0].legacyBefore[1].documentId='other',
  'legacy-peer-paid':f=>f.receipts[0].legacyBefore[1].paymentTransactionId='payment',
  'legacy-peer-amount-unknown':f=>delete f.receipts[0].legacyBefore[1].paymentAmount,
  'legacy-reversal-presence-missing':f=>f.receipts[0].legacyBefore[0].reversedAtPresent=false,
  'legacy-reversal-field-missing':f=>delete f.receipts[0].legacyBefore[0].reversedAt,
  'legacy-reversed':f=>f.receipts[0].legacyBefore[0].reversedAt='2026-10-13',
  'legacy-payment-id-presence-unknown':f=>f.receipts[0].legacyBefore[0].paymentTransactionIdPresent=false,
  'legacy-company-conflict':f=>f.receipts[0].legacyBefore[0].companyId='foreign',
  'legacy-store-conflict':f=>f.receipts[0].legacyBefore[0].paymentStoreId='foreign',
  'legacy-supplier-conflict':f=>f.receipts[0].legacyBefore[0].paymentSupplierId='foreign',
  'legacy-supplier-vat-conflict':f=>f.receipts[0].legacyBefore[0].paymentTaxId='088888888',
  'legacy-supplier-vat-missing':f=>delete f.receipts[0].legacyBefore[0].taxId,
  'legacy-amount-conflict':f=>f.receipts[0].legacyBefore[0].paymentAmount='14.35',
  'legacy-number-conflict':f=>f.receipts[0].legacyBefore[0].documentNumber='OTHER',
  'legacy-order-number-conflict':f=>f.receipts[0].legacyBefore[0].invoiceNumber='OTHER',
  'legacy-payment-number-present-invalid':f=>{f.receipts[0].legacyBefore[0].paymentInvoiceNumberPresent=true;f.receipts[0].legacyBefore[0].paymentInvoiceNumber='OTHER'},
  'current-ledger-number-changed':f=>f.transactions[0].invoiceDocumentNumber='OTHER',
  'current-ledger-amount-changed':f=>f.transactions[0].amount='14.35',
  'current-ledger-reversed':f=>f.transactions[0].reversedAt='2026-10-13',
 };
 for(const [key,mutate]of Object.entries(variants)){const f=legacyFixture();mutate(f);const before=JSON.stringify(f),result=run(f);assert.deepEqual(result.proofs,[],key);assert.equal(result.transactions,f.transactions,key);assert.equal(JSON.stringify(f),before,key)}
});
