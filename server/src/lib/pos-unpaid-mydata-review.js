import {previewInvoiceReconciliation,sameInvoiceNumber} from './invoice-common-draft.js';
import {findMyDataPurchase} from './mydata-pos-receipt.js';
import {findInvoicePayment} from './invoice-payment-reuse.js';
import {findUnlinkedMyDataOriginal} from './pos-unlinked-mydata.js';

// A proposal is not invoice identity or permission to pay. The POS must ask the
// operator to compare the original and then repeat the normal exact precheck.
export async function unpaidMyDataHeaderReview(db,identity){
 if(identity.documentType!=='INVOICE'||!identity.supplierTaxId)return null;
 const rows=await db.$queryRaw`SELECT "inboxId","series","documentNumber","issueDate","totalGross","mark"
  FROM "MyDataInboundDocument" WHERE "companyId"=${identity.companyId} AND "storeId"=${identity.storeId}
   AND "issuerVat"=${identity.supplierTaxId} AND "invoiceType" NOT LIKE '5.%'
   AND "issueDate"=${new Date(identity.documentDate)}::date AND "totalGross">0
   AND ABS("totalGross"-${Number(identity.totalGross)})<=0.050001 LIMIT 2`;
 if(rows.length!==1)return null;
 const row=rows[0];
 if(sameInvoiceNumber(identity.documentNumber,row.series,row.documentNumber))return null;
 const canonicalDocumentNumber=[row.series,row.documentNumber].filter(Boolean).join(' ');
 const canonical={...identity,documentNumber:canonicalDocumentNumber};
 const match=await findMyDataPurchase(db,canonical);
 if(!match){
  const payments=await Promise.all([identity.documentNumber,canonicalDocumentNumber].map(documentNumber=>findInvoicePayment(db,{...identity,documentNumber})));
  if(payments.some(Boolean))throw Object.assign(new Error('Υπάρχει ήδη ενεργή πληρωμή. Δεν έγινε νέα πληρωμή.'),{status:409,code:'INVOICE_ALREADY_PAID'});
  const original=await findUnlinkedMyDataOriginal(db,canonical);
  if(!original)return null;
  return {myDataHeaderReviewRequired:true,myDataUnlinked:true,canonicalDocumentNumber:original.canonicalDocumentNumber,canonicalDocumentDate:identity.documentDate,
   myDataTotalGross:Number(row.totalGross),myDataMark:row.mark,message:'Επιβεβαίωσε τον αριθμό από το πρωτότυπο. Οι φωτογραφίες θα δημιουργήσουν ένα κοινό πρόχειρο POS/myDATA.'};
 }
 if(!match||match.status!=='DRAFT'||match.orderStatus!=='NEW')return null;
 const payments=await Promise.all([identity.documentNumber,match.purchaseNumber].map(documentNumber=>findInvoicePayment(db,{...identity,documentNumber})));
 if(match.paymentTransactionId||match.settlementMode==='PAID'||payments.some(Boolean))throw Object.assign(new Error('Υπάρχει ήδη ενεργή πληρωμή για το παραστατικό. Δεν έγινε νέα πληρωμή. Χρησιμοποίησε την υπάρχουσα αγορά ή τις πληρωμές ανοιχτών τιμολογίων.'),{status:409,code:'INVOICE_ALREADY_PAID'});
 if(match.resultJson?.mydataPosReceipt?.receivedAt||match.rawPayload?.mydataPosReceipt?.receivedAt)return null;
 const preview=await previewInvoiceReconciliation(db,{companyId:identity.companyId,storeId:identity.storeId,inboxId:row.inboxId});
 if(preview.orders.length!==1||!preview.orders[0].isMyData||!preview.orders[0].exact)return null;
 return {myDataHeaderReviewRequired:true,canonicalDocumentNumber:match.purchaseNumber,canonicalDocumentDate:identity.documentDate,
  myDataTotalGross:Number(row.totalGross),myDataMark:row.mark,message:'Το myDATA είναι απλήρωτο. Επιβεβαίωσε τον σωστό αριθμό από το πρωτότυπο στο POS πριν από την πρώτη πληρωμή. Θα χρησιμοποιηθεί το ίδιο πρόχειρο.'};
}
