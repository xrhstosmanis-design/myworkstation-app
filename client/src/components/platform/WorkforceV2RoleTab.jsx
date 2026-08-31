import React from "react";
import {Eye,Pencil,Power} from "lucide-react";

export default function WorkforceV2RoleTab({manager}){
  const {data,roleForm,setRoleForm,roleEditingId,busy,resetRole,previewRole,editRole,changeRoleStatus}=manager;
  return <div className="workforce-two-column roles-layout">
    <section className="workforce-editor-card">
      <div className="workforce-card-title"><div><h4>{roleEditingId?"Επεξεργασία ρόλου / θέσης":"Νέος ρόλος / θέση"}</h4><p>Οι ρόλοι είναι κοινοί για όλα τα καταστήματα του ίδιου ιδιοκτήτη.</p></div>{roleEditingId&&<button className="secondary" onClick={resetRole}>Νέος ρόλος</button>}</div>
      <div className="workforce-form-grid">
        <label>Όνομα ρόλου<input value={roleForm.name} onChange={e=>setRoleForm(current=>({...current,name:e.target.value}))} placeholder="π.χ. Ταμίας"/></label>
        <label>Κωδικός<input value={roleForm.code} onChange={e=>setRoleForm(current=>({...current,code:e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,"_")}))} placeholder="CASHIER"/></label>
        <label className="span-2">Περιγραφή<textarea rows="3" value={roleForm.description} onChange={e=>setRoleForm(current=>({...current,description:e.target.value}))}/></label>
      </div>
      <button onClick={previewRole} disabled={Boolean(busy)}><Eye/> Προεπισκόπηση {roleEditingId?"αλλαγών":"ρόλου"}</button>
    </section>
    <section className="workforce-list-card">
      <div className="workforce-card-title"><div><h4>Ρόλοι ιδιοκτήτη</h4><p>Ρόλος που χρησιμοποιείται δεν απενεργοποιείται χωρίς πρώτα να αποδεσμευτεί.</p></div></div>
      <div className="workforce-role-list">{data.roles.map(role=><article className={!role.active?"inactive":""} key={role.id}><div><b>{role.name}</b><code>{role.code}</code><span>{role.description||"Χωρίς περιγραφή"}</span></div><small>{role.employeeCount} εργαζόμενοι · {role.shiftTemplateCount} πρότυπα</small><div className="workforce-row-actions"><button className="secondary" onClick={()=>editRole(role)}><Pencil/> Επεξεργασία</button><button className="secondary" onClick={()=>changeRoleStatus(role)} disabled={Boolean(busy)}><Power/> {role.active?"Απενεργοποίηση":"Ενεργοποίηση"}</button></div></article>)}</div>
    </section>
  </div>;
}
