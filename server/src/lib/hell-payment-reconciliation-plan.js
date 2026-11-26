// Pure LAB planning logic. No database writes or production entrypoint.
export function planHellPaymentReconciliation({payment,source,order,canonical,identityConfirmed,duplicatePayment=false}){
 const issues=[];
 if(identityConfirmed!==true)issues.push('SUPPLIER_IDENTITY_UNCONFIRMED');
 if(!payment||!source||!order) return {ready:false,issues:[...issues,'MISSING_RECORD'],cashDelta:0};
 if(payment.status!=='PENDING_REVIEW'||payment.paymentMethod!=='CASH_SHIFT'||payment.reversedAt||!payment.sessionId||payment.bank||Number(payment.allocations)!==0)issues.push('PAYMENT_NOT_ELIGIBLE');
 if(payment.companyId!==source.companyId||payment.storeId!==source.storeId||order.companyId!==source.companyId||order.storeId!==source.storeId||order.sourceDocumentId!==source.id||source.purchaseOrderId!==order.id||source.supplierId!==order.supplierId)issues.push('SCOPE_MISMATCH');
 if(Number(payment.amount)!==90.17||Number(source.totalGross)!==90.17||source.documentNumber!=='ΆνευX 35375'||order.invoiceNumber!==source.documentNumber||!String(payment.note||'').includes('035375'))issues.push('REFERENCE_OR_AMOUNT_MISMATCH');
 if(source.status!=='DRAFT'||source.sourceType!=='POS_OCR_DRAFT'||source.paymentTransactionId||Number(source.allocations)!==0)issues.push('SOURCE_NOT_ELIGIBLE');
 if(order.status!=='FINAL')issues.push('ORDER_STATUS_CHANGED');
 if(!canonical||canonical.id!==order.id||canonical.companyId!==source.companyId||canonical.storeId!==source.storeId||canonical.supplierId!==source.supplierId||canonical.status!=='APPROVED'||canonical.sourceType!=='PURCHASE_ORDER'||canonical.documentNumber!==source.documentNumber||Number(canonical.totalGross)!==90.17)issues.push('CANONICAL_PURCHASE_UNVERIFIED');
 else if(canonical.paymentTransactionId||Number(canonical.allocations)!==0||canonical.settlementMode!=='CREDIT')issues.push('CANONICAL_NOT_OPEN');
 if(duplicatePayment)issues.push('POSSIBLE_DUPLICATE_PAYMENT');
 return {ready:issues.length===0,issues,cashDelta:0,allocation:issues.length?null:{settlementId:payment.id,purchaseDocumentId:canonical.id,amount:90.17},targetSupplierId:issues.length?null:source.supplierId};
}
