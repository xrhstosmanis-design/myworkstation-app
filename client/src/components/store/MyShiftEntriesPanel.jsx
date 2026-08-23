import React,{useEffect,useMemo,useState} from "react";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const when=value=>value?new Date(value).toLocaleString("el-GR",{dateStyle:"short",timeStyle:"short"}):"—";
const paymentTypes=new Set(["SUPPLIER_PAYMENT","OTHER_EXPENSE"]);
const typeLabel=row=>row.type==="SUPPLIER_PAYMENT"?"Πληρωμή προμηθευτή":"Λοιπό έξοδο";
const evidenceLabel=row=>row.evidenceMode==="DOCUMENT"?"Συνδεδεμένο παραστατικό AI Reader":row.evidenceMode==="NO_DOCUMENT"?"Χωρίς παραστατικό · πλήρες audit":"Καταχώριση με φωτογραφία/παραστατικό";
const sourceLabel=row=>row.paymentSource==="CASH_SHIFT"||row.subtractFromShift?"Από μετρητά ενεργής βάρδιας":"Εξωτερική πληρωμή · δεν αφαιρείται από βάρδια";

export default function MyShiftEntriesPanel({api,store,operator}){
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const load=async()=>{
    setLoading(true);setError("");
    try{
      const result=await api(`/api/transactions/stores/${store.id}/overview`);
      const sessionId=result.openSession?.id;
      const operatorId=String(operator?.id||"").trim();
      setRows((result.recent||[]).filter(row=>paymentTypes.has(row.type)&&(!operatorId||String(row.actorId||"").trim()===operatorId)&&(row.sessionId===sessionId||row.paymentSource==="EXTERNAL"||(!row.sessionId&&!row.subtractFromShift))));
    }catch(e){setError(e.message)}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[store.id,operator?.id]);
  const totals=useMemo(()=>rows.filter(row=>!row.reversedAt).reduce((a,row)=>{a.total+=Number(row.amount||0);if(row.type==="SUPPLIER_PAYMENT")a.supplier+=Number(row.amount||0);else a.other+=Number(row.amount||0);if(row.paymentSource==="CASH_SHIFT"||row.subtractFromShift)a.shift+=Number(row.amount||0);else a.external+=Number(row.amount||0);return a},{total:0,supplier:0,other:0,shift:0,external:0}),[rows]);
  return <section className="cloud-panel">
    <div className="cloud-panel-head"><div><h3>Οι πληρωμές μου</h3><p>Μόνο οι δικές μου πληρωμές προμηθευτών και λοιπά έξοδα. Οι πληρωμές της ενεργής βάρδιας και οι εξωτερικές εμφανίζονται χωριστά στο audit.</p></div><button onClick={load} disabled={loading}>Ανανέωση</button></div>
    {error&&<div className="cloud-alert cloud-error">{error}</div>}
    {!loading&&<div className="commerce-cards"><article className="commerce-card"><span>Σύνολο ενεργών</span><strong>{money(totals.total)}</strong></article><article className="commerce-card"><span>Προμηθευτές</span><strong>{money(totals.supplier)}</strong></article><article className="commerce-card"><span>Λοιπά έξοδα</span><strong>{money(totals.other)}</strong></article><article className="commerce-card"><span>Από βάρδια</span><strong>{money(totals.shift)}</strong></article><article className="commerce-card"><span>Εξωτερικά</span><strong>{money(totals.external)}</strong></article></div>}
    {loading?<div className="cloud-loading">Φόρτωση…</div>:rows.length===0?<div className="cloud-empty">Δεν υπάρχουν δικές σου πληρωμές ή έξοδα για την ενεργή εργασία.</div>:<div className="ledger-list">{rows.map(row=><div className={`ledger-row ${row.reversedAt?"reversed":""}`} key={row.id}><div><b>{row.supplierName||row.description||typeLabel(row)}</b><span>{typeLabel(row)} · {when(row.occurredAt)} · {row.actorName}</span><small>{sourceLabel(row)}</small><small>{evidenceLabel(row)}{row.purchaseDocumentId?` · #${String(row.purchaseDocumentId).slice(0,8)}`:""}</small>{row.reversedAt&&<small>ΑΝΤΙΛΟΓΙΣΜΟΣ · {row.reversalReason||"χωρίς αιτιολογία"}</small>}</div><strong>{money(row.amount)}</strong></div>)}</div>}
  </section>;
}
