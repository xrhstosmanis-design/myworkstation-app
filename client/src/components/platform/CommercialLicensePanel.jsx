import React,{useMemo,useState} from "react";
import {CheckCircle2,LockKeyhole,PackageCheck,Printer,Save,XCircle} from "lucide-react";
import "./commercial-module-pricing.css";
import "./managed-control.css";

const planLabels={TRIAL:"Δοκιμαστικό",PILOT:"Πιλοτικό",BASIC:"START",PRO:"BUSINESS",ENTERPRISE:"AI COMPLETE"};
const statusLabels={TRIAL:"Δοκιμή",PILOT:"Πιλοτικό",ACTIVE:"Ενεργό",SUSPENDED:"Σε αναστολή",EXPIRED:"Έληξε"};
const toInput=value=>value?new Date(value).toISOString().slice(0,10):"";
const controlPlans={NONE:{label:"Χωρίς ανθρώπινο έλεγχο",price:0},BASIC:{label:"Έλεγχος BASIC",price:149},COMPLETE:{label:"Έλεγχος COMPLETE",price:249},PREMIUM:{label:"Έλεγχος PREMIUM",price:349}};
const softwarePlans={
  BASIC:{label:"START",price:100,keys:["CORE","PERSONNEL","SHIFTS","LEAVES","INVENTORY","POS","STORE_MODE","PILOT_REPORT"]},
  PRO:{label:"BUSINESS",price:220,keys:["CORE","PERSONNEL","SHIFTS","LEAVES","INVENTORY","POS","STORE_MODE","PILOT_REPORT","CASH_CONTROL","ONLINE_ORDERING","DOCUMENTS","SALES_ANALYTICS","SHIFT_HANDOVER","ATTENDANCE"]},
  ENTERPRISE:{label:"AI COMPLETE",price:330,keys:["CORE","PERSONNEL","SHIFTS","AI_STAFF_SCHEDULER","LEAVES","INVENTORY","POS","STORE_MODE","PILOT_REPORT","CASH_CONTROL","ONLINE_ORDERING","DOCUMENTS","SALES_ANALYTICS","SHIFT_HANDOVER","ATTENDANCE","AI_READER"]}
};

function printPriceList(planPrices){
  const rows=Object.entries(softwarePlans).map(([key,item])=>`<tr><td><b>${item.label}</b></td><td>${item.keys.length} λειτουργίες/modules</td><td>${Number(planPrices[key]??item.price).toFixed(2)} € / μήνα</td></tr>`).join("");
  const controls=Object.values(controlPlans).filter(item=>item.price>0).map(item=>`<tr><td><b>${item.label}</b></td><td>Ξεχωριστή υπηρεσία ανθρώπινου ελέγχου</td><td>${item.price.toFixed(2)} € / μήνα</td></tr>`).join("");
  const popup=window.open("","_blank","width=1000,height=800");
  if(!popup)return window.alert("Ο browser εμπόδισε την εκτύπωση. Επιτρέψτε τα αναδυόμενα παράθυρα και δοκιμάστε ξανά.");
  popup.document.write(`<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Τιμοκατάλογος MyWorkStation</title><style>body{font-family:Arial,sans-serif;color:#17324a;padding:32px}h1{color:#123f5b}h2{margin-top:28px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd7e5;padding:11px;text-align:left}th{background:#123f5b;color:#fff}.notice{margin:24px 0;padding:16px;border:2px solid #d97706;background:#fff8e8;font-size:17px;font-weight:800}.foot{margin-top:22px;color:#64748b;font-size:12px}@page{size:A4;margin:14mm}</style></head><body><h1>MyWorkStation — Τιμοκατάλογος</h1><p>Μηνιαίες τιμές ανά κατάστημα.</p><h2>1. Συνδρομές λογισμικού</h2><table><thead><tr><th>Πακέτο</th><th>Περιγραφή</th><th>Τιμή</th></tr></thead><tbody>${rows}</tbody></table><h2>2. Προαιρετικός ανθρώπινος έλεγχος</h2><table><thead><tr><th>Υπηρεσία</th><th>Περιγραφή</th><th>Τιμή</th></tr></thead><tbody>${controls}</tbody></table><div class="notice">Οι τιμές δεν περιλαμβάνουν φυσική απογραφή. Η φυσική καταμέτρηση των προϊόντων πραγματοποιείται από προσωπικό του καταστήματος.</div><p class="foot">Όλες οι αναγραφόμενες τιμές είναι προ ΦΠΑ. Η συνδρομή λογισμικού και η υπηρεσία ανθρώπινου ελέγχου χρεώνονται ξεχωριστά.</p></body></html>`);
  popup.document.close();popup.focus();setTimeout(()=>popup.print(),250);
}

export default function CommercialLicensePanel({company,request,onSaved,onClose}){
  const [plan,setPlan]=useState(company.plan||"PILOT");
  const [licenseStatus,setLicenseStatus]=useState(company.licenseStatus||"PILOT");
  const [subscriptionStartsAt,setSubscriptionStartsAt]=useState(toInput(company.subscriptionStartsAt));
  const [subscriptionEndsAt,setSubscriptionEndsAt]=useState(toInput(company.subscriptionEndsAt));
  const [autoRenew,setAutoRenew]=useState(Boolean(company.autoRenew));
  const [commercialNotes,setCommercialNotes]=useState(company.commercialNotes||"");
  const [modules,setModules]=useState(()=>company.modules||[]);
  const [planPrices,setPlanPrices]=useState(()=>{const prices=Object.fromEntries(Object.entries(softwarePlans).map(([key,item])=>[key,item.price]));const saved=Number((company.modules||[]).find(module=>module.key==="CORE")?.monthlyPrice||0);if(saved>0&&softwarePlans[company.plan])prices[company.plan]=saved;return prices});
  const [managedControl,setManagedControl]=useState(()=>company.managedControl||{controlPlan:"NONE",monthlyPrice:0,notes:""});
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
  const applySoftwarePlan=planKey=>{
    const selected=softwarePlans[planKey],keys=new Set(selected.keys),selectedPrice=Number(planPrices[planKey]??selected.price);
    setPlan(planKey);
    setModules(current=>current.map(module=>module.commercialReady||module.key==="CORE"?{...module,active:keys.has(module.key),monthlyPrice:module.key==="CORE"?selectedPrice:0}:module));
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
          managedControl:{...managedControl,monthlyPrice:Number(managedControl.monthlyPrice||0)},
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

    <button type="button" className="price-list-print" onClick={()=>printPriceList(planPrices)}><Printer/>Εκτύπωση τιμοκαταλόγου</button>

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

    <section className="software-plan-section">
      <div className="module-section-head"><div><h3>Πακέτο λογισμικού</h3><p>Εφαρμόζει τα περιλαμβανόμενα modules και τη βασική μηνιαία τιμή ανά κατάστημα.</p></div></div>
      <div className="software-plan-grid">{Object.entries(softwarePlans).map(([key,item])=><article key={key} className={plan===key?"selected":""}><b>{item.label}</b><label>Τιμή €/μήνα<input type="number" min="0" step="0.01" value={planPrices[key]} onChange={e=>setPlanPrices(current=>({...current,[key]:e.target.value}))}/></label><small>{item.keys.length} λειτουργίες</small><button type="button" onClick={()=>applySoftwarePlan(key)}>Εφαρμογή πακέτου</button></article>)}</div>
    </section>

    <section className="managed-control-section">
      <div className="module-section-head"><div><h3>Υπηρεσία ανθρώπινου ελέγχου</h3><p>Αποθηκεύεται και χρεώνεται ξεχωριστά από τη συνδρομή λογισμικού και τα modules.</p></div><b>{Number(managedControl.monthlyPrice||0).toLocaleString("el-GR",{minimumFractionDigits:2})} €/μήνα</b></div>
      <div className="managed-control-grid">
        <label>Πακέτο ελέγχου<select value={managedControl.controlPlan} onChange={e=>{const controlPlan=e.target.value;setManagedControl(current=>({...current,controlPlan,monthlyPrice:controlPlans[controlPlan].price}))}}>{Object.entries(controlPlans).map(([value,item])=><option key={value} value={value}>{item.label} — {item.price} €/μήνα</option>)}</select></label>
        <label>Συμφωνημένη τιμή €/μήνα<input type="number" min="0" step="0.01" value={managedControl.monthlyPrice} onChange={e=>setManagedControl(current=>({...current,monthlyPrice:e.target.value}))}/></label>
        <label className="managed-control-notes">Όροι ελέγχου<textarea rows="2" value={managedControl.notes||""} onChange={e=>setManagedControl(current=>({...current,notes:e.target.value}))} placeholder="Όριο τιμολογίων, συχνότητα ελέγχου και ειδικοί όροι..."/></label>
      </div>
    </section>

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
