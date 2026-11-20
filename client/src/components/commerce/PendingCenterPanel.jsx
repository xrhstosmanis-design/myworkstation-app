import React,{useEffect,useRef,useState} from "react";
import {CheckCircle2,ClipboardList,RefreshCw,RotateCcw} from "lucide-react";
import "./pending-center.css";
import PendingSourcesPanel from "./PendingSourcesPanel.jsx";

const labels={GENERAL:"Γενικό",SHIFT:"Βάρδια",CASH:"Ταμείο",INVOICE:"Τιμολόγιο",PAYMENT:"Πληρωμή",STOCK_SHORTAGE:"Έλλειψη προϊόντος",EQUIPMENT:"Βλάβη",ORDER:"Παραγγελία",ANNOUNCEMENT:"Ανακοίνωση",INCIDENT:"Συμβάν"};

export default function PendingCenterPanel({api,stores=[],modules=[],onOpenSource,scopeStoreId,companyId,readOnly=false}){
  const[storedRows,setRows]=useState([]),[selectedStoreId,setStoreId]=useState(scopeStoreId??""),[status,setStatus]=useState("OPEN"),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [sourcesAllowed,setSourcesAllowed]=useState(false);
  const storeId=scopeStoreId??selectedStoreId;
  const sequence=useRef(0),currentScope=useRef("");
  const scope=JSON.stringify([companyId,storeId,status,readOnly]);currentScope.current=scope;
  const [loadedScope,setLoadedScope]=useState("");
  const rows=loadedScope===scope?storedRows:[];
  const load=async()=>{
    const own=scope,current=++sequence.current;
    setRows([]);setLoadedScope("");setSourcesAllowed(false);setError("");
    if((scopeStoreId!==undefined&&!storeId)||(readOnly&&(!storeId||!companyId))){setBusy(false);setError("Επιλέξτε διαθέσιμο κατάστημα στην Εμπορική λειτουργία.");return}
    setBusy(true);
    try{
      const query=new URLSearchParams({status,...(storeId?{storeId}:{})});
      const data=await api(`/api/pending-center/chat-tasks?${query}`);
      if(current!==sequence.current||own!==currentScope.current)return;
      if(readOnly&&(data?.companyId!==companyId||data.storeId!==storeId||!Array.isArray(data.rows)||data.rows.some(row=>row.storeId!==storeId)))throw Error("Δεν επιβεβαιώθηκε το κατάστημα των εκκρεμοτήτων.");
      setRows(data.rows||[]);setLoadedScope(own);setSourcesAllowed(!readOnly);
    }catch(e){if(current===sequence.current&&own===currentScope.current)setError(e.message)}
    finally{if(current===sequence.current&&own===currentScope.current)setBusy(false)}
  };
  useEffect(()=>{load();return()=>{sequence.current++}},[api,storeId,status,companyId,readOnly]);
  const change=async row=>{if(readOnly)return;setBusy(true);setError("");try{await api(`/api/pending-center/chat-tasks/${encodeURIComponent(row.id)}`,{method:"PATCH",body:JSON.stringify({completed:row.status==="OPEN"})});await load()}catch(e){setError(e.message);setBusy(false)}};
  const openCount=rows.filter(row=>row.status==="OPEN").length;
  return <section className="pending-center">
    <header><div><small>MYWORKSTATION · ΚΕΝΤΡΙΚΟΣ ΕΛΕΓΧΟΣ</small><h2><ClipboardList/>Κέντρο Εκκρεμοτήτων{readOnly?" · Chat":""}</h2><p>{scopeStoreId!==undefined?"Εκκρεμότητες του επιλεγμένου καταστήματος.":"Εκκρεμότητες Chat από όλα τα καταστήματα της εταιρείας."}</p></div><button onClick={load} disabled={busy}><RefreshCw/>{busy?"Ανανέωση…":"Ανανέωση"}</button></header>
    <div className="pending-center-filters"><label>Κατάστημα<select value={storeId} disabled={scopeStoreId!==undefined} onChange={e=>setStoreId(e.target.value)}>{scopeStoreId===undefined&&<option value="">Όλα τα καταστήματα</option>}{stores.filter(store=>scopeStoreId===undefined||store.id===scopeStoreId).map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select></label><label>Κατάσταση Chat<select value={status} onChange={e=>setStatus(e.target.value)}><option value="OPEN">Ανοιχτές</option><option value="COMPLETED">Ολοκληρωμένες</option><option value="ALL">Όλες</option></select></label><strong>{openCount} ανοιχτές · {rows.length} εμφανίζονται</strong></div>
    {error&&<div className="commerce-error" role="alert">{error}</div>}
    <div className="pending-center-list">{rows.map(row=><article className={row.status==="COMPLETED"?"completed":""} key={row.id}><div><b>{row.storeName} · {labels[row.category]||row.category}</b><p>{row.body||row.title}</p><small>Από: {row.senderName} · {new Date(row.createdAt).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false})}</small>{row.status==="COMPLETED"&&<small>Ολοκληρώθηκε από: {row.completedByName} · {new Date(row.completedAt).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false})}</small>}</div>{!readOnly&&<button onClick={()=>change(row)} disabled={busy}>{row.status==="OPEN"?<CheckCircle2/>:<RotateCcw/>}{row.status==="OPEN"?"Κλείσιμο":"Επαναφορά"}</button>}</article>)}{!busy&&!rows.length&&<div className="pending-center-empty">Δεν υπάρχουν εκκρεμότητες με αυτά τα φίλτρα.</div>}</div>
    {sourcesAllowed&&!readOnly&&<PendingSourcesPanel api={api} stores={stores} storeId={storeId} modules={modules} onOpenSource={onOpenSource}/>}
  </section>;
}
