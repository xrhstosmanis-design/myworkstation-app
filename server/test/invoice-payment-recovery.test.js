import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {invoicePaymentRecoveryPlan as plan} from '../src/lib/invoice-payment-recovery.js';

const scope={companyId:'company',storeId:'store'};
const payment={...scope,id:'payment',type:'SUPPLIER_PAYMENT',amount:'12.40',supplierId:'supplier',invoiceDocumentNumber:'ΆΒ-001',documentDate:'2026-11-21',paymentMethod:'CASH_SHIFT',subtractFromShift:true,sessionId:'original-closed-shift'};
const settlement={...scope,id:'settlement',transactionId:'payment',supplierId:'supplier',status:'CONFIRMED'};
const page=bytes=>({mimeType:'image/jpeg',checksum:crypto.createHash('sha256').update(bytes).digest('hex'),dataUrl:'data:image/jpeg;base64,'+Buffer.from(bytes).toString('base64')});
const original={...scope,transactionId:'payment',supplierId:'supplier',sourceKind:'PLAIN_CAPTURE',proofId:'capture',documentNumber:'ΑΒ001',documentDate:'2026-11-21',totalGross:12.40,pages:[page('first original page'),page('second original page')]};
const base=()=>structuredClone({scope,payment,settlement,original});
const checkReview=(input,reason)=>assert.deepEqual(plan(input),{state:'REVIEW_REQUIRED',reason,canCreatePayment:false,canPostStock:false});

test('two original pages enable only explicit assistant request and preserve inputs',()=>{
  const input=base(),before=structuredClone(input),p=plan(input);
  assert.equal(p.state,'REQUEST_ASSISTANT');assert.equal(p.transactionId,payment.id);assert.equal(p.amountCents,1240);assert.deepEqual(p.pageChecksums,original.pages.map(p=>p.checksum));assert.equal(p.canCreatePayment,false);assert.equal(p.canPostStock,false);assert.deepEqual(input,before);
});
test('an existing expense first needs scoped supplier association, never AI or payment',()=>{
  const p={...payment,type:'OTHER_EXPENSE',supplierId:null,invoiceDocumentNumber:null};
  const input={scope,payment:p,review:{...scope,transactionId:p.id,status:'PENDING_REVIEW'}};
  assert.equal(plan(input).state,'ASSOCIATE_SUPPLIER');
  checkReview({...input,settlement},'EXPENSE_ALREADY_LINKED');
  checkReview({...input,review:{...input.review,status:'CONFIRMED'}},'EXPENSE_REVIEW');
});
test('an unconfirmed advance remains a separate prerequisite even with photos',()=>{
  const input=base();input.settlement.status='PENDING_REVIEW';assert.equal(plan(input).state,'CONFIRM_ADVANCE');
  delete input.original;assert.equal(plan(input).state,'CONFIRM_ADVANCE');
  input.settlement.status='CONFIRMED';assert.equal(plan(input).state,'UPLOAD_ORIGINAL');
});
test('foreign store or company records fail before prerequisites or any original decode',()=>{
  for(const key of ['payment','settlement','original'])for(const field of ['storeId','companyId']){
    const input=base();input[key][field]='foreign';checkReview(input,key==='payment'?'PAYMENT_SCOPE':'RELATED_SCOPE');
  }
});
test('wrong transaction or supplier cannot be reused',()=>{
  for(const [record,field] of [['settlement','transactionId'],['settlement','supplierId'],['original','transactionId'],['original','supplierId']]){
    const input=base();input[record][field]='another';checkReview(input,record==='settlement'?'SETTLEMENT_IDENTITY':'RELATED_IDENTITY');
  }
});
test('missing linkage is not treated as matching the original payment',()=>{
  for(const field of ['transactionId','supplierId']){const input=base();delete input.original[field];checkReview(input,'RELATED_IDENTITY');}
  const input=base();input.job={...scope,id:'job',supplierId:'supplier',status:'PROCESSING'};checkReview(input,'RELATED_IDENTITY');
});
test('reversal and invalid financial values never become a new payment',()=>{
  for(const amount of [0,-1,'NaN','Infinity',Infinity,1.234,'12,40','',null,true,1000000000]){const input=base();input.payment.amount=amount;checkReview(input,'PAYMENT_INELIGIBLE');}
  const input=base();input.payment.reversedAt='2026-11-21';checkReview(input,'PAYMENT_INELIGIBLE');
});
test('changed or malformed original bytes fail closed',()=>{
  for(const change of [p=>p.checksum='0'.repeat(64),p=>p.dataUrl+='!',p=>p.mimeType='text/html',p=>p.dataUrl=p.dataUrl.replace('image/jpeg','image/png')]){
    const input=base();change(input.original.pages[0]);checkReview(input,'ORIGINAL_INTEGRITY');
  }
});
test('page limits and mixed PDF are rejected without silently dropping pages',()=>{
  for(const pages of [[],Array.from({length:6},()=>page('page')),[{...page('pdf'),mimeType:'application/pdf'},page('other')]]){const input=base();input.original.pages=pages;checkReview(input,'ORIGINAL_INTEGRITY');}
});
test('different amount, date or number on captured original needs review',()=>{
  for(const [field,value] of [['totalGross',12.41],['documentDate','2026-11-20'],['documentNumber','other']]){const input=base();input.original[field]=value;checkReview(input,'ORIGINAL_IDENTITY');}
});
test('invalid calendar dates cannot satisfy matching identity',()=>{
  for(const value of ['bad','2026-02-30',new Date(NaN),'']){const input=base();input.payment.documentDate=value;input.original.documentDate=value;checkReview(input,'ORIGINAL_IDENTITY');}
});
test('retry opens the same linked draft and never asks for another assistant',()=>{
  const input=base();input.draft={...scope,id:'draft',status:'DRAFT',documentType:'INVOICE',paymentTransactionId:'payment',supplierId:'supplier',documentNumber:'ΑΒ001',documentDate:'2026-11-21',totalGross:12.4};
  input.job={...scope,id:'job',supplierId:'supplier',paymentTransactionId:'payment',purchaseDocumentId:'draft',status:'AWAITING_APPROVAL'};
  assert.equal(plan(input).state,'OPEN_EXISTING_DRAFT');assert.equal(plan(input).purchaseDocumentId,'draft');
  input.retainedDraftId='another';checkReview(input,'DRAFT_CONFLICT');
});
test('a deliberately absent/deleted draft is never recreated',()=>{
  const input=base();input.retainedDraftId='deleted';checkReview(input,'DRAFT_MISSING');
  delete input.retainedDraftId;input.job={...scope,id:'job',supplierId:'supplier',paymentTransactionId:'payment',purchaseDocumentId:'deleted'};checkReview(input,'DRAFT_MISSING');
});
test('existing in-flight job is reused; failure is not silently retried as a new job',()=>{
  const input=base();input.job={...scope,id:'job',supplierId:'supplier',paymentTransactionId:'payment',status:'PROCESSING'};assert.equal(plan(input).state,'OPEN_EXISTING_JOB');assert.equal(plan(input).jobId,'job');
  input.job.status='FAILED';checkReview(input,'JOB_REVIEW');
});
