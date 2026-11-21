import crypto from 'node:crypto';
import {z} from 'zod';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const cents=n=>Math.round(Number(n)*100);
const money=n=>cents(n)/100;
export const ownerWithdrawalSchema=z.object({sessionId:z.string().min(1).max(180),amount:z.number().finite().positive().max(999999999).refine(n=>Math.abs(n*100-Math.round(n*100))<0.00001),occurredAt:z.string().datetime({offset:true}),reason:z.string().trim().min(5).max(400),idempotencyKey:z.string().uuid(),expectedSnapshot:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function ownerWithdrawalEventDescription(details,recordedAt){
 const clock=new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',dateStyle:'short',timeStyle:'short',hour12:false});
 const date=value=>{const parsed=new Date(value);return value&&Number.isFinite(parsed.getTime())?clock.format(parsed):'—'};
 const amount=value=>value!=null&&Number.isFinite(Number(value))?Number(value).toFixed(2)+' €':'—';
 return `ΑΝΑΛΗΨΗ ΙΔΙΟΚΤΗΤΗ · ${amount(details.amount)} · Βάρδια ${details.sessionId||'—'} · ${details.shiftOperatorName||'—'} · Παραλαβή ${date(details.occurredAt)} · Καταχώριση ${date(recordedAt)} · Ώρα Ελλάδας · ${details.actorName||'—'} · Διαφορά ${amount(details.before?.variance)} → ${amount(details.after?.variance)} · ${details.reason||'—'}`;
}
export function withdrawalProjection(session,input,now=new Date()){
 const at=new Date(input.occurredAt).getTime(),opened=new Date(session.openedAt).getTime(),closed=session.closedAt?new Date(session.closedAt).getTime():now.getTime();
 if(!['OPEN','CLOSED'].includes(session.status)||session.status==='CLOSED'&&!session.closedAt||!Number.isFinite(at)||!Number.isFinite(opened)||!Number.isFinite(closed)||at<opened||at>closed||at>now.getTime())fail(409,'Η ώρα παραλαβής πρέπει να βρίσκεται μέσα στην επιλεγμένη βάρδια και όχι στο μέλλον.');
 if(session.status==='CLOSED'){
  if(session.expectedOperational==null||session.actualOperational==null||session.variance==null||![session.expectedOperational,session.actualOperational,session.variance].every(n=>Number.isFinite(Number(n))))fail(409,'Δεν είναι διαθέσιμη η συμφωνία της κλεισμένης βάρδιας.');
  if(cents(session.actualOperational)-cents(session.expectedOperational)!==cents(session.variance))fail(409,'Τα στοιχεία κλεισίματος χρειάζονται έλεγχο πριν τη διόρθωση.');
  if(cents(input.amount)>cents(session.expectedOperational))fail(409,'Η ανάληψη υπερβαίνει τα αναμενόμενα μετρητά της βάρδιας.');
  const expected=(cents(session.expectedOperational)-cents(input.amount))/100;
  return {before:{expectedOperational:money(session.expectedOperational),actualOperational:money(session.actualOperational),variance:money(session.variance)},after:{expectedOperational:expected,actualOperational:money(session.actualOperational),variance:(cents(session.actualOperational)-cents(expected))/100}};
 }
 return {before:null,after:null};
}
async function lockedSession(tx,scope,input){
 const rows=await tx.$queryRaw`SELECT * FROM "CashShiftSession" WHERE "id"=${input.sessionId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} FOR UPDATE`;
 if(!rows[0])fail(404,'Δεν βρέθηκε η βάρδια στο επιλεγμένο κατάστημα.');
 return rows[0];
}
async function snapshot(tx,scope,session){
 const rows=await tx.$queryRaw`SELECT COUNT(*)::int AS count,COALESCE(SUM("amount") FILTER(WHERE "reversedAt" IS NULL),0)::text AS total,MAX(GREATEST("createdAt",COALESCE("reversedAt","createdAt")))::text AS last FROM "StoreTransaction" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "sessionId"=${session.id}`;
 return digest({session,ledger:rows[0]});
}
// verify is supplied by the authenticated route and runs against this transaction.
function verifier(scope){if(typeof scope.verify!=='function'||!scope.user?.id||!scope.companyId||!scope.storeId)fail(403,'Απαιτείται εξουσιοδοτημένη σύνδεση.');return scope.verify;}
export async function previewOwnerWithdrawal(db,scope,raw){
 const input=ownerWithdrawalSchema.parse(raw),verify=verifier(scope);
 return db.$transaction(async tx=>{
  await verify(tx);const session=await lockedSession(tx,scope,input),projection=withdrawalProjection(session,input);
  const expectedSnapshot=await snapshot(tx,scope,session);await verify(tx);
  return {sessionId:session.id,storeId:scope.storeId,terminalPos:session.terminalPos,operatorName:session.openedByName,status:session.status,occurredAt:input.occurredAt,amount:input.amount,...projection,expectedSnapshot};
 });
}
export async function recordOwnerWithdrawal(db,scope,raw){
 const input=ownerWithdrawalSchema.parse(raw),verify=verifier(scope);
 if(!input.expectedSnapshot)fail(409,'Απαιτείται προεπισκόπηση πριν την καταχώριση.');
 const domain=JSON.stringify([scope.companyId,scope.storeId,scope.user.id,input.idempotencyKey]),id='owner-withdrawal-'+digest(domain),requestHash=digest(input);
 return db.$transaction(async tx=>{
  await verify(tx);
  await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtextextended(${domain},0)) IS NULL) AS locked`;
  const session=await lockedSession(tx,scope,input);
  const prior=(await tx.$queryRaw`SELECT "details" FROM "StoreOperatorAudit" WHERE "id"=${id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "actorId"=${scope.user.id} AND "eventType"='OWNER_CASH_WITHDRAWAL_RECORDED' LIMIT 1`)[0];
  if(prior){if(prior.details.requestHash!==requestHash)fail(409,'Το ίδιο αίτημα έχει διαφορετικά στοιχεία.');await verify(tx);return {...prior.details.result,duplicate:true};}
  if(await snapshot(tx,scope,session)!==input.expectedSnapshot)fail(409,'Η βάρδια άλλαξε. Ανανέωσε την προεπισκόπηση.');
  const projection=withdrawalProjection(session,input);
  if(session.status==='OPEN'){
   const balance=(await tx.$queryRaw`SELECT COALESCE(SUM(CASE WHEN "type" IN ('SALE_CASH','CUSTOMER_RECEIPT_CASH','TRANSFER_AMOUNT') THEN "amount" WHEN "type"='TRANSFER_OUT' OR ("type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE','BANK_DEPOSIT') AND "subtractFromShift"=true) THEN -"amount" ELSE 0 END),0) AS net FROM "StoreTransaction" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "sessionId"=${session.id} AND "reversedAt" IS NULL`)[0];
   if(cents(input.amount)>cents(Number(session.openingOperational)+Number(balance?.net||0)))fail(409,'Η ανάληψη υπερβαίνει τα διαθέσιμα μετρητά της βάρδιας.');
  }
  const actorName=scope.user.fullName||'Χρήστης',description='Ταμείο → Ιδιοκτήτης · '+input.reason;
  await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","subtractFromShift","paymentMethod","actorId","actorName","occurredAt","createdAt") VALUES (${id},${scope.companyId},${scope.storeId},${session.id},'TRANSFER_OUT',${input.amount},${description},false,'CASH_SHIFT',${scope.user.id},${actorName},${new Date(input.occurredAt)},NOW())`;
  if(projection.after)await tx.$executeRaw`UPDATE "CashShiftSession" SET "expectedOperational"=${projection.after.expectedOperational},"variance"=${projection.after.variance},"updatedAt"=NOW() WHERE "id"=${session.id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "status"='CLOSED'`;
  const result={ok:true,transactionId:id,sessionId:session.id,amount:input.amount,...projection};
  const details=JSON.stringify({sessionId:session.id,transactionId:id,terminalPos:session.terminalPos,shiftOperatorId:session.openedBy,shiftOperatorName:session.openedByName,actorName,occurredAt:input.occurredAt,reason:input.reason,amount:input.amount,before:projection.before,after:projection.after,requestHash,result});
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details","createdAt") VALUES (${id},${scope.companyId},${scope.storeId},NULL,${scope.user.id},'OWNER_CASH_WITHDRAWAL_RECORDED',${details}::jsonb,NOW())`;
  await verify(tx);return {...result,duplicate:false};
 });
}
