import React,{useEffect,useMemo,useRef,useState} from "react";
import "./low-value-products.css";
const n=(value,digits=2)=>value==null?"—":Number(value).toLocaleString("el-GR",{maximumFractionDigits:digits});
const money=value=>value==null?"—":`${n(value)} €`;
const text=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR");
const labels={NO_SALES:"Χωρίς πωλήσεις",NO_NET_MOVEMENT:"Χωρίς θετική καθαρή κίνηση",SLOW_MOVEMENT:"Αργή κίνηση",LOSS:"Ζημιογόνες πωλήσεις",LOW_MARGIN:"Χαμηλό περιθώριο",REVIEW:"Ελλιπή στοιχεία / έλεγχος"};
export default function LowValueProductsPanel({api,storeId}){
 const [options,setOptions]=useState({historyDays:30,slowDays:90,marginPercent:20}),[result,setResult]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
 const [query,setQuery]=useState(""),[filter,setFilter]=useState("FINDINGS"),[page,setPage]=useState(0),[help,setHelp]=useState(false);
 const request=useRef(0);
 const load=async event=>{
  event?.preventDefault();const current=++request.current;setResult(null);setError("");setPage(0);
  if(!storeId){setLoading(false);return;}setLoading(true);
  try{
   const data=await api(`/api/commerce/low-value-products?${new URLSearchParams({storeId,...options})}`);
   if(!data||data.storeId!==storeId||!Array.isArray(data.rows)||!data.options)throw Error("Μη έγκυρη απάντηση αναφοράς.");
   if(current===request.current)setResult(data);
  }catch(e){if(current===request.current)setError(e.message||"Αποτυχία φόρτωσης αναφοράς.");}
  finally{if(current===request.current)setLoading(false);}
 };
 useEffect(()=>{load();return()=>{request.current++;};},[storeId]);
 const valid=result?.storeId===storeId?result:null;
 const rows=useMemo(()=>(valid?.rows||[]).filter(row=>text(`${row.name} ${row.sku}`).includes(text(query.trim()))&&
  (filter==="ALL"||filter==="FINDINGS"&&row.flags.length>0||filter==="MOVEMENT"&&row.flags.some(f=>["NO_SALES","NO_NET_MOVEMENT","SLOW_MOVEMENT"].includes(f))||filter==="MARGIN"&&row.flags.some(f=>["LOW_MARGIN","LOSS"].includes(f))||filter==="REVIEW"&&row.flags.includes("REVIEW"))),[valid,query,filter]);
 const pages=Math.max(1,Math.ceil(rows.length/5)),current=Math.min(page,pages-1),shown=rows.slice(current*5,current*5+5);
 return <section className="low-value-products" aria-label="Προϊόντα Χαμηλής Απόδοσης">
  <header><h3>Προϊόντα Χαμηλής Απόδοσης</h3><p>Στοιχεία για ανθρώπινη αξιολόγηση ανά κατάστημα.</p></header>
  <form onSubmit={load} className="low-value-options">
   {[["historyDays","Ιστορικό (ημέρες)",7,365,1],["slowDays","Όριο κάλυψης αποθέματος (ημέρες)",1,730,1],["marginPercent","Όριο μικτού περιθωρίου (%)",0,100,.1]].map(([key,label,min,max,step])=><label key={key}>{label}<input type="number" min={min} max={max} step={step} required value={options[key]} onChange={e=>setOptions({...options,[key]:e.target.value})}/></label>)}
   <button disabled={loading||!storeId}>{loading?"Υπολογισμός…":"Υπολογισμός αναφοράς"}</button>
  </form>
  <div className="low-value-filters"><label>Προϊόν ή κωδικός<input placeholder="Αναζήτηση προϊόντος" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label><label>Προβολή<select value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="FINDINGS">Μόνο ευρήματα</option><option value="ALL">Όλα τα ενεργά είδη</option><option value="MOVEMENT">Κίνηση / απόθεμα</option><option value="MARGIN">Περιθώριο / ζημία</option><option value="REVIEW">Ελλιπή στοιχεία</option></select></label></div>
  {error?<p role="alert">{error} Δοκίμασε ξανά με «Υπολογισμός αναφοράς».</p>:loading?<p role="status">Φόρτωση πωλήσεων και τεκμηριωμένου κόστους…</p>:!storeId?<p>Επίλεξε κατάστημα.</p>:valid?<>
   <p className="low-value-summary" role="status">{rows.length} από {valid.rows.length} είδη · ιστορικό {valid.options.historyDays} ημερών · κάλυψη &gt; {valid.options.slowDays} ημέρες · περιθώριο &lt; {n(valid.options.marginPercent)}%</p>
   <div className="low-value-table" aria-busy={loading}>{!rows.length?<p>Δεν υπάρχουν είδη με αυτά τα φίλτρα.</p>:<table><thead><tr><th>Προϊόν</th><th>Απόθεμα / κάλυψη</th><th>Πωλήσεις / επιστροφές</th><th>Καθαρές πωλήσεις / κόστος</th><th>Μικτό κέρδος / περιθώριο</th><th>Εύρημα και τεκμήρια</th></tr></thead><tbody>{shown.map(row=><tr key={row.productId}><td><b>{row.name}</b><small>{row.sku||"—"} · {row.unitLabel}</small></td><td>{n(row.currentStock,3)}<small>{n(row.daysOfStock,1)} ημέρες κάλυψης</small></td><td>{n(row.soldQuantity,3)} / {n(row.returnedQuantity,3)}<small>Καθαρή κίνηση {n(row.netQuantity,3)}</small></td><td>{money(row.salesNet)}<small>Κόστος {money(row.costValue)}</small></td><td>{money(row.profit)}<small>{n(row.margin)}{row.margin==null?"":"%"}</small></td><td>{row.flags.length?row.flags.map(flag=><b className={`low-value-flag ${flag==="LOSS"?"loss":""}`} key={flag}>{labels[flag]||flag}</b>):<span>Χωρίς εύρημα στα επιλεγμένα όρια</span>}{row.warnings.map(warning=><small className="low-value-warning" key={warning}>{warning}</small>)}{row.costEvidence.length>0&&<details><summary>Παραστατικά κόστους ({row.costEvidence.length})</summary>{row.costEvidence.map(e=><small key={e.documentId}>{e.number||e.documentId} · {new Date(e.date).toLocaleDateString("el-GR",{timeZone:"Europe/Athens"})}</small>)}</details>}</td></tr>)}</tbody></table>}</div>
   <nav aria-label="Σελίδες προϊόντων"><button type="button" disabled={current===0} onClick={()=>setPage(current-1)}>Προηγούμενα</button><span>{current+1} / {pages}</span><button type="button" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>Επόμενα</button></nav>
  </>:null}
  <footer><button type="button" onClick={()=>setHelp(!help)} aria-expanded={help}>Πώς αξιολογούνται</button><span>Ένδειξη για έλεγχο. Δεν αλλάζουν προϊόντα, τιμές ή παραγγελίες.</span></footer>
  {help&&<div className="low-value-help" role="region" aria-label="Αιτιολογία αξιολόγησης"><p>Κάλυψη = τωρινό θετικό απόθεμα / μέση ημερήσια καθαρή κίνηση. Αργή κίνηση όταν ξεπερνά το επιλεγμένο όριο. Χωρίς πωλήσεις και επιστροφές που μηδενίζουν τη ζήτηση εμφανίζονται χωριστά. Η περίοδος είναι κυλιόμενη έως τη στιγμή υπολογισμού· ελλείψεις, εποχικότητα και πρόσφατες παραλαβές χρειάζονται ανθρώπινη κρίση.</p><p>Μικτό κέρδος = καθαρές πωλήσεις μετά τον πραγματικό ΦΠΑ − τεκμηριωμένο κόστος. Κόστος από το τελευταίο εγκεκριμένο τιμολόγιο πριν από την πώληση, στις επιβεβαιωμένες μονάδες· επιστροφή με κόστος ημερομηνίας αρχικής πώλησης. Μη επιμερισμένη έκπτωση ή ασυμφωνία συνόλου πώλησης αφήνει τα ποσά άγνωστα. Άγνωστο κόστος/μονάδα ή συνταγή αφήνει κέρδος και περιθώριο κενά. Δεν συνυπολογίζονται γενικά έξοδα, προμήθειες καναλιών ή κόστος υλικών συνταγών. Δεν αποτελεί πρόταση αυτόματης κατάργησης προϊόντος.</p><button type="button" onClick={()=>setHelp(false)}>Κλείσιμο βοήθειας</button></div>}
 </section>;
}
