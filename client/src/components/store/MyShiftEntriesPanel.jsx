import React,{useEffect,useMemo,useRef,useState} from "react";

import PaymentAmountCorrectionAction from "./PaymentAmountCorrectionAction.jsx";
import "./my-shift-entries.css";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const when=value=>value?new Date(value).toLocaleString("el-GR",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Athens",hour12:false}):"—";
const paymentTypes=new Set(["SUPPLIER_PAYMENT","OTHER_EXPENSE"]);
const typeLabel=row=>row.type==="SUPPLIER_PAYMENT"?"Πληρωμή προμηθευτή":"Λοιπό έξοδο";
const evidenceLabel=row=>row.evidenceMode==="DOCUMENT"?"Συνδεδεμένο παραστατικό από ανάγνωση":row.evidenceMode==="NO_DOCUMENT"?"Χωρίς παραστατικό · πλήρες audit":"Καταχώριση με φωτογραφία/παραστατικό";

export default function MyShiftEntriesPanel({api,store,operator,refreshKey=0,onChanged}){
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const version=useRef(0);
  const load=async()=>{
    const current=++version.current;
    setLoading(true);setError("");
    try{
      const result=await api(`/api/transactions/stores/${store.id}/overview`);
      if(current!==version.current)return;
      if(result.store?.id!==store.id)throw Error("Η απάντηση δεν αντιστοιχεί στο κατάστημα.");
      const sessionId=result.openSession?.id;
      const operatorId=String(operator?.id||"").trim();
      // FINAL SHIFT BOUNDARY: POS "Οι πληρωμές μου" contains only this operator's
      // supplier/other-expense entries that belong to the CURRENT OPEN shift.
      // Closed-shift and EXTERNAL history remains available only in BackOffice/Audit.
      if(!sessionId){setRows([]);return}
      if(!Array.isArray(result.myPayments))throw Error("Δεν φορτώθηκε η πλήρης λίστα πληρωμών. Ανανέωσε την εφαρμογή.");
      setRows((result.myPayments||[]).filter(row=>paymentTypes.has(row.type)&&row.sessionId===sessionId&&String(row.sessionId||"").trim()===sessionId&&(!operatorId||String(row.actorId||"").trim()===operatorId)));
    }catch(e){if(current===version.current){setError(e.message);setRows([])}}finally{if(current===version.current)setLoading(false)}
  };
  useEffect(()=>{setRows([]);load();return()=>{version.current++}},[store.id,operator?.id,refreshKey]);
  const totals=useMemo(()=>rows.filter(row=>!row.reversedAt).reduce((a,row)=>{a.total+=Number(row.amount||0);if(row.type==="SUPPLIER_PAYMENT")a.supplier+=Number(row.amount||0);else a.other+=Number(row.amount||0);return a},{total:0,supplier:0,other:0}),[rows]);
  return <section className="cloud-panel my-shift-entries-panel">
    <div className="cloud-panel-head"><div><h3>Οι πληρωμές μου</h3><p>Μόνο οι δικές μου πληρωμές προμηθευτών και λοιπά έξοδα της ενεργής βάρδιας. Με το κλείσιμο της βάρδιας η προβολή μηδενίζει οριστικά· το ιστορικό παραμένει μόνο στο BackOffice / Audit.</p></div><button onClick={load} disabled={loading}>Ανανέωση</button></div>
    {error&&<div className="cloud-alert cloud-error">{error}</div>}
    {!loading&&<div className="commerce-cards"><article className="commerce-card"><span>Σύνολο ενεργής βάρδιας</span><strong>{money(totals.total)}</strong></article><article className="commerce-card"><span>Προμηθευτές</span><strong>{money(totals.supplier)}</strong></article><article className="commerce-card"><span>Λοιπά έξοδα</span><strong>{money(totals.other)}</strong></article></div>}
    {loading?<div className="cloud-loading">Φόρτωση…</div>:rows.length===0?<div className="cloud-empty">Δεν υπάρχουν δικές σου πληρωμές ή έξοδα στην ενεργή βάρδια.</div>:<div className="ledger-list">{rows.map(row=><div className={`ledger-row ${row.reversedAt?"reversed":""}`} key={row.id}><div><b>{row.supplierName||row.description||typeLabel(row)}</b><span>{typeLabel(row)} · {when(row.occurredAt)} · {row.actorName}</span><small>Ενεργή βάρδια · ώρα Ελλάδας</small>{row.createdAt&&<small>Καταχώριση: {when(row.createdAt)}</small>}<small>{evidenceLabel(row)}{row.purchaseDocumentId?` · #${String(row.purchaseDocumentId).slice(0,8)}`:""}</small>{row.reversedAt&&<small>ΑΝΤΙΛΟΓΙΣΜΟΣ · {row.reversalReason||"χωρίς αιτιολογία"}</small>}</div><strong>{money(row.amount)}</strong>{row.canCorrectAmount&&<PaymentAmountCorrectionAction api={api} storeId={store.id} transactionId={row.id} onChanged={result=>{load();onChanged?.(result)}}/>}</div>)}</div>}
  </section>;
}
