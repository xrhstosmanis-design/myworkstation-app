import React from "react";
import {AlertTriangle,Briefcase,Building2,Clock3,Eye,RefreshCw,ShieldCheck,Users} from "lucide-react";
import WorkforceV2ActionPreview from "./WorkforceV2ActionPreview.jsx";
import WorkforceV2EmployeeTab from "./WorkforceV2EmployeeTab.jsx";
import WorkforceV2MigrationTab from "./WorkforceV2MigrationTab.jsx";
import WorkforceV2RoleTab from "./WorkforceV2RoleTab.jsx";
import WorkforceV2RulesTab from "./WorkforceV2RulesTab.jsx";
import WorkforceV2ShiftTemplatesTab from "./WorkforceV2ShiftTemplatesTab.jsx";
import WorkforceV2ScheduleTab from "./WorkforceV2ScheduleTab.jsx";
import WorkforceV2AttendanceTab from "./WorkforceV2AttendanceTab.jsx";
import useWorkforceV2Manager from "./useWorkforceV2Manager.js";
import "./workforce-v2-employees.css";
import "./workforce-v2-rules-shifts.css";

export default function WorkforceV2EmployeesPanel({company,store,request}){
  const manager=useWorkforceV2Manager({company,store,request});
  const {tab,setTab,data,busy,error,message,load}=manager;
  if(!data)return <div className="workforce-loading"><RefreshCw/> {busy?"Φόρτωση Workforce v2…":"Δεν φορτώθηκαν τα δεδομένα."}{error&&<span>{error}</span>}{!busy&&<button className="secondary" onClick={load}>Επανάληψη</button>}</div>;
  const ruleCount=data.employees.reduce((total,employee)=>total+(employee.rules?.filter(rule=>rule.active).length||0),0);
  return <div className="workforce-manager">
    <div className="workforce-manager-head">
      <div><span>WORKFORCE V2 · ΛΕΙΤΟΥΡΓΙΚΟ CHECKPOINT</span><h3>Εργαζόμενοι, ρόλοι, κανόνες & βάρδιες</h3><p>Όλες οι αλλαγές καταγράφονται στο Workforce audit. Η μεταφορά του παλιού module παραμένει μόνο σε προεπισκόπηση.</p></div>
      <button className="secondary" onClick={load} disabled={Boolean(busy)}><RefreshCw/> Ανανέωση</button>
    </div>
    <div className="workforce-summary-row">
      <div><Users/><b>{data.employees.length}</b><span>εργαζόμενοι στο κατάστημα</span></div>
      <div><Briefcase/><b>{data.roles.length}</b><span>ρόλοι ιδιοκτήτη</span></div>
      <div><AlertTriangle/><b>{ruleCount}</b><span>κανόνες προσωπικού</span></div>
      <div><Clock3/><b>{data.shiftTemplates.length}</b><span>πρότυπα βαρδιών</span></div>
      <div><Building2/><b>{data.stores.length}</b><span>διαθέσιμα καταστήματα</span></div>
      <div><ShieldCheck/><b>Μόνο preview</b><span>μεταφορά παλιών δεδομένων</span></div>
    </div>
    <nav className="workforce-tabs">
      <button className={tab==="employees"?"active":""} onClick={()=>setTab("employees")}><Users/> Εργαζόμενοι</button>
      <button className={tab==="roles"?"active":""} onClick={()=>setTab("roles")}><Briefcase/> Ρόλοι</button>
      <button className={tab==="rules"?"active":""} onClick={()=>setTab("rules")}><AlertTriangle/> Κανόνες {data.capabilities?.rulesManagement?"":"🔒"}</button>
      <button className={tab==="shifts"?"active":""} onClick={()=>setTab("shifts")}><Clock3/> Πρότυπα βαρδιών</button>
      <button className={tab==="schedule"?"active":""} onClick={()=>setTab("schedule")}><Clock3/> Πρόγραμμα & Άδειες</button>
      <button className={tab==="attendance"?"active":""} onClick={()=>setTab("attendance")}><Clock3/> Παρουσίες</button>
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
    {tab==="migration"&&<WorkforceV2MigrationTab manager={manager} store={store}/>} 
    <WorkforceV2ActionPreview manager={manager}/>
  </div>;
}
