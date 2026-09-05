import React,{useEffect,useMemo,useState} from "react";
import {Eye,Inbox,RefreshCw,RotateCw,Search} from "lucide-react";
import "./invoice-inbox.css";
import {matchesGreekSearch} from "../../utils/greek-search.js";

const labels={RECEIVED:"Αρχειοθετήθηκε",IN_REVIEW:"Σε έλεγχο",PROCESSED:"Ελεγμένο"};
const when=value=>value?new Date(value).toLocaleString("el-GR"):"—";
const dayKey=value=>{if(!value)return "Χωρίς ημερομηνία";const d=new Date(value);return Number.isNaN(d.getTime())?"Χωρίς ημερομηνία":d.toLocaleDateString("el-GR",{year:"numeric",month:"2-digit",day:"2-digit"})};
const isoDay=value=>{if(!value)return "";const d=new Date(value);return Number.isNaN(d.getTime())?"":d.toISOString().slice(0,10)};

export default function InvoiceInboxPanel({api,stores=[],onOpenAi}){
  const [storeId,setStoreId]=useState(stores[0]?.id||"");
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [supplierFilter,setSupplierFilter]=useState("");
  const [dateFilter,setDateFilter]=useState("");
  const [workingId,setWorkingId]=useState("");
  const [message,setMessage]=useState("");
  useEffect(()=>{if(!storeId&&stores[0])setStoreId(stores[0].id)},[stores,storeId]);
  const load=async()=>{if(!storeId)return;setLoading(true);setError("");try{setItems(await api(`/api/commerce/documents/inbox?storeId=${encodeURIComponent(storeId)}`))}catch(err){setError(err.message)}finally{setLoading(false)}};
  useEffect(()=>{load()},[storeId]);
  const supplierOptions=useMemo(()=>[...new Set(items.map(x=>x.supplierName).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"el")),[items]);
  const filtered=useMemo(()=>items.filter(item=>{
    if(supplierFilter&&item.supplierName!==supplierFilter)return false;
    if(dateFilter&&isoDay(item.receivedAt)!==dateFilter)return false;
    return matchesGreekSearch(query,[item.supplierName,item.filename,item.note,item.responsibleName,dayKey(item.receivedAt)]);
  }),[items,query,supplierFilter,dateFilter]);
  const groups=useMemo(()=>{const supplierMap=new Map();for(const item of filtered){const supplier=item.supplierName||"Χωρίς αντιστοίχιση προμηθευτή";if(!supplierMap.has(supplier))supplierMap.set(supplier,new Map());const days=supplierMap.get(supplier),day=dayKey(item.receivedAt);if(!days.has(day))days.set(day,[]);days.get(day).push(item)}return [...supplierMap.entries()].sort((a,b)=>a[0].localeCompare(b[0],"el")).map(([supplier,days])=>({supplier,days:[...days.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([day,rows])=>({day,rows:rows.sort((a,b)=>new Date(b.receivedAt||0)-new Date(a.receivedAt||0))}))}))},[filtered]);
  const view=async item=>{try{const result=await api(`/api/commerce/documents/inbox/${item.id}/file`);const popup=window.open();if(!popup)return;popup.document.write(result.mimeType==="application/pdf"?`<title>${result.filename}</title><iframe src="${result.dataUrl}" style="border:0;width:100vw;height:100vh"></iframe>`:`<title>${result.filename}</title><img src="${result.dataUrl}" style="max-width:100%;height:auto;display:block;margin:auto">`)}catch(err){setError(err.message)}};
  const reprocess=async item=>{setWorkingId(item.id);setError("");setMessage("");try{const prepared=await api(`/api/commerce/documents/inbox/${item.id}/reprocess`,{method:"POST",body:"{}"});let lineCount=Number(prepared.productLineCount||0);if(prepared.needsRecheck){const ai=await api(`/api/commerce/ai-reader/jobs/${prepared.jobId}/ai-recheck`,{method:"POST",body:JSON.stringify({force:true})});lineCount=Array.isArray(ai?.result?.productLines)?ai.result.productLines.length:0}await api(`/api/commerce/documents/inbox/${item.id}`,{method:"PATCH",body:JSON.stringify({status:"IN_REVIEW",note:`✅ Αναγνώριση ολοκληρώθηκε • ${lineCount} γραμμές • AI job ${prepared.jobId} • χωρίς νέα πληρωμή`})});setMessage(`Το παλιό τιμολόγιο αναγνώστηκε ξανά με ${lineCount} γραμμές. Άνοιξε τον έλεγχο και την αντιστοίχιση προϊόντων.`);await load();onOpenAi?.(prepared.jobId)}catch(err){setError(err.message||"Η επανεπεξεργασία απέτυχε.")}finally{setWorkingId("")}};
  return <div className="invoice-inbox">
    <section className="invoice-inbox-head"><div><h2><Inbox/>Θυρίδα Τιμολογίων / Αρχείο</h2><p>Ηλεκτρονικό αρχείο φωτογραφιών και PDF. Δεν είναι η ροή καταχώρισης: τα τιμολόγια μπαίνουν εδώ αυτόματα από το module παραλαβής/ανάγνωσης.</p></div><div><select value={storeId} onChange={e=>setStoreId(e.target.value)}>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button onClick={load}><RefreshCw/>Ανανέωση</button></div></section>
    {error&&<div className="commerce-error">{error}</div>}{message&&<div className="commerce-success">{message}</div>}
    <section className="commerce-box"><h3><Search style={{width:17,verticalAlign:"middle"}}/> Αναζήτηση τιμολογίων</h3><div className="invoice-archive-filters"><label>Προμηθευτής<select value={supplierFilter} onChange={e=>setSupplierFilter(e.target.value)}><option value="">Όλοι οι προμηθευτές</option>{supplierOptions.map(name=><option key={name} value={name}>{name}</option>)}</select></label><label>Ημερομηνία<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label><label>Αριθμός τιμολογίου / όνομα αρχείου / λέξη<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="π.χ. 12548 ή Coca Cola"/></label><button type="button" onClick={()=>{setSupplierFilter("");setDateFilter("");setQuery("")}}>Καθαρισμός</button></div><small>Βρέθηκαν {filtered.length} από {items.length} αρχειοθετημένα παραστατικά.</small></section>
    <section className="commerce-box"><h3>Ανά προμηθευτή → ανά ημέρα</h3>{loading?<div>Φόρτωση…</div>:groups.length===0?<div className="invoice-empty">Δεν βρέθηκαν τιμολόγια με αυτά τα φίλτρα.</div>:<div className="invoice-supplier-groups">{groups.map(group=><section className="invoice-supplier-group" key={group.supplier}><header><b>{group.supplier}</b><span>{group.days.reduce((n,d)=>n+d.rows.length,0)} παραστατικά</span></header>{group.days.map(day=><div className="invoice-day-group" key={day.day}><h4>{day.day}<span>{day.rows.length}</span></h4><div className="invoice-list">{day.rows.map(item=><article key={item.id}><div className="invoice-main"><b>{item.filename||"Παραστατικό"}</b><small>{when(item.receivedAt)}</small>{item.responsibleName&&<small>Υπεύθυνος: {item.responsibleName}</small>}{item.supplierId&&<small>Κωδικός προμηθευτή: {item.supplierId}</small>}{item.note&&<p>{item.note}</p>}</div><div className="invoice-actions"><em className={item.status}>{labels[item.status]||item.status}</em>{item.hasAttachment&&<button onClick={()=>view(item)}><Eye/>Προβολή φωτογραφίας/PDF</button>}{item.hasAttachment&&item.status!=="PROCESSED"&&<button onClick={()=>reprocess(item)} disabled={workingId===item.id}><RotateCw/>{workingId===item.id?"Αναγνώριση γραμμών…":"Επανεπεξεργασία γραμμών"}</button>}</div></article>)}</div></div>)}</section>)}</div>}</section>
  </div>;
}
