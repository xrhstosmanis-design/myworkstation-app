import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAppliedCreditForMerge} from '../src/lib/invoice-common-draft.js';
const row={companyId:'c',storeId:'s',invoiceType:'5.1',issuerVat:'099999999',series:'CN',documentNumber:'40',issueDate:'2026-10-12',totalGross:7};
const candidate={orderId:'credit-order',documentId:'credit',documentType:'CREDIT_NOTE',exact:true,paymentTransactionId:'negative',supplierId:'sup',documentSupplierId:'sup',taxId:row.issuerVat,paymentTaxId:row.issuerVat,paymentAmount:-7,status:'NEW'};
function fixture(mode='OFFSET'){
 const payment={id:'negative',companyId:'c',storeId:'s',supplierId:'sup',type:'SUPPLIER_PAYMENT',amount:-7,reversedAt:null,invoiceDocumentNumber:'CN 0040',attachmentFilename:'credit',sessionId:'original-shift',subtractFromShift:true,paymentMethod:'CASH_SHIFT',actorId:'original-operator'};
 const document={id:'credit',companyId:'c',storeId:'s',supplierId:'sup',purchaseOrderId:'credit-order',documentType:'CREDIT_NOTE',documentNumber:'CN 0040',documentDate:'2026-10-12',totalGross:7,status:'DRAFT',settlementMode:'PAID'};
 const result={ok:true,transactionId:'negative',creditDocumentId:'credit',mode,creditAmount:7,negativePaymentAmount:-7,invoicePaymentId:mode==='OFFSET'?'positive':null};
 const details={...result,supplierId:'sup',creditDocumentNumber:'CN 0040',invoiceDocumentNumber:mode==='OFFSET'?'INV 123':null,invoiceGrossPayment:mode==='OFFSET'?50:null,previousAppliedAmount:0,confirmOriginal:true,sessionId:'original-shift',idempotencyKey:'original-request',requestHash:'original-hash',result:{...result}};
 const audit={id:'audit',companyId:'c',storeId:'s',actorId:'original-operator',eventType:'SUPPLIER_CREDIT_CASH_APPLIED',details};
 const positive={id:'positive',amount:50,type:'SUPPLIER_PAYMENT',reversedAt:null,supplierId:'sup',sessionId:'original-shift',subtractFromShift:true,paymentMethod:'CASH_SHIFT',invoiceDocumentNumber:'INV 123'};
 const f={payment,document,audit,positive,duplicate:false,table:true,calls:[]};
 f.db={$queryRaw:async(strings,...values)=>{const sql=strings.join('?');f.calls.push({sql,values});if(sql.includes('to_regclass'))return [{auditExists:f.table}];if(sql.includes('row_to_json(d)'))return [{payment,document}];if(sql.includes('row_to_json(a)'))return f.duplicate?[{audit},{audit:structuredClone(audit)}]:[{audit}];if(sql.includes('row_to_json(t)'))return [{payment:positive}];throw Error('Unexpected SQL '+sql);},$executeRaw:()=>{throw Error('Credit proof must never write')}};return f;
}
test('actual applied-credit proof accepts original OFFSET/CASH_RETURN without changing any input or writing',async()=>{
 for(const mode of ['OFFSET','CASH_RETURN']){const f=fixture(mode),before=JSON.stringify([row,candidate,f.payment,f.document,f.audit,f.positive]);const p=await inspectAppliedCreditForMerge(f.db,row,candidate);assert.equal(p.verified,true);assert.match(p.version,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify([row,candidate,f.payment,f.document,f.audit,f.positive]),before);assert.ok(f.calls.every(q=>!q.sql.includes('UPDATE')&&!q.sql.includes('INSERT')));}
});
test('actual credit proof refuses sign, original identity, partial/ambiguous/reversed and unsupported offset evidence',async()=>{
 const changes=[f=>f.payment.amount=7,f=>f.payment.amount=-6,f=>f.payment.reversedAt='2026-11-03',f=>f.payment.attachmentFilename='other',f=>f.payment.supplierId='other',f=>f.payment.invoiceDocumentNumber='OTHER 40',f=>f.payment.actorId=null,f=>f.document.id='other',f=>f.document.purchaseOrderId='other',f=>f.document.documentNumber='CN 41',f=>f.document.documentDate='2026-10-13',f=>f.document.status='APPROVED',f=>f.document.totalGross=8,f=>f.audit.details.creditDocumentId='other',f=>f.audit.details.creditDocumentNumber='CN 40',f=>f.audit.details.transactionId='other',f=>f.audit.details.mode='UNKNOWN',f=>f.audit.actorId='other',f=>f.audit.details.result.creditAmount=6,f=>f.audit.details.result.mode='CASH_RETURN',f=>f.audit.details.previousAppliedAmount=null,f=>f.audit.details.previousAppliedAmount=49,f=>f.positive.amount=49,f=>f.positive.reversedAt='2026-11-03',f=>f.positive.sessionId='other',f=>f.positive.invoiceDocumentNumber='INV 124',f=>f.duplicate=true,f=>f.table=false];
 for(const change of changes){const f=fixture();change(f);assert.equal((await inspectAppliedCreditForMerge(f.db,row,candidate)).verified,false,String(change));}
 const f=fixture();for(const change of [{invoiceType:'1.1'},{totalGross:0}])assert.equal((await inspectAppliedCreditForMerge(f.db,{...row,...change},candidate)).verified,false);
 for(const change of [{exact:false},{documentType:'INVOICE'},{taxId:'other'},{documentSupplierId:'other'}])assert.equal((await inspectAppliedCreditForMerge(f.db,row,{...candidate,...change})).verified,false);
});
test('proof fingerprint changes when the original offset transaction or application audit changes',async()=>{
 const f=fixture(),a=await inspectAppliedCreditForMerge(f.db,row,candidate);f.positive.actorName='Different stored evidence';const b=await inspectAppliedCreditForMerge(f.db,row,candidate);assert.equal(b.verified,true);assert.notEqual(a.version,b.version);f.audit.details.reason='Different stored evidence';assert.notEqual((await inspectAppliedCreditForMerge(f.db,row,candidate)).version,b.version);
});
