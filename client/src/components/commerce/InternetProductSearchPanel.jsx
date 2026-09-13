import React,{useEffect,useState} from "react";
import {AlertTriangle,ExternalLink,Globe2,Search,X} from "lucide-react";
import "./internet-product-search.css";

const euro=value=>value==null?"—":`${Number(value).toFixed(2).replace(".",",")} €`;
const typeLabel={WHOLESALER:"Χονδρέμπορος",SUPERMARKET:"Σούπερ μάρκετ",ONLINE_STORE:"Online κατάστημα",PUBLIC_INTERNET:"Δημόσια πηγή"};

export default function InternetProductSearchPanel({api,stores,onClose}){
  const [storeId,setStoreId]=useState(stores[0]?.id||"");
  const [query,setQuery]=useState("");
  const [catalogQuery,setCatalogQuery]=useState("");
  const [catalogRows,setCatalogRows]=useState([]),[product,setProduct]=useState(null);
  const [result,setResult]=useState(null),[history,setHistory]=useState([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{api("/api/commerce/internet-product-search/history").then(x=>setHistory(x.rows||[])).catch(()=>{})},[]);
  useEffect(()=>{if(catalogQuery.trim().length<2)return setCatalogRows([]);const timer=setTimeout(()=>api(`/api/commerce/internet-product-search/products?q=${encodeURIComponent(catalogQuery)}&storeId=${encodeURIComponent(storeId)}`).then(x=>setCatalogRows(x.rows||[])).catch(()=>setCatalogRows([])),220);return()=>clearTimeout(timer)},[catalogQuery,storeId]);
  const search=async event=>{event.preventDefault();setBusy(true);setError("");try{const params=new URLSearchParams({q:query,storeId});if(product?.id)params.set("productId",product.id);const data=await api(`/api/commerce/internet-product-search/market-search?${params}`);setResult(data);setHistory(rows=>[{id:data.id,query:data.query,resultCount:data.rows.length,createdAt:new Date().toISOString()},...rows].slice(0,50))}catch(e){setError(e.message)}finally{setBusy(false)}};
  return <div className="internet-search-overlay"><section className="internet-search-panel">
    <header><div><small>ΠΛΗΡΩΜΕΝΟ MODULE · SUPER ADMIN / ΙΔΙΟΚΤΗΤΗΣ</small><h2><Globe2/>Αναζήτηση προϊόντων στο Internet</h2><p>Σύγκριση δημόσιων τιμών, προσφορών και περιθωρίου — χωρίς αυτόματη αλλαγή τιμής.</p></div><button onClick={onClose} aria-label="Κλείσιμο"><X/></button></header>
    <form className="internet-search-form" onSubmit={search}>
      <label>Κατάστημα<select value={storeId} onChange={e=>setStoreId(e.target.value)} required>{stores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <label>Όνομα, barcode, προμηθευτής ή κατηγορία<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="π.χ. Coca Cola 500ml ή 544900..." required minLength="2"/></label>
      <label className="catalog-link">Σύνδεση με δικό μας προϊόν (προαιρετικά)<input value={catalogQuery} onChange={e=>{setCatalogQuery(e.target.value);setProduct(null)}} placeholder="Γράψε όνομα, SKU ή barcode"/>{catalogRows.length>0&&!product&&<div className="catalog-results">{catalogRows.map(row=><button type="button" key={row.id} onClick={()=>{setProduct(row);setCatalogQuery(row.name);setCatalogRows([])}}><b>{row.name}</b><span>{row.sku||"—"} · {row.barcode||"χωρίς barcode"} · αγορά {euro(row.costPrice)} · πώληση {euro(row.salePrice)}</span></button>)}</div>}{product&&<small>Συνδέθηκε: <b>{product.name}</b></small>}</label>
      <button className="internet-search-submit" disabled={busy}><Search/>{busy?"Αναζήτηση…":"Αναζήτηση"}</button>
    </form>
    {error&&<div className="internet-search-error">{error}</div>}
    <div className="internet-search-body">
      <main>{result?<><div className="internet-kpis"><article><span>Δική μας αγορά</span><b>{euro(result.own?.costPrice)}</b></article><article><span>Δική μας πώληση</span><b>{euro(result.own?.salePrice)}</b></article><article className={result.own?.marginPercent<15?"warn":""}><span>Margin</span><b>{result.own?.marginPercent==null?"—":`${result.own.marginPercent.toFixed(2)}%`}</b></article><article><span>Φθηνότερη δημόσια τιμή</span><b>{euro(result.cheapest?.price)}</b></article></div><div className="internet-recommendation"><AlertTriangle/><div><b>Πρόταση ελέγχου</b><span>{result.recommendation}</span><small>{result.warning}</small></div></div>{!result.configured&&<div className="internet-search-error">Δεν έχει ρυθμιστεί online provider. Απαιτείται SERPER_API_KEY στον server.</div>}<div className="internet-results"><div className="internet-result head"><span>Πηγή / προϊόν</span><span>Τύπος</span><span>Προσφορά</span><span>Τιμή</span><span>Διαφορά</span></div>{result.rows.map(row=><div className="internet-result" key={row.id}><span><b>{row.productName}</b><small>{row.sourceDomain}</small></span><span>{typeLabel[row.sourceType]||row.sourceType}</span><span>{row.offer||"—"}</span><b>{euro(row.price)}</b><span>{row.differenceFromOurSale==null?"—":euro(row.differenceFromOurSale)} {row.sourceUrl&&<a href={row.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink/></a>}</span></div>)}{!result.rows.length&&<p>Δεν βρέθηκαν δημόσια αποτελέσματα.</p>}</div></>:<div className="internet-empty"><Globe2/><b>Ξεκίνα αναζήτηση αγοράς</b><span>Οι τιμές εμφανίζονται ως προτάσεις και δεν αλλάζουν τον κατάλογο.</span></div>}</main>
      <aside><h3>Πρόσφατες αναζητήσεις</h3>{history.map(row=><button key={row.id} onClick={()=>setQuery(row.query)}><b>{row.query}</b><small>{row.resultCount} αποτελέσματα · {new Date(row.createdAt).toLocaleString("el-GR")}</small></button>)}{!history.length&&<p>Δεν υπάρχει ιστορικό.</p>}</aside>
    </div>
  </section></div>;
}
