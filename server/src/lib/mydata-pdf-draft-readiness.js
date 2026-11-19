const valid=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=160&&!/[\u0000-\u001f\u007f]/.test(value);

// Metadata-only adapter for the existing No4 explicit-inbox PDF source path.
// Authorization belongs to the caller; no source bytes, OCR or writes occur.
export async function readMyDataPdfDraftReadiness(db,{companyId,storeId,inboxId,orderId}){
 const base={version:'MYDATA_PDF_READINESS_V1',storeId,inboxId,orderId,state:'UNAVAILABLE',needsPdfReading:false,orderLineCount:null,documentLineCount:null};
 if(![companyId,storeId,inboxId,orderId].every(valid))return base;
 const rows=await db.$queryRawUnsafe(`SELECT o."status" AS "orderStatus",o."sourceType" AS "orderSourceType",d."status" AS "documentStatus",d."sourceType" AS "documentSourceType",i."status" AS "inboxStatus",a."contentData" LIKE 'data:application/pdf;base64,%' AS "pdfPrefix",
  (SELECT COUNT(*)::int FROM "PurchaseOrderLine" l WHERE l."orderId"=o."id") AS "orderLineCount",
  (SELECT COUNT(*)::int FROM "PurchaseDocumentLine" l WHERE l."purchaseDocumentId"=d."id") AS "documentLineCount"
  FROM "MyDataInboundDocument" m
  JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
  JOIN "DocumentAttachment" a ON a."id"=i."attachmentId" AND a."companyId"=m."companyId" AND a."storeId"=m."storeId" AND a."mimeType"='application/pdf'
  JOIN "AiReaderJob" j ON j."attachmentId"=a."id" AND j."companyId"=m."companyId" AND j."storeId"=m."storeId"
  JOIN "PurchaseOrder" o ON o."id"=$4 AND o."companyId"=m."companyId" AND o."storeId"=m."storeId" AND o."sourceDocumentId"=j."purchaseDocumentId"
  JOIN "PurchaseDocument" d ON d."id"=o."sourceDocumentId" AND d."companyId"=m."companyId" AND d."storeId"=m."storeId"
  WHERE m."companyId"=$1 AND m."storeId"=$2 AND m."inboxId"=$3 LIMIT 2`,companyId,storeId,inboxId,orderId);
 if(rows.length!==1||rows[0].pdfPrefix!==true)return base;
 const row=rows[0];if(![row.orderLineCount,row.documentLineCount].every(value=>Number.isSafeInteger(value)&&value>=0))return base;
 if(!['NEW','FINAL','INVOICED'].includes(row.orderStatus)||!['DRAFT','APPROVED'].includes(row.documentStatus)||!['RECEIVED','IN_REVIEW','PROCESSED'].includes(row.inboxStatus))return base;
 const counts={orderLineCount:row.orderLineCount,documentLineCount:row.documentLineCount};
 if(row.orderStatus!=='NEW'||row.documentStatus!=='DRAFT'||!['RECEIVED','IN_REVIEW'].includes(row.inboxStatus))return {...base,...counts,state:'READ_ONLY'};
 if(row.orderSourceType!=='POS_OCR_DRAFT'||row.documentSourceType!=='POS_OCR_DRAFT')return base;
 if(row.orderLineCount||row.documentLineCount)return {...base,...counts,state:'HAS_LINES'};
 return {...base,...counts,state:'NEEDS_READING',needsPdfReading:true};
}
