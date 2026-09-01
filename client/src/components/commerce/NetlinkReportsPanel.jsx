import React,{useEffect,useMemo,useState} from "react";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const date=value=>value?new Date(value).toLocaleString("el-GR"):"—";
const today=()=>new Date().toISOString().slice(0,10);
const weekStart=()=>{const d=new Date();d.setDate(d.getDate()-6);return d.toISOString().slice(0,10)};
const csvCell=value=>`"${String(value??"").replaceAll('"','""')}"`;

export default function NetlinkReportsPanel({api,storeId}){
  const [from,setFrom]=useState(weekStart),[to,setTo]=useState(today),[operator,setOperator]=useState(""),[daily,setDaily]=useState(null),[settlement,setSettlement]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const query=useMemo(()=>new URLSearchParams({from,to,storeId,...(operator.trim()?{operator:operator.trim()}:{}),limit:"1000"}).toString(),[from,to,storeId,operator]);
  const load=async()=>{if(!storeId)return;setBusy(true);setError("");try{const [detail,weekly]=await Promise.all([api(`/api/netlink/reports/daily?${query}`),api(`/api/netlink/reports/weekly-settlement?${query}`)]);setDaily(detail);setSettlement(weekly)}catch(e){setError(e.message||"Δεν φορτώθηκαν οι αναφορές Netlink.")}finally{setBusy(false)}};
  useEffect(()=>{load()},[query]);
  const requestCancellation=async item=>{const reason=window.prompt("Αιτιολογία αιτήματος ακύρωσης προς Netlink:");if(!reason?.trim())return;setBusy(true);setError("");try{const result=await api("/api/netlink/cancellation-requests",{method:"POST",body:JSON.stringify({transactionId:item.id,reason:reason.trim()})});setMessage(result.message);await load()}catch(e){setError(e.message||"Δεν καταχωρίστηκε το αίτημα ακύρωσης.")}finally{setBusy(false)}};
  const exportCsv=()=>{const rows=daily?.items||[];const headers=["Ημερομηνία","Κατάστημα","Χειριστής","Προϊόν","Request ID","Κατάσταση","Αξία κάρτας","Σύνολο","Κωδικός Netlink","Αίτημα ακύρωσης"];
    const content=[headers,...rows.map(x=>[date(x.completedAt||x.createdAt),x.storeName,x.operatorName,x.productId,x.requestId,x.status,x.amount,x.customerTotal,x.providerReference||x.providerTransactionId,x.cancellationStatus||""])].map(row=>row.map(csvCell).join(",")).join("\n");
    const url=URL.createObjectURL(new Blob(["\ufeff"+content],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`netlink-${from}-${to}.csv`;a.click();URL.revokeObjectURL(url);
  };
  const items=daily?.items||[], totals=daily?.totals||{}, summary=settlement?.settlement;
  return <section className="commerce-box" style={{marginTop:16}}>
    <div className="panel-head"><div><h3>NETLINK · Αναφορές & αιτήματα ακύρωσης</h3><p>Οι ακυρώσεις καταγράφονται ως αίτημα προς Netlink. Δεν εκτελούνται από το MyWorkStation.</p></div><div style={{display:"flex",gap:8}}><button onClick={load} disabled={busy}>Ανανέωση</button><button onClick={exportCsv} disabled={!items.length}>Excel/CSV</button></div></div>
    <div className="commerce-form" style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10}}><label>Από<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Έως<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><label>Χειριστής<input value={operator} onChange={e=>setOperator(e.target.value)} placeholder="Όλοι οι χειριστές"/></label></div>
    {error&&<div className="commerce-error">{error}</div>}{message&&<div className="commerce-success">{message}</div>}
    <div className="commerce-cards"><article className="commerce-card"><span>Ολοκληρωμένες</span><strong>{totals.completed||0}</strong></article><article className="commerce-card"><span>Αξία καρτών</span><strong>{money(totals.cardAmount)}</strong></article><article className="commerce-card"><span>Αιτήματα ακύρωσης</span><strong>{totals.cancellationRequests||0}</strong></article><article className="commerce-card"><span>Προς εκκαθάριση</span><strong>{summary?.providerSettlementStatus==="AWAITING_NETLINK_STATEMENT"?"Netlink":"—"}</strong></article></div>
    {summary&&<div className="commerce-notice"><b>Εβδομαδιαία εκκαθάριση:</b> {summary.transactions} συναλλαγές · αξία {money(summary.grossAmount)} · χρέωση υπηρεσίας {money(summary.serviceFees)} · προμήθεια {money(summary.commissionAmount)}. Η αντιστοίχιση παραμένει σε αναμονή του statement Netlink.</div>}
    <div className="commerce-table"><div className="commerce-row head" style={{gridTemplateColumns:"1.2fr 1fr 1fr .8fr .8fr .9fr 1fr"}}><span>Ημερομηνία</span><span>Προϊόν</span><span>Χειριστής</span><span>Αξία</span><span>Κατάσταση</span><span>Netlink</span><span>Ακύρωση</span></div>{items.map(item=><div className="commerce-row" key={item.id} style={{gridTemplateColumns:"1.2fr 1fr 1fr .8fr .8fr .9fr 1fr"}}><span>{date(item.completedAt||item.createdAt)}<small>{item.storeName}</small></span><span>{item.productId}<small>{item.requestId}</small></span><span>{item.operatorName||"—"}</span><span>{money(item.amount)}</span><span>{item.status}</span><span>{item.providerReference||item.providerTransactionId||"—"}</span><span>{item.cancellationStatus?<b>{item.cancellationStatus}</b>:item.status==="COMPLETED"?<button onClick={()=>requestCancellation(item)} disabled={busy}>Αίτημα</button>:"—"}</span></div>)}{!busy&&!items.length&&<p>Δεν βρέθηκαν συναλλαγές για το επιλεγμένο διάστημα.</p>}</div>
  </section>;
}
