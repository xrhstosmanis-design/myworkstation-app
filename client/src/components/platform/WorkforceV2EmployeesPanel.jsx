import React,{useEffect,useRef,useState} from "react";
import {AlertTriangle,Banknote,Briefcase,Building2,Clock3,Eye,RefreshCw,ShieldCheck,Users} from "lucide-react";
import WorkforceV2ActionPreview from "./WorkforceV2ActionPreview.jsx";
import WorkforceV2EmployeeTab from "./WorkforceV2EmployeeTab.jsx";
import WorkforceV2MigrationTab from "./WorkforceV2MigrationTab.jsx";
import WorkforceV2RoleTab from "./WorkforceV2RoleTab.jsx";
import WorkforceV2RulesTab from "./WorkforceV2RulesTab.jsx";
import WorkforceV2ShiftTemplatesTab from "./WorkforceV2ShiftTemplatesTab.jsx";
import WorkforceV2ScheduleTab from "./WorkforceV2ScheduleTab.jsx";
import WorkforceV2AttendanceTab from "./WorkforceV2AttendanceTab.jsx";
import WorkforceV2PayrollTab from "./WorkforceV2PayrollTab.jsx";
import useWorkforceV2Manager from "./useWorkforceV2Manager.js";
import "./workforce-v2-employees.css";
import "./workforce-v2-rules-shifts.css";
import "./workforce-v2-payroll.css";

export default function WorkforceV2EmployeesPanel({company,store,request,readOnly=false,canEditDetails=false}){
  return readOnly?<WorkforceV2EmployeeReadView company={company} store={store} request={request} canEditDetails={canEditDetails}/>:<EditableWorkforceV2EmployeesPanel company={company} store={store} request={request}/>;
}

function WorkforceV2EmployeeReadView({company,store,request,canEditDetails}){
  const [data,setData]=useState(null),[selectedEmployee,setSelectedEmployee]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const sequence=useRef(0),currentScope=useRef("");
  const scope=JSON.stringify([company?.id,store?.id]);currentScope.current=scope;
  const [loadedScope,setLoadedScope]=useState("");
  const base=`/api/platform/store-modules/companies/${encodeURIComponent(company?.id||"")}/stores/${encodeURIComponent(store?.id||"")}/workforce-v2/employees`;
  const load=async()=>{
    const current=++sequence.current,own=scope;
    setData(null);setSelectedEmployee(null);setLoadedScope("");setError("");
    if(!company?.id||!store?.id){setBusy(false);return;}
    setBusy(true);
    try{
      const result=await request(base);
      if(current!==sequence.current||own!==currentScope.current)return;
      if(result?.companyId!==company.id||result.storeId!==store.id||!Array.isArray(result.items)||result.items.some(employee=>employee.companyId!==company.id))throw Error("Μη έγκυρη απάντηση προσωπικού.");
      setData({company,employees:result.items});setLoadedScope(own);
    }catch(e){if(current===sequence.current&&own===currentScope.current)setError(e.message)}
    finally{if(current===sequence.current&&own===currentScope.current)setBusy(false)}
  };
  useEffect(()=>{load();return()=>{sequence.current++}},[company?.id,store?.id,request]);
  const openEmployee=async employee=>{
    const current=++sequence.current,own=scope;
    setSelectedEmployee(null);setError("");setBusy(true);
    try{
      const result=await request(`${base}/${encodeURIComponent(employee.id)}`);
      if(current!==sequence.current||own!==currentScope.current)return;
      if(result?.companyId!==company.id||result.storeId!==store.id||result.item?.id!==employee.id||result.item.companyId!==company.id)throw Error("Δεν επιβεβαιώθηκε η καρτέλα εργαζομένου.");
      setSelectedEmployee(result.item);
    }catch(e){if(current===sequence.current&&own===currentScope.current){setData(null);setLoadedScope("");setError(e.message)}}
    finally{if(current===sequence.current&&own===currentScope.current)setBusy(false)}
  };
  const saveDetails=async fields=>{
    if(!canEditDetails||busy||!selectedEmployee?.active||selectedEmployee.baseStoreId!==store.id||loadedScope!==scope)return;
    const current=++sequence.current,own=scope,employee=selectedEmployee;
    setBusy(true);setError("");
    try{
      const result=await request(`${base}/${encodeURIComponent(employee.id)}/details`,{
        method:"PATCH",body:JSON.stringify({...fields,expectedUpdatedAt:employee.updatedAt,confirmed:true})
      });
      if(current!==sequence.current||own!==currentScope.current)return;
      if(result?.companyId!==company.id||result.storeId!==store.id||result.item?.id!==employee.id||
        result.item.companyId!==company.id||result.item.baseStoreId!==store.id)throw Error("Δεν επιβεβαιώθηκε η αποθήκευση.");
      setSelectedEmployee(result.item);
      setData(previous=>previous?{...previous,employees:previous.employees.map(row=>row.id===employee.id?result.item:row)}:previous);
    }catch(e){if(current===sequence.current&&own===currentScope.current)setError(e.message)}
    finally{if(current===sequence.current&&own===currentScope.current)setBusy(false)}
  };
  const visible=loadedScope===scope?data:null;
  return <section className="workforce-manager workforce-personnel-read" aria-label="Προσωπικό καταστήματος">
    <div className="workforce-manager-head"><h3>Προσωπικό · {store?.name}</h3><button type="button" className="secondary" disabled={busy} onClick={load}><RefreshCw/> Ανανέωση προσωπικού</button></div>
    {error&&<div className="platform-alert error" role="alert">{error}</div>}
    {busy&&<p role="status">Φόρτωση προσωπικού…</p>}
    {visible&&<WorkforceV2EmployeeTab manager={{data:visible,busy}} store={store} readOnly selectedEmployee={selectedEmployee} onSelectEmployee={openEmployee}/>}
    {visible&&canEditDetails&&selectedEmployee?.active&&selectedEmployee.baseStoreId===store.id&&
      <StaffEmployeeDetailsForm key={JSON.stringify([selectedEmployee.id,selectedEmployee.updatedAt])}
        employee={selectedEmployee} busy={busy} onSave={saveDetails}/>}
  </section>;
}

const availabilityFields=[
  ["worksMorning","Πρωί"],["worksAfternoon","Απόγευμα"],["worksNight","Βράδυ"],["worksWeekend","Σαββατοκύριακο"]
];
function StaffEmployeeDetailsForm({employee,busy,onSave}){
  return <form onSubmit={event=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    onSave({phone:form.get("phone"),email:form.get("email"),reason:form.get("reason"),
      ...Object.fromEntries(availabilityFields.map(([key])=>[key,form.has(key)]))});
  }}>
    <fieldset disabled={busy}>
      <legend>Επικοινωνία και διαθεσιμότητα · {employee.fullName}</legend>
      <label>Τηλέφωνο<input type="tel" name="phone" maxLength={60} defaultValue={employee.phone||""}/></label>
      <label>Email<input type="email" name="email" maxLength={180} defaultValue={employee.email||""}/></label>
      {availabilityFields.map(([key,label])=><label key={key}>
        <input type="checkbox" name={key} defaultChecked={employee[key]===true}/>{label}
      </label>)}
      <label>Αιτιολογία<input name="reason" required minLength={3} maxLength={500}/></label>
      <button type="submit">Αποθήκευση στοιχείων εργαζομένου</button>
    </fieldset>
  </form>;
}

function EditableWorkforceV2EmployeesPanel({company,store,request}){
  const manager=useWorkforceV2Manager({company,store,request});
  const {tab,setTab,data,busy,error,message,load}=manager;
  if(!data)return <div className="workforce-loading"><RefreshCw/> {busy?"Φόρτωση Workforce v2…":"Δεν φορτώθηκαν τα δεδομένα."}{error&&<span>{error}</span>}{!busy&&<button className="secondary" onClick={load}>Επανάληψη</button>}</div>;
  const ruleCount=data.employees.reduce((total,employee)=>total+(employee.rules?.filter(rule=>rule.active).length||0),0);
  return <div className="workforce-manager">
    <div className="workforce-manager-head">
      <div><span>WORKFORCE V2 · ΛΕΙΤΟΥΡΓΙΚΟ CHECKPOINT</span><h3>Εργαζόμενοι, ρόλοι, κανόνες & βάρδιες</h3><p>Όλες οι αλλαγές και οι επιβεβαιωμένες μεταφορές καταγράφονται στο Workforce audit.</p></div>
      <button className="secondary" onClick={load} disabled={Boolean(busy)}><RefreshCw/> Ανανέωση</button>
    </div>
    <div className="workforce-summary-row">
      <div><Users/><b>{data.employees.length}</b><span>εργαζόμενοι στο κατάστημα</span></div>
      <div><Briefcase/><b>{data.roles.length}</b><span>ρόλοι ιδιοκτήτη</span></div>
      <div><AlertTriangle/><b>{ruleCount}</b><span>κανόνες προσωπικού</span></div>
      <div><Clock3/><b>{data.shiftTemplates.length}</b><span>πρότυπα βαρδιών</span></div>
      <div><Building2/><b>{data.stores.length}</b><span>διαθέσιμα καταστήματα</span></div>
      <div><ShieldCheck/><b>Με έγκριση</b><span>ελεγχόμενη μεταφορά παλιών δεδομένων</span></div>
    </div>
    <nav className="workforce-tabs">
      <button className={tab==="employees"?"active":""} onClick={()=>setTab("employees")}><Users/> Εργαζόμενοι</button>
      <button className={tab==="roles"?"active":""} onClick={()=>setTab("roles")}><Briefcase/> Ρόλοι</button>
      <button className={tab==="rules"?"active":""} onClick={()=>setTab("rules")}><AlertTriangle/> Κανόνες {data.capabilities?.rulesManagement?"":"🔒"}</button>
      <button className={tab==="shifts"?"active":""} onClick={()=>setTab("shifts")}><Clock3/> Πρότυπα βαρδιών</button>
      <button className={tab==="schedule"?"active":""} onClick={()=>setTab("schedule")}><Clock3/> Πρόγραμμα & Άδειες</button>
      <button className={tab==="attendance"?"active":""} onClick={()=>setTab("attendance")}><Clock3/> Παρουσίες</button>
      <button className={tab==="payroll"?"active":""} onClick={()=>setTab("payroll")}><Banknote/> Μισθοδοσία</button>
      <button className={tab==="migration"?"active":""} onClick={()=>setTab("migration")}><Eye/> Προεπισκόπηση μεταφοράς</button>
    </nav>
    {error&&<div className="platform-alert error">{error}</div>}
    {message&&<div className="platform-alert success">{message}</div>}
    {tab==="employees"&&<WorkforceV2EmployeeTab manager={manager} store={store}/>} 
    {tab==="roles"&&<WorkforceV2RoleTab manager={manager}/>} 
    {tab==="rules"&&<WorkforceV2RulesTab manager={manager}/>} 
    {tab==="shifts"&&<WorkforceV2ShiftTemplatesTab manager={manager}/>} 
    {tab==="schedule"&&<WorkforceV2ScheduleTab company={company} store={store} request={request} data={data}/>}
    {tab==="attendance"&&<WorkforceV2AttendanceTab company={company} store={store} request={request}/>}
    {tab==="payroll"&&<WorkforceV2PayrollTab company={company} store={store} request={request}/>}
    {tab==="migration"&&<WorkforceV2MigrationTab manager={manager} store={store}/>} 
    <WorkforceV2ActionPreview manager={manager}/>
  </div>;
}
