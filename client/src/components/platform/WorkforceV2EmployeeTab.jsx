import React from "react";
import {AlertTriangle,Eye,Pencil,Power} from "lucide-react";
import {formatWorkforceMoney} from "./workforce-v2-ui-utils.js";

export default function WorkforceV2EmployeeTab({manager,store}){
  const {data,form,setForm,editingId,busy,activeRoles,roleMap,resetEmployee,setField,chooseBaseStore,toggleStore,toggleRole,editEmployee,previewEmployee,changeEmployeeStatus}=manager;
  const selectedStoreIds=new Set(form.storeIds);
  return <div className="workforce-two-column">
    <section className="workforce-editor-card">
      <div className="workforce-card-title"><div><h4>{editingId?"Επεξεργασία εργαζομένου":"Νέος εργαζόμενος"}</h4><p>Η αποθήκευση γίνεται μόνο αφού εμφανιστεί και εγκριθεί η προεπισκόπηση.</p></div>{editingId&&<button className="secondary" onClick={resetEmployee}>Νέα καρτέλα</button>}</div>
      <div className="workforce-form-grid">
        <label className="span-2">Ονοματεπώνυμο<input value={form.fullName} onChange={e=>setField("fullName",e.target.value)} placeholder="π.χ. Αθηνά Μάρκου"/></label>
        <label>Τηλέφωνο<input value={form.phone} onChange={e=>setField("phone",e.target.value)}/></label>
        <label>Email<input type="email" value={form.email} onChange={e=>setField("email",e.target.value)}/></label>
        <label>Κατάστημα βάσης<select value={form.baseStoreId} onChange={e=>chooseBaseStore(e.target.value)}>{data.stores.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>Τύπος πληρωμής<select value={form.paymentType} onChange={e=>setField("paymentType",e.target.value)}><option value="HOURLY">Ανά ώρα</option><option value="FIXED_MONTHLY">Σταθερό ποσό</option></select></label>
        {form.paymentType==="HOURLY"?<label>Ωρομίσθιο<input type="number" min="0" step="0.01" value={form.hourlyRate} onChange={e=>setField("hourlyRate",e.target.value)}/></label>:<label>Μηνιαίο ποσό<input type="number" min="0" step="0.01" value={form.fixedMonthlyAmount} onChange={e=>setField("fixedMonthlyAmount",e.target.value)}/></label>}
        <label>Ισχύει από<input type="date" value={form.effectiveFrom} onChange={e=>setField("effectiveFrom",e.target.value)}/></label>
        <label>Μέγιστες μέρες<input type="number" min="1" max="7" value={form.maxDaysPerWeek} onChange={e=>setField("maxDaysPerWeek",e.target.value)}/></label>
        <label>Μέγιστες ώρες<input type="number" min="1" max="168" step="0.5" value={form.maxHoursPerWeek} onChange={e=>setField("maxHoursPerWeek",e.target.value)}/></label>
        <label>Ελάχιστα ρεπό<input type="number" min="0" max="6" value={form.minimumDaysOff} onChange={e=>setField("minimumDaysOff",e.target.value)}/></label>
      </div>
      <div className="workforce-choice-block"><b>Διαθεσιμότητα</b><div className="workforce-check-row">
        {[["worksMorning","Πρωί"],["worksAfternoon","Απόγευμα"],["worksNight","Βράδυ"],["worksWeekend","Σαββατοκύριακο"]].map(([key,label])=><label key={key}><input type="checkbox" checked={form[key]} onChange={e=>setField(key,e.target.checked)}/>{label}</label>)}
      </div></div>
      <div className="workforce-choice-block"><b>Ρόλοι / Θέσεις</b>{activeRoles.length?<><div className="workforce-check-row">{activeRoles.map(role=><label key={role.id}><input type="checkbox" checked={form.roleIds.includes(role.id)} onChange={()=>toggleRole(role.id)}/>{role.name}</label>)}</div><label className="workforce-primary-role">Κύριος ρόλος<select value={form.primaryRoleId} onChange={e=>setField("primaryRoleId",e.target.value)}><option value="">Επιλογή</option>{form.roleIds.map(roleId=><option value={roleId} key={roleId}>{roleMap.get(roleId)?.name||roleId}</option>)}</select></label></>:<div className="workforce-inline-warning"><AlertTriangle/> Δημιούργησε πρώτα τουλάχιστον έναν ρόλο.</div>}</div>
      <div className="workforce-choice-block"><label className="workforce-switch"><input type="checkbox" checked={form.canChangeStore} onChange={e=>setForm(current=>({...current,canChangeStore:e.target.checked,storeIds:e.target.checked?current.storeIds:[current.baseStoreId]}))}/>Μπορεί να εργάζεται σε πολλά καταστήματα</label><div className="workforce-store-grid">{data.stores.map(item=><label className={item.id===form.baseStoreId?"base":""} key={item.id}><input type="checkbox" checked={selectedStoreIds.has(item.id)||item.id===form.baseStoreId} disabled={item.id===form.baseStoreId||!form.canChangeStore} onChange={()=>toggleStore(item.id)}/><span>{item.name}{item.id===form.baseStoreId&&<small>Κατάστημα βάσης</small>}</span></label>)}</div></div>
      <label className="workforce-notes">Σημειώσεις<textarea rows="3" value={form.notes} onChange={e=>setField("notes",e.target.value)}/></label>
      <button onClick={previewEmployee} disabled={Boolean(busy)||!activeRoles.length}><Eye/> Προεπισκόπηση πριν την αποθήκευση</button>
    </section>

    <section className="workforce-list-card">
      <div className="workforce-card-title"><div><h4>Εργαζόμενοι Workforce v2</h4><p>Εμφανίζονται όσοι έχουν βάση ή ενεργή πρόσβαση στο «{store.name}».</p></div></div>
      <div className="workforce-employee-list">{data.employees.length?data.employees.map(employee=><article className={!employee.active?"inactive":""} key={employee.id}>
        <div className="workforce-employee-main"><div><b>{employee.fullName}</b><span>{employee.primaryRole?.name||"Χωρίς κύριο ρόλο"} · {employee.baseStoreName||"Χωρίς κατάστημα βάσης"}</span></div><em>{employee.active?"Ενεργός":"Ανενεργός"}</em></div>
        <div className="workforce-employee-meta"><span>{employee.paymentType==="HOURLY"?`Ωρομίσθιο ${formatWorkforceMoney(employee.currentHourlyRate?.hourlyRate)}`:`Σταθερό ${formatWorkforceMoney(employee.fixedMonthlyAmount)}`}</span><span>{employee.maxDaysPerWeek} μέρες · {employee.maxHoursPerWeek} ώρες</span><span>{employee.storeAccess.filter(access=>access.active).length} καταστήματα</span></div>
        <div className="workforce-row-actions"><button className="secondary" onClick={()=>editEmployee(employee)}><Pencil/> Επεξεργασία</button><button className="secondary" onClick={()=>changeEmployeeStatus(employee)} disabled={Boolean(busy)}><Power/> {employee.active?"Απενεργοποίηση":"Ενεργοποίηση"}</button></div>
      </article>):<div className="platform-empty">Δεν υπάρχουν ακόμη εργαζόμενοι στη νέα βάση.</div>}</div>
    </section>
  </div>;
}
