const FINAL=new Set(["SUCCESS","FAILURE","CANCELLED","REVERSED"]);
const PROVIDER_RESULTS=new Set(["SUCCESS","FAILURE","TIMEOUT","CANCELLED","REVERSED"]);

export function transitionPaymentAttempt({currentStatus,nextStatus,reconciled=false,reconciliationNote=""}={}){
  const current=String(currentStatus||"").toUpperCase(),next=String(nextStatus||"").toUpperCase();
  if(!PROVIDER_RESULTS.has(next)){const error=new Error("Μη έγκυρη κατάσταση αποτελέσματος EFTPOS.");error.code="PAYMENT_RESULT_INVALID";error.status=400;throw error}
  if(current===next)return {status:next,replay:true};
  if(current==="PLANNED"&&["SUCCESS","FAILURE","TIMEOUT","CANCELLED"].includes(next))return {status:next,replay:false};
  if(current==="TIMEOUT"&&["SUCCESS","FAILURE","CANCELLED"].includes(next)){
    if(!reconciled||String(reconciliationNote||"").trim().length<5){const error=new Error("Το timeout πρέπει πρώτα να διασταυρωθεί με τον provider.");error.code="PAYMENT_TIMEOUT_RECONCILIATION_REQUIRED";error.status=409;throw error}
    return {status:next,replay:false,reconciled:true};
  }
  if(current==="SUCCESS"&&next==="REVERSED")return {status:next,replay:false};
  const error=new Error(`Δεν επιτρέπεται αλλαγή EFTPOS από ${current||"UNKNOWN"} σε ${next}.`);error.code="PAYMENT_RESULT_TRANSITION_BLOCKED";error.status=409;throw error;
}

export function authorizePaymentRetry(status){
  const current=String(status||"").toUpperCase();
  if(["FAILURE","CANCELLED"].includes(current))return {allowed:true};
  const error=new Error(current==="TIMEOUT"?"Δεν επιτρέπεται retry μετά από timeout χωρίς προηγούμενη διασταύρωση provider.":FINAL.has(current)?`Δεν επιτρέπεται retry σε οριστική κατάσταση ${current}.`:"Η προηγούμενη προσπάθεια δεν έχει οριστικό αποτέλεσμα.");
  error.code=current==="TIMEOUT"?"PAYMENT_TIMEOUT_RECONCILIATION_REQUIRED":"PAYMENT_RETRY_BLOCKED";error.status=409;throw error;
}

