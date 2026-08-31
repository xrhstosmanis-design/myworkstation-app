import React,{useEffect,useMemo,useState} from "react";
import {AlertTriangle,BarChart3,CheckCircle2,RefreshCw,ShieldCheck,X} from "lucide-react";

const eur=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const number=value=>Number(value||0);
const emptyFilters={companyId:"",storeId:"",from:"",to:""};
const athensDateTime=value=>{
  if(!value)return "—";
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return "—";
  return new Intl.DateTimeFormat("el-GR",{timeZone:"Europe/Athens",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(date);
};
const findingTitle=finding=>{
  if(finding.eventLabel)return finding.eventLabel;
  const cash=Math.abs(number(finding.cashVariance)),card=Math.abs(number(finding.cardVariance));
  if(cash>.009&&card>.02)return "Διαφορά μετρητών και POS–EFTPOS";
  if(cash>.009)return number(finding.cashVariance)<0?"Έλλειμμα μετρητών":"Πλεόνασμα μετρητών";
  if(card>.02)return "Διαφορά POS–EFTPOS";
  return "Συμβάν που χρειάζεται έλεγχο";
};

export default function SuperAdminChecksAnalytics({companies=[],request,onClose,setMessage}){
  const [filters,setFilters]=useState(emptyFilters);
  const [result,setResult]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const stores=useMemo(()=>companies.flatMap(company=>(company.stores||[]).map(store=>({...store,companyId:company.id,companyName:company.name}))),[companies]);
  const visibleStores=useMemo(()=>stores.filter(store=>!filters.companyId||String(store.companyId)===String(filters.companyId)),[stores,filters.companyId]);
  const storeIndex=useMemo(()=>new Map(stores.map(store=>[String(store.id),store])),[stores]);
  const companyIndex=useMemo(()=>new Map(companies.map(company=>[String(company.id),company])),[companies]);

  useEffect(()=>{
    const closeOnEscape=event=>{if(event.key==="Escape"&&!busy)onClose?.()};
    window.addEventListener("keydown",closeOnEscape);
    return()=>window.removeEventListener("keydown",closeOnEscape);
  },[busy,onClose]);

  const updateFilters=patch=>{
    setFilters(current=>({...current,...patch}));
    setResult(null);
    setError("");
  };

  const run=async()=>{
    if(filters.from&&filters.to&&filters.from>filters.to){
      setError("Η ημερομηνία «Από» δεν μπορεί να είναι μεταγενέστερη από την ημερομηνία «Έως».");
      return;
    }
    setBusy(true);setError("");setResult(null);
    try{
      const payload=Object.fromEntries(Object.entries(filters).filter(([,value])=>value));
      const bankQuery=new URLSearchParams(Object.entries({companyId:filters.companyId,storeId:filters.storeId}).filter(([,value])=>value));
      const bankSuffix=bankQuery.size?`?${bankQuery}`:"";
      const [analytics,bank]=await Promise.all([
        request("/api/platform/super-admin-analytics/execute",{method:"POST",body:JSON.stringify(payload)}),
        request(`/api/transactions/bank-ledger/summary${bankSuffix}`)
      ]);
      setResult({analytics,bank,filters:{...filters},executedAt:new Date().toISOString()});
      setMessage?.(analytics.status==="ΟΚ"?"Η φιλτραρισμένη ανάλυση ολοκληρώθηκε χωρίς διαφορές.":`Η φιλτραρισμένη ανάλυση ολοκληρώθηκε: ${(analytics.findings||[]).length} συμβάν(τα) χρειάζονται έλεγχο.`);
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };

  const clear=()=>{
    setFilters(emptyFilters);
    setResult(null);
    setError("");
  };

  const analytics=result?.analytics||{};
  const rows=analytics.rows||[];
  const findings=analytics.findings||[];
  const bank=result?.bank||{items:[],totals:{availableBalance:0,pendingAmount:0,projectedBalance:0}};
  const totalShifts=rows.reduce((sum,row)=>sum+number(row.shifts),0);
  const totalCashVariance=rows.reduce((sum,row)=>sum+number(row.cashVariance),0);
  const totalCardVariance=rows.reduce((sum,row)=>sum+number(row.cardVariance),0);
  const selectedCompany=result?.filters.companyId?companyIndex.get(String(result.filters.companyId)):null;
  const selectedStore=result?.filters.storeId?storeIndex.get(String(result.filters.storeId)):null;
  const scopeLabel=selectedStore?`Εταιρεία: ${selectedStore.companyName} · Κατάστημα: ${selectedStore.name}`:selectedCompany?`Εταιρεία: ${selectedCompany.name} · Όλα τα καταστήματα`:"Όλοι οι ιδιοκτήτες / εταιρείες και όλα τα καταστήματα";
  const periodLabel=result?.filters.from||result?.filters.to?`${result.filters.from||"Αρχή διαθέσιμων δεδομένων"} έως ${result.filters.to||"Σήμερα"}`:"Όλο το διαθέσιμο διάστημα";

  return <div className="platform-modal"><section className="sa-modal">
    <header><div><span>SUPER ADMIN ONLY</span><h2><BarChart3/> Έλεγχοι &amp; Αναλύσεις</h2><p>Πραγματική, κεντρική και αποκλειστικά read-only ανάλυση διαφορών ταμείου, POS–EFTPOS και Ταμείου Τράπεζας.</p></div><button type="button" className="sa-close" onClick={onClose} disabled={busy}><X/></button></header>
    {error&&<div className="platform-alert error">{error}</div>}
    <div className="supplier-review-filters">
      <label>Ιδιοκτήτης / εταιρεία<select value={filters.companyId} onChange={event=>updateFilters({companyId:event.target.value,storeId:""})}><option value="">Όλοι οι ιδιοκτήτες / εταιρείες</option>{companies.map(company=>{const owner=company.owner?.fullName||company.ownerName||"Χωρίς ιδιοκτήτη";return <option key={company.id} value={company.id}>{owner} · {company.name}</option>})}</select></label>
      <label>Κατάστημα<select value={filters.storeId} onChange={event=>updateFilters({storeId:event.target.value})}><option value="">Όλα τα καταστήματα</option>{visibleStores.map(store=><option key={store.id} value={store.id}>{filters.companyId?store.name:`${store.companyName} · ${store.name}`}</option>)}</select></label>
      <label>Από<input type="date" value={filters.from} max={filters.to||undefined} onChange={event=>updateFilters({from:event.target.value})}/></label>
      <label>Έως<input type="date" value={filters.to} min={filters.from||undefined} onChange={event=>updateFilters({to:event.target.value})}/></label>
      <button type="button" onClick={run} disabled={busy}><RefreshCw/>{busy?"Έλεγχος…":"Εμφάνιση"}</button>
      <button type="button" className="secondary" onClick={clear} disabled={busy}>Καθαρισμός</button>
    </div>
    <section className="platform-panel" style={{marginBottom:14}}><b>Πεδίο ελέγχου</b><p>Οι ημερομηνίες εφαρμόζονται στις βάρδιες και στις διαφορές ταμείου/POS–EFTPOS. Το Ταμείο Τράπεζας είναι τρέχον λογιστικό υπόλοιπο και φιλτράρεται μόνο ανά ιδιοκτήτη και κατάστημα.</p></section>
    {busy&&<section className="platform-panel" style={{marginBottom:14}}><b>Εκτελείται ο έλεγχος…</b><p>Συλλέγονται μόνο δεδομένα ανάγνωσης. Δεν αλλάζει βάρδια, ταμείο, τράπεζα, απόθεμα, παραστατικό ή υπόλοιπο.</p></section>}
    {result&&<>
      <section className="platform-panel" style={{marginBottom:14}}><b>{scopeLabel}</b><p>{periodLabel}</p><small>Εκτέλεση: {athensDateTime(result.executedAt)} · Κατάσταση: {analytics.status||"—"}</small></section>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:14}}>
        <article className="platform-panel"><small>Βάρδιες</small><h3>{totalShifts}</h3></article>
        <article className="platform-panel"><small>Καθαρή διαφορά μετρητών</small><h3>{eur(totalCashVariance)}</h3></article>
        <article className="platform-panel"><small>Διαφορά POS–EFTPOS</small><h3>{eur(totalCardVariance)}</h3></article>
        <article className="platform-panel"><small>Συμβάντα για έλεγχο</small><h3>{findings.length}</h3></article>
      </div>
      <section className="platform-panel" style={{marginBottom:14}}>
        <b>Συμβάντα που χρειάζονται έλεγχο</b>
        <p>Κάθε εγγραφή δείχνει το συγκεκριμένο κλείσιμο βάρδιας όπου καταγράφηκε η απόκλιση, με ημερομηνία, ώρα, κατάστημα, POS, βάρδια, χειριστή και ποσά. Δεν αποτελεί αυτόματη απόδοση αιτίας ή ευθύνης.</p>
        {analytics.findingsTruncated&&<div className="platform-alert error">Εμφανίζονται τα νεότερα {analytics.findingLimit||5000} συμβάντα. Περιόρισε τις ημερομηνίες για πλήρη λίστα.</div>}
        {findings.length?<div style={{display:"grid",gap:12,marginTop:12}}>{findings.map((finding,index)=>{
          const store=storeIndex.get(String(finding.storeId));
          const company=companyIndex.get(String(finding.companyId));
          const companyName=finding.companyName||company?.name||store?.companyName||"—";
          const storeName=finding.storeName||store?.name||finding.storeId||"—";
          const operator=finding.operatorName||finding.closedByName||finding.openedByName||"Χωρίς διαθέσιμο χειριστή";
          const reference=finding.referenceId||finding.sessionId||"—";
          return <article key={finding.id||`${finding.storeId||"finding"}:${reference}:${index}`} style={{border:"1px solid #d7e1ec",borderRadius:14,padding:14,background:"#fff"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}><div><small>{finding.eventSource||"Συμβάν βάρδιας"}</small><h3 style={{margin:"4px 0 0"}}>{findingTitle(finding)}</h3></div><span className="pending"><AlertTriangle/> Χρειάζεται έλεγχο</span></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10,marginTop:13}}>
              <span><b>Ημερομηνία / ώρα</b><small style={{display:"block"}}>{athensDateTime(finding.occurredAt||finding.closedAt||finding.openedAt)}</small></span>
              <span><b>Εταιρεία</b><small style={{display:"block"}}>{companyName}</small></span>
              <span><b>Κατάστημα</b><small style={{display:"block"}}>{storeName}</small></span>
              <span><b>POS / Τερματικό</b><small style={{display:"block"}}>{finding.terminalPos||"Χωρίς POS"}</small></span>
              <span><b>Βάρδια</b><small style={{display:"block"}}>{finding.shiftLabel||"Χωρίς ονομασία βάρδιας"}</small></span>
              <span><b>Χειριστής κλεισίματος</b><small style={{display:"block"}}>{operator}</small></span>
              <span><b>Διαφορά μετρητών</b><small style={{display:"block"}}>{eur(finding.cashVariance)}</small></span>
              <span><b>Διαφορά POS–EFTPOS</b><small style={{display:"block"}}>{eur(finding.cardVariance)}</small></span>
              <span><b>Άνοιγμα βάρδιας</b><small style={{display:"block"}}>{athensDateTime(finding.openedAt)}</small></span>
              <span><b>Κλείσιμο βάρδιας</b><small style={{display:"block"}}>{athensDateTime(finding.closedAt)}</small></span>
            </div>
            <small style={{display:"block",marginTop:12}}>Αναφορά βάρδιας: {reference} · Κωδικός συμβάντος: {finding.eventCode||finding.code||"VARIANCE_REVIEW"}</small>
          </article>})}</div>:<div className="platform-empty">Δεν υπάρχουν συγκεκριμένα συμβάντα για έλεγχο στα επιλεγμένα φίλτρα.</div>}
      </section>
      <section className="platform-panel" style={{marginBottom:14}}><b>Ανάλυση ανά κατάστημα</b>{rows.length?rows.map(row=>{const store=storeIndex.get(String(row.storeId));const company=companyIndex.get(String(row.companyId));const needsReview=Math.abs(number(row.cashVariance))>.009||Math.abs(number(row.cardVariance))>.02;return <article key={`${row.companyId}:${row.storeId}`} style={{display:"grid",gridTemplateColumns:"minmax(220px,1fr) repeat(3,minmax(120px,.5fr))",gap:12,alignItems:"center",padding:"13px 0",borderBottom:"1px solid #e2e8f0"}}><div><b>Εταιρεία: {company?.name||store?.companyName||row.companyId}</b><small style={{display:"block"}}>Κατάστημα: {store?.name||row.storeId}</small></div><span>Βάρδιες <b>{number(row.shifts)}</b></span><span>Μετρητά <b>{eur(row.cashVariance)}</b></span><span>{needsReview?<AlertTriangle/>:<CheckCircle2/>} {needsReview?"Χρειάζεται έλεγχος":"Συμφωνία"} · POS–EFTPOS {eur(row.cardVariance)}</span></article>}):<div className="platform-empty">Δεν υπάρχουν κλεισμένες βάρδιες για τα επιλεγμένα φίλτρα.</div>}</section>
      <section className="platform-panel" style={{marginBottom:14}}><b>Σύνοψη Εικονικού Ταμείου Τράπεζας</b><p>Λογιστικό: {eur(bank.totals?.projectedBalance)} · Επιβεβαιωμένο: {eur(bank.totals?.availableBalance)} · Σε αναμονή: {eur(bank.totals?.pendingAmount)}</p>{(bank.items||[]).map(item=><small key={item.bankAccountId} style={{display:"block",marginTop:5}}>Εταιρεία: {item.companyName} · Κατάστημα: {item.storeName} · {item.bankName} / {item.accountName}: Λογιστικό {eur(item.projectedBalance)} · Επιβεβαιωμένο {eur(item.availableBalance)} · Σε αναμονή {eur(item.pendingAmount)}</small>)}</section>
      <section className="platform-panel"><ShieldCheck/><b> Μόνο για ανάγνωση</b><p>Η εκτέλεση καταγράφεται στο Audit, αλλά δεν πραγματοποιεί διορθώσεις και δεν αποδίδει αυτόματα ευθύνη σε εργαζόμενο. Τα συμβάντα σημαίνονται μόνο ως «Χρειάζεται έλεγχο».</p></section>
    </>}
  </section></div>;
}