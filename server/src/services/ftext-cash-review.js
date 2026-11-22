import {createHash} from 'node:crypto';
import {ftextSettingsHash} from './ftext-installation.js';

const unknown='The physical receipt could not be verified. Do not resend.';
const fail=()=>{throw Object.assign(new Error('Η αρχική απόδειξη χρειάζεται έλεγχο. Δεν καταχωρίστηκε πώληση και δεν στάλθηκε νέα εντολή.'),{status:409,code:'FTEXT_CASH_OPERATOR_REVIEW'})};

// Only the stored, canonical timeout report is eligible. A missing reply or a
// real fiscal receipt can never be converted into a failure by this review.
export function ftextCashReviewable(row){
 const r=row?.result,c=row?.checkoutJson;
 if(!row||row.status!=='REQUIRES_CHECK'||row.saleId||row.plan?.payment?.method!=='CASH'||c?.paymentMethod!=='CASH'||!c.actorId||c.ftextVoid||c.ftextLateCashReceipt||c.ftextCardDecision||c.ftextOperatorRelease)return false;
 if(r?.requestId!==row.id||r.settingsHash!==row.settingsHash||r.outcome!=='REQUIRES_CHECK'||r.description!==unknown)return false;
 const keys=Object.keys(r).sort().join(',');
 const deviceTimeout=keys==='code,description,outcome,rawResultHash,requestId,settingsHash'&&r.code===101&&typeof r.rawResultHash==='string'&&/^[a-f0-9]{64}$/.test(r.rawResultHash);
 if(keys!=='description,outcome,requestId,settingsHash'&&!deviceTimeout)return false;
 // Match validateFtextCashResult's canonical field order, including the device
 // evidence. JSONB key order is not the original signed result order. Code101
 // permits explicit review only; it never proves failure or releases by itself.
 const canonical={requestId:r.requestId,settingsHash:r.settingsHash,outcome:r.outcome,...(deviceTimeout?{code:r.code,rawResultHash:r.rawResultHash}:{}),description:r.description};
 return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')===row.resultHash;
}

export function ftextCashReviewReleased(row){
 const c=row?.checkoutJson,d=c?.ftextCashDecision,r=c?.ftextOperatorRelease;
 if(r?.reviewMode!=='CASH_OPERATOR_NO'||r.registerReady!==true||r.readinessVerified!==false||!d||d.outcome!=='NO'||d.actorId!==c.actorId||r.actorId!==d.actorId||d.resultHash!==row.resultHash||r.resultHash!==row.resultHash||d.settingsHash!==row.settingsHash||r.settingsHash!==row.settingsHash)return false;
 return ftextCashReviewable({...row,checkoutJson:{...c,ftextOperatorRelease:undefined}});
}

export function decideFtextCashReview(row,settings,scope,actorId,outcome,now){
 if(!actorId||actorId!==row?.checkoutJson?.actorId||!['NO','UNCERTAIN'].includes(outcome)||row.companyId!==scope.companyId||row.storeId!==scope.storeId||row.terminalPos!==scope.terminalPos||settings.companyId!==scope.companyId||settings.storeId!==scope.storeId||settings.terminalPos!==scope.terminalPos||settings.cashEnabled!==true||row.settingsHash!==ftextSettingsHash(settings)||row.lifecycleGeneration!==settings.lifecycleGeneration||row.serialNumber!==settings.serialNumber||row.plan?.payment?.code!==1)fail();
 const previous=row.checkoutJson.ftextCashDecision;
 if(ftextCashReviewReleased(row)){
  if(outcome!=='NO')fail();
  return null;
 }
 if(!ftextCashReviewable(row))fail();
 if(previous){
  if(previous.actorId!==actorId||previous.resultHash!==row.resultHash||previous.settingsHash!==row.settingsHash||previous.outcome==='NO')fail();
  if(previous.outcome===outcome)return null;
 }
 const decision={outcome,actorId,at:now.toISOString(),resultHash:row.resultHash,settingsHash:row.settingsHash};
 return {...row.checkoutJson,ftextCashDecision:decision,ftextCashDecisionHistory:[...(row.checkoutJson.ftextCashDecisionHistory||[]),decision],...(outcome==='NO'?{ftextOperatorRelease:{...decision,reviewMode:'CASH_OPERATOR_NO',registerReady:true,readinessVerified:false}}:{})};
}
