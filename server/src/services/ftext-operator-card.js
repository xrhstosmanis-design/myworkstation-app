import {z} from 'zod';
import {ftextSettingsHash} from './ftext-installation.js';
import {ftextPaymentError,ftextUnknownCardError} from './ftext-error-evidence.js';
const fail=()=>{throw Object.assign(new Error('Η επιβεβαίωση κάρτας δεν αντιστοιχεί στην αρχική συναλλαγή ή χρειάζεται έλεγχο της απόδειξης.'),{status:409,code:'FTEXT_OPERATOR_CARD_REVIEW'})};
export const ftextOperatorCardMode=row=>row?.plan?.payment?.method==='CARD'&&row.checkoutJson?.paymentMethod==='CARD'&&row.checkoutJson?.ftextCardMode==='OPERATOR_CONFIRMATION';
export const ftextOperatorDecisionRequired=row=>ftextOperatorCardMode(row)&&['CONFIRMED','REQUIRES_CHECK'].includes(row.status)&&!['YES','NO'].includes(row.checkoutJson?.ftextCardDecision?.outcome);
// Release only the application's pending lock after an explicit operator review.
// This is not evidence of a fiscal cancellation or a bank decline.
export function ftextOperatorReleaseMode(row){
 const d=row?.checkoutJson?.ftextCardDecision;
 if(!row||row.saleId||row.status!=='REQUIRES_CHECK'||!ftextOperatorCardMode(row)||d?.outcome!=='NO'||d.actorId!==row.checkoutJson.actorId||d.resultHash!==row.resultHash||d.settingsHash!==row.settingsHash||row.checkoutJson.ftextVoid)return null;
 if(row.checkoutJson.ftextOperatorRelease?.registerReady===true)return 'RELEASED';
 if(ftextPaymentError(row))return 'VERIFIED_ERROR';
 return ftextUnknownCardError(row)?'OPERATOR_REVIEW':null;
}
export async function releaseFtextRejectedAttempt(tx,id,scope,actorId,input,{context}={}){
 const ack=z.union([z.object({operatorNo:z.literal(true)}).strict(),z.object({registerReady:z.literal(true)}).strict()]).parse(input);
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "terminalPos"=${scope.terminalPos} FOR UPDATE`)[0];
 const decision=row?.checkoutJson?.ftextCardDecision;
 const mode=ftextOperatorReleaseMode(row);
 if(!actorId||!mode||decision.actorId!==actorId)fail();
 if(mode==='RELEASED')return row;
 if(mode==='OPERATOR_REVIEW'||ack.operatorNo===true){
  if(ack.operatorNo!==true||typeof context!=='function')fail();
  const {settings}=await context(tx,scope,{requireOnline:false});
  if(!settings||settings.cardEnabled!==true||settings.cardPayment?.resultFormat!=='OPERATOR_CONFIRMATION'||settings.companyId!==scope.companyId||settings.storeId!==scope.storeId||settings.terminalPos!==scope.terminalPos||row.settingsHash!==ftextSettingsHash(settings)||row.lifecycleGeneration!==settings.lifecycleGeneration||row.serialNumber!==settings.serialNumber||row.plan.payment.code!==settings.cardPayment.code)fail();
 }
 // registerReady is the existing application-lock predicate, not a new physical attestation.
 const release={actorId,at:new Date().toISOString(),resultHash:row.resultHash,settingsHash:row.settingsHash,registerReady:true,...(ack.operatorNo===true?{reviewMode:'OPERATOR_NO',readinessVerified:false}:{} )};
 return (await tx.$queryRaw`UPDATE "FtextCashRequest" SET "checkoutJson"=${JSON.stringify({...row.checkoutJson,ftextOperatorRelease:release})}::jsonb,"updatedAt"=NOW() WHERE "id"=${row.id} RETURNING *`)[0];
}
export function assertFtextOperatorCardApproved(row,settings){
 if(!ftextOperatorCardMode(row)){
  if(row.plan?.payment?.method==='CARD'&&settings.cardPayment?.resultFormat==='OPERATOR_CONFIRMATION')fail();
  return;
 }
 const decision=row.checkoutJson.ftextCardDecision;
 if(settings.cardPayment?.resultFormat!=='OPERATOR_CONFIRMATION'||decision?.outcome!=='YES'||decision.actorId!==row.checkoutJson.actorId||decision.resultHash!==row.resultHash||decision.settingsHash!==row.settingsHash)fail();
}
export async function recordFtextOperatorDecision(tx,id,scope,actorId,input,{context,clock=()=>new Date()}={}){
 const {outcome}=z.object({outcome:z.enum(['YES','NO','UNCERTAIN'])}).strict().parse(input);
 const current=await context(tx,scope,{requireOnline:false});
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "terminalPos"=${scope.terminalPos} FOR UPDATE`)[0];
 if(!row||!actorId||actorId!==row.checkoutJson?.actorId||!ftextOperatorCardMode(row)||current.settings.cardEnabled!==true||current.settings.cardPayment?.resultFormat!=='OPERATOR_CONFIRMATION'||row.settingsHash!==ftextSettingsHash(current.settings)||row.lifecycleGeneration!==current.settings.lifecycleGeneration||row.checkoutJson?.ftextVoid||!row.resultHash||!row.result||!['CONFIRMED','REQUIRES_CHECK','SALE_COMMITTED'].includes(row.status))fail();
 const previous=row.checkoutJson.ftextCardDecision;
 const complete=async candidate=>outcome==='NO'&&['VERIFIED_ERROR','OPERATOR_REVIEW'].includes(ftextOperatorReleaseMode(candidate))?releaseFtextRejectedAttempt(tx,id,scope,actorId,{operatorNo:true},{context}):candidate;
 if(previous&&(previous.outcome!=='UNCERTAIN'||outcome==='UNCERTAIN')){
  if(previous.outcome!==outcome||previous.actorId!==actorId||previous.resultHash!==row.resultHash||previous.settingsHash!==row.settingsHash)fail();
  return complete(row);
 }
 // An operator can attest payment, never turn an error/timeout into a fiscal receipt.
 if(outcome==='YES'&&(row.status!=='CONFIRMED'||row.result.outcome!=='CONFIRMED'||row.result.code!==0||!row.result.qr))fail();
 if(row.status==='SALE_COMMITTED'||row.saleId)fail();
 const decision={outcome,actorId,at:clock().toISOString(),resultHash:row.resultHash,settingsHash:row.settingsHash};
 const saved={...row.checkoutJson,ftextCardDecision:decision,ftextCardDecisionHistory:[...(row.checkoutJson.ftextCardDecisionHistory||[]),decision]};
 return complete((await tx.$queryRaw`UPDATE "FtextCashRequest" SET "checkoutJson"=${JSON.stringify(saved)}::jsonb,"updatedAt"=NOW() WHERE "id"=${row.id} RETURNING *`)[0]);
}
