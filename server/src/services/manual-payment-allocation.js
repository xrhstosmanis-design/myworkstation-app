import crypto from 'node:crypto';
import {planManualPaymentAllocation} from '../lib/manual-payment-allocation-plan.js';
import {lockInvoiceStore} from '../lib/invoice-common-draft.js';
const fail=message=>Object.assign(new Error(message),{status:409});
const raw=(tx,sql,...args)=>tx.$queryRawUnsafe(sql,...args);
const run=(tx,sql,...args)=>tx.$executeRawUnsafe(sql,...args);
export async function manualPaymentAllocation(db,actor,input,{preview=true}={}){
 if(!actor?.id||actor.tokenType==='STORE_OPERATOR'||actor.staffAccess===true||!['OWNER','SUPER_ADMIN'].includes(actor.role))throw Object.assign(new Error('FORBIDDEN'),{status:403});
 const {companyId,storeId,settlementId,targetSupplierId,allocations,confirmSupplierChange,reason,expectedVersion}=input;
 if(![companyId,storeId,settlementId,targetSupplierId].every(v=>typeof v==='string'&&v.length>0&&v.length<=180)||actor.role==='OWNER'&&actor.companyId!==companyId||actor.storeId&&actor.storeId!==storeId)throw Object.assign(new Error('FORBIDDEN_SCOPE'),{status:403});
 if(!Array.isArray(allocations)||!allocations.length||allocations.length>80||allocations.some(a=>typeof a?.purchaseDocumentId!=='string'||a.purchaseDocumentId.length>180))throw fail('INVALID_SELECTION');
 if(typeof reason!=='string'||reason.trim().length<5||reason.length>500)throw fail('REASON_REQUIRED');
 const ids=allocations.map(a=>a.purchaseDocumentId).sort();
 return db.$transaction(async tx=>{
  await lockInvoiceStore(tx,companyId,storeId);
  const [payment]=await raw(tx,`SELECT ss.*,t."amount",(t."attachmentData" IS NOT NULL) AS "hasBankProof",t."type",t."paymentMethod" AS "transactionMethod",t."sessionId",t."reversedAt",t."supplierId" AS "transactionSupplierId",t."invoiceDocumentNumber",t."invoicePaymentKey", EXISTS(SELECT 1 FROM "BankLedgerEntry" b WHERE b."sourceTransactionId"=t."id") AS bank, EXISTS(SELECT 1 FROM "PurchaseDocument" d WHERE d."paymentTransactionId"=t."id") AS "hasDirectDocument" FROM "SupplierPaymentSettlement" ss JOIN "StoreTransaction" t ON t."id"=ss."transactionId" AND t."companyId"=ss."companyId" AND t."storeId"=ss."storeId" WHERE ss."id"=$1 AND ss."companyId"=$2 AND ss."storeId"=$3 FOR UPDATE OF ss,t`,settlementId,companyId,storeId);
  if(!payment)throw fail('PAYMENT_NOT_FOUND');
  payment.existingAllocations=await raw(tx,'SELECT "id","amount","purchaseDocumentId" FROM "SupplierPaymentAllocation" WHERE "settlementId"=$1 ORDER BY "id"',settlementId);
  const [targetSupplier]=await raw(tx,'SELECT "id","companyId","name","taxId","active" FROM "Supplier" WHERE "id"=$1 AND "companyId"=$2 FOR SHARE',targetSupplierId,companyId);
  const documents=await raw(tx,`SELECT d.*,COALESCE((SELECT SUM(a."amount") FROM "SupplierPaymentAllocation" a WHERE a."purchaseDocumentId"=d."id"),0) AS "reservedAmount",
    EXISTS(SELECT 1 FROM "PurchaseOrderPosting" p JOIN "InvoiceStockPosting" s ON s."orderId"=p."orderId" AND s."companyId"=p."companyId" JOIN "PurchaseOrder" o ON o."id"=p."orderId" AND o."companyId"=p."companyId" JOIN "PurchaseDocument" src ON src."id"=o."sourceDocumentId" AND src."companyId"=o."companyId" AND src."storeId"=o."storeId" WHERE p."purchaseDocumentId"=d."id" AND p."companyId"=d."companyId" AND o."storeId"=d."storeId" AND o."status"='INVOICED' AND s."postedDocumentId"=d."id" AND s."storeId"=d."storeId" AND s."sourceDocumentId"=src."id" AND src."paymentTransactionId" IS NULL AND src."settlementMode" IS DISTINCT FROM 'PAID' AND NOT EXISTS(SELECT 1 FROM "SupplierPaymentAllocation" a WHERE a."purchaseDocumentId"=src."id")) AS "canonicalVerified",
    EXISTS(SELECT 1 FROM "PurchaseDocument" other WHERE other."companyId"=d."companyId" AND other."id"<>d."id" AND other."status"='APPROVED' AND other."supplierId"=d."supplierId" AND regexp_replace(upper(coalesce(other."documentNumber",'')),'[^A-ZΑ-Ω0-9]','','g')=regexp_replace(upper(coalesce(d."documentNumber",'')),'[^A-ZΑ-Ω0-9]','','g')) AS "duplicateRisk"
    FROM "PurchaseDocument" d WHERE d."companyId"=$1 AND d."storeId"=$2 AND d."id"=ANY($3::text[]) ORDER BY d."id" FOR UPDATE OF d`,companyId,storeId,ids);
  if(payment.invoicePaymentKey||payment.invoiceDocumentNumber)throw fail('EXISTING_REFERENCE_REQUIRES_REVIEW');
  const plan=planManualPaymentAllocation({payment,documents,allocations,targetSupplier,confirmSupplierChange});
  const version=crypto.createHash('sha256').update(JSON.stringify({payment,documents,targetSupplier,plan,reason,confirmSupplierChange},(_,v)=>typeof v==='bigint'?v.toString():v)).digest('hex');
  if(preview)return {...plan,version,previousSupplierId:payment.supplierId};
  if(expectedVersion!==version)throw fail('PREVIEW_CHANGED');
  if(targetSupplierId!==payment.supplierId){
   const n=await run(tx,'UPDATE "StoreTransaction" SET "supplierId"=$1 WHERE "id"=$2 AND "companyId"=$3 AND "storeId"=$4 AND "supplierId"=$5 AND "reversedAt" IS NULL',targetSupplierId,payment.transactionId,companyId,storeId,payment.supplierId);
   if(n!==1)throw fail('PAYMENT_CHANGED');
  }
  for(const a of plan.allocations){
   const existing=payment.existingAllocations.find(row=>row.purchaseDocumentId===a.purchaseDocumentId);
   const affected=existing
    ?await run(tx,'UPDATE "SupplierPaymentAllocation" SET "amount"="amount"+$1 WHERE "id"=$2 AND "companyId"=$3',a.amount,existing.id,companyId)
    :await run(tx,'INSERT INTO "SupplierPaymentAllocation" ("id","companyId","settlementId","purchaseDocumentId","amount") VALUES ($1,$2,$3,$4,$5)',crypto.randomUUID(),companyId,settlementId,a.purchaseDocumentId,a.amount);
   if(affected!==1)throw fail('ALLOCATION_FAILED');
  }
  const updated=await run(tx,'UPDATE "SupplierPaymentSettlement" SET "supplierId"=$1,"status"=$2,"reviewedBy"=$3,"reviewedAt"=NOW(),"reviewNote"=$4 WHERE "id"=$5 AND "companyId"=$6 AND "storeId"=$7 AND "status"=$8',targetSupplierId,plan.status,actor.id,reason,settlementId,companyId,storeId,payment.status);
  if(updated!==1)throw fail('SETTLEMENT_CHANGED');
  if(plan.status==='CONFIRMED'&&payment.bank){
   await tx.$executeRaw`UPDATE "BankLedgerEntry" SET "status"='CONFIRMED',"reviewedBy"=${actor.id},"reviewedAt"=NOW(),"reviewNote"=${reason}
    WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "sourceTransactionId"=${payment.transactionId}
      AND "status" IN ('PENDING_PROOF','PENDING_REVIEW','DISCREPANCY')`;
  }
  await run(tx,'INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES ($1,$2,$3,NULL,$4,$5,$6::jsonb)',crypto.randomUUID(),companyId,storeId,actor.id,'SUPPLIER_MANUAL_ALLOCATION',JSON.stringify({settlementId,transactionId:payment.transactionId,previousSupplierId:payment.supplierId,previousStatus:payment.status,reason,version,...plan}));
  return {...plan,version};
 },{isolationLevel:'Serializable',timeout:30000});
}
