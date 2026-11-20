// Read-only, target-bounded observation for ordinary original acquisition.
// Caller owns authorization and the existing invoice-store/inbox/source locks.
// No bootstrap, body download, business repair or writer is invoked here.
const required={
 MyDataInboundDocument:['id','companyId','storeId','inboxId','mark','issuerVat','counterpartVat','series','documentNumber','issueDate','invoiceType','currency','totalNet','totalVat','totalGross','rawPayload'],
 DocumentInbox:['id','companyId','storeId','attachmentId','status','updatedAt'],
 AiReaderJob:['id','companyId','storeId','attachmentId','purchaseDocumentId','resultJson'],
 PurchaseDocument:['id','companyId','storeId','supplierId','documentNumber','documentDate','paymentTransactionId'],
 PurchaseOrder:['id','companyId','storeId','sourceDocumentId','supplierId','invoiceNumber'],Supplier:['id','companyId','taxId'],
 InvoiceDraftAlias:['aliasOrderId','aliasDocumentId','canonicalOrderId','canonicalDocumentId','companyId','storeId','inboxId','mark'],
 SupplierPaymentAllocation:['id','companyId','settlementId','purchaseDocumentId'],
 SupplierPaymentSettlement:['id','companyId','storeId','transactionId'],
 StoreTransaction:['id','companyId','storeId','attachmentFilename'],
 DocumentAttachment:['id','companyId','storeId','documentType','filename','storageKey','mimeType','checksum','contentData'],
};
const unavailable=()=>({complete:false,available:{},facts:{},transactions:[]});
const names=['inbound','inbox','jobs','documents','orders','aliases','paymentAllocations','attachments','transactions'];
const cap=100;

export async function readStandaloneOriginalSnapshot(tx,{companyId,storeId,inboxId},source){
 const catalog=await tx.$queryRawUnsafe(`SELECT c.relname AS "table",a.attname AS "column" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname=current_schema() AND c.relkind IN ('r','p') AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped`,Object.keys(required));
 if(Object.entries(required).some(([table,columns])=>columns.some(column=>!catalog.some(row=>row.table===table&&row.column===column))))return unavailable();
 if(!source?.issueDate||!source?.mark)return unavailable();
 const query=(sql,...args)=>tx.$queryRawUnsafe(sql+' LIMIT 101',...args);
 const args=[companyId,storeId,inboxId,source.mark,source.attachmentId||null];
 const inbound=await query(`SELECT m."id",m."companyId",m."storeId",m."inboxId",m."mark",m."issuerVat",m."counterpartVat",m."series",m."documentNumber",m."invoiceType",m."currency",m."totalGross"::text,m."totalNet"::text,m."totalVat"::text,m."rawPayload",m."rawPayload"->>'mydataDraftOrderId' AS "draftOrderId" FROM "MyDataInboundDocument" m WHERE m."inboxId"=$2 OR (m."companyId"=$1 AND m."mark"=$3)`,companyId,inboxId,source.mark);
 const inbox=await query(`SELECT i."id",i."companyId",i."storeId",i."attachmentId",i."status" FROM "DocumentInbox" i WHERE i."id"=$1 OR ($2::text IS NOT NULL AND i."attachmentId"=$2)`,inboxId,args[4]);
 const jobsRaw=await query(`SELECT j."id",j."companyId",j."storeId",j."attachmentId",j."purchaseDocumentId",jsonb_typeof(j."resultJson")='object' AS "metadataObject",j."resultJson"->>'myDataMark' AS "mark",j."resultJson"->>'inboxId' AS "directInboxId",j."resultJson"->>'myDataInboxId' AS "myDataInboxId" FROM "AiReaderJob" j WHERE ($4::text IS NOT NULL AND j."attachmentId"=$4) OR (j."companyId"=$1 AND j."resultJson"->>'myDataMark'=$3) OR j."resultJson"->>'inboxId'=$2 OR j."resultJson"->>'myDataInboxId'=$2`,companyId,inboxId,source.mark,args[4]);
 if(jobsRaw.some(job=>job.metadataObject!==true))return unavailable();
 const target=inbound.find(row=>row.inboxId===inboxId);
 const jobs=jobsRaw.map(job=>({...job,inboxId:job.directInboxId===inboxId||job.myDataInboxId===inboxId?inboxId:null,inboundId:job.mark===source.mark?target?.id||null:null}));
 const aliases=await query(`SELECT a."aliasOrderId" AS "id",a."companyId",a."storeId",a."inboxId",a."mark",a."aliasDocumentId",a."canonicalDocumentId",a."aliasOrderId",a."canonicalOrderId" FROM "InvoiceDraftAlias" a WHERE a."inboxId"=$1 OR (a."companyId"=$2 AND a."mark"=$3)`,inboxId,companyId,source.mark);
 const documentIds=[...new Set([...jobs.map(job=>job.purchaseDocumentId),...aliases.flatMap(alias=>[alias.aliasDocumentId,alias.canonicalDocumentId])].filter(Boolean))];
 // Neither purchase table has a physical inboxId. A selected document is an
 // observed job/alias relationship or conservative same-header candidate.
 const documents=await query(`SELECT d."id",d."companyId",d."storeId",d."paymentTransactionId",$3::text AS "inboxId" FROM "PurchaseDocument" d LEFT JOIN "Supplier" s ON s."id"=d."supplierId" AND s."companyId"=d."companyId" WHERE d."id"=ANY($4::text[]) OR (d."companyId"=$1 AND d."storeId"=$2 AND regexp_replace(COALESCE(s."taxId",''),'[^0-9]','','g')=$5 AND d."documentDate"::date=$6::date AND UPPER(regexp_replace(COALESCE(d."documentNumber",''),'[^[:alnum:]]','','g'))=UPPER(regexp_replace($7::text,'[^[:alnum:]]','','g')))`,companyId,storeId,inboxId,documentIds,source.issuerVat,source.issueDate,[source.series,source.documentNumber].filter(Boolean).join(' '));
 const relatedDocumentIds=[...new Set([...documentIds,...documents.map(document=>document.id)])];
 const orderIds=aliases.flatMap(alias=>[alias.aliasOrderId,alias.canonicalOrderId]).filter(Boolean);
 const orders=await query(`SELECT o."id",o."companyId",o."storeId",$3::text AS "inboxId" FROM "PurchaseOrder" o LEFT JOIN "Supplier" s ON s."id"=o."supplierId" AND s."companyId"=o."companyId" WHERE o."sourceDocumentId"=ANY($1::text[]) OR o."id"=ANY($2::text[]) OR (o."companyId"=$4 AND o."storeId"=$5 AND regexp_replace(COALESCE(s."taxId",''),'[^0-9]','','g')=$6 AND UPPER(regexp_replace(COALESCE(o."invoiceNumber",''),'[^[:alnum:]]','','g'))=UPPER(regexp_replace($7::text,'[^[:alnum:]]','','g')))`,relatedDocumentIds,orderIds,inboxId,companyId,storeId,source.issuerVat,[source.series,source.documentNumber].filter(Boolean).join(' '));
 const refs=[...new Set([target?.id,inboxId,args[4],...relatedDocumentIds].filter(Boolean))];
 const transactions=await query(`SELECT t."id",t."companyId",t."storeId",t."attachmentFilename" FROM "StoreTransaction" t WHERE t."attachmentFilename"=ANY($1::text[]) OR t."id"=ANY($2::text[])`,refs,documents.map(document=>document.paymentTransactionId).filter(Boolean));
 const allocationRows=await query(`SELECT a."id",a."companyId",s."storeId",a."purchaseDocumentId" AS "documentId",(s."id" IS NOT NULL AND d."id" IS NOT NULL AND t."id" IS NOT NULL AND s."companyId"=a."companyId" AND d."companyId"=a."companyId" AND t."companyId"=a."companyId" AND d."storeId"=s."storeId" AND t."storeId"=s."storeId") AS "scopeVerified" FROM "SupplierPaymentAllocation" a LEFT JOIN "SupplierPaymentSettlement" s ON s."id"=a."settlementId" LEFT JOIN "PurchaseDocument" d ON d."id"=a."purchaseDocumentId" LEFT JOIN "StoreTransaction" t ON t."id"=s."transactionId" WHERE a."purchaseDocumentId"=ANY($1::text[]) OR s."transactionId"=ANY($2::text[])`,refs,transactions.map(transaction=>transaction.id));
 if(allocationRows.some(allocation=>allocation.scopeVerified!==true))return unavailable();
 const attachments=await query(`SELECT a."id",a."companyId",a."storeId",a."mimeType",a."checksum",(a."contentData" LIKE 'data:application/pdf;base64,JVBERi0%' AND length(a."contentData")>=length('data:application/pdf;base64,')+136) AS "hasContent" FROM "DocumentAttachment" a WHERE a."id"=$1`,args[4]);
 const facts={inbound,inbox,jobs,documents,orders,aliases,paymentAllocations:allocationRows,attachments};
 if([...Object.values(facts),transactions].some(rows=>rows.length>cap))return unavailable();
 if(args[4]&&target?.rawPayload?.originalDownloaded!==true)return unavailable();
 return {complete:true,available:Object.fromEntries(names.map(name=>[name,true])),facts,transactions};
}
