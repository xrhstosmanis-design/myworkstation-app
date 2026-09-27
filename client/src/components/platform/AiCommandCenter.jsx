import React,{useMemo} from "react";
import {AlertTriangle,BarChart3,BrainCircuit,Building2,CheckCircle2,ChevronRight,Landmark,MessageCircle,ReceiptText,RefreshCw,ShieldCheck,Store,WalletCards,X} from "lucide-react";

const countStores=companies=>companies.reduce((total,company)=>total+(company.stores?.length||0),0);

export default function AiCommandCenter({companies=[],loading=false,onClose,onRefresh,onOpenChecks,onOpenCash,onOpenPayments,onOpenBank,onOpenEvents}){
  const summary=useMemo(()=>{
    const activeCompanies=companies.filter(company=>company.active);
    const inactiveCompanies=companies.filter(company=>!company.active);
    const stores=countStores(companies);
    const attention=inactiveCompanies.length+activeCompanies.filter(company=>(company.stores?.length||0)===0).length;
    return{activeCompanies:activeCompanies.length,inactiveCompanies:inactiveCompanies.length,stores,attention};
  },[companies]);

  return <div className="ai-command-page" data-ai-command-center="phase-1">
    <section className="ai-command-shell">
      <header className="ai-command-header">
        <div className="ai-command-heading"><span className="ai-command-mark"><BrainCircuit/></span><div><small>SUPER ADMIN · ΦΑΣΗ 1</small><h1>AI Command Center</h1><p>Μία κεντρική εικόνα της επιχείρησης, πάνω στις υπάρχουσες λειτουργίες του MyWorkStation.</p></div></div>
        <div className="ai-command-header-actions"><span><ShieldCheck/> Μόνο ανάγνωση</span><button type="button" onClick={onRefresh} disabled={loading}><RefreshCw/> {loading?"Ανανέωση…":"Ανανέωση"}</button><button type="button" className="ai-command-close" onClick={onClose} aria-label="Κλείσιμο AI Command Center"><X/></button></div>
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
          <div className="ai-command-panel-title"><div><small>ΚΕΝΤΡΟ ΠΡΟΒΛΗΜΑΤΩΝ</small><h2>Υπάρχοντες έλεγχοι</h2><p>Άνοιξε την κανονική λειτουργία που ήδη χρησιμοποιεί το Super Admin.</p></div><AlertTriangle/></div>
          <div className="ai-command-actions">
            <button type="button" onClick={onOpenChecks}><BarChart3/><span><b>Έλεγχοι & Αναλύσεις</b><small>Συγκεντρωτικά ευρήματα</small></span><ChevronRight/></button>
            <button type="button" onClick={onOpenCash}><WalletCards/><span><b>Ταμεία</b><small>Βάρδιες και αποκλίσεις</small></span><ChevronRight/></button>
            <button type="button" onClick={onOpenPayments}><ReceiptText/><span><b>Πληρωμές</b><small>Παραστατικά προμηθευτών</small></span><ChevronRight/></button>
            <button type="button" onClick={onOpenBank}><Landmark/><span><b>Τράπεζα</b><small>Υπάρχον ταμείο τράπεζας</small></span><ChevronRight/></button>
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

      <section className="ai-command-roadmap">
        <div><small>ΕΠΟΜΕΝΑ ΒΗΜΑΤΑ</small><h2>Η ανάπτυξη παραμένει σταδιακή</h2></div>
        <div className="ai-roadmap-cards"><article className="current"><MessageCircle/><b>Ρώτα το MyWorkStation</b><span>Επόμενη φάση</span></article><article><BarChart3/><b>AI ημερήσια ανάλυση</b><span>Επόμενη φάση</span></article><article><Store/><b>Digital Twin</b><span>Αργότερα</span></article></div>
      </section>
    </section>
  </div>;
}
