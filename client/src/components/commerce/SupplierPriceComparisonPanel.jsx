import React,{useEffect,useMemo,useRef,useState} from "react";
import "./supplier-price-comparison.css";

const validCost = value => value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) > 0;
const money = value => validCost(value) ? Number(value).toLocaleString("el-GR",{style:"currency",currency:"EUR",minimumFractionDigits:3,maximumFractionDigits:6}) : "—";
const date = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString("el-GR",{timeZone:"Europe/Athens"}) : "—";
const searchText = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR");

export default function SupplierPriceComparisonPanel({api,storeId}){
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [query,setQuery]=useState(""),[basis,setBasis]=useState("lastCost");
  const request=useRef(0);
  const load=async()=>{
    const current=++request.current;
    setRows([]);setError("");setLoading(true);
    if(!storeId){setLoading(false);return;}
    try{
      const result=await api(`/api/commerce/supplier-price-comparison?${new URLSearchParams({storeId})}`);
      if(!Array.isArray(result))throw new Error("Η απάντηση της σύγκρισης δεν ήταν έγκυρη.");
      if(request.current===current)setRows(result);
    }catch(e){if(request.current===current)setError(e.message || "Δεν μπόρεσε να φορτωθεί η σύγκριση.");}
    finally{if(request.current===current)setLoading(false);}
  };
  useEffect(()=>{load();return()=>{request.current++;};},[storeId]);
  const products=useMemo(()=>{
    const groups=new Map();
    rows.forEach(row=>{
      if(!groups.has(row.productId))groups.set(row.productId,{id:row.productId,name:row.productName,sku:row.sku,unitLabel:row.unitLabel,suppliers:[]});
      groups.get(row.productId).suppliers.push(row);
    });
    return [...groups.values()].filter(product=>searchText([product.name,product.sku,...product.suppliers.map(row=>row.supplierName)].join(" ")).includes(searchText(query.trim())));
  },[rows,query]);
  return <section className="commerce-box supplier-comparison" aria-label="Σύγκριση Προμηθευτών">
    <div className="supplier-comparison-head"><div><h3>Σύγκριση Προμηθευτών</h3><p>Κόστος ανά κοινή μονάδα από εγκεκριμένες αγορές του επιλεγμένου καταστήματος.</p></div><button className="commerce-primary" disabled={loading||!storeId} onClick={load}>Ανανέωση σύγκρισης</button></div>
    <div className="supplier-comparison-filters">
      <label>Προϊόν, κωδικός ή προμηθευτής<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Αναζήτηση στη σύγκριση"/></label>
      <label>Βάση σύγκρισης<select value={basis} onChange={e=>setBasis(e.target.value)}><option value="lastCost">Τελευταία αγορά ανά προμηθευτή</option><option value="bestCost">Χαμηλότερη ιστορική τιμή</option></select></label>
    </div>
    <div className="supplier-comparison-body" aria-busy={loading}>
      {error?<div className="commerce-error" role="alert">{error} Πάτησε «Ανανέωση σύγκρισης» για νέα προσπάθεια.</div>
        :loading?<div role="status">Φόρτωση εγκεκριμένων αγορών…</div>
        :!storeId?<div className="supplier-comparison-empty">Επίλεξε κατάστημα για σύγκριση.</div>
        :rows.length===0?<div className="supplier-comparison-empty">Δεν υπάρχουν εγκεκριμένες αγορές με συνδεδεμένο προϊόν και προμηθευτή σε αυτό το κατάστημα.</div>
        :products.length===0?<div className="supplier-comparison-empty">Δεν βρέθηκαν προϊόντα με αυτή την αναζήτηση.</div>
        :<><p className="supplier-comparison-status" role="status">{products.length} προϊόντα · {basis==="lastCost"?"Σύγκριση τελευταίων αγορών":"Σύγκριση ιστορικών ελαχίστων"} · χωρίς ΦΠΑ</p><div className="supplier-comparison-products">{products.map(product=>{
          const suppliers=[...product.suppliers].sort((a,b)=>validCost(a[basis])&&validCost(b[basis])?Number(a[basis])-Number(b[basis]):validCost(a[basis])?-1:validCost(b[basis])?1:String(a.supplierName).localeCompare(String(b.supplierName),"el"));
          const comparable=suppliers.filter(row=>validCost(row[basis]));
          const minimum=comparable.length?Number(comparable[0][basis]):null;
          const winners=comparable.filter(row=>Math.abs(Number(row[basis])-minimum)<1e-8);
          const canCompare=comparable.length>=2;
          return <article className="supplier-comparison-product" key={product.id}>
            <header><div><h4>{product.name}</h4><p>Κωδικός: {product.sku||"—"} · Μονάδα σύγκρισης: {product.unitLabel}</p></div><span className="supplier-comparison-count">{suppliers.length} προμηθευτές · {comparable.length} έγκυρες τιμές</span></header>
            <div className="supplier-comparison-scroll"><table><thead><tr><th>Προμηθευτής</th><th>Τελευταίο κόστος / {product.unitLabel}</th><th>Ιστορικό ελάχιστο / {product.unitLabel}</th><th>Παραστατικό σύγκρισης</th><th>Διαφορά ανά {product.unitLabel}</th></tr></thead><tbody>{suppliers.map(supplier=>{
              const winner=canCompare&&validCost(supplier[basis])&&Math.abs(Number(supplier[basis])-minimum)<1e-8;
              const delta=canCompare&&validCost(supplier[basis])?Number(supplier[basis])-minimum:null;
              const documentNumber=basis==="lastCost"?supplier.lastDocumentNumber:supplier.bestDocumentNumber;
              const documentId=basis==="lastCost"?supplier.lastDocumentId:supplier.bestDocumentId;
              const documentDate=basis==="lastCost"?supplier.lastPurchaseAt:supplier.bestPurchaseAt;
              return <tr className={winner?"cheapest":""} key={supplier.supplierId}><td><b>{supplier.supplierName}</b>{winner&&<span className="supplier-comparison-badge">{winners.length>1?"ΙΔΙΑ ΧΑΜΗΛΟΤΕΡΗ ΤΙΜΗ":"ΧΑΜΗΛΟΤΕΡΗ ΤΙΜΗ"}</span>}<p>{supplier.comparablePurchaseCount} συγκρίσιμα παραστατικά</p>{supplier.excludedPurchaseCount>0&&<p className="supplier-comparison-warning">{supplier.excludedPurchaseCount} παραστατικά εκτός σύγκρισης</p>}</td><td><span className="supplier-comparison-price">{money(supplier.lastCost)}</span>{supplier.reason&&<p className="supplier-comparison-warning">{supplier.reason}</p>}{supplier.normalizationNote&&<p>{supplier.normalizationNote}</p>}</td><td className="supplier-comparison-price">{money(supplier.bestCost)}</td><td><b>{documentNumber||documentId||"—"}</b><p>{date(documentDate)}</p></td><td><span className="supplier-comparison-price">{delta===null?"—":delta<1e-8?"0,000 €":`+${money(delta)}`}</span>{delta!==null&&delta>=1e-8&&<p>+{(delta/minimum*100).toLocaleString("el-GR",{maximumFractionDigits:2})}% από τη χαμηλότερη</p>}</td></tr>;
            })}</tbody></table></div>
            <p className="supplier-comparison-summary">{canCompare?winners.length>1?"Υπάρχει ισοτιμία στη χαμηλότερη καταγεγραμμένη τιμή.":"Οι διαφορές υπολογίζονται αυτόματα από τη χαμηλότερη καταγεγραμμένη τιμή.":comparable.length===1?"Μία έγκυρη τιμή μόνο — χρειάζεται δεύτερος προμηθευτής για σύγκριση.":"Δεν υπάρχουν τιμές με επιβεβαιωμένη κοινή μονάδα."}</p>
          </article>;
        })}</div></>}
    </div>
    <div className="supplier-comparison-footer">Η τελευταία αγορά μπορεί να έχει διαφορετική ημερομηνία ανά προμηθευτή. Η ιστορική τιμή δεν αποτελεί σημερινή προσφορά. Το κόστος προκύπτει από τις καταγεγραμμένες καθαρές αξίες μετά τις εκπτώσεις και τις επιβεβαιωμένες μετατροπές συσκευασίας. Ελλιπή στοιχεία μένουν εκτός σύγκρισης.</div>
  </section>;
}
