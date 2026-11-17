import {invoiceNumberParts,sameInvoiceNumber,previewInvoiceReconciliation,lockInvoiceStore} from './invoice-common-draft.js';
import {inboxHeader} from './pos-inbox-original.js';
import {findInvoicePayment} from './invoice-payment-reuse.js';

const fail=message=>Object.assign(new Error(message),{status:409,code:'MYDATA_POS_IDENTITY_CONFLICT'});
// Read-only exact identity check. A nearby amount is never authority to link.
// The caller holds the shared store lock when using this result for a write.
export async function findUnlinkedMyDataOriginal(db,identity,{paymentTransactionId=null}={}){
 if(identity.documentType!=='INVOICE'||!/^\d{9}$/.test(identity.supplierTaxId||''))return null;
 const parts=invoiceNumberParts(identity.documentNumber);
 if(!parts.number||!identity.documentDate||!Number.isFinite(Number(identity.totalGross))||Number(identity.totalGross)<=0)return null;
 const date=new Date(identity.documentDate);if(!Number.isFinite(date.getTime()))return null;
 const rows=await db.$queryRaw`SELECT m.*,i."status" AS "inboxStatus",i."attachmentId",
  EXISTS(SELECT 1 FROM "AiReaderJob" j WHERE j."companyId"=m."companyId" AND j."storeId"=m."storeId" AND j."attachmentId"=i."attachmentId" AND j."purchaseDocumentId" IS NOT NULL) AS "hasLinkedJob"
  FROM "MyDataInboundDocument" m JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
  WHERE m."companyId"=${identity.companyId} AND m."storeId"=${identity.storeId} AND m."issuerVat"=${identity.supplierTaxId}
   AND (m."issueDate" AT TIME ZONE 'UTC')::date=${date.toISOString().slice(0,10)}::date
   AND COALESCE(NULLIF(LTRIM(m."documentNumber",'0'),''),'0')=${parts.number}
   AND (${parts.series}='' OR REGEXP_REPLACE(UPPER(COALESCE(m."series",'')),'[^A-ZΑ-Ω0-9]','','g')=${parts.series}) LIMIT 2`;
 if(!rows.length)return null;
 if(rows.length!==1)throw fail('Πολλαπλά πρωτότυπα myDATA απαιτούν έλεγχο. Δεν έγινε νέα πληρωμή.');
 const row=rows[0],raw=row.rawPayload||{};
 if(['mydataDraftDocumentId','mydataDraftOrderId','mydataPosReceipt','commonDraft'].some(key=>Object.hasOwn(raw,key))||row.hasLinkedJob)throw fail('Το myDATA έχει ήδη συνδεθεί ή το πρόχειρο έχει διαγραφεί. Χρησιμοποίησε την υπάρχουσα αγορά.');
 if(!['RECEIVED','IN_REVIEW'].includes(row.inboxStatus))throw fail('Το παραστατικό myDATA έχει ήδη προχωρήσει. Δεν δημιουργείται δεύτερο πρόχειρο.');
 const company=await db.company.findUnique({where:{id:identity.companyId},select:{taxId:true}});
 const header=inboxHeader(row,String(company?.taxId||'').replace(/^EL/i,'').trim());
 if(!sameInvoiceNumber(identity.documentNumber,row.series,row.documentNumber)||header.documentDate!==date.toISOString().slice(0,10)||Math.abs(header.totalGross-Number(identity.totalGross))>.050001)throw fail('Τα στοιχεία της φωτογραφίας δεν συμφωνούν με το πρωτότυπο myDATA.');
 const preview=await previewInvoiceReconciliation(db,{companyId:identity.companyId,storeId:identity.storeId,inboxId:row.inboxId});
 if(preview.orders.length)throw fail('Υπάρχει ήδη πιθανό ίδιο πρόχειρο. Δεν δημιουργείται δεύτερο.');
 const payment=await findInvoicePayment(db,{...identity,documentNumber:header.documentNumber});
 if(payment&&payment.id!==paymentTransactionId)throw fail('Υπάρχει ήδη ενεργή πληρωμή για το τιμολόγιο. Δεν έγινε νέα πληρωμή.');
 // Exact series + numeric identity also holds an older zero-padded payment.
 // Never turn a different formatting of an existing cash entry into new money.
 const paid=await db.$queryRaw`SELECT t."id" FROM "StoreTransaction" t JOIN "Supplier" s ON s."id"=t."supplierId" AND s."companyId"=t."companyId"
  WHERE t."companyId"=${identity.companyId} AND REGEXP_REPLACE(COALESCE(s."taxId",''),'[^0-9]','','g')=${identity.supplierTaxId}
   AND t."type"='SUPPLIER_PAYMENT' AND t."reversedAt" IS NULL
   AND COALESCE(NULLIF(LTRIM(SUBSTRING(t."invoiceDocumentNumber" FROM '([0-9]+)[^0-9]*$'),'0'),''),'0')=${parts.number}
   AND REGEXP_REPLACE(UPPER(REGEXP_REPLACE(COALESCE(t."invoiceDocumentNumber",''),'[0-9]+[^0-9]*$','')),'[^A-ZΑ-Ω0-9]','','g')=${invoiceNumberParts(header.documentNumber).series} LIMIT 2`;
 if(paid.length>1||paid.some(p=>p.id!==paymentTransactionId))throw fail('Υπάρχει ήδη πληρωμή με την ίδια σειρά και αριθμό. Απαιτείται έλεγχος χωρίς νέα χρέωση.');
 return {...row,canonicalDocumentNumber:header.documentNumber};
}

// Called immediately after creation inside the same locked transaction. Retain
// the provider original, every photograph, and the one existing POS payment.
export async function bindUnlinkedMyDataOriginal(tx,identity,original,{jobId,documentId,orderId,paymentTransactionId=null}){
 if(!original)return;
 const jobs=await tx.$queryRaw`SELECT "attachmentId","resultJson" FROM "AiReaderJob" WHERE "id"=${jobId} AND "companyId"=${identity.companyId} AND "storeId"=${identity.storeId}`;
 if(!jobs[0])throw fail('Δεν βρέθηκαν οι αποθηκευμένες φωτογραφίες του τιμολογίου.');
 const ids=[...new Set([jobId,...(jobs[0].resultJson?.posHandoff?.pageJobIds||[])])];
 const pages=await tx.$queryRaw`SELECT "id","attachmentId","purchaseDocumentId" FROM "AiReaderJob" WHERE "companyId"=${identity.companyId} AND "storeId"=${identity.storeId} AND "id"=ANY(${ids}::text[])`;
 if(ids.length>5||pages.length!==ids.length||pages.some(p=>p.purchaseDocumentId&&p.purchaseDocumentId!==documentId))throw fail('Οι φωτογραφίες ανήκουν σε άλλο πρόχειρο.');
 const receipt={attachmentIds:[...new Set(pages.map(p=>p.attachmentId))],paymentTransactionId,receivedAt:new Date().toISOString(),requiresHumanReceiptReview:true};
 const updated=await tx.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"=COALESCE("rawPayload",'{}'::jsonb)||${JSON.stringify({mydataDraftOrderId:orderId,mydataDraftDocumentId:documentId,mydataPosReceipt:receipt})}::jsonb
  WHERE "id"=${original.id} AND "companyId"=${identity.companyId} AND "storeId"=${identity.storeId}
   AND NOT(COALESCE("rawPayload",'{}'::jsonb) ?| ARRAY['mydataDraftOrderId','mydataDraftDocumentId','mydataPosReceipt'])`;
 if(updated!==1)throw fail('Το πρωτότυπο συνδέθηκε ενδιάμεσα. Δεν δημιουργήθηκε δεύτερο πρόχειρο.');
 await tx.$executeRaw`UPDATE "DocumentInbox" SET "attachmentId"=COALESCE("attachmentId",${jobs[0].attachmentId}),"status"='IN_REVIEW',"note"=${'Κοινό POS/myDATA • MARK '+original.mark+' • Ανάγνωση από βοηθό'},"updatedAt"=NOW() WHERE "id"=${original.inboxId} AND "companyId"=${identity.companyId} AND "storeId"=${identity.storeId}`;
 // Secondary photo jobs remain unclaimed until the normal multi-page intake.
 // Its existing guard rejects an already claimed additional page; the primary
 // handoff and receipt retain every page ID without bypassing that guard.
 await tx.$executeRaw`UPDATE "AiReaderJob" SET "purchaseDocumentId"=${documentId},"updatedAt"=NOW() WHERE "companyId"=${identity.companyId} AND "storeId"=${identity.storeId} AND ("id"=${jobId} OR ("attachmentId"=${original.attachmentId} AND "purchaseDocumentId" IS NULL))`;
 await tx.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({mydataPosReceipt:receipt})}::jsonb WHERE "id"=${jobId} AND "companyId"=${identity.companyId} AND "storeId"=${identity.storeId}`;
}

// Recover existing photo drafts during receiving, including older inbox rows.
export async function linkStoredPosInvoicePhotos(tx,scope){
 const {companyId,storeId}=scope;
 await lockInvoiceStore(tx,companyId,storeId);
 const matches=await tx.$queryRaw`
  WITH candidates AS (
   SELECT m."id",m."inboxId",m."mark",o."id" AS "orderId",d."id" AS "documentId",d."paymentTransactionId",
    COUNT(*) OVER (PARTITION BY m."id") AS "draftCount",
    COUNT(*) OVER (PARTITION BY d."id") AS "inboundCount"
   FROM "MyDataInboundDocument" m
   JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
   JOIN "Supplier" s ON s."companyId"=m."companyId" AND s."taxId"=m."issuerVat"
   JOIN "PurchaseDocument" d ON d."companyId"=m."companyId" AND d."storeId"=m."storeId" AND d."supplierId"=s."id"
    AND d."totalGross"=m."totalGross" AND d."documentDate"::date=m."issueDate"::date
    AND LTRIM(SUBSTRING(TRIM(d."documentNumber") FROM '[0-9]+$'),'0')=LTRIM(m."documentNumber",'0')
    AND REGEXP_REPLACE(UPPER(REGEXP_REPLACE(TRIM(d."documentNumber"),'[0-9]+$','')),'[^A-ZΑ-Ω0-9]','','g')=
     REGEXP_REPLACE(UPPER(COALESCE(m."series",'')),'[^A-ZΑ-Ω0-9]','','g')
   JOIN "PurchaseOrder" o ON o."id"=d."purchaseOrderId" AND o."sourceDocumentId"=d."id"
    AND o."companyId"=d."companyId" AND o."storeId"=d."storeId" AND o."supplierId"=s."id"
   WHERE m."companyId"=${companyId} AND m."storeId"=${storeId}
    AND m."issuerVat" ~ '^[0-9]{9}$' AND m."documentNumber" ~ '^[0-9]+$' AND LTRIM(m."documentNumber",'0')<>'' AND m."invoiceType" LIKE '1.%'
    AND m."totalGross">0 AND i."status"='RECEIVED' AND i."attachmentId" IS NULL
    AND COALESCE(m."rawPayload"->>'xml','') NOT LIKE '%downloadingInvoiceUrl%'
    AND NOT(COALESCE(m."rawPayload",'{}'::jsonb) ?| ARRAY['mydataDraftOrderId','mydataDraftDocumentId','mydataPosReceipt','commonDraft'])
    AND d."documentType"='INVOICE' AND d."status"='DRAFT' AND d."sourceType"='POS_OCR_DRAFT' AND o."status" IN ('NEW','INVOICED')
    AND NOT EXISTS (SELECT 1 FROM "MyDataInboundDocument" x WHERE x."companyId"=m."companyId" AND x."storeId"=m."storeId"
     AND (x."rawPayload"->>'mydataDraftDocumentId'=d."id" OR x."rawPayload"->>'mydataDraftOrderId'=o."id"))
  )
  SELECT c.*,j."id" AS "jobId"
  FROM candidates c
  JOIN LATERAL (
   SELECT j."id" FROM "AiReaderJob" j
   JOIN "DocumentAttachment" a ON a."id"=j."attachmentId" AND a."companyId"=j."companyId" AND a."storeId"=j."storeId"
   WHERE j."companyId"=${companyId} AND j."storeId"=${storeId} AND j."purchaseDocumentId"=c."documentId"
    AND a."mimeType" IN ('image/jpeg','image/png','image/webp') AND a."contentData" IS NOT NULL
   ORDER BY j."createdAt",j."id" LIMIT 1
  ) j ON true
  WHERE c."draftCount"=1 AND c."inboundCount"=1
  ORDER BY c."inboxId" LIMIT 10`;
 for(const match of matches){
  await bindUnlinkedMyDataOriginal(tx,scope,{...match,attachmentId:null},match);
 }
 return matches.length;
}
