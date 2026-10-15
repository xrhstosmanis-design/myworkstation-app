// Aggregate the selected store's job links once, including canonical POS photos.
// $1/$2 are the archive query's existing company/store bound parameters.
export const inboxProcessingJoin=`LEFT JOIN (
 WITH scoped_jobs AS (
  SELECT j."id",j."attachmentId",j."purchaseDocumentId",j."resultJson" FROM "AiReaderJob" j WHERE j."companyId"=$1 AND j."storeId"=$2
 ), links AS (
  SELECT j."attachmentId",j."purchaseDocumentId" FROM scoped_jobs j
  UNION ALL
  SELECT page."attachmentId",j."purchaseDocumentId" FROM scoped_jobs j
  CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(j."resultJson"->'mydataPosReceipt'->'attachmentIds')='array' THEN j."resultJson"->'mydataPosReceipt'->'attachmentIds' ELSE '[]'::jsonb END) AS page("attachmentId")
 )
 SELECT links."attachmentId",COUNT(DISTINCT o."id")::int AS "linkCount",MIN(o."id") AS "orderId",
  BOOL_OR(o."status"='INVOICED' OR d."status"='APPROVED') AS "registered",
  BOOL_OR(links."purchaseDocumentId" IS NOT NULL AND d."id" IS NULL) AS "missingLink",
  COUNT(DISTINCT t."id")::int AS "paymentCount",MAX(t."amount") AS "paymentAmount"
 FROM links
 LEFT JOIN "PurchaseDocument" d ON d."id"=links."purchaseDocumentId" AND d."companyId"=$1 AND d."storeId"=$2 AND d."status"<>'MERGED'
 LEFT JOIN "PurchaseOrder" o ON o."sourceDocumentId"=d."id" AND o."companyId"=$1 AND o."storeId"=$2 AND o."status" IN ('NEW','FINAL','INVOICED')
 LEFT JOIN "StoreTransaction" t ON t."id"=d."paymentTransactionId" AND t."companyId"=$1 AND t."storeId"=$2 AND t."type"='SUPPLIER_PAYMENT' AND t."reversedAt" IS NULL
 GROUP BY links."attachmentId"
) processing ON processing."attachmentId"=i."attachmentId"`;
export const inboxProcessingState=`CASE
 WHEN processing."linkCount">1 OR COALESCE(processing."missingLink",false) THEN 'LINK_REVIEW'
 WHEN processing."linkCount"=1 AND processing."registered" THEN 'REGISTERED'
 WHEN processing."linkCount"=1 THEN 'DRAFT'
 ELSE 'NO_DRAFT' END`;
export const inboxProcessingFields=`${inboxProcessingState} AS "processingStatus",
 CASE WHEN processing."linkCount"=1 THEN processing."orderId" ELSE NULL END AS "linkedOrderId",
 COALESCE(processing."paymentCount",0) AS "paymentCount",CASE WHEN processing."paymentCount"=1 THEN processing."paymentAmount" ELSE NULL END AS "paymentAmount"`;
