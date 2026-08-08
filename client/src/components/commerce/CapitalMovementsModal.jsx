import React,{useMemo,useState} from "react";
import {ArrowLeft,FileDown,Search,X} from "lucide-react";
import "./capital-movements-modal.css";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const fmt=value=>value?new Date(value).toLocaleString("el-GR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const dateInput=value=>{const d=value?new Date(value):new Date();return d.toISOString().slice(0,10)};

export default function CapitalMovementsModal({cash,ledger,onClose}){
  const shifts=cash?.recent||[];
  const initialFrom=shifts.length?dateInput(shifts[shifts.length-1]?.openedAt):dateInput(new Date(Date.now()-7*86400000));
  const initialTo=dateInput(new Date());
  const [from,setFrom]=useState(initialFrom),[to,setTo]=useState(initialTo);
  const inRange=value=>{if(!value)return false;const d=new Date(value),a=new Date(`${from}T00:00:00`),b=new Date(`${to}T23:59:59`);return d>=a&&d<=b};
  const rows=useMemo(()=>shifts.filter(row=>inRange(row.openedAt||row.closedAt)),[shifts,from,to]);
  const tx=useMemo(()=>(ledger?.recent||[]).filter(row=>inRange(row.occurredAt)),[ledger,from,to]);
  const cardRows=tx.filter(row=>row.type==="SALE_CARD"&&!row.reversedAt);
  const cashIn=rows.reduce((s,row)=>s+Number(row.cashSales||0),0);
  const cashOut=rows.reduce((s,row)=>s+Number(row.expenses||0),0);
  const cardTotal=cardRows.reduce((s,row)=>s+Number(row.amount||0),0);

  return <div className="capital-modal-backdrop"><section className="capital-modal">
    <div className="capital-title"><div><h2>Κινήσεις Κεφαλαίου</h2><span>Ανάλυση πραγματικών κινήσεων MyWorkStation</span></div><button onClick={onClose}><X/></button></div>
    <div className="capital-filters"><label>από:<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>έως:<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><span/><button title="Αναζήτηση"><Search/></button></div>
    <div className="capital-band">Καρτέλα Βάρδιας</div>
    <div className="capital-grid">
      <div className="capital-table"><div className="capital-table-title">Μετρητά</div><div className="capital-row head"><span>ημερομηνία</span><span>μετρητά</span><span>έσοδα</span><span>έξοδα</span><span>κίνηση</span></div>{rows.map(row=><div className="capital-row" key={row.id}><span>{fmt(row.openedAt)}</span><span>{money(Number(row.cashSales||0)-Number(row.expenses||0))}</span><b>{money(row.cashSales)}</b><strong>{money(row.expenses)}</strong><span>{row.closedAt?"κλείσιμο βάρδιας":"ανοιχτή βάρδια"}</span></div>)}{!rows.length&&<div className="capital-empty">Δεν υπάρχουν κινήσεις για το διάστημα.</div>}<div className="capital-row totals"><span>Σύνολα</span><span>{money(cashIn-cashOut)}</span><b>{money(cashIn)}</b><strong>{money(cashOut)}</strong><span/></div></div>
      <div className="capital-table"><div className="capital-table-title">Όψεως και κάρτες</div><div className="capital-row cards head"><span>ημερομηνία</span><span>όψεως</span><span>κάρτες / ηλεκτρονικά</span><span>προμήθεια</span></div>{cardRows.map(row=><div className="capital-row cards" key={row.id}><span>{fmt(row.occurredAt)}</span><span>{money(0)}</span><b>{money(row.amount)}</b><span>—</span></div>)}{!cardRows.length&&<div className="capital-empty">Δεν υπάρχουν ηλεκτρονικές κινήσεις για το διάστημα.</div>}<div className="capital-row cards totals"><span>Σύνολα</span><span>{money(0)}</span><b>{money(cardTotal)}</b><span>—</span></div></div>
    </div>
    <div className="capital-actions"><button onClick={onClose}><ArrowLeft/>Επιστροφή</button><span/><button onClick={()=>window.print()}><FileDown/>Εκτύπωση / PDF</button></div>
  </section></div>;
}
