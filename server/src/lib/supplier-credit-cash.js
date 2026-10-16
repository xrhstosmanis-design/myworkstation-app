import crypto from 'node:crypto';
import {z} from 'zod';
import {invoiceToken} from './invoice-payment-reuse.js';
import {invoiceNumberParts} from './invoice-common-draft.js';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const cents=v=>Math.round(Number(v)*100);
const money=z.coerce.number().positive().max(999999999).refine(v=>Number.isFinite(v)&&Math.abs(v*100-cents(v))<.00001);
export const creditCashSchema=z.object({type:z.literal('SUPPLIER_PAYMENT'),paymentSource:z.literal('CASH_SHIFT'),supplierId:z.string().min(1).max(180),creditDocumentId:z.string().min(1).max(180),mode:z.enum(['OFFSET','CASH_RETURN']),invoicePaymentId:z.string().min(1).max(180).nullable(),expectedCreditAmount:money,expectedCreditUpdatedAt:z.string().datetime(),expectedCreditVersion:z.string().regex(/^[a-f0-9]{32}$/),expectedPaymentAmount:money.nullable(),expectedAppliedAmount:z.coerce.number().min(0).max(999999999).refine(v=>Number.isFinite(v)&&Math.abs(v*100-cents(v))<.00001),confirmOriginal:z.literal(true),reason:z.string().trim().min(3).max(500),idempotencyKey:z.string().uuid()}).strict().superRefine((v,c)=>{
 if(v.mode==='OFFSET'&&(!v.invoicePaymentId||!v.expectedPaymentAmount))c.addIssue({code:z.ZodIssueCode.custom,message:'Επίλεξε την αρχική πληρωμή.'});
 if(v.mode==='CASH_RETURN'&&(v.invoicePaymentId||v.expectedPaymentAmount))c.addIssue({code:z.ZodIssueCode.custom,message:'Η επιστροφή μετρητών δεν είναι συμψηφισμός πληρωμής.'});
});
function access(scope){
 const u=scope.user;
 if(!u||u.companyId!==scope.companyId)fail(403,'Δεν έχεις πρόσβαση σε αυτή την εταιρεία.');
 if(u.tokenType==='STORE_OPERATOR'){
  if(u.storeId!==scope.storeId||!u.permissions?.includes('SUPPLIER_PAYMENT')||!u.permissions?.includes('SAME_SHIFT_PAYMENTS'))fail(403,'Απαιτείται δικαίωμα πληρωμών προμηθευτή και ίδιας βάρδιας.');
 }else if(!['SUPER_ADMIN','OWNER','ADMIN','MANAGER'].includes(u.role))fail(403,'Δεν έχεις δικαίωμα κίνησης ταμείου.');
}
async function session(db,scope,lock=false){
 const rows=lock
  ?await db.$queryRaw`SELECT "id","terminalPos","status" FROM "CashShiftSession" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "terminalPos"=${scope.terminalPos} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1 FOR UPDATE`
  :await db.$queryRaw`SELECT "id","terminalPos","status" FROM "CashShiftSession" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "terminalPos"=${scope.terminalPos} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1`;
 if(!rows[0])fail(409,'Δεν υπάρχει ενεργή βάρδια σε αυτό το ταμείο.');return rows[0];
}
const proofSqlStatus=['AWAITING_APPROVAL','AI_COMPLETE','CONFIRMED','LOCAL_COMPLETE'];
async function credit(db,scope,id,lock=false){
 const rows=lock
  ?await db.$queryRaw`SELECT d.*,md5(row_to_json(d)::text) AS version FROM "PurchaseDocument" d WHERE d."companyId"=${scope.companyId} AND d."storeId"=${scope.storeId} AND d."id"=${id} FOR UPDATE`
  :await db.$queryRaw`SELECT d.*,md5(row_to_json(d)::text) AS version FROM "PurchaseDocument" d WHERE d."companyId"=${scope.companyId} AND d."storeId"=${scope.storeId} AND d."id"=${id}`;
 const row=rows[0];if(!row||row.documentType!=='CREDIT_NOTE'||!['DRAFT','APPROVED'].includes(row.status)||!(Number(row.totalGross)>0))fail(409,'Δεν βρέθηκε διαθέσιμο πιστωτικό του καταστήματος.');return row;
}
// A POS-confirmed header and saved original can settle cash before line OCR.
// Background downloads and unconfirmed OCR shells never satisfy this proof.
export async function hasCreditCashProof(db,scope,doc){
 const jobs=await db.$queryRaw`SELECT j."status",j."resultJson" FROM "AiReaderJob" j JOIN "DocumentAttachment" a ON a."id"=j."attachmentId" AND a."companyId"=j."companyId" AND a."storeId"=j."storeId" WHERE j."companyId"=${scope.companyId} AND j."storeId"=${scope.storeId} AND j."purchaseDocumentId"=${doc.id} AND a."mimeType" IN ('application/pdf','image/jpeg','image/png','image/webp')`;
 return jobs.some(j=>{
  if(proofSqlStatus.includes(j.status))return true;
  const h=j.resultJson?.posHandoff;
  return ['POS_DRAFT_READY','POS_PROCESSING','POS_FAILED'].includes(j.status)&&doc.sourceType==='POS_OCR_DRAFT'&&h?.version==='POS_FAST_HANDOFF_V1'&&h.documentType==='CREDIT_NOTE'&&h.supplierId===doc.supplierId&&invoiceToken(h.documentNumber)===invoiceToken(doc.documentNumber)&&String(h.documentDate).slice(0,10)===new Date(doc.documentDate).toISOString().slice(0,10)&&cents(h.totalGross)===cents(doc.totalGross)&&h.settlementMode==='CREDIT'&&!h.paymentTransactionId;
 });
}
// Called under the reader's draft lock; a settled header is immutable while
// product rows may still be completed without changing cash or stock.
export async function creditCashReadSettlement(db,scope,doc,header){
 if(doc.documentType!=='CREDIT_NOTE'||!doc.paymentTransactionId)return header.settlementMode;
 const payments=await db.$queryRaw`SELECT t."amount",t."reversedAt",t."invoiceDocumentNumber",t."supplierId" FROM "StoreTransaction" t JOIN "StoreOperatorAudit" a ON a."details"->>'transactionId'=t."id" AND a."companyId"=t."companyId" AND a."storeId"=t."storeId" AND a."eventType"='SUPPLIER_CREDIT_CASH_APPLIED' AND a."details"->>'creditDocumentId'=${doc.id} WHERE t."id"=${doc.paymentTransactionId} AND t."companyId"=${scope.companyId} AND t."storeId"=${scope.storeId} AND t."type"='SUPPLIER_PAYMENT' LIMIT 1`;
 const t=payments[0];
 if(!header.documentDate||doc.supplierId!==header.supplierId||invoiceToken(doc.documentNumber)!==invoiceToken(header.documentNumber)||cents(doc.totalGross)!==cents(header.totalGross)||!t||t.reversedAt||cents(t.amount)!==-cents(header.totalGross)||t.supplierId!==header.supplierId||invoiceToken(t.invoiceDocumentNumber)!==invoiceToken(header.documentNumber)||new Date(doc.documentDate).toISOString().slice(0,10)!==new Date(header.documentDate||doc.documentDate).toISOString().slice(0,10))fail(409,'Το πιστωτικό έχει κίνηση ταμείου και τα νέα στοιχεία διαφέρουν. Διατηρήθηκε το ίδιο πρόχειρο για έλεγχο.');
 return 'PAID';
}
async function applied(db,scope,paymentId){
 const rows=await db.$queryRaw`SELECT COALESCE(SUM(-t."amount"),0) AS amount FROM "StoreOperatorAudit" a JOIN "StoreTransaction" t ON t."id"=a."details"->>'transactionId' AND t."companyId"=a."companyId" AND t."storeId"=a."storeId" WHERE a."companyId"=${scope.companyId} AND a."storeId"=${scope.storeId} AND a."eventType"='SUPPLIER_CREDIT_CASH_APPLIED' AND a."details"->>'invoicePaymentId'=${paymentId} AND t."amount"<0 AND t."reversedAt" IS NULL`;
 return Number(rows[0]?.amount||0);
}
export async function assertCreditCashUnlinked(db,{companyId,storeId},transactionId){
 const rows=await db.$queryRaw`SELECT a."id" FROM "StoreOperatorAudit" a JOIN "StoreTransaction" t ON t."id"=a."details"->>'transactionId' AND t."companyId"=a."companyId" AND t."storeId"=a."storeId" WHERE a."companyId"=${companyId} AND a."storeId"=${storeId} AND a."eventType"='SUPPLIER_CREDIT_CASH_APPLIED' AND (a."details"->>'invoicePaymentId'=${transactionId} OR a."details"->>'transactionId'=${transactionId}) AND t."reversedAt" IS NULL LIMIT 1`;
 if(rows.length)fail(409,'Η κίνηση συνδέεται με πιστωτικό. Απαιτείται κοινός έλεγχος πληρωμής και πιστωτικού πριν από διόρθωση ή ακύρωση.');
}
export async function supplierCreditCashContext(db,scope,supplierId){
 access(scope);const shift=await session(db,scope);
 const suppliers=await db.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "id"=${supplierId} AND "companyId"=${scope.companyId} AND "active"=true`;
 if(!suppliers[0])fail(404,'Δεν βρέθηκε ο προμηθευτής.');
 const credits=await db.$queryRaw`SELECT d.*,md5(row_to_json(d)::text) AS version FROM "PurchaseDocument" d WHERE d."companyId"=${scope.companyId} AND d."storeId"=${scope.storeId} AND d."supplierId"=${supplierId} AND d."documentType"='CREDIT_NOTE' AND d."status" IN ('DRAFT','APPROVED') AND d."totalGross">0 AND d."paymentTransactionId" IS NULL AND COALESCE(d."settlementMode",'')<>'PAID' ORDER BY d."documentDate",d."id" LIMIT 101`;
 if(credits.length>100)fail(409,'Περιόρισε τον έλεγχο των διαθέσιμων πιστωτικών.');
 const payments=await db.$queryRaw`SELECT DISTINCT ON (t."id") t."id",t."amount",t."invoiceDocumentNumber",d."documentNumber",t."occurredAt" FROM "StoreTransaction" t JOIN "PurchaseDocument" d ON d."paymentTransactionId"=t."id" AND d."companyId"=t."companyId" AND d."storeId"=t."storeId" AND d."supplierId"=t."supplierId" WHERE t."companyId"=${scope.companyId} AND t."storeId"=${scope.storeId} AND t."sessionId"=${shift.id} AND t."supplierId"=${supplierId} AND t."type"='SUPPLIER_PAYMENT' AND t."amount">0 AND t."subtractFromShift"=true AND t."reversedAt" IS NULL AND d."documentType"='INVOICE' AND d."status" IN ('DRAFT','APPROVED') AND d."totalGross"=t."amount" AND (${scope.user.tokenType!=='STORE_OPERATOR'} OR t."actorId"=${scope.user.id}) ORDER BY t."id",t."occurredAt" DESC,d."id" LIMIT 101`;
 if(payments.length>100)fail(409,'Πολλές διαθέσιμες πληρωμές για συμψηφισμό.');
 const items=[];for(const p of payments){const used=await applied(db,scope,p.id);items.push({...p,amount:Number(p.amount),appliedAmount:used,remainingAmount:(cents(p.amount)-cents(used))/100})}
 return {supplier:suppliers[0],sessionId:shift.id,credits:(await Promise.all(credits.map(async c=>await hasCreditCashProof(db,scope,c)?{id:c.id,documentNumber:c.documentNumber,documentDate:c.documentDate,totalGross:Number(c.totalGross),updatedAt:c.updatedAt,status:c.status,version:c.version}:null))).filter(Boolean),payments:items};
}

export async function applySupplierCreditCash(db,scope,input){
 access(scope);const body=creditCashSchema.parse(input),requestHash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`supplier-credit-cash:${scope.companyId}:${body.creditDocumentId}`})) IS NULL) AS locked`;
  const doc=await credit(tx,scope,body.creditDocumentId,true);
  if(doc.supplierId!==body.supplierId)fail(409,'Ο προμηθευτής του πιστωτικού άλλαξε.');
  const previous=await tx.$queryRaw`SELECT "actorId","details" FROM "StoreOperatorAudit" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "eventType"='SUPPLIER_CREDIT_CASH_APPLIED' AND "details"->>'creditDocumentId'=${doc.id} ORDER BY "createdAt" DESC LIMIT 1`;
  if(previous[0]){
   if(previous[0].actorId!==scope.user.id||previous[0].details.idempotencyKey!==body.idempotencyKey||previous[0].details.requestHash!==requestHash)fail(409,'Το πιστωτικό έχει ήδη χρησιμοποιηθεί. Δεν έγινε δεύτερη κίνηση.');
   const saved=await tx.$queryRaw`SELECT "id","amount","reversedAt" FROM "StoreTransaction" WHERE "id"=${previous[0].details.transactionId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`;
   if(!saved[0]||saved[0].reversedAt||doc.paymentTransactionId!==saved[0].id||cents(saved[0].amount)!==-cents(doc.totalGross)||doc.documentNumber!==previous[0].details.creditDocumentNumber)fail(409,'Η προηγούμενη κίνηση χρειάζεται έλεγχο. Δεν επαναδημιουργείται.');
   return {...previous[0].details.result,duplicate:true};
  }
  if(doc.paymentTransactionId||doc.settlementMode==='PAID')fail(409,'Το πιστωτικό έχει ήδη συνδεδεμένη κίνηση.');
  if(doc.version!==body.expectedCreditVersion||cents(doc.totalGross)!==cents(body.expectedCreditAmount)||new Date(doc.updatedAt).toISOString()!==body.expectedCreditUpdatedAt)fail(409,'Το πιστωτικό άλλαξε. Κάνε ανανέωση πριν από την καταχώριση.');
  const supplier=(await tx.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "id"=${body.supplierId} AND "companyId"=${scope.companyId} AND "active"=true FOR SHARE`)[0];
  if(!supplier||!invoiceToken(doc.documentNumber))fail(409,'Δεν βρέθηκαν τα επιβεβαιωμένα στοιχεία προμηθευτή/πιστωτικού.');
  if(!await hasCreditCashProof(tx,scope,doc))fail(409,'Η ανάγνωση ή το πρωτότυπο του πιστωτικού χρειάζεται έλεγχο.');
  const allocations=await tx.$queryRaw`SELECT a."id" FROM "SupplierPaymentAllocation" a JOIN "SupplierPaymentSettlement" s ON s."id"=a."settlementId" AND s."companyId"=a."companyId" WHERE a."companyId"=${scope.companyId} AND a."purchaseDocumentId"=${doc.id} AND s."status"<>'CANCELLED' LIMIT 1`;
  if(allocations.length)fail(409,'Το πιστωτικό έχει ήδη κατανομή. Απαιτείται έλεγχος.');
  const tax=String(supplier.taxId||'').replace(/\D/g,''),parts=invoiceNumberParts(doc.documentNumber),invoicePaymentKey=`${scope.companyId}:${tax?`VAT:${tax}`:`ID:${supplier.id}`}:${invoiceToken(doc.documentNumber)}`;
  if(!parts.number)fail(409,'Ο αριθμός του πιστωτικού χρειάζεται έλεγχο.');
  await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`supplier-credit-original:${scope.companyId}:${tax||supplier.id}:${parts.series}:${parts.number}`})) IS NULL) AS locked`;
  const priorCredit=await tx.$queryRaw`SELECT t."id" FROM "StoreTransaction" t JOIN "Supplier" s ON s."id"=t."supplierId" AND s."companyId"=t."companyId" WHERE t."companyId"=${scope.companyId} AND t."type"='SUPPLIER_PAYMENT' AND t."amount"<0 AND t."reversedAt" IS NULL
   AND (t."supplierId"=${supplier.id} OR (${Boolean(tax)} AND REGEXP_REPLACE(COALESCE(s."taxId",''),'[^0-9]','','g')=${tax}))
   AND COALESCE(NULLIF(LTRIM(SUBSTRING(COALESCE(t."invoiceDocumentNumber",'') FROM '([0-9]+)[^0-9]*$'),'0'),''),'0')=${parts.number}
   AND REGEXP_REPLACE(UPPER(REGEXP_REPLACE(COALESCE(t."invoiceDocumentNumber",''),'[0-9]+[^0-9]*$','')),'[^A-ZΑ-Ω0-9]','','g')=${parts.series} LIMIT 1`;
  if(priorCredit.length)fail(409,'Το ίδιο πρωτότυπο πιστωτικό έχει ήδη αρνητική κίνηση. Δεν χρησιμοποιείται δεύτερο πρόχειρο.');

  // Shared shift lock serializes correction, reversal and competing offsets.
  const shift=await session(tx,scope,true);let payment=null,used=0;
  if(body.mode==='OFFSET'){
   payment=(await tx.$queryRaw`SELECT * FROM "StoreTransaction" WHERE "id"=${body.invoicePaymentId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} FOR UPDATE`)[0];
   if(!payment||payment.type!=='SUPPLIER_PAYMENT'||payment.supplierId!==supplier.id||payment.sessionId!==shift.id||!payment.subtractFromShift||payment.reversedAt||!(Number(payment.amount)>0)||scope.user.tokenType==='STORE_OPERATOR'&&payment.actorId!==scope.user.id)fail(409,'Η αρχική πληρωμή δεν είναι διαθέσιμη στην ενεργή βάρδια σου.');
   const invoices=await tx.$queryRaw`SELECT "id","documentNumber","documentDate","totalGross" FROM "PurchaseDocument" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "supplierId"=${supplier.id} AND "documentType"='INVOICE' AND "status" IN ('DRAFT','APPROVED') AND "paymentTransactionId"=${payment.id}`;
   if(!invoices.length||invoices.some(d=>cents(d.totalGross)!==cents(payment.amount)||invoiceToken(d.documentNumber)!==invoiceToken(invoices[0].documentNumber)||new Date(d.documentDate).toISOString().slice(0,10)!==new Date(invoices[0].documentDate).toISOString().slice(0,10)))fail(409,'Η αρχική πληρωμή διαφέρει από την αξία του τιμολογίου. Απαιτείται έλεγχος πριν από συμψηφισμό.');
   payment.invoiceDocumentNumber=invoices[0].documentNumber;
   used=await applied(tx,scope,payment.id);
   if(cents(payment.amount)!==cents(body.expectedPaymentAmount)||cents(used)!==cents(body.expectedAppliedAmount)||cents(doc.totalGross)>cents(payment.amount)-cents(used))fail(409,'Το διαθέσιμο υπόλοιπο της πληρωμής άλλαξε ή δεν καλύπτει το πιστωτικό.');
  }
  const existing=await tx.$queryRaw`SELECT "id" FROM "StoreTransaction" WHERE "companyId"=${scope.companyId} AND "invoicePaymentKey"=${invoicePaymentKey} AND "reversedAt" IS NULL LIMIT 1`;
  if(existing.length)fail(409,'Το ίδιο πιστωτικό έχει ήδη κίνηση ταμείου.');
  const transactionId='credit_'+crypto.createHash('sha256').update(`${scope.companyId}:${doc.id}`).digest('hex');
  const description=body.mode==='OFFSET'?`Συμψηφισμός πιστωτικού ${doc.documentNumber} με τιμολόγιο ${payment.invoiceDocumentNumber}`:`Επιστροφή μετρητών προμηθευτή — Πιστωτικό ${doc.documentNumber}`;
  const value=-cents(doc.totalGross)/100,actorName=scope.user.fullName||'Χρήστης';
  await tx.$executeRaw`INSERT INTO "StoreTransaction"("id","companyId","storeId","sessionId","type","amount","description","supplierId","supplierName","invoiceDocumentNumber","invoicePaymentKey","subtractFromShift","paymentMethod","actorId","actorName","attachmentMimeType","attachmentFilename") VALUES(${transactionId},${scope.companyId},${scope.storeId},${shift.id},'SUPPLIER_PAYMENT',${value},${description},${supplier.id},${supplier.name},${doc.documentNumber},${invoicePaymentKey},true,'CASH_SHIFT',${scope.user.id},${actorName},'application/vnd.myworkstation.purchase-document',${doc.id})`;
  await tx.$executeRaw`UPDATE "PurchaseDocument" SET "paymentTransactionId"=${transactionId},"settlementMode"='PAID',"updatedAt"=NOW() WHERE "id"=${doc.id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`;
  const result={ok:true,transactionId,creditDocumentId:doc.id,mode:body.mode,creditAmount:-value,negativePaymentAmount:value,cashDelta:-value,invoicePaymentId:payment?.id||null,netCashAmount:payment?(cents(payment.amount)-cents(used)+cents(value))/100:null,stockUpdated:false};
  const details={...result,supplierId:supplier.id,supplierName:supplier.name,creditDocumentNumber:doc.documentNumber,invoiceDocumentNumber:payment?.invoiceDocumentNumber||null,invoiceGrossPayment:payment?Number(payment.amount):null,previousAppliedAmount:used,reason:body.reason,confirmOriginal:true,sessionId:shift.id,terminalPos:scope.terminalPos,actorName,idempotencyKey:body.idempotencyKey,requestHash,result};
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit"("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES(${crypto.randomUUID()},${scope.companyId},${scope.storeId},${scope.user.operatorId||scope.user.id},${scope.user.id},'SUPPLIER_CREDIT_CASH_APPLIED',${JSON.stringify(details)}::jsonb)`;
  return result;
 });
}
