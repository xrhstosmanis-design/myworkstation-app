import React,{useEffect,useMemo,useState} from "react";
import {AlertTriangle,CheckCircle2,FileText,RefreshCw,ShieldCheck,X} from "lucide-react";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const dateTime=value=>value?new Intl.DateTimeFormat("el-GR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value)):"—";
const paymentMethod={CASH_SHIFT:"Μετρητά ενεργής βάρδιας",CORPORATE_CARD:"Εταιρική κάρτα",BANK_TRANSFER:"Τραπεζική μεταφορά",EMPLOYEE_REIMBURSEMENT:"Πληρωμή υπαλλήλου προς επιστροφή"};

export default function SupplierSettlementReviewCenter({request,onClose,setMessage}){
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notes,setNotes]=useState({});
  const [companies,setCompanies]=useState([]);
  const [stores,setStores]=useState([]);
  const [filters,setFilters]=useState({companyId:"",storeId:"",from:"",to:""});

  const load=async()=>{
    setLoading(true);setError("");
    try{
      const query=new URLSearchParams(Object.entries(filters).filter(([,value])=>value));
      const result=await request(`/api/transactions/supplier-settlements/review${query.size?`?${query}`:""}`);
      setItems(result.items||[]);
      setCompanies(result.companies||[]);setStores(result.stores||[]);
    }catch(err){setError(err.message)}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[]);
  const totals=useMemo(()=>({count:items.length,amount:items.reduce((sum,item)=>sum+Number(item.amount||0),0),discrepancies:items.filter(item=>item.automaticCheck?.matched===false).length}),[items]);
  const changeNote=(id,value)=>setNotes(current=>({...current,[id]:value}));
  const updateFilter=(key,value)=>setFilters(current=>({...current,[key]:value,...(key==="companyId"?{storeId:""}:{})}));
  const visibleStores=stores.filter(store=>!filters.companyId||store.companyId===filters.companyId);
  const openEvidence=async item=>{
    const key=`evidence:${item.id}`;setBusy(key);setError("");
    try{
      const result=await request(`/api/transactions/${encodeURIComponent(item.transactionId)}/attachment`);
      const link=document.createElement("a");link.href=result.dataUrl;link.target="_blank";link.rel="noreferrer";link.click();
    }catch(err){setError(err.message)}finally{setBusy("")}
  };
  const review=async item=>{
    const note=String(notes[item.id]||"").trim();
    setBusy(`confirm:${item.id}`);setError("");
    try{
      await request(`/api/transactions/supplier-settlements/${encodeURIComponent(item.id)}/review`,{method:"POST",body:JSON.stringify({note})});
      setMessage(`Επιβεβαιώθηκε η πληρωμή προς ${item.supplierName}. Η καρτέλα προμηθευτή ενημερώθηκε μία φορά.`);
      await load();
    }catch(err){setError(err.message)}finally{setBusy("")}
  };

  return <div className="platform-modal"><section className="platform-security-dialog supplier-settlement-review-dialog">
    <button type="button" className="modal-close" onClick={onClose}><X/></button>
    <div className="supplier-review-head"><div><span>ΜΟΝΟ ΥΠΕΡΔΙΑΧΕΙΡΙΣΤΗ</span><h2>Έλεγχος πληρωμών προμηθευτών</h2><p>Ο έλεγχος αντιστοιχίζει αυτόματα πληρωμή, αποδεικτικό και τιμολόγια. Εσύ επιβεβαιώνεις το αποτέλεσμα και προαιρετικά προσθέτεις παρατήρηση.</p></div><button type="button" className="secondary" onClick={load} disabled={loading||Boolean(busy)}><RefreshCw/>Ανανέωση</button></div>
    {error&&<div className="platform-alert error">{error}</div>}
    <div className="supplier-review-filters"><label>Ιδιοκτήτης / εταιρεία<select value={filters.companyId} onChange={event=>updateFilter("companyId",event.target.value)}><option value="">Όλοι οι ιδιοκτήτες / εταιρείες</option>{companies.map(company=><option key={company.id} value={company.id}>{company.ownerName||"Χωρίς ιδιοκτήτη"} · {company.name}</option>)}</select></label><label>Κατάστημα<select value={filters.storeId} onChange={event=>updateFilter("storeId",event.target.value)}><option value="">Όλα τα καταστήματα</option>{visibleStores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select></label><label>Από<input type="date" value={filters.from} onChange={event=>updateFilter("from",event.target.value)}/></label><label>Έως<input type="date" value={filters.to} onChange={event=>updateFilter("to",event.target.value)}/></label><button type="button" onClick={load} disabled={loading||Boolean(busy)}><RefreshCw/>Εμφάνιση</button></div>
    <div className="supplier-review-totals"><span><small>Για έλεγχο</small><b>{totals.count}</b></span><span><small>Σύνολο δεσμεύσεων</small><b>{money(totals.amount)}</b></span><span className={totals.discrepancies?"warning":""}><small>Με απόκλιση</small><b>{totals.discrepancies}</b></span></div>
    <div className="supplier-review-list">{loading?<div className="platform-empty">Φόρτωση πληρωμών…</div>:items.length===0?<div className="platform-empty"><CheckCircle2/>Δεν υπάρχουν πληρωμές προμηθευτών για έλεγχο.</div>:items.map(item=>{const matched=item.automaticCheck?.matched===true;const checks=item.automaticCheck?.checks||[];return <article key={item.id} className={matched?"":"discrepancy"}>
      <header><div><span className={`supplier-review-status ${matched?"confirmed":"discrepancy"}`}>{matched?"ΑΥΤΟΜΑΤΗ ΣΥΜΦΩΝΙΑ":"ΑΠΟΚΛΙΣΗ ΠΡΟΣ ΕΠΙΒΕΒΑΙΩΣΗ"}</span><h3>{item.supplierName}</h3><small>{item.ownerName||"Χωρίς ιδιοκτήτη"} · {item.companyName} · {item.storeName}<br/>Καταχώριση {dateTime(item.createdAt)} · πραγματική πληρωμή {dateTime(item.paidAt)} · {item.createdByName||"—"}</small></div><strong>{money(item.amount)}</strong></header>
      <div className="supplier-review-meta"><span><b>Τρόπος:</b> {paymentMethod[item.paymentMethod]||item.paymentMethod}</span><span><b>Αποδεικτικό:</b> {item.attachmentFilename||"Δεν υπάρχει"}</span></div>
      <div className="supplier-review-invoices"><b>Τιμολόγια που αντιστοιχίστηκαν</b><div>{(item.allocations||[]).map(allocation=><span key={allocation.purchaseDocumentId}>{allocation.documentNumber||"Χωρίς αριθμό"} · {money(allocation.amount)}</span>)}</div></div>
      <div className="supplier-review-meta"><span><b>Αποτέλεσμα αυτόματου ελέγχου:</b> {matched?`Συμφωνία ποσού ${money(item.automaticCheck?.allocationTotal)} με την πληρωμή.`:checks.join(" ")}</span></div>
      {item.note&&<p className="supplier-review-operator-note"><b>Σημείωση χειριστή:</b> {item.note}</p>}
      <label className="supplier-review-note">Παρατήρηση Υπερδιαχειριστή (προαιρετική)<textarea value={notes[item.id]||""} onChange={event=>changeNote(item.id,event.target.value)} maxLength="500" placeholder="Προαιρετική παρατήρηση για τον έλεγχο."/></label>
      <footer><button type="button" className="secondary" onClick={()=>openEvidence(item)} disabled={busy===`evidence:${item.id}`}><FileText/>{busy===`evidence:${item.id}`?"Άνοιγμα…":"Προβολή αποδεικτικού"}</button><button type="button" onClick={()=>review(item)} disabled={Boolean(busy)}><ShieldCheck/>Επιβεβαίωση ελέγχου</button></footer>
    </article>})}</div></div>
  </section></div>;
}
