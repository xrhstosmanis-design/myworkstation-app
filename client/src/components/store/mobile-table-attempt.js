const prefix="myworkstation:mobile-table-attempt:v1:";
const unavailable="Δεν διατηρήθηκε με ασφάλεια ο κωδικός αποστολής σε αυτή την καρτέλα. Δεν στάλθηκε νέος γύρος. Έλεγξε το τραπέζι από το POS.";
export const mobileAttemptScope=(companyId,storeId,operatorId)=>companyId&&storeId&&operatorId?JSON.stringify([companyId,storeId,operatorId]):null;
const storageKey=scope=>{if(!scope)throw new Error(unavailable);return prefix+scope};
export function readMobileAttempt(scope){
  try{
    const raw=window.sessionStorage.getItem(storageKey(scope));
    if(!raw)return {scope,attempt:null,error:""};
    const attempt=JSON.parse(raw);
    if(attempt.scope!==scope||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attempt.request?.idempotencyKey||"")||!attempt.request?.tableId||!Array.isArray(attempt.request?.items)||!attempt.request.items.length||!Array.isArray(attempt.lines)||!attempt.lines.length||attempt.lines.some(line=>typeof line.name!=="string"||!Number.isFinite(line.quantity)||line.quantity<=0))throw new Error();
    return {scope,attempt,error:""};
  }catch{return {scope,attempt:null,error:"Υπάρχει πρόβλημα ανάκτησης αποστολής σε αυτή την καρτέλα. Έλεγξε το τραπέζι από το POS πριν συνεχίσεις."}}
}
export function writeMobileAttempt(scope,attempt){
  try{const raw=JSON.stringify(attempt),key=storageKey(scope);window.sessionStorage.setItem(key,raw);if(window.sessionStorage.getItem(key)!==raw)throw new Error()}
  catch{throw new Error(unavailable)}
}
export function clearMobileAttempt(scope){
  try{const key=storageKey(scope);window.sessionStorage.removeItem(key);if(window.sessionStorage.getItem(key)!==null)throw new Error()}
  catch{throw new Error("Ο γύρος επιβεβαιώθηκε, αλλά δεν καθαρίστηκε η τοπική αναφορά. Επανάλαβε μόνο τον ίδιο γύρο από εδώ για έλεγχο.")}
}
