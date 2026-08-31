import React from "react";
import {Eye,Save} from "lucide-react";
import {formatWorkforceMoney} from "./workforce-v2-ui-utils.js";

export default function WorkforceV2ActionPreview({manager}){
  const {pending,setPending,roleEditingId,storeMap,roleMap,busy,confirmEmployee,confirmRole}=manager;
  if(pending?.type==="employee")return <div className="workforce-action-preview">
    <div className="workforce-card-title"><div><h4><Eye/> Προεπισκόπηση καρτέλας εργαζομένου</h4><p>Έλεγξε τα στοιχεία πριν δημιουργηθεί ή αλλάξει εγγραφή στη νέα βάση.</p></div></div>
    <dl><div><dt>Εργαζόμενος</dt><dd>{pending.payload.fullName}</dd></div><div><dt>Κατάστημα βάσης</dt><dd>{storeMap.get(pending.payload.baseStoreId)?.name}</dd></div><div><dt>Ρόλοι</dt><dd>{pending.payload.roleIds.map(id=>roleMap.get(id)?.name||id).join(", ")}</dd></div><div><dt>Καταστήματα</dt><dd>{pending.payload.storeAccess.map(access=>storeMap.get(access.storeId)?.name||access.storeId).join(", ")}</dd></div><div><dt>Πληρωμή</dt><dd>{pending.payload.paymentType==="HOURLY"?`${formatWorkforceMoney(pending.payload.hourlyRate)} / ώρα`:formatWorkforceMoney(pending.payload.fixedMonthlyAmount)}</dd></div></dl>
    <label>Λόγος καταχώρισης / αλλαγής<input value={pending.reason} onChange={e=>setPending(current=>({...current,reason:e.target.value}))}/></label>
    <div className="workforce-preview-actions"><button className="secondary" onClick={()=>setPending(null)}>Επιστροφή</button><button onClick={confirmEmployee} disabled={Boolean(busy)||pending.reason.trim().length<3}><Save/> Επιβεβαίωση αποθήκευσης</button></div>
  </div>;
  if(pending?.type==="role")return <div className="workforce-action-preview compact">
    <div className="workforce-card-title"><div><h4><Eye/> Προεπισκόπηση {roleEditingId?"αλλαγής":"νέου ρόλου"}</h4><p>{pending.payload.name} · {pending.payload.code||"Αυτόματος κωδικός"}</p></div></div>
    <label>Λόγος {roleEditingId?"αλλαγής":"δημιουργίας"}<input value={pending.reason} onChange={e=>setPending(current=>({...current,reason:e.target.value}))}/></label>
    <div className="workforce-preview-actions"><button className="secondary" onClick={()=>setPending(null)}>Επιστροφή</button><button onClick={confirmRole} disabled={Boolean(busy)||pending.reason.trim().length<3}><Save/> Επιβεβαίωση {roleEditingId?"αλλαγής":"δημιουργίας"}</button></div>
  </div>;
  return null;
}
