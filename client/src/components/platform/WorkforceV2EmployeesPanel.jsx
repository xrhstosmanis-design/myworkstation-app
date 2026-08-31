import React from "react";
import {Briefcase,Building2,Eye,RefreshCw,ShieldCheck,Users} from "lucide-react";
import WorkforceV2ActionPreview from "./WorkforceV2ActionPreview.jsx";
import WorkforceV2EmployeeTab from "./WorkforceV2EmployeeTab.jsx";
import WorkforceV2MigrationTab from "./WorkforceV2MigrationTab.jsx";
import WorkforceV2RoleTab from "./WorkforceV2RoleTab.jsx";
import useWorkforceV2Manager from "./useWorkforceV2Manager.js";
import "./workforce-v2-employees.css";

export default function WorkforceV2EmployeesPanel({company,store,request}){
  const manager=useWorkforceV2Manager({company,store,request});
  const {tab,setTab,data,busy,error,message,load}=manager;
  if(!data)return <div className="workforce-loading"><RefreshCw/> {busy?"Φόρτωση Workforce v2…":"Δεν φορτώθηκαν τα δεδομένα."}{error&&<span>{error}</span>}{!busy&&<button className="secondary" onClick={load}>Επανάληψη</button>}</div>;
  return <div className="workforce-manager">
    <div className="workforce-manager-head">
      <div><span>WORKFORCE V2 · ΛΕΙΤΟΥΡΓΙΚΟ CHECKPOINT</span><h3>Εργαζόμενοι, ρόλοι & πολλά καταστήματα</h3><p>Όλες οι αλλαγές καταγράφονται στο Workforce audit. Η μεταφορά του παλιού module παραμένει μόνο σε προεπισκόπηση.</p></div>
      <button className="secondary" onClick={load} disabled={Boolean(busy)}><RefreshCw/> Ανανέωση</button>
    </div>
    <div className="workforce-summary-row">
      <div><Users/><b>{data.employees.length}</b><span>εργαζόμενοι στο κατάστημα</span></div>
      <div><Briefcase/><b>{data.roles.length}</b><span>ρόλοι ιδιοκτήτη</span></div>
      <div><Building2/><b>{data.stores.length}</b><span>διαθέσιμα καταστήματα</span></div>
      <div><ShieldCheck/><b>Μόνο preview</b><span>μεταφορά παλιών δεδομένων</span></div>
    </div>
    <nav className="workforce-tabs">
      <button className={tab==="employees"?"active":""} onClick={()=>setTab("employees")}><Users/> Εργαζόμενοι</button>
      <button className={tab==="roles"?"active":""} onClick={()=>setTab("roles")}><Briefcase/> Ρόλοι</button>
      <button className={tab==="migration"?"active":""} onClick={()=>setTab("migration")}><Eye/> Προεπισκόπηση μεταφοράς</button>
    </nav>
    {error&&<div className="platform-alert error">{error}</div>}
    {message&&<div className="platform-alert success">{message}</div>}
    {tab==="employees"&&<WorkforceV2EmployeeTab manager={manager} store={store}/>} 
    {tab==="roles"&&<WorkforceV2RoleTab manager={manager}/>} 
    {tab==="migration"&&<WorkforceV2MigrationTab manager={manager} store={store}/>} 
    <WorkforceV2ActionPreview manager={manager}/>
  </div>;
}
