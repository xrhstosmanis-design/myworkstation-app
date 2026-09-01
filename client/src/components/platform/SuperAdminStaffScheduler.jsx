import React,{useEffect,useMemo,useState} from "react";
import {Banknote,CalendarClock,CheckCircle2,LockKeyhole,Printer,RefreshCw,Save,Send,ShieldCheck,Sparkles,Users,X} from "lucide-react";
import WorkforceV2EmployeesPanel from "./WorkforceV2EmployeesPanel.jsx";
import "./personnel-program.css";

const FALLBACK_PACKAGES=[
  {key:"PERSONNEL_BASIC",title:"BASIC Προσωπικό",shortTitle:"BASIC",description:"Εργαζόμενοι, καταστήματα, χειροκίνητο πρόγραμμα, ρεπό, άδειες και PDF/εκτύπωση."},
  {key:"PERSONNEL_PRO",title:"PRO Προσωπικό",shortTitle:"PRO",description:"Κανόνες εργαζομένων, έλεγχος λαθών, αντιγραφή εβδομάδας, προεπισκόπηση και παρουσίες."},
  {key:"PERSONNEL_AI",title:"AI Προσωπικό",shortTitle:"AI",description:"Βοηθός ChatGPT, αυτόματη πρόταση, διορθώσεις με εντολές και αναλυτικές προειδοποιήσεις."},
  {key:"PERSONNEL_PAYROLL",title:"Payroll / Μισθοδοσία",shortTitle:"PAYROLL",description:"Ωρομίσθιο, πραγματικές ώρες, πληρωμές, υπόλοιπο και κλείσιμο μισθοδοσίας μήνα."}
];

const PACKAGE_ICONS={PERSONNEL_BASIC:Users,PERSONNEL_PRO:ShieldCheck,PERSONNEL_AI:Sparkles,PERSONNEL_PAYROLL:Banknote};
const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});

export default function SuperAdminStaffScheduler({company,store,request,onClose}){
  const[weekStart,setWeekStart]=useState("");
  const[schedule,setSchedule]=useState(null);
  const[warnings,setWarnings]=useState([]);
  const[moduleInfo,setModuleInfo]=useState(null);
  const[prices,setPrices]=useState({});
  const[busy,setBusy]=useState("");
  const[error,setError]=useState("");

  const days=useMemo(()=>{
    const result={};
    for(const row of schedule?.assignments||[]){
      const key=row.date.slice(0,10);
      (result[key]??=[]).push(row);
    }
    return result;
  },[schedule]);

  const packages=moduleInfo?.packages?.length?moduleInfo.packages:FALLBACK_PACKAGES;
  const stateFor=key=>moduleInfo?.states?.[key]||{moduleKey:key,active:false,effectiveActive:false,inherited:false,monthlyPrice:0};

  const loadPackages=async()=>{
    if(!company?.id||!store?.id)return;
    setBusy("packages");
    setError("");
    try{
      const result=await request(`/api/platform/store-modules/companies/${company.id}/stores/${store.id}`);
      setModuleInfo(result);
      setPrices(Object.fromEntries((result.packages||FALLBACK_PACKAGES).map(item=>[item.key,String(result.states?.[item.key]?.monthlyPrice??0)])));
    }catch(e){setError(e.message)}finally{setBusy("")}
  };

  useEffect(()=>{loadPackages()},[company?.id,store?.id]);

  const savePackage=async(moduleKey,nextActive,priceOnly=false)=>{
    const definition=packages.find(item=>item.key===moduleKey)||{title:moduleKey};
    const action=priceOnly?"αποθηκευτεί η νέα τιμή για":nextActive?"ενεργοποιηθεί":"απενεργοποιηθεί";
    if(!window.confirm(`Να ${action} το πακέτο «${definition.title}» για το κατάστημα «${store.name}»;`))return;
    setBusy(moduleKey);
    setError("");
    try{
      const result=await request(`/api/platform/store-modules/companies/${company.id}/stores/${store.id}`,{
        method:"PUT",
        body:JSON.stringify({moduleKey,active:nextActive,monthlyPrice:Number(prices[moduleKey]||0),startsAt:null,endsAt:null,notes:stateFor(moduleKey).notes||""})
      });
      setModuleInfo(result);
      setPrices(current=>({...current,[moduleKey]:String(result.states?.[moduleKey]?.monthlyPrice??current[moduleKey]??0)}));
    }catch(e){setError(e.message)}finally{setBusy("")}
  };

  const generate=async()=>{
    setBusy("generate");
    setError("");
    try{
      const result=await request("/api/schedules/generate",{method:"POST",body:JSON.stringify({storeId:store.id,...(weekStart?{weekStart}:{})})});
      setSchedule(result.schedule);
      setWarnings(result.warnings||[]);
    }catch(e){setError(e.message)}finally{setBusy("")}
  };

  const email=async()=>{
    setBusy("email");
    setError("");
    try{
      const result=await request(`/api/schedules/${schedule.id}/email`,{method:"POST",body:"{}"});
      alert(`Στάλθηκε σε ${result.recipients.length} εργαζομένους.`);
    }catch(e){setError(e.message)}finally{setBusy("")}
  };

  return <div className="platform-modal staff-scheduler-modal workforce-v2-modal">
    <section className="platform-security-dialog workforce-v2-dialog">
      <button className="modal-close" onClick={onClose}><X/></button>
      <header className="workforce-v2-header">
        <div>
          <span className="workforce-v2-kicker">ΝΕΑ ΥΛΟΠΟΙΗΣΗ · WORKFORCE V2</span>
          <h2><CalendarClock/> Προσωπικό & Πρόγραμμα</h2>
          <p>{company.name} · <b>{store.name}</b></p>
        </div>
        <div className="workforce-v2-super-access"><LockKeyhole/> Ο Super Admin έχει πάντα πλήρη πρόσβαση</div>
      </header>

      <div className="workforce-v2-notice">
        <CheckCircle2/>
        <div><b>Καθαρή νέα βάση χωρίς μπάλωμα του παλιού module.</b><span>Το παλιό σύστημα παραμένει μόνο για ελεγχόμενη μεταφορά υπαρχόντων δεδομένων.</span></div>
      </div>

      {error&&<div className="platform-alert error">{error}</div>}

      <section className="workforce-v2-section">
        <div className="workforce-v2-section-title">
          <div><h3>Πακέτα ανά κατάστημα</h3><p>BASIC και PRO κληρονομούνται από ανώτερο ενεργό πακέτο. Η Μισθοδοσία ενεργοποιείται ξεχωριστά.</p></div>
          <button className="secondary" onClick={loadPackages} disabled={Boolean(busy)}><RefreshCw/> Ανανέωση</button>
        </div>
        <div className="workforce-package-grid">
          {packages.map(item=>{
            const state=stateFor(item.key);
            const Icon=PACKAGE_ICONS[item.key]||Users;
            const inheritedTitle=packages.find(candidate=>candidate.key===state.inheritedFrom)?.title||state.inheritedFrom;
            return <article className={`workforce-package-card ${state.effectiveActive?"enabled":"disabled"}`} key={item.key}>
              <div className="workforce-package-heading"><Icon/><div><small>{item.shortTitle}</small><h4>{item.title}</h4></div></div>
              <p>{item.description}</p>
              <div className={`workforce-package-status ${state.effectiveActive?"on":"off"}`}>
                {state.effectiveActive?"Ενεργό":"Ανενεργό"}{state.inherited&&` μέσω ${inheritedTitle}`}
              </div>
              <label>Μηνιαία τιμή<input type="number" min="0" step="0.01" value={prices[item.key]??String(state.monthlyPrice||0)} onChange={event=>setPrices(current=>({...current,[item.key]:event.target.value}))}/><span>{money(prices[item.key]??state.monthlyPrice)}</span></label>
              <div className="workforce-package-actions">
                <button onClick={()=>savePackage(item.key,!state.active)} disabled={Boolean(busy)}>{state.active?"Απενεργοποίηση":"Ενεργοποίηση"}</button>
                <button className="secondary" onClick={()=>savePackage(item.key,state.active,true)} disabled={Boolean(busy)}><Save/> Τιμή</button>
              </div>
            </article>;
          })}
        </div>
      </section>

      <section className="workforce-v2-section">
        <WorkforceV2EmployeesPanel company={company} store={store} request={request}/>
      </section>

      <section className="workforce-v2-section">
        <div className="workforce-v2-section-title"><div><h3>Βάση νέου module</h3><p>Οι παρακάτω ενότητες έχουν πλέον ξεχωριστή δομή δεδομένων και θα ενεργοποιούνται σταδιακά.</p></div></div>
        <div className="workforce-foundation-grid">
          {["Εργαζόμενοι & ρόλοι","Πρόσβαση σε πολλά καταστήματα","Κανόνες & διαθεσιμότητες","Πρότυπα βαρδιών","Εβδομαδιαίο / μηνιαίο πρόγραμμα","Άδειες, ρεπό & απουσίες","Παρουσίες & κάρτα εργασίας","Ωρομίσθια & μισθοδοσία","Πληρωμές υπαλλήλων","Προεπισκόπηση & πλήρες audit","PDF / Excel","ChatGPT με υποχρεωτική έγκριση"].map(label=><div key={label}><CheckCircle2/>{label}</div>)}
        </div>
      </section>

    </section>
  </div>;
}
