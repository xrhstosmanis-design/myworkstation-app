import React,{useEffect,useMemo,useState} from "react";
import {History,RefreshCw,Search,X} from "lucide-react";
import {matchesGreekSearch} from "../../utils/greek-search.js";

const labels={
  AUDIT_ENABLED:"Ενεργοποίηση ιστορικού",
  CUSTOMER_CREATED:"Δημιουργία πελάτη",
  OWNER_UPDATED:"Αλλαγή ιδιοκτήτη",
  SUBSCRIPTION_MODULES_UPDATED:"Αλλαγή συνδρομής / modules",
  CUSTOMER_STATUS_UPDATED:"Αλλαγή κατάστασης πελάτη",
  OWNER_PASSWORD_RESET:"Νέος προσωρινός κωδικός"
};

async function request(path){
  const token=localStorage.getItem("token");
  const response=await fetch(path,{headers:{Authorization:`Bearer ${token}`}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);
  return data;
}

function describe(row){
  const d=row.details||{};
  if(row.action==="AUDIT_ENABLED")return d.message||"Το ιστορικό ενεργειών είναι ενεργό.";
  if(row.action==="CUSTOMER_CREATED")return `Ιδιοκτήτης: ${d.ownerFullName||d.owner?.fullName||"—"} · Κατάστημα: ${d.storeName||d.store?.name||"—"}`;
  if(row.action==="OWNER_UPDATED")return `Ιδιοκτήτης: ${d.fullName||d.owner?.fullName||d.ownerFullName||"—"} · ${d.email||d.owner?.email||d.ownerEmail||"—"}`;
  if(row.action==="SUBSCRIPTION_MODULES_UPDATED")return `Πακέτο: ${d.plan||"—"} · Κατάσταση: ${d.licenseStatus||"—"} · Ενεργά modules: ${d.activeModuleCount??"—"}`;
  if(row.action==="CUSTOMER_STATUS_UPDATED")return d.active===false?"Ο πελάτης απενεργοποιήθηκε.":d.active===true?"Ο πελάτης ενεργοποιήθηκε.":d.trialDays?`Δοκιμαστική περίοδος: ${d.trialDays} ημέρες.`:"Ενημερώθηκε η κατάσταση πελάτη.";
  if(row.action==="OWNER_PASSWORD_RESET")return "Δημιουργήθηκε νέος προσωρινός κωδικός και ακυρώθηκαν οι παλιές συνεδρίες.";
  return "Εμπορική ενέργεια Platform Admin.";
}

const when=value=>new Date(value).toLocaleString("el-GR",{dateStyle:"short",timeStyle:"short"});

export default function PlatformAuditCenter(){
  const [authenticated,setAuthenticated]=useState(()=>Boolean(localStorage.getItem("token")&&localStorage.getItem("platformUser")));
  const [open,setOpen]=useState(false);
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [action,setAction]=useState("");

  useEffect(()=>{
    const timer=setInterval(()=>setAuthenticated(Boolean(localStorage.getItem("token")&&localStorage.getItem("platformUser"))),500);
    return()=>clearInterval(timer);
  },[]);

  const load=async()=>{
    setLoading(true);setError("");
    try{
      const data=await request("/api/platform/audit?limit=200");
      setRows(data.rows||[]);
    }catch(err){setError(err.message)}finally{setLoading(false)}
  };

  useEffect(()=>{if(open)load()},[open]);

  const filtered=useMemo(()=>{
    return rows.filter(row=>{
      if(action&&row.action!==action)return false;
      return matchesGreekSearch(search,[row.actorName,row.actorEmail,row.targetName,labels[row.action],describe(row)]);
    });
  },[rows,search,action]);

  if(!authenticated)return null;

  return <>
    <button className="platform-audit-launcher" onClick={()=>setOpen(true)}><History/>Ιστορικό ενεργειών</button>
    {open&&<div className="platform-modal platform-audit-modal">
      <section className="platform-audit-panel">
        <button className="modal-close" onClick={()=>setOpen(false)}><X/></button>
        <div className="platform-audit-head">
          <div><h2>Ιστορικό ενεργειών Super Admin</h2><p>Εμπορικές αλλαγές πελατών, συνδρομών, modules και ιδιοκτητών.</p></div>
          <button className="audit-refresh" onClick={load} disabled={loading}><RefreshCw/>Ανανέωση</button>
        </div>

        <div className="audit-filters">
          <label><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Αναζήτηση πελάτη ή ενέργειας…"/></label>
          <select value={action} onChange={e=>setAction(e.target.value)}>
            <option value="">Όλες οι ενέργειες</option>
            {Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
          <b>{filtered.length} εγγραφές</b>
        </div>

        {error&&<div className="platform-alert error">{error}</div>}
        {loading?<div className="platform-empty">Φόρτωση ιστορικού…</div>:<div className="audit-list">
          {filtered.length===0?<div className="platform-empty">Δεν βρέθηκαν εγγραφές.</div>:filtered.map(row=><article key={row.id} className={`audit-row action-${String(row.action).toLowerCase()}`}>
            <div className="audit-time"><b>{when(row.createdAt)}</b><small>{row.ipAddress||"Χωρίς IP"}</small></div>
            <div className="audit-main"><b>{labels[row.action]||row.action}</b><span>{row.targetName||"MyWorkStation Platform"}</span><p>{describe(row)}</p></div>
            <div className="audit-actor"><small>Εκτελέστηκε από</small><b>{row.actorName||"MyWorkStation System"}</b><span>{row.actorEmail||"—"}</span></div>
          </article>)}
        </div>}
      </section>
    </div>}
  </>;
}
