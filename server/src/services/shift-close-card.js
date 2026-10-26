import {createHash,randomUUID,timingSafeEqual} from "node:crypto";
import bcrypt from "bcryptjs";
import {normalizeWorkCard,workCardHash} from "../workforce-card-code.js";

const denied=()=>Object.assign(new Error("Σκάναρε την ενεργή προσωπική κάρτα του χειριστή που άνοιξε τη βάρδια. Το κλείσιμο δεν έγινε."),{status:403,code:"SHIFT_CLOSE_CARD_REQUIRED"});

export async function verifyShiftCloseCard(tx,user,session,cardCode){
  // Privileged BackOffice closure retains its existing authorization path.
  if(user?.tokenType!=="STORE_OPERATOR")return;
  const operatorId=user.operatorId||user.id;
  if(!operatorId||session.openedBy!==operatorId||session.companyId!==user.companyId||session.storeId!==user.storeId||normalizeWorkCard(cardCode).length<3)throw denied();
  const rows=await tx.$queryRaw`SELECT "cardCodeHash" FROM "StoreOperatorCredential"
    WHERE "id"=${operatorId} AND "employeeId"=${user.employeeId} AND "companyId"=${session.companyId}
      AND "storeId"=${session.storeId} AND "active"=TRUE FOR SHARE`;
  const expected=String(rows[0]?.cardCodeHash||"");
  if(!/^[a-f0-9]{64}$/i.test(expected)||!timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(workCardHash(cardCode),"hex")))throw denied();
}

const terminal=value=>String(value||"MAIN").trim().toUpperCase()||"MAIN";
const pinDenied=()=>Object.assign(new Error("Χρειάζεται ο ενεργός χειριστής που άνοιξε τη βάρδια και το προσωπικό του PIN. Το κλείσιμο δεν έγινε."),{status:403,code:"SHIFT_CLOSE_PIN_UNAVAILABLE"});

// Call inside the locked close transaction, before any financial or attendance work.
// A failed PIN is a result rather than a thrown error: the caller must commit only
// this guard result, then send the refusal outside the transaction.
export async function verifyShiftCloseCredential(tx,user,session,{closeCredentialMethod="CARD",cardCode,pin}={}){
  if(user?.tokenType!=="STORE_OPERATOR")return {ok:true,method:"BACKOFFICE"};
  if(!["CARD","PIN"].includes(closeCredentialMethod)||(pin&&String(cardCode||"").trim())||(closeCredentialMethod==="CARD"&&pin))throw Object.assign(new Error("Επίλεξε μόνο κάρτα ή προσωπικό PIN για το κλείσιμο."),{status:400,code:"SHIFT_CLOSE_CREDENTIAL_INVALID"});
  if(closeCredentialMethod==="CARD"){
    await verifyShiftCloseCard(tx,user,session,cardCode);
    return {ok:true,method:"CARD"};
  }
  const operatorId=user.operatorId||user.id;
  if(typeof pin!=="string"||!/^\d{4,8}$/.test(pin))throw Object.assign(new Error("Το προσωπικό PIN πρέπει να έχει 4–8 ψηφία."),{status:400,code:"SHIFT_CLOSE_CREDENTIAL_INVALID"});
  if(!operatorId||!user.employeeId||session.openedBy!==operatorId||session.companyId!==user.companyId||session.storeId!==user.storeId||terminal(session.terminalPos)!==terminal(user.terminalPos))throw pinDenied();
  const credentials=await tx.$queryRaw`
    SELECT c."pinHash" FROM "StoreOperatorCredential" c
    JOIN "Employee" e ON e."id"=c."employeeId" AND e."storeId"=c."storeId"
    WHERE c."id"=${operatorId} AND c."employeeId"=${user.employeeId} AND c."companyId"=${session.companyId}
      AND c."storeId"=${session.storeId} AND c."active"=TRUE AND e."active"=TRUE
    FOR SHARE OF c,e`;
  if(!credentials[0]?.pinHash)throw pinDenied();
  const subjectKey=`SHIFT_CLOSE_PIN:${createHash("sha256").update(operatorId).digest("hex")}`;
  await tx.$executeRaw`INSERT INTO "StoreOperatorLoginGuard" ("id","storeId","subjectKey","failedCount","windowStartedAt","lockedUntil","updatedAt") VALUES (${randomUUID()},${session.storeId},${subjectKey},0,NOW(),NULL,NOW()) ON CONFLICT ("storeId","subjectKey") DO NOTHING`;
  const guards=await tx.$queryRaw`SELECT "failedCount","windowStartedAt","lockedUntil" FROM "StoreOperatorLoginGuard" WHERE "storeId"=${session.storeId} AND "subjectKey"=${subjectKey} FOR UPDATE`;
  const guard=guards[0];
  if(!guard)throw new Error("Δεν ήταν διαθέσιμος ο έλεγχος προσωπικού PIN. Το κλείσιμο δεν έγινε.");
  if(guard.lockedUntil&&new Date(guard.lockedUntil).getTime()>Date.now())return {ok:false,status:429,code:"SHIFT_CLOSE_PIN_LOCKED",error:"Πολλές λανθασμένες προσπάθειες PIN. Δοκίμασε ξανά σε 15 λεπτά ή χρησιμοποίησε την προσωπική σου κάρτα."};
  let valid=false;
  try{valid=await bcrypt.compare(pin,credentials[0].pinHash)}catch{/* A corrupt stored hash never authenticates. */}
  if(!valid){
    const resetWindow=!guard.windowStartedAt||Date.now()-new Date(guard.windowStartedAt).getTime()>=15*60*1000,nextCount=resetWindow?1:Number(guard.failedCount||0)+1,lockedUntil=nextCount>=5?new Date(Date.now()+15*60*1000):null;
    await tx.$executeRaw`UPDATE "StoreOperatorLoginGuard" SET "failedCount"=${nextCount},"windowStartedAt"=CASE WHEN ${resetWindow} THEN NOW() ELSE "windowStartedAt" END,"lockedUntil"=${lockedUntil},"updatedAt"=NOW() WHERE "storeId"=${session.storeId} AND "subjectKey"=${subjectKey}`;
    return {ok:false,status:401,code:"SHIFT_CLOSE_PIN_INVALID",error:"Το προσωπικό PIN δεν είναι σωστό. Το κλείσιμο δεν έγινε."};
  }
  await tx.$executeRaw`DELETE FROM "StoreOperatorLoginGuard" WHERE "storeId"=${session.storeId} AND "subjectKey"=${subjectKey}`;
  return {ok:true,method:"PIN"};
}
