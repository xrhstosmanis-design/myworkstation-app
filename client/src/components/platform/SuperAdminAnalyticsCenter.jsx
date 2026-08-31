import React,{useEffect,useMemo,useState} from "react";
import {AlertTriangle,BarChart3,CheckCircle2,RefreshCw,ShieldCheck,X} from "lucide-react";
import "./super-admin-analytics.css";

const eur=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const hasDifference=row=>Math.abs(Number(row.cashVariance||0))>.009||Math.abs(Number(row.cardVariance||0))>.02;

export default function SuperAdminAnalyticsCenter({request,companies=[],onClose}){
  const emptyFilters={companyId:"",storeId:"",from:"",to:""};
  const [filters,setFilters]=useState(emptyFilters);
  const [result,setResult]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const stores=useMemo(()=>companies.flatMap(company=>(company.stores||[]).map(store=>({...store,companyId:company.id}))),[companies]);
  const visibleStores=useMemo(()=>stores.filter(store=>!filters.companyId||String(store.companyId)===String(filters.companyId)),[stores,filters.companyId]);
  const companyById=useMemo(()=>new Map(companies.map(company=>[String(company.id),company])),[companies]);
  const storeById=useMemo(()=>new Map(stores.map(store=>[String(store.id),store])),[stores]);

  const execute=async(nextFilters=filters)=>{
    if(nextFilters.from&&nextFilters.to&&nextFilters.from>nextFilters.to){
      setError("Η ημερομηνία «Από» δεν μπορεί να είναι μετά την ημερομηνία «Έως».");
      return;
    }
    setBusy(true);setError("");
    try{
      const body=Object.fromEntries(Object.entries(nextFilters).filter(([,value])=>value));
      const bankQuery=new URLSearchParams(Object.entries({companyId:nextFilters.companyId,storeId:nextFilters.storeId}).filter(([,value])=>value));
      const bankSuffix=bankQuery.size?`?${bankQuery}`:"";
      const [analysis,bank]=await Promise.all([
        request("/api/platform/super-admin-analytics/execute",{method:"POST",body:JSON.stringify(body)}),
        request(`/api/transactions/bank-ledger/summary${bankSuffix}`)
      ]);
      setResult({...analysis,bank,appliedFilters:{...nextFilters}});
    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  };

  useEffect(()=>{execute(emptyFilters)},[]);
  useEffect(()=>{
    const closeOnEscape=event=>{if(event.key==="Escape")onClose()};
    window.addEventListener("keydown",closeOnEscape);
    return()=>window.removeEventListener("keydown",closeOnEscape);
  },[onClose]);

  const rows=useMemo(()=>(result?.rows||[]).map(row=>{
    const company=companyById.get(String(row.companyId));
    const store=storeById.get(String(row.storeId));
    return{
      ...row,
      companyName:company?.name||"Παλαιά / μη ενεργή εταιρεία",
      ownerName:company?.owner?.fullName||company?.ownerName||"Χωρίς ιδιοκτήτη",
      storeName:store?.name||"Παλαιό / μη ενεργό κατάστημα"
    };
  }),[result,companyById,storeById]);

  const totals=useMemo(()=>rows.reduce((sum,row)=>({
    shifts:sum.shifts+Number(row.shifts||0),
    cashVariance:sum.cashVariance+Number(row.cashVariance||0),
    cardVariance:sum.cardVariance+Number(row.cardVariance||0)
  }),{shifts:0,cashVariance:0,cardVariance:0}),[rows]);

  const findings=rows.filter(hasDifference);
  const applied=result?.appliedFilters||emptyFilters;
  const period=applied.from||applied.to
    ?`${applied.from||"αρχή"} έως ${applied.to||"σήμερα"}`
    :"Όλο το διαθέσιμο διάστημα";
  const bankTotals=result?.bank?.totals||{projectedBalance:0,availableBalance:0,pendingAmount:0};

  const reset=()=>{
    setFilters(emptyFilters);
    execute(emptyFilters);
  };

  return <div className="platform-modal">
    <section className="analytics-review-dialog">
      <header className="analytics-review-header">
        <div>
          <span>SUPER ADMIN ONLY</span>
          <h2><BarChart3/> Έλεγχοι & Αναλύσεις</h2>
          <p>Πραγματική συγκεντρωτική ανάλυση κλεισμένων βαρδιών, διαφορών μετρητών και POS–EFTPOS. Όλα τα αποτελέσματα είναι μόνο για ανάγνωση.</p>
        </div>
        <button type="button" className="analytics-close" onClick={onClose} aria-label="Κλείσιμο"><X/></button>
      </header>

      <form className="analytics-filter-grid" onSubmit={event=>{event.preventDefault();execute()}}>
        <label>Ιδιοκτήτης / εταιρεία
          <select value={filters.companyId} onChange={event=>setFilters(current=>({...current,companyId:event.target.value,storeId:""}))}>
            <option value="">Όλοι οι ιδιοκτήτες / εταιρείες</option>
            {companies.map(company=><option key={company.id} value={company.id}>{company.owner?.fullName||company.ownerName||"Χωρίς ιδιοκτήτη"} · {company.name}</option>)}
          </select>
        </label>
        <label>Κατάστημα
          <select value={filters.storeId} onChange={event=>setFilters(current=>({...current,storeId:event.target.value}))}>
            <option value="">Όλα τα καταστήματα</option>
            {visibleStores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </label>
        <label>Από
          <input type="date" value={filters.from} onChange={event=>setFilters(current=>({...current,from:event.target.value}))}/>
        </label>
        <label>Έως
          <input type="date" value={filters.to} onChange={event=>setFilters(current=>({...current,to:event.target.value}))}/>
        </label>
        <div className="analytics-filter-actions">
          <button type="submit" disabled={busy}><RefreshCw/>{busy?"Ανάλυση…":"Εμφάνιση"}</button>
          <button type="button" className="secondary" onClick={reset} disabled={busy}>Καθαρισμός</button>
        </div>
      </form>

      {error&&<div className="platform-alert error analytics-error">{error}</div>}

      {busy&&!result&&<div className="analytics-loading"><RefreshCw/> Συλλογή πραγματικών δεδομένων…</div>}

      {result&&<>
        <div className="analytics-scope-note">
          <ShieldCheck/>
          <div><b>Εφαρμοσμένη περίοδος: {period}</b><span>Η περίοδος αφορά τις κλεισμένες βάρδιες. Η τραπεζική σύνοψη παραμένει το τρέχον λογιστικό υπόλοιπο του επιλεγμένου scope.</span></div>
        </div>

        <section className="analytics-summary-grid">
          <article><span>Καταστήματα με βάρδιες</span><strong>{rows.length}</strong></article>
          <article><span>Κλεισμένες βάρδιες</span><strong>{totals.shifts}</strong></article>
          <article className={findings.length?"needs-review":"ok"}><span>Ευρήματα</span><strong>{findings.length}</strong></article>
          <article className={Math.abs(totals.cashVariance)>.009?"needs-review":"ok"}><span>Διαφορά μετρητών</span><strong>{eur(totals.cashVariance)}</strong></article>
          <article className={Math.abs(totals.cardVariance)>.02?"needs-review":"ok"}><span>POS–EFTPOS</span><strong>{eur(totals.cardVariance)}</strong></article>
          <article><span>Τράπεζα · λογιστικό</span><strong>{eur(bankTotals.projectedBalance)}</strong><small>Επιβεβαιωμένο {eur(bankTotals.availableBalance)} · Σε αναμονή {eur(bankTotals.pendingAmount)}</small></article>
        </section>

        <section className="analytics-results-panel">
          <div className="analytics-results-head">
            <div><h3>Αποτελέσματα ανά κατάστημα</h3><p>Δεν γίνεται αυτόματη κατηγορία ή καταλογισμός ευθύνης σε εργαζόμενο.</p></div>
            <span className={findings.length?"needs-review":"ok"}>{findings.length?"Χρειάζεται έλεγχος":"Χωρίς αποκλίσεις"}</span>
          </div>
          {rows.length?<div className="analytics-table-wrap"><table className="analytics-table">
            <thead><tr><th>Ιδιοκτήτης / εταιρεία</th><th>Κατάστημα</th><th>Βάρδιες</th><th>Μετρητά</th><th>POS–EFTPOS</th><th>Αποτέλεσμα</th></tr></thead>
            <tbody>{rows.map(row=><tr key={`${row.companyId}:${row.storeId}`} className={hasDifference(row)?"needs-review-row":""}>
              <td><b>{row.ownerName}</b><small>{row.companyName}</small></td>
              <td>{row.storeName}</td>
              <td>{Number(row.shifts||0)}</td>
              <td className={Math.abs(Number(row.cashVariance||0))>.009?"negative":"positive"}>{eur(row.cashVariance)}</td>
              <td className={Math.abs(Number(row.cardVariance||0))>.02?"negative":"positive"}>{eur(row.cardVariance)}</td>
              <td>{hasDifference(row)?<span className="analytics-result-badge needs-review"><AlertTriangle/>Χρειάζεται έλεγχος</span>:<span className="analytics-result-badge ok"><CheckCircle2/>Συμφωνία</span>}</td>
            </tr>)}</tbody>
          </table></div>:<div className="platform-empty analytics-empty">Δεν βρέθηκαν κλεισμένες βάρδιες για τα επιλεγμένα φίλτρα.</div>}
        </section>

        {findings.length>0?<section className="analytics-findings">
          <h3><AlertTriangle/> Ευρήματα που χρειάζονται έλεγχο</h3>
          {findings.map(row=><article key={`finding:${row.companyId}:${row.storeId}`}>
            <div><b>{row.storeName}</b><span>{row.ownerName} · {row.companyName}</span></div>
            <p>Διαφορά μετρητών <strong>{eur(row.cashVariance)}</strong> · POS–EFTPOS <strong>{eur(row.cardVariance)}</strong></p>
          </article>)}
        </section>:<div className="analytics-all-clear"><CheckCircle2/><div><b>Δεν εντοπίστηκε απόκλιση στα επιλεγμένα δεδομένα.</b><span>Ο έλεγχος ολοκληρώθηκε χωρίς να μεταβάλει ταμείο, τράπεζα, απόθεμα ή υπόλοιπα.</span></div></div>}
      </>}

      <p className="analytics-readonly-note"><ShieldCheck/> Read-only λειτουργία: καμία επιβεβαίωση, διόρθωση, χρέωση, κίνηση αποθέματος ή καταλογισμός σε εργαζόμενο δεν εκτελείται από αυτή την οθόνη.</p>
    </section>
  </div>;
}
