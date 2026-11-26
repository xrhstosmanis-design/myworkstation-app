import test from 'node:test';
import assert from 'node:assert/strict';
import {planManualPaymentAllocation as plan} from '../src/lib/manual-payment-allocation-plan.js';
const fixture=()=>({payment:{companyId:'c',storeId:'s',supplierId:'old',transactionSupplierId:'old',status:'PENDING_REVIEW',paymentMethod:'CASH_SHIFT',transactionMethod:'CASH_SHIFT',type:'SUPPLIER_PAYMENT',sessionId:'shift',amount:90.17,existingAllocations:[]},targetSupplier:{id:'new',companyId:'c',active:true},confirmSupplierChange:true,documents:[{id:'d',companyId:'c',storeId:'s',supplierId:'new',status:'APPROVED',documentType:'INVOICE',settlementMode:null,totalGross:90.17,reservedAmount:0,duplicateRisk:false,canonicalVerified:true}],allocations:[{purchaseDocumentId:'d',amount:90.17}]});
test('exact existing cash payment: confirmed without cash or stock delta',()=>{const p=plan(fixture());assert.equal(p.status,'CONFIRMED');assert.equal(p.difference,0);assert.equal(p.cashDelta,0);assert.equal(p.stockDelta,0)});
test('one euro inclusive; 1.01 remains pending',()=>{for(const [amount,status] of [[89.17,'CONFIRMED'],[89.16,'PENDING_REVIEW']]){const f=fixture();f.allocations[0].amount=amount;assert.equal(plan(f).status,status)}});
test('multiple distinct invoices allocate once',()=>{const f=fixture();f.documents[0].totalGross=40;f.documents.push({...f.documents[0],id:'e',totalGross:50.17});f.allocations=[{purchaseDocumentId:'d',amount:40},{purchaseDocumentId:'e',amount:50.17}];assert.equal(plan(f).allocatedAmount,90.17)});
test('reject unsafe scope, bank, reversal, existing allocation and supplier switch without approval',()=>{for(const [mutate,error] of [[f=>f.documents[0].storeId='other','DOCUMENT_NOT_ELIGIBLE'],[f=>f.targetSupplier.companyId='other','INVALID_SCOPE'],[f=>f.payment.bank=true,'PAYMENT_NOT_ELIGIBLE'],[f=>f.payment.paymentMethod='BANK_TRANSFER','PAYMENT_NOT_ELIGIBLE'],[f=>f.payment.reversedAt='now','PAYMENT_NOT_ELIGIBLE'],[f=>f.payment.existingAllocations=[{amount:10}],'SUPPLIER_CHANGE_WITH_EXISTING_ALLOCATIONS'],[f=>f.confirmSupplierChange=false,'SUPPLIER_CHANGE_REQUIRES_CONFIRMATION']]){const f=fixture();mutate(f);assert.throws(()=>plan(f),new RegExp(error))}});
test('reject duplicate document, paid document, ambiguous canonical and reserved balance',()=>{for(const [mutate,error] of [[f=>f.allocations.push({...f.allocations[0]}),'DUPLICATE_DOCUMENT'],[f=>f.documents[0].paymentTransactionId='paid','DOCUMENT_NOT_ELIGIBLE'],[f=>f.documents[0].canonicalVerified=false,'DOCUMENT_NOT_ELIGIBLE'],[f=>f.documents[0].duplicateRisk=true,'DOCUMENT_NOT_ELIGIBLE'],[f=>f.documents[0].reservedAmount=1,'INSUFFICIENT_DOCUMENT_BALANCE'],[f=>f.documents.push({...f.documents[0]}),'DOCUMENT_NOT_UNIQUE']]){const f=fixture();mutate(f);assert.throws(()=>plan(f),new RegExp(error))}});
test('reject overpayment allocation and fractions of cents',()=>{let f=fixture();f.documents[0].totalGross=100;f.allocations[0].amount=91;assert.throws(()=>plan(f),/ALLOCATION_EXCEEDS_PAYMENT/);f=fixture();f.allocations[0].amount=90.171;assert.throws(()=>plan(f),/INVALID_AMOUNT/)});

test('adds only the unallocated remainder while preserving the original allocation',()=>{
 const f=fixture();
 f.payment.amount=600;
 f.payment.existingAllocations=[{purchaseDocumentId:'first',amount:437.30}];
 f.targetSupplier.id=f.documents[0].supplierId='old';
 f.documents[0].totalGross=200;
 f.allocations[0].amount=162.70;
 const result=plan(f);
 assert.equal(result.previouslyAllocatedAmount,437.30);
 assert.equal(result.allocatedAmount,600);
 assert.equal(result.difference,0);
 assert.equal(result.status,'CONFIRMED');
 f.allocations[0].amount=162.71;
 assert.throws(()=>plan(f),/ALLOCATION_EXCEEDS_PAYMENT/);
});
test('an exact bank allocation still requires proof',()=>{
 const f=fixture();
 Object.assign(f.payment,{paymentMethod:'BANK_TRANSFER',transactionMethod:'BANK_TRANSFER',sessionId:null,bank:true});
 assert.equal(plan(f).status,'PENDING_REVIEW');
 assert.equal(plan(f).missingBankProof,true);
 f.payment.hasBankProof=true;
 assert.equal(plan(f).status,'CONFIRMED');
});
