import React,{useEffect,useMemo,useState} from "react";
import {ArrowLeft,BarChart3,CalendarDays,ChevronRight,FileDown,Filter,Printer,RefreshCw,Search,SlidersHorizontal,WalletCards,X} from "lucide-react";
import CapitalMovementsModal from "./CapitalMovementsModal.jsx";
import "./advanced-sales-analytics.css";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const num=value=>Number(value||0);
const fmt=value=>value?new Date(value).toLocaleString("el-GR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const duration=(from,to)=>{if(!from)return"—";const ms=Math.max(0,new Date(to||Date.now())-new Date(from)),mins=Math.floor(ms/60000);return `${String(Math.floor(mins/60)).padStart(2,"0")}:${String(mins%60).padStart(2,"0")}`};
const txLabel=type=>({SALE_CASH:"Πώληση λιανικής",SALE_CARD:"Πώληση λιανικής",SUPPLIER_PAYMENT:"Πληρωμή προμηθευτή",OTHER_EXPENSE:"Έξοδο",PERCENTAGES:"Ποσοστά"}[type]||String(type||"Συναλλαγή"));
const palette=["#55b85b","#3b82d0","#f1c232","#e94b4b","#8854b8","#f28c52","#4aa3a1","#9aa4b1"];

function Donut({rows=[]}){
  const clean=rows.filter(row=>num(row.revenue)>0).slice(0,7),total=clean.reduce((s,row)=>s+num(row.revenue),0);
  if(!total)return <div className="kiosk-empty">Δεν υπάρχουν ακόμη πωλήσεις για κατανομή.</div>;
  let cursor=0;const stops=clean.map((row,index)=>{const start=cursor;cursor+=num(row.revenue)/total*100;return `${palette[index%palette.length]} ${start}% ${cursor}%`});
  if(cursor<100)stops.push(`#e5e7eb ${cursor}% 100%`);
  return <div className="kiosk-donut-wrap"><div className="kiosk-donut" style={{background:`conic-gradient(${stops.join(",")})`}}><div><b>{money(total)}</b><span>Σύνολο τζίρου</span></div></div><div className="kiosk-legend">{clean.map((row,index)=><div key={`${row.category}-${index}`}><i style={{background:palette[index%palette.length]}}/><span>{row.category||"Χωρίς κατηγορία"}</span><b>{((num(row.revenue)/total)*100).toFixed(2)}%</b><small>{money(row.revenue)}</small></div>)}</div></div>
}

export default function AdvancedSalesAnalytics({api,stores=[],initialStoreId=""}){
  const [storeId,setStoreId]=useState(initialStoreId||stores[0]?.id||"");
  const [cash,setCash]=useState(null),[ledger,setLedger]=useState(null),[selected,setSelected]=useState(null),[report,setReport]=useState(null);
  const [drawerOpen,setDrawerOpen]=useState(false),[drawerTab,setDrawerTab]=useState("ledger"),[capitalOpen,setCapitalOpen]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{if(!storeId&&stores[0])setStoreId(stores[0].id)},[stores,storeId]);

  const load=async(preferredId=null)=>{
    if(!storeId)return;setBusy(true);setError("");
    try{
      const [cashData,ledgerData]=await Promise.all([api(`/api/cash-control/stores/${encodeURIComponent(storeId)}/overview`),api(`/api/transactions/stores/${encodeURIComponent(storeId)}/overview`)]);
      setCash(cashData);setLedger(ledgerData);
      const shifts=cashData.recent||[];const next=shifts.find(row=>row.id===(preferredId||selected?.id))||cashData.openSession||shifts[0]||null;setSelected(next);
      if(next){const from=new Date(next.openedAt).toISOString(),to=new Date(next.closedAt||Date.now()).toISOString();const q=new URLSearchParams({storeId,from,to});setReport(await api(`/api/commerce/sales/advanced-report?${q}`));}else setReport(null);
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };
  useEffect(()=>{load()},[storeId]);

  const shifts=useMemo(()=>cash?.recent||[],[cash]);
  const transactions=useMemo(()=>selected?(ledger?.recent||[]).filter(row=>row.sessionId===selected.id):[],[ledger,selected]);
  const selectedIsOpen=selected&&cash?.openSession?.id===selected.id;
  const liveSummary=selectedIsOpen?ledger?.summary:null;
  const cashSales=selectedIsOpen?num(liveSummary?.cashSales):num(selected?.cashSales);
  const cardSales=selectedIsOpen?num(liveSummary?.cardSales):num(selected?.cardSales);
  const expenses=selectedIsOpen?num(liveSummary?.expensesTotal):num(selected?.expenses);
  const shiftTotal=cashSales+cardSales;
  const txCount=transactions.filter(row=>!row.reversedAt).length;
  const average=txCount?shiftTotal/txCount:0;
  const categories=(report?.categories||[]).map(row=>({...row,category:row.category||"Χωρίς κατηγορία"}));
  const categoryTotal=categories.reduce((sum,row)=>sum+num(row.revenue),0)||1;

  const chooseShift=async row=>{setSelected(row);setDrawerOpen(false);setBusy(true);setError("");try{const q=new URLSearchParams({storeId,from:new Date(row.openedAt).toISOString(),to:new Date(row.closedAt||Date.now()).toISOString()});setReport(await api(`/api/commerce/sales/advanced-report?${q}`))}catch(e){setError(e.message)}finally{setBusy(false)}};
  const openDetails=row=>{chooseShift(row);setDrawerOpen(true)};

  return <div className={`kiosk-sales ${drawerOpen?"with-drawer":""}`}>
    <section className="kiosk-main">
      <div className="kiosk-titlebar"><div><h2>Πωλήσεις</h2><p>Οικεία ροή Kiosk Manager με τις πρόσθετες δυνατότητες MyWorkStation.</p></div><div className="kiosk-top-controls"><label>Κατάστημα<select value={storeId} onChange={e=>setStoreId(e.target.value)}>{stores.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><button onClick={()=>load(selected?.id)} disabled={busy}><RefreshCw/>{busy?"Φόρτωση":"Ανανέωση"}</button></div></div>
      {error&&<div className="commerce-error">{error}</div>}
      <div className="commerce-notice"><b>ΜΗ ΦΟΡΟΛΟΓΙΚΗ ΑΝΑΛΥΣΗ.</b> Οι Κατηγορίες και οι Εργαζόμενοι προέρχονται μόνο από πραγματικές καταγραφές MyWorkStation. Ακυρώσεις και επιστροφές εμφανίζονται μόνο όταν υπάρχει πραγματική σχετική εγγραφή στο σύστημα.</div>
      <div className="kiosk-subtabs"><button className="active"><CalendarDays/>Βάρδιες σε εξέλιξη</button><button><BarChart3/>Δείκτες απόδοσης</button><button><BarChart3/>Απόδοση ανά ημέρα</button><button><WalletCards/>Διελεύσεις πελατών</button></div>

      <section className="kiosk-panel shift-panel"><div className="kiosk-panel-head"><h3>Βάρδιες σε εξέλιξη <span>{shifts.length}</span></h3><div><button onClick={()=>load(selected?.id)}><RefreshCw/></button><button><SlidersHorizontal/>Στήλες</button><button><Filter/>Φίλτρα</button></div></div>
        <div className="shift-table"><div className="shift-row head"><span>Χειριστής<br/>Έναρξη βάρδιας</span><span>Διάρκεια</span><span>Μετρητά</span><span>Κάρτες<br/><small>IRIS / POS</small></span><span>Σύνολο βάρδιας</span><span>Πληρωμές<br/><small>Συναλλαγές</small></span><span>Τελ. Πώληση</span><span>Μ.Ο. Πώλησης</span></div>
          {shifts.map(row=>{const open=cash?.openSession?.id===row.id;const c=open?num(ledger?.summary?.cashSales):num(row.cashSales),card=open?num(ledger?.summary?.cardSales):num(row.cardSales),exp=open?num(ledger?.summary?.expensesTotal):num(row.expenses),rowTx=open?(ledger?.summary?.count||0):0;return <div className={`shift-row ${selected?.id===row.id?"selected":""}`} key={row.id} onClick={()=>chooseShift(row)}><span className="shift-person"><button onClick={e=>{e.stopPropagation();openDetails(row)}}><Search/></button><b>{row.openedByName||row.shiftLabel||"Χειριστής"}</b><small>{fmt(row.openedAt)}</small></span><span>{duration(row.openedAt,row.closedAt)}</span><strong className="cash-drill" onClick={e=>{e.stopPropagation();setCapitalOpen(true)}} title="Άνοιγμα κινήσεων κεφαλαίου">{money(c)}</strong><span><b>{money(card)}</b><small>{rowTx}</small></span><strong className="blue">{money(c+card)}</strong><span><b>{money(exp)}</b><small>{rowTx||"—"}</small></span><span>{fmt(row.closedAt||row.updatedAt||row.openedAt)}</span><strong>{money(rowTx?(c+card)/rowTx:0)}</strong></div>})}
          {!shifts.length&&<div className="kiosk-empty">Δεν υπάρχουν καταγεγραμμένες βάρδιες.</div>}
        </div>
      </section>

      <div className="kiosk-lower-grid"><section className="kiosk-panel"><div className="kiosk-panel-head"><h3>Πωλήσεις βάρδιας ανά υποκατηγορία</h3><button>Ανάπτυξη όλων</button></div><div className="category-table"><div className="category-row head"><span>Περιγραφή</span><span>Ποσό</span><span>Τζίρος</span><span>% Τζίρου</span><span>Κέρδος</span><span>Margin</span></div>{categories.slice(0,12).map((row,index)=><div className={`category-row ${index===0?"selected":""}`} key={`${row.category}-${index}`}><span><ChevronRight/><b>{row.category}</b></span><span>{Number(row.quantity||row.count||0).toFixed(0)}</span><b>{money(row.revenue)}</b><span>{(num(row.revenue)/categoryTotal*100).toFixed(2)}%</span><span>{money(row.profit||0)}</span><span>{num(row.margin||0).toFixed(2)}%</span></div>)}{!categories.length&&<div className="kiosk-empty">Δεν υπάρχουν ακόμη στοιχεία κατηγοριών.</div>}</div></section>
        <section className="kiosk-panel"><div className="kiosk-panel-head"><h3>Κατανομή πωλήσεων βάρδιας ανά υποκατηγορία</h3></div><Donut rows={categories}/></section></div>
    </section>

    {drawerOpen&&selected&&<aside className="shift-drawer"><div className="drawer-title"><div><h2>Συναλλαγές Βάρδιας <small>#{String(selected.id).slice(0,6)}</small></h2></div><button onClick={()=>setDrawerOpen(false)}><X/></button></div><div className="drawer-shift"><b>Στοιχεία Βάρδιας</b><div><strong>{fmt(selected.openedAt)}</strong><strong>{selected.openedByName||selected.shiftLabel||"Χειριστής"}</strong><span>{selected.status||"—"}</span></div></div><div className="drawer-tabs"><button className={drawerTab==="ledger"?"active":""} onClick={()=>setDrawerTab("ledger")}>Ημερολόγιο κινήσεων</button><button className={drawerTab==="category"?"active":""} onClick={()=>setDrawerTab("category")}>ανά κατηγορία</button><button className={drawerTab==="vat"?"active":""} onClick={()=>setDrawerTab("vat")}>ανά Τμήμα ΦΠΑ</button><button className={drawerTab==="summary"?"active":""} onClick={()=>setDrawerTab("summary")}>Συγκεντρωτικά</button><button className={drawerTab==="money"?"active":""} onClick={()=>setDrawerTab("money")}>Ανάλυση χρηματικού</button></div>
      {drawerTab==="ledger"&&<div className="drawer-table"><div className="drawer-row head"><span>Κωδ.</span><span>Ημερομηνία</span><span>Περιγραφή</span><span>Τζίρος</span><span>Πίστωση</span><span>Μετρητά</span></div>{transactions.map(row=><div className={`drawer-row ${row.reversedAt?"reversed":""}`} key={row.id}><span><Search/>{String(row.id).slice(0,6)}</span><span>{fmt(row.occurredAt)}</span><span>{row.description||txLabel(row.type)}<small>{row.supplierName||row.actorName||""}</small></span><b>{money(row.amount)}</b><span>{row.type==="SALE_CARD"?money(row.amount):money(0)}</span><strong>{row.type==="SALE_CASH"?money(row.amount):money(0)}</strong></div>)}{!transactions.length&&<div className="kiosk-empty">Δεν υπάρχουν κινήσεις συνδεδεμένες με αυτή τη βάρδια.</div>}<div className="drawer-row totals"><span>Σύνολα</span><span>{transactions.length}</span><span></span><b>{money(shiftTotal+expenses)}</b><b>{money(cardSales)}</b><strong>{money(cashSales)}</strong></div></div>}
      {drawerTab==="category"&&<div className="drawer-summary"><h3>Ανάλυση ανά κατηγορία</h3>{categories.map(row=><div key={row.category}><span>{row.category}</span><b>{money(row.revenue)}</b></div>)}</div>}
      {drawerTab==="vat"&&<div className="drawer-summary"><h3>Ανάλυση ανά Τμήμα ΦΠΑ</h3><p>Η ανάλυση θα γεμίσει από τις πραγματικές φορολογικές εγγραφές όταν ενεργοποιηθεί ο Connector.</p></div>}
      {drawerTab==="summary"&&<div className="drawer-summary"><h3>Συγκεντρωτικά</h3><div><span>Μετρητά</span><b>{money(cashSales)}</b></div><div><span>Κάρτες</span><b>{money(cardSales)}</b></div><div><span>Πληρωμές / Έξοδα</span><b>{money(expenses)}</b></div><div><span>Σύνολο βάρδιας</span><b>{money(shiftTotal)}</b></div></div>}
      {drawerTab==="money"&&<div className="drawer-summary"><h3>Ανάλυση χρηματικού</h3><div><span>Μετρητά</span><b>{money(cashSales)}</b></div><div><span>Κάρτες / ηλεκτρονικά</span><b>{money(cardSales)}</b></div><div><span>Μ.Ο. πώλησης</span><b>{money(average)}</b></div></div>}
      <div className="drawer-actions"><button onClick={()=>setDrawerOpen(false)}><ArrowLeft/>Επιστροφή</button><button onClick={()=>load(selected.id)}><RefreshCw/>Ανανέωση</button><button onClick={()=>window.print()}><Printer/>Επανεκτύπωση</button><span/><button><FileDown/>PDF</button><button><FileDown/>Excel</button></div>
    </aside>}
    {capitalOpen&&<CapitalMovementsModal cash={cash} ledger={ledger} onClose={()=>setCapitalOpen(false)}/>} 
  </div>;
}
