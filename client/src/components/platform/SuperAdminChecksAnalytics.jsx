import React,{useEffect,useMemo,useState} from "react";
import {AlertTriangle,BarChart3,CheckCircle2,RefreshCw,ShieldCheck,X} from "lucide-react";

const eur=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const number=value=>Number(value||0);
const emptyFilters={companyId:"",storeId:"",from:"",to:""};
const emptyReviewDraft={note:""};
const reviewDecisionLabels={
  EXPLANATION:"Καταχωρισμένη εξήγηση",
  CONFIRMED_SHORTAGE:"Επιβεβαιωμένο έλλειμμα",
  REVIEWED_NO_CHANGE:"Ελεγμένο χωρίς αλλαγή"
};
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
const findingKey=finding=>String(finding.id||`${finding.sessionId||"session"}:${finding.eventCode||"variance"}`);
  return value?value.toFixed(2):"";
};

export default function SuperAdminChecksAnalytics({companies=[],request,onClose,setMessage}){
  const [filters,setFilters]=useState(emptyFilters);
  const [result,setResult]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [reviewingId,setReviewingId]=useState("");
  const [reviewDraft,setReviewDraft]=useState(emptyReviewDraft);
  const [reviewBusy,setReviewBusy]=useState(false);

  const stores=useMemo(()=>companies.flatMap(company=>(company.stores||[]).map(store=>({...store,companyId:company.id,companyName:company.name}))),[companies]);
  const visibleStores=useMemo(()=>stores.filter(store=>!filters.companyId||String(store.companyId)===String(filters.companyId)),[stores,filters.companyId]);
  const storeIndex=useMemo(()=>new Map(stores.map(store=>[String(store.id),store])),[stores]);
  const companyIndex=useMemo(()=>new Map(companies.map(company=>[String(company.id),company])),[companies]);

  useEffect(()=>{
    const closeOnEscape=event=>{if(event.key==="Escape"&&!busy&&!reviewBusy)onClose?.()};
    window.addEventListener("keydown",closeOnEscape);
    return()=>window.removeEventListener("keydown",closeOnEscape);
  },[busy,reviewBusy,onClose]);

  const updateFilters=patch=>{
    setFilters(current=>({...current,...patch}));
    setResult(null);
    setError("");
    setReviewingId("");
    setReviewDraft(emptyReviewDraft);
  };

  const run=async()=>{
    if(filters.from&&filters.to&&filters.from>filters.to){
      setError("Η ημερομηνία «Από» δεν μπορεί να είναι μεταγενέστερη από την ημερομηνία «Έως».");
      return;
    }
    setBusy(true);setError("");setResult(null);setReviewingId("");setReviewDraft(emptyReviewDraft);
    try{
      const payload=Object.fromEntries(Object.entries(filters).filter(([,value])=>value));
      const bankQuery=new URLSearchParams(Object.entries({companyId:filters.companyId,storeId:filters.storeId}).filter(([,value])=>value));
      const bankSuffix=bankQuery.size?`?${bankQuery}`:"";
      const [analytics,bank]=await Promise.all([
        request("/api/platform/super-admin-analytics/execute",{method:"POST",body:JSON.stringify(payload)}),
        request(`/api/transactions/bank-ledger/summary${bankSuffix}`)
      ]);
      setResult({analytics,bank,filters:{...filters},executedAt:new Date().toISOString()});
      const pending=Number.isFinite(Number(analytics.pendingFindingCount))
        ?Number(analytics.pendingFindingCount)
        :(analytics.findings||[]).filter(finding=>finding.reviewValid!==true).length;
      setMessage?.(analytics.status==="ΟΚ"?"Η φιλτραρισμένη ανάλυση ολοκληρώθηκε χωρίς διαφορές.":pending?`Η φιλτραρισμένη ανάλυση ολοκληρώθηκε: ${pending} συμβάν(τα) παραμένουν χωρίς έλεγχο.`:"Η φιλτραρισμένη ανάλυση ολοκληρώθηκε και όλα τα συμβάντα έχουν καταχώριση ελέγχου.");
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };

  const clear=()=>{
    setFilters(emptyFilters);
    setResult(null);
    setError("");
    setReviewingId("");
    setReviewDraft(emptyReviewDraft);
  };

  const openReview=finding=>{
    const decision=number(finding.cashVariance)<-.009?"CONFIRMED_SHORTAGE":"REVIEWED_NO_CHANGE";
    setReviewingId(findingKey(finding));
    setReviewDraft({decision,amount:decision==="REVIEWED_NO_CHANGE"?"":suggestedReviewAmount(finding),note:""});
    setError("");
  };

  const cancelReview=()=>{
    if(reviewBusy)return;
    setReviewingId("");
    setReviewDraft(emptyReviewDraft);
  };


  const saveReview=async finding=>{
    const note=String(reviewDraft.note||"").trim();
    setReviewBusy(true);setError("");
    try{
      const saved=await request(`/api/platform/super-admin-analytics/sessions/${encodeURIComponent(finding.sessionId)}/confirmation`,{
        method:"POST",
        body:JSON.stringify({companyId:finding.companyId,storeId:finding.storeId,note})
      });
      setResult(current=>{
        if(!current)return current;
        const nextFindings=(current.analytics?.findings||[]).map(item=>String(item.sessionId)===String(finding.sessionId)?{...item,...saved}:item);
        const pendingFindingCount=nextFindings.filter(item=>item.reviewValid!==true).length;
        return {...current,analytics:{...current.analytics,findings:nextFindings,pendingFindingCount,reviewedFindingCount:nextFindings.length-pendingFindingCount,status:nextFindings.length===0?"ΟΚ":pendingFindingCount?"Χρειάζεται επιβεβαίωση":"Επιβεβαιωμένοι έλεγχοι"}};
      });
      setReviewingId("");setReviewDraft(emptyReviewDraft);
      setMessage?.("Επιβεβαιώθηκε ο αυτόματος έλεγχος και καταγράφηκε στο Audit.");
    }catch(err){setError(err.message)}finally{setReviewBusy(false)}
  };

  const analytics=result?.analytics||{};
  const rows=analytics.rows||[];
  const findings=analytics.findings||[];
  const bank=result?.bank||{items:[],totals:{availableBalance:0,pendingAmount:0,projectedBalance:0}};
  const totalShifts=rows.reduce((sum,row)=>sum+number(row.shifts),0);
  const totalCashVariance=rows.reduce((sum,row)=>sum+number(row.cashVariance),0);
  const totalCardVariance=rows.reduce((sum,row)=>sum+number(row.cardVariance),0);
  const pendingFindingCount=Number.isFinite(Number(analytics.pendingFindingCount))?Number(analytics.pendingFindingCount):findings.filter(finding=>finding.reviewValid!==true).length;
  const reviewedFindingCount=Number.isFinite(Number(analytics.reviewedFindingCount))?Number(analytics.reviewedFindingCount):findings.length-pendingFindingCount;
  const selectedCompany=result?.filters.companyId?companyIndex.get(String(result.filters.companyId)):null;
  const selectedStore=result?.filters.storeId?storeIndex.get(String(result.filters.storeId)):null;
  const scopeLabel=selectedStore?`Εταιρεία: ${selectedStore.companyName} · Κατάστημα: ${selectedStore.name}`:selectedCompany?`Εταιρεία: ${selectedCompany.name} · Όλα τα καταστήματα`:"Όλοι οι ιδιοκτήτες / εταιρείες και όλα τα καταστήματα";
  const periodLabel=result?.filters.from||result?.filters.to?`${result.filters.from||"Αρχή διαθέσιμων δεδομένων"} έως ${result.filters.to||"Σήμερα"}`:"Όλο το διαθέσιμο διάστημα";

  return <div className="platform-modal"><section className="sa-modal">
    <header><div><span>ΜΟΝΟ ΥΠΕΡΔΙΑΧΕΙΡΙΣΤΗ</span><h2><BarChart3/> Έλεγχοι &amp; Αναλύσεις</h2><p>Κεντρική ανάλυση διαφορών ταμείου, POS–EFTPOS και Ταμείου Τράπεζας, με καταγραφή ελέγχου χωρίς μεταβολή οικονομικών δεδομένων.</p></div><button type="button" className="sa-close" onClick={onClose} disabled={busy||reviewBusy}><X/></button></header>
    {error&&<div className="platform-alert error">{error}</div>}
    <div className="supplier-review-filters">
      <label>Ιδιοκτήτης / εταιρεία<select value={filters.companyId} onChange={event=>updateFilters({companyId:event.target.value,storeId:""})}><option value="">Όλοι οι ιδιοκτήτες / εταιρείες</option>{companies.map(company=>{const owner=company.owner?.fullName||company.ownerName||"Χωρίς ιδιοκτήτη";return <option key={company.id} value={company.id}>{owner} · {company.name}</option>})}</select></label>
      <label>Κατάστημα<select value={filters.storeId} onChange={event=>updateFilters({storeId:event.target.value})}><option value="">Όλα τα καταστήματα</option>{visibleStores.map(store=><option key={store.id} value={store.id}>{filters.companyId?store.name:`${store.companyName} · ${store.name}`}</option>)}</select></label>
      <label>Από<input type="date" value={filters.from} max={filters.to||undefined} onChange={event=>updateFilters({from:event.target.value})}/></label>
      <label>Έως<input type="date" value={filters.to} min={filters.from||undefined} onChange={event=>updateFilters({to:event.target.value})}/></label>
      <button type="button" onClick={run} disabled={busy||reviewBusy}><RefreshCw/>{busy?"Έλεγχος…":"Εμφάνιση"}</button>
      <button type="button" className="secondary" onClick={clear} disabled={busy||reviewBusy}>Καθαρισμός</button>
    </div>
    <section className="platform-panel" style={{marginBottom:14}}><b>Πεδίο ελέγχου</b><p>Οι ημερομηνίες εφαρμόζονται στις βάρδιες και στις διαφορές ταμείου/POS–EFTPOS. Το Ταμείο Τράπεζας είναι τρέχον λογιστικό υπόλοιπο και φιλτράρεται μόνο ανά ιδιοκτήτη και κατάστημα.</p></section>
    {busy&&<section className="platform-panel" style={{marginBottom:14}}><b>Εκτελείται ο έλεγχος…</b><p>Συλλέγονται δεδομένα ανάγνωσης. Δεν αλλάζει βάρδια, ταμείο, τράπεζα, απόθεμα, παραστατικό ή υπόλοιπο.</p></section>}
    {result&&<>
      <section className="platform-panel" style={{marginBottom:14}}><b>{scopeLabel}</b><p>{periodLabel}</p><small>Εκτέλεση: {athensDateTime(result.executedAt)} · Κατάσταση: {analytics.status||"—"}</small></section>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:14}}>
        <article className="platform-panel"><small>Βάρδιες</small><h3>{totalShifts}</h3></article>
        <article className="platform-panel"><small>Καθαρή διαφορά μετρητών</small><h3>{eur(totalCashVariance)}</h3></article>
        <article className="platform-panel"><small>Διαφορά POS–EFTPOS</small><h3>{eur(totalCardVariance)}</h3></article>
        <article className="platform-panel"><small>Εκκρεμή συμβάντα</small><h3>{pendingFindingCount}</h3><small>{reviewedFindingCount} με καταχώριση · {findings.length} συνολικά</small></article>
      </div>
      <section className="platform-panel" style={{marginBottom:14}}>
        <b>Συμβάντα που χρειάζονται έλεγχο</b>
        <p>Κάθε εγγραφή είναι αποτέλεσμα των αυτόματων κανόνων. Δεν αποτελεί αυτόματη απόδοση αιτίας ή ευθύνης. Επιβεβαιώνεις μόνο το αποτέλεσμα και, αν θέλεις, προσθέτεις παρατήρηση.</p>
        {analytics.findingsTruncated&&<div className="platform-alert error">Εμφανίζονται τα νεότερα {analytics.findingLimit||500} συμβάντα. Περιόρισε τις ημερομηνίες για πλήρη λίστα.</div>}
        {findings.length?<div style={{display:"grid",gap:12,marginTop:12}}>{findings.map((finding,index)=>{
          const store=storeIndex.get(String(finding.storeId));
          const company=companyIndex.get(String(finding.companyId));
          const companyName=finding.companyName||company?.name||store?.companyName||"—";
          const storeName=finding.storeName||store?.name||finding.storeId||"—";
          const operator=finding.operatorName||finding.closedByName||finding.openedByName||"Χωρίς διαθέσιμο χειριστή";
          const reference=finding.referenceId||finding.sessionId||"—";
          const key=findingKey(finding);
          const reviewed=finding.reviewValid===true;
          const needsRecheck=finding.recheckRequired===true;
          const statusLabel=reviewed?(finding.reviewLabel||reviewDecisionLabels[finding.reviewDecision]||"Καταχωρισμένος έλεγχος"):needsRecheck?"Απαιτείται επανέλεγχος":"Χρειάζεται έλεγχο";
          const formOpen=reviewingId===key;
          return <article key={key||`${finding.storeId||"finding"}:${reference}:${index}`} style={{border:"1px solid #d7e1ec",borderRadius:14,padding:14,background:"#fff"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}><div><small>{finding.eventSource||"Συμβάν βάρδιας"}</small><h3 style={{margin:"4px 0 0"}}>{findingTitle(finding)}</h3></div><span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 10px",borderRadius:999,fontWeight:800,background:reviewed?"#e3f7ed":"#fff1df",color:reviewed?"#08734e":"#9a4b0b"}}>{reviewed?<CheckCircle2/>:<AlertTriangle/>} {statusLabel}</span></div>
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
            {finding.reviewId&&<div style={{marginTop:12,padding:11,borderRadius:10,background:reviewed?"#ecfdf5":"#fff7ed",border:`1px solid ${reviewed?"#b9ead3":"#fed7aa"}`}}>
              <b>Τελευταίος έλεγχος: {reviewed?(finding.reviewLabel||reviewDecisionLabels[finding.reviewDecision]||"Καταχωρισμένος έλεγχος"):"Απαιτείται επανέλεγχος"}</b>
              <small style={{display:"block",marginTop:4}}>{finding.reviewedBy||"Χωρίς διαθέσιμο ελεγκτή"} · {athensDateTime(finding.reviewedAt)}{number(finding.reviewAmount)>0?` · Ποσό ${eur(finding.reviewAmount)}`:""}</small>
              {finding.reviewNote&&<p style={{margin:"7px 0 0"}}>{finding.reviewNote}</p>}
              {needsRecheck&&<small style={{display:"block",marginTop:6,color:"#9a4b0b"}}>Μετά τον προηγούμενο έλεγχο καταγράφηκε νεότερη κίνηση στη βάρδια. Χρειάζεται νέα καταχώριση.</small>}
            </div>}
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:12}}>
              <button type="button" onClick={()=>openReview(finding)} disabled={reviewBusy} style={{border:0,borderRadius:9,padding:"9px 12px",background:"#147fc1",color:"#fff",fontWeight:800,cursor:"pointer"}}>{reviewed?"Νέα επιβεβαίωση":"Επιβεβαίωση ελέγχου"}</button>
            </div>
            {formOpen&&<div style={{display:"grid",gap:10,marginTop:12,padding:12,borderRadius:12,background:"#f7fafc",border:"1px solid #d7e1ec"}}>
              <b>Επιβεβαίωση αυτόματου ελέγχου</b>
              <label style={{display:"grid",gap:5,fontWeight:800,fontSize:12}}>Παρατήρηση (προαιρετική)<textarea value={reviewDraft.note} onChange={event=>setReviewDraft(current=>({...current,note:event.target.value}))} disabled={reviewBusy} rows={3} maxLength={1000} placeholder="Προαιρετική παρατήρηση για τον έλεγχο." style={{padding:10,border:"1px solid #cbd5e1",borderRadius:8,resize:"vertical",font:"inherit"}}/></label>
              <small>Η επιβεβαίωση αποθηκεύει στο Audit μόνο τον ελεγκτή, την ώρα και την προαιρετική παρατήρηση. Δεν αλλάζει ποσά, ταμείο, POS–EFTPOS, τράπεζα ή απόθεμα.</small>
              <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
                <button type="button" className="secondary" onClick={cancelReview} disabled={reviewBusy}>Ακύρωση</button>
                <button type="button" onClick={()=>saveReview(finding)} disabled={reviewBusy}>{reviewBusy?"Επιβεβαίωση…":"Επιβεβαίωση ελέγχου"}</button>
              </div>
            </div>}
          </article>})}</div>:<div className="platform-empty">Δεν υπάρχουν συγκεκριμένα συμβάντα για έλεγχο στα επιλεγμένα φίλτρα.</div>}
      </section>
      <section className="platform-panel" style={{marginBottom:14}}><b>Ανάλυση ανά κατάστημα</b>{rows.length?rows.map(row=>{const store=storeIndex.get(String(row.storeId));const company=companyIndex.get(String(row.companyId));const needsReview=Math.abs(number(row.cashVariance))>.009||Math.abs(number(row.cardVariance))>.02;return <article key={`${row.companyId}:${row.storeId}`} style={{display:"grid",gridTemplateColumns:"minmax(220px,1fr) repeat(3,minmax(120px,.5fr))",gap:12,alignItems:"center",padding:"13px 0",borderBottom:"1px solid #e2e8f0"}}><div><b>Εταιρεία: {company?.name||store?.companyName||row.companyId}</b><small style={{display:"block"}}>Κατάστημα: {store?.name||row.storeId}</small></div><span>Βάρδιες <b>{number(row.shifts)}</b></span><span>Μετρητά <b>{eur(row.cashVariance)}</b></span><span>{needsReview?<AlertTriangle/>:<CheckCircle2/>} {needsReview?"Υπάρχει απόκλιση":"Συμφωνία"} · POS–EFTPOS {eur(row.cardVariance)}</span></article>}):<div className="platform-empty">Δεν υπάρχουν κλεισμένες βάρδιες για τα επιλεγμένα φίλτρα.</div>}</section>
      <section className="platform-panel" style={{marginBottom:14}}><b>Σύνοψη Εικονικού Ταμείου Τράπεζας</b><p>Λογιστικό: {eur(bank.totals?.projectedBalance)} · Επιβεβαιωμένο: {eur(bank.totals?.availableBalance)} · Σε αναμονή: {eur(bank.totals?.pendingAmount)}</p>{(bank.items||[]).map(item=><small key={item.bankAccountId} style={{display:"block",marginTop:5}}>Εταιρεία: {item.companyName} · Κατάστημα: {item.storeName} · {item.bankName} / {item.accountName}: Λογιστικό {eur(item.projectedBalance)} · Επιβεβαιωμένο {eur(item.availableBalance)} · Σε αναμονή {eur(item.pendingAmount)}</small>)}</section>
      <section className="platform-panel"><ShieldCheck/><b> Μόνο για ανάγνωση τα οικονομικά δεδομένα</b><p>Η ανάλυση δεν πραγματοποιεί διορθώσεις και δεν αποδίδει αυτόματα ευθύνη σε εργαζόμενο. Η καταχώριση ελέγχου γράφει μόνο απόφαση, σημείωση, ελεγκτή και χρόνο στο Audit.</p></section>
    </>}
  </section></div>;
}
