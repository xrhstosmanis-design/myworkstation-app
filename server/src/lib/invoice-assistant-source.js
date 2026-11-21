import {readCapturedPaymentOriginal} from './invoice-recovery-original.js';
import {lockInvoiceStore} from './invoice-common-draft.js';
export async function loadInvoiceAssistantSource(db,companyId,orderId,context={}){
  if(context.manualPhotos){
    const orders=await db.$queryRaw`
      SELECT o."id",o."storeId",o."invoiceNumber" AS "documentNumber",o."supplierId",NULL AS "totalGross"
      FROM "PurchaseOrder" o WHERE o."id"=${orderId} AND o."companyId"=${companyId}
        AND o."storeId"=${context.storeId} AND o."status"='NEW' AND NOT o."awaitingInvoice"
        AND o."sourceType" IS NULL AND o."sourceDocumentId" IS NULL LIMIT 1`;
    return orders.length?{document:orders[0],pages:context.manualPhotos}:null;
  }
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
  if(job.resultJson?.captureRecovery){
    // Recovery reads the same retained original; never fall through to unrelated
    // receipt photos when its explicit source identity is stale or incomplete.
    return db.$transaction(async tx=>{
      await lockInvoiceStore(tx,companyId,document.storeId);
      const chains=await tx.$queryRaw`SELECT d."id",d."storeId",d."supplierId",d."documentNumber",d."documentDate",d."totalGross",d."paymentTransactionId",j."resultJson" FROM "PurchaseOrder" o JOIN "PurchaseDocument" d ON d."id"=o."sourceDocumentId" AND d."companyId"=o."companyId" AND d."storeId"=o."storeId" JOIN "AiReaderJob" j ON j."purchaseDocumentId"=d."id" AND j."companyId"=d."companyId" AND j."storeId"=d."storeId" WHERE o."id"=${orderId} AND o."companyId"=${companyId} AND o."status"='NEW' AND o."sourceType"='POS_OCR_DRAFT' AND d."id"=${document.id} AND d."documentType"='INVOICE' AND d."status"='DRAFT' AND d."sourceType"='POS_OCR_DRAFT' AND d."settlementMode"='PAID' AND o."supplierId"=d."supplierId" AND j."id"=${job.id} FOR SHARE OF o,d,j`;
      const chain=chains[0],binding=chain?.resultJson?.captureRecovery;
      if(chains.length!==1||binding?.version!=='CAPTURE_RECOVERY_V1'||!chain.paymentTransactionId||binding.transactionId!==chain.paymentTransactionId)return {document,pages:[]};
      const original=await readCapturedPaymentOriginal(tx,{companyId,storeId:chain.storeId,supplierId:chain.supplierId,documentNumber:chain.documentNumber,documentDate:chain.documentDate,totalGross:chain.totalGross},chain.paymentTransactionId);
      if(binding.proofId!==original.proofId||binding.fingerprint!==original.fingerprint)return {document,pages:[]};
      return {document:{...document,supplierId:chain.supplierId,documentNumber:chain.documentNumber,totalGross:chain.totalGross,storeId:chain.storeId},pages:original.pages.map(({filename,mimeType,contentData})=>({filename,mimeType,contentData}))};
    });
  }
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
  const handoffIds=job.resultJson?.posHandoff?.pageJobIds;
  // BackOffice intake links secondary jobs directly to the draft, without a POS handoff.
  const secondaryIds=Array.isArray(handoffIds)&&handoffIds.length
    ?handoffIds
    :(await db.$queryRaw`
      SELECT "id" FROM "AiReaderJob"
      WHERE "companyId"=${companyId} AND "storeId"=${document.storeId}
        AND "purchaseDocumentId"=${document.id} AND "status"='MERGED_PAGE'
        AND "id"<>${job.id} ORDER BY "createdAt","id" LIMIT 4`).map(page=>page.id);
  const ids=[...new Set([job.id,...secondaryIds])].slice(0,5);
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

