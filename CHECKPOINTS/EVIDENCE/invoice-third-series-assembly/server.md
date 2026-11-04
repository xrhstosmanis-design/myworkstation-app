 }else if(v.invoicePaymentId!==null||v.invoiceGrossPayment!==null||original.length)return denied(version);
 return {verified:true,version};
}
export async function ensureInvoiceCommonDraftSchema(db){
 if(!schemas.has(db))schemas.set(db,(async()=>{
  await db.$executeRawUnsafe(`ALTER TABLE IF EXISTS "PurchaseOrder" ADD COLUMN IF NOT EXISTS "reopenVersion" INTEGER NOT NULL DEFAULT 0`);
async function candidateOrders(db,row){
 const numeric=invoiceNumberParts(row.documentNumber).number;
 const lineMatches=await lineEvidenceCandidates(db,row),lineMatchMap=new Map(lineMatches.map(x=>[x.orderId,x]));
 const rows=await db.$queryRaw`SELECT o."id" AS "orderId",o."status",o."sourceDocumentId" AS "documentId",o."createdAt",o."updatedAt",o."invoiceNumber",
  o."supplierId",s."taxId",s."name" AS "supplierName",d."supplierId" AS "documentSupplierId",d."updatedAt" AS "documentUpdatedAt",d."documentDate",d."documentNumber",d."documentType",d."totalGross",d."status" AS "documentStatus",d."paymentTransactionId",
  md5(row_to_json(t)::text) AS "paymentVersion",t."invoiceDocumentNumber" AS "paymentInvoiceNumber",
  t."supplierId" AS "paymentSupplierId",paid."taxId" AS "paymentTaxId",t."amount" AS "paymentAmount",t."reversedAt",t."type" AS "paymentType",t."storeId" AS "paymentStoreId",
  exact:Boolean(tax(o.taxId)&&tax(o.taxId)===tax(row.issuerVat)&&o.documentType===inboundType(row)&&sameInvoiceNumber(o.documentNumber,row.series,row.documentNumber)&&day(o.documentDate)===day(row.issueDate)&&Math.abs(amount(o.totalGross)-amount(row.totalGross))<=.050001),
  isMyData:o.orderId===row.rawPayload?.mydataDraftOrderId||o.documentId===row.jobDocumentId}));
 for(const o of mapped)if(o.paymentTransactionId&&o.paymentAmount<0){const proof=await inspectAppliedCreditForMerge(db,row,o);o.creditPaymentVerified=proof.verified;o.creditProofVersion=proof.version;}
 return mapped;
}
const version=(row,orders)=>crypto.createHash("sha256").update(JSON.stringify({inboxId:row.inboxId,mark:row.mark,attachmentId:row.attachmentId,issuerVat:row.issuerVat,series:row.series,documentNumber:row.documentNumber,issueDate:row.issueDate,totalGross:row.totalGross,invoiceType:row.invoiceType,
 orderId:row.rawPayload?.mydataDraftOrderId,orders:orders.map(o=>[o.orderId,o.documentId,o.status,o.documentStatus,o.updatedAt,o.documentUpdatedAt,o.lineVersion,o.documentLineVersion,o.supplierId,o.documentSupplierId,o.taxId,o.paymentVersion,o.invoiceNumber,o.documentNumber,o.documentType,o.documentDate,o.totalGross,o.lineCount,o.paymentTransactionId,o.paymentAmount,o.creditProofVersion])})).digest("hex");
export async function previewInvoiceReconciliation(db,scope){
 const row=await inbound(db,scope),orders=await candidateOrders(db,row);
 const verifiedSuppliers=await db.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "companyId"=${scope.companyId} AND "active"=true AND REGEXP_REPLACE(COALESCE("taxId",''),'[^0-9]','','g')=${tax(row.issuerVat)} ORDER BY "id" LIMIT 21`;
  WHERE j."companyId"=${scope.companyId} AND j."storeId"=${scope.storeId}
   AND j."purchaseDocumentId"=ANY(${orders.map(o=>o.documentId)}::text[]) ORDER BY a."id"`:[];
 const registered=orders.find(o=>o.isMyData&&(o.status==="INVOICED"||o.documentStatus==="APPROVED"));
 return {appliedCreditReviewSupported:true,documentType:inboundType(row),additionalDraftReviewSupported:true,registered:Boolean(registered),registeredOrderId:registered?.orderId||null,inboxId:row.inboxId,mark:row.mark,issuerVat:row.issuerVat,documentNumber:[row.series,row.documentNumber].filter(Boolean).join(" "),
  issueDate:day(row.issueDate),totalGross:amount(row.totalGross),originalAvailable:row.mimeType==="application/pdf",commonDraft:row.rawPayload?.commonDraft||null,version:version(row,orders),orders,files,verifiedSuppliers,lines:lines.map(l=>l.row)};
}
async function postedOrders(tx,companyId,orders){
  if(tax(p.paymentTaxId)!==tax(row.issuerVat)&&(!supplierCorrection||!confirmPaymentSupplierCorrection||!pair.some(o=>o.supplierId===p.paymentSupplierId)||invoiceNumberParts(p.paymentInvoiceNumber).number!==invoiceNumberParts(pos.invoiceNumber).number||invoiceNumberParts(p.paymentInvoiceNumber).series!==invoiceNumberParts(pos.invoiceNumber).series))throw error("Επιβεβαίωσε χωριστά τη διόρθωση προμηθευτή της ίδιας αρχικής πληρωμής· δεν δημιουργείται νέα πληρωμή.");
 }
 const payment=payments[0]||null,settledCredit=Boolean(payment&&payment.paymentAmount<0);
 if(settledCredit&&(automatic||!expectedVersion||supplierCorrection||pos.headerReviewRequired||!payment.creditPaymentVerified))throw error("Το ήδη εφαρμοσμένο πιστωτικό απαιτεί χειροκίνητο έλεγχο του αρχικού ιστορικού.","INVOICE_CREDIT_REVIEW_REQUIRED");
 if(settledCredit&&selectedRowsOrderId&&selectedRowsOrderId!==payment.orderId)throw error("Διατηρείται το αρχικό πιστωτικό και ο πίνακάς του, ώστε να παραμείνει έγκυρος ο υπάρχων συμψηφισμός.","INVOICE_CREDIT_CANONICAL_CHANGE");
 if(settledCredit&&!payment.lineCount&&pair.some(o=>o.orderId!==payment.orderId&&o.lineCount>0))throw error("Έλεγξε πρώτα τις γραμμές του αρχικού πιστωτικού. Δεν αντικαθίστανται από άλλο πρόχειρο.","INVOICE_CREDIT_EMPTY_ROWS");
 const difference=payment?round(payment.paymentAmount-(inboundType(row)==="CREDIT_NOTE"?-amount(row.totalGross):amount(row.totalGross))):0;
  if(linked.length)throw error("Η ίδια πληρωμή συνδέεται με άλλο παραστατικό· δεν μεταβλήθηκε.");
 }
 const paymentRows=payment?await tx.$queryRaw`SELECT row_to_json(t) AS "row" FROM "StoreTransaction" t WHERE "id"=${payment.paymentTransactionId} AND "companyId"=${scope.companyId}`:[];
 const details={...common,headerCorrection:Boolean(pos.headerReviewRequired),lineEvidence:pos.lineEvidence||null,inheritedSupplier,reason:automatic?"Exact verified invoice identity":String(reason).trim(),automatic,actorId,before:pair,selectedRowsOrderId:selectedRows?.orderId||null,verifiedSupplier:verifiedSupplier||null,supplierCorrection,paymentSupplierCorrection,paymentBefore:paymentRows[0]?.row||null,photoAttachmentIds:photoIds,pdfAttachmentId:row.attachmentId,stockChanged:false,paymentChanged:false};
 if(inheritedSupplier&&!continuing){
  await tx.$executeRaw`UPDATE "PurchaseOrder" SET "supplierId"=${inheritedSupplier.id},"updatedAt"=NOW() WHERE "id"=${canonical.orderId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "status"='NEW'`;
  await tx.$executeRaw`UPDATE "PurchaseDocument" SET "supplierId"=${inheritedSupplier.id},"updatedAt"=NOW() WHERE "id"=${canonical.documentId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "status"='DRAFT'`;
