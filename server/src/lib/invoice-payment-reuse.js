export const invoiceToken=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");
export function paymentInvoiceNumber(payment){
  return payment?.invoiceDocumentNumber||String(payment?.description||"").match(/Τιμολόγιο\s+(.+?)(?:\s+[—–]|\s+-\s+|$)/iu)?.[1]||"";
}

// A payment belongs to the invoice, not to the operator performing a reread.
// Never use an amount, partial number or file checksum as invoice identity.
// Prefer the payment already holding the unique invoice key when historical
// duplicates exist; relinking another row would collide with that key.
export function assertReusableInvoicePayment(payment,{companyId,storeId,supplierId,supplierTaxId,documentNumber,totalGross}){
  const taxId=value=>String(value||"").replace(/\D/g,"");
  // supplierTaxId is loaded from Supplier in the same company, never from the request.
  const sameSupplier=payment?.supplierId===supplierId||Boolean(taxId(supplierTaxId)&&taxId(payment?.supplierTaxId)===taxId(supplierTaxId));
  const amount=Number(payment?.amount),total=Number(totalGross);
  const mismatches=[];
  if(!payment||payment.type!=="SUPPLIER_PAYMENT"||payment.reversedAt)mismatches.push("μη ενεργή πληρωμή");
  if(companyId&&payment?.companyId!==companyId)mismatches.push("εταιρεία");
  if(payment?.storeId!==storeId)mismatches.push("κατάστημα");
  if(!sameSupplier)mismatches.push("προμηθευτής / ΑΦΜ");
  if(!invoiceToken(documentNumber)||invoiceToken(paymentInvoiceNumber(payment))!==invoiceToken(documentNumber))mismatches.push("αριθμός τιμολογίου");
  if(!Number.isFinite(amount)||!(amount>0)||!Number.isFinite(total)||!(total>0)||Math.abs(amount-total)>0.050001){
    mismatches.push(`ποσό (πληρωμή ${Number.isFinite(amount)?amount.toFixed(2):"άγνωστο"} €, τιμολόγιο ${Number.isFinite(total)&&total>0?total.toFixed(2):"δεν εστάλη"} €)`);
  }
  if(mismatches.length)throw Object.assign(new Error(`Η υπάρχουσα πληρωμή δεν συμφωνεί: ${mismatches.join(", ")}. Δεν έγινε νέα πληρωμή.`),{status:409,code:"INVOICE_PAYMENT_MISMATCH"});
  return payment;
}

export async function findInvoicePayment(tx,{companyId,supplierId,supplierTaxId,documentNumber}){
  const token=invoiceToken(documentNumber);
  if(!token)return null;
  const paymentKey=`${companyId}:${supplierTaxId?`VAT:${supplierTaxId}`:`ID:${supplierId}`}:${token}`;
  // Strip the note before extracting the number: PostgreSQL overall regex
  // greediness can otherwise swallow the note despite a non-greedy capture.
  const rows=await tx.$queryRaw`
    SELECT t."id",t."companyId",s."taxId" AS "supplierTaxId",t."storeId",t."supplierId",t."type",t."amount",t."reversedAt",t."invoiceDocumentNumber",t."description",t."occurredAt"
    FROM "StoreTransaction" t
    LEFT JOIN "Supplier" s ON s."id"=t."supplierId" AND s."companyId"=t."companyId"
    WHERE t."companyId"=${companyId} AND t."type"='SUPPLIER_PAYMENT' AND t."reversedAt" IS NULL
      AND (t."supplierId"=${supplierId} OR (${supplierTaxId}<>'' AND REGEXP_REPLACE(COALESCE(s."taxId",''),'\\D','','g')=${supplierTaxId}))
      AND REGEXP_REPLACE(UPPER(COALESCE(NULLIF(t."invoiceDocumentNumber",''),SUBSTRING(REGEXP_REPLACE(t."description",'\\s+[—–].*$|\\s+-\\s+.*$','') FROM '(?i)Τιμολόγιο\\s+(.+)$'))),'[^A-ZΑ-Ω0-9]','','g')=${token}
    ORDER BY CASE WHEN t."invoicePaymentKey"=${paymentKey} THEN 0 ELSE 1 END, t."occurredAt" ASC, t."id" ASC LIMIT 1`;
  return rows[0]||null;
}
