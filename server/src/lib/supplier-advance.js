import crypto from 'node:crypto';
import {z} from 'zod';
import {assertCreditCashUnlinked} from './supplier-credit-cash.js';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const cents=value=>Math.round(Number(value)*100);
const money=z.coerce.number().finite().positive().max(999999999).refine(v=>Math.abs(v*100-Math.round(v*100))<0.00001);
const digest=row=>crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');
function owner(scope){if(scope.user?.role!=='SUPER_ADMIN'&&scope.user?.platformRole!=='SUPER_ADMIN'&&scope.user?.isSuperAdmin!==true&&scope.user?.companyId!==scope.companyId)fail(403,'Δεν έχεις πρόσβαση στην εταιρεία.');if(scope.user?.tokenType==='STORE_OPERATOR'||!['OWNER','SUPER_ADMIN'].includes(scope.user?.role)&&scope.user?.platformRole!=='SUPER_ADMIN'&&scope.user?.isSuperAdmin!==true)fail(403,'Η σύνδεση εξόδου με προμηθευτή γίνεται μόνο από ιδιοκτήτη ή Super Admin.');}
async function original(db,scope,lock=false){
 const rows=lock?await db.$queryRaw`SELECT * FROM "StoreTransaction" WHERE "id"=${scope.transactionId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} FOR UPDATE`:await db.$queryRaw`SELECT * FROM "StoreTransaction" WHERE "id"=${scope.transactionId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`;
 if(!rows[0])fail(404,'Δεν βρέθηκε το έξοδο στο επιλεγμένο κατάστημα.');return rows[0];
}
function eligible(row){if(row.type!=='OTHER_EXPENSE'||row.reversedAt||!(Number(row.amount)>0)||row.supplierId||row.invoiceDocumentNumber||row.invoicePaymentKey||row.paymentMethod!=='CASH_SHIFT'||row.subtractFromShift!==true||!row.sessionId)fail(409,'Επιτρέπεται μόνο ενεργό θετικό λοιπό έξοδο μετρητών χωρίς σύνδεση σε τιμολόγιο ή προμηθευτή.');}
export async function supplierAdvanceContext(db,scope){
 owner(scope);const row=await original(db,scope);eligible(row);
 const suppliers=await db.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "companyId"=${scope.companyId} AND "active"=true ORDER BY "name"`;
 return {transactionId:row.id,storeId:scope.storeId,amount:Number(row.amount),description:row.description,occurredAt:row.occurredAt,expectedVersion:digest(row),suppliers};
}
const conversionSchema=z.object({supplierId:z.string().trim().min(1).max(180),expectedVersion:z.string().regex(/^[a-f0-9]{64}$/),expectedAmount:money,reason:z.string().trim().min(3).max(500),acknowledged:z.literal(true),idempotencyKey:z.string().uuid()}).strict();
export async function associateExpenseAsAdvance(db,scope,input){
 owner(scope);const body=conversionSchema.parse(input),requestHash=digest(body);
 return db.$transaction(async tx=>{
  const row=await original(tx,scope,true);
  const previous=await tx.$queryRaw`SELECT "id","actorId","details" FROM "StoreOperatorAudit" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "eventType"='OTHER_EXPENSE_SUPPLIER_ADVANCE' AND "details"->>'transactionId'=${row.id} LIMIT 1`;
  if(previous[0]){if(previous[0].actorId!==scope.user.id||previous[0].details.requestHash!==requestHash)fail(409,'Το έξοδο έχει ήδη συνδεθεί με προμηθευτή.');return {...previous[0].details.result,duplicate:true};}
  eligible(row);
  if(digest(row)!==body.expectedVersion||cents(row.amount)!==cents(body.expectedAmount))fail(409,'Το έξοδο άλλαξε. Ανανέωσε πριν τη σύνδεση.');
  await assertCreditCashUnlinked(tx,scope,row.id);
  const suppliers=await tx.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "id"=${body.supplierId} AND "companyId"=${scope.companyId} AND "active"=true FOR KEY SHARE`;
  if(!suppliers[0])fail(404,'Δεν βρέθηκε ενεργός προμηθευτής της εταιρείας.');
  const linked=await tx.$queryRaw`SELECT "id" FROM "SupplierPaymentSettlement" WHERE "transactionId"=${row.id} AND "companyId"=${scope.companyId}`;
  const banks=await tx.$queryRaw`SELECT "id" FROM "BankLedgerEntry" WHERE "sourceTransactionId"=${row.id} AND "companyId"=${scope.companyId}`;
  if(linked.length||banks.length)fail(409,'Η κίνηση έχει ήδη οικονομική σύνδεση και χρειάζεται χωριστό έλεγχο.');
  const reviews=await tx.$queryRaw`SELECT * FROM "OtherExpenseReview" WHERE "transactionId"=${row.id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} FOR UPDATE`;
  if(reviews.length!==1||!['PENDING_REVIEW','DISCREPANCY'].includes(reviews[0].status))fail(409,'Το έξοδο έχει ήδη ελεγχθεί ή δεν έχει μοναδική εκκρεμή εγγραφή.');
  const settlementId=crypto.randomUUID(),auditId=crypto.randomUUID();
  await tx.$executeRaw`UPDATE "StoreTransaction" SET "type"='SUPPLIER_PAYMENT',"supplierId"=${suppliers[0].id},"supplierName"=${suppliers[0].name} WHERE "id"=${row.id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`;
  await tx.$executeRaw`UPDATE "OtherExpenseReview" SET "status"='CANCELLED',"reviewedBy"=${scope.user.id},"reviewedAt"=NOW(),"reviewNote"=${`Αναταξινόμηση ως έναντι προμηθευτή: ${body.reason}`} WHERE "id"=${reviews[0].id} AND "companyId"=${scope.companyId}`;
  await tx.$executeRaw`INSERT INTO "SupplierPaymentSettlement" ("id","companyId","storeId","transactionId","supplierId","status","paymentMethod","paidAt","note","createdBy","createdByName") VALUES (${settlementId},${scope.companyId},${scope.storeId},${row.id},${suppliers[0].id},'PENDING_REVIEW',${row.paymentMethod},${row.occurredAt},${`Έναντι από υπάρχον λοιπό έξοδο — χωρίς νέα εκταμίευση. ${body.reason}`},${scope.user.id},${scope.user.fullName||'Χρήστης'})`;
  const result={ok:true,transactionId:row.id,settlementId,amount:Number(row.amount),advanceAmount:Number(row.amount),status:'PENDING_REVIEW'};
  const details={transactionId:row.id,requestHash,idempotencyKey:body.idempotencyKey,reason:body.reason,supplierId:suppliers[0].id,supplierName:suppliers[0].name,before:{type:row.type,supplierId:row.supplierId,supplierName:row.supplierName,amount:Number(row.amount),sessionId:row.sessionId,occurredAt:row.occurredAt,description:row.description,subtractFromShift:row.subtractFromShift,paymentMethod:row.paymentMethod,review:reviews[0]},result,cashDelta:0};
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${auditId},${scope.companyId},${scope.storeId},${row.actorId},${scope.user.id},'OTHER_EXPENSE_SUPPLIER_ADVANCE',${JSON.stringify(details)}::jsonb)`;
  return result;
 });
}

const allocationSchema=z.object({expectedAvailable:money,allocations:z.array(z.object({purchaseDocumentId:z.string().trim().min(1).max(180),amount:money}).strict()).min(1).max(80),idempotencyKey:z.string().min(8).max(180)}).strict();
export async function allocateSupplierAdvance(db,scope,input){
 const user=scope.user;if(user?.companyId!==scope.companyId||user.tokenType==='STORE_OPERATOR'&&(user.storeId!==scope.storeId||!user.permissions?.includes('SUPPLIER_PAYMENT')))fail(403,'Δεν έχεις πρόσβαση στο έναντι αυτού του καταστήματος.');
 const body=allocationSchema.parse(input),requestHash=digest(body),ids=body.allocations.map(a=>a.purchaseDocumentId).sort();
 if(new Set(ids).size!==ids.length)fail(400,'Κάθε τιμολόγιο επιλέγεται μία φορά.');
 return db.$transaction(async tx=>{
  const documents=await tx.$queryRaw`SELECT "id","documentNumber","totalGross","supplierId" FROM "PurchaseDocument" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "id"=ANY(${ids}::text[]) AND "status" IN ('DRAFT','APPROVED') AND "settlementMode"='CREDIT' AND "documentType"<>'CREDIT_NOTE' ORDER BY "id" FOR UPDATE`;
  if(documents.length!==ids.length)fail(409,'Τα τιμολόγια δεν είναι πλέον ανοιχτές οφειλές του καταστήματος.');
  const settlements=await tx.$queryRaw`SELECT ss.*,t."amount",t."reversedAt",t."type",t."supplierId" AS "transactionSupplierId" FROM "SupplierPaymentSettlement" ss JOIN "StoreTransaction" t ON t."id"=ss."transactionId" AND t."companyId"=ss."companyId" AND t."storeId"=ss."storeId" WHERE ss."id"=${scope.settlementId} AND ss."companyId"=${scope.companyId} AND ss."storeId"=${scope.storeId} FOR UPDATE OF ss,t`;
  const settlement=settlements[0];if(!settlement||settlement.status!=='CONFIRMED'||settlement.reversedAt||settlement.type!=='SUPPLIER_PAYMENT'||settlement.transactionSupplierId!==settlement.supplierId||documents.some(d=>d.supplierId!==settlement.supplierId))fail(409,'Δεν υπάρχει επιβεβαιωμένο έναντι του ίδιου προμηθευτή.');
  const previous=await tx.$queryRaw`SELECT "actorId","details" FROM "StoreOperatorAudit" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "eventType"='SUPPLIER_ADVANCE_ALLOCATED' AND "details"->>'settlementId'=${settlement.id} AND "details"->>'idempotencyKey'=${body.idempotencyKey} LIMIT 1`;
  if(previous[0]){if(previous[0].actorId!==user.id||previous[0].details.requestHash!==requestHash)fail(409,'Το αίτημα έχει ήδη χρησιμοποιηθεί με διαφορετικά στοιχεία.');return {...previous[0].details.result,duplicate:true};}
  const declared=await tx.$queryRaw`SELECT "id" FROM "StoreOperatorAudit" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "details"->>'transactionId'=${settlement.transactionId} AND ("eventType"='OTHER_EXPENSE_SUPPLIER_ADVANCE' OR ("eventType" IN ('SUPPLIER_SETTLEMENT_NO_DOCUMENT_DECLARED','SUPPLIER_SETTLEMENT_CONFIRMED','SUPPLIER_ADVANCE_DECLARED') AND "details"->>'advanceAcknowledged'='true')) LIMIT 1`;
  if(!declared.length)fail(409,'Η διαφορά δεν έχει καταγραφεί ρητά ως έναντι και χρειάζεται έλεγχο.');
  const allocated=await tx.$queryRaw`SELECT COALESCE(SUM("amount"),0) AS amount FROM "SupplierPaymentAllocation" WHERE "companyId"=${scope.companyId} AND "settlementId"=${settlement.id}`;
  const available=cents(settlement.amount)-cents(allocated[0].amount),requested=body.allocations.reduce((sum,a)=>sum+cents(a.amount),0);
  if(available!==cents(body.expectedAvailable)||requested>available)fail(409,'Το διαθέσιμο έναντι άλλαξε ή δεν επαρκεί. Ανανέωσε.');
  for(const a of body.allocations){
   const reserved=await tx.$queryRaw`SELECT COALESCE(SUM(a."amount"),0) AS amount FROM "SupplierPaymentAllocation" a JOIN "SupplierPaymentSettlement" ss ON ss."id"=a."settlementId" AND ss."companyId"=a."companyId" JOIN "StoreTransaction" t ON t."id"=ss."transactionId" AND t."companyId"=ss."companyId" WHERE a."companyId"=${scope.companyId} AND a."purchaseDocumentId"=${a.purchaseDocumentId} AND ss."status"<>'CANCELLED' AND t."reversedAt" IS NULL`;
   if(cents(a.amount)>cents(documents.find(d=>d.id===a.purchaseDocumentId).totalGross)-cents(reserved[0].amount))fail(409,'Η κατανομή υπερβαίνει το διαθέσιμο υπόλοιπο τιμολογίου.');
   await tx.$executeRaw`INSERT INTO "SupplierPaymentAllocation" ("id","companyId","settlementId","purchaseDocumentId","amount") VALUES (${crypto.randomUUID()},${scope.companyId},${settlement.id},${a.purchaseDocumentId},${a.amount}) ON CONFLICT ("settlementId","purchaseDocumentId") DO UPDATE SET "amount"="SupplierPaymentAllocation"."amount"+EXCLUDED."amount"`;
  }
  const result={ok:true,settlementId:settlement.id,allocatedAmount:requested/100,advanceAmount:(available-requested)/100,cashDelta:0};
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${scope.companyId},${scope.storeId},${user.operatorId||user.id},${user.id},'SUPPLIER_ADVANCE_ALLOCATED',${JSON.stringify({settlementId:settlement.id,transactionId:settlement.transactionId,idempotencyKey:body.idempotencyKey,requestHash,allocations:body.allocations,result,cashDelta:0})}::jsonb)`;
  return result;
 });
}
