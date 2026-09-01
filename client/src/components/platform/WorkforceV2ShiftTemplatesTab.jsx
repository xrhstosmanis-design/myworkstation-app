import React from "react";
import {Clock3,Pencil,Plus,RotateCcw,ShieldCheck,ToggleLeft,ToggleRight,Users} from "lucide-react";

export default function WorkforceV2ShiftTemplatesTab({manager}){
  const {
    data,shiftForm,shiftEditingId,busy,roleMap,shiftCategoryMap,setShiftField,chooseShiftCategory,
    editShiftTemplate,resetShiftTemplate,previewShiftTemplate,changeShiftTemplateStatus
  }=manager;
  const activeRoles=data.roles.filter(role=>role.active);
  return <div className="workforce-two-column">
    <section className="workforce-editor-card">
      <div className="workforce-card-title"><div><h4><Clock3/> {shiftEditingId?"Αλλαγή προτύπου βάρδιας":"Νέο πρότυπο βάρδιας"}</h4><p>Τα πρότυπα ανήκουν στο επιλεγμένο κατάστημα και αποτελούν τη βάση για το χειροκίνητο εβδομαδιαίο και μηνιαίο πρόγραμμα.</p></div>{shiftEditingId&&<button className="secondary" onClick={resetShiftTemplate}><RotateCcw/> Νέο</button>}</div>
      <div className="workforce-form-grid">
        <label>Κατηγορία<select value={shiftForm.category} onChange={e=>chooseShiftCategory(e.target.value)}>{data.shiftCategories.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        <label>Ονομασία<input value={shiftForm.name} onChange={e=>setShiftField("name",e.target.value)} placeholder="π.χ. Πρωί"/></label>
        <label>Κωδικός<input value={shiftForm.code} onChange={e=>setShiftField("code",e.target.value)} placeholder="Αυτόματος αν μείνει κενό"/></label>
        <label>Κύριος απαιτούμενος ρόλος<select value={shiftForm.requiredRoleId} onChange={e=>setShiftField("requiredRoleId",e.target.value)}><option value="">Χωρίς συγκεκριμένο ρόλο</option>{activeRoles.map(role=><option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
        <label>Ώρα έναρξης<input type="time" value={shiftForm.startTime} onChange={e=>setShiftField("startTime",e.target.value)}/></label>
        <label>Ώρα λήξης<input type="time" value={shiftForm.endTime} onChange={e=>setShiftField("endTime",e.target.value)}/></label>
        <label>Ελάχιστα άτομα<input type="number" min="1" max="100" step="1" value={shiftForm.minimumPeople} onChange={e=>setShiftField("minimumPeople",e.target.value)}/></label>
        <label>Μέγιστα άτομα<input type="number" min="1" max="100" step="1" value={shiftForm.maximumPeople} onChange={e=>setShiftField("maximumPeople",e.target.value)} placeholder="Χωρίς όριο"/></label>
      </div>
      <div className="workforce-choice-block"><div className="workforce-check-row"><label><input type="checkbox" checked={shiftForm.requiresSupervisor} onChange={e=>setShiftField("requiresSupervisor",e.target.checked)}/> Χρειάζεται υπεύθυνος</label><label><input type="checkbox" checked={shiftForm.changeAllowed} onChange={e=>setShiftField("changeAllowed",e.target.checked)}/> Επιτρέπεται αλλαγή</label></div></div>
      <div className="workforce-inline-warning"><ShieldCheck/> Η βάρδια δεν αποθηκεύεται πριν από προεπισκόπηση και επιβεβαίωση.</div>
      <div className="workforce-preview-actions"><button onClick={previewShiftTemplate} disabled={Boolean(busy)}><Plus/> {shiftEditingId?"Προεπισκόπηση αλλαγής":"Προεπισκόπηση βάρδιας"}</button></div>
    </section>
    <section className="workforce-list-card">
      <div className="workforce-card-title"><div><h4><Clock3/> Πρότυπα βαρδιών</h4><p>{data.shiftTemplates.length} πρότυπα για {data.contextStore?.name}. Δεν επηρεάζουν το παλιό πρόγραμμα.</p></div></div>
      <div className="workforce-template-list">{data.shiftTemplates.map(template=>{
        const category=shiftCategoryMap.get(template.category);
        return <article key={template.id} className={template.active?"":"inactive"}>
          <div className="workforce-employee-main"><div><b>{template.name}</b><span>{category?.label||template.category} · {template.startTime}–{template.endTime}</span></div><em>{template.active?"Ενεργή":"Ανενεργή"}</em></div>
          <div className="workforce-employee-meta"><span><Users/> {template.minimumPeople}{template.maximumPeople?`–${template.maximumPeople}`:"+"} άτομα</span><span>{template.requiredRole?.name||roleMap.get(template.requiredRoleId)?.name||"Χωρίς συγκεκριμένο ρόλο"}</span>{template.requiresSupervisor&&<span>Χρειάζεται υπεύθυνος</span>}{!template.changeAllowed&&<span>Δεν επιτρέπεται αλλαγή</span>}{template.assignmentCount>0&&<span>{template.assignmentCount} αναθέσεις</span>}</div>
          <div className="workforce-row-actions"><button className="secondary" onClick={()=>editShiftTemplate(template)}><Pencil/> Αλλαγή</button><button className="secondary" onClick={()=>changeShiftTemplateStatus(template)}>{template.active?<><ToggleRight/> Απενεργοποίηση</>:<><ToggleLeft/> Ενεργοποίηση</>}</button></div>
        </article>;
      })}{!data.shiftTemplates.length&&<div className="workforce-empty-state">Δεν υπάρχουν πρότυπα βαρδιών. Δημιούργησε Πρωί, Απόγευμα, Βράδυ ή ειδική βάρδια.</div>}</div>
    </section>
  </div>;
}
