import React from "react";
import {Eye,Save} from "lucide-react";
import {formatWorkforceMoney,workforceRuleSeverityLabel} from "./workforce-v2-ui-utils.js";

function ruleValue(payload,definition,employeeMap){
  if(definition?.valueKind==="NUMBER_DAYS_OFF")return `${Number(payload.value?.days||0)} ρεπό / εβδομάδα`;
  if(definition?.valueKind==="NUMBER_HOURS")return `${Number(payload.value?.hours||0)} ώρες / εβδομάδα`;
  if(definition?.valueKind==="RELATED_EMPLOYEE")return employeeMap.get(payload.relatedEmployeeId)?.fullName||"Δεν επιλέχθηκε";
  return "Σταθερός κανόνας";
}

export default function WorkforceV2ActionPreview({manager}){
  const {
    pending,setPending,roleEditingId,ruleEditingId,shiftEditingId,storeMap,roleMap,employeeMap,ruleDefinitionMap,shiftCategoryMap,
    busy,confirmEmployee,confirmRole,confirmRule,confirmShiftTemplate
  }=manager;
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
  if(pending?.type==="rule"){
    const definition=ruleDefinitionMap.get(pending.payload.ruleType);
    return <div className="workforce-action-preview">
      <div className="workforce-card-title"><div><h4><Eye/> Προεπισκόπηση {ruleEditingId?"αλλαγής":"νέου κανόνα"}</h4><p>Ο κανόνας θα αποθηκευτεί μόνο μετά την επιβεβαίωσή σου και θα καταγραφεί στο audit.</p></div></div>
      <dl><div><dt>Εργαζόμενος</dt><dd>{employeeMap.get(pending.payload.employeeId)?.fullName||"—"}</dd></div><div><dt>Κανόνας</dt><dd>{definition?.label||pending.payload.ruleType}</dd></div><div><dt>Αποτέλεσμα</dt><dd>{workforceRuleSeverityLabel[pending.payload.severity]||pending.payload.severity}</dd></div><div><dt>Τιμή</dt><dd>{ruleValue(pending.payload,definition,employeeMap)}</dd></div><div><dt>Ισχύς</dt><dd>{pending.payload.validFrom?new Date(pending.payload.validFrom).toLocaleDateString("el-GR"):"Από τώρα"} – {pending.payload.validTo?new Date(pending.payload.validTo).toLocaleDateString("el-GR"):"Χωρίς λήξη"}</dd></div></dl>
      <label>Λόγος {ruleEditingId?"αλλαγής":"δημιουργίας"}<input value={pending.reason} onChange={e=>setPending(current=>({...current,reason:e.target.value}))}/></label>
      <div className="workforce-preview-actions"><button className="secondary" onClick={()=>setPending(null)}>Επιστροφή</button><button onClick={confirmRule} disabled={Boolean(busy)||pending.reason.trim().length<3}><Save/> Επιβεβαίωση κανόνα</button></div>
    </div>;
  }
  if(pending?.type==="shiftTemplate"){
    const category=shiftCategoryMap.get(pending.payload.category);
    return <div className="workforce-action-preview">
      <div className="workforce-card-title"><div><h4><Eye/> Προεπισκόπηση {shiftEditingId?"αλλαγής":"νέου προτύπου βάρδιας"}</h4><p>Το πρότυπο αφορά μόνο το επιλεγμένο κατάστημα και δεν αλλάζει το παλιό πρόγραμμα.</p></div></div>
      <dl><div><dt>Ονομασία</dt><dd>{pending.payload.name}</dd></div><div><dt>Κατηγορία</dt><dd>{category?.label||pending.payload.category}</dd></div><div><dt>Ώρες</dt><dd>{pending.payload.startTime}–{pending.payload.endTime}</dd></div><div><dt>Στελέχωση</dt><dd>{pending.payload.minimumPeople}{pending.payload.maximumPeople?`–${pending.payload.maximumPeople}`:"+"} άτομα</dd></div><div><dt>Απαιτούμενος ρόλος</dt><dd>{roleMap.get(pending.payload.requiredRoleId)?.name||"Χωρίς συγκεκριμένο ρόλο"}</dd></div></dl>
      <div className="workforce-employee-meta"><span>{pending.payload.requiresSupervisor?"Χρειάζεται υπεύθυνος":"Δεν απαιτείται υπεύθυνος"}</span><span>{pending.payload.changeAllowed?"Επιτρέπεται αλλαγή":"Δεν επιτρέπεται αλλαγή"}</span></div>
      <label>Λόγος {shiftEditingId?"αλλαγής":"δημιουργίας"}<input value={pending.reason} onChange={e=>setPending(current=>({...current,reason:e.target.value}))}/></label>
      <div className="workforce-preview-actions"><button className="secondary" onClick={()=>setPending(null)}>Επιστροφή</button><button onClick={confirmShiftTemplate} disabled={Boolean(busy)||pending.reason.trim().length<3}><Save/> Επιβεβαίωση βάρδιας</button></div>
    </div>;
  }
  return null;
}
