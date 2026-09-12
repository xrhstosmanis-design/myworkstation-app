import React,{useEffect,useState} from "react";
import {CheckCircle2,ClipboardList,RefreshCw,RotateCcw} from "lucide-react";
import "./pending-center.css";

const labels={GENERAL:"Γενικό",SHIFT:"Βάρδια",CASH:"Ταμείο",INVOICE:"Τιμολόγιο",PAYMENT:"Πληρωμή",STOCK_SHORTAGE:"Έλλειψη προϊόντος",EQUIPMENT:"Βλάβη",ORDER:"Παραγγελία",ANNOUNCEMENT:"Ανακοίνωση",INCIDENT:"Συμβάν"};

export default function PendingCenterPanel({api,stores=[]}){
  const[rows,setRows]=useState([]),[storeId,setStoreId]=useState(""),[status,setStatus]=useState("OPEN"),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const load=async()=>{setBusy(true);setError("");try{const query=new URLSearchParams({status,...(storeId?{storeId}:{})});const data=await api(`/api/pending-center/chat-tasks?${query}`);setRows(data.rows||[])}catch(e){setError(e.message)}finally{setBusy(false)}};
  useEffect(()=>{load()},[storeId,status]);
  const change=async row=>{setBusy(true);setError("");try{await api(`/api/pending-center/chat-tasks/${encodeURIComponent(row.id)}`,{method:"PATCH",body:JSON.stringify({completed:row.status==="OPEN"})});await load()}catch(e){setError(e.message);setBusy(false)}};
  const openCount=rows.filter(row=>row.status==="OPEN").length;
  return <section className="pending-center">
    <header><div><small>MYWORKSTATION · ΚΕΝΤΡΙΚΟΣ ΕΛΕΓΧΟΣ</small><h2><ClipboardList/>Κέντρο Εκκρεμοτήτων</h2><p>Εκκρεμότητες Chat από όλα τα καταστήματα της εταιρείας.</p></div><button onClick={load} disabled={busy}><RefreshCw/>{busy?"Ανανέωση…":"Ανανέωση"}</button></header>
    <div className="pending-center-filters"><label>Κατάστημα<select value={storeId} onChange={e=>setStoreId(e.target.value)}><option value="">Όλα τα καταστήματα</option>{stores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select></label><label>Κατάσταση<select value={status} onChange={e=>setStatus(e.target.value)}><option value="OPEN">Ανοιχτές</option><option value="COMPLETED">Ολοκληρωμένες</option><option value="ALL">Όλες</option></select></label><strong>{openCount} ανοιχτές · {rows.length} εμφανίζονται</strong></div>
    {error&&<div className="commerce-error">{error}</div>}
    <div className="pending-center-list">{rows.map(row=><article className={row.status==="COMPLETED"?"completed":""} key={row.id}><div><b>{row.storeName} · {labels[row.category]||row.category}</b><p>{row.body||row.title}</p><small>Από: {row.senderName} · {new Date(row.createdAt).toLocaleString("el-GR")}</small>{row.status==="COMPLETED"&&<small>Ολοκληρώθηκε από: {row.completedByName} · {new Date(row.completedAt).toLocaleString("el-GR")}</small>}</div><button onClick={()=>change(row)} disabled={busy}>{row.status==="OPEN"?<CheckCircle2/>:<RotateCcw/>}{row.status==="OPEN"?"Κλείσιμο":"Επαναφορά"}</button></article>)}{!busy&&!rows.length&&<div className="pending-center-empty">Δεν υπάρχουν εκκρεμότητες με αυτά τα φίλτρα.</div>}</div>
  </section>;
}
