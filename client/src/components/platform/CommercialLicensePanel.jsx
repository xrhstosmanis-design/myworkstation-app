import React,{useMemo,useState} from "react";
import {CheckCircle2,LockKeyhole,PackageCheck,Save,XCircle} from "lucide-react";

const planLabels={TRIAL:"Δοκιμαστικό",PILOT:"Πιλοτικό",BASIC:"Basic",PRO:"Pro",ENTERPRISE:"Enterprise"};
const statusLabels={TRIAL:"Δοκιμή",PILOT:"Πιλοτικό",ACTIVE:"Ενεργό",SUSPENDED:"Σε αναστολή",EXPIRED:"Έληξε"};
const toInput=value=>value?new Date(value).toISOString().slice(0,10):"";

export default function CommercialLicensePanel({company,request,onSaved,onClose}){
  const [plan,setPlan]=useState(company.plan||"PILOT");
  const [licenseStatus,setLicenseStatus]=useState(company.licenseStatus||"PILOT");
  const [subscriptionStartsAt,setSubscriptionStartsAt]=useState(toInput(company.subscriptionStartsAt));
  const [subscriptionEndsAt,setSubscriptionEndsAt]=useState(toInput(company.subscriptionEndsAt));
  const [autoRenew,setAutoRenew]=useState(Boolean(company.autoRenew));
  const [commercialNotes,setCommercialNotes]=useState(company.commercialNotes||"");
  const [modules,setModules]=useState(()=>company.modules||[]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const activeCount=useMemo(()=>modules.filter(module=>module.active).length,[modules]);
  const toggleModule=key=>{
    setModules(current=>current.map(module=>{
      if(module.key!==key)return module;
      if(module.key==="CORE")return module;
      if(!module.commercialReady&&!module.active)return module;
      return {...module,active:!module.active};
    }));
  };

  const save=async event=>{
    event.preventDefault();setBusy(true);setError("");
    try{
      await request(`/api/platform/companies/${company.id}/license`,{
        method:"PUT",
        body:JSON.stringify({
          plan,
          licenseStatus,
          subscriptionStartsAt,
          subscriptionEndsAt,
          autoRenew,
          commercialNotes,
          modules:modules.map(module=>({
            key:module.key,
            active:Boolean(module.active),
            startsAt:module.startsAt?toInput(module.startsAt):"",
            endsAt:module.endsAt?toInput(module.endsAt):"",
            notes:module.notes||""
          }))
        })
      });
      await onSaved();
      onClose();
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };

  return <form className="commercial-license-panel" onSubmit={save}>
    <div className="license-heading">
      <div className="license-icon"><PackageCheck/></div>
      <div><h2>Άδεια και modules</h2><p>{company.name}</p></div>
      <button type="button" className="modal-close" onClick={onClose}><XCircle/></button>
    </div>

    {error&&<div className="platform-alert error">{error}</div>}

    <div className="license-summary">
      <div><small>Κατάσταση</small><b>{statusLabels[licenseStatus]}</b></div>
      <div><small>Πακέτο</small><b>{planLabels[plan]}</b></div>
      <div><small>Ενεργά modules</small><b>{activeCount}</b></div>
    </div>

    <div className="license-fields">
      <label>Πακέτο<select value={plan} onChange={e=>setPlan(e.target.value)}>{Object.entries(planLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Εμπορική κατάσταση<select value={licenseStatus} onChange={e=>setLicenseStatus(e.target.value)}>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Έναρξη συνδρομής<input type="date" value={subscriptionStartsAt} onChange={e=>setSubscriptionStartsAt(e.target.value)}/></label>
      <label>Λήξη συνδρομής<input type="date" value={subscriptionEndsAt} onChange={e=>setSubscriptionEndsAt(e.target.value)}/></label>
      <label className="license-checkbox"><input type="checkbox" checked={autoRenew} onChange={e=>setAutoRenew(e.target.checked)}/><span>Αυτόματη ανανέωση</span></label>
      <label className="license-notes">Εμπορικές σημειώσεις<textarea rows="3" value={commercialNotes} onChange={e=>setCommercialNotes(e.target.value)} placeholder="Συμφωνία, τιμή, ειδικοί όροι ή εκκρεμότητες..."/></label>
    </div>

    <div className="module-section-head"><div><h3>Modules πελάτη</h3><p>Ενεργοποιούνται μόνο όσα είναι εμπορικά διαθέσιμα.</p></div><b>{activeCount} ενεργά</b></div>
    <div className="commercial-module-grid">
      {modules.map(module=><button
        type="button"
        key={module.key}
        className={`commercial-module ${module.active?"enabled":""} ${!module.commercialReady?"locked":""}`}
        onClick={()=>toggleModule(module.key)}
        disabled={module.key==="CORE"||(!module.commercialReady&&!module.active)}
      >
        <span className="module-state">{module.active?<CheckCircle2/>:<LockKeyhole/>}</span>
        <span><b>{module.name}</b><small>{module.description}</small></span>
        <em>{module.active?"ΕΝΕΡΓΟ":module.commercialReady?"ΑΝΕΝΕΡΓΟ":"ΥΠΟ ΑΝΑΠΤΥΞΗ"}</em>
      </button>)}
    </div>

    <div className="platform-form-actions">
      <button type="button" className="secondary" onClick={onClose}>Ακύρωση</button>
      <button disabled={busy}><Save/>{busy?"Αποθήκευση…":"Αποθήκευση άδειας"}</button>
    </div>
  </form>;
}
