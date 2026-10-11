import crypto from 'node:crypto';
import {z} from 'zod';
export const INTERNAL_RETURN_MODE='INTERNAL_RETURN_PENDING_RBS';
export const INTERNAL_RETURN_LABEL='Εκκρεμεί φορολογική επιστροφή RBS';
export const INTERNAL_RETURN_REASONS=['Λάθος χειριστή','Επιστροφή από πελάτη','Λάθος καταχώρηση'];
export const internalReturnSchema=z.object({items:z.array(z.object({lineId:z.string().min(1).max(200),quantity:z.number().finite().positive().max(999999)})).min(1).max(100),reason:z.enum(INTERNAL_RETURN_REASONS),refundMethod:z.enum(['CASH','CARD','IRIS']),confirmed:z.literal(true)});
const reject=(message,status=409)=>{const e=new Error(message);e.status=status;throw e};
const cents=v=>{const n=Number(v);if(!Number.isFinite(n)||Math.abs(n*100-Math.round(n*100))>0.00001)reject('Η αρχική συναλλαγή έχει μη έγκυρη χρηματική ανάλυση.');return Math.round(n*100)};
export function internalReturnAmounts(sale,lines,payments,items){
 const total=cents(sale.total),sum=payments.reduce((s,p)=>{if(!['CASH','CARD','IRIS'].includes(p.method)||cents(p.amount)<=0)reject('Μη υποστηριζόμενη αρχική πληρωμή.');return s+cents(p.amount)},0);
 if(total<=0||sum!==total||!lines.length||!payments.length)reject('Η αρχική συναλλαγή δεν έχει συνεπή ποσά/πληρωμές.');
 const originalSum=lines.reduce((s,l)=>{if(!(Number(l.quantity)>0)||cents(l.lineTotal)<0)reject('Μη έγκυρη αρχική γραμμή.');return s+cents(l.lineTotal)},0);
 if(originalSum<=0)reject('Δεν υπάρχει ποσό προς επιστροφή.');
 const byId=new Map(lines.map(l=>[l.id,l])),seen=new Set();
 const selected=items.map(item=>{const line=byId.get(item.lineId);if(!line||seen.has(item.lineId))reject('Επίλεξε κάθε προϊόν της αρχικής απόδειξης μία φορά.',400);seen.add(item.lineId);const q=Number(item.quantity),originalQty=Number(line.quantity);if(!Number.isFinite(q)||q<=0||q>originalQty||Math.abs(q*1000-Math.round(q*1000))>0.000001)reject('Μη έγκυρη ποσότητα επιστροφής.',400);return {...line,returnQty:q,rawCents:cents(line.lineTotal)*q/originalQty*total/originalSum}});
 const refundCents=Math.round(selected.reduce((s,l)=>s+l.rawCents,0));if(refundCents<=0||refundCents>total)reject('Δεν υπάρχει έγκυρο ποσό προς επιστροφή.');
 for(const l of selected)l.returnCents=Math.floor(l.rawCents);
 let remainder=refundCents-selected.reduce((s,l)=>s+l.returnCents,0);
 for(const l of [...selected].sort((a,b)=>(b.rawCents-Math.floor(b.rawCents))-(a.rawCents-Math.floor(a.rawCents))||a.id.localeCompare(b.id))){if(remainder-->0)l.returnCents++;}
 return {selected,refundCents};
}
export async function recordInternalReturn(db,scope,input){
 const body=internalReturnSchema.parse(input),{companyId,storeId,saleId,terminalPos,user}=scope;
 if(!companyId||!storeId||!saleId||!terminalPos||!user?.id||user.companyId!==companyId||(user.tokenType==='STORE_OPERATOR'&&(user.storeId!==storeId||!user.permissions?.includes('RETURN_ITEMS'))))reject('Δεν έχεις δικαίωμα επιστροφής στο επιλεγμένο κατάστημα.',403);
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`reverse:${saleId}`})) IS NULL) AS locked`;
  const sale=(await tx.$queryRaw`SELECT * FROM "Sale" WHERE "id"=${saleId} AND "companyId"=${companyId} AND "storeId"=${storeId} FOR UPDATE`)[0];
  if(!sale)reject('Δεν βρέθηκε η αρχική απόδειξη.',404);
  if(sale.source!=='POS'||sale.status!=='COMPLETED'||sale.fiscalStatus!=='ISSUED'||sale.operationChannel!=='COUNTER'||sale.originalSaleId||sale.reversalState)reject('Η εσωτερική επιστροφή απαιτεί αρχική ολοκληρωμένη απόδειξη RBS στο ταμείο.');
  const request=(await tx.$queryRaw`SELECT "id","terminalPos" FROM "RbsCapDriverV1Request" WHERE "saleId"=${saleId} AND "companyId"=${companyId} AND "storeId"=${storeId} AND "status"='SALE_COMMITTED' LIMIT 1`)[0];
  if(!request||String(request.terminalPos||'').trim().toUpperCase()!==terminalPos)reject('Η απόδειξη δεν είναι επιβεβαιωμένη RBS αυτού του POS.');
  const shift=(await tx.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "terminalPos"=${terminalPos} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1 FOR UPDATE`)[0];
  if(!shift)reject('Δεν υπάρχει ανοικτή βάρδια αυτού του POS.');
  const linked=await tx.$queryRaw`SELECT "id" FROM "StoreTransaction" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "sessionId"=${shift.id} AND "type" IN ('SALE_CASH','SALE_CARD','SALE_IRIS') AND COALESCE("description",'') LIKE ${`%POS πώληση ${saleId} ·%`} LIMIT 1`;
  if(!linked.length)reject('Η αρχική απόδειξη δεν ανήκει στην τρέχουσα ανοικτή βάρδια.');
  if((await tx.$queryRaw`SELECT "id" FROM "Sale" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "originalSaleId"=${saleId} LIMIT 1`).length)reject('Η απόδειξη έχει ήδη επιστροφή. Δεν έγινε δεύτερη καταχώριση.');
  const lines=await tx.$queryRaw`SELECT * FROM "SaleLine" WHERE "saleId"=${saleId} ORDER BY "createdAt","id"`,payments=await tx.$queryRaw`SELECT * FROM "Payment" WHERE "saleId"=${saleId} ORDER BY "createdAt","id"`;
  const {selected,refundCents}=internalReturnAmounts(sale,lines,payments,body.items),refund=refundCents/100,returnSaleId=crypto.randomUUID(),who=user.fullName||user.email||'Χειριστής',restoredProductIds=[];
  await tx.$executeRaw`INSERT INTO "Sale" ("id","companyId","storeId","operatorEmployeeId","customerId","fiscalStatus","subtotal","discount","total","status","source","occurredAt","transactionMode","originalSaleId","reversalKind","operationChannel") VALUES (${returnSaleId},${companyId},${storeId},${user.employeeId||null},${sale.customerId||null},'NON_FISCAL',${-refund},0,${-refund},'COMPLETED','POS_REVERSAL',NOW(),${INTERNAL_RETURN_MODE},${saleId},'RETURN_ITEMS','COUNTER')`;
  for(const line of selected){
   if(line.productId){const product=(await tx.$queryRaw`SELECT p."trackStock",sp."productId" AS "storeProductId" FROM "Product" p LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} WHERE p."id"=${line.productId} AND p."companyId"=${companyId} LIMIT 1`)[0];if(!product||(product.trackStock&&!product.storeProductId))reject('Δεν υπάρχει ασφαλής αντιστοίχιση αποθήκης της αρχικής γραμμής.');}
   await tx.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","description","quantity","unitPrice","discount","vatRate","lineTotal") VALUES (${crypto.randomUUID()},${returnSaleId},${line.productId||null},${line.description},${-line.returnQty},${Number(line.unitPrice)},${-Number(line.discount||0)*line.returnQty/Number(line.quantity)},${Number(line.vatRate)},${-line.returnCents/100})`;
   if(line.productId){const restored=await tx.$queryRaw`UPDATE "StoreProduct" sp SET "currentStock"=COALESCE(sp."currentStock",0)+${line.returnQty} FROM "Product" p WHERE sp."storeId"=${storeId} AND sp."productId"=${line.productId} AND p."id"=sp."productId" AND p."companyId"=${companyId} AND p."trackStock"=TRUE RETURNING sp."productId"`;if(restored[0])restoredProductIds.push(line.productId);}
  }
  await tx.$executeRaw`INSERT INTO "Payment" ("id","saleId","method","amount") VALUES (${crypto.randomUUID()},${returnSaleId},${body.refundMethod},${-refund})`;
  const description=`POS ΕΣΩΤΕΡΙΚΗ ΕΠΙΣΤΡΟΦΗ ${returnSaleId} · αρχική ${saleId} · ${INTERNAL_RETURN_LABEL} · Αιτιολογία: ${body.reason} · ${body.refundMethod}`;
  await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName") VALUES (${crypto.randomUUID()},${companyId},${storeId},${shift.id},${body.refundMethod==='CASH'?'SALE_CASH':body.refundMethod==='IRIS'?'SALE_IRIS':'SALE_CARD'},${-refund},${description},${user.id},${who})`;
  const details={transactionMode:INTERNAL_RETURN_MODE,fiscalPending:true,label:INTERNAL_RETURN_LABEL,reason:body.reason,originalSaleId:saleId,reversalSaleId:returnSaleId,originalReceiptNumber:sale.receiptNumber||null,rbsRequestId:request.id,sessionId:shift.id,terminalPos,refund,refundMethod:body.refundMethod,originalTotal:Number(sale.total),reversalTotal:-refund,stockRestoredProductIds:restoredProductIds,payments:[{method:body.refundMethod,amount:refund}],items:selected.map(l=>({lineId:l.id,productId:l.productId,description:l.description,quantity:l.returnQty,lineTotal:l.returnCents/100}))};
  await tx.$executeRaw`INSERT INTO "PosSaleActionAudit" ("id","companyId","storeId","saleId","relatedSaleId","actionType","reason","actorId","actorName","details") VALUES (${crypto.randomUUID()},${companyId},${storeId},${returnSaleId},${saleId},'RETURN_ITEMS',${body.reason},${user.id},${who},${JSON.stringify(details)}::jsonb)`;
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${companyId},${storeId},${user.operatorId||user.id},${user.id},'POS_INTERNAL_RETURN_PENDING_RBS',${JSON.stringify(details)}::jsonb)`;
  return {ok:true,returnSaleId,originalSaleId:saleId,total:-refund,sessionId:shift.id,transactionMode:INTERNAL_RETURN_MODE,label:INTERNAL_RETURN_LABEL};
 });
}
