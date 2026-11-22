import React,{useEffect,useRef,useState} from "react";
import {AlertTriangle,Check,ExternalLink,Globe2,Search,Warehouse,X,XCircle} from "lucide-react";
import "./internet-product-search.css";
import "./internet-product-search-workflow.css";

const euro=value=>value==null?"—":`${Number(value).toFixed(2).replace(".",",")} €`;
const typeLabel={WHOLESALER:"Χονδρέμπορος",SUPERMARKET:"Σούπερ μάρκετ",ONLINE_STORE:"Online κατάστημα",PUBLIC_INTERNET:"Δημόσια πηγή"};
const priceReasonLabel={UNIT_RATE_ONLY:"Μόνο τιμή ανά μονάδα μέτρησης — έλεγξε την πηγή.",AMBIGUOUS_PRICE:"Πολλαπλές τιμές — έλεγξε την πηγή.",NO_ITEM_PRICE:"Δεν εντοπίστηκε τιμή τεμαχίου."};
const matchLabel={EXACT:"Ακριβής",PROBABLE:"Πιθανή",NON_COMPARABLE:"Μη συγκρίσιμο",UNLINKED:"Χωρίς σύνδεση"};

export default function InternetProductSearchPanel({api,stores=[],companies=[],basePath="/api/commerce/internet-product-search",onClose}){
  const platform=companies.length>0,[companyId,setCompanyId]=useState(companies[0]?.id||"");
  const availableStores=platform?(companies.find(row=>row.id===companyId)?.stores||[]):stores;
  const [storeId,setStoreId]=useState(availableStores[0]?.id||"");
  const [query,setQuery]=useState("");
  const [catalogQuery,setCatalogQuery]=useState("");
  const [catalogRows,setCatalogRows]=useState([]),[product,setProduct]=useState(null),[inventoryOpen,setInventoryOpen]=useState(false);
  const [result,setResult]=useState(null),[history,setHistory]=useState([]);
  const [proposals,setProposals]=useState([]),[proposedPrice,setProposedPrice]=useState(""),[reason,setReason]=useState("");
  const [orderQty,setOrderQty]=useState(1),[orderDraft,setOrderDraft]=useState([]);
  const [confirmedMatches,setConfirmedMatches]=useState([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const lifetime=useRef(null),busyOwner=useRef(null),resultOrigin=useRef(null);
  const validScope=Boolean(storeId&&availableStores.some(row=>row.id===storeId)&&(!platform||companies.some(row=>row.id===companyId)));
  const scopeKey=JSON.stringify([platform,companyId,storeId,availableStores.map(row=>row.id)]);
  const clearScoped=()=>{setQuery("");setCatalogQuery("");setCatalogRows([]);setProduct(null);setInventoryOpen(false);setResult(null);setHistory([]);setProposals([]);setProposedPrice("");setReason("");setOrderQty(1);setOrderDraft([]);setConfirmedMatches([]);setBusy(false);setError("");busyOwner.current=null;resultOrigin.current=null};
  // A lifetime object, not just equal IDs, also fences A -> B -> A and changes
  // to the API/basePath authority. Reset during render avoids an actionable
  // old result in the frame before effect cleanup runs.
  if(!lifetime.current||lifetime.current.key!==scopeKey||lifetime.current.api!==api||lifetime.current.basePath!==basePath){
    const previous=lifetime.current;if(previous)previous.closed=true;
    lifetime.current={key:scopeKey,api,basePath,companyId,storeId,platform,valid:validScope,closed:false,channels:{}};
    if(previous)clearScoped();
  }
  const context=lifetime.current;
  const capture=channel=>{const c=lifetime.current;if(c!==context||!c.valid||c.closed)return null;const sequence=(c.channels[channel]||0)+1;c.channels[channel]=sequence;return {context:c,channel,sequence}};
  const current=t=>Boolean(t&&lifetime.current===t.context&&!t.context.closed&&t.context.channels[t.channel]===t.sequence);
  const begin=t=>{busyOwner.current=t;setBusy(true);setError("")};
  const finish=t=>{if(current(t)&&busyOwner.current===t){busyOwner.current=null;setBusy(false)}};
  const withCompany=(path,c=context)=>c.platform?`${path}${path.includes("?")?"&":"?"}companyId=${encodeURIComponent(c.companyId)}`:path;
  const readPath=(suffix,c)=>withCompany(`${c.basePath}${suffix}${suffix.includes("?")?"&":"?"}storeId=${encodeURIComponent(c.storeId)}`,c);
  const invalidate=()=>{if(lifetime.current)lifetime.current.closed=true;clearScoped()};
  const changeStore=value=>{invalidate();setStoreId(value)};
  const changeCompany=value=>{invalidate();setCompanyId(value);setStoreId(companies.find(row=>row.id===value)?.stores?.[0]?.id||"")};
  const close=()=>{invalidate();onClose?.()};
  useEffect(()=>{context.closed=false;return()=>{context.closed=true;for(const channel of Object.keys(context.channels))context.channels[channel]++}},[context]);
  const reloadProposals=async(c=context)=>{
    if(lifetime.current!==c||c.closed||!c.valid)return;
    const t=capture('proposals');if(!t)return;
    try{const data=await c.api(readPath('/price-proposals',c));if(current(t))setProposals(data.rows||[])}catch{if(current(t))setProposals([])}
  };
  useEffect(()=>{
    if(!context.valid||context.closed)return;
    const t=capture('history');
    context.api(readPath('/history',context)).then(data=>{if(current(t))setHistory(data.rows||[])}).catch(()=>{if(current(t))setHistory([])});
    reloadProposals(context);
  },[context]);
  // Debounced dropdown and the inventory picker share one channel: neither may
  // restore an older query after the other has advanced the visible selection.
  useEffect(()=>{
    const t=capture('catalog');
    if(!t)return;
    if(!inventoryOpen&&catalogQuery.trim().length<2){setCatalogRows([]);return}
    const timer=setTimeout(async()=>{
      try{const suffix=`/products?${inventoryOpen?'inventory=1&':''}q=${encodeURIComponent(catalogQuery)}`;const data=await context.api(readPath(suffix,context));if(current(t))setCatalogRows(data.rows||[])}catch{if(current(t))setCatalogRows([])}
    },inventoryOpen?0:220);
    return()=>{clearTimeout(timer);if(current(t))context.channels.catalog++};
  },[catalogQuery,inventoryOpen,context]);
  const changeCatalog=value=>{context.channels.catalog=(context.channels.catalog||0)+1;setCatalogRows([]);setCatalogQuery(value);setProduct(null)};
  const openInventory=()=>{if(!context.valid||context.closed)return;setError("");setCatalogRows([]);setInventoryOpen(true)};
  const selectProduct=(row,barcode=row.barcodes?.[0]||row.barcode||"")=>{if(!context.valid||context.closed)return;context.channels.catalog=(context.channels.catalog||0)+1;setProduct(row);setCatalogQuery(row.name);setCatalogRows([]);setInventoryOpen(false);setQuery(barcode||row.name)};
  const search=async event=>{
    event.preventDefault();const t=capture('search');if(!t)return;const c=t.context;begin(t);setConfirmedMatches([]);setResult(null);resultOrigin.current=null;setProposedPrice("");setReason("");
    try{const params=new URLSearchParams({q:query,storeId:c.storeId});if(product?.id)params.set("productId",product.id);if(c.platform)params.set("companyId",c.companyId);const data=await c.api(`${c.basePath}/market-search?${params}`);if(!current(t))return;resultOrigin.current={context:c,result:data};setResult(data);setProposedPrice(data.own?.salePrice??"");c.channels.history=(c.channels.history||0)+1;setHistory(rows=>[{id:data.id,query:data.query,resultCount:data.rows.length,createdAt:new Date().toISOString()},...rows].slice(0,50))}catch(e){if(current(t))setError(e.message)}finally{finish(t)}
  };
  const createProposal=async()=>{
    if(!currentResult()||!result?.own?.id)return;const t=capture('write');if(!t)return;const c=t.context;begin(t);
    try{await c.api(`${c.basePath}/price-proposals`,{method:"POST",body:JSON.stringify({companyId:c.platform?c.companyId:undefined,storeId:c.storeId,productId:result?.own?.id,searchId:result?.id,proposedPrice:Number(proposedPrice),reason})});if(!current(t))return;setReason("");await reloadProposals(c)}catch(e){if(current(t))setError(e.message)}finally{finish(t)}
  };
  const decide=async(id,decision)=>{
    const t=capture('write');if(!t||!proposals.some(row=>row.id===id))return;const c=t.context;begin(t);
    try{await c.api(`${c.basePath}/price-proposals/${id}/decision`,{method:"POST",body:JSON.stringify({companyId:c.platform?c.companyId:undefined,decision})});if(current(t))await reloadProposals(c)}catch(e){if(current(t))setError(e.message)}finally{finish(t)}
  };
  const eligibleRows=(result?.rows||[]).filter(row=>row.matchLevel==="EXACT"||confirmedMatches.includes(row.id)).filter(row=>row.comparablePrice!=null),safeCheapest=[...eligibleRows].sort((a,b)=>a.comparablePrice-b.comparablePrice)[0]||null;
  const currentResult=()=>lifetime.current===context&&!context.closed&&resultOrigin.current?.context===context&&resultOrigin.current?.result===result;
  const confirmMatch=id=>{if(currentResult())setConfirmedMatches(ids=>[...ids,id])};
  const addOrderSuggestion=()=>{if(!currentResult())return;const source=safeCheapest,own=result?.own,quantity=Math.max(1,Number(orderQty)||1);if(!source||!own)return;const unitPrice=Number(source.comparablePrice),saving=Number(((Number(own.costPrice)-unitPrice)*quantity).toFixed(2));setOrderDraft(rows=>[{id:`${result.id}:${Date.now()}`,productName:own.name,quantity,supplier:source.sourceDomain||source.productName,sourceUrl:source.sourceUrl,unitPrice,saving,reason:saving>0?`Φθηνότερο κατά ${euro(Number(own.costPrice)-unitPrice)} ανά τεμάχιο από το βασικό κόστος αγοράς.`:"Δεν είναι φθηνότερο από το βασικό κόστος — χρειάζεται εμπορικός έλεγχος."},...rows])};
  return <div className="internet-search-overlay"><section className="internet-search-panel">
    <header><div><small>ΠΛΗΡΩΜΕΝΟ MODULE · SUPER ADMIN / ΙΔΙΟΚΤΗΤΗΣ</small><h2><Globe2/>Αναζήτηση προϊόντων στο Internet</h2><p>Σύγκριση δημόσιων τιμών, προσφορών και περιθωρίου — χωρίς αυτόματη αλλαγή τιμής.</p></div><button onClick={close} aria-label="Κλείσιμο"><X/></button></header>
    <form className="internet-search-form" onSubmit={search}>
      {platform&&<label>Εταιρεία<select value={companyId} onChange={e=>changeCompany(e.target.value)} required>{companies.map(company=><option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}
      <label>Κατάστημα<select value={storeId} onChange={e=>changeStore(e.target.value)} required>{availableStores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <label>Όνομα, barcode, προμηθευτής ή κατηγορία<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="π.χ. Coca Cola 500ml ή 544900..." required minLength="2"/></label>
      <label className="catalog-link">Σύνδεση με δικό μας προϊόν αποθήκης<input value={catalogQuery} onChange={e=>changeCatalog(e.target.value)} placeholder="Γράψε όνομα, SKU ή barcode"/>{catalogRows.length>0&&!product&&!inventoryOpen&&<div className="catalog-results">{catalogRows.map(row=><button type="button" key={row.id} onClick={()=>selectProduct(row)}><b>{row.name}</b><span>{row.sku||"—"} · {row.barcode||"χωρίς barcode"} · αγορά {euro(row.costPrice)} · πώληση {euro(row.salePrice)}</span></button>)}</div>}{product&&<small>Συνδέθηκε: <b>{product.name}</b> · barcode <b>{query}</b></small>}</label>
      <button type="button" className="inventory-picker-button" onClick={openInventory} disabled={busy||!validScope||context.closed}><Warehouse/>Αποθήκη προϊόντων</button>
      <button className="internet-search-submit" disabled={busy||!validScope||context.closed}><Search/>{busy?"Αναζήτηση…":"Αναζήτηση"}</button>
    </form>
    {inventoryOpen&&<div className="inventory-picker"><div className="inventory-picker-head"><div><b>Αποθήκη επιλεγμένου καταστήματος</b><small>Διάλεξε προϊόν και barcode για ασφαλή αναζήτηση.</small></div><button type="button" onClick={()=>setInventoryOpen(false)}><X/></button></div><input autoFocus value={catalogQuery} onChange={e=>changeCatalog(e.target.value)} placeholder="Αναζήτηση στην αποθήκη..."/><div className="inventory-product-list">{catalogRows.map(row=><article key={row.id}><div><b>{row.name}</b><small>SKU {row.sku||"—"} · απόθεμα {row.currentStock} · αγορά {euro(row.costPrice)} · πώληση {euro(row.salePrice)}</small></div><div className="inventory-barcodes">{(row.barcodes||[]).map(barcode=><button type="button" key={barcode} onClick={()=>selectProduct(row,barcode)}>{barcode}</button>)}{!(row.barcodes||[]).length&&<button type="button" onClick={()=>selectProduct(row,"")}>Χωρίς barcode — αναζήτηση ονόματος</button>}</div></article>)}</div></div>}
    {error&&<div className="internet-search-error">{error}</div>}
    <div className="internet-search-body">
      <main>{result?<>
        <div className="internet-kpis"><article><span>Δική μας αγορά (καθαρή)</span><b>{euro(result.own?.costPrice)}</b></article><article><span>Δική μας πώληση (με ΦΠΑ)</span><b>{euro(result.own?.salePrice)}</b></article><article className={result.own?.marginPercent<15?"warn":""}><span>Margin χωρίς ΦΠΑ</span><b>{result.own?.marginPercent==null?"—":`${result.own.marginPercent.toFixed(2)}%`}</b></article><article><span>Φθηνότερη επιβεβαιωμένη τιμή</span><b>{euro(safeCheapest?.comparablePrice)}</b></article></div>
        <div className="internet-recommendation"><AlertTriangle/><div><b>Πρόταση ελέγχου</b><span>{result.recommendation}</span><small>{result.warning}</small></div></div>
        {result.own&&safeCheapest&&<div className="internet-order-suggestion"><b>Πρόταση αγοράς από {safeCheapest.sourceDomain||"τη φθηνότερη πηγή"}</b><span>{result.own.supplierName}: {euro(result.own.costPrice)} · νέα πηγή: {euro(safeCheapest.comparablePrice)} / τεμ. · διαφορά {euro(Number(result.own.costPrice)-Number(safeCheapest.comparablePrice))}</span><label>Ποσότητα<input type="number" min="1" step="1" value={orderQty} onChange={e=>setOrderQty(e.target.value)}/></label><button type="button" onClick={addOrderSuggestion}>Προσθήκη στην πρόταση παραγγελίας</button><small>Χρησιμοποιούνται μόνο ακριβείς αντιστοιχίσεις ή αποτελέσματα που επιβεβαίωσες χειροκίνητα. Έλεγξε διαθεσιμότητα, ΦΠΑ και μεταφορικά.</small></div>}
        {result.own&&!safeCheapest&&<div className="internet-safe-empty"><AlertTriangle/><span>Δεν υπάρχει ακόμη ασφαλής τιμή για πρόταση παραγγελίας. Επιτρέπεται μόνο ίδιο barcode ή χειροκίνητη επιβεβαίωση πιθανής αντιστοίχισης.</span></div>}
        {result.own&&<div className="internet-price-proposal"><b>Πρόταση νέας τιμής — δεν εφαρμόζεται πριν την έγκριση</b><input type="number" min="0" step="0.01" value={proposedPrice} onChange={e=>setProposedPrice(e.target.value)}/><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Αιτιολογία (προαιρετικά)"/><button type="button" onClick={createProposal} disabled={busy||!validScope||context.closed}>Υποβολή πρότασης</button></div>}
        {!result.configured&&<div className="internet-search-error">Δεν έχει ρυθμιστεί online provider. Απαιτείται SERPER_API_KEY ή Google CSE στον server.</div>}
        {result.configured&&result.providerReason==="PROVIDER_ERROR"&&<div className="internet-search-error">Ο πάροχος Internet δεν απάντησε σωστά. Δεν άλλαξε τιμή ή κατάλογος· έλεγξε τα κλειδιά του provider.</div>}
        {result.providerReason==="TIMEOUT"&&<div className="internet-search-error">Η online αναζήτηση άργησε να απαντήσει. Δοκίμασε ξανά.</div>}
        <div className="internet-results"><div className="internet-result head"><span>Πηγή / προϊόν</span><span>Ασφάλεια</span><span>Προσφορά</span><span>Τιμή / τεμ.</span><span>Διαφορά</span></div>{result.rows.map(row=><div className={`internet-result match-${String(row.matchLevel||"").toLowerCase()}`} key={row.id}><span><b>{row.productName}</b><small>{row.sourceDomain} · {typeLabel[row.sourceType]||row.sourceType}</small></span><span><b>{matchLabel[row.matchLevel]||row.matchLevel}</b><small>{row.matchReason}</small>{row.matchLevel==="PROBABLE"&&!confirmedMatches.includes(row.id)&&<button type="button" className="confirm-market-match" onClick={()=>confirmMatch(row.id)}>Επιβεβαίωση</button>}{confirmedMatches.includes(row.id)&&<small>✓ Επιβεβαιώθηκε από χρήστη</small>}</span><span>{row.offer||"—"}</span><span><b>{row.comparablePrice==null?euro(row.price):euro(row.comparablePrice)}</b>{row.price==null&&<small>{priceReasonLabel[row.priceReason]||"Δεν επιβεβαιώθηκε τιμή τεμαχίου."}</small>}</span><span>{row.differenceFromOurSale==null?"—":euro(row.differenceFromOurSale)} {row.sourceUrl&&<a href={row.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink/></a>}</span></div>)}{!result.rows.length&&<p>Δεν βρέθηκαν δημόσια αποτελέσματα.</p>}</div>
      </>:<div className="internet-empty"><Globe2/><b>Ξεκίνα αναζήτηση αγοράς</b><span>Οι τιμές εμφανίζονται ως προτάσεις και δεν αλλάζουν τον κατάλογο.</span></div>}</main>
      <aside><h3>Πρόταση παραγγελίας</h3>{orderDraft.map(row=><article className="internet-proposal" key={row.id}><b>{row.quantity} × {row.productName}</b><small>Από {row.supplier} · {euro(row.unitPrice)}/τεμ.</small><small>{row.reason}</small><em className={row.saving>0?"saving":""}>Όφελος {euro(row.saving)}</em>{row.sourceUrl&&<a href={row.sourceUrl} target="_blank" rel="noreferrer">Έλεγχος πηγής <ExternalLink/></a>}</article>)}{!orderDraft.length&&<p>Πρόσθεσε προϊόντα αφού συγκρίνεις τις τιμές.</p>}<h3>Προτάσεις τιμής</h3>{proposals.map(row=><article className="internet-proposal" key={row.id}><b>{row.productName}</b><small>{row.storeName} · {euro(row.currentPrice)} → {euro(row.proposedPrice)}</small><em>{row.status}</em>{row.status==="PENDING"&&<span><button onClick={()=>decide(row.id,"APPROVE")} disabled={busy||!validScope||context.closed}><Check/>Έγκριση</button><button onClick={()=>decide(row.id,"REJECT")} disabled={busy||!validScope||context.closed}><XCircle/>Απόρριψη</button></span>}</article>)}{!proposals.length&&<p>Δεν υπάρχουν προτάσεις.</p>}<h3>Πρόσφατες αναζητήσεις</h3>{history.map(row=><button key={row.id} onClick={()=>setQuery(row.query)}><b>{row.query}</b><small>{row.resultCount} αποτελέσματα · {new Date(row.createdAt).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false})}</small></button>)}{!history.length&&<p>Δεν υπάρχει ιστορικό.</p>}</aside>
    </div>
  </section></div>;
}
