// Read-only evidence collection. No apply mode, no mutations.
import {prisma} from '../src/prisma.js';
const company='cmulmjjoa000oqlbfyi0h53ju';
const store='cmulmjjoc000qqlbf2bn2ifj0';
const settlement='3e033309-d399-4e07-aa7b-eb5801ed51d2';
const document='0c61189e-844b-4a42-ae8e-2089bf888d9e';
try {
 if(process.argv.length!==2) throw Error('Preview accepts no arguments');
 const result=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`;
  const rows=await tx.$queryRaw`
    SELECT ss."id", ss."status", ss."paymentMethod", ss."note",
      ss."supplierId", t."id" AS "transactionId", t."amount",
      t."supplierId" AS "transactionSupplierId", t."sessionId", t."reversedAt",
      t."type", t."paymentMethod" AS "transactionMethod",
      s."name" AS "paymentSupplier", s."taxId" AS "paymentTaxId",
      p."id" AS "documentId", p."supplierId" AS "documentSupplierId",
      d."name" AS "documentSupplier", d."taxId" AS "documentTaxId",
      p."documentNumber", p."documentDate", p."totalGross",
      p."status" AS "documentStatus", p."settlementMode", p."paymentTransactionId",
      (SELECT count(*) FROM "SupplierPaymentAllocation" a WHERE a."settlementId"=ss."id") AS "paymentAllocations",
      (SELECT count(*) FROM "SupplierPaymentAllocation" a WHERE a."purchaseDocumentId"=p."id") AS "documentAllocations",
      EXISTS(SELECT 1 FROM "BankLedgerEntry" b WHERE b."sourceTransactionId"=t."id") AS bank,
      EXISTS(SELECT 1 FROM "StoreOperatorAudit" a WHERE a."companyId"=ss."companyId" AND a."storeId"=ss."storeId" AND a."eventType"='SUPPLIER_SETTLEMENT_NO_DOCUMENT_DECLARED' AND a."details"->>'transactionId'=t."id" AND a."details"->>'advanceAcknowledged'='true') AS "declaredAdvance"
    FROM "SupplierPaymentSettlement" ss
    JOIN "StoreTransaction" t ON t."id"=ss."transactionId" AND t."companyId"=ss."companyId" AND t."storeId"=ss."storeId"
    JOIN "Supplier" s ON s."id"=ss."supplierId" AND s."companyId"=ss."companyId"
    JOIN "PurchaseDocument" p ON p."id"=${document} AND p."companyId"=ss."companyId" AND p."storeId"=ss."storeId"
    JOIN "Supplier" d ON d."id"=p."supplierId" AND d."companyId"=p."companyId"
    WHERE ss."id"=${settlement} AND ss."companyId"=${company} AND ss."storeId"=${store}`;
  if(rows.length!==1)throw Error('Expected exactly one payment/document pair');
  const r=rows[0];
  const checks={
    pendingCash:r.status==='PENDING_REVIEW'&&r.paymentMethod==='CASH_SHIFT'&&r.transactionMethod==='CASH_SHIFT'&&r.type==='SUPPLIER_PAYMENT'&&!!r.sessionId&&!r.reversedAt&&!r.bank,
    exactAmount:Number(r.amount)===90.17&&Number(r.totalGross)===90.17,
    exactReference:/\\b035375\\b/.test(r.note||'')&&String(r.documentNumber).trim().endsWith(' 35375'),
    unallocated:Number(r.paymentAllocations)===0&&Number(r.documentAllocations)===0&&!r.paymentTransactionId,
    expectedDraft:r.documentStatus==='DRAFT'&&r.settlementMode===null,
    declaredAdvance:r.declaredAdvance===true,
    consistentPaymentSupplier:r.supplierId===r.transactionSupplierId,
    supplierIdentityVerified:!!r.paymentTaxId&&String(r.paymentTaxId)===String(r.documentTaxId)
  };
  return {mode:'PREVIEW_ONLY',checks,record:r,writeAllowed:false};
 });
 console.log(JSON.stringify(result,(_,v)=>typeof v==='bigint'?v.toString():v,2));
 if(Object.values(result.checks).some(v=>!v))process.exitCode=2;
} catch(e){console.error('PREVIEW STOPPED:',e.message);process.exitCode=1;}
finally{await prisma.$disconnect();}
