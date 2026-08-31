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
  const totals=useMemo(()=>({count:items.length,amount:items.reduce((sum,item)=>sum+Number(item.amount||0),0),discrepancies:items.filter(item=>item.status==="DISCREPANCY").length}),[items]);
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
  const review=async(item,status)=>{
    const note=String(notes[item.id]||"").trim();
    if(note.length<3){setError("Γράψε σύντομη σημείωση ελέγχου (τουλάχιστον 3 χαρακτήρες).");return}
    const isConfirm=status==="CONFIRMED";
    if(isConfirm&&!window.confirm(`Επιβεβαίωση πληρωμής ${money(item.amount)} προς ${item.supplierName};\n\nΗ πληρωμή θα υπολογιστεί στην καρτέλα προμηθευτή. Δεν θα γίνει δεύτερη αλλαγή σε ταμείο, τράπεζα ή απόθεμα.`))return;
    setBusy(`${status}:${item.id}`);setError("");
    try{
      await request(`/api/transactions/supplier-settlements/${encodeURIComponent(item.id)}/review`,{method:"POST",body:JSON.stringify({status,note})});
      setMessage(isConfirm?`Επιβεβαιώθηκε η πληρωμή προς ${item.supplierName}. Η καρτέλα προμηθευτή ενημερώθηκε.`:`Η πληρωμή προς ${item.supplierName} σημειώθηκε με απόκλιση και παραμένει δεσμευμένη για έλεγχο.`);
      await load();
    }catch(err){setError(err.message)}finally{setBusy("")}
  };

  return <div className="platform-modal"><section className="platform-security-dialog supplier-settlement-review-dialog">
    <button type="button" className="modal-close" onClick={onClose}><X/></button>
    <div className="supplier-review-head"><div><span>ΜΟΝΟ ΥΠΕΡΔΙΑΧΕΙΡΙΣΤΗ</span><h2>Έλεγχος πληρωμών προμηθευτών</h2><p>Επιβεβαίωσε το αποδεικτικό πριν μειωθεί η οφειλή του προμηθευτή. Το ταμείο, η τράπεζα και η αποθήκη δεν αλλάζουν ξανά εδώ.</p></div><button type="button" className="secondary" onClick={load} disabled={loading||Boolean(busy)}><RefreshCw/>Ανανέωση</button></div>
    {error&&<div className="platform-alert error">{error}</div>}
    <div className="supplier-review-filters"><label>Ιδιοκτήτης / εταιρεία<select value={filters.companyId} onChange={event=>updateFilter("companyId",event.target.value)}><option value="">Όλοι οι ιδιοκτήτες / εταιρείες</option>{companies.map(company=><option key={company.id} value={company.id}>{company.ownerName||"Χωρίς ιδιοκτήτη"} · {company.name}</option>)}</select></label><label>Κατάστημα<select value={filters.storeId} onChange={event=>updateFilter("storeId",event.target.value)}><option value="">Όλα τα καταστήματα</option>{visibleStores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select></label><label>Από<input type="date" value={filters.from} onChange={event=>updateFilter("from",event.target.value)}/></label><label>Έως<input type="date" value={filters.to} onChange={event=>updateFilter("to",event.target.value)}/></label><button type="button" onClick={load} disabled={loading||Boolean(busy)}><RefreshCw/>Εμφάνιση</button></div>
    <div className="supplier-review-totals"><span><small>Για έλεγχο</small><b>{totals.count}</b></span><span><small>Σύνολο δεσμεύσεων</small><b>{money(totals.amount)}</b></span><span className={totals.discrepancies?"warning":""}><small>Με απόκλιση</small><b>{totals.discrepancies}</b></span></div>
    <div className="supplier-review-list">{loading?<div className="platform-empty">Φόρτωση πληρωμών…</div>:items.length===0?<div className="platform-empty"><CheckCircle2/>Δεν υπάρχουν πληρωμές προμηθευτών για έλεγχο.</div>:items.map(item=><article key={item.id} className={item.status==="DISCREPANCY"?"discrepancy":""}>
      <header><div><span className={`supplier-review-status ${item.status==="DISCREPANCY"?"discrepancy":"pending"}`}>{item.status==="DISCREPANCY"?"ΑΠΟΚΛΙΣΗ":"ΣΕ ΑΝΑΜΟΝΗ ΕΛΕΓΧΟΥ"}</span><h3>{item.supplierName}</h3><small>{item.ownerName||"Χωρίς ιδιοκτήτη"} · {item.companyName} · {item.storeName}<br/>Καταχώριση {dateTime(item.createdAt)} · πραγματική πληρωμή {dateTime(item.paidAt)} · {item.createdByName||"—"}</small></div><strong>{money(item.amount)}</strong></header>
      <div className="supplier-review-meta"><span><b>Τρόπος:</b> {paymentMethod[item.paymentMethod]||item.paymentMethod}</span><span><b>Αποδεικτικό:</b> {item.attachmentFilename||"—"}</span></div>
      <div className="supplier-review-invoices"><b>Τιμολόγια που καλύπτει</b><div>{(item.allocations||[]).map(allocation=><span key={allocation.purchaseDocumentId}>{allocation.documentNumber||"Χωρίς αριθμό"} · {money(allocation.amount)}</span>)}</div></div>
      {item.note&&<p className="supplier-review-operator-note"><b>Σημείωση χειριστή:</b> {item.note}</p>}
      <label className="supplier-review-note">Σημείωση ελέγχου<textarea value={notes[item.id]||""} onChange={event=>changeNote(item.id,event.target.value)} maxLength="500" placeholder="π.χ. Επιβεβαιώθηκε ποσό, προμηθευτής και ημερομηνία αποδεικτικού."/></label>
      <footer><button type="button" className="secondary" onClick={()=>openEvidence(item)} disabled={busy===`evidence:${item.id}`}><FileText/>{busy===`evidence:${item.id}`?"Άνοιγμα…":"Προβολή αποδεικτικού"}</button><button type="button" className="warning" onClick={()=>review(item,"DISCREPANCY")} disabled={Boolean(busy)}><AlertTriangle/>Απόκλιση</button><button type="button" onClick={()=>review(item,"CONFIRMED")} disabled={Boolean(busy)}><ShieldCheck/>Επιβεβαίωση</button></footer>
    </article>)}</div>
  </section></div>;
}
