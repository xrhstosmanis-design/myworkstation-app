import fs from "fs";

const path=new URL("../src/components/store/StoreOperatorApp.jsx",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="KAT_SAFE_DECREASE_REASON_CLIENT_V1";
if(src.includes(marker)){
  console.log("Safe decrease client reason patch already installed.");
  process.exit(0);
}

const old='const openShift=async event=>{event.preventDefault();if(!runtimeAccess?.initialCash)return setError("Δεν έχεις δικαίωμα «με αρχικό Ταμείο» από το BackOffice.");setBusy(true);setError("");try{await api(`/api/cash/stores/${session.store.id}/sessions/open`,{method:"POST",body:JSON.stringify({shiftLabel:shiftForm.shiftLabel,drawer:n(shiftForm.drawer),custody:n(shiftForm.custody),coins:n(shiftForm.coins),safe:n(shiftForm.safe),note:shiftForm.note})});await checkShift();changed()}catch(err){setError(err.message)}finally{setBusy(false)}};';
const next='const openShift=async event=>{event.preventDefault();if(!runtimeAccess?.initialCash)return setError("Δεν έχεις δικαίωμα «με αρχικό Ταμείο» από το BackOffice.");/* '+marker+' */const expectedSafe=n(shiftState?.suggestedOpening?.safe),newSafe=n(shiftForm.safe),safeReason=String(shiftForm.note||"").trim();if(newSafe<expectedSafe-0.009&&!safeReason)return setError(`Το Χρηματοκιβώτιο μειώθηκε από ${money(expectedSafe)} σε ${money(newSafe)}. Γράψε υποχρεωτικά αιτιολογία στις Παρατηρήσεις.`);setBusy(true);setError("");try{await api(`/api/cash/stores/${session.store.id}/sessions/open`,{method:"POST",body:JSON.stringify({shiftLabel:shiftForm.shiftLabel,drawer:n(shiftForm.drawer),custody:n(shiftForm.custody),coins:n(shiftForm.coins),safe:newSafe,note:shiftForm.note,safeReason})});await checkShift();changed()}catch(err){setError(err.message)}finally{setBusy(false)}};';
if(!src.includes(old)){
  console.error("Safe decrease client patch anchor not found; refusing unsafe partial patch.");
  process.exit(1);
}
src=src.replace(old,next);
fs.writeFileSync(path,src);
console.log("Safe decrease reason enforcement installed in POS opening flow.");
