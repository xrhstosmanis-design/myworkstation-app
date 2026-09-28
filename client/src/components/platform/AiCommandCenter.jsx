import React,{useEffect,useMemo,useState} from "react";
import {AlertTriangle,BarChart3,BrainCircuit,Building2,CheckCircle2,ChevronRight,Landmark,MessageCircle,ReceiptText,RefreshCw,ShieldCheck,Store,WalletCards,X} from "lucide-react";

const countStores=companies=>companies.reduce((total,company)=>total+(company.stores?.length||0),0);

const athensToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

export default function AiCommandCenter({request,companies=[],loading=false,onClose,onRefresh,onOpenChecks,onOpenCash,onOpenPayments,onOpenBank,onOpenEvents}){
  const [problems,setProblems]=useState({loading:true,error:"",cash:null,payments:null,bank:null});
  const [question,setQuestion]=useState("");
  const [askState,setAskState]=useState({loading:false,error:"",result:null});
  const loadProblems=async()=>{
    setProblems(current=>({...current,loading:true,error:""}));
    try{
      const date=athensToday();
      const [cash,payments,bank]=await Promise.all([
        request(`/api/platform/cash-control/daily?${new URLSearchParams({date,fromTime:"00:00",toTime:"23:59"})}`),
        request("/api/transactions/supplier-settlements/review"),
        request("/api/transactions/bank-ledger/review")
      ]);
      setProblems({loading:false,error:"",cash,payments,bank});
    }catch(error){setProblems(current=>({...current,loading:false,error:error.message||"Δεν φορτώθηκαν οι υπάρχοντες έλεγχοι."}))}
  };
  useEffect(()=>{loadProblems()},[]);
  const summary=useMemo(()=>{
    const activeCompanies=companies.filter(company=>company.active);
    const inactiveCompanies=companies.filter(company=>!company.active);
    const stores=countStores(companies);
    const attention=inactiveCompanies.length+activeCompanies.filter(company=>(company.stores?.length||0)===0).length;
    return{activeCompanies:activeCompanies.length,inactiveCompanies:inactiveCompanies.length,stores,attention};
  },[companies]);
  const problemSummary=useMemo(()=>{
    const cashTotals=problems.cash?.totals||{};
    const cashIssues=(Number(cashTotals.shortage||0)>.009?1:0)+(Math.abs(Number(cashTotals.cardVariance||0))>.009?1:0)+Number(cashTotals.expensesWithoutDocument||0)+Number(cashTotals.duplicateCandidates||0);
    const paymentItems=problems.payments?.items||[];
    const bankItems=problems.bank?.items||[];
    return{cashIssues,payments:paymentItems.length,paymentDiscrepancies:paymentItems.filter(item=>item.status==="DISCREPANCY").length,bank:bankItems.length,bankDiscrepancies:bankItems.filter(item=>item.status==="DISCREPANCY").length,total:cashIssues+paymentItems.length+bankItems.length};
  },[problems]);
  const refresh=()=>{onRefresh?.();loadProblems()};
  const ask=async event=>{
    event.preventDefault();
    const value=question.trim();if(value.length<3||askState.loading)return;
    setAskState({loading:true,error:"",result:null});
    try{
      const companyStates=companies.map(company=>({name:company.name,active:Boolean(company.active),stores:company.stores?.length||0}));
      const result=await request("/api/platform/ai-command-center/ask",{method:"POST",body:JSON.stringify({question:value,snapshot:{generatedAt:new Date().toISOString(),companies:summary,problems:problemSummary,companyStates}})});
      setAskState({loading:false,error:"",result});
    }catch(error){setAskState({loading:false,error:error.message||"Δεν ήταν δυνατή η απάντηση.",result:null})}
  };

  return <div className="ai-command-page" data-ai-command-center="phase-3">
    <section className="ai-command-shell">
      <header className="ai-command-header">
        <div className="ai-command-heading"><span className="ai-command-mark"><BrainCircuit/></span><div><small>SUPER ADMIN · ΦΑΣΗ 3</small><h1>AI Command Center</h1><p>Μία κεντρική εικόνα της επιχείρησης, πάνω στις υπάρχουσες λειτουργίες του MyWorkStation.</p></div></div>
        <div className="ai-command-header-actions"><span><ShieldCheck/> Μόνο ανάγνωση</span><button type="button" onClick={refresh} disabled={loading||problems.loading}><RefreshCw/> {loading||problems.loading?"Ανανέωση…":"Ανανέωση"}</button><button type="button" className="ai-command-close" onClick={onClose} aria-label="Κλείσιμο AI Command Center"><X/></button></div>
      </header>

      <div className="ai-command-safety"><ShieldCheck/><div><b>Μία πηγή δεδομένων</b><p>Το Command Center δεν κρατά δεύτερα στοιχεία. Διαβάζει τη σημερινή επισκόπηση και σε οδηγεί στις κανονικές οθόνες για έλεγχο και ενέργειες.</p></div></div>

      <section className="ai-command-metrics" aria-label="Επισκόπηση επιχείρησης">
        <article className="ok"><Building2/><div><span>Ενεργές εταιρείες</span><strong>{summary.activeCompanies}</strong><small>Από τη σημερινή επισκόπηση</small></div></article>
        <article><Store/><div><span>Καταστήματα</span><strong>{summary.stores}</strong><small>Σε όλη την πλατφόρμα</small></div></article>
        <article className={summary.attention?"warn":"ok"}>{summary.attention?<AlertTriangle/>:<CheckCircle2/>}<div><span>Χρειάζονται έλεγχο</span><strong>{summary.attention}</strong><small>{summary.attention?"Ανενεργές εταιρείες ή χωρίς κατάστημα":"Δεν υπάρχει ένδειξη στη βασική εικόνα"}</small></div></article>
        <article className={summary.inactiveCompanies?"danger":"ok"}>{summary.inactiveCompanies?<AlertTriangle/>:<CheckCircle2/>}<div><span>Ανενεργές εταιρείες</span><strong>{summary.inactiveCompanies}</strong><small>Δεν αλλάζει κατάσταση από εδώ</small></div></article>
      </section>

      <div className="ai-command-grid">
        <section className="ai-command-panel">
          <div className="ai-command-panel-title"><div><small>ΚΕΝΤΡΟ ΠΡΟΒΛΗΜΑΤΩΝ · ΦΑΣΗ 2</small><h2>{problems.loading?"Φόρτωση ελέγχων…":`${problemSummary.total} ανοικτά σημεία`}</h2><p>Σύνοψη από τους υπάρχοντες ελέγχους· η διαχείριση γίνεται στις κανονικές οθόνες.</p></div><AlertTriangle/></div>
          {problems.error&&<div className="ai-command-problem-error"><AlertTriangle/>{problems.error}</div>}
          <div className="ai-command-actions">
            <button type="button" onClick={onOpenChecks}><BarChart3/><span><b>Έλεγχοι & Αναλύσεις</b><small>Πλήρης υφιστάμενος έλεγχος</small></span><ChevronRight/></button>
            <button type="button" onClick={onOpenCash}><WalletCards/><span><b>Ταμεία</b><small>Έλλειμμα, POS–EFTPOS, αποδεικτικά και διπλότυπα</small></span><em className={problemSummary.cashIssues?"warn":"ok"}>{problemSummary.cashIssues}</em><ChevronRight/></button>
            <button type="button" onClick={onOpenPayments}><ReceiptText/><span><b>Πληρωμές</b><small>{problemSummary.paymentDiscrepancies} με καταγεγραμμένη απόκλιση</small></span><em className={problemSummary.payments?"warn":"ok"}>{problemSummary.payments}</em><ChevronRight/></button>
            <button type="button" onClick={onOpenBank}><Landmark/><span><b>Τράπεζα</b><small>{problemSummary.bankDiscrepancies} με καταγεγραμμένη απόκλιση</small></span><em className={problemSummary.bank?"warn":"ok"}>{problemSummary.bank}</em><ChevronRight/></button>
            <button type="button" onClick={onOpenEvents}><ShieldCheck/><span><b>Συμβάντα</b><small>Κεντρικό Audit</small></span><ChevronRight/></button>
          </div>
        </section>

        <section className="ai-command-panel">
          <div className="ai-command-panel-title"><div><small>ΚΑΤΑΣΤΑΣΗ ΚΑΤΑΣΤΗΜΑΤΩΝ</small><h2>Όλη η πλατφόρμα</h2><p>Πρώτη λειτουργική ένδειξη από τα ήδη διαθέσιμα στοιχεία.</p></div><Store/></div>
          <div className="ai-store-list">
            {companies.length===0?<div className="ai-command-empty">{loading?"Φόρτωση επισκόπησης…":"Δεν υπάρχουν εταιρείες στην επισκόπηση."}</div>:companies.map(company=>{
              const storeTotal=company.stores?.length||0;
              const state=!company.active?"danger":storeTotal===0?"warn":"ok";
              const label=!company.active?"ΑΝΕΝΕΡΓΗ":storeTotal===0?"ΕΛΕΓΧΟΣ":"ΟΚ";
              return <article key={company.id}><span className={`ai-state-dot ${state}`} aria-hidden="true"/><div><b>{company.name}</b><small>{storeTotal} {storeTotal===1?"κατάστημα":"καταστήματα"}</small></div><strong className={state}>{label}</strong></article>;
            })}
          </div>
        </section>
      </div>

      <section className="ai-command-ask">
        <div className="ai-command-panel-title"><div><small>ΡΩΤΑ ΤΟ MYWORKSTATION · ΦΑΣΗ 3</small><h2>Τι χρειάζεται την προσοχή μου;</h2><p>Η απάντηση βασίζεται μόνο στη σημερινή επισκόπηση και στους μετρητές των υπαρχόντων ελέγχων.</p></div><MessageCircle/></div>
        <form onSubmit={ask}><textarea value={question} onChange={event=>setQuestion(event.target.value)} maxLength={600} rows={3} placeholder="π.χ. Ποια σημεία χρειάζονται έλεγχο σήμερα;"/><button type="submit" disabled={askState.loading||question.trim().length<3}><MessageCircle/>{askState.loading?"Ανάλυση…":"Ρώτα"}</button></form>
        <div className="ai-command-prompts"><button type="button" onClick={()=>setQuestion("Ποια σημεία χρειάζονται έλεγχο σήμερα;")}>Τι χρειάζεται έλεγχο;</button><button type="button" onClick={()=>setQuestion("Υπάρχουν ανενεργές εταιρείες ή καταστήματα χωρίς κάλυψη;")}>Κατάσταση δικτύου</button><button type="button" onClick={()=>setQuestion("Σε ποια κανονική οθόνη πρέπει να πάω πρώτα και γιατί;")}>Πού να πάω πρώτα;</button></div>
        {askState.error&&<div className="ai-command-problem-error"><AlertTriangle/>{askState.error}</div>}
        {askState.result&&<article className="ai-command-answer"><div className="ai-command-answer-head"><BrainCircuit/><b>Απάντηση MyWorkStation</b><span>Μόνο ανάγνωση</span></div><p>{askState.result.answer}</p>{askState.result.highlights?.length>0&&<ul>{askState.result.highlights.map((item,index)=><li key={index}>{item}</li>)}</ul>}<small><b>Πηγές:</b> {askState.result.sources?.join(" · ")||"Τρέχουσα επισκόπηση"}</small>{askState.result.limitations&&<small><b>Όριο:</b> {askState.result.limitations}</small>}</article>}
      </section>

      <section className="ai-command-roadmap">
        <div><small>ΕΠΟΜΕΝΑ ΒΗΜΑΤΑ</small><h2>Η ανάπτυξη παραμένει σταδιακή</h2></div>
        <div className="ai-roadmap-cards"><article className="current"><MessageCircle/><b>Ρώτα το MyWorkStation</b><span>Φάση 3 · ενεργό</span></article><article><BarChart3/><b>AI ημερήσια ανάλυση</b><span>Επόμενη φάση</span></article><article><Store/><b>Digital Twin</b><span>Αργότερα</span></article></div>
      </section>
    </section>
  </div>;
}
