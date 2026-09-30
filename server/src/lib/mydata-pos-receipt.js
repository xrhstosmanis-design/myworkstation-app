import crypto from "node:crypto";
import {assertReusableInvoicePayment} from "./invoice-payment-reuse.js";
const fail=message=>Object.assign(new Error(message),{status:409,code:"MYDATA_POS_IDENTITY_CONFLICT"});
const normalized=value=>String(value||"").trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"");
const day=value=>value?new Date(value).toISOString().slice(0,10):"";

// This is a narrow exception to duplicate rejection, never a general duplicate bypass.
export async function findMyDataPurchase(db,{companyId,storeId,supplierId,supplierTaxId,documentNumber,documentDate,totalGross,documentType="INVOICE"}){
  if(documentType!=="INVOICE"||!/^\d{4}-\d{2}-\d{2}$/.test(String(documentDate||""))||!Number.isFinite(Number(totalGross))||!(Number(totalGross)>0))return null;
  const rows=await db.$queryRaw`SELECT m."id" AS "inboundId",m."inboxId",m."mark",m."series",m."documentNumber",m."issueDate",m."totalGross" AS "inboundTotal",m."rawPayload",i."attachmentId",
    d."id" AS "documentId",d."storeId" AS "documentStoreId",d."supplierId",d."documentType",d."documentNumber" AS "purchaseNumber",d."documentDate",d."totalGross",d."status",d."paymentTransactionId",d."settlementMode",d."purchaseOrderId",
    o."id" AS "orderId",o."status" AS "orderStatus",j."id" AS "jobId",j."resultJson"
    FROM "MyDataInboundDocument" m JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
    LEFT JOIN LATERAL (SELECT aj.* FROM "AiReaderJob" aj WHERE aj."attachmentId"=i."attachmentId" AND aj."companyId"=m."companyId" AND aj."storeId"=m."storeId" AND aj."purchaseDocumentId" IS NOT NULL ORDER BY aj."createdAt",aj."id" LIMIT 1) j ON true
    LEFT JOIN "PurchaseDocument" d ON d."id"=COALESCE(m."rawPayload"->>'mydataDraftDocumentId',j."purchaseDocumentId") AND d."companyId"=m."companyId"
    LEFT JOIN "PurchaseOrder" o ON o."id"=d."purchaseOrderId" AND o."sourceDocumentId"=d."id" AND o."companyId"=m."companyId" AND o."storeId"=m."storeId"
    WHERE m."companyId"=${companyId} AND m."storeId"=${storeId} AND m."issuerVat"=${supplierTaxId}
      AND (UPPER(regexp_replace(m."documentNumber",'\\s+','','g'))=${normalized(documentNumber)} OR UPPER(regexp_replace(CONCAT_WS(' ',NULLIF(m."series",''),m."documentNumber"),'\\s+','','g'))=${normalized(documentNumber)})
      ORDER BY m."fetchedAt" DESC LIMIT 2`;
  if(!rows.length)return null;
  if(rows.length!==1)throw fail("Περισσότερες από μία εγγραφές myDATA ταιριάζουν. Απαιτείται έλεγχος στο BackOffice.");
  const row=rows[0];
  if(!row.documentId){if(row.rawPayload?.mydataDraftDocumentId||row.rawPayload?.mydataDraftOrderId)throw fail("Η συνδεδεμένη αγορά myDATA έχει διαγραφεί. Δεν δημιουργείται δεύτερη.");return null}
  const references=[row.documentNumber,[row.series,row.documentNumber].filter(Boolean).join(" ")].map(normalized);
  if(row.documentStoreId!==storeId||row.supplierId!==supplierId||row.documentType!=="INVOICE"||!references.includes(normalized(row.purchaseNumber))||day(row.issueDate)!==documentDate||day(row.documentDate)!==documentDate||!Number.isFinite(Number(row.inboundTotal))||!Number.isFinite(Number(row.totalGross))||Math.abs(Number(row.inboundTotal)-Number(totalGross))>.050001||Math.abs(Number(row.totalGross)-Number(totalGross))>.050001||!row.orderId||!row.jobId||!["DRAFT","APPROVED"].includes(row.status)||!["NEW","FINAL","INVOICED"].includes(row.orderStatus))throw fail("Τα στοιχεία της υπάρχουσας αγοράς myDATA δεν συμφωνούν. Ελέγξτε την αγορά πριν από την πληρωμή.");
  const allocations=await db.$queryRaw`SELECT a."id" FROM "SupplierPaymentAllocation" a JOIN "SupplierPaymentSettlement" s ON s."id"=a."settlementId" AND s."companyId"=a."companyId" JOIN "StoreTransaction" t ON t."id"=s."transactionId" AND t."companyId"=s."companyId" WHERE a."companyId"=${companyId} AND a."purchaseDocumentId"=${row.documentId} AND s."status"<>'CANCELLED' AND t."reversedAt" IS NULL LIMIT 1`;
  if(allocations.length)throw fail("Υπάρχει ήδη κατανεμημένη πληρωμή για αυτή την αγορά. Χρησιμοποιήστε την υπάρχουσα πληρωμή ανοιχτών τιμολογίων.");
  return row;
}

// Payment is made by the existing POS payment route. This helper only links its receipt.
export async function attachMyDataPosReceipt(prisma,identity,pages,payment,user){
  return prisma.$transaction(async tx=>{
    const match=await findMyDataPurchase(tx,identity);if(!match)throw fail("Η αγορά myDATA άλλαξε πριν από τη σύνδεση. Η υπάρχουσα πληρωμή διατηρείται για έλεγχο.");
    const orders=await tx.$queryRaw`SELECT "status" FROM "PurchaseOrder" WHERE "id"=${match.orderId} AND "companyId"=${identity.companyId} AND "storeId"=${identity.storeId} FOR UPDATE`;
    const documents=await tx.$queryRaw`SELECT "status","paymentTransactionId","settlementMode","totalGross" FROM "PurchaseDocument" WHERE "id"=${match.documentId} AND "companyId"=${identity.companyId} AND "storeId"=${identity.storeId} FOR UPDATE`;
    if(!orders[0]||!documents[0]||!["DRAFT","APPROVED"].includes(documents[0].status)||!["NEW","FINAL","INVOICED"].includes(orders[0].status)||Math.abs(Number(documents[0].totalGross)-Number(identity.totalGross))>.050001)throw fail("Η αγορά άλλαξε. Απαιτείται ανανέωση χωρίς νέα πληρωμή.");
    if(payment){
      const rows=await tx.$queryRaw`SELECT t.*,s."taxId" AS "supplierTaxId" FROM "StoreTransaction" t JOIN "Supplier" s ON s."id"=t."supplierId" AND s."companyId"=t."companyId" WHERE t."id"=${payment.id} AND t."companyId"=${identity.companyId} AND t."storeId"=${identity.storeId} FOR UPDATE OF t`;
      assertReusableInvoicePayment(rows[0],{...identity,documentNumber:match.purchaseNumber});
    }
    if(documents[0].paymentTransactionId&&documents[0].paymentTransactionId!==payment?.id)throw fail("Η αγορά έχει διαφορετική πληρωμή. Δεν αντικαθίσταται.");
    if(documents[0].settlementMode==="PAID"&&!payment)throw fail("Η αγορά είναι ήδη πληρωμένη. Δεν μετατρέπεται σε πίστωση.");
    const jobs=await tx.$queryRaw`SELECT "resultJson" FROM "AiReaderJob" WHERE "id"=${match.jobId} AND "companyId"=${identity.companyId} AND "storeId"=${identity.storeId} AND "purchaseDocumentId"=${match.documentId} FOR UPDATE`;
    if(!jobs[0])throw fail("Δεν βρέθηκε η συνδεδεμένη εργασία ελέγχου.");
    const receipt=jobs[0].resultJson?.mydataPosReceipt||{},ids=[...(receipt.attachmentIds||[])];
    if(receipt.receivedAt){
      if((receipt.paymentTransactionId||null)!==(payment?.id||null))throw fail("Το τιμολόγιο έχει ήδη παραληφθεί. Δεν συνδέεται δεύτερη πληρωμή.");
      for(const page of pages){
        const found=await tx.$queryRaw`SELECT "id" FROM "DocumentAttachment" WHERE "companyId"=${identity.companyId} AND "storeId"=${identity.storeId} AND "checksum"=${page.checksum} LIMIT 1`;
        if(!found[0]||!ids.includes(found[0].id))throw fail("Το τιμολόγιο έχει ήδη παραληφθεί από POS. Δεν προστίθεται δεύτερη υποβολή.");
      }
      return {jobId:match.jobId,purchaseDocumentId:match.documentId,purchaseOrderId:match.orderId,myDataInboundId:match.inboundId,myDataInboxId:match.inboxId,myDataMatched:true,receiptLinked:true,reused:true,stockUpdated:false,awaitingApproval:match.status==="DRAFT"};
    }
    for(const page of pages){
      const found=await tx.$queryRaw`SELECT "id" FROM "DocumentAttachment" WHERE "companyId"=${identity.companyId} AND "storeId"=${identity.storeId} AND "checksum"=${page.checksum} LIMIT 1`;
      const attachmentId=found[0]?.id||crypto.randomUUID();
      if(!found[0])await tx.$executeRaw`INSERT INTO "DocumentAttachment" ("id","companyId","storeId","documentType","filename","mimeType","storageKey","checksum","contentData") VALUES (${attachmentId},${identity.companyId},${identity.storeId},'AI_READER_SOURCE',${page.filename},${page.mimeType},${"DATABASE:"+page.checksum},${page.checksum},${page.dataUrl})`;
      if(!ids.includes(attachmentId))ids.push(attachmentId);
    }
    if(ids.length>5)throw fail("Έχουν ήδη συνδεθεί πέντε σελίδες. Ελέγξτε τις υπάρχουσες φωτογραφίες.");
    const metadata={attachmentIds:ids,paymentTransactionId:payment?.id||null,receivedAt:receipt.receivedAt||new Date().toISOString(),operatorId:user.id,requiresHumanReceiptReview:true};
    await tx.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({mydataPosReceipt:metadata})}::jsonb,"updatedAt"=NOW() WHERE "id"=${match.jobId} AND "companyId"=${identity.companyId} AND "storeId"=${identity.storeId}`;
    await tx.$executeRaw`UPDATE "PurchaseDocument" SET "settlementMode"=${payment?"PAID":"CREDIT"},"paymentTransactionId"=COALESCE("paymentTransactionId",${payment?.id||null}),"updatedAt"=NOW() WHERE "id"=${match.documentId} AND "companyId"=${identity.companyId} AND "storeId"=${identity.storeId}`;
    await tx.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"||${JSON.stringify({mydataPosReceipt:metadata})}::jsonb WHERE "id"=${match.inboundId} AND "companyId"=${identity.companyId} AND "storeId"=${identity.storeId}`;
    return {jobId:match.jobId,purchaseDocumentId:match.documentId,purchaseOrderId:match.orderId,myDataInboundId:match.inboundId,myDataInboxId:match.inboxId,myDataMatched:true,receiptLinked:true,stockUpdated:false,awaitingApproval:match.status==="DRAFT"};
  });
}
