import crypto from 'node:crypto';
const deny=(code,message)=>{throw Object.assign(new Error(message),{status:403,code})};
// The completed transaction row serializes first delivery across tabs/operators.
// Historical receipt-view audits count too; this gate does not reissue a PIN.
export async function recordNetlinkVoucherDelivery({db,scope,requestId,actorId,operatorId,role,allowReprint=false}){
 return db.$transaction(async tx=>{
  const row=(await tx.$queryRaw`SELECT "id","status" FROM "NetlinkTransaction" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "requestId"=${requestId} AND "issuanceIntentEnc" IS NOT NULL FOR UPDATE`)[0];
  if(row?.status!=='COMPLETED')deny('NETLINK_RECEIPT_UNAVAILABLE','Δεν υπάρχει ολοκληρωμένη κάρτα για εκτύπωση.');
  const seen=(await tx.$queryRaw`SELECT EXISTS(SELECT 1 FROM "StoreOperatorAudit" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "eventType"='NETLINK_RECEIPT_VIEWED' AND "details"->>'requestId'=${requestId}) AS "seen"`)[0]?.seen;
  if(seen&&!allowReprint)deny('NETLINK_VOUCHER_ALREADY_DELIVERED','Η κάρτα έχει ήδη παραδοθεί για εκτύπωση. Για επανεκτύπωση απαιτείται υπεύθυνος.');
  const deliveryId=crypto.randomUUID(),deliveryMode=seen?'RESPONSIBLE_REPRINT':'INITIAL';
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${deliveryId},${scope.companyId},${scope.storeId},${operatorId},${actorId},'NETLINK_RECEIPT_VIEWED',${JSON.stringify({requestId,deliveryId,deliveryMode,role})}::jsonb)`;
  return {deliveryId,deliveryMode};
 },{maxWait:5000,timeout:10000});
}
