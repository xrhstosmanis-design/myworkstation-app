// Pure validation for existing cash settlements. No DB writes.
const cents=v=>{const n=Number(v);if(v===null||v===undefined||v===''||!Number.isFinite(n)||!Number.isSafeInteger(Math.round(n*100))||Math.abs(n*100-Math.round(n*100))>0.00001)throw new Error('INVALID_AMOUNT');return Math.round(n*100)};
const fail=code=>{throw new Error(code)};
export function planManualPaymentAllocation({payment,documents,allocations,targetSupplier,confirmSupplierChange=false}){
 if(!payment||!targetSupplier?.active||!payment.companyId||!payment.storeId||targetSupplier.companyId!==payment.companyId)fail('INVALID_SCOPE');
 if(!['PENDING_REVIEW','DISCREPANCY'].includes(payment.status)||payment.paymentMethod!=='CASH_SHIFT'||payment.transactionMethod!=='CASH_SHIFT'||payment.type!=='SUPPLIER_PAYMENT'||!payment.sessionId||payment.reversedAt||payment.bank||payment.hasDirectDocument||payment.supplierId!==payment.transactionSupplierId)fail('PAYMENT_NOT_ELIGIBLE');
 if(!Array.isArray(payment.existingAllocations)||payment.existingAllocations.length)fail('EXISTING_ALLOCATIONS_REQUIRE_SEPARATE_REVIEW');
 if(payment.supplierId!==targetSupplier.id&&confirmSupplierChange!==true)fail('SUPPLIER_CHANGE_REQUIRES_CONFIRMATION');
 if(!Array.isArray(allocations)||!allocations.length||allocations.length>80||!Array.isArray(documents))fail('INVALID_SELECTION');
 const paid=cents(payment.amount);if(paid<=0)fail('INVALID_AMOUNT');
 const ids=new Set();let total=0;
 const normalized=allocations.map(a=>{
  if(!a?.purchaseDocumentId||ids.has(a.purchaseDocumentId))fail('DUPLICATE_DOCUMENT');
  ids.add(a.purchaseDocumentId);
  const matches=documents.filter(d=>d.id===a.purchaseDocumentId);
  if(matches.length!==1)fail('DOCUMENT_NOT_UNIQUE');
  const d=matches[0];
  if(d.companyId!==payment.companyId||d.storeId!==payment.storeId||d.supplierId!==targetSupplier.id||d.status!=='APPROVED'||d.documentType!=='INVOICE'||d.paymentTransactionId||d.duplicateRisk!==false||d.canonicalVerified!==true||!['CREDIT',null].includes(d.settlementMode))fail('DOCUMENT_NOT_ELIGIBLE');
  const requested=cents(a.amount),gross=cents(d.totalGross),reserved=cents(d.reservedAmount);
  if(requested<=0||gross<=0||reserved<0||requested>gross-reserved)fail('INSUFFICIENT_DOCUMENT_BALANCE');
  total+=requested;if(!Number.isSafeInteger(total))fail('INVALID_AMOUNT');
  return {purchaseDocumentId:d.id,amount:requested/100};
 });
 if(total>paid)fail('ALLOCATION_EXCEEDS_PAYMENT');
 const difference=paid-total;
 return {allocations:normalized,targetSupplierId:targetSupplier.id,paidAmount:paid/100,allocatedAmount:total/100,difference:difference/100,status:difference<=100?'CONFIRMED':'PENDING_REVIEW',cashDelta:0,stockDelta:0};
}
