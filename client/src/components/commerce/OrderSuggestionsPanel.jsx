import React,{useEffect,useMemo,useRef,useState} from "react";
import "./order-suggestions.css";
const n=value=>value==null?"—":Number(value).toLocaleString("el-GR",{maximumFractionDigits:3});
const searchText=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR");
export default function OrderSuggestionsPanel({api,storeId}){
  const [options,setOptions]=useState({historyDays:30,coverageDays:7,leadDays:3}),[result,setResult]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const [query,setQuery]=useState(""),[page,setPage]=useState(0),[onlyNeeded,setOnlyNeeded]=useState(true);
  const request=useRef(0);
  const load=async(event)=>{
    event?.preventDefault();const current=++request.current;setResult(null);setError("");setPage(0);
    if(!storeId){setLoading(false);return;}setLoading(true);
    try{
      const data=await api(`/api/commerce/order-suggestions?${new URLSearchParams({storeId,...options})}`);
      if(!data||data.storeId!==storeId||!Array.isArray(data.rows))throw Error("Μη έγκυρη απάντηση προτάσεων.");
      if(request.current===current)setResult(data);
    }catch(e){if(request.current===current)setError(e.message||"Δεν μπόρεσαν να φορτωθούν οι προτάσεις.");}
    finally{if(request.current===current)setLoading(false);}
  };
  useEffect(()=>{load();return()=>{request.current++;};},[storeId]);
  const rows=useMemo(()=>(result?.rows||[]).filter(row=>(!onlyNeeded||row.suggestedQuantity===null||row.suggestedQuantity>0)&&searchText(`${row.name} ${row.sku}`).includes(searchText(query.trim()))),[result,query,onlyNeeded]);
  const pages=Math.max(1,Math.ceil(rows.length/3)),currentPage=Math.min(page,pages-1),shown=rows.slice(currentPage*3,currentPage*3+3);
  return <section className="order-suggestions" aria-label="Αυτόματες Προτάσεις Παραγγελίας">
    <header><h3>Αυτόματες Προτάσεις Παραγγελίας</h3><p>Ποσότητες για έλεγχο από τον ιδιοκτήτη, στις μονάδες αποθήκης.</p></header>
    <form onSubmit={load} className="order-suggestions-options">
      {[["historyDays","Ιστορικό πωλήσεων (ημέρες)",7,90],["coverageDays","Κάλυψη (ημέρες)",1,60],["leadDays","Παράδοση (ημέρες)",0,30]].map(([key,label,min,max])=><label key={key}>{label}<input type="number" min={min} max={max} step="1" required value={options[key]} onChange={e=>setOptions({...options,[key]:e.target.value})}/></label>)}
      <button disabled={loading||!storeId}>{loading?"Υπολογισμός…":"Υπολογισμός προτάσεων"}</button>
    </form>
    <div className="order-suggestions-filter"><label>Προϊόν ή κωδικός<input placeholder="Αναζήτηση προτάσεων" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label><label className="order-suggestions-check"><input type="checkbox" checked={onlyNeeded} onChange={e=>{setOnlyNeeded(e.target.checked);setPage(0);}}/>Μόνο ποσότητες για παραγγελία / έλεγχο</label></div>
    <div className="order-suggestions-content" aria-busy={loading}>
      {error?<div role="alert">{error} Δοκίμασε ξανά με «Υπολογισμός προτάσεων».</div>:loading?<p role="status">Φόρτωση αποθέματος και πωλήσεων…</p>:!storeId?<p>Επίλεξε κατάστημα.</p>:!result?null:<>
        <p className="order-suggestions-summary" role="status">{rows.length} είδη · ιστορικό {result.options.historyDays} ημερών · κάλυψη {result.options.coverageDays} + παράδοση {result.options.leadDays} ημερών</p>
        {!rows.length?<p>Δεν υπάρχουν προτάσεις με αυτά τα φίλτρα.</p>:<div className="order-suggestions-table"><table><thead><tr><th>Προϊόν / μονάδα</th><th>Απόθεμα / ελάχιστο</th><th>Καθαρή κίνηση / ημέρα</th><th>Πρόταση</th><th>Αιτιολογία</th></tr></thead><tbody>{shown.map(row=><tr key={row.productId}><td><b>{row.name}</b><small>{row.sku||"—"} · {row.unitLabel}</small></td><td>{n(row.currentStock)} / {n(row.minStock)}</td><td>{n(row.netQuantity)} / {n(row.dailyDemand)}<small>Πωλήσεις {n(row.soldQuantity)} · επιστροφές/ακυρώσεις {n(row.returnedQuantity)}</small></td><td className="order-suggestions-quantity">{n(row.suggestedQuantity)}<small>{row.unitLabel}</small></td><td>{row.reason}{row.warnings.map(warning=><small className="order-suggestions-warning" key={warning}>{warning}</small>)}</td></tr>)}</tbody></table></div>}
        <nav aria-label="Σελίδες προτάσεων"><button type="button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Προηγούμενα</button><span>{currentPage+1} / {pages}</span><button type="button" disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>Επόμενα</button></nav>
      </>}
    </div>
    <footer>Στόχος = το μεγαλύτερο από ελάχιστο απόθεμα και καθαρή ημερήσια κίνηση × (κάλυψη + παράδοση). Πρόταση = στόχος − απόθεμα, με στρογγυλοποίηση προς τα πάνω. Κίνηση από γραμμές ολοκληρωμένων πωλήσεων, σε κυλιόμενες ημέρες· οι αναλώσεις υλικών συνταγών δεν προβλέπονται εδώ. Έλεγξε εκκρεμείς παραγγελίες, διαθεσιμότητα και συσκευασίες· δεν έχουν αφαιρεθεί από την πρόταση. Δεν υποβάλλεται παραγγελία.</footer>
  </section>;
}
