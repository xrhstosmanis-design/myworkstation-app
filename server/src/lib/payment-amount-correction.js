import {assertCreditCashUnlinked} from './supplier-credit-cash.js';
import crypto from 'node:crypto';
import {z} from 'zod';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const cents=value=>Math.round(Number(value)*100);
const amount=z.coerce.number().finite().refine(v=>v!==0&&Math.abs(v)<=999999999&&Math.abs(v*100-Math.round(v*100))<0.00001);
export const paymentCorrectionSchema=z.object({amount,expectedAmount:amount,expectedCorrectionId:z.string().uuid().nullable(),reason:z.string().trim().min(3).max(500),idempotencyKey:z.string().uuid(),allocations:z.array(z.object({purchaseDocumentId:z.string().min(1).max(180),amount:amount.refine(v=>v>0)})).max(100).default([])}).strict();

export function canCorrectPayment(user,row,session,terminalPos){
 if(!row||!session||session.status!=='OPEN'||row.sessionId!==session.id||row.companyId!==user?.companyId||row.storeId!==session.storeId||row.reversedAt||!['SUPPLIER_PAYMENT','OTHER_EXPENSE'].includes(row.type))return false;
 if(user?.tokenType==='STORE_OPERATOR'){
  const permissions=user.permissions||[];
  return user.storeId===row.storeId&&user.id===row.actorId&&session.terminalPos===terminalPos&&permissions.includes(row.type==='SUPPLIER_PAYMENT'?'SUPPLIER_PAYMENT':'THIRD_PARTY_PAYMENT');
 }
 return ['SUPER_ADMIN','OWNER','ADMIN','MANAGER'].includes(user?.role);
}

async function payment(db,{companyId,storeId,transactionId},lock=false){
 const rows=lock
  ?await db.$queryRaw`SELECT * FROM "StoreTransaction" WHERE "id"=${transactionId} AND "companyId"=${companyId} AND "storeId"=${storeId} FOR UPDATE`
  :await db.$queryRaw`SELECT * FROM "StoreTransaction" WHERE "id"=${transactionId} AND "companyId"=${companyId} AND "storeId"=${storeId}`;
 if(!rows[0])fail(404,'Δεν βρέθηκε η πληρωμή σε αυτό το κατάστημα.');
 return rows[0];
}
async function latestCorrection(db,scope){
 const rows=await db.$queryRaw`SELECT "id","details" FROM "StoreOperatorAudit" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "eventType"='PAYMENT_AMOUNT_CORRECTED' AND "details"->>'transactionId'=${scope.transactionId} ORDER BY "createdAt" DESC,"id" DESC LIMIT 1`;
 return rows[0]||null;
}
async function allocationRows(db,scope){
 return db.$queryRaw`SELECT a."id",a."purchaseDocumentId",a."amount",s."id" AS "settlementId",s."status",s."supplierId",p."documentNumber",p."totalGross" FROM "SupplierPaymentSettlement" s JOIN "SupplierPaymentAllocation" a ON a."settlementId"=s."id" AND a."companyId"=s."companyId" JOIN "PurchaseDocument" p ON p."id"=a."purchaseDocumentId" AND p."companyId"=a."companyId" WHERE s."companyId"=${scope.companyId} AND s."storeId"=${scope.storeId} AND s."transactionId"=${scope.transactionId} ORDER BY a."purchaseDocumentId"`;
}
async function activeSession(db,scope,row,lock=false){
 const rows=lock
  ?await db.$queryRaw`SELECT "id","companyId","storeId","status","terminalPos" FROM "CashShiftSession" WHERE "id"=${row.sessionId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} FOR UPDATE`
  :await db.$queryRaw`SELECT "id","companyId","storeId","status","terminalPos" FROM "CashShiftSession" WHERE "id"=${row.sessionId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`;
 if(!canCorrectPayment(scope.user,row,rows[0],scope.terminalPos))fail(403,'Επιτρέπεται μόνο διόρθωση δικής σου πληρωμής στην ενεργή βάρδια, με δικαίωμα πληρωμών.');
 return rows[0];
}
export async function paymentCorrectionContext(db,scope){
 const row=await payment(db,scope);await activeSession(db,scope,row);
 const latest=await latestCorrection(db,scope),allocations=await allocationRows(db,scope);
 return {storeId:scope.storeId,transactionId:row.id,sessionId:row.sessionId,amount:Number(row.amount),subtractFromShift:row.subtractFromShift,description:row.description,supplierName:row.supplierName,expectedCorrectionId:latest?.id||null,allocations:allocations.map(a=>({purchaseDocumentId:a.purchaseDocumentId,documentNumber:a.documentNumber,amount:Number(a.amount)}))};
}

export async function correctPaymentAmount(db,scope,input){
 const body=paymentCorrectionSchema.parse(input),requestHash=crypto.createHash('sha256').update(JSON.stringify({...body,allocations:[...body.allocations].sort((a,b)=>a.purchaseDocumentId.localeCompare(b.purchaseDocumentId))})).digest('hex');
 return db.$transaction(async tx=>{
  // Document locks precede the shift lock, matching settlement creation.
  const initial=await payment(tx,scope),initialAllocations=await allocationRows(tx,scope);
  if(initialAllocations.length){
   const ids=initialAllocations.map(a=>a.purchaseDocumentId);
   await tx.$queryRaw`SELECT "id" FROM "PurchaseDocument" WHERE "companyId"=${scope.companyId} AND "id"=ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
  }
  const session=await activeSession(tx,scope,initial,true),row=await payment(tx,scope,true);
  if(!canCorrectPayment(scope.user,row,session,scope.terminalPos))fail(409,'Η βάρδια ή η πληρωμή άλλαξε. Κάνε ανανέωση.');
  const previous=await tx.$queryRaw`SELECT "id","actorId","details" FROM "StoreOperatorAudit" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "eventType"='PAYMENT_AMOUNT_CORRECTED' AND "details"->>'transactionId'=${row.id} AND "details"->>'idempotencyKey'=${body.idempotencyKey} LIMIT 1`;
  if(previous[0]){
   if(previous[0].actorId!==scope.user.id||previous[0].details.requestHash!==requestHash)fail(409,'Το ίδιο αίτημα χρησιμοποιήθηκε με διαφορετικά στοιχεία.');
   return {ok:true,duplicate:true,correctionId:previous[0].id,...previous[0].details.result};
  }
  await assertCreditCashUnlinked(tx,scope,row.id);
  const latest=await latestCorrection(tx,scope);
  if(cents(row.amount)!==cents(body.expectedAmount)||(latest?.id||null)!==body.expectedCorrectionId)fail(409,'Το ποσό έχει ήδη αλλάξει. Κάνε ανανέωση πριν τη διόρθωση.');
  if(Math.sign(Number(row.amount))!==Math.sign(body.amount))fail(400,'Δεν επιτρέπεται αλλαγή πληρωμής σε επιστροφή.');
  const delta=cents(body.amount)-cents(row.amount);
  if(!delta)fail(400,'Το νέο ποσό είναι ίδιο με το αρχικό.');
  const linkedSettlements=await tx.$queryRaw`SELECT "id","status" FROM "SupplierPaymentSettlement" WHERE "transactionId"=${row.id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} FOR UPDATE`;
  const linkedBanks=await tx.$queryRaw`SELECT "id","status" FROM "BankLedgerEntry" WHERE "sourceTransactionId"=${row.id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} FOR UPDATE`;
  if(linkedSettlements.some(s=>s.status==='CANCELLED')||linkedBanks.some(b=>b.status==='CANCELLED'))fail(409,'Η συνδεδεμένη πληρωμή έχει ακυρωθεί και δεν επιτρέπεται διόρθωση.');
  if(['BANK_TRANSFER','CORPORATE_CARD'].includes(row.paymentMethod)&&!linkedBanks.length)fail(409,'Δεν βρέθηκε η συνδεδεμένη τραπεζική κίνηση. Απαιτείται έλεγχος υπευθύνου.');
  const allocations=await allocationRows(tx,scope);
  const given=new Map(body.allocations.map(a=>[a.purchaseDocumentId,a]));
  if(given.size!==body.allocations.length||given.size!==allocations.length||allocations.some(a=>!given.has(a.purchaseDocumentId)))fail(400,'Η διόρθωση πρέπει να διατηρεί τα ίδια συνδεδεμένα τιμολόγια.');
  if(allocations.length){
   if(body.amount<0||body.allocations.reduce((sum,a)=>sum+cents(a.amount),0)!==cents(body.amount))fail(400,'Το σύνολο κατανομών πρέπει να συμφωνεί με το νέο ποσό.');
   const settlementId=allocations[0].settlementId;
   if(!linkedSettlements.some(s=>s.id===settlementId))fail(409,'Η συνδεδεμένη πληρωμή προμηθευτή άλλαξε.');
   for(const a of allocations){
    const used=await tx.$queryRaw`SELECT COALESCE(SUM(a."amount"),0) AS "amount" FROM "SupplierPaymentAllocation" a JOIN "SupplierPaymentSettlement" s ON s."id"=a."settlementId" AND s."companyId"=a."companyId" JOIN "StoreTransaction" t ON t."id"=s."transactionId" AND t."companyId"=s."companyId" WHERE a."companyId"=${scope.companyId} AND a."purchaseDocumentId"=${a.purchaseDocumentId} AND a."settlementId"<>${settlementId} AND s."status"<>'CANCELLED' AND t."reversedAt" IS NULL`;
    if(cents(given.get(a.purchaseDocumentId).amount)>cents(a.totalGross)-cents(used[0].amount))fail(409,`Η διόρθωση υπερβαίνει το υπόλοιπο του τιμολογίου ${a.documentNumber||a.purchaseDocumentId}.`);
    await tx.$executeRaw`UPDATE "SupplierPaymentAllocation" SET "amount"=${given.get(a.purchaseDocumentId).amount} WHERE "id"=${a.id} AND "companyId"=${scope.companyId}`;
   }
  }
  await tx.$executeRaw`UPDATE "StoreTransaction" SET "amount"=${body.amount} WHERE "id"=${row.id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`;
  // A prior review/proof cannot confirm an amount that has subsequently changed.
  await tx.$executeRaw`UPDATE "SupplierPaymentSettlement" SET "status"='PENDING_REVIEW',"reviewedBy"=NULL,"reviewedAt"=NULL,"reviewNote"=NULL WHERE "transactionId"=${row.id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`;
  await tx.$executeRaw`UPDATE "OtherExpenseReview" SET "status"='PENDING_REVIEW',"reviewedBy"=NULL,"reviewedAt"=NULL,"reviewNote"=NULL WHERE "transactionId"=${row.id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`;
  await tx.$executeRaw`UPDATE "BankLedgerEntry" SET "amount"=${-body.amount},"status"=CASE WHEN "attachmentData" IS NULL THEN 'PENDING_PROOF' ELSE 'PENDING_REVIEW' END,"reviewedBy"=NULL,"reviewedAt"=NULL,"reviewNote"=NULL WHERE "sourceTransactionId"=${row.id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "status"<>'CANCELLED'`;
  const correctionId=crypto.randomUUID(),result={transactionId:row.id,storeId:scope.storeId,previousAmount:Number(row.amount),newAmount:body.amount,cashDelta:row.subtractFromShift?-delta/100:0};
  const details={...result,transactionType:row.type,sessionId:row.sessionId,terminalPos:session.terminalPos,actorName:scope.user.fullName||'Χρήστης',reason:body.reason,paymentMethod:row.paymentMethod,supplierId:row.supplierId,supplierName:row.supplierName,previousCorrectionId:latest?.id||null,allocationsBefore:allocations.map(a=>({purchaseDocumentId:a.purchaseDocumentId,amount:Number(a.amount)})),allocationsAfter:body.allocations,idempotencyKey:body.idempotencyKey,requestHash,result};
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details","createdAt") VALUES (${correctionId},${scope.companyId},${scope.storeId},${scope.user.operatorId||scope.user.id},${scope.user.id},'PAYMENT_AMOUNT_CORRECTED',${JSON.stringify(details)}::jsonb,clock_timestamp())`;
  return {ok:true,correctionId,...result};
 }).catch(error=>{
  if(error.status)throw error;
  throw Object.assign(new Error('Δεν επιβεβαιώθηκε η διόρθωση. Κάνε ανανέωση πριν δοκιμάσεις ξανά.',{cause:error}),{status:503});
 });
}
