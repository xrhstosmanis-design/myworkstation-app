import React,{useEffect,useState} from "react";
import {PackageCheck,RefreshCw,X} from "lucide-react";
import CommercialLicensePanel from "./CommercialLicensePanel.jsx";

async function request(path,options={}){
  const token=localStorage.getItem("token");
  const response=await fetch(path,{
    ...options,
    headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}
  });
  const text=await response.text();
  let data={};
  if(text){try{data=JSON.parse(text)}catch{data={error:"Ο server επέστρεψε μη αναμενόμενη απάντηση."}}}
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);
  return data;
}

const statusLabels={TRIAL:"Δοκιμή",PILOT:"Πιλοτικό",ACTIVE:"Ενεργό",SUSPENDED:"Σε αναστολή",EXPIRED:"Έληξε"};
const when=value=>value?new Date(value).toLocaleDateString("el-GR"):"Χωρίς λήξη";

export default function CommercialLicenseCenter(){
  const [open,setOpen]=useState(false);
  const [data,setData]=useState(null);
  const [selected,setSelected]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  const load=async()=>{
    setLoading(true);setError("");
    try{setData(await request("/api/platform/overview"))}
    catch(err){setError(err.message)}finally{setLoading(false)}
  };
  useEffect(()=>{if(open&&!data)load()},[open]);

  return <>
    <button className="commercial-license-launcher" onClick={()=>setOpen(true)}><PackageCheck/>Άδειες & Modules</button>
    {open&&<div className="platform-modal commercial-center-modal">
      {selected
        ?<CommercialLicensePanel company={selected} request={request} onSaved={async()=>{await load()}} onClose={()=>setSelected(null)}/>
        :<section className="commercial-center-panel">
          <button type="button" className="modal-close" onClick={()=>setOpen(false)}><X/></button>
          <div className="commercial-center-head">
            <div><h2>Εμπορικές άδειες πελατών</h2><p>Συνδρομές, λήξεις και ενεργά modules ανά εταιρεία.</p></div>
            <button className="commercial-refresh" onClick={load} disabled={loading}><RefreshCw/>Ανανέωση</button>
          </div>
          {error&&<div className="platform-alert error">{error}</div>}
          {loading?<div className="platform-empty">Φόρτωση αδειών…</div>:<div className="commercial-customer-list">
            {(data?.companies||[]).map(company=><button key={company.id} onClick={()=>setSelected(company)} className={`commercial-customer-card status-${String(company.licenseStatus||"TRIAL").toLowerCase()}`}>
              <div className="commercial-customer-mark">{company.name.slice(0,2).toUpperCase()}</div>
              <div className="commercial-customer-copy"><b>{company.name}</b><span>{company.owner?.fullName||"Χωρίς ιδιοκτήτη"}</span></div>
              <div><small>Κατάσταση</small><b>{statusLabels[company.licenseStatus]||company.licenseStatus}</b></div>
              <div><small>Πακέτο</small><b>{company.plan}</b></div>
              <div><small>Modules</small><b>{company.activeModuleCount}</b></div>
              <div><small>Λήξη</small><b>{when(company.subscriptionEndsAt)}</b></div>
              <span className="commercial-edit-label">Ρύθμιση →</span>
            </button>)}
          </div>}
        </section>}
    </div>}
  </>;
}
