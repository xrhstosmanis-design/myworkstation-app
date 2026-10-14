import crypto from "node:crypto";

const error=(message,code="INVOICE_RECONCILIATION_REQUIRED")=>Object.assign(new Error(message),{status:409,code});
const tax=value=>String(value||"").replace(/\D/g,"");
const day=value=>value?new Date(value).toISOString().slice(0,10):"";
const amount=value=>Number(value||0);
const round=value=>Math.round((value+Number.EPSILON)*100)/100;
const schemas=new WeakMap();
export function invoiceNumberParts(value){
 const text=String(value||"").normalize("NFD").replace(/\p{M}/gu,"").trim().toUpperCase();
 const match=text.match(/^(.*?)(\d+)\s*$/);
 return match?{series:match[1].replace(/[^A-ZΑ-Ω0-9]/g,""),number:match[2].replace(/^0+(?=\d)/,"")}:{series:"",number:""};
}
export function sameInvoiceNumber(value,series,number){
 const left=invoiceNumberParts(value),right=invoiceNumberParts([series,number].filter(Boolean).join(" "));
 return Boolean(left.number&&left.number===right.number&&(!left.series||left.series===right.series));
}
// A warning may cross supplier identities; automatic reuse must never do so.
// Require the complete series/number, issue day, type and a corroborating total.
export function sameInvoiceIdentityForReview(left,right){
 const a=invoiceNumberParts(left.documentNumber),b=invoiceNumberParts(right.documentNumber);
 const grossA=amount(left.totalGross),grossB=amount(right.totalGross);
 return Boolean(a.number&&a.number===b.number&&a.series===b.series&&day(left.documentDate)&&day(left.documentDate)===day(right.documentDate)
  &&left.documentType===right.documentType&&Number.isFinite(grossA)&&Number.isFinite(grossB)&&grossA>0&&grossB>0&&Math.abs(grossA-grossB)<=.050001);
}
const inboundType=row=>String(row.invoiceType||"1.1").startsWith("5.")?"CREDIT_NOTE":"INVOICE";
export async function ensureInvoiceCommonDraftSchema(db){
 if(!schemas.has(db))schemas.set(db,(async()=>{
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "InvoiceDraftAlias" (
   "aliasOrderId" TEXT PRIMARY KEY,"aliasDocumentId" TEXT NOT NULL UNIQUE,
   "companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"canonicalOrderId" TEXT NOT NULL,"canonicalDocumentId" TEXT NOT NULL,
   "inboxId" TEXT NOT NULL,"mark" TEXT NOT NULL,"details" JSONB NOT NULL,"actorId" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "InvoiceDraftAlias_scope_idx" ON "InvoiceDraftAlias"("companyId","storeId","canonicalOrderId")`);
  // Same legacy posting schema used by the purchase-order route. Original
  // acquisition can run before that route is opened on a fresh database.
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PurchaseOrderPosting" (
   "orderId" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"supplierId" TEXT,"documentFingerprint" TEXT,"purchaseDocumentId" TEXT,
   "postedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"postedByUserId" TEXT,"postedByName" TEXT,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrderPosting_fingerprint_key" ON "PurchaseOrderPosting"("companyId","documentFingerprint") WHERE "documentFingerprint" IS NOT NULL`);
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "InvoiceStockPosting" (
   "companyId" TEXT NOT NULL,"sourceDocumentId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"orderId" TEXT,
   "postedDocumentId" TEXT NOT NULL,"path" TEXT NOT NULL,"postedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   PRIMARY KEY("companyId","sourceDocumentId"))`);
 })().catch(e=>{schemas.delete(db);throw e}));
 return schemas.get(db);
}
// All creation, merge and posting paths take this store lock before row locks.
// It also protects two routes whose invoice-number spellings differ.
export async function lockInvoiceStore(tx,companyId,storeId){
 if(!companyId||!storeId)throw error("Απαιτείται συγκεκριμένη εταιρεία και κατάστημα.");
 await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`invoice-common:${companyId}:${storeId}`})) IS NULL) AS "locked"`;
}
export async function invoiceAlias(db,companyId,{orderId=null,documentId=null}){
 const rows=await db.$queryRaw`SELECT * FROM "InvoiceDraftAlias" WHERE "companyId"=${companyId}
  AND ((CAST(${orderId} AS text) IS NOT NULL AND "aliasOrderId"=${orderId}) OR (CAST(${documentId} AS text) IS NOT NULL AND "aliasDocumentId"=${documentId})) LIMIT 1`;
 return rows[0]||null;
}
async function inbound(db,{companyId,storeId,inboxId}){
 const rows=await db.$queryRaw`SELECT m.*,i."attachmentId",i."status" AS "inboxStatus",a."mimeType",
  (SELECT j."purchaseDocumentId" FROM "AiReaderJob" j WHERE j."attachmentId"=i."attachmentId" AND j."companyId"=m."companyId" AND j."storeId"=m."storeId"
   AND j."purchaseDocumentId" IS NOT NULL ORDER BY j."createdAt",j."id" LIMIT 1) AS "jobDocumentId"
  FROM "MyDataInboundDocument" m JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
  LEFT JOIN "DocumentAttachment" a ON a."id"=i."attachmentId" AND a."companyId"=i."companyId" AND a."storeId"=i."storeId"
  WHERE m."companyId"=${companyId} AND m."storeId"=${storeId} AND m."inboxId"=${inboxId} LIMIT 1`;
 if(!rows[0])throw Object.assign(error("Δεν βρέθηκε η εγγραφή myDATA στο επιλεγμένο κατάστημα."),{status:404});
 return rows[0];
}
async function candidateOrders(db,row){
 const numeric=invoiceNumberParts(row.documentNumber).number;
 const rows=await db.$queryRaw`SELECT o."id" AS "orderId",o."status",o."sourceDocumentId" AS "documentId",o."createdAt",o."updatedAt",o."invoiceNumber",
  o."supplierId",s."taxId",s."name" AS "supplierName",d."supplierId" AS "documentSupplierId",d."updatedAt" AS "documentUpdatedAt",d."documentDate",d."documentNumber",d."documentType",d."totalGross",d."status" AS "documentStatus",d."paymentTransactionId",
  md5(row_to_json(t)::text) AS "paymentVersion",t."invoiceDocumentNumber" AS "paymentInvoiceNumber",
  t."supplierId" AS "paymentSupplierId",paid."taxId" AS "paymentTaxId",t."amount" AS "paymentAmount",t."reversedAt",t."type" AS "paymentType",t."storeId" AS "paymentStoreId",
  (SELECT COUNT(*)::int FROM "PurchaseOrderLine" l WHERE l."orderId"=o."id") AS "lineCount",
  (SELECT md5(COALESCE(string_agg(row_to_json(l)::text,'|' ORDER BY l."id"),'')) FROM "PurchaseOrderLine" l WHERE l."orderId"=o."id") AS "lineVersion",
  (SELECT md5(COALESCE(string_agg(row_to_json(l)::text,'|' ORDER BY l."id"),'')) FROM "PurchaseDocumentLine" l WHERE l."purchaseDocumentId"=d."id") AS "documentLineVersion"
  FROM "PurchaseOrder" o JOIN "PurchaseDocument" d ON d."id"=o."sourceDocumentId" AND d."companyId"=o."companyId" AND d."storeId"=o."storeId"
  LEFT JOIN "Supplier" s ON s."id"=o."supplierId" AND s."companyId"=o."companyId"
  LEFT JOIN "StoreTransaction" t ON t."id"=d."paymentTransactionId" AND t."companyId"=d."companyId"
  LEFT JOIN "Supplier" paid ON paid."id"=t."supplierId" AND paid."companyId"=t."companyId"
  WHERE o."companyId"=${row.companyId} AND o."storeId"=${row.storeId} AND o."sourceType"='POS_OCR_DRAFT'
   AND o."status" IN ('NEW','FINAL','INVOICED') AND d."status" IN ('DRAFT','APPROVED')
   AND (o."id"=${row.rawPayload?.mydataDraftOrderId||""} OR d."id"=${row.jobDocumentId||""}
    OR (COALESCE(NULLIF(LTRIM(SUBSTRING(COALESCE(o."invoiceNumber",'') FROM '([0-9]+)[^0-9]*$'),'0'),''),'0')=${numeric}
     AND (REGEXP_REPLACE(COALESCE(s."taxId",''),'[^0-9]','','g')=${row.issuerVat}
      OR (d."documentType"=${inboundType(row)} AND (d."documentDate" AT TIME ZONE 'UTC')::date=${day(row.issueDate)}::date
       AND ABS(d."totalGross"-${amount(row.totalGross)})<=0.050001
       AND REGEXP_REPLACE(UPPER(REGEXP_REPLACE(COALESCE(d."documentNumber",o."invoiceNumber",''),'[0-9]+[^0-9]*$','')),'[^A-ZΑ-Ω0-9]','','g')=${invoiceNumberParts([row.series,row.documentNumber].filter(Boolean).join(" ")).series}))))
  ORDER BY o."createdAt",o."id" LIMIT 21`;
 if(rows.length>20)throw error("Πολλές πιθανές αντιστοιχίσεις· περιόρισε τον έλεγχο των παραστατικών.");
 return rows.map(o=>({...o,lineCount:Number(o.lineCount),totalGross:amount(o.totalGross),paymentAmount:o.paymentAmount==null?null:amount(o.paymentAmount),
  supplierReviewRequired:!tax(o.taxId)||tax(o.taxId)!==tax(row.issuerVat),
  exact:Boolean(tax(o.taxId)&&tax(o.taxId)===tax(row.issuerVat)&&o.documentType===inboundType(row)&&sameInvoiceNumber(o.documentNumber,row.series,row.documentNumber)&&day(o.documentDate)===day(row.issueDate)&&Math.abs(amount(o.totalGross)-amount(row.totalGross))<=.050001),
  isMyData:o.orderId===row.rawPayload?.mydataDraftOrderId||o.documentId===row.jobDocumentId}));
}
const version=(row,orders)=>crypto.createHash("sha256").update(JSON.stringify({inboxId:row.inboxId,mark:row.mark,attachmentId:row.attachmentId,issuerVat:row.issuerVat,series:row.series,documentNumber:row.documentNumber,issueDate:row.issueDate,totalGross:row.totalGross,invoiceType:row.invoiceType,
 orderId:row.rawPayload?.mydataDraftOrderId,orders:orders.map(o=>[o.orderId,o.documentId,o.status,o.documentStatus,o.updatedAt,o.documentUpdatedAt,o.lineVersion,o.documentLineVersion,o.supplierId,o.documentSupplierId,o.taxId,o.paymentVersion,o.invoiceNumber,o.documentDate,o.totalGross,o.lineCount,o.paymentTransactionId,o.paymentAmount])})).digest("hex");
export async function previewInvoiceReconciliation(db,scope){
 const row=await inbound(db,scope),orders=await candidateOrders(db,row);
 const verifiedSuppliers=await db.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "companyId"=${scope.companyId} AND "active"=true AND REGEXP_REPLACE(COALESCE("taxId",''),'[^0-9]','','g')=${tax(row.issuerVat)} ORDER BY "id" LIMIT 21`;
 const lines=orders.length?await db.$queryRaw`SELECT row_to_json(l) AS "row" FROM "PurchaseOrderLine" l WHERE l."orderId"=ANY(${orders.map(o=>o.orderId)}::text[]) ORDER BY l."orderId",l."ocrSequence" NULLS LAST,l."createdAt",l."id" LIMIT 1001`:[];
 if(lines.length>1000)throw error("Περισσότερες από 1000 γραμμές απαιτούν χωριστό έλεγχο.");
 const files=orders.length?await db.$queryRaw`SELECT DISTINCT a."id",a."filename",a."mimeType",j."purchaseDocumentId"
  FROM "AiReaderJob" j JOIN "DocumentAttachment" a ON a."companyId"=j."companyId" AND a."storeId"=j."storeId"
   AND (a."id"=j."attachmentId" OR a."id" IN (SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(j."resultJson"->'mydataPosReceipt'->'attachmentIds')='array' THEN j."resultJson"->'mydataPosReceipt'->'attachmentIds' ELSE '[]'::jsonb END)))
  WHERE j."companyId"=${scope.companyId} AND j."storeId"=${scope.storeId}
   AND j."purchaseDocumentId"=ANY(${orders.map(o=>o.documentId)}::text[]) ORDER BY a."id"`:[];
 return {inboxId:row.inboxId,mark:row.mark,issuerVat:row.issuerVat,documentNumber:[row.series,row.documentNumber].filter(Boolean).join(" "),
  issueDate:day(row.issueDate),totalGross:amount(row.totalGross),originalAvailable:row.mimeType==="application/pdf",commonDraft:row.rawPayload?.commonDraft||null,version:version(row,orders),orders,files,verifiedSuppliers,lines:lines.map(l=>l.row)};
}
async function postedOrders(tx,companyId,orders){
 if(!orders.length)return [];
 const rows=await tx.$queryRaw`SELECT "orderId","purchaseDocumentId" FROM "PurchaseOrderPosting" WHERE "companyId"=${companyId} AND "orderId"=ANY(${orders.map(o=>o.orderId)}::text[])`;
 const stock=await tx.$queryRaw`SELECT "sourceDocumentId" FROM "InvoiceStockPosting" WHERE "companyId"=${companyId} AND "sourceDocumentId"=ANY(${orders.map(o=>o.documentId)}::text[])`;
 const approved=orders.filter(o=>o.documentStatus==="APPROVED"||o.status!=="NEW");
 return [...new Set([...rows.map(o=>o.orderId),...approved.map(o=>o.orderId),...orders.filter(o=>stock.some(p=>p.sourceDocumentId===o.documentId)).map(o=>o.orderId)])];
}
// Caller holds the store lock. A merge changes references, not money or stock.
export async function reconcileInvoiceDrafts(tx,scope,{posOrderId,expectedVersion,confirmSameInvoice=false,confirmMark,confirmPaymentDiscrepancy=false,verifiedSupplierId=null,confirmSupplierCorrection=false,confirmPaymentSupplierCorrection=false,selectedRowsOrderId=null,reason="",automatic=false,actorId=null}){
 await lockInvoiceStore(tx,scope.companyId,scope.storeId);
 const row=await inbound(tx,scope);
 const previous=await invoiceAlias(tx,scope.companyId,{orderId:posOrderId});
 if(previous){if(previous.storeId!==scope.storeId||previous.inboxId!==scope.inboxId)throw error("Η παλιά αντιστοίχιση ανήκει σε άλλη εγγραφή.");return {ok:true,reused:true,orderId:previous.canonicalOrderId,documentId:previous.canonicalDocumentId,stockUpdated:false,paymentChanged:false};}
 let orders=await candidateOrders(tx,row);
 if((row.rawPayload?.mydataDraftOrderId||row.jobDocumentId)&&!orders.some(o=>o.isMyData))throw error("Το συνδεδεμένο πρόχειρο έχει διαγραφεί. Δεν δημιουργείται δεύτερο.");
 const pos=orders.find(o=>o.orderId===posOrderId);
 if(!pos)throw error("Δεν βρέθηκε το επιλεγμένο πρόχειρο POS.");
 const supplierCorrection=tax(pos.taxId)!==tax(row.issuerVat);
 if(supplierCorrection&&(automatic||!confirmSupplierCorrection||!verifiedSupplierId))throw error("Δεν συμφωνεί το ΑΦΜ του επιλεγμένου προχείρου POS. Επιβεβαίωσε τον σωστό προμηθευτή από τα πρωτότυπα.");
 if(supplierCorrection&&!sameInvoiceIdentityForReview(pos,{documentNumber:[row.series,row.documentNumber].filter(Boolean).join(" "),documentDate:row.issueDate,documentType:inboundType(row),totalGross:row.totalGross}))throw error("Η διόρθωση προμηθευτή απαιτεί ίδιο πλήρη αριθμό, ημερομηνία, τύπο και ποσό.");
 if(pos.documentType!==(String(row.invoiceType).startsWith("5.")?"CREDIT_NOTE":"INVOICE"))throw error("Ο τύπος τιμολογίου/πιστωτικού δεν συμφωνεί.");
 if(!row.attachmentId||row.mimeType!=="application/pdf")throw error("Απαιτείται το πρωτότυπο PDF της συγκεκριμένης εγγραφής myDATA.");
 const original=orders.find(o=>o.isMyData);
 // After a completed merge, opening its canonical order is idempotent as well.
 const recorded=row.rawPayload?.commonDraft;
 if(recorded?.orderId===posOrderId&&recorded?.completed===true)return {ok:true,reused:true,orderId:recorded.orderId,documentId:recorded.documentId,stockUpdated:false,paymentChanged:false};
 if(pos.isMyData)throw error("Επίλεξε το υπάρχον πρόχειρο POS για αντιστοίχιση.");
 if(expectedVersion&&version(row,orders)!==expectedVersion)throw error("Τα πρόχειρα άλλαξαν. Άνοιξε νέα προεπισκόπηση πριν από την αντιστοίχιση.","INVOICE_RECONCILIATION_STALE");
 if(!automatic&&(!confirmSameInvoice||String(confirmMark)!==String(row.mark)||String(reason).trim().length<5))throw error("Επιβεβαίωσε τα δύο πρωτότυπα, το MARK και την αιτιολογία της αντιστοίχισης.");
 if(automatic&&!pos.exact)throw error("Τα στοιχεία χρειάζονται ανθρώπινο έλεγχο πριν από την αντιστοίχιση.");
 const initialVersion=version(row,orders);
 const pair=[pos,...(original&&original.orderId!==pos.orderId?[original]:[])];
 await tx.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "id"=ANY(${pair.map(o=>o.orderId).sort()}::text[]) ORDER BY "id" FOR UPDATE`;
 await tx.$queryRaw`SELECT "id" FROM "PurchaseDocument" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "id"=ANY(${pair.map(o=>o.documentId).sort()}::text[]) ORDER BY "id" FOR UPDATE`;
 await tx.$queryRaw`SELECT "id" FROM "StoreTransaction" WHERE "companyId"=${scope.companyId} AND "id"=ANY(${pair.map(o=>o.paymentTransactionId).filter(Boolean).sort()}::text[]) ORDER BY "id" FOR UPDATE`;
 const refreshed=await candidateOrders(tx,row);
 if(version(row,refreshed)!==initialVersion)throw error("Τα πρόχειρα άλλαξαν κατά τον έλεγχο. Ανανέωσε την προεπισκόπηση.","INVOICE_RECONCILIATION_STALE");
 const posted=await postedOrders(tx,scope.companyId,pair);
 if((supplierCorrection||selectedRowsOrderId)&&posted.length)throw error("Η διόρθωση προμηθευτή ή επιλογή πίνακα επιτρέπεται μόνο σε δύο μη καταχωρημένα πρόχειρα.");
 let verifiedSupplier=null;
 if(supplierCorrection){
  const suppliers=await tx.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "id"=${verifiedSupplierId} AND "companyId"=${scope.companyId} AND "active"=true FOR SHARE`;
  verifiedSupplier=suppliers[0];
  if(!verifiedSupplier||tax(verifiedSupplier.taxId)!==tax(row.issuerVat))throw error("Ο επιλεγμένος ενεργός προμηθευτής πρέπει να έχει το ΑΦΜ myDATA στην ίδια εταιρεία.");
 }
 if(posted.length>1)throw error("Και τα δύο παραστατικά έχουν ήδη καταχώρηση. Απαιτείται χωριστός έλεγχος κινήσεων αποθήκης· δεν έγινε νέα κίνηση.","INVOICE_ALREADY_DOUBLE_POSTED");
 const payments=pair.filter(o=>o.paymentTransactionId);
 if(new Set(payments.map(o=>o.paymentTransactionId)).size>1)throw error("Υπάρχουν διαφορετικές πληρωμές στα δύο πρόχειρα. Απαιτείται έλεγχος πριν από την ενοποίηση.");
 for(const p of payments){
  if(p.reversedAt||p.paymentType!=="SUPPLIER_PAYMENT"||p.paymentStoreId!==scope.storeId||!(p.paymentAmount>0))throw error("Η υπάρχουσα πληρωμή χρειάζεται έλεγχο· δεν μεταβλήθηκε.");
  if(tax(p.paymentTaxId)!==tax(row.issuerVat)&&(!supplierCorrection||!confirmPaymentSupplierCorrection||!pair.some(o=>o.supplierId===p.paymentSupplierId)||invoiceNumberParts(p.paymentInvoiceNumber).number!==invoiceNumberParts(pos.invoiceNumber).number||invoiceNumberParts(p.paymentInvoiceNumber).series!==invoiceNumberParts(pos.invoiceNumber).series))throw error("Επιβεβαίωσε χωριστά τη διόρθωση προμηθευτή της ίδιας αρχικής πληρωμής· δεν δημιουργείται νέα πληρωμή.");
 }
 const payment=payments[0]||null,difference=payment?round(payment.paymentAmount-amount(row.totalGross)):0;
 if(Math.abs(difference)>.050001&&(automatic||!confirmPaymentDiscrepancy))throw error(`Η υπάρχουσα πληρωμή διαφέρει κατά ${difference.toFixed(2)} €. Επιβεβαίωσε ότι διατηρείται αμετάβλητη για έλεγχο.`);
 // Prefer the posted invoice; otherwise retain the payment's original source ID.
 const populated=pair.filter(o=>o.lineCount>0);
 const selectedRows=selectedRowsOrderId?pair.find(o=>o.orderId===selectedRowsOrderId&&o.lineCount>0):null;
 if(selectedRowsOrderId&&!selectedRows)throw error("Επίλεξε έναν υπάρχοντα πίνακα γραμμών αυτής της αντιστοίχισης.");
 if(populated.length>1&&(automatic||!selectedRows))throw error("Και τα δύο πρόχειρα περιέχουν γραμμές. Επίλεξε τον σωστό πίνακα· ο άλλος διατηρείται στο ιστορικό.","INVOICE_REVIEWED_ROWS_CONFLICT");
 const canonical=selectedRows||pair.find(o=>posted.includes(o.orderId))||payment||pos;
 const aliases=pair.filter(o=>o.orderId!==canonical.orderId);
 for(const alias of aliases)if(alias.documentStatus!=="DRAFT"||alias.status!=="NEW")throw error("Μόνο το μη καταχωρημένο δεύτερο πρόχειρο γίνεται ιστορική αναφορά.");
 if(posted.length&&populated.some(o=>o.orderId!==canonical.orderId))throw error("Η ήδη καταχωρημένη αγορά δεν αντικαθίσταται από άλλο πίνακα γραμμών.");
 const jobRows=await tx.$queryRaw`SELECT j."id",j."attachmentId",j."resultJson",j."createdAt",j."purchaseDocumentId",a."mimeType"
  FROM "AiReaderJob" j JOIN "DocumentAttachment" a ON a."id"=j."attachmentId" AND a."companyId"=j."companyId" AND a."storeId"=j."storeId"
  WHERE j."companyId"=${scope.companyId} AND j."storeId"=${scope.storeId} AND (j."purchaseDocumentId"=ANY(${pair.map(o=>o.documentId)}::text[]) OR j."attachmentId"=${row.attachmentId})
  ORDER BY j."createdAt",j."id" FOR UPDATE OF j`;
 const primary=jobRows[0];if(!primary)throw error("Δεν βρέθηκαν οι εργασίες και τα πρωτότυπα του τιμολογίου.");
 const photoIds=[...new Set(jobRows.flatMap(j=>[...(j.mimeType?.startsWith("image/")?[j.attachmentId]:[]),...(j.resultJson?.mydataPosReceipt?.attachmentIds||[])]))];
 if(photoIds.length>5)throw error("Περισσότερες από πέντε φωτογραφίες χρειάζονται έλεγχο πριν από την ενοποίηση.");
 if(photoIds.length){const pages=await tx.$queryRaw`SELECT "id","mimeType" FROM "DocumentAttachment" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "id"=ANY(${photoIds}::text[])`;
  if(pages.length!==photoIds.length||pages.some(p=>!['application/pdf','image/jpeg','image/png','image/webp'].includes(p.mimeType)))throw error("Δεν βρέθηκαν όλα τα πρωτότυπα POS στο ίδιο κατάστημα και εταιρεία.");
 }
 const common={completed:true,orderId:canonical.orderId,documentId:canonical.documentId,inboxId:row.inboxId,mark:row.mark,
  aliasOrderIds:aliases.map(o=>o.orderId),paymentTransactionId:payment?.paymentTransactionId||null,paymentDifference:difference,requiresPaymentReview:Math.abs(difference)>.050001};
 const paymentSupplierCorrection=Boolean(payment&&tax(payment.paymentTaxId)!==tax(row.issuerVat));
 if(paymentSupplierCorrection){
  const settlementTable=await tx.$queryRaw`SELECT to_regclass('"SupplierPaymentSettlement"') IS NOT NULL AS "exists"`;
  if(settlementTable[0]?.exists){const settlements=await tx.$queryRaw`SELECT "id" FROM "SupplierPaymentSettlement" WHERE "companyId"=${scope.companyId} AND "transactionId"=${payment.paymentTransactionId} LIMIT 1`;if(settlements.length)throw error("Η πληρωμή έχει ήδη διακανονισμό ή κατανομή. Απαιτείται χωριστός έλεγχος προμηθευτή· δεν μεταβλήθηκε.");}
  const linked=await tx.$queryRaw`SELECT "id" FROM "PurchaseDocument" WHERE "companyId"=${scope.companyId} AND "paymentTransactionId"=${payment.paymentTransactionId} AND NOT ("id"=ANY(${pair.map(o=>o.documentId)}::text[])) LIMIT 1`;
  if(linked.length)throw error("Η ίδια πληρωμή συνδέεται με άλλο παραστατικό· δεν μεταβλήθηκε.");
 }
 const paymentRows=payment?await tx.$queryRaw`SELECT row_to_json(t) AS "row" FROM "StoreTransaction" t WHERE "id"=${payment.paymentTransactionId} AND "companyId"=${scope.companyId}`:[];
 const details={...common,reason:automatic?"Exact verified invoice identity":String(reason).trim(),automatic,actorId,before:pair,selectedRowsOrderId:selectedRows?.orderId||null,verifiedSupplier:verifiedSupplier||null,supplierCorrection,paymentSupplierCorrection,paymentBefore:paymentRows[0]?.row||null,photoAttachmentIds:photoIds,pdfAttachmentId:row.attachmentId,stockChanged:false,paymentChanged:false};
 if(supplierCorrection){
  await tx.$executeRaw`UPDATE "PurchaseOrder" SET "supplierId"=${verifiedSupplier.id},"updatedAt"=NOW() WHERE "id"=${canonical.orderId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "status"='NEW'`;
  await tx.$executeRaw`UPDATE "PurchaseDocument" SET "supplierId"=${verifiedSupplier.id},"updatedAt"=NOW() WHERE "id"=${canonical.documentId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "status"='DRAFT'`;
  if(paymentSupplierCorrection)await tx.$executeRaw`UPDATE "StoreTransaction" SET "supplierId"=${verifiedSupplier.id} WHERE "id"=${payment.paymentTransactionId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "type"='SUPPLIER_PAYMENT' AND "reversedAt" IS NULL`;
 }
 if(!posted.length){
  await tx.$executeRaw`UPDATE "PurchaseDocument" SET "documentNumber"=${[row.series,row.documentNumber].filter(Boolean).join(" ")},"documentDate"=${new Date(row.issueDate)},"totalGross"=${amount(row.totalGross)},
   "paymentTransactionId"=COALESCE("paymentTransactionId",${payment?.paymentTransactionId||null}),"settlementMode"=CASE WHEN ${Boolean(payment)} THEN 'PAID' ELSE "settlementMode" END,"updatedAt"=NOW()
   WHERE "id"=${canonical.documentId} AND "companyId"=${scope.companyId} AND "status"='DRAFT'`;
  const paymentNote=Math.abs(difference)>.050001?` • Διαφορά πληρωμής ${difference.toFixed(2)} € — απαιτείται έλεγχος`:"";
  await tx.$executeRaw`UPDATE "PurchaseOrder" SET "invoiceNumber"=${[row.series,row.documentNumber].filter(Boolean).join(" ")},"description"=COALESCE("description",'')||${` • Κοινό POS/myDATA • MARK ${row.mark}${paymentNote}`},"updatedAt"=NOW() WHERE "id"=${canonical.orderId} AND "companyId"=${scope.companyId}`;
 }
 for(const alias of aliases){
  if(alias.lineCount>0&&!selectedRows)await tx.$executeRaw`UPDATE "PurchaseOrderLine" SET "orderId"=${canonical.orderId} WHERE "orderId"=${alias.orderId}`;
  await tx.$executeRaw`INSERT INTO "InvoiceDraftAlias"("aliasOrderId","aliasDocumentId","companyId","storeId","canonicalOrderId","canonicalDocumentId","inboxId","mark","details","actorId")
   VALUES(${alias.orderId},${alias.documentId},${scope.companyId},${scope.storeId},${canonical.orderId},${canonical.documentId},${row.inboxId},${row.mark},${JSON.stringify(details)}::jsonb,${actorId})`;
  await tx.$executeRaw`UPDATE "PurchaseOrder" SET "status"='MERGED',"updatedAt"=NOW() WHERE "id"=${alias.orderId} AND "companyId"=${scope.companyId}`;
  await tx.$executeRaw`UPDATE "PurchaseDocument" SET "status"='MERGED',"updatedAt"=NOW() WHERE "id"=${alias.documentId} AND "companyId"=${scope.companyId}`;
 }
 const receipt={attachmentIds:photoIds,paymentTransactionId:payment?.paymentTransactionId||null,receivedAt:jobRows.find(j=>j.resultJson?.posHandoff)?.createdAt||new Date().toISOString(),requiresHumanReceiptReview:true};
 for(const j of jobRows)await tx.$executeRaw`UPDATE "AiReaderJob" SET "purchaseDocumentId"=${canonical.documentId},"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({commonDraft:common,...(j.id===primary.id&&photoIds.length?{mydataPosReceipt:receipt}:{})})}::jsonb,"updatedAt"=NOW() WHERE "id"=${j.id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`;
 await tx.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"=COALESCE("rawPayload",'{}'::jsonb)||${JSON.stringify({mydataDraftOrderId:canonical.orderId,mydataDraftDocumentId:canonical.documentId,commonDraft:common,...(supplierCorrection||selectedRows?{reconciliationAudit:details}:{})})}::jsonb WHERE "inboxId"=${row.inboxId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`;
 return {ok:true,reused:false,orderId:canonical.orderId,documentId:canonical.documentId,aliasOrderIds:aliases.map(o=>o.orderId),paymentDifference:difference,requiresPaymentReview:common.requiresPaymentReview,supplierCorrection,paymentSupplierCorrection,stockUpdated:false,paymentChanged:false};
}
// Called during original acquisition. Exact POS-first headers can reuse its
// existing draft; uncertain candidates keep the PDF for the review screen.
export async function attachInboundToExistingDraft(tx,scope,actorId){
 const row=await inbound(tx,scope),orders=await candidateOrders(tx,row),pos=orders.filter(o=>!o.isMyData);
 if((row.rawPayload?.mydataDraftOrderId||row.jobDocumentId)&&!orders.some(o=>o.isMyData))throw error("Το συνδεδεμένο πρόχειρο έχει διαγραφεί. Δεν δημιουργείται δεύτερο.");
 if(!pos.length)return null;
 const exact=pos.filter(o=>o.exact);
 if(exact.length!==1||pos.length!==1)return {reconciliationRequired:true,candidateOrderIds:pos.map(o=>o.orderId),downloaded:false};
 try{return {...await reconcileInvoiceDrafts(tx,scope,{posOrderId:exact[0].orderId,automatic:true,actorId}),purchaseOrderId:exact[0].orderId,downloaded:false};}
 catch(e){if(e.status===409)return {reconciliationRequired:true,candidateOrderIds:pos.map(o=>o.orderId),downloaded:false};throw e}
}
async function inboundTableExists(tx){const rows=await tx.$queryRaw`SELECT to_regclass('"MyDataInboundDocument"') IS NOT NULL AS "exists"`;return rows[0]?.exists===true}
export async function assertNoUnresolvedInbound(tx,identity){
 if(!await inboundTableExists(tx))return;
 const parts=invoiceNumberParts(identity.documentNumber);if(!parts.number)return;
 const rows=await tx.$queryRaw`SELECT "mark","issuerVat","series","documentNumber","issueDate","invoiceType","totalGross","rawPayload" FROM "MyDataInboundDocument"
  WHERE "companyId"=${identity.companyId} AND "storeId"=${identity.storeId}
   AND COALESCE(NULLIF(LTRIM("documentNumber",'0'),''),'0')=${parts.number}
   AND ("issuerVat"=${tax(identity.supplierTaxId)} OR (
    REGEXP_REPLACE(UPPER(COALESCE("series",'')),'[^A-ZΑ-Ω0-9]','','g')=${parts.series}
    AND ("issueDate" AT TIME ZONE 'UTC')::date=${day(identity.documentDate)||null}::date
    AND ABS("totalGross"-${amount(identity.totalGross)})<=0.050001
    AND (CASE WHEN "invoiceType" LIKE '5.%' THEN 'CREDIT_NOTE' ELSE 'INVOICE' END)=${identity.documentType||"INVOICE"})) LIMIT 21`;
 const sameSupplier=rows.filter(r=>tax(identity.supplierTaxId)&&tax(r.issuerVat)===tax(identity.supplierTaxId));
 const crossSupplier=rows.filter(r=>(!tax(identity.supplierTaxId)||tax(r.issuerVat)!==tax(identity.supplierTaxId))&&sameInvoiceIdentityForReview(
  {...identity,documentType:identity.documentType||"INVOICE"},{documentNumber:[r.series,r.documentNumber].filter(Boolean).join(" "),documentDate:r.issueDate,documentType:inboundType(r),totalGross:r.totalGross}));
 if(crossSupplier.length)throw error(`Πιθανό διπλό τιμολόγιο ${identity.documentNumber}: ίδιος αριθμός, ημερομηνία και ποσό στη θυρίδα myDATA, αλλά διαφορετικό ή κενό ΑΦΜ. Έλεγξε τα πρωτότυπα και τον προμηθευτή πριν από νέα πληρωμή ή πρόχειρο.`,"INVOICE_SUPPLIER_IDENTITY_REVIEW");
 const exact=sameSupplier.filter(r=>sameInvoiceNumber(identity.documentNumber,r.series,r.documentNumber)&&day(r.issueDate)===day(identity.documentDate)&&Math.abs(amount(r.totalGross)-amount(identity.totalGross))<=.050001);
 if(sameSupplier.length&&exact.length!==1)throw error("Υπάρχει πιθανό ίδιο τιμολόγιο στη θυρίδα myDATA με διαφορετικά στοιχεία. Αντιστοίχισε τα πρωτότυπα στο BackOffice πριν από νέα πληρωμή ή πρόχειρο.");
}
// Covers the race where myDATA created its shell after POS's initial precheck.
// Payment validation has already run in the POS route; this binds stored pages.
export async function reuseInboundDraftForPosJob(tx,identity,{jobId,paymentTransactionId=null}){
 if(!await inboundTableExists(tx))return null;
 await assertNoUnresolvedInbound(tx,identity);
 const numeric=invoiceNumberParts(identity.documentNumber).number;
 const rows=await tx.$queryRaw`SELECT m.*,i."attachmentId",j."id" AS "originalJobId",j."resultJson",d."id" AS "documentId",d."paymentTransactionId",d."documentNumber" AS "purchaseNumber",d."documentType",o."id" AS "orderId"
  FROM "MyDataInboundDocument" m JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
  JOIN "AiReaderJob" j ON j."attachmentId"=i."attachmentId" AND j."companyId"=m."companyId" AND j."storeId"=m."storeId"
  JOIN "PurchaseDocument" d ON d."id"=j."purchaseDocumentId" AND d."companyId"=m."companyId" AND d."storeId"=m."storeId"
  JOIN "PurchaseOrder" o ON o."sourceDocumentId"=d."id" AND o."companyId"=m."companyId" AND o."storeId"=m."storeId"
  WHERE m."companyId"=${identity.companyId} AND m."storeId"=${identity.storeId} AND m."issuerVat"=${tax(identity.supplierTaxId)}
   AND COALESCE(NULLIF(LTRIM(m."documentNumber",'0'),''),'0')=${numeric}
   AND (${invoiceNumberParts(identity.documentNumber).series}='' OR REGEXP_REPLACE(UPPER(COALESCE(m."series",'')),'[^A-ZΑ-Ω0-9]','','g')=${invoiceNumberParts(identity.documentNumber).series}) AND d."status"='DRAFT' AND o."status"='NEW' LIMIT 2`;
 if(!rows.length)return null;
 if(rows.length!==1)throw error("Πολλαπλά πρόχειρα myDATA απαιτούν έλεγχο πριν από τη σύνδεση POS.");
 const row=rows[0];
 if(!sameInvoiceNumber(identity.documentNumber,row.series,row.documentNumber)||day(row.issueDate)!==day(identity.documentDate)||Math.abs(amount(row.totalGross)-amount(identity.totalGross))>.050001||row.documentType!==identity.documentType)throw error("Τα στοιχεία POS και myDATA δεν συμφωνούν για κοινό πρόχειρο.");
 if(row.paymentTransactionId&&row.paymentTransactionId!==paymentTransactionId)throw error("Η κοινή αγορά έχει διαφορετική πληρωμή· δεν αντικαθίσταται.");
 if(row.resultJson?.mydataPosReceipt?.receivedAt)throw error("Το τιμολόγιο έχει ήδη παραληφθεί από POS· δεν συνδέεται δεύτερη υποβολή.");
 const jobs=await tx.$queryRaw`SELECT "id","resultJson","attachmentId" FROM "AiReaderJob" WHERE "id"=${jobId} AND "companyId"=${identity.companyId} AND "storeId"=${identity.storeId} LIMIT 1`;
 if(!jobs[0])throw error("Δεν βρέθηκε η αποθηκευμένη παραλαβή POS.");
 const ids=[...new Set([jobId,...(jobs[0].resultJson?.posHandoff?.pageJobIds||[])])];
 if(ids.length>5)throw error("Περισσότερες από πέντε σελίδες POS απαιτούν έλεγχο.");
 const pages=await tx.$queryRaw`SELECT j."id",j."attachmentId",j."purchaseDocumentId",a."mimeType" FROM "AiReaderJob" j
  JOIN "DocumentAttachment" a ON a."id"=j."attachmentId" AND a."companyId"=j."companyId" AND a."storeId"=j."storeId"
  WHERE j."companyId"=${identity.companyId} AND j."storeId"=${identity.storeId} AND j."id"=ANY(${ids}::text[]) ORDER BY j."id"`;
 if(pages.length!==ids.length||pages.some(p=>p.purchaseDocumentId&&p.purchaseDocumentId!==row.documentId))throw error("Οι φωτογραφίες ανήκουν σε διαφορετικό πρόχειρο.");
 const receipt={attachmentIds:[...new Set(pages.map(p=>p.attachmentId))],paymentTransactionId,receivedAt:new Date().toISOString(),requiresHumanReceiptReview:true};
 for(const page of pages)await tx.$executeRaw`UPDATE "AiReaderJob" SET "purchaseDocumentId"=${row.documentId},"updatedAt"=NOW() WHERE "id"=${page.id} AND "companyId"=${identity.companyId} AND "storeId"=${identity.storeId}`;
 await tx.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({mydataPosReceipt:receipt})}::jsonb,"updatedAt"=NOW() WHERE "id"=${row.originalJobId} AND "companyId"=${identity.companyId} AND "storeId"=${identity.storeId}`;
 await tx.$executeRaw`UPDATE "PurchaseDocument" SET "paymentTransactionId"=COALESCE("paymentTransactionId",${paymentTransactionId}),"settlementMode"=CASE WHEN ${Boolean(paymentTransactionId)} THEN 'PAID' ELSE "settlementMode" END,"updatedAt"=NOW() WHERE "id"=${row.documentId} AND "companyId"=${identity.companyId} AND "storeId"=${identity.storeId}`;
 await tx.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"||${JSON.stringify({mydataPosReceipt:receipt,mydataDraftOrderId:row.orderId,mydataDraftDocumentId:row.documentId})}::jsonb WHERE "inboxId"=${row.inboxId} AND "companyId"=${identity.companyId} AND "storeId"=${identity.storeId}`;
 return {documentId:row.documentId,orderId:row.orderId,reused:true,myDataMatched:true};
}
export async function assertInvoiceStockAvailable(tx,{companyId,storeId,sourceDocumentId,orderId=null}){
 await lockInvoiceStore(tx,companyId,storeId);
 const alias=await invoiceAlias(tx,companyId,{orderId,documentId:sourceDocumentId});
 if(alias)throw Object.assign(error("Το δεύτερο πρόχειρο έχει ενοποιηθεί. Άνοιξε την κοινή αγορά· δεν έγινε δεύτερη καταχώρηση.","INVOICE_DRAFT_MERGED"),{canonicalOrderId:alias.canonicalOrderId});
 const posted=await tx.$queryRaw`SELECT * FROM "InvoiceStockPosting" WHERE "companyId"=${companyId} AND "sourceDocumentId"=${sourceDocumentId} LIMIT 1`;
 if(posted[0])throw error("Το κοινό τιμολόγιο έχει ήδη ενημερώσει την αποθήκη. Δεν έγινε δεύτερη καταχώρηση.","INVOICE_ALREADY_POSTED");
 const legacy=await tx.$queryRaw`SELECT "id" FROM "PurchaseDocument" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND ("id"=${sourceDocumentId} OR "id"=${orderId}) AND "status"='APPROVED' LIMIT 1`;
 const legacyOrders=await tx.$queryRaw`SELECT p."orderId" FROM "PurchaseOrderPosting" p JOIN "PurchaseOrder" o ON o."id"=p."orderId" AND o."companyId"=p."companyId" WHERE p."companyId"=${companyId} AND o."storeId"=${storeId} AND o."sourceDocumentId"=${sourceDocumentId} LIMIT 1`;
 if(legacy.length||legacyOrders.length)throw error("Το πρωτότυπο έχει ήδη εγκριθεί στην αποθήκη. Δεν έγινε δεύτερη καταχώρηση.","INVOICE_ALREADY_POSTED");
 // Check both approval entry points, even when no orderId was supplied. The
 // store lock serializes concurrent postings; aliases retain MERGED status.
 const current=await tx.$queryRaw`SELECT "id","documentNumber","documentDate","documentType","totalGross" FROM "PurchaseDocument"
  WHERE "id"=${sourceDocumentId} AND "companyId"=${companyId} AND "storeId"=${storeId} AND "sourceType"='POS_OCR_DRAFT' LIMIT 1`;
 if(current[0]){
  const doc=current[0],parts=invoiceNumberParts(doc.documentNumber);
  if(parts.number){
   const duplicates=await tx.$queryRaw`SELECT d."id",d."documentNumber",d."documentDate",d."documentType",d."totalGross",o."id" AS "orderId"
    FROM "PurchaseDocument" d JOIN "PurchaseOrder" o ON o."sourceDocumentId"=d."id" AND o."companyId"=d."companyId" AND o."storeId"=d."storeId"
    WHERE d."companyId"=${companyId} AND d."storeId"=${storeId} AND d."id"<>${sourceDocumentId} AND d."sourceType"='POS_OCR_DRAFT'
     AND d."status" IN ('DRAFT','APPROVED') AND o."status" IN ('NEW','FINAL','INVOICED')
     AND d."documentType"=${doc.documentType} AND (d."documentDate" AT TIME ZONE 'UTC')::date=${day(doc.documentDate)}::date
     AND ABS(d."totalGross"-${amount(doc.totalGross)})<=0.050001
     AND COALESCE(NULLIF(LTRIM(SUBSTRING(d."documentNumber" FROM '([0-9]+)[^0-9]*$'),'0'),''),'0')=${parts.number}
     AND REGEXP_REPLACE(UPPER(REGEXP_REPLACE(COALESCE(d."documentNumber",''),'[0-9]+[^0-9]*$','')),'[^A-ZΑ-Ω0-9]','','g')=${parts.series} LIMIT 21`;
   if(duplicates.some(other=>sameInvoiceIdentityForReview(doc,other)))throw error(`Πιθανό διπλό τιμολόγιο ${doc.documentNumber}: υπάρχουν δύο ενεργά πρόχειρα με ίδιο αριθμό, ημερομηνία και ποσό, ακόμη και με διαφορετικό ΑΦΜ. Έλεγξε τα πρωτότυπα και τον προμηθευτή πριν από την καταχώρηση. Δεν έγινε κίνηση αποθήκης.`,"INVOICE_DUPLICATE_REVIEW_REQUIRED");
  }
 }
 if(orderId&&await inboundTableExists(tx)){
  const originals=await tx.$queryRaw`SELECT m.* FROM "MyDataInboundDocument" m
   JOIN "Supplier" s ON REGEXP_REPLACE(COALESCE(s."taxId",''),'[^0-9]','','g')=m."issuerVat" AND s."companyId"=m."companyId"
   JOIN "PurchaseOrder" o ON o."supplierId"=s."id" AND o."companyId"=s."companyId" AND o."storeId"=m."storeId"
   WHERE o."id"=${orderId} AND m."companyId"=${companyId} AND m."storeId"=${storeId}
    AND COALESCE(NULLIF(LTRIM(m."documentNumber",'0'),''),'0')=COALESCE(NULLIF(LTRIM(SUBSTRING(o."invoiceNumber" FROM '([0-9]+)[^0-9]*$'),'0'),''),'0') LIMIT 21`;
  if(originals.some(row=>row.rawPayload?.commonDraft?.completed&&row.rawPayload.commonDraft.orderId===orderId))return;
  for(const row of originals){const others=await candidateOrders(tx,row);if(others.some(o=>o.orderId!==orderId))throw error("Υπάρχουν δύο ενεργά πρόχειρα για έλεγχο POS/myDATA. Κάνε πρώτα αντιστοίχιση των πρωτοτύπων· δεν έγινε κίνηση αποθήκης.");}
 }
}
export async function recordInvoiceStockPosting(tx,{companyId,storeId,sourceDocumentId,orderId=null,postedDocumentId,path}){
 await tx.$executeRaw`INSERT INTO "InvoiceStockPosting"("companyId","sourceDocumentId","storeId","orderId","postedDocumentId","path") VALUES(${companyId},${sourceDocumentId},${storeId},${orderId},${postedDocumentId},${path})`;
}


