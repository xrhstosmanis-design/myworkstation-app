import crypto from "node:crypto";
import {acquireOriginal,fetchOriginalPdf,readOriginalPdf,verifyOriginalText} from "../mydata-original.js";
import {sameInvoiceNumber,invoiceNumberParts,lockInvoiceStore,previewInvoiceReconciliation} from "./invoice-common-draft.js";

const fail=(message,status=409)=>Object.assign(new Error(message),{status});
export function inboxHeader(row,recipientVat){
  const date=row.issueDate?new Date(row.issueDate).toISOString().slice(0,10):"";
  if(!/^\d{9}$/.test(String(recipientVat||""))||row.counterpartVat!==recipientVat||!/^\d{9}$/.test(row.issuerVat||"")||!/^\d+$/.test(row.mark||"")||!row.documentNumber||!date||row.currency!=="EUR"||!(Number(row.totalGross)>0)||!["1.1","1.2","1.3","2.1","2.2","2.3"].includes(row.invoiceType))throw fail("Το παραστατικό χρειάζεται έλεγχο στο BackOffice. Χρησιμοποίησε φωτογραφίες.");
  return {supplierTaxId:row.issuerVat,supplierName:row.supplierName||"",documentNumber:[row.series,row.documentNumber].filter(Boolean).join(" "),documentDate:date,totalGross:Number(row.totalGross),documentType:row.invoiceType.startsWith("5.")?"CREDIT_NOTE":"INVOICE",mark:row.mark};
}
export async function verifiedInboxPdf(row,dataUrl,{reader=readOriginalPdf,download=fetchOriginalPdf}={}){
  let pdf;
  if(dataUrl){
    const match=/^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if(!match)throw fail("Δεν υπάρχει έγκυρο πρωτότυπο PDF. Χρησιμοποίησε φωτογραφίες.");
    const bytes=Buffer.from(match[1],"base64");
    if(bytes.length<100||bytes.length>3400000||bytes.subarray(0,5).toString()!=="%PDF-")throw fail("Μη έγκυρο πρωτότυπο PDF.");
    const {text,pageCount}=await reader(bytes);verifyOriginalText(text,row);
    pdf={bytes,text,pageCount,checksum:crypto.createHash("sha256").update(bytes).digest("hex"),filename:`mydata-${row.documentNumber}-${row.mark}.pdf`};
  }else pdf=await download(row);
  if(!Number.isInteger(pdf.pageCount)||pdf.pageCount<1||pdf.pageCount>5)throw fail("Το PDF υπερβαίνει τις 5 σελίδες. Χρειάζεται έλεγχος στο BackOffice.");
  return pdf;
}
export async function selectedInboxRow(db,companyId,storeId,inboxId){
  const rows=await db.$queryRaw`SELECT m.*,i."attachmentId",i."status" AS "inboxStatus",a."mimeType",a."contentData",a."checksum",s."name" AS "supplierName"
    FROM "MyDataInboundDocument" m JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
    LEFT JOIN "DocumentAttachment" a ON a."id"=i."attachmentId" AND a."companyId"=m."companyId" AND a."storeId"=m."storeId"
    LEFT JOIN "Supplier" s ON s."id"=i."supplierId" AND s."companyId"=m."companyId"
    WHERE m."companyId"=${companyId} AND m."storeId"=${storeId} AND m."inboxId"=${inboxId} LIMIT 1`;
  if(!rows[0])throw fail("Δεν βρέθηκε το παραστατικό του επιλεγμένου καταστήματος.",404);
  if(!["RECEIVED","IN_REVIEW"].includes(rows[0].inboxStatus))throw fail("Το παραστατικό έχει ήδη προχωρήσει. Έλεγξε την υπάρχουσα αγορά.");
  return rows[0];
}

export async function prepareSelectedInbox(db,identity,inboxId,dataUrl,user,{attach=false}={}){
  const employee=user.tokenType==="STORE_OPERATOR"||user.role==="EMPLOYEE";
  if(employee&&(!user.permissions?.includes("SUPPLIER_PAYMENT")||String(user.storeId||"")!==identity.storeId)||!employee&&!["SUPER_ADMIN","OWNER","ADMIN","MANAGER","BACKOFFICE_USER"].includes(user.role))throw fail("Δεν έχεις πρόσβαση στην επιλογή αυτού του τιμολογίου.",403);
  const row=await selectedInboxRow(db,identity.companyId,identity.storeId,inboxId);
  const company=await db.company.findUnique({where:{id:identity.companyId},select:{taxId:true}});
  const header=inboxHeader(row,String(company?.taxId||"").replace(/^EL/i,"").trim());
  if(header.supplierTaxId!==identity.supplierTaxId||!sameInvoiceNumber(identity.documentNumber,row.series,row.documentNumber)||header.documentDate!==identity.documentDate||header.documentType!==identity.documentType||Math.abs(header.totalGross-Number(identity.totalGross))>.050001)throw fail("Τα στοιχεία άλλαξαν από το επιλεγμένο myDATA. Έλεγξε αριθμό, ΑΦΜ, ημερομηνία και ποσό πριν από την πληρωμή.");
  await assertInboxSelectionUnambiguous(db,{companyId:identity.companyId,storeId:identity.storeId,inboxId});
  const pdf=await verifiedInboxPdf(row,dataUrl);
  if(row.attachmentId&&(row.mimeType!=="application/pdf"||row.checksum!==pdf.checksum))throw fail("Το PDF δεν είναι το αποθηκευμένο πρωτότυπο αυτού του τιμολογίου.");
  if(attach){
    const acquired=await acquireOriginal(db,identity.companyId,identity.storeId,inboxId,user.tokenType==="STORE_OPERATOR"?null:user.id,true,async()=>pdf);
    if(acquired.reconciliationRequired)throw fail("Υπάρχει πρόχειρο που απαιτεί έλεγχο. Δεν δημιουργείται δεύτερο.");
  }
  return row;
}

export async function assertInboxSelectionUnambiguous(db,scope){
  const preview=await previewInvoiceReconciliation(db,scope);
  if(preview.orders.length>1||preview.orders.some(order=>order.supplierReviewRequired||!order.exact))throw fail("Υπάρχει ήδη πιθανό ίδιο τιμολόγιο από POS ή διαφορετικός προμηθευτής. Απαιτείται αντιστοίχιση στο BackOffice πριν από νέα πληρωμή. Δεν έγινε χρέωση.");
  return preview;
}

// Only an untouched, empty myDATA shell may enter the existing durable reader.
// Populated/reviewed/posted drafts and retries retain their original rows/jobs.
export async function queueEmptyInboxRead(db,identity,match,payment){
  return db.$transaction(async tx=>{
    await lockInvoiceStore(tx,identity.companyId,identity.storeId);
    const jobs=await tx.$queryRaw`SELECT j."resultJson",j."status",d."status" AS "documentStatus",o."status" AS "orderStatus",d."supplierId",d."documentNumber",d."documentDate",d."totalGross",d."documentType",
      (SELECT COUNT(*) FROM "PurchaseOrderLine" l WHERE l."orderId"=o."id")::int AS "orderLines",
      (SELECT COUNT(*) FROM "PurchaseDocumentLine" l WHERE l."purchaseDocumentId"=d."id")::int AS "documentLines"
      FROM "AiReaderJob" j JOIN "PurchaseDocument" d ON d."id"=j."purchaseDocumentId" AND d."companyId"=j."companyId" AND d."storeId"=j."storeId"
      JOIN "PurchaseOrder" o ON o."id"=d."purchaseOrderId" AND o."sourceDocumentId"=d."id" AND o."companyId"=d."companyId" AND o."storeId"=d."storeId"
      WHERE j."id"=${match.jobId} AND j."companyId"=${identity.companyId} AND j."storeId"=${identity.storeId} FOR UPDATE OF j,d,o`;
    const job=jobs[0];
    if(!job||job.documentStatus!=="DRAFT"||job.orderStatus!=="NEW"||job.orderLines!==0||job.documentLines!==0||job.resultJson?.posHandoff||!["AWAITING_APPROVAL","LOCAL_COMPLETE"].includes(job.status))return false;
    if(job.supplierId!==identity.supplierId||job.documentType!==identity.documentType||new Date(job.documentDate).toISOString().slice(0,10)!==identity.documentDate||Math.abs(Number(job.totalGross)-Number(identity.totalGross))>.050001||!sameInvoiceNumber(identity.documentNumber,...[invoiceNumberParts(job.documentNumber).series,invoiceNumberParts(job.documentNumber).number]))return false;
    const handoff={version:"POS_FAST_HANDOFF_V1",fullReader:"ASSISTANT",inboxInitialRead:true,...identity,documentNumber:match.purchaseNumber,settlementMode:payment?"PAID":"CREDIT",paymentTransactionId:payment?.id||null,pageIndex:0,pageCount:1,pageJobIds:[match.jobId],primaryJobId:match.jobId,queuedAt:new Date().toISOString()};
    await tx.$executeRaw`UPDATE "AiReaderJob" SET "status"='POS_DRAFT_READY',"stage"='POS_DRAFT_READY',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posHandoff:handoff})}::jsonb,"updatedAt"=NOW() WHERE "id"=${match.jobId} AND "companyId"=${identity.companyId} AND "storeId"=${identity.storeId}`;
    return true;
  });
}

export async function assertEmptyInboxRead(tx,identity,documentId,orderId){
  const state=await tx.$queryRaw`SELECT o."status",d."status" AS "documentStatus",d."supplierId",d."documentNumber",d."documentDate",d."totalGross",d."documentType",
    (SELECT COUNT(*) FROM "PurchaseOrderLine" l WHERE l."orderId"=o."id")::int AS "orderLines",
    (SELECT COUNT(*) FROM "PurchaseDocumentLine" l WHERE l."purchaseDocumentId"=d."id")::int AS "documentLines"
    FROM "PurchaseOrder" o JOIN "PurchaseDocument" d ON d."id"=o."sourceDocumentId" AND d."companyId"=o."companyId" AND d."storeId"=o."storeId"
    WHERE o."id"=${orderId} AND d."id"=${documentId} AND o."companyId"=${identity.companyId} AND o."storeId"=${identity.storeId} FOR UPDATE OF o,d`;
  const row=state[0],parts=invoiceNumberParts(row?.documentNumber);
  if(!row||row.status!=="NEW"||row.documentStatus!=="DRAFT"||row.orderLines!==0||row.documentLines!==0||row.supplierId!==identity.supplierId||row.documentType!==identity.documentType||new Date(row.documentDate).toISOString().slice(0,10)!==new Date(identity.documentDate).toISOString().slice(0,10)||Math.abs(Number(row.totalGross)-Number(identity.totalGross))>.050001||!sameInvoiceNumber(identity.documentNumber,parts.series,parts.number))throw fail("Το πρόχειρο έχει ήδη ελεγχθεί, συμπληρωθεί ή αλλάξει. Οι υπάρχουσες γραμμές διατηρήθηκαν.");
}
