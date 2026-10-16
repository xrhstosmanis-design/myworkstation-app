const cents=v=>Math.round(Number(v)*100);
const token=v=>String(v||'').toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,'');

// Keep the exact signed request after a lost response: retry never reuploads
// the original and never invents a second idempotency key for the same action.
export async function settleUploadedCredit({api,storeId,supplierId,documentNumber,documentDate,totalGross,documentId,selection,attempt}){
 const path=`/api/transactions/stores/${encodeURIComponent(storeId)}/supplier-credit-cash`;
 if(!attempt.request){
  const context=await api(`${path}?supplierId=${encodeURIComponent(supplierId)}`);
  const credit=context.credits.find(c=>c.id===documentId);
  if(!credit||token(credit.documentNumber)!==token(documentNumber)||String(credit.documentDate).slice(0,10)!==documentDate||cents(credit.totalGross)!==cents(totalGross))throw new Error('Το υπάρχον πιστωτικό δεν είναι διαθέσιμο ή τα στοιχεία άλλαξαν. Δεν έγινε νέα κίνηση. Μην το ανεβάσεις ξανά.');
  const payment=selection.mode==='OFFSET'?context.payments.find(p=>p.id===selection.payment.id):null;
  if(selection.mode==='OFFSET'&&(!payment||cents(payment.amount)!==cents(selection.payment.amount)||cents(payment.appliedAmount)!==cents(selection.payment.appliedAmount)))throw new Error('Η αρχική πληρωμή άλλαξε. Έλεγξε το υπόλοιπο πριν από συμψηφισμό.');
  attempt.request={type:'SUPPLIER_PAYMENT',paymentSource:'CASH_SHIFT',supplierId,creditDocumentId:credit.id,mode:selection.mode,invoicePaymentId:payment?.id||null,expectedCreditAmount:credit.totalGross,expectedCreditUpdatedAt:credit.updatedAt,expectedCreditVersion:credit.version,expectedPaymentAmount:payment?.amount||null,expectedAppliedAmount:payment?.appliedAmount||0,confirmOriginal:true,reason:selection.reason.trim(),idempotencyKey:crypto.randomUUID()};
 }
 try{return await api(path,{method:'POST',body:JSON.stringify(attempt.request)})}
 catch(error){if(String(error.message).includes('Το πιστωτικό άλλαξε.'))attempt.request=null;throw error}
}
