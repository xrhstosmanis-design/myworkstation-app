import React,{useEffect,useMemo,useState} from "react";
import {Boxes,ChevronRight,Filter,Grid3X3,Layers3,List,RefreshCw,Search,Settings2,Tag} from "lucide-react";
import OwnerProductCenter from "./OwnerProductCenter.jsx";
import "./kiosk-style-backoffice.css";

const money=value=>`${Number(value||0).toFixed(2)} €`;
const text=value=>String(value??"").trim();

export default function KioskStyleProductCenter({api,stores=[]}){
  const [mode,setMode]=useState("items");
  const [rows,setRows]=useState([]);
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState("ALL");
  const [vat,setVat]=useState("ALL");
  const [status,setStatus]=useState("ALL");
  const [selected,setSelected]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const load=async()=>{
    setBusy(true);setError("");
    try{
      const data=await api(`/api/owner-products/catalog?q=${encodeURIComponent(query.trim())}`);
      setRows(Array.isArray(data)?data:[]);
      if(selected){const fresh=(data||[]).find(row=>row.id===selected.id);if(fresh)setSelected(fresh)}
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };

  useEffect(()=>{load()},[]);

  const categories=useMemo(()=>{
    const map=new Map();
    rows.forEach(row=>{const key=text(row.categoryName)||"ΧΩΡΙΣ ΚΑΤΗΓΟΡΙΑ";map.set(key,(map.get(key)||0)+1)});
    return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0],"el"));
  },[rows]);

  const filtered=useMemo(()=>rows.filter(row=>{
    const rowCategory=text(row.categoryName)||"ΧΩΡΙΣ ΚΑΤΗΓΟΡΙΑ";
    if(category!=="ALL"&&rowCategory!==category)return false;
    if(vat!=="ALL"&&String(Number(row.vatRate||0))!==vat)return false;
    if(status==="ACTIVE"&&row.active===false)return false;
    if(status==="INACTIVE"&&row.active!==false)return false;
    return true;
  }),[rows,category,vat,status]);

  const vatOptions=useMemo(()=>[...new Set(rows.map(row=>String(Number(row.vatRate||0))))].sort((a,b)=>Number(a)-Number(b)),[rows]);

  if(mode==="full")return <div className="kiosk-shell"><div className="kiosk-return"><button onClick={()=>setMode("items")}><List/>Επιστροφή στα Είδη</button><span>Πλήρης εμπορική διαχείριση MyWorkStation</span></div><OwnerProductCenter api={api} stores={stores}/></div>;

  return <div className="kiosk-shell">
    <div className="kiosk-topbar">
      <div><strong>MyWorkStation BackOffice</strong><span>Λογική Kiosk Manager · σύγχρονη έκδοση</span></div>
      <div className="kiosk-top-actions"><button onClick={load} disabled={busy}><RefreshCw/>Ανανέωση</button><button className="primary" onClick={()=>setMode("full")}><Settings2/>Πλήρης διαχείριση</button></div>
    </div>

    <div className="kiosk-main-tabs">
      <button className={mode==="items"?"active":""} onClick={()=>setMode("items")}><Boxes/>Είδη αποθήκης</button>
      <button className={mode==="categories"?"active":""} onClick={()=>setMode("categories")}><Layers3/>Κατηγορίες / Υποκατηγορίες</button>
    </div>

    {error&&<div className="kiosk-error">{error}</div>}

    {mode==="categories"?<div className="kiosk-category-workspace">
      <section className="kiosk-grid-panel">
        <div className="kiosk-grid-title"><b>Κατηγορίες ειδών</b><span>{categories.length} κατηγορίες</span></div>
        <div className="kiosk-table kiosk-category-table">
          <div className="kiosk-tr head"><span>Περιγραφή</span><span>Είδη</span><span>% ειδών</span><span></span></div>
          {categories.map(([name,count])=><button className="kiosk-tr" key={name} onClick={()=>{setCategory(name);setMode("items")}}><span><Tag/>{name}</span><span>{count}</span><span>{rows.length?((count/rows.length)*100).toFixed(2):"0.00"}%</span><span><ChevronRight/></span></button>)}
        </div>
      </section>
      <section className="kiosk-grid-panel empty-panel"><Layers3/><b>Υποκατηγορίες</b><p>Η περιοχή μένει στη γνώριμη διάταξη Kiosk Manager. Οι πραγματικές υποκατηγορίες θα εμφανίζονται εδώ μόλις συνδεθούν στο μοντέλο προϊόντων.</p></section>
    </div>:<div className="kiosk-items-workspace">
      <aside className="kiosk-left-list">
        <div className="kiosk-section-head"><b>Κατηγορίες</b><small>{rows.length} είδη</small></div>
        <button className={category==="ALL"?"selected":""} onClick={()=>setCategory("ALL")}><span>ΟΛΑ ΤΑ ΕΙΔΗ</span><b>{rows.length}</b></button>
        {categories.map(([name,count])=><button key={name} className={category===name?"selected":""} onClick={()=>setCategory(name)}><span>{name}</span><b>{count}</b></button>)}
      </aside>

      <main className="kiosk-grid-panel">
        <div className="kiosk-toolbar">
          <form onSubmit={e=>{e.preventDefault();load()}}><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Περιγραφή, κωδικός ή barcode"/><button>Αναζήτηση</button></form>
          <div className="kiosk-filters"><Filter/><select value={vat} onChange={e=>setVat(e.target.value)}><option value="ALL">Όλα τα ΦΠΑ</option>{vatOptions.map(value=><option key={value} value={value}>ΦΠΑ {value}%</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">Όλα</option><option value="ACTIVE">Ενεργά</option><option value="INACTIVE">Ανενεργά</option></select></div>
        </div>
        <div className="kiosk-grid-title"><b>{category==="ALL"?"ΕΙΔΗ ΑΠΟΘΗΚΗΣ":category}</b><span>{filtered.length} αποτελέσματα</span></div>
        <div className="kiosk-table">
          <div className="kiosk-tr head items"><span>Κωδικός</span><span>Περιγραφή</span><span>Κατηγορία</span><span>ΦΠΑ</span><span>Τιμή</span><span>Stock</span></div>
          {filtered.map(row=><button key={row.id} className={`kiosk-tr items ${selected?.id===row.id?"selected-row":""}`} onClick={()=>setSelected(row)}><span>{row.sku||"—"}</span><span><b>{row.name}</b><small>{(row.barcodes||[])[0]?.barcode||"Χωρίς barcode"}</small></span><span>{row.categoryName||"ΧΩΡΙΣ ΚΑΤΗΓΟΡΙΑ"}</span><span>{Number(row.vatRate||0)}%</span><span><b>{money(row.salePrice)}</b></span><span>{(row.stores||[]).reduce((sum,s)=>sum+Number(s.currentStock||0),0)}</span></button>)}
        </div>
      </main>

      <aside className="kiosk-product-card">
        {selected?<><div className="kiosk-card-head"><div><small>ΚΑΡΤΕΛΑ ΕΙΔΟΥΣ</small><h3>{selected.name}</h3></div><em className={selected.active===false?"off":""}>{selected.active===false?"ΑΝΕΝΕΡΓΟ":"ΕΝΕΡΓΟ"}</em></div>
          <dl><dt>Κωδικός</dt><dd>{selected.sku||"—"}</dd><dt>Κατηγορία</dt><dd>{selected.categoryName||"ΧΩΡΙΣ ΚΑΤΗΓΟΡΙΑ"}</dd><dt>ΦΠΑ</dt><dd>{Number(selected.vatRate||0)}% {selected.vatVerified?"✓":"(μη επιβεβαιωμένο)"}</dd><dt>Λιανική</dt><dd>{money(selected.salePrice)}</dd><dt>Κόστος</dt><dd>{money(selected.costPrice)}</dd><dt>Barcode</dt><dd>{(selected.barcodes||[]).map(x=>x.barcode).join(", ")||"—"}</dd></dl>
          <div className="kiosk-store-stock"><b>Καταστήματα</b>{(selected.stores||[]).map(store=><div key={store.storeId}><span>{store.storeName}</span><span>{money(store.salePrice)} · Stock {Number(store.currentStock||0)}</span></div>)}</div>
          <button className="primary full-card" onClick={()=>setMode("full")}><Grid3X3/>Άνοιγμα πλήρους καρτέλας / τιμών</button>
        </>:<div className="kiosk-empty-card"><Boxes/><b>Επίλεξε είδος</b><span>Η καρτέλα θα εμφανιστεί εδώ, όπως στη λογική του Kiosk Manager.</span></div>}
      </aside>
    </div>}
  </div>;
}
