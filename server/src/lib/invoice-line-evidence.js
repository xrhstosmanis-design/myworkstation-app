const tax=v=>String(v||"").replace(/\D/g,"");
const cents=v=>Math.round(Number(v)*100);
const normalized=v=>String(v||"").normalize("NFD").replace(/\p{M}/gu,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");
const rowKey=l=>[normalized(l.description),Number(l.quantity),cents(l.netAmount),cents(l.grossAmount)].join(":");
const total=rows=>rows.reduce((sum,l)=>sum+Number(l.grossAmount||0),0);
const failure=message=>Object.assign(new Error(message),{status:409,code:"INVOICE_LINE_IDENTITY_REVIEW"});
export function compareInvoiceRowsForReview(left,right){
 if(!Array.isArray(left)||!Array.isArray(right)||left.length<3||left.length!==right.length)return null;
 if(left.some(l=>!normalized(l.description)||!(Number(l.quantity)>0)||!Number.isFinite(Number(l.netAmount))||!Number.isFinite(Number(l.grossAmount)))||right.some(l=>!normalized(l.description)||!(Number(l.quantity)>0)||!Number.isFinite(Number(l.netAmount))||!Number.isFinite(Number(l.grossAmount))))return null;
 const a=total(left),b=total(right);if(!(a>0&&b>0)||Math.abs(a-b)>.050001)return null;
 const remaining=new Map();for(const l of right){const k=rowKey(l);remaining.set(k,(remaining.get(k)||0)+1)}
 let matchedRows=0;const names=new Set();
 for(const l of left){const k=rowKey(l);if(remaining.get(k)>0){matchedRows++;names.add(normalized(l.description));remaining.set(k,remaining.get(k)-1)}}
 if(names.size<3||matchedRows<Math.ceil(left.length*.6))return null;
 return {matchedRows,lineCount:left.length,leftTotal:Math.round(a*100)/100,rightTotal:Math.round(b*100)/100,requiresOriginalReview:true};
}
// Deliberately only a review candidate. Bad OCR headers never qualify for auto reuse.
export async function lineEvidenceCandidates(db,row){
 if(!row.rawPayload?.mydataDraftOrderId&&!row.jobDocumentId)return [];
 const originals=await db.$queryRaw`SELECT o."id",o."createdAt",jsonb_agg(to_jsonb(l) ORDER BY l."id") AS "lines"
 FROM "PurchaseOrder" o JOIN "PurchaseDocument" d ON d."id"=o."sourceDocumentId" AND d."companyId"=o."companyId" AND d."storeId"=o."storeId"
 JOIN "PurchaseOrderLine" l ON l."orderId"=o."id"
 WHERE o."companyId"=${row.companyId} AND o."storeId"=${row.storeId}
  AND (o."id"=${row.rawPayload?.mydataDraftOrderId||""} OR d."id"=${row.jobDocumentId||""})
  AND o."status" IN ('NEW','FINAL','INVOICED') AND d."status" IN ('DRAFT','APPROVED')
 GROUP BY o."id",o."createdAt"`;
 if(originals.length!==1||!Array.isArray(originals[0].lines)||originals[0].lines.length<3||!tax(row.issuerVat))return [];
 const original=originals[0],rowsTotal=total(original.lines);
 const possible=await db.$queryRaw`SELECT o."id",jsonb_agg(to_jsonb(l) ORDER BY l."id") AS "lines"
 FROM "PurchaseOrder" o JOIN "PurchaseDocument" d ON d."id"=o."sourceDocumentId" AND d."companyId"=o."companyId" AND d."storeId"=o."storeId"
 JOIN "Supplier" s ON s."id"=o."supplierId" AND s."companyId"=o."companyId"
 JOIN "PurchaseOrderLine" l ON l."orderId"=o."id"
 WHERE o."companyId"=${row.companyId} AND o."storeId"=${row.storeId} AND o."id"<>${original.id}
  AND o."sourceType"='POS_OCR_DRAFT' AND o."status" IN ('NEW','FINAL','INVOICED') AND d."status" IN ('DRAFT','APPROVED')
  AND d."documentType"=${String(row.invoiceType||"1.1").startsWith("5.")?"CREDIT_NOTE":"INVOICE"}
  AND REGEXP_REPLACE(COALESCE(s."taxId",''),'[^0-9]','','g')=${tax(row.issuerVat)}
  AND ABS(EXTRACT(EPOCH FROM (o."createdAt"-${new Date(original.createdAt)}::timestamptz)))<=604800
 GROUP BY o."id" HAVING COUNT(*)=${original.lines.length} AND ABS(SUM(l."grossAmount")-${rowsTotal})<=0.050001
 ORDER BY o."id" LIMIT 21`;
 if(possible.length>20)throw failure("Πολλά πρόχειρα με παρόμοιες γραμμές. Απαιτείται χωριστός έλεγχος πρωτοτύπων.");
 return possible.flatMap(p=>{const evidence=compareInvoiceRowsForReview(p.lines,original.lines);return evidence?[{orderId:p.id,...evidence}]:[]});
}
export async function assertNoLineEvidenceDuplicate(db,{companyId,storeId,sourceDocumentId}){
 const current=(await db.$queryRaw`SELECT o."id",o."createdAt",s."taxId",COUNT(l."id")::int AS "lineCount",SUM(l."grossAmount") AS "rowsTotal"
 FROM "PurchaseOrder" o JOIN "PurchaseDocument" d ON d."id"=o."sourceDocumentId" AND d."companyId"=o."companyId" AND d."storeId"=o."storeId"
 LEFT JOIN "Supplier" s ON s."id"=o."supplierId" AND s."companyId"=o."companyId"
 JOIN "PurchaseOrderLine" l ON l."orderId"=o."id"
 WHERE o."companyId"=${companyId} AND o."storeId"=${storeId} AND d."id"=${sourceDocumentId}
  AND o."sourceType"='POS_OCR_DRAFT' AND o."status" IN ('NEW','FINAL','INVOICED') AND d."status" IN ('DRAFT','APPROVED')
 GROUP BY o."id",o."createdAt",s."taxId"`)[0];
 if(!current||current.lineCount<3)return;
 const incoming=await db.$queryRaw`SELECT m.*,(SELECT j."purchaseDocumentId" FROM "AiReaderJob" j JOIN "DocumentInbox" i ON i."attachmentId"=j."attachmentId" AND i."companyId"=j."companyId" AND i."storeId"=j."storeId" WHERE i."id"=m."inboxId" AND j."companyId"=m."companyId" AND j."storeId"=m."storeId" AND j."purchaseDocumentId" IS NOT NULL ORDER BY j."createdAt",j."id" LIMIT 1) AS "jobDocumentId"
 FROM "MyDataInboundDocument" m WHERE m."companyId"=${companyId} AND m."storeId"=${storeId}
  AND (m."rawPayload"->>'mydataDraftOrderId'=${current.id} OR m."issuerVat"=${tax(current.taxId)})
  AND ABS(m."totalGross"-${Number(current.rowsTotal)})<=0.050001
  AND ABS(EXTRACT(EPOCH FROM (m."fetchedAt"-${new Date(current.createdAt)}::timestamptz)))<=604800
 ORDER BY m."id" LIMIT 21`;
 if(incoming.length>20)throw failure("Πολλά πιθανά πρωτότυπα. Έλεγξε τη θυρίδα πριν από καταχώρηση.");
 for(const row of incoming){const candidates=await lineEvidenceCandidates(db,row);if(candidates.some(c=>c.orderId===current.id)||row.rawPayload?.mydataDraftOrderId===current.id&&candidates.length)throw failure("Πιθανό διπλό POS/myDATA: ίδιο ΑΦΜ και πολλές ίδιες γραμμές, αλλά διαφορετικά βασικά στοιχεία. Έλεγξε τα πρωτότυπα και κράτησε έναν πίνακα πριν από καταχώρηση. Δεν έγινε κίνηση αποθήκης.");}
}
