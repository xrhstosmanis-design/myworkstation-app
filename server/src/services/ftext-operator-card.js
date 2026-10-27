import {z} from 'zod';
import {ftextSettingsHash} from './ftext-installation.js';
import {ftextPaymentError} from './ftext-error-evidence.js';
const fail=()=>{throw Object.assign(new Error('Η επιβεβαίωση κάρτας δεν αντιστοιχεί στην αρχική συναλλαγή ή χρειάζεται έλεγχο της απόδειξης.'),{status:409,code:'FTEXT_OPERATOR_CARD_REVIEW'})};
export const ftextOperatorCardMode=row=>row?.plan?.payment?.method==='CARD'&&row.checkoutJson?.paymentMethod==='CARD'&&row.checkoutJson?.ftextCardMode==='OPERATOR_CONFIRMATION';
export const ftextOperatorDecisionRequired=row=>ftextOperatorCardMode(row)&&['CONFIRMED','REQUIRES_CHECK'].includes(row.status)&&!['YES','NO'].includes(row.checkoutJson?.ftextCardDecision?.outcome);
// Release only the application's pending lock after an explicit operator review.
// This is not evidence of a fiscal cancellation or a bank decline.
export async function releaseFtextRejectedAttempt(tx,id,scope,actorId,input){
 z.object({registerReady:z.literal(true)}).strict().parse(input);
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "terminalPos"=${scope.terminalPos} FOR UPDATE`)[0];
 const decision=row?.checkoutJson?.ftextCardDecision;
 if(!actorId||!row||row.saleId||row.status!=='REQUIRES_CHECK'||!ftextOperatorCardMode(row)||!ftextPaymentError(row)||decision?.outcome!=='NO'||decision.actorId!==actorId||decision.resultHash!==row.resultHash||decision.settingsHash!==row.settingsHash||row.checkoutJson?.ftextVoid)fail();
 if(row.checkoutJson?.ftextOperatorRelease)return row;
 const release={actorId,at:new Date().toISOString(),resultHash:row.resultHash,settingsHash:row.settingsHash,registerReady:true};
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
 if(previous&&(previous.outcome!=='UNCERTAIN'||outcome==='UNCERTAIN')){
  if(previous.outcome!==outcome||previous.actorId!==actorId||previous.resultHash!==row.resultHash||previous.settingsHash!==row.settingsHash)fail();
  return row;
 }
 // An operator can attest payment, never turn an error/timeout into a fiscal receipt.
 if(outcome==='YES'&&(row.status!=='CONFIRMED'||row.result.outcome!=='CONFIRMED'||row.result.code!==0||!row.result.qr))fail();
 if(row.status==='SALE_COMMITTED'||row.saleId)fail();
 const decision={outcome,actorId,at:clock().toISOString(),resultHash:row.resultHash,settingsHash:row.settingsHash};
 const saved={...row.checkoutJson,ftextCardDecision:decision,ftextCardDecisionHistory:[...(row.checkoutJson.ftextCardDecisionHistory||[]),decision]};
 return (await tx.$queryRaw`UPDATE "FtextCashRequest" SET "checkoutJson"=${JSON.stringify(saved)}::jsonb,"updatedAt"=NOW() WHERE "id"=${row.id} RETURNING *`)[0];
}
