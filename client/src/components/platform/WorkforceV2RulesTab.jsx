import React from "react";
import {AlertTriangle,CheckCircle2,LockKeyhole,Pencil,Plus,RotateCcw,ToggleLeft,ToggleRight} from "lucide-react";
import {workforceDateInput,workforceRuleSeverityLabel} from "./workforce-v2-ui-utils.js";

function ruleValue(rule,employeeMap){
  if(rule.ruleType==="MIN_DAYS_OFF")return `${Number(rule.value?.days||0)} ρεπό / εβδομάδα`;
  if(rule.ruleType==="MAX_HOURS_PER_WEEK")return `${Number(rule.value?.hours||0)} ώρες / εβδομάδα`;
  if(rule.ruleType==="INCOMPATIBLE_EMPLOYEE")return employeeMap.get(rule.relatedEmployeeId)?.fullName||rule.relatedEmployeeName||"Δεν βρέθηκε εργαζόμενος";
  return "Σταθερός κανόνας";
}

export default function WorkforceV2RulesTab({manager}){
  const {
    data,ruleForm,ruleEditingId,busy,employeeMap,ruleDefinitionMap,setRuleField,chooseRuleType,
    editRule,resetRule,previewRule,changeRuleStatus
  }=manager;
  if(!data.capabilities?.rulesManagement)return <section className="workforce-feature-lock">
    <LockKeyhole/><div><h4>Οι κανόνες εργαζομένων απαιτούν PRO Προσωπικό</h4><p>Το BASIC παραμένει ενεργό για εργαζομένους και πρότυπα βαρδιών. Η δημιουργία και αλλαγή κανόνων ξεκλειδώνει μόνο με PRO, AI ή πρόσβαση Super Admin.</p></div>
  </section>;
  const activeEmployees=data.employees.filter(employee=>employee.active);
  const rules=data.employees.flatMap(employee=>(employee.rules||[]).map(rule=>({...rule,employeeName:employee.fullName})))
    .sort((a,b)=>Number(b.active)-Number(a.active)||a.employeeName.localeCompare(b.employeeName,"el"));
  const definition=ruleDefinitionMap.get(ruleForm.ruleType);
  return <div className="workforce-two-column">
    <section className="workforce-editor-card">
      <div className="workforce-card-title"><div><h4><AlertTriangle/> {ruleEditingId?"Αλλαγή κανόνα":"Νέος κανόνας εργαζομένου"}</h4><p>Οι κανόνες είναι δεδομένα του PRO και θα χρησιμοποιηθούν από τον έλεγχο λαθών του προγράμματος.</p></div>{ruleEditingId&&<button className="secondary" onClick={resetRule}><RotateCcw/> Νέος</button>}</div>
      <div className="workforce-form-grid">
        <label>Εργαζόμενος<select value={ruleForm.employeeId} onChange={e=>setRuleField("employeeId",e.target.value)}>{activeEmployees.map(employee=><option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select></label>
        <label>Κανόνας<select value={ruleForm.ruleType} onChange={e=>chooseRuleType(e.target.value)}>{data.ruleDefinitions.map(item=><option key={item.type} value={item.type}>{item.label}</option>)}</select></label>
        <label>Αποτέλεσμα ελέγχου<select value={ruleForm.severity} onChange={e=>setRuleField("severity",e.target.value)}>{data.ruleSeverities.map(value=><option key={value} value={value}>{workforceRuleSeverityLabel[value]||value}</option>)}</select></label>
        {definition?.valueKind==="RELATED_EMPLOYEE"&&<label>Δεν πρέπει να δουλεύει μαζί με<select value={ruleForm.relatedEmployeeId} onChange={e=>setRuleField("relatedEmployeeId",e.target.value)}><option value="">Επίλεξε εργαζόμενο</option>{activeEmployees.filter(employee=>employee.id!==ruleForm.employeeId).map(employee=><option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select></label>}
        {definition?.valueKind==="NUMBER_DAYS_OFF"&&<label>Ελάχιστα ρεπό<input type="number" min="1" max="6" step="1" value={ruleForm.numericValue} onChange={e=>setRuleField("numericValue",e.target.value)}/></label>}
        {definition?.valueKind==="NUMBER_HOURS"&&<label>Μέγιστες ώρες εβδομάδας<input type="number" min="1" max="168" step="0.25" value={ruleForm.numericValue} onChange={e=>setRuleField("numericValue",e.target.value)}/></label>}
        <label>Ισχύει από<input type="date" value={ruleForm.validFrom} onChange={e=>setRuleField("validFrom",e.target.value)}/></label>
        <label>Ισχύει έως<input type="date" value={ruleForm.validTo} onChange={e=>setRuleField("validTo",e.target.value)}/></label>
        <label className="span-2">Σημείωση<textarea rows="3" value={ruleForm.note} onChange={e=>setRuleField("note",e.target.value)} placeholder="Προαιρετική επεξήγηση του κανόνα"/></label>
      </div>
      <div className="workforce-inline-warning"><CheckCircle2/> Θα εμφανιστεί προεπισκόπηση πριν από κάθε αποθήκευση.</div>
      <div className="workforce-preview-actions"><button onClick={previewRule} disabled={Boolean(busy)||!activeEmployees.length}><Plus/> {ruleEditingId?"Προεπισκόπηση αλλαγής":"Προεπισκόπηση κανόνα"}</button></div>
    </section>
    <section className="workforce-list-card">
      <div className="workforce-card-title"><div><h4><AlertTriangle/> Κανόνες προσωπικού</h4><p>{rules.length} καταχωρίσεις · ανενεργοί κανόνες διατηρούνται για audit.</p></div></div>
      <div className="workforce-rule-list">{rules.map(rule=>{
        const ruleDefinition=ruleDefinitionMap.get(rule.ruleType);
        return <article key={rule.id} className={rule.active?"":"inactive"}>
          <div className="workforce-employee-main"><div><b>{rule.employeeName}</b><span>{ruleDefinition?.label||rule.ruleType}</span></div><em className={`severity-${String(rule.severity).toLowerCase()}`}>{workforceRuleSeverityLabel[rule.severity]||rule.severity}</em></div>
          <div className="workforce-employee-meta"><span>{ruleValue(rule,employeeMap)}</span>{rule.validFrom&&<span>Από {workforceDateInput(rule.validFrom)}</span>}{rule.validTo&&<span>Έως {workforceDateInput(rule.validTo)}</span>}{rule.note&&<span>{rule.note}</span>}</div>
          <div className="workforce-row-actions"><button className="secondary" onClick={()=>editRule(rule)}><Pencil/> Αλλαγή</button><button className="secondary" onClick={()=>changeRuleStatus(rule)}>{rule.active?<><ToggleRight/> Απενεργοποίηση</>:<><ToggleLeft/> Ενεργοποίηση</>}</button></div>
        </article>;
      })}{!rules.length&&<div className="workforce-empty-state">Δεν υπάρχουν ακόμη κανόνες. Δημιούργησε τον πρώτο κανόνα για έναν εργαζόμενο.</div>}</div>
    </section>
  </div>;
}
