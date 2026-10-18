import crypto from 'node:crypto';
import {assertLifecycleMutation} from './store-lifecycle-generation.js';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const fingerprint=r=>crypto.createHash('sha256').update(JSON.stringify([r.id,r.companyId,r.storeId,r.terminalPos,r.clientTransactionId,r.paymentMethod,String(r.total),r.status,r.saleId,r.operatorOutcome,r.createdAt,r.updatedAt,r.checkoutJson])).digest('hex');
export function recoveryBlocker(r){
 if(r.saleId||r.status==='SALE_COMMITTED')return 'Η πώληση έχει ήδη καταχωριστεί.';
 if(!((r.paymentMethod==='CASH'&&r.status==='DISPATCHED')||(r.paymentMethod==='CARD'&&r.status==='OPERATOR_CONFIRMED'&&r.operatorOutcome==='YES')))return 'Απαιτείται έλεγχος της απόδειξης ή της πληρωμής στο κατάστημα.';
 const c=r.checkoutJson||{};
 if(!Array.isArray(c.resolvedItems)||!c.resolvedItems.length)return 'Λείπει το αρχικό καλάθι.';
 const total=Number(r.total),summary=Number(c.baseSummary?.total),sum=c.resolvedItems.reduce((n,x)=>n+Math.round(Number(x.lineTotal)*100),0);
 if(!Number.isFinite(total)||total<=0||!Number.isFinite(summary)||Math.round(total*100)!==Math.round(summary*100)||sum!==Math.round(total*100)||c.resolvedItems.some(x=>!x.productId||!Number.isFinite(Number(x.quantity))||Number(x.quantity)<=0||!Number.isFinite(Number(x.effectiveUnitPrice??x.unitPrice))))return 'Τα αποθηκευμένα είδη και ποσά απαιτούν τεχνικό έλεγχο.';
 // These flows have separate loyalty/customer/order settlement requirements.
 if(c.customerId||Number(c.redeemPoints||0)||c.tableOrderId||c.onlineOrderId||!['COUNTER',undefined,null].includes(c.operationChannel))return 'Η ειδική συναλλαγή απαιτεί τεχνικό έλεγχο.';
 if(!c.actorId||!c.operatorEmployeeId)return 'Λείπει ο αρχικός χειριστής.';
 return null;
}
export function recoveryView(r){
 const blocker=recoveryBlocker(r),c=r.checkoutJson||{};
 return {id:r.id,terminalPos:r.terminalPos,paymentMethod:r.paymentMethod,total:Number(r.total),status:r.status,createdAt:r.createdAt,saleId:r.saleId||null,blocker,preview:fingerprint(r),items:(Array.isArray(c.resolvedItems)?c.resolvedItems:[]).map(x=>({name:x?.name||'',quantity:Number(x?.quantity||1)}))};
}
export async function listPosRecoveries(db,{companyId,storeId}){
 const meta=(await db.$queryRaw`SELECT to_regclass('"RbsCapDriverV1Request"') AS relation`)[0];
 if(!meta?.relation)return {companyId,storeId,requests:[],truncated:false};
 const rows=await db.$queryRaw`SELECT * FROM "RbsCapDriverV1Request" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "saleId" IS NULL AND "status" IN ('PREPARED','CLAIMED','DISPATCHED','OPERATOR_CONFIRMED','REQUIRES_CHECK') ORDER BY "createdAt" ASC LIMIT 101`;
 return {companyId,storeId,requests:rows.slice(0,100).map(recoveryView),truncated:rows.length>100};
}
export async function recoverPosRequest(db,scope,input,{finalizeCash,finalizeCard}){
 return db.$transaction(async tx=>{
  const active=(await tx.$queryRaw`SELECT s."id" FROM "Store" s JOIN "Company" c ON c."id"=s."companyId" WHERE s."id"=${scope.storeId} AND s."companyId"=${scope.companyId} AND s."active"=TRUE AND c."active"=TRUE FOR SHARE OF s,c`)[0];
  if(!active)fail(409,'Το κατάστημα ή η εταιρεία δεν είναι ενεργά.');
  const r=(await tx.$queryRaw`SELECT * FROM "RbsCapDriverV1Request" WHERE "id"=${input.requestId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} FOR UPDATE`)[0];
  if(!r)fail(404,'Δεν βρέθηκε η συναλλαγή στο επιλεγμένο κατάστημα.');
  // Replay only reads the linked, same-scope completed sale. No second audit/write.
  if(r.status==='SALE_COMMITTED'&&r.saleId){
   const sale=(await tx.$queryRaw`SELECT "id" FROM "Sale" WHERE "id"=${r.saleId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "clientTransactionId"=${r.clientTransactionId} AND "status"='COMPLETED' AND "fiscalStatus"='ISSUED'`)[0];
   if(!sale)fail(409,'Απαιτείται έλεγχος της συνδεδεμένης πώλησης.');
   return {companyId:scope.companyId,storeId:scope.storeId,saleId:sale.id,replay:true,allowResend:false};
  }
  const blocker=recoveryBlocker(r);if(blocker)fail(409,blocker);
  if(input.preview!==fingerprint(r))fail(409,'Η συναλλαγή άλλαξε. Ανανέωσε τη λίστα και έλεγξέ την ξανά.');
  if(input.receiptPrinted!==true)fail(400,'Επιβεβαίωσε ότι η συγκεκριμένη απόδειξη έχει ήδη εκδοθεί.');
  await assertLifecycleMutation(tx,scope,r.checkoutJson?.lifecycleGeneration);
  // The still-open shift must predate dispatch and belong to the saved operator.
  // Never silently post an old receipt into a replacement shift.
  const shifts=await tx.$queryRaw`SELECT "id","openedAt","openedBy" FROM "CashShiftSession" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND UPPER(TRIM("terminalPos"))=UPPER(TRIM(${r.terminalPos})) AND "status"='OPEN' FOR SHARE`;
  if(shifts.length!==1||new Date(shifts[0].openedAt)>new Date(r.createdAt)||shifts[0].openedBy!==r.checkoutJson.actorId)fail(409,'Η αρχική βάρδια δεν είναι ανοικτή. Απαιτείται τεχνικός έλεγχος.');
  const finalize=r.paymentMethod==='CASH'?finalizeCash:finalizeCard;
  const result=await finalize(r.id,{db:tx,inTransaction:true});
  if(!result?.saleId)fail(409,'Δεν ολοκληρώθηκε η ανάκτηση. Ανανέωσε για έλεγχο.');
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${scope.companyId},${scope.storeId},NULL,${scope.actorId},'POS_REMOTE_RECOVERY',${JSON.stringify({requestId:r.id,saleId:result.saleId,terminalPos:r.terminalPos,reason:input.reason,receiptPrinted:true,allowResend:false})}::jsonb)`;
  return {companyId:scope.companyId,storeId:scope.storeId,saleId:result.saleId,replay:Boolean(result.replay),allowResend:false};
 });
}
