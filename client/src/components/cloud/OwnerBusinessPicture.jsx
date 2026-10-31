import React,{useEffect,useMemo,useRef,useState} from "react";
import {ChevronDown,ChevronRight,Download,Maximize2,Minimize2,Printer,RefreshCw,Search,X} from "lucide-react";

import {businessPicturePreset} from "./business-picture-dates.js";
import BusinessPictureExpenseDetails from "./BusinessPictureExpenseDetails.jsx";
import BusinessPictureCostDetails from "./BusinessPictureCostDetails.jsx";
import {businessPictureCell,businessPictureCsv} from "./business-picture-values.js";
import {businessPicturePrintHtml} from "./business-picture-print.js";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const pct=value=>`${Number(value||0).toLocaleString("el-GR",{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
const monthLabel=value=>{const [year,month]=String(value).split("-");return `${year} - ${month}`};
const dayLabel=value=>new Date(`${value}T00:00:00`).toLocaleDateString("el-GR",{...({weekday:"short",day:"2-digit",month:"2-digit",year:"numeric"}),timeZone:"Europe/Athens"});
const columns=[
  ["margin","Margin",pct],["salesVat","ΦΠΑ πωλήσεων",money],["salesGross","Πωλήσεις (με ΦΠΑ)",money],["purchaseGross","Αγορές (με ΦΠΑ)",money],
  ["salesNet","Πωλήσεις (χ. ΦΠΑ)",money],["purchaseNet","Αγορές (χ. ΦΠΑ)",money],["grossProfit","Ακαθ. κέρδος",money],["expenseGross","Έξοδα (μικτά)",money],["expenses","Έξοδα (χ. ΦΠΑ)",money],
  ["netProfit","Καθ. κέρδος",money],["paymentTotal","Πληρωμές",money],["purchaseSalesPercent","Αγορές/Πωλήσεις (χ.ΦΠΑ)",pct],
  ["expenseSalesPercent","Έξοδα/Πωλήσεις (χ.ΦΠΑ)",pct],["purchaseVat","ΦΠΑ αγορών",money],["expenseVat","ΦΠΑ εξόδων",money],
  ["missingCostLines","Γραμμές χωρίς κόστος",value=>Number(value||0).toLocaleString("el-GR")],
  ["salesLines","Γραμμές πωλήσεων",value=>Number(value||0).toLocaleString("el-GR")],
  ["returnTransactions","Επιστροφές",value=>Number(value||0).toLocaleString("el-GR")],
  ["cancelTransactions","Ακυρώσεις",value=>Number(value||0).toLocaleString("el-GR")],
  ["missingExpenseVatPayments","Έξοδα με ΦΠΑ 0% (χωρίς ανάλυση)",value=>Number(value||0).toLocaleString("el-GR")]
];

export default function OwnerBusinessPicture({api,store,onClose}){
  const [from,setFrom]=useState(()=>businessPicturePreset().from),[to,setTo]=useState(()=>businessPicturePreset().to),[scope,setScope]=useState("ALL"),[data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[expanded,setExpanded]=useState(""),[maximized,setMaximized]=useState(false),[expensePeriod,setExpensePeriod]=useState(null),[costPeriod,setCostPeriod]=useState(null);
  const sequence=useRef(0);
  const query=()=>{const q=new URLSearchParams({calendarFrom:from,calendarTo:to});if(store?.id)q.set("storeId",store.id);return q};
  const load=async()=>{const id=++sequence.current;setBusy(true);setError("");try{const result=await api(`/api/owner-payments/business-picture?${query()}`);if(id===sequence.current)setData(result)}catch(e){if(id===sequence.current)setError(e.message)}finally{if(id===sequence.current)setBusy(false)}};
  useEffect(()=>{setData(null);setExpensePeriod(null);setCostPeriod(null);load();return ()=>{sequence.current++}},[store?.id]);
  const preset=kind=>{const p=businessPicturePreset(kind);setFrom(p.from);setTo(p.to)};
  const daysByMonth=useMemo(()=>{const map=new Map();for(const row of data?.daily||[]){if(!map.has(row.month))map.set(row.month,[]);map.get(row.month).push(row)}return map},[data]);
  const visible=(value,key)=>{if(scope==="WITH_VAT"&&["salesNet","purchaseNet"].includes(key))return null;if(scope==="WITHOUT_VAT"&&["salesGross","purchaseGross","salesVat","purchaseVat"].includes(key))return null;return value};
  const exportCsv=()=>{const blob=new Blob([businessPictureCsv(data,columns)],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`eikona-epixeiriseis-${data?.calendarFrom||from}-${data?.calendarTo||to}.csv`;a.click();URL.revokeObjectURL(url)};
  const periodFor=row=>row?.day?{day:row.day}:row?.month&&row.month!=="ΣΥΝΟΛΟ"?{month:row.month}:{};
  const openExpenses=row=>{setCostPeriod(null);setExpensePeriod(periodFor(row))};
  const openCosts=row=>{setExpensePeriod(null);setCostPeriod(periodFor(row))};
  const rowCells=row=>columns.map(([key,,format])=>{const cell=businessPictureCell(row,key),value=visible(cell.value,key);return <td key={key} className={key==="netProfit"?"business-profit":key.includes("Vat")?"business-vat":""}>{key==="missingCostLines"&&value>0?<button type="button" className="business-expense-link business-cost-link" aria-label={`Προβολή ${value} γραμμών χωρίς κόστος`} onClick={e=>{e.stopPropagation();openCosts(row)}}>{format(value)} · Είδη</button>:key==="missingExpenseVatPayments"&&value>0?<button type="button" className="business-expense-link" aria-label={`Προβολή ${value} εξόδων με ΦΠΑ 0% χωρίς ανάλυση`} onClick={e=>{e.stopPropagation();openExpenses(row)}}>{format(value)} · Προβολή</button>:value==null?"—":cell.estimated?<><span title="Προσωρινή εκτίμηση κόστους">≈ {format(value)}</span><small style={{display:"block",fontSize:12,fontWeight:700}}>Εκτίμηση</small></>:format(value)}</td>});
  const printReport=()=>{
    const popup=window.open("","_blank");
    if(!popup){setError("Επίτρεψε το αναδυόμενο παράθυρο για την εκτυπώσιμη αναφορά.");return}
    popup.opener=null;
    const rows=[];
    for(const row of data?.monthly||[]){rows.push({...row,label:monthLabel(row.month)});if(expanded===row.month)for(const day of daysByMonth.get(row.month)||[])rows.push({...day,label:dayLabel(day.day)})}
    if(data?.totals)rows.push({...data.totals,label:"ΣΥΝΟΛΟ"});
    popup.document.open();popup.document.write(businessPicturePrintHtml({data,storeName:store?.name||"Όλα τα καταστήματα",columns,rows,scope}));popup.document.close();
  };
  return <div className={`business-picture-overlay ${maximized?"business-picture-fullscreen":""}`} onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <section className={`business-picture-dialog ${maximized?"maximized":""}`}>
      <header><div><small>MYWORKSTATION · ΙΔΙΟΚΤΗΤΗΣ</small><h2>Εικόνα Επιχειρήσεις</h2><p>{store?.name||"Όλα τα καταστήματα"} · πραγματικά δεδομένα εμπορικής λειτουργίας</p></div><div className="business-window-actions"><button onClick={()=>setMaximized(value=>!value)} aria-label={maximized?"Επαναφορά παραθύρου":"Μεγιστοποίηση παραθύρου"}>{maximized?<Minimize2/>:<Maximize2/>}</button><button onClick={onClose} aria-label="Κλείσιμο"><X/></button></div></header>
      <div className="business-picture-criteria">
        <b className="business-criteria-heading">Κριτήρια αναζήτησης (Ημερομηνίες συναλλαγών)</b>
        <label>από:<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>έως:<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
        <div className="business-picture-radio"><label><input type="radio" checked={scope==="ALL"} onChange={()=>setScope("ALL")}/> ΟΛΑ</label><label><input type="radio" checked={scope==="WITH_VAT"} onChange={()=>setScope("WITH_VAT")}/> Μόνο με ΦΠΑ</label><label><input type="radio" checked={scope==="WITHOUT_VAT"} onChange={()=>setScope("WITHOUT_VAT")}/> Χωρίς ΦΠΑ</label></div>
        <button onClick={()=>preset("PREVIOUS_QUARTER")}>Προηγούμενο Τρίμηνο</button><button onClick={()=>preset("CURRENT_MONTH")}>Τρέχων Μήνας</button>
        <button className="business-search" aria-label="Αναζήτηση περιόδου" onClick={load} disabled={busy}><Search/></button>
      </div>
      <div className="business-picture-tools">{data?.calendarFrom&&<strong className="business-loaded-period">{data.calendarFrom} έως {data.calendarTo}</strong>}<button onClick={load}><RefreshCw/> Ανανέωση</button><button onClick={exportCsv} disabled={busy||!!error||!data}><Download/> Excel / CSV</button><button onClick={printReport} disabled={busy||!!error||!data}><Printer/> Εκτύπωση</button></div>
      {data&&<div className="business-report-information">
        {!busy&&data?.totals?.missingCostLines>0&&<span className="business-data-warning" role="status">Ελλιπές κόστος: {data.totals.missingCostLines}/{data.totals.salesLines} γραμμές</span>}
        {!busy&&data?.totals?.missingCostLines>0&&<button type="button" className="business-data-warning business-cost-link" onClick={()=>openCosts(data.totals)}>Είδη χωρίς κόστος · Προβολή</button>}
        {!busy&&data?.totals?.profitEstimateBasis&&<span className="business-data-warning">≈ Προσωρινό κέρδος / Margin · Κάλυψη κόστους {pct(data.totals.costCoveragePercent)}</span>}
        {!busy&&data?.totals?.missingExpenseVatPayments>0&&<button type="button" className="business-data-warning business-expense-link" onClick={()=>openExpenses(data.totals)}>ΦΠΑ 0% χωρίς ανάλυση: {data.totals.missingExpenseVatPayments}/{data.totals.expensePayments} έξοδα · Προβολή</button>}
        <details className="business-report-details"><summary>Πληροφορίες αναφοράς</summary><div className="business-report-explanations">
      {data?.calendarFrom&&<p >Εμφανιζόμενη περίοδος: {data.calendarFrom} έως {data.calendarTo} · ώρα Ελλάδας. Οι αλλαγές στα κριτήρια εφαρμόζονται με Αναζήτηση.</p>}
      {!busy&&data?.totals&&<p >Στην περίοδο: {data.totals.returnTransactions||0} επιστροφές και {data.totals.cancelTransactions||0} ακυρώσεις. {data.calculationNotes?.reversals}</p>}
      {!busy&&data?.totals?.missingCostLines>0&&<div >Λείπει κόστος σε {data.totals.missingCostLines} από {data.totals.salesLines} γραμμές πώλησης. Κέρδος και Margin εμφανίζονται ως «—» όταν δεν υπάρχει βάση εκτίμησης. Όπου υπάρχει, τα ποσά με «≈ Εκτίμηση» υπολογίζονται από τα γνωστά κόστη της ίδιας κατηγορίας/μονάδας ή του ίδιου καταστήματος στην επιλεγμένη περίοδο. Η κάλυψη κόστους δεν αποτελεί εγγύηση ακρίβειας.</div>}
      {!busy&&data?.totals?.missingExpenseVatPayments>0&&<div >Σε {data.totals.missingExpenseVatPayments} από {data.totals.expensePayments} έξοδα χωρίς ανάλυση ΦΠΑ, ολόκληρο το ποσό αφαιρείται ως έξοδο με ΦΠΑ 0% στην εικόνα ιδιοκτήτη. Η ανάλυση των συνδεδεμένων έγκυρων παραστατικών διατηρείται. Δεν αλλάζουν τα αρχικά παραστατικά.</div>}
          <p>{data?.calculationNotes?.units}</p><p>{data?.calculationNotes?.expenses} {data?.calculationNotes?.costCoverage} <b>Υπολογισμός:</b> {data?.calculationNotes?.grossProfit} {data?.calculationNotes?.netProfit}</p>
        </div></details>
      </div>}
      {error&&<div className="business-picture-error">{error}</div>}
      {busy?<div className="business-picture-loading">Φόρτωση οικονομικής εικόνας…</div>:<div className="business-picture-table-wrap"><table><thead><tr><th>Έτος-Μήνας</th>{columns.map(([,label])=><th key={label}>{label}</th>)}</tr></thead><tbody>
        {(data?.monthly||[]).map(row=><React.Fragment key={row.month}><tr className="business-month" onClick={()=>setExpanded(expanded===row.month?"":row.month)}><td><button>{expanded===row.month?<ChevronDown/>:<ChevronRight/>}</button>{monthLabel(row.month)}</td>{rowCells(row)}</tr>{expanded===row.month&&(daysByMonth.get(row.month)||[]).map(day=><tr className="business-day" key={day.day}><td>{dayLabel(day.day)}<small>{day.transactions} συναλλαγές · {day.documents} αγορές</small></td>{rowCells(day)}</tr>)}</React.Fragment>)}
      </tbody>{data?.totals&&<tfoot><tr><td>ΣΥΝΟΛΟ</td>{rowCells(data.totals)}</tr></tfoot>}</table></div>}
      {costPeriod&&<BusinessPictureCostDetails data={data} storeName={store?.name} period={costPeriod} onClose={()=>setCostPeriod(null)}/>}
      {expensePeriod&&<BusinessPictureExpenseDetails data={data} storeName={store?.name} period={expensePeriod} onClose={()=>setExpensePeriod(null)}/>}
    </section>
  </div>;
}
