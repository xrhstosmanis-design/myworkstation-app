import React,{useEffect,useMemo,useState} from "react";
import {ChevronDown,ChevronRight,Download,Maximize2,Minimize2,Printer,RefreshCw,Search,X} from "lucide-react";

const iso=date=>date.toISOString().slice(0,10);
const monthStart=()=>{const d=new Date();return iso(new Date(d.getFullYear(),d.getMonth()-2,1))};
const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const pct=value=>`${Number(value||0).toLocaleString("el-GR",{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
const monthLabel=value=>{const [year,month]=String(value).split("-");return `${year} - ${month}`};
const dayLabel=value=>new Date(`${value}T00:00:00`).toLocaleDateString("el-GR",{weekday:"short",day:"2-digit",month:"2-digit",year:"numeric"});
const columns=[
  ["margin","Margin",pct],["salesVat","ΦΠΑ πωλήσεων",money],["salesGross","Πωλήσεις (με ΦΠΑ)",money],["purchaseGross","Αγορές (με ΦΠΑ)",money],
  ["salesNet","Πωλήσεις (χ. ΦΠΑ)",money],["purchaseNet","Αγορές (χ. ΦΠΑ)",money],["grossProfit","Ακαθ. κέρδος",money],["expenses","Έξοδα (χ. ΦΠΑ)",money],
  ["netProfit","Καθ. κέρδος",money],["paymentTotal","Πληρωμές",money],["purchaseSalesPercent","Αγορές/Πωλήσεις (χ.ΦΠΑ)",pct],
  ["expenseSalesPercent","Έξοδα/Πωλήσεις (χ.ΦΠΑ)",pct],["purchaseVat","ΦΠΑ αγορών",money],["expenseVat","ΦΠΑ εξόδων",money]
];

export default function OwnerBusinessPicture({api,store,onClose}){
  const [from,setFrom]=useState(monthStart()),[to,setTo]=useState(iso(new Date())),[scope,setScope]=useState("ALL"),[data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[expanded,setExpanded]=useState(""),[maximized,setMaximized]=useState(false);
  const query=()=>{const q=new URLSearchParams({from:new Date(`${from}T00:00:00`).toISOString(),to:new Date(`${to}T23:59:59.999`).toISOString()});if(store?.id)q.set("storeId",store.id);return q};
  const load=async()=>{setBusy(true);setError("");try{setData(await api(`/api/owner-payments/business-picture?${query()}`))}catch(e){setError(e.message)}finally{setBusy(false)}};
  useEffect(()=>{load()},[store?.id]);
  const daysByMonth=useMemo(()=>{const map=new Map();for(const row of data?.daily||[]){if(!map.has(row.month))map.set(row.month,[]);map.get(row.month).push(row)}return map},[data]);
  const visible=(value,key)=>{if(scope==="WITH_VAT"&&["salesNet","purchaseNet"].includes(key))return null;if(scope==="WITHOUT_VAT"&&["salesGross","purchaseGross","salesVat","purchaseVat"].includes(key))return null;return value};
  const exportCsv=()=>{const lines=[["Περίοδος",...columns.map(([,label])=>label)]];for(const row of data?.monthly||[])lines.push([row.month,...columns.map(([key])=>row[key]||0)]);const blob=new Blob(["\ufeff"+lines.map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n")],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`eikona-epixeiriseis-${from}-${to}.csv`;a.click();URL.revokeObjectURL(url)};
  const rowCells=row=>columns.map(([key,,format])=>{const value=visible(row[key],key);return <td key={key} className={key==="netProfit"?"business-profit":key.includes("Vat")?"business-vat":""}>{value===null?"—":format(value)}</td>});
  return <div className="business-picture-overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <section className={`business-picture-dialog ${maximized?"maximized":""}`}>
      <header><div><small>MYWORKSTATION · ΙΔΙΟΚΤΗΤΗΣ</small><h2>Εικόνα Επιχειρήσεις</h2><p>{store?.name||"Όλα τα καταστήματα"} · πραγματικά δεδομένα εμπορικής λειτουργίας</p></div><div className="business-window-actions"><button onClick={()=>setMaximized(value=>!value)} aria-label={maximized?"Επαναφορά παραθύρου":"Μεγιστοποίηση παραθύρου"}>{maximized?<Minimize2/>:<Maximize2/>}</button><button onClick={onClose} aria-label="Κλείσιμο"><X/></button></div></header>
      <div className="business-picture-criteria">
        <b>Κριτήρια αναζήτησης (Ημερομηνίες συναλλαγών)</b>
        <label>από:<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>έως:<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
        <div className="business-picture-radio"><label><input type="radio" checked={scope==="ALL"} onChange={()=>setScope("ALL")}/> ΟΛΑ</label><label><input type="radio" checked={scope==="WITH_VAT"} onChange={()=>setScope("WITH_VAT")}/> Μόνο με ΦΠΑ</label><label><input type="radio" checked={scope==="WITHOUT_VAT"} onChange={()=>setScope("WITHOUT_VAT")}/> Χωρίς ΦΠΑ</label></div>
        <span/><button onClick={()=>{const d=new Date();setFrom(iso(new Date(d.getFullYear(),d.getMonth()-3,1)));setTo(iso(d))}}>Προηγούμενο Τρίμηνο</button><button onClick={()=>{const d=new Date();setFrom(iso(new Date(d.getFullYear(),d.getMonth(),1)));setTo(iso(d))}}>Τρέχων Μήνας</button>
        <button className="business-search" onClick={load} disabled={busy}><Search/></button>
      </div>
      <div className="business-picture-tools"><button onClick={load}><RefreshCw/> Ανανέωση</button><button onClick={exportCsv}><Download/> Excel / CSV</button><button onClick={()=>window.print()}><Printer/> Εκτύπωση</button></div>
      {error&&<div className="business-picture-error">{error}</div>}
      {busy?<div className="business-picture-loading">Φόρτωση οικονομικής εικόνας…</div>:<div className="business-picture-table-wrap"><table><thead><tr><th>Έτος-Μήνας</th>{columns.map(([,label])=><th key={label}>{label}</th>)}</tr></thead><tbody>
        {(data?.monthly||[]).map(row=><React.Fragment key={row.month}><tr className="business-month" onClick={()=>setExpanded(expanded===row.month?"":row.month)}><td><button>{expanded===row.month?<ChevronDown/>:<ChevronRight/>}</button>{monthLabel(row.month)}</td>{rowCells(row)}</tr>{expanded===row.month&&(daysByMonth.get(row.month)||[]).map(day=><tr className="business-day" key={day.day}><td>{dayLabel(day.day)}<small>{day.transactions} συναλλαγές · {day.documents} αγορές</small></td>{rowCells(day)}</tr>)}</React.Fragment>)}
      </tbody>{data?.totals&&<tfoot><tr><td>ΣΥΝΟΛΟ</td>{rowCells(data.totals)}</tr></tfoot>}</table></div>}
      <footer><b>Υπολογισμός:</b> {data?.calculationNotes?.grossProfit} {data?.calculationNotes?.netProfit}</footer>
    </section>
  </div>;
}
