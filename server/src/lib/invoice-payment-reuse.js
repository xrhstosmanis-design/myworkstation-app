export const invoiceToken=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");
export function paymentInvoiceNumber(payment){
  return payment?.invoiceDocumentNumber||String(payment?.description||"").match(/Τιμολόγιο\s+(.+?)(?:\s+[—–]|\s+-\s+|$)/iu)?.[1]||"";
}

// A payment belongs to the invoice, not to the operator performing a reread.
// Never use an amount, partial number or file checksum as invoice identity.
export function assertReusableInvoicePayment(payment,{storeId,supplierId,documentNumber,totalGross}){
  if(!payment||payment.type!=="SUPPLIER_PAYMENT"||payment.reversedAt||payment.storeId!==storeId||payment.supplierId!==supplierId||
    !invoiceToken(documentNumber)||invoiceToken(paymentInvoiceNumber(payment))!==invoiceToken(documentNumber)||
    !(Number(totalGross)>0)||Math.abs(Number(payment.amount)-Number(totalGross))>0.050001){
    throw Object.assign(new Error("Η υπάρχουσα πληρωμή δεν συμφωνεί με κατάστημα, προμηθευτή, αριθμό ή ποσό τιμολογίου. Δεν έγινε νέα πληρωμή."),{status:409,code:"INVOICE_PAYMENT_MISMATCH"});
  }
  return payment;
}

export async function findInvoicePayment(tx,{companyId,supplierId,supplierTaxId,documentNumber}){
  const token=invoiceToken(documentNumber);
  if(!token)return null;
  const rows=await tx.$queryRaw`
    SELECT t."id",t."storeId",t."supplierId",t."type",t."amount",t."reversedAt",t."invoiceDocumentNumber",t."description",t."occurredAt"
    FROM "StoreTransaction" t
    LEFT JOIN "Supplier" s ON s."id"=t."supplierId" AND s."companyId"=t."companyId"
    WHERE t."companyId"=${companyId} AND t."type"='SUPPLIER_PAYMENT' AND t."reversedAt" IS NULL
      AND (t."supplierId"=${supplierId} OR (${supplierTaxId}<>'' AND REGEXP_REPLACE(COALESCE(s."taxId",''),'\\D','','g')=${supplierTaxId}))
      AND REGEXP_REPLACE(UPPER(COALESCE(NULLIF(t."invoiceDocumentNumber",''),SUBSTRING(t."description" FROM '(?i)Τιμολόγιο\\s+(.+?)(?:\\s+[—–]|\\s+-\\s+|$)'))),'[^A-ZΑ-Ω0-9]','','g')=${token}
    ORDER BY t."occurredAt" ASC LIMIT 1`;
  return rows[0]||null;
}
