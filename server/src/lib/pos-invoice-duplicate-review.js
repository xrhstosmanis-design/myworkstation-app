// These are conservative review candidates, never canonical invoice identity
// or authority to reuse a draft/payment. Callers retain their exact checks.
export function invoiceNumericSuffix(value){
 const digits=String(value??'').trim().match(/([0-9]+)\s*$/)?.[1];
 return digits===undefined?'':digits.replace(/^0+(?=[0-9])/,'');
}

function context(identity){
 const companyId=String(identity?.companyId||'').trim(),storeId=String(identity?.storeId||'').trim(),supplierId=String(identity?.supplierId||'').trim();
 // This optional VAT must come from the caller's same-company Supplier row,
 // never directly from an HTTP request or an OCR assertion.
 const tax=String(identity?.supplierTaxId||'').replace(/\D/g,''),supplierTaxId=/^[0-9]{9}$/.test(tax)?tax:'';
 const number=invoiceNumericSuffix(identity?.documentNumber),gross=Number(identity?.totalGross),documentType=identity?.documentType??'INVOICE';
 if(!companyId||!storeId||(!supplierId&&!supplierTaxId)||number===''||!Number.isFinite(gross)||gross<=0||!['INVOICE','CREDIT_NOTE'].includes(documentType))return null;
 return {companyId,storeId,supplierId,supplierTaxId,number,gross,documentType};
}

export async function findCompetingPosDraftReview(db,identity,{excludeDocumentId=null}={}){
 const scope=context(identity);if(!scope)return null;
 const date=identity.documentDate==null?null:new Date(identity.documentDate);
 if(date&&!Number.isFinite(date.getTime()))return null;
 // Unknown issue day broadens REVIEW only. It must not silently disable the
 // guard or become an invented issue date.
 const issueDay=date?date.toISOString().slice(0,10):null;
 const {companyId,storeId,supplierId,supplierTaxId,number,gross,documentType}=scope;
 const rows=await db.$queryRaw`
  SELECT d."id",d."status",d."documentNumber"
  FROM "PurchaseDocument" d
  JOIN "PurchaseOrder" o ON o."sourceDocumentId"=d."id" AND o."companyId"=d."companyId" AND o."storeId"=d."storeId"
  LEFT JOIN "Supplier" ds ON ds."id"=d."supplierId" AND ds."companyId"=d."companyId"
  LEFT JOIN "Supplier" os ON os."id"=o."supplierId" AND os."companyId"=o."companyId"
  WHERE d."companyId"=${companyId} AND d."storeId"=${storeId}
   AND (d."supplierId"=${supplierId} OR (${supplierTaxId}<>'' AND REGEXP_REPLACE(COALESCE(ds."taxId",''),'[^0-9]','','g')=${supplierTaxId}))
   AND (o."supplierId"=${supplierId} OR (${supplierTaxId}<>'' AND REGEXP_REPLACE(COALESCE(os."taxId",''),'[^0-9]','','g')=${supplierTaxId}))
   AND d."sourceType"='POS_OCR_DRAFT' AND d."status" IN ('DRAFT','APPROVED') AND o."status" IN ('NEW','FINAL','INVOICED')
   AND (CAST(${excludeDocumentId} AS text) IS NULL OR d."id"<>${excludeDocumentId})
   AND d."documentType"=${documentType}
   AND (CAST(${issueDay} AS date) IS NULL OR (d."documentDate" AT TIME ZONE 'UTC')::date=${issueDay}::date)
   AND d."totalGross">0 AND ABS(d."totalGross"-${gross})<=0.050001
   AND SUBSTRING(d."documentNumber" FROM '([0-9]+)[[:space:]]*$') IS NOT NULL
   AND LTRIM(SUBSTRING(d."documentNumber" FROM '([0-9]+)[[:space:]]*$'),'0')=LTRIM(${number},'0')
  ORDER BY d."id" LIMIT 1`;
 return rows[0]?{...rows[0],reviewRequired:true}:null;
}

export async function findExistingInvoicePaymentReview(db,identity,{excludePaymentId=null}={}){
 const scope=context(identity);if(!scope||scope.documentType!=='INVOICE')return null;
 const {companyId,storeId,supplierId,supplierTaxId,number,gross}=scope;
 // Ledger-only backstop: payment time is not invoice issue day. Even when
 // the incoming header has a day, an undated prior payment stays a candidate.
 // No optional invoice relations, bootstrap, automatic relinking or writes.
 const rows=await db.$queryRaw`
  SELECT t."id",t."storeId",t."occurredAt",t."amount",t."invoiceDocumentNumber"
  FROM "StoreTransaction" t
  LEFT JOIN "Supplier" s ON s."id"=t."supplierId" AND s."companyId"=t."companyId"
  WHERE t."companyId"=${companyId} AND t."storeId"=${storeId}
   AND t."type"='SUPPLIER_PAYMENT' AND t."reversedAt" IS NULL AND t."amount">0
   AND (t."supplierId"=${supplierId} OR (${supplierTaxId}<>'' AND REGEXP_REPLACE(COALESCE(s."taxId",''),'[^0-9]','','g')=${supplierTaxId}))
   AND (CAST(${excludePaymentId} AS text) IS NULL OR t."id"<>${excludePaymentId})
   AND ABS(t."amount"-${gross})<=0.050001
   AND SUBSTRING(COALESCE(NULLIF(BTRIM(t."invoiceDocumentNumber"),''),SUBSTRING(REGEXP_REPLACE(COALESCE(t."description",''),'[[:space:]]+[—–].*$|[[:space:]]+-[[:space:]]+.*$','') FROM '(?i)(?:Τιμολόγιο|invoice)[[:space:]]+(.+)$')) FROM '([0-9]+)[[:space:]]*$') IS NOT NULL
   AND LTRIM(SUBSTRING(COALESCE(NULLIF(BTRIM(t."invoiceDocumentNumber"),''),SUBSTRING(REGEXP_REPLACE(COALESCE(t."description",''),'[[:space:]]+[—–].*$|[[:space:]]+-[[:space:]]+.*$','') FROM '(?i)(?:Τιμολόγιο|invoice)[[:space:]]+(.+)$')) FROM '([0-9]+)[[:space:]]*$'),'0')=LTRIM(${number},'0')
  ORDER BY t."occurredAt",t."id" LIMIT 1`;
 return rows[0]?{...rows[0],reviewRequired:true}:null;
}
