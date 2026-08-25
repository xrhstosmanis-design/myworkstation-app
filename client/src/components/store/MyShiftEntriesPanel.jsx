import React,{useEffect,useMemo,useState} from "react";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const when=value=>value?new Date(value).toLocaleString("el-GR",{dateStyle:"short",timeStyle:"short"}):"—";
const paymentTypes=new Set(["SUPPLIER_PAYMENT","OTHER_EXPENSE"]);
const typeLabel=row=>row.type==="SUPPLIER_PAYMENT"?"Πληρωμή προμηθευτή":"Λοιπό έξοδο";
const evidenceLabel=row=>row.evidenceMode==="DOCUMENT"?"Συνδεδεμένο παραστατικό AI Reader":row.evidenceMode==="NO_DOCUMENT"?"Χωρίς παραστατικό · πλήρες audit":"Καταχώριση με φωτογραφία/παραστατικό";

export default function MyShiftEntriesPanel({api,store,operator}){
  const [rows,setRows]=useState([]),[access,setAccess]=useState({canReverse:false}),[loading,setLoading]=useState(true),[busyId,setBusyId]=useState(""),[error,setError]=useState("");
  const load=async()=>{
    setLoading(true);setError("");
    try{
      const result=await api(`/api/transactions/stores/${store.id}/overview`);
      const sessionId=String(result.openSession?.id||"").trim();
      const operatorId=String(operator?.id||"").trim();
      setAccess(result.access||{canReverse:false});
      // FINAL SHIFT BOUNDARY: POS "Οι πληρωμές μου" contains only this operator's
      // supplier/other-expense entries that belong to the CURRENT OPEN shift.
      // Closed-shift and EXTERNAL history remains available only in BackOffice/Audit.
      if(!sessionId){setRows([]);return}
      setRows((result.recent||[]).filter(row=>paymentTypes.has(row.type)&&String(row.sessionId||"").trim()===sessionId&&(!operatorId||String(row.actorId||"").trim()===operatorId)));
    }catch(e){setError(e.message);setRows([])}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[store.id,operator?.id]);
  const reverse=async row=>{
    if(row.reversedAt||!access.canReverse)return;
    const reason=window.prompt(`Αιτιολογία αντιλογισμού για ${money(row.amount)}:`);
    if(reason===null)return;
    if(String(reason).trim().length<3){setError("Η αιτιολογία αντιλογισμού πρέπει να έχει τουλάχιστον 3 χαρακτήρες.");return}
    setBusyId(row.id);setError("");
    try{
      await api(`/api/transactions/${row.id}/reverse`,{method:"POST",body:JSON.stringify({reason:String(reason).trim()})});
      await load();
    }catch(e){setError(e.message)}finally{setBusyId("")}
  };
  const totals=useMemo(()=>rows.filter(row=>!row.reversedAt).reduce((a,row)=>{a.total+=Number(row.amount||0);if(row.type==="SUPPLIER_PAYMENT")a.supplier+=Number(row.amount||0);else a.other+=Number(row.amount||0);return a},{total:0,supplier:0,other:0}),[rows]);
  return <section className="cloud-panel">
    <div className="cloud-panel-head"><div><h3>Οι πληρωμές μου</h3><p>Μόνο οι δικές μου πληρωμές προμηθευτών και λοιπά έξοδα της ενεργής βάρδιας. Με το κλείσιμο της βάρδιας η προβολή μηδενίζει οριστικά· το ιστορικό παραμένει μόνο στο BackOffice / Audit.</p></div><button onClick={load} disabled={loading}>Ανανέωση</button></div>
    {error&&<div className="cloud-alert cloud-error">{error}</div>}
    {!loading&&<div className="commerce-cards"><article className="commerce-card"><span>Σύνολο ενεργής βάρδιας</span><strong>{money(totals.total)}</strong></article><article className="commerce-card"><span>Προμηθευτές</span><strong>{money(totals.supplier)}</strong></article><article className="commerce-card"><span>Λοιπά έξοδα</span><strong>{money(totals.other)}</strong></article></div>}
    {loading?<div className="cloud-loading">Φόρτωση…</div>:rows.length===0?<div className="cloud-empty">Δεν υπάρχουν δικές σου πληρωμές ή έξοδα στην ενεργή βάρδια.</div>:<div className="ledger-list">{rows.map(row=><div className={`ledger-row ${row.reversedAt?"reversed":""}`} key={row.id}><div><b>{row.supplierName||row.description||typeLabel(row)}</b><span>{typeLabel(row)} · {when(row.occurredAt)} · {row.actorName}</span><small>Ενεργή βάρδια</small><small>{evidenceLabel(row)}{row.purchaseDocumentId?` · #${String(row.purchaseDocumentId).slice(0,8)}`:""}</small>{row.reversedAt&&<small>ΑΝΤΙΛΟΓΙΣΜΟΣ · {row.reversalReason||"χωρίς αιτιολογία"}</small>}</div><div style={{display:"flex",alignItems:"center",gap:10}}><strong>{money(row.amount)}</strong>{access.canReverse&&!row.reversedAt&&<button type="button" disabled={busyId===row.id} onClick={()=>reverse(row)}>{busyId===row.id?"Αντιλογισμός…":"Αντιλογισμός"}</button>}</div></div>)}</div>}
  </section>;
}
