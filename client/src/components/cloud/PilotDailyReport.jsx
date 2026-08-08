import React,{useEffect,useMemo,useState} from "react";
import {CalendarDays,Download,FileSpreadsheet,RefreshCw,UsersRound} from "lucide-react";
import "./pilot-report.css";

const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const when=value=>value?new Date(value).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour:"2-digit",minute:"2-digit"}):"—";
const escapeCsv=value=>`"${String(value??"").replaceAll('"','""')}"`;
const typeLabels={SALE_CASH:"Πώληση μετρητών",SALE_CARD:"Πώληση με κάρτα",SUPPLIER_PAYMENT:"Πληρωμή προμηθευτή",OTHER_EXPENSE:"Λοιπά έξοδα",PERCENTAGES:"Ποσοστά"};

export default function PilotDailyReport({api,store}){
  const [date,setDate]=useState(today());
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const load=async()=>{
    setLoading(true);setError("");
    try{setData(await api(`/api/pilot/stores/${store.id}/daily?date=${date}`))}
    catch(err){setError(err.message)}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[store.id,date]);

  const exportCsv=()=>{
    if(!data)return;
    const rows=[
      ["MYWORKSTATION - ΗΜΕΡΗΣΙΑ ΑΝΑΦΟΡΑ ΠΙΛΟΤΟΥ"],
      ["Κατάστημα",data.store.name],["Ημερομηνία",data.date],[],
      ["ΣΥΝΟΨΗ"],["Πωλήσεις μετρητών",data.summary.cashSales],["Πωλήσεις καρτών",data.summary.cardSales],
      ["Πληρωμές προμηθευτών",data.summary.supplierPayments],["Λοιπά έξοδα",data.summary.otherExpenses],
      ["Σύνολο καταγεγραμμένων πληρωμών / εξόδων",data.summary.recordedExpensesTotal],
      ["Αφαιρέθηκαν από τη βάρδια",data.summary.expensesTotal],["Ποσοστά",data.summary.percentages],
      ["EFTPOS",data.summary.eftposTotal],["Διαφορά καρτών–EFTPOS",data.summary.cardVarianceTotal],
      ["Συνολική διαφορά ταμείων",data.summary.varianceTotal],["Ενεργές συναλλαγές",data.summary.transactionCount],
      ["Ακυρωμένες συναλλαγές",data.summary.reversedCount],[],
      ["ΒΑΡΔΙΕΣ"],["Βάρδια","Άνοιγμα","Άνοιξε","Κλείσιμο","Έκλεισε","Έναρξη","Μετρητά","Κάρτες","EFTPOS","Διαφορά καρτών–EFTPOS","Έξοδα","Πραγματικό","Διαφορά ταμείου"],
      ...data.sessions.map(row=>[row.shiftLabel,when(row.openedAt),row.openedByName||"",when(row.closedAt),row.closedByName||"",row.openingOperational,row.cashSales,row.cardSales,row.eftposTotal,row.cardVariance,row.expenses,row.actualOperational,row.variance]),[],
      ["ΣΥΝΑΛΛΑΓΕΣ"],["Ώρα","Τύπος","Ποσό","Περιγραφή","Προμηθευτής","Εργαζόμενος","Κατάσταση"],
      ...data.transactions.map(row=>[when(row.occurredAt),typeLabels[row.type]||row.type,row.amount,row.description||"",row.supplierName||"",row.actorName,row.reversedAt?"ΑΚΥΡΩΜΕΝΗ":"ΕΝΕΡΓΗ"])
    ];
    const csv="\ufeff"+rows.map(row=>row.map(escapeCsv).join(";")).join("\r\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`MyWorkStation_${store.name}_${date}.csv`;link.click();URL.revokeObjectURL(link.href);
  };

  const summary=data?.summary||{};
  const operators=useMemo(()=>summary.operators||[],[summary.operators]);
  return <article className="cloud-panel pilot-report">
    <div className="cloud-panel-head pilot-report-head">
      <div><h3><FileSpreadsheet/>Ημερήσια Αναφορά Πιλότου</h3><p>Κάθε βάρδια και όλες οι κινήσεις της εμφανίζονται στην ημερομηνία οριστικοποίησής της.</p></div>
      <div className="pilot-report-actions"><label><CalendarDays/><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button onClick={load} disabled={loading}><RefreshCw/>Ανανέωση</button><button onClick={exportCsv} disabled={!data||loading}><Download/>Excel CSV</button></div>
    </div>
    {error&&<div className="cloud-alert cloud-error">{error}</div>}
    {loading?<div className="cloud-loading">Δημιουργία ημερήσιας αναφοράς…</div>:<>
      <div className="pilot-report-metrics">
        <article><span>Μετρητά</span><strong>{money(summary.cashSales)}</strong></article>
        <article><span>Κάρτες</span><strong>{money(summary.cardSales)}</strong></article>
        <article><span>EFTPOS</span><strong>{money(summary.eftposTotal)}</strong></article>
        <article><span>Κάρτες − EFTPOS</span><strong className={Math.abs(Number(summary.cardVarianceTotal||0))>.009?"pilot-negative":"pilot-positive"}>{money(summary.cardVarianceTotal)}</strong></article>
        <article><span>Αφαιρέθηκαν από ταμείο</span><strong>{money(summary.expensesTotal)}</strong></article>
        <article><span>Διαφορά</span><strong className={Number(summary.varianceTotal)<0?"pilot-negative":"pilot-positive"}>{money(summary.varianceTotal)}</strong></article>
        <article><span>Βάρδιες</span><strong>{summary.sessionsClosed||0}/{summary.sessionsOpened||0}</strong></article>
        <article><span>Συναλλαγές</span><strong>{summary.transactionCount||0}</strong></article>
      </div>
      <div className="pilot-operators"><UsersRound/><div><b>Εργαζόμενοι ημέρας</b><span>{operators.length?operators.join(" · "):"Δεν υπάρχουν καταχωρίσεις"}</span></div></div>
      <div className="pilot-report-grid">
        <section><h4>Βάρδιες</h4>{(data?.sessions||[]).length===0?<div className="cloud-empty">Δεν υπάρχουν βάρδιες για την ημερομηνία.</div>:data.sessions.map(row=><div className="pilot-session-row" key={row.id}><div><b>{row.shiftLabel}</b><small>{when(row.openedAt)} {row.openedByName?`· ${row.openedByName}`:""}</small></div><span>{row.status==="CLOSED"?"ΚΛΕΙΣΤΗ":"ΑΝΟΙΧΤΗ"}</span><div><small>Μετρητά / Κάρτες / EFTPOS</small><b>{money(row.cashSales)} / {money(row.cardSales)} / {row.status==="CLOSED"?money(row.eftposTotal):"—"}</b></div><div><small>Ταμείο / Κάρτες−EFTPOS</small><b className={Number(row.variance)<0?"pilot-negative":"pilot-positive"}>{row.status==="CLOSED"?`${money(row.variance)} / ${money(row.cardVariance)}`:"—"}</b></div></div>)}</section>
        <section><h4>Τελευταίες συναλλαγές</h4>{(data?.transactions||[]).length===0?<div className="cloud-empty">Δεν υπάρχουν συναλλαγές για την ημερομηνία.</div>:data.transactions.slice().reverse().slice(0,20).map(row=><div className={`pilot-transaction-row ${row.reversedAt?"reversed":""}`} key={row.id}><div><b>{typeLabels[row.type]||row.type}</b><small>{when(row.occurredAt)} · {row.actorName}</small></div><strong>{money(row.amount)}</strong><span>{row.reversedAt?"ΑΚΥΡΩΜΕΝΗ":"ΕΝΕΡΓΗ"}</span></div>)}</section>
      </div>
    </>}
  </article>;
}
