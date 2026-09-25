import React,{useEffect,useMemo,useState} from "react";
import {AlertTriangle,BarChart3,Building2,CalendarDays,CheckCircle2,ChevronRight,LockKeyhole,RefreshCw,ShieldCheck,Store,Unlock, X} from "lucide-react";

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
const FinalApprovalForm=({draft,setDraft,busy,onCancel,onSave})=><div style={{display:"grid",gap:10,marginTop:12,padding:12,borderRadius:12,background:"#f7fafc",border:"1px solid #d7e1ec"}}>
  <b>Έγκριση τελικού αποτελέσματος</b>
  <label style={{display:"grid",gap:5,fontWeight:800,fontSize:12}}>Παρατήρηση (προαιρετική)<textarea value={draft.note} onChange={event=>setDraft(current=>({...current,note:event.target.value}))} disabled={busy} rows={3} maxLength={1000} placeholder="Προαιρετική παρατήρηση για το τελικό αποτέλεσμα." style={{padding:10,border:"1px solid #cbd5e1",borderRadius:8,resize:"vertical",font:"inherit"}}/></label>
  <small>Η έγκριση γράφει μόνο ελεγκτή, ώρα και σημείωση στο Audit. Δεν αλλάζει ποσά, ταμείο, POS–EFTPOS, τράπεζα ή απόθεμα.</small>
  <div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button type="button" className="secondary" onClick={onCancel} disabled={busy}>Ακύρωση</button><button type="button" onClick={onSave} disabled={busy}>{busy?"Αποθήκευση…":"Έγκριση αποτελέσματος"}</button></div>
</div>;
const PremiumEvidence=({evidence=[]})=><div style={{marginTop:10,padding:10,borderRadius:9,background:"#eef6ff"}}><b>Αποδεικτικά στοιχεία που λήφθηκαν υπόψη</b>{evidence.map(e=><div key={e.id} style={{marginTop:10,paddingTop:10,borderTop:"1px solid #cbddeb"}}><b>{e.title}</b>{e.transactions?.length?<div style={{display:"grid",gap:7,marginTop:7}}>{e.transactions.map((tx,index)=><div key={tx.saleId} style={{padding:9,borderRadius:8,background:"#fff",border:"1px solid #cbddeb"}}><small><b>Συναλλαγή {index+1} · Απόδειξη:</b> {tx.receiptNumber||"Χωρίς αριθμό παραστατικού"} · <b>Ώρα:</b> {athensDateTime(tx.occurredAt)}</small><small style={{display:"block",marginTop:3}}><b>Ποσό:</b> {eur(tx.total)} · <b>Πληρωμή:</b> {tx.paymentMethods}</small><small style={{display:"block",marginTop:3}}><b>Προϊόντα:</b> {tx.items}</small><small style={{display:"block",marginTop:3,color:"#64748b"}}>Αναγνωριστικό συναλλαγής: {tx.saleId}</small></div>)}</div>:e.handover?<div style={{marginTop:7,padding:9,borderRadius:8,background:"#fff",border:"1px solid #cbddeb"}}><small><b>Βάρδια που έκλεισε:</b> {e.handover.closingShiftLabel||"—"} · {e.handover.closingTerminalPos||"—"} · {athensDateTime(e.handover.closingAt)} · Κλείσιμο {eur(e.handover.closingOperational)}</small><small style={{display:"block",marginTop:3}}><b>Επόμενη βάρδια:</b> {e.handover.nextShiftLabel||"—"} · {e.handover.nextTerminalPos||"—"} · {e.handover.nextOpenedByName||"Χωρίς χειριστή"} · {athensDateTime(e.handover.nextOpenedAt)} · Άνοιγμα {eur(e.handover.nextOpeningOperational)}</small></div>:e.operational?<div style={{marginTop:7,padding:9,borderRadius:8,background:"#fff",border:"1px solid #cbddeb"}}><small><b>Λειτουργικό συμβάν:</b> {e.operational.type} · {athensDateTime(e.operational.occurredAt)} · {e.operational.operatorName}</small><small style={{display:"block",marginTop:3}}><b>Ποσό:</b> {eur(e.operational.total)} · <b>Είδη:</b> {(e.operational.items||[]).map(item=>`${item.name||item.description||item.productId||"—"} × ${item.quantity||1}`).join(" · ")||"Δεν καταγράφηκαν είδη"}</small><small style={{display:"block",marginTop:3,color:"#64748b"}}>Αναγνωριστικό συμβάντος: {e.operational.eventId}</small></div>:null}{e.missingSaleIds?.length?<small style={{display:"block",marginTop:5,color:"#a15c00"}}>Δεν βρέθηκε διαθέσιμη απόδειξη για: {e.missingSaleIds.join(", ")}</small>:null}<small style={{display:"block",marginTop:5}}>• {e.possibleExplanation}</small></div>)}</div>;
const CompleteEvidence=({transactions=[]})=><div style={{marginTop:10,padding:10,borderRadius:9,background:"#eef6ff"}}><b>Αποδεικτικά στοιχεία κινήσεων</b><div style={{display:"grid",gap:7,marginTop:7}}>{transactions.map((tx,index)=><div key={tx.transactionId||index} style={{padding:9,borderRadius:8,background:"#fff",border:"1px solid #cbddeb"}}><small><b>Κίνηση {index+1}</b> · <b>Ώρα:</b> {athensDateTime(tx.occurredAt)} · <b>Ποσό:</b> {eur(tx.amount)}</small><small style={{display:"block",marginTop:3}}><b>Τύπος:</b> {tx.type||"—"} · <b>Χειριστής:</b> {tx.actorName||"—"}</small><small style={{display:"block",marginTop:3}}><b>Παραστατικό:</b> {tx.hasAttachment?(tx.attachmentFilename||"Καταχωρισμένο"):("Δεν βρέθηκε συνημμένο παραστατικό")}</small>{tx.description&&<small style={{display:"block",marginTop:3}}><b>Περιγραφή:</b> {tx.description}</small>}<small style={{display:"block",marginTop:3,color:"#64748b"}}>Αναγνωριστικό κίνησης: {tx.transactionId||"—"}</small></div>)}</div></div>;
const BasicShiftEvidence=({movements=[]})=><div style={{marginTop:12,padding:10,borderRadius:9,background:"#eef6ff"}}><b>Κινήσεις βάρδιας που λήφθηκαν υπόψη</b><small style={{display:"block",marginTop:4}}>Εμφανίζονται έως οι 50 νεότερες κινήσεις της ίδιας κλεισμένης βάρδιας.</small><div style={{display:"grid",gap:7,marginTop:7}}>{movements.map((movement,index)=><div key={movement.transactionId||index} style={{padding:9,borderRadius:8,background:"#fff",border:"1px solid #cbddeb"}}><small><b>Κίνηση {index+1}</b> · <b>Ώρα:</b> {athensDateTime(movement.occurredAt)} · <b>Ποσό:</b> {eur(movement.amount)}</small><small style={{display:"block",marginTop:3}}><b>Τύπος:</b> {movement.type||"—"} · <b>Χειριστής:</b> {movement.actorName||"—"}{movement.reversedAt?" · Αντιστράφηκε":""}</small>{movement.description&&<small style={{display:"block",marginTop:3}}><b>Περιγραφή:</b> {movement.description}</small>}<small style={{display:"block",marginTop:3,color:"#64748b"}}>Αναγνωριστικό κίνησης: {movement.transactionId||"—"}</small></div>)}</div></div>;

export default function SuperAdminChecksAnalytics({companies=[],request,onClose,setMessage,embedded=false}){
  const [filters,setFilters]=useState(emptyFilters);
  const [result,setResult]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [reviewingId,setReviewingId]=useState("");
  const [reviewDraft,setReviewDraft]=useState(emptyReviewDraft);
  const [reviewBusy,setReviewBusy]=useState(false);
  const [checkPackages,setCheckPackages]=useState([]);
  const [packagesBusy,setPackagesBusy]=useState(false);

  const stores=useMemo(()=>companies.flatMap(company=>(company.stores||[]).map(store=>({...store,companyId:company.id,companyName:company.name}))),[companies]);
  const visibleStores=useMemo(()=>stores.filter(store=>!filters.companyId||String(store.companyId)===String(filters.companyId)),[stores,filters.companyId]);
  const storeIndex=useMemo(()=>new Map(stores.map(store=>[String(store.id),store])),[stores]);
  const companyIndex=useMemo(()=>new Map(companies.map(company=>[String(company.id),company])),[companies]);

  useEffect(()=>{
    const closeOnEscape=event=>{if(event.key==="Escape"&&!busy&&!reviewBusy)onClose?.()};
    window.addEventListener("keydown",closeOnEscape);
    return()=>window.removeEventListener("keydown",closeOnEscape);
  },[busy,reviewBusy,onClose]);

  useEffect(()=>{
    let active=true;
    if(!filters.companyId||!filters.storeId){
      setCheckPackages([]);
      return()=>{active=false};
    }
    setPackagesBusy(true);
    request(`/api/platform/store-modules/companies/${encodeURIComponent(filters.companyId)}/stores/${encodeURIComponent(filters.storeId)}/check-packages`)
      .then(data=>{if(active)setCheckPackages(data.packages||[])})
      .catch(err=>{if(active)setError(err.message)})
      .finally(()=>{if(active)setPackagesBusy(false)});
    return()=>{active=false};
  },[filters.companyId,filters.storeId,request]);

  const updateFilters=patch=>{
    setFilters(current=>({...current,...patch}));
    setResult(null);
    setError("");
    setReviewingId("");
    setReviewDraft(emptyReviewDraft);
  };

  const selectStore=value=>{
    const selectedStore=stores.find(store=>String(store.id)===String(value));
    updateFilters({storeId:value,companyId:value&&selectedStore?String(selectedStore.companyId):filters.companyId});
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
      const reviewQuery=new URLSearchParams(Object.entries(filters).filter(([,value])=>value));
      const reviewSuffix=reviewQuery.size?`?${reviewQuery}`:"";
      const [analytics,bank,bankReview,supplierReview,expenseReview]=await Promise.all([
        request("/api/platform/super-admin-analytics/execute",{method:"POST",body:JSON.stringify(payload)}),
        request(`/api/transactions/bank-ledger/summary${bankSuffix}`),
        request(`/api/transactions/bank-ledger/review${bankSuffix}`),
        request(`/api/transactions/supplier-settlements/review${reviewSuffix}`),
        request(`/api/transactions/other-expenses/review${reviewSuffix}`)
      ]);
      setResult({analytics,bank,bankReview,supplierReview,expenseReview,filters:{...filters},executedAt:new Date().toISOString()});
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

  const toggleCheckPackage=async packageItem=>{
    if(!filters.companyId||!filters.storeId)return;
    const nextActive=!packageItem.active;
    const action=nextActive?"ενεργοποίηση":"απενεργοποίηση";
    if(!window.confirm(`Θέλεις ${action} του πακέτου «${packageItem.title}» για το επιλεγμένο κατάστημα; Η ενέργεια θα καταγραφεί στο Audit.`))return;
    setPackagesBusy(true);setError("");
    try{
      const data=await request(`/api/platform/store-modules/companies/${encodeURIComponent(filters.companyId)}/stores/${encodeURIComponent(filters.storeId)}/check-packages/${encodeURIComponent(packageItem.key)}`,{method:"PUT",body:JSON.stringify({active:nextActive,monthlyPrice:packageItem.monthlyPrice||0,startsAt:packageItem.startsAt||null,endsAt:packageItem.endsAt||null,notes:packageItem.notes||""})});
      setCheckPackages(data.packages||[]);
      setMessage?.(`Το πακέτο «${packageItem.title}» ${nextActive?"ενεργοποιήθηκε":"απενεργοποιήθηκε"} και καταγράφηκε στο Audit.`);
    }catch(err){setError(err.message)}finally{setPackagesBusy(false)}
  };

  const openReview=finding=>{
    setReviewingId(findingKey(finding));
    setReviewDraft(emptyReviewDraft);
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
      const saved=await request(`/api/platform/super-admin-analytics/sessions/${encodeURIComponent(finding.sessionId)}/reviews`,{
        method:"POST",
        body:JSON.stringify({companyId:finding.companyId,storeId:finding.storeId,decision:"REVIEWED_NO_CHANGE",note})
      });
      setResult(current=>{
        if(!current)return current;
        const nextFindings=(current.analytics?.findings||[]).map(item=>String(item.sessionId)===String(finding.sessionId)?{...item,...saved}:item);
        const nextPremium={...(current.analytics?.premium||{})};
        if(nextPremium.shiftResults)nextPremium.shiftResults=nextPremium.shiftResults.map(item=>String(item.sessionId)===String(finding.sessionId)?{...item,...saved}:item);
        const pendingFindingCount=nextFindings.filter(item=>item.reviewValid!==true).length;
        return {...current,analytics:{...current.analytics,findings:nextFindings,premium:nextPremium,pendingFindingCount,reviewedFindingCount:nextFindings.length-pendingFindingCount,status:nextFindings.length===0?"ΟΚ":pendingFindingCount?"Χρειάζεται επιβεβαίωση":"Επιβεβαιωμένοι έλεγχοι"}};
      });
      setReviewingId("");setReviewDraft(emptyReviewDraft);
      setMessage?.("Επιβεβαιώθηκε ο αυτόματος έλεγχος και καταγράφηκε στο Audit.");
    }catch(err){setError(err.message)}finally{setReviewBusy(false)}
  };

  const analytics=result?.analytics||{};
  const rows=analytics.rows||[];
  const findings=analytics.findings||[];
  const complete=analytics.complete||{enabled:false,findings:[]};
  const completeFindings=complete.findings||[];
  const premium=analytics.premium||{enabled:false,findings:[]};
  const premiumFindings=premium.findings||[];
  const bankReviewItems=result?.bankReview?.items||[];
  const openSupplierEvidence=async item=>{
    setError("");
    try{
      const result=await request(`/api/transactions/supplier-settlements/${encodeURIComponent(item.id)}/attachment`);
      const link=document.createElement("a");link.href=result.dataUrl;link.target="_blank";link.rel="noreferrer";link.click();
    }catch(err){setError(err.message)}
  };
  const supplierReviewItems=result?.supplierReview?.items||[];
  const expenseReviewItems=result?.expenseReview?.items||[];
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
  const storeIsSelected=Boolean(filters.companyId&&filters.storeId);
  const activePackageCount=checkPackages.filter(packageItem=>packageItem.active).length;

  return <div className={embedded?"platform-checks-page":"platform-modal"}><section className={`sa-modal${embedded?" sa-page":""}`}>
    <header className="sa-checks-header"><div><span>ΚΕΝΤΡΟ ΕΛΕΓΧΟΥ ΥΠΕΡΔΙΑΧΕΙΡΙΣΤΗ</span><h2><BarChart3/> Έλεγχοι &amp; Αναλύσεις</h2><p>Έλεγξε ταμείο, POS–EFTPOS και Ταμείο Τράπεζας με ασφάλεια και πλήρη καταγραφή στο Audit.</p></div><div className="sa-header-actions"><div className="sa-readonly-badge"><ShieldCheck/> Μόνο ανάγνωση</div><button type="button" className="sa-close" aria-label="Κλείσιμο ελέγχων και αναλύσεων" onClick={onClose} disabled={busy||reviewBusy}><X/></button></div></header>
    {error&&<div className="platform-alert error">{error}</div>}
    <section className="sa-checks-workspace">
      <div className="sa-workspace-heading"><div><span>1. ΕΠΙΛΟΓΗ ΠΕΔΙΟΥ</span><h3>Διάλεξε κατάστημα και περίοδο</h3></div><p>Η ανάλυση δεν αλλάζει οικονομικά δεδομένα.</p></div>
      <div className="supplier-review-filters sa-checks-filters">
        <label><span><Building2/> Ιδιοκτήτης / εταιρεία</span><select value={filters.companyId} onChange={event=>updateFilters({companyId:event.target.value,storeId:""})}><option value="">Όλοι οι ιδιοκτήτες / εταιρείες</option>{companies.map(company=>{const owner=company.owner?.fullName||company.ownerName||"Χωρίς ιδιοκτήτη";return <option key={company.id} value={company.id}>{owner} · {company.name}</option>})}</select></label>
        <label><span><Store/> Κατάστημα</span><select value={filters.storeId} onChange={event=>selectStore(event.target.value)}><option value="">Όλα τα καταστήματα</option>{visibleStores.map(store=><option key={store.id} value={store.id}>{filters.companyId?store.name:`${store.companyName} · ${store.name}`}</option>)}</select></label>
        <label><span><CalendarDays/> Από</span><input type="date" value={filters.from} max={filters.to||undefined} onChange={event=>updateFilters({from:event.target.value})}/></label>
        <label><span><CalendarDays/> Έως</span><input type="date" value={filters.to} min={filters.from||undefined} onChange={event=>updateFilters({to:event.target.value})}/></label>
        <div className="sa-filter-actions"><button type="button" onClick={run} disabled={busy||reviewBusy}><RefreshCw/>{busy?"Εκτέλεση ελέγχου…":"Εκτέλεση ελέγχου"}<ChevronRight/></button><button type="button" className="secondary" onClick={clear} disabled={busy||reviewBusy}>Καθαρισμός</button></div>
      </div>
    </section>
    <section className="platform-panel sa-package-panel">
      <div className="sa-package-heading"><div><span>2. ΔΙΚΑΙΩΜΑΤΑ ΕΛΕΓΧΟΥ</span><h3>Πακέτα ελέγχων ανά κατάστημα</h3><p>Η ενεργοποίηση καταγράφεται στο Audit και γίνεται μόνο από Υπερδιαχειριστή.</p></div>{storeIsSelected&&<strong className={activePackageCount?"sa-package-count active":"sa-package-count"}>{activePackageCount} / {checkPackages.length||3} ενεργά</strong>}</div>
      {!storeIsSelected?<div className="sa-package-empty"><LockKeyhole/><div><b>Επίλεξε πρώτα ένα συγκεκριμένο κατάστημα</b><span>Τότε θα εμφανιστούν η κατάσταση και οι διαθέσιμες ενέργειες για κάθε πακέτο.</span></div></div>:packagesBusy&&!checkPackages.length?<div className="sa-package-empty">Φόρτωση πακέτων…</div>:<div className="sa-package-grid">{checkPackages.map(packageItem=><article key={packageItem.key} className={`sa-package-card ${packageItem.active?"active":""}`}><div className="sa-package-card-top"><span className="sa-package-icon">{packageItem.active?<Unlock/>:<LockKeyhole/>}</span><small>{packageItem.active?"ΕΝΕΡΓΟ":"ΚΛΕΙΔΩΜΕΝΟ"}</small></div><div><h3>{packageItem.title}</h3><p>{packageItem.description}</p></div><button type="button" onClick={()=>toggleCheckPackage(packageItem)} disabled={!packageItem.canToggle||packagesBusy||busy||reviewBusy}>{packageItem.includedBy?`Περιλαμβάνεται στο ${packageItem.includedByTitle}`:packageItem.active?"Απενεργοποίηση":"Ενεργοποίηση"}</button></article>)}</div>}
    </section>
    <section className="sa-scope-note"><ShieldCheck/><div><b>Τι καλύπτει ο έλεγχος</b><p>Οι ημερομηνίες εφαρμόζονται στις βάρδιες και στις διαφορές ταμείου/POS–EFTPOS. Το Ταμείο Τράπεζας είναι τρέχον λογιστικό υπόλοιπο και φιλτράρεται μόνο ανά ιδιοκτήτη και κατάστημα.</p></div></section>
    {busy&&<section className="platform-panel" style={{marginBottom:14}}><b>Εκτελείται ο έλεγχος…</b><p>Συλλέγονται δεδομένα ανάγνωσης. Δεν αλλάζει βάρδια, ταμείο, τράπεζα, απόθεμα, παραστατικό ή υπόλοιπο.</p></section>}
    {result&&<>
      <section className="platform-panel" style={{marginBottom:14}}><b>{scopeLabel}</b><p>{periodLabel}</p><small>Εκτέλεση: {athensDateTime(result.executedAt)} · Κατάσταση: {premium.enabled?"Τελικό αποτέλεσμα ανά βάρδια για έγκριση":analytics.status||"—"}</small></section>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:14}}>
        <article className="platform-panel"><small>Βάρδιες</small><h3>{totalShifts}</h3></article>
        <article className="platform-panel"><small>Καθαρή διαφορά μετρητών</small><h3>{eur(totalCashVariance)}</h3></article>
        <article className="platform-panel"><small>Διαφορά POS–EFTPOS</small><h3>{eur(totalCardVariance)}</h3></article>
        <article className="platform-panel">{premium.enabled?<><small>Βάρδιες με τελικό αποτέλεσμα</small><h3>{number((premium.shiftResults||[]).length)}</h3><small>{(premium.shiftResults||[]).filter(item=>item.reviewValid).length} εγκεκριμένες · έγκριση ανά βάρδια</small></>:<><small>Εκκρεμή συμβάντα</small><h3>{pendingFindingCount}</h3><small>{reviewedFindingCount} με καταχώριση · {findings.length} συνολικά</small></>}</article>
      </div>
      {!premium.enabled&&<section className="platform-panel" style={{marginBottom:14}}>
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
            {finding.movementEvidence?.length?<BasicShiftEvidence movements={finding.movementEvidence}/>:<small style={{display:"block",marginTop:10,color:"#64748b"}}>Δεν βρέθηκαν κινήσεις StoreTransaction για τη συγκεκριμένη βάρδια.</small>}
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
      </section>}
      <section className="platform-panel" style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><b>COMPLETE · Πληρωμές και παραστατικά</b><p style={{marginBottom:0}}>Έλεγχος μόνο για ανάγνωση σε ενεργές κινήσεις του επιλεγμένου καταστήματος.</p></div><span style={{fontWeight:800,color:complete.enabled?(completeFindings.length?"#9a4b0b":"#08734e"):"#64748b"}}>{complete.enabled?(completeFindings.length?"Χρειάζεται έλεγχο":"ΟΚ"):"Δεν είναι ενεργό"}</span></div>
        {!complete.enabled?<div className="platform-empty">{complete.reason||"Ενεργοποίησε COMPLETE ή PREMIUM Έλεγχο για αυτά τα στοιχεία."}</div>:<><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,margin:"12px 0"}}><article style={{padding:12,border:"1px solid #d7e1ec",borderRadius:10}}><small>Χωρίς παραστατικό</small><h3>{number(complete.withoutEvidenceCount)}</h3></article><article style={{padding:12,border:"1px solid #d7e1ec",borderRadius:10}}><small>Πιθανές διπλές πληρωμές</small><h3>{number(complete.potentialDuplicateCount)}</h3></article></div>{completeFindings.length?<div style={{display:"grid",gap:10}}>{completeFindings.map(finding=><article key={finding.id} style={{border:"1px solid #fed7aa",borderRadius:12,padding:12,background:"#fffdf9"}}><div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><div><small>{finding.code==="PAYMENT_WITHOUT_EVIDENCE"?"Πληρωμή / έξοδο":"Έλεγχος προμηθευτή"}</small><h3 style={{margin:"4px 0"}}>{finding.title}</h3></div><span style={{fontWeight:800,color:"#9a4b0b"}}><AlertTriangle/> Χρειάζεται έλεγχο</span></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:9,marginTop:10}}><span><b>Ημερομηνία</b><small style={{display:"block"}}>{athensDateTime(finding.occurredAt)}</small></span><span><b>Προμηθευτής</b><small style={{display:"block"}}>{finding.supplierName||"—"}</small></span><span><b>Ποσό</b><small style={{display:"block"}}>{eur(finding.amount)}</small></span>{finding.transactionCount&&<span><b>Κινήσεις</b><small style={{display:"block"}}>{finding.transactionCount}</small></span>}<span><b>Χειριστής</b><small style={{display:"block"}}>{finding.actorName||"—"}</small></span></div><CompleteEvidence transactions={finding.evidence?.transactions||[]}/></article>)}</div>:<div className="platform-empty">Δεν βρέθηκαν πληρωμές χωρίς παραστατικό ή πιθανά διπλές πληρωμές στα επιλεγμένα φίλτρα.</div>}</>}
      </section>
      <section className="platform-panel" style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><b>PREMIUM · Τελικό αποτέλεσμα ανά βάρδια</b><p style={{marginBottom:0}}>Πλήρης συσχέτιση πωλήσεων, πληρωμών, ακυρώσεων και audit μέσα στην ίδια κλεισμένη βάρδια. Εσύ εγκρίνεις το τελικό αποτέλεσμα.</p></div><span style={{fontWeight:800,color:premium.enabled?"#08734e":"#64748b"}}>{premium.enabled?"Τελική ανάλυση":"Δεν είναι ενεργό"}</span></div>{!premium.enabled?<div className="platform-empty">{premium.reason}</div>:<><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,margin:"12px 0"}}><article style={{padding:12,border:"1px solid #d7e1ec",borderRadius:10}}><small>Βάρδιες με τελικό αποτέλεσμα</small><h3>{number((premium.shiftResults||[]).length)}</h3></article><article style={{padding:12,border:"1px solid #d7e1ec",borderRadius:10}}><small>Τεκμηριωμένες συσχετίσεις</small><h3>{premiumFindings.length}</h3></article></div>{(premium.shiftResults||[]).length?<div style={{display:"grid",gap:10}}>{premium.shiftResults.map(item=>{const approval={...item,companyId:result.filters.companyId,storeId:result.filters.storeId,eventCode:"PREMIUM_FINAL_RESULT",eventLabel:item.finalLabel,referenceId:item.sessionId};const approvalOpen=reviewingId===findingKey(approval);return <article key={item.sessionId} style={{padding:14,border:"1px solid #b9ead3",borderRadius:12,background:"#f8fffb"}}><div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><div><b>{item.finalLabel}</b><small style={{display:"block",marginTop:5}}>Βάρδια: {item.shiftLabel||"—"} · POS: {item.terminalPos||"—"} · Χειριστής: {item.closedByName||item.openedByName||"—"}</small></div><span style={{fontWeight:800,color:"#08734e"}}><CheckCircle2/> ΤΕΛΙΚΟ</span></div><p style={{margin:"10px 0 0"}}>Στην κλεισμένη βάρδια η καθαρή διαφορά είναι {eur(item.cashVariance)} στα μετρητά και {eur(item.cardVariance)} στο POS–EFTPOS.{item.nextOpenedAt?item.handoverMatched?" Το κλείσιμο συμφωνεί με το άνοιγμα της επόμενης βάρδιας.":" Υπάρχει απόκλιση παράδοσης προς την επόμενη βάρδια, χωρίς αυτόματο συμψηφισμό.":" Δεν υπάρχει επόμενη βάρδια για αντιπαραβολή παράδοσης."}</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:9,marginTop:10}}><span><b>Άνοιγμα</b><small style={{display:"block"}}>{athensDateTime(item.openedAt)}</small></span><span><b>Κλείσιμο</b><small style={{display:"block"}}>{athensDateTime(item.closedAt)}</small></span><span><b>Μετρητά</b><small style={{display:"block"}}>{eur(item.cashVariance)}</small></span><span><b>POS–EFTPOS</b><small style={{display:"block"}}>{eur(item.cardVariance)}</small></span></div>{item.evidence?.length?<PremiumEvidence evidence={item.evidence}/>:<small style={{display:"block",marginTop:10}}>Δεν βρέθηκε πρόσθετη κίνηση που να μεταβάλλει το τελικό αποτέλεσμα της βάρδιας.</small>}{item.reviewValid&&<div style={{marginTop:12,padding:10,borderRadius:9,background:"#ecfdf5",border:"1px solid #b9ead3"}}><b>Εγκεκριμένο τελικό αποτέλεσμα</b><small style={{display:"block",marginTop:4}}>{item.reviewedBy||"Υπερδιαχειριστής"} · {athensDateTime(item.reviewedAt)}</small>{item.reviewNote&&<small style={{display:"block",marginTop:4}}>{item.reviewNote}</small>}</div>}<div style={{display:"flex",justifyContent:"flex-end",marginTop:12}}><button type="button" onClick={()=>openReview(approval)} disabled={reviewBusy} style={{border:0,borderRadius:9,padding:"9px 12px",background:"#147fc1",color:"#fff",fontWeight:800,cursor:"pointer"}}>{item.reviewValid?"Νέα έγκριση":"Έγκριση τελικού αποτελέσματος"}</button></div>{approvalOpen&&<FinalApprovalForm draft={reviewDraft} setDraft={setReviewDraft} busy={reviewBusy} onCancel={cancelReview} onSave={()=>saveReview(approval)}/>}</article>})}</div>:<div className="platform-empty">Δεν υπάρχουν κλεισμένες βάρδιες στα επιλεγμένα φίλτρα.</div>}</>}</section>
      <section className="platform-panel" style={{marginBottom:14}}><b>Ανάλυση ανά κατάστημα</b>{rows.length?rows.map(row=>{const store=storeIndex.get(String(row.storeId));const company=companyIndex.get(String(row.companyId));const needsReview=Math.abs(number(row.cashVariance))>.009||Math.abs(number(row.cardVariance))>.02;return <article key={`${row.companyId}:${row.storeId}`} style={{display:"grid",gridTemplateColumns:"minmax(220px,1fr) repeat(3,minmax(120px,.5fr))",gap:12,alignItems:"center",padding:"13px 0",borderBottom:"1px solid #e2e8f0"}}><div><b>Εταιρεία: {company?.name||store?.companyName||row.companyId}</b><small style={{display:"block"}}>Κατάστημα: {store?.name||row.storeId}</small></div><span>Βάρδιες <b>{number(row.shifts)}</b></span><span>Μετρητά <b>{eur(row.cashVariance)}</b></span><span>{needsReview?<AlertTriangle/>:<CheckCircle2/>} {needsReview?"Υπάρχει απόκλιση":"Συμφωνία"} · POS–EFTPOS {eur(row.cardVariance)}</span></article>}):<div className="platform-empty">Δεν υπάρχουν κλεισμένες βάρδιες για τα επιλεγμένα φίλτρα.</div>}</section>
      <section className="platform-panel" style={{marginBottom:14}}><b>Σύνοψη Εικονικού Ταμείου Τράπεζας</b><p>Λογιστικό: {eur(bank.totals?.projectedBalance)} · Επιβεβαιωμένο: {eur(bank.totals?.availableBalance)} · Σε αναμονή: {eur(bank.totals?.pendingAmount)}</p>{(bank.items||[]).map(item=><small key={item.bankAccountId} style={{display:"block",marginTop:5}}>Εταιρεία: {item.companyName} · Κατάστημα: {item.storeName} · {item.bankName} / {item.accountName}: Λογιστικό {eur(item.projectedBalance)} · Επιβεβαιωμένο {eur(item.availableBalance)} · Σε αναμονή {eur(item.pendingAmount)}</small>)}{bankReviewItems.length?<div style={{marginTop:12,padding:10,borderRadius:9,background:"#eef6ff"}}><b>Εκκρεμείς τραπεζικές εγγραφές που λήφθηκαν υπόψη</b><div style={{display:"grid",gap:7,marginTop:7}}>{bankReviewItems.map(item=><div key={item.id} style={{padding:9,borderRadius:8,background:"#fff",border:"1px solid #cbddeb"}}><small><b>Ώρα:</b> {athensDateTime(item.occurredAt)} · <b>Ποσό:</b> {eur(item.amount)} · <b>Τύπος:</b> {item.type}</small><small style={{display:"block",marginTop:3}}><b>Κατάσταση:</b> {item.status} · <b>Αποδεικτικό:</b> {item.attachmentFilename||"Δεν βρέθηκε συνημμένο αποδεικτικό"}</small><small style={{display:"block",marginTop:3}}><b>Λογαριασμός:</b> {item.bankName||"—"} / {item.accountName||"—"} · <b>Χειριστής:</b> {item.createdByName||"—"}</small><small style={{display:"block",marginTop:3,color:"#64748b"}}>Αναγνωριστικό τραπεζικής εγγραφής: {item.id} · Σχετική κίνηση: {item.sourceTransactionId||"—"}</small></div>)}</div></div>:<small style={{display:"block",marginTop:10,color:"#64748b"}}>Δεν υπάρχουν εκκρεμείς τραπεζικές εγγραφές στα επιλεγμένα φίλτρα.</small>}</section>
      <section className="platform-panel" style={{marginBottom:14}}><b>Εκκρεμείς πληρωμές προμηθευτών και λοιπά έξοδα</b><p>Κάθε στοιχείο δείχνει την πραγματική πληρωμή/έξοδο, το παραστατικό και τους αυτόματους ελέγχους του. Η ανάγνωση δεν εγκρίνει ή αλλάζει κίνηση.</p>{supplierReviewItems.length||expenseReviewItems.length?<div style={{display:"grid",gap:10}}>{supplierReviewItems.map(item=><article key={`supplier:${item.id}`} style={{padding:11,borderRadius:10,border:"1px solid #cbddeb",background:"#f8fbff"}}><b>Πληρωμή προμηθευτή · {item.supplierName||"—"}</b><small style={{display:"block",marginTop:5}}><b>Ώρα:</b> {athensDateTime(item.paidAt||item.occurredAt)} · <b>Ποσό:</b> {eur(item.amount)} · <b>Τρόπος:</b> {item.paymentMethod||"—"}</small><small style={{display:"block",marginTop:3}}><b>Παραστατικό:</b> {item.attachmentFilename||"Δεν βρέθηκε συνημμένο αποδεικτικό"} · <b>Χειριστής:</b> {item.createdByName||"—"}</small><small style={{display:"block",marginTop:3}}><b>Τιμολόγια:</b> {(item.allocations||[]).map(allocation=>`${allocation.documentNumber||allocation.purchaseDocumentId||"Χωρίς αριθμό"} (${eur(allocation.amount)})`).join(" · ")||"Δεν αντιστοιχίστηκε τιμολόγιο"}</small>{item.hasAttachment&&<button type="button" className="secondary" onClick={()=>openSupplierEvidence(item)}>Προβολή αποδεικτικού</button>}{item.automaticCheck?.checks?.map(check=><small key={check} style={{display:"block",marginTop:3,color:"#9a4b0b"}}>• {check}</small>)}<small style={{display:"block",marginTop:3,color:"#64748b"}}>Αναγνωριστικό πληρωμής: {item.id} · Κίνηση: {item.transactionId}</small></article>)}{expenseReviewItems.map(item=><article key={`expense:${item.id}`} style={{padding:11,borderRadius:10,border:"1px solid #cbddeb",background:"#f8fbff"}}><b>Λοιπό έξοδο</b><small style={{display:"block",marginTop:5}}><b>Ώρα:</b> {athensDateTime(item.occurredAt)} · <b>Ποσό:</b> {eur(item.amount)} · <b>Τρόπος:</b> {item.paymentMethod||"—"}</small><small style={{display:"block",marginTop:3}}><b>Αποδεικτικό:</b> {item.attachmentFilename||"Δεν βρέθηκε συνημμένο αποδεικτικό"} · <b>Χειριστής:</b> {item.actorName||"—"}</small><small style={{display:"block",marginTop:3}}><b>Αιτιολογία:</b> {item.description||"Δεν βρέθηκε αιτιολογία"}</small>{item.automaticCheck?.checks?.map(check=><small key={check} style={{display:"block",marginTop:3,color:"#9a4b0b"}}>• {check}</small>)}<small style={{display:"block",marginTop:3,color:"#64748b"}}>Αναγνωριστικό ελέγχου: {item.id} · Κίνηση: {item.transactionId}</small></article>)}</div>:<div className="platform-empty">Δεν υπάρχουν εκκρεμείς πληρωμές προμηθευτών ή λοιπά έξοδα στα επιλεγμένα φίλτρα.</div>}</section>
      <section className="platform-panel"><ShieldCheck/><b> Μόνο για ανάγνωση τα οικονομικά δεδομένα</b><p>Η ανάλυση δεν πραγματοποιεί διορθώσεις και δεν αποδίδει αυτόματα ευθύνη σε εργαζόμενο. Η καταχώριση ελέγχου γράφει μόνο απόφαση, σημείωση, ελεγκτή και χρόνο στο Audit.</p></section>
    </>}
  </section></div>;
}
