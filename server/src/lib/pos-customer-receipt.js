import crypto from "node:crypto";
import {z} from "zod";

const cents=value=>Math.round(Number(value)*100);
const fail=(message,status=409)=>{const error=new Error(message);error.status=status;throw error};
const receiptId=(scope,key)=>crypto.createHash("sha256").update(JSON.stringify([scope.companyId,scope.storeId,scope.terminalPos,key])).digest("hex").slice(0,32);
const receiptFingerprint=(body,user)=>JSON.stringify([body.customerId,cents(body.amount),cents(body.expectedBalance),body.method,body.cardReference,user.id]);
export const customerReceiptSchema=z.object({
  customerId:z.string().min(1).max(120),
  amount:z.coerce.number().finite().positive().max(999999999).refine(v=>Math.abs(v*100-Math.round(v*100))<1e-6,"Το ποσό απαιτεί έως δύο δεκαδικά."),
  expectedBalance:z.coerce.number().finite().positive(),
  method:z.enum(["CASH","CARD"]),
  idempotencyKey:z.string().uuid(),
  received:z.literal(true),
  cardReference:z.string().trim().max(80).optional().default(""),
}).strict().superRefine((body,ctx)=>{if(body.method==="CARD"&&!body.cardReference)ctx.addIssue({code:"custom",path:["cardReference"],message:"Απαιτείται αναφορά εγκεκριμένης πληρωμής κάρτας."})});

// Receipt, shift movement, loyalty and Audit commit together. No Sale/stock/fiscal command.
export async function receiveCustomerDebt(db,scope,input){
  const body=customerReceiptSchema.parse(input),{companyId,storeId,terminalPos,user}=scope;
  if(!companyId||!storeId||!terminalPos||user.companyId!==companyId)fail("Μη έγκυρη εταιρεία/κατάστημα/τερματικό.",403);
  if(user.tokenType!=="STORE_OPERATOR"&&!["SUPER_ADMIN","OWNER","ADMIN","MANAGER"].includes(user.role))fail("Δεν έχεις δικαίωμα είσπραξης πελάτη.",403);
  if(user.tokenType==="STORE_OPERATOR"&&(user.storeId!==storeId||!user.permissions?.includes("CUSTOMERS_POS")||!user.permissions?.includes(body.method==="CASH"?"POS_CASH":"POS_CARDS")))fail("Δεν έχεις δικαίωμα είσπραξης πελάτη με αυτόν τον τρόπο.",403);
  const ledgerId=receiptId(scope,body.idempotencyKey),fingerprint=receiptFingerprint(body,user);
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`CUSTOMER_RECEIPT:${ledgerId}`})) IS NULL) AS locked`;
    const existing=(await tx.$queryRaw`SELECT "eventType","details" FROM "StoreOperatorAudit" WHERE "id"=${ledgerId} AND "companyId"=${companyId} AND "storeId"=${storeId} LIMIT 1`)[0];
    if(existing){if(existing.details.fingerprint!==fingerprint)fail("Η ίδια είσπραξη υποβλήθηκε με διαφορετικά στοιχεία.");if(existing.eventType!=="CUSTOMER_BALANCE_PAYMENT")fail("Η παλιά υποβολή αποδεσμεύτηκε. Άνοιξε νέα φόρμα για καταχώριση της ίδιας πραγματικής είσπραξης.");return {...existing.details.result,replayed:true}}
    const shift=(await tx.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND UPPER(TRIM("terminalPos"))=${terminalPos} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1 FOR KEY SHARE`)[0];
    if(!shift)fail(`Δεν υπάρχει ανοιχτή βάρδια στο ${terminalPos}.`);
    const customer=(await tx.$queryRaw`SELECT "id","name","email","balance","points" FROM "Customer" WHERE "id"=${body.customerId} AND "companyId"=${companyId} AND "active"=true FOR UPDATE`)[0];
    if(!customer)fail("Ο πελάτης δεν βρέθηκε.",404);
    const previousBalance=Number(customer.balance);
    if(cents(previousBalance)!==cents(body.expectedBalance))fail("Το υπόλοιπο του πελάτη άλλαξε. Ανανέωσε πριν την είσπραξη.");
    if(cents(body.amount)>cents(previousBalance)||previousBalance<=0)fail("Το ποσό υπερβαίνει την οφειλή του πελάτη.");
    const balance=(cents(previousBalance)-cents(body.amount))/100,earnedPoints=Math.floor(body.amount),points=Number(customer.points||0)+earnedPoints;
    const actorName=user.fullName||"Πωλητής",note=`Πληρωμή υπολοίπου POS · ${body.method}${body.cardReference?` · Έγκριση ${body.cardReference}`:""}`;
    await tx.$executeRaw`UPDATE "Customer" SET "balance"=${balance},"points"=${points},"updatedAt"=NOW() WHERE "id"=${customer.id} AND "companyId"=${companyId}`;
    await tx.$executeRaw`INSERT INTO "CustomerLedger" ("id","customerId","storeId","entryType","amount","referenceType","referenceId","note","actorId","actorName","paymentMethod","sessionId") VALUES (${ledgerId},${customer.id},${storeId},'RECEIPT',${-body.amount},'POS_CUSTOMER_RECEIPT',${ledgerId},${note},${user.id},${actorName},${body.method},${shift.id})`;
    if(earnedPoints>0)await tx.$executeRaw`INSERT INTO "CustomerLoyaltyLedger" ("id","companyId","storeId","customerId","sessionId","type","points","amount","actorId") VALUES (${ledgerId},${companyId},${storeId},${customer.id},${shift.id},'EARN',${earnedPoints},${body.amount},${user.id})`;
    await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName") VALUES (${ledgerId},${companyId},${storeId},${shift.id},${body.method==="CASH"?"CUSTOMER_RECEIPT_CASH":"CUSTOMER_RECEIPT_CARD"},${body.amount},${`Είσπραξη πελάτη ${customer.name} · ${ledgerId}`},${user.id},${actorName})`;
    const result={ok:true,ledgerId,amount:body.amount,method:body.method,customer:{id:customer.id,name:customer.name,email:customer.email},previousBalance,balance,points,earnedPoints,sessionId:shift.id,replayed:false};
    await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${ledgerId},${companyId},${storeId},${user.operatorId||user.id},${user.id},'CUSTOMER_BALANCE_PAYMENT',${JSON.stringify({customerId:customer.id,ledgerId,amount:body.amount,method:body.method,previousBalance,balance,earnedPoints,sessionId:shift.id,fingerprint,result})}::jsonb)`;
    return result;
  });
}

// An uncertain request is either returned as committed or durably cancelled under
// the SAME lock. A late original request cannot post after an absent-status check.
export async function recoverCustomerDebt(db,scope,input){
  const body=customerReceiptSchema.parse(input),{companyId,storeId,terminalPos,user}=scope;
  if(user.companyId!==companyId||!terminalPos||(user.tokenType==="STORE_OPERATOR"&&(user.storeId!==storeId||!user.permissions?.includes("CUSTOMERS_POS"))))fail("Δεν έχεις δικαίωμα ανάκτησης είσπραξης.",403);
  if(user.tokenType!=="STORE_OPERATOR"&&!["SUPER_ADMIN","OWNER","ADMIN","MANAGER"].includes(user.role))fail("Δεν έχεις δικαίωμα ανάκτησης είσπραξης.",403);
  const ledgerId=receiptId(scope,body.idempotencyKey),fingerprint=receiptFingerprint(body,user);
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`CUSTOMER_RECEIPT:${ledgerId}`})) IS NULL) AS locked`;
    const existing=(await tx.$queryRaw`SELECT "eventType","details" FROM "StoreOperatorAudit" WHERE "id"=${ledgerId} AND "companyId"=${companyId} AND "storeId"=${storeId} LIMIT 1`)[0];
    if(existing){if(existing.details.fingerprint!==fingerprint)fail("Η αναφορά είσπραξης έχει διαφορετικά στοιχεία.");if(existing.eventType==="CUSTOMER_BALANCE_PAYMENT")return {...existing.details.result,replayed:true}}
    const customer=(await tx.$queryRaw`SELECT "id","name","balance","points" FROM "Customer" WHERE "id"=${body.customerId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`)[0];
    if(!customer)fail("Ο πελάτης δεν βρέθηκε.",404);
    if(!existing)await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${ledgerId},${companyId},${storeId},${user.operatorId||user.id},${user.id},'CUSTOMER_RECEIPT_CANCELLED',${JSON.stringify({fingerprint,customerId:customer.id,idempotencyKey:body.idempotencyKey})}::jsonb)`;
    return {cancelled:true,customer:{id:customer.id,name:customer.name},balance:Number(customer.balance),points:Number(customer.points||0)};
  });
}
