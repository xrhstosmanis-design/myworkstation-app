import React,{useMemo,useState} from "react";
import {CheckCircle2,LockKeyhole,PackageCheck,Save,XCircle} from "lucide-react";
import "./commercial-module-pricing.css";

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

  const technicalActivation=async module=>{
    const active=!module.active;
    if(!window.confirm(`${active?"Τεχνική ενεργοποίηση":"Απενεργοποίηση"} ${module.name} σε PILOT READ-ONLY;`))return;
    setBusy(true);setError("");
    try{
      await request(`/api/platform/companies/${company.id}/modules/${module.key}/technical-activation`,{method:"POST",body:JSON.stringify({active,reason:"Πιλοτική εγκατάσταση Read-Only Observer στον PC του ΚΑΤ"})});
      setModules(current=>current.map(row=>row.key===module.key?{...row,active}:row));
      await onSaved();
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };

  const activeCount=useMemo(()=>modules.filter(module=>module.active).length,[modules]);
  const monthlyTotal=useMemo(()=>modules.filter(module=>module.active&&(module.billingCycle||"MONTHLY")==="MONTHLY").reduce((sum,module)=>sum+Number(module.monthlyPrice||0),0),[modules]);
  const toggleModule=key=>{
    setModules(current=>current.map(module=>{
      if(module.key!==key)return module;
      if(module.key==="CORE")return module;
      if(!module.commercialReady&&!module.active)return module;
      return {...module,active:!module.active};
    }));
  };
  const updateModule=(key,field,value)=>setModules(current=>current.map(module=>module.key===key?{...module,[field]:value}:module));

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
            notes:module.notes||"",
            monthlyPrice:Number(module.monthlyPrice||0),setupFee:Number(module.setupFee||0),billingCycle:module.billingCycle||"MONTHLY",currency:"EUR"
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
      <div><h2>Συνδρομή και modules</h2><p>{company.name}</p></div>
      <button type="button" className="modal-close" onClick={onClose}><XCircle/></button>
    </div>

    {error&&<div className="platform-alert error">{error}</div>}

    <div className="license-summary">
      <div><small>Κατάσταση συνδρομής</small><b>{statusLabels[licenseStatus]}</b></div>
      <div><small>Πακέτο</small><b>{planLabels[plan]}</b></div>
      <div><small>Ενεργά modules</small><b>{activeCount}</b></div>
      <div><small>Συμφωνημένο μηνιαίο σύνολο</small><b>{monthlyTotal.toLocaleString("el-GR",{minimumFractionDigits:2})} €</b></div>
    </div>

    <div className="license-fields">
      <label>Πακέτο<select value={plan} onChange={e=>setPlan(e.target.value)}>{Object.entries(planLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Κατάσταση συνδρομής<select value={licenseStatus} onChange={e=>setLicenseStatus(e.target.value)}>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Έναρξη συνδρομής<input type="date" value={subscriptionStartsAt} onChange={e=>setSubscriptionStartsAt(e.target.value)}/></label>
      <label>Λήξη συνδρομής<input type="date" value={subscriptionEndsAt} onChange={e=>setSubscriptionEndsAt(e.target.value)}/></label>
      <label className="license-checkbox"><input type="checkbox" checked={autoRenew} onChange={e=>setAutoRenew(e.target.checked)}/><span>Αυτόματη ανανέωση</span></label>
      <label className="license-notes">Εμπορικές σημειώσεις<textarea rows="3" value={commercialNotes} onChange={e=>setCommercialNotes(e.target.value)} placeholder="Συμφωνία, τιμή, ειδικοί όροι ή εκκρεμότητες..."/></label>
    </div>

    <div className="module-section-head"><div><h3>Modules πελάτη</h3><p>Ενεργοποιούνται μόνο όσα είναι εμπορικά διαθέσιμα. Οι τιμές καταγράφουν τη συμφωνία και δεν πραγματοποιούν αυτόματη χρέωση.</p></div><b>{activeCount} ενεργά</b></div>
    <div className="commercial-module-grid">
      {modules.map(module=><article key={module.key} className={`commercial-module-card ${module.active?"enabled":""} ${!module.commercialReady?"locked":""}`}>
        <button type="button" className="commercial-module" onClick={()=>module.requiresTechnicalActivation?technicalActivation(module):toggleModule(module.key)} disabled={busy||module.key==="CORE"||(!module.commercialReady&&!module.requiresTechnicalActivation&&!module.active)}>
          <span className="module-state">{module.active?<CheckCircle2/>:<LockKeyhole/>}</span><span><b>{module.name}</b><small>{module.description}</small></span><em>{module.active?"ΕΝΕΡΓΟ":module.commercialReady?"ΑΝΕΝΕΡΓΟ":module.requiresTechnicalActivation?"ΤΕΧΝΙΚΗ ΕΝΕΡΓΟΠΟΙΗΣΗ":"ΥΠΟ ΑΝΑΠΤΥΞΗ"}</em>
        </button>
        {module.active&&<div className="module-commercial-terms"><label>Μηνιαία τιμή €<input type="number" min="0" step="0.01" value={module.monthlyPrice||0} onChange={e=>updateModule(module.key,"monthlyPrice",e.target.value)}/></label><label>Κόστος εγκατάστασης €<input type="number" min="0" step="0.01" value={module.setupFee||0} onChange={e=>updateModule(module.key,"setupFee",e.target.value)}/></label><label>Χρέωση<select value={module.billingCycle||"MONTHLY"} onChange={e=>updateModule(module.key,"billingCycle",e.target.value)}><option value="MONTHLY">Μηνιαία</option><option value="YEARLY">Ετήσια</option><option value="ONE_TIME">Εφάπαξ</option></select></label><label>Έναρξη<input type="date" value={toInput(module.startsAt)} onChange={e=>updateModule(module.key,"startsAt",e.target.value)}/></label><label>Λήξη<input type="date" value={toInput(module.endsAt)} onChange={e=>updateModule(module.key,"endsAt",e.target.value)}/></label></div>}
      </article>)}
    </div>

    <div className="platform-form-actions">
      <button type="button" className="secondary" onClick={onClose}>Ακύρωση</button>
      <button disabled={busy}><Save/>{busy?"Αποθήκευση…":"Αποθήκευση συνδρομής"}</button>
    </div>
  </form>;
}
