import React,{useEffect,useState} from "react";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const when=value=>value?new Date(value).toLocaleString("el-GR",{dateStyle:"short",timeStyle:"short"}):"—";

export default function MyShiftEntriesPanel({api,store}){
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const load=async()=>{
    setLoading(true);setError("");
    try{const result=await api(`/api/transactions/stores/${store.id}/overview`);setRows(result.recent||[])}
    catch(e){setError(e.message)}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[store.id]);
  return <section className="cloud-panel">
    <div className="cloud-panel-head"><div><h3>Οι πληρωμές μου</h3><p>Προσωπικό ιστορικό καταχωρίσεων της βάρδιας με πλήρες audit.</p></div><button onClick={load} disabled={loading}>Ανανέωση</button></div>
    {error&&<div className="cloud-alert cloud-error">{error}</div>}
    {loading?<div className="cloud-loading">Φόρτωση…</div>:rows.length===0?<div className="cloud-empty">Δεν υπάρχουν καταχωρίσεις.</div>:<div className="ledger-list">{rows.map(row=><div className={`ledger-row ${row.reversedAt?"reversed":""}`} key={row.id}><div><b>{row.supplierName||row.description||row.type}</b><span>{when(row.occurredAt)} · {row.actorName}</span><small>{row.evidenceMode==="DOCUMENT"?"Συνδεδεμένο παραστατικό":row.evidenceMode==="NO_DOCUMENT"?"Χωρίς παραστατικό · πλήρες audit":"Καταχώριση βάρδιας"}</small></div><strong>{money(row.amount)}</strong></div>)}</div>}
  </section>;
}
