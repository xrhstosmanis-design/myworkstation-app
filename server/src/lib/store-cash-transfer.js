import crypto from "node:crypto";
import {z} from "zod";

const fail=(status,message)=>{const error=new Error(message);error.status=status;throw error};
export const cashTransferSchema=z.object({direction:z.enum(["IN","OUT"]),amount:z.coerce.number().finite().positive().max(999999999).refine(v=>Math.abs(v*100-Math.round(v*100))<0.00001,"Το ποσό δέχεται έως δύο δεκαδικά."),reason:z.string().trim().min(3).max(400),idempotencyKey:z.string().trim().min(8).max(180),sessionId:z.string().trim().min(1).max(180)});

export function assertCashTransferAccess(user,direction,storeId){
 if(user?.tokenType==="STORE_OPERATOR"){
  if(user.storeId!==storeId||direction!=="OUT"||!user.permissions?.includes("TRANSFER_AMOUNT"))fail(403,"Δεν έχεις δικαίωμα για αυτή τη μεταφορά μετρητών.");
 }else if(!["OWNER","ADMIN","MANAGER","SUPER_ADMIN"].includes(user?.role))fail(403,"Η εισφορά μετρητών απαιτεί Ιδιοκτήτη / Διαχειριστή.");
}

// One ledger row is also the central transaction Audit. No sale or stock write.
export async function recordCashTransfer(db,{user,storeId,terminalPos,body}){
 const input=cashTransferSchema.parse(body);assertCashTransferAccess(user,input.direction,storeId);
 const type=input.direction==="IN"?"TRANSFER_AMOUNT":"TRANSFER_OUT";
 const domain=JSON.stringify([user.companyId,storeId,terminalPos,user.id,input.idempotencyKey]);
 const id=`cash-transfer-${crypto.createHash("sha256").update(domain).digest("hex")}`;
 const description=`${input.direction==="IN"?"Ιδιοκτήτης → Ταμείο":"Ταμείο → Ιδιοκτήτης"} · ${input.reason}`;
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtextextended(${domain},0)) IS NULL) AS locked`;
  const prior=await tx.$queryRaw`SELECT * FROM "StoreTransaction" WHERE "id"=${id} AND "companyId"=${user.companyId} AND "storeId"=${storeId} LIMIT 1`;
  if(prior[0]){
   const row=prior[0];
   if(row.type!==type||Number(row.amount)!==input.amount||row.description!==description||row.sessionId!==input.sessionId)fail(409,"Το ίδιο αίτημα μεταφοράς έχει διαφορετικά στοιχεία.");
   return {transaction:row,duplicate:true};
  }
  const sessions=await tx.$queryRaw`SELECT "id","openingOperational" FROM "CashShiftSession" WHERE "id"=${input.sessionId} AND "companyId"=${user.companyId} AND "storeId"=${storeId} AND "terminalPos"=${terminalPos} AND "status"='OPEN' FOR UPDATE`;
  if(!sessions[0])fail(409,"Η επιλεγμένη βάρδια δεν είναι πλέον ενεργή στο συγκεκριμένο ταμείο.");
  if(input.direction==="OUT"){
   const balance=await tx.$queryRaw`SELECT COALESCE(SUM(CASE WHEN "type" IN ('SALE_CASH','CUSTOMER_RECEIPT_CASH','TRANSFER_AMOUNT') THEN "amount" WHEN "type"='TRANSFER_OUT' OR ("type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE','BANK_DEPOSIT') AND "subtractFromShift"=true) THEN -"amount" ELSE 0 END),0) AS "net" FROM "StoreTransaction" WHERE "companyId"=${user.companyId} AND "storeId"=${storeId} AND "sessionId"=${input.sessionId} AND "reversedAt" IS NULL`;
   if(Math.round((Number(sessions[0].openingOperational)+Number(balance[0]?.net||0))*100)<Math.round(input.amount*100))fail(409,"Το ποσό υπερβαίνει τα διαθέσιμα μετρητά της βάρδιας.");
  }
  const rows=await tx.$queryRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","subtractFromShift","paymentMethod","actorId","actorName") VALUES (${id},${user.companyId},${storeId},${input.sessionId},${type},${input.amount},${description},false,'CASH_SHIFT',${user.id},${user.fullName||"Χρήστης"}) RETURNING *`;
  return {transaction:rows[0],duplicate:false};
 });
}
