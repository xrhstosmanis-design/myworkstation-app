export async function loadInvoiceAssistantSource(db,companyId,orderId,context={}){
  const docs=await db.$queryRaw`
    SELECT d."id",d."storeId",d."documentNumber",d."totalGross",COALESCE(o."supplierId",d."supplierId") AS "supplierId"
    FROM "PurchaseOrder" o JOIN "PurchaseDocument" d ON d."id"=o."sourceDocumentId" AND d."companyId"=o."companyId"
    WHERE o."id"=${orderId} AND o."companyId"=${companyId} AND o."status"='NEW'
      AND o."sourceType"='POS_OCR_DRAFT' AND d."status"='DRAFT' AND d."sourceType"='POS_OCR_DRAFT' LIMIT 1`;
  const document=docs[0];if(!document)return null;
  if(context.inboxId){
    if(document.storeId!==context.storeId)return {document,pages:[]};
    // Bind the exact inbox original to this same draft through its durable AI job.
    // Receipt-photo metadata is deliberately ignored only for this explicit origin.
    const originals=await db.$queryRaw`SELECT a."filename",a."mimeType",a."contentData"
      FROM "MyDataInboundDocument" m
      JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
      JOIN "DocumentAttachment" a ON a."id"=i."attachmentId" AND a."companyId"=i."companyId" AND a."storeId"=i."storeId"
      JOIN "AiReaderJob" j ON j."attachmentId"=a."id" AND j."companyId"=m."companyId" AND j."storeId"=m."storeId"
      WHERE m."inboxId"=${context.inboxId} AND m."companyId"=${companyId} AND m."storeId"=${context.storeId}
        AND j."purchaseDocumentId"=${document.id} AND i."status" IN ('RECEIVED','IN_REVIEW')
        AND a."mimeType"='application/pdf' LIMIT 2`;
    if(originals.length!==1||!originals[0].contentData?.startsWith('data:application/pdf;base64,'))return {document,pages:[]};
    return {document,pages:originals};
  }
  const jobs=await db.$queryRaw`
    SELECT j."id",j."resultJson" FROM "AiReaderJob" j
    WHERE j."companyId"=${companyId} AND j."storeId"=${document.storeId}
      AND j."purchaseDocumentId"=${document.id} ORDER BY j."createdAt",j."id" LIMIT 1`;
  const job=jobs[0];if(!job)return {document,pages:[]};
  const receiptIds=job.resultJson?.mydataPosReceipt?.attachmentIds;
  if(Array.isArray(receiptIds)&&receiptIds.length){
    const receiptPages=[];
    for(const attachmentId of [...new Set(receiptIds)].slice(0,5)){
      const rows=await db.$queryRaw`SELECT "filename","mimeType","contentData" FROM "DocumentAttachment" WHERE "id"=${attachmentId} AND "companyId"=${companyId} AND "storeId"=${document.storeId} LIMIT 1`;
      if(!rows[0]?.contentData)return {document,pages:[]};
      receiptPages.push(rows[0]);
    }
    return {document,pages:receiptPages};
  }
  const ids=[job.id,...(Array.isArray(job.resultJson?.posHandoff?.pageJobIds)?job.resultJson.posHandoff.pageJobIds:[]).filter(id=>id!==job.id)].slice(0,5);
  const pages=[];
  for(const pageId of ids){
    const rows=await db.$queryRaw`SELECT a."filename",a."mimeType",a."contentData"
      FROM "AiReaderJob" j JOIN "DocumentAttachment" a ON a."id"=j."attachmentId" AND a."companyId"=j."companyId"
      WHERE j."id"=${pageId} AND j."companyId"=${companyId} AND j."storeId"=${document.storeId} LIMIT 1`;
    if(!rows[0]?.contentData)return {document,pages:[]};
    pages.push(rows[0]);
  }
  return {document,pages};
}

