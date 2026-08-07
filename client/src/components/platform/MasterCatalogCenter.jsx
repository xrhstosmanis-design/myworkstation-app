import React,{useEffect,useState} from "react";
import {createPortal} from "react-dom";
import {Database,FileSpreadsheet,Search,ShieldCheck,XCircle} from "lucide-react";
import "./master-catalog.css";

const api=async(path,options={})=>{
  const token=localStorage.getItem("token");
  const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);
  return data;
};

const fileToBase64=file=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");
  reader.onerror=()=>reject(new Error("Δεν ήταν δυνατή η ανάγνωση του αρχείου."));
  reader.readAsDataURL(file);
});

export default function MasterCatalogCenter(){
  const [toolbar,setToolbar]=useState(null);
  const [open,setOpen]=useState(false);
  const [file,setFile]=useState(null);
  const [base64,setBase64]=useState("");
  const [preview,setPreview]=useState(null);
  const [status,setStatus]=useState(null);
  const [query,setQuery]=useState("");
  const [results,setResults]=useState([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [done,setDone]=useState("");

  const loadStatus=async()=>{try{setStatus(await api("/api/platform/master-catalog/status"))}catch{}};
  useEffect(()=>{if(open)loadStatus()},[open]);
  useEffect(()=>{
    const resolveToolbar=()=>setToolbar(document.querySelector(".platform-title-actions"));
    resolveToolbar();
    const timer=setInterval(resolveToolbar,500);
    return()=>clearInterval(timer);
  },[]);

  const choose=async event=>{
    const selected=event.target.files?.[0];
    setPreview(null);setDone("");setError("");
    if(!selected)return;
    if(!/\.xlsx$/i.test(selected.name)){setError("Επίλεξε αρχείο Excel .xlsx.");return;}
    if(selected.size>8*1024*1024){setError("Το αρχείο ξεπερνά τα 8 MB.");return;}
    setFile(selected);setBusy(true);
    try{
      const encoded=await fileToBase64(selected);
      setBase64(encoded);
      const data=await api("/api/platform/master-catalog/preview",{method:"POST",body:JSON.stringify({filename:selected.name,base64:encoded})});
      setPreview(data);
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };

  const importNow=async()=>{
    if(!file||!base64||!preview)return;
    if(!window.confirm(`Να γίνει οριστική εισαγωγή ${preview.actualProducts.toLocaleString("el-GR")} προϊόντων στον Platform Master Catalog;`))return;
    setBusy(true);setError("");setDone("");
    try{
      const data=await api("/api/platform/master-catalog/import",{method:"POST",body:JSON.stringify({filename:file.name,base64})});
      setDone(data.alreadyImported?"Το ίδιο αρχείο είχε ήδη εισαχθεί. Δεν δημιουργήθηκαν διπλά προϊόντα.":`Η εισαγωγή ολοκληρώθηκε: ${Number(data.importedProducts||0).toLocaleString("el-GR")} προϊόντα.`);
      await loadStatus();
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };

  const search=async event=>{
    event?.preventDefault();
    if(query.trim().length<2)return;
    setBusy(true);setError("");
    try{setResults(await api(`/api/platform/master-catalog/search?q=${encodeURIComponent(query.trim())}`))}catch(err){setError(err.message)}finally{setBusy(false)}
  };

  const launcher=toolbar?createPortal(
    <button className="master-catalog-launcher" onClick={()=>setOpen(true)}><Database/>Master Catalog</button>,
    toolbar
  ):null;

  return <>
    {launcher}
    {open&&<div className="master-catalog-overlay">
      <div className="master-catalog-modal">
        <div className="master-catalog-head"><div><h2>Platform Master Product Catalog</h2><p>Κεντρική βάση προϊόντων — μόνο για SUPER_ADMIN</p></div><button onClick={()=>setOpen(false)}><XCircle/></button></div>
        {status&&<div className="master-kpis"><div><small>Προϊόντα στη βάση</small><b>{Number(status.catalog?.products||0).toLocaleString("el-GR")}</b></div><div><small>Χωρίς λιανική</small><b>{Number(status.catalog?.missingRetail||0).toLocaleString("el-GR")}</b></div><div><small>ΦΠΑ μη επιβεβαιωμένο</small><b>{Number(status.catalog?.vatUnverified||0).toLocaleString("el-GR")}</b></div></div>}
        {error&&<div className="master-alert error">{error}</div>}{done&&<div className="master-alert success">{done}</div>}
        <section className="master-section">
          <div className="master-section-title"><FileSpreadsheet/><div><h3>Εισαγωγή Excel</h3><p>Πρώτα γίνεται προεπισκόπηση. Η οριστική εισαγωγή απαιτεί δεύτερη ενέργεια.</p></div></div>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={choose} disabled={busy}/>
          {busy&&!preview&&<p>Ανάλυση αρχείου…</p>}
          {preview&&<div className="master-preview">
            <div className="master-kpis compact"><div><small>Πραγματικά προϊόντα</small><b>{preview.actualProducts.toLocaleString("el-GR")}</b></div><div><small>Δήλωση Excel</small><b>{preview.declaredTotal?.toLocaleString("el-GR")||"—"}</b></div><div><small>Διπλά barcode</small><b>{preview.duplicateBarcodes}</b></div><div><small>Χωρίς barcode</small><b>{preview.missingBarcodes}</b></div><div><small>Χωρίς λιανική</small><b>{preview.missingRetail}</b></div><div><small>ΦΠΑ μη επιβεβαιωμένο</small><b>{preview.vatUnverified.toLocaleString("el-GR")}</b></div></div>
            {preview.countDifference!==0&&<div className="master-alert warning">Η παλιά αναφορά του Excel δηλώνει {preview.declaredTotal?.toLocaleString("el-GR")} προϊόντα, αλλά βρέθηκαν {preview.actualProducts.toLocaleString("el-GR")} πραγματικές γραμμές προϊόντων. Η τελική γραμμή του φύλλου είναι σύνοψη και δεν θα εισαχθεί.</div>}
            <div className="master-alert info"><ShieldCheck/> Τα διπλά barcode θα εισαχθούν με απενεργοποιημένο automatic scan. Τιμές 0 θα γίνουν κενές και ο ΦΠΑ 0 θα χαρακτηριστεί μη επιβεβαιωμένος. Απόθεμα του Excel δεν μεταφέρεται σε κανένα κατάστημα.</div>
            {preview.duplicateDetails?.length>0&&<details><summary>Προβολή {preview.duplicateDetails.length} διπλών barcode</summary><div className="master-duplicates">{preview.duplicateDetails.map(item=><div key={item.barcode}><b>{item.barcode}</b>{item.products.map(product=><small key={`${item.barcode}-${product.sourceCode}`}>{product.sourceCode} · {product.name} · γραμμή {product.sourceRow}</small>)}</div>)}</div></details>}
            <button className="master-primary" onClick={importNow} disabled={busy||preview.alreadyImported}>{busy?"Εισαγωγή…":preview.alreadyImported?"Το αρχείο έχει ήδη εισαχθεί":"Οριστική εισαγωγή στον Master Catalog"}</button>
          </div>}
        </section>
        <section className="master-section">
          <div className="master-section-title"><Search/><div><h3>Έλεγχος καταλόγου</h3><p>Αναζήτηση με περιγραφή, κωδικό ή barcode μετά την εισαγωγή.</p></div></div>
          <form className="master-search" onSubmit={search}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="π.χ. ΑΛΦΑ 330 ή 520…"/><button disabled={busy}>Αναζήτηση</button></form>
          <div className="master-results">{results.map((row,index)=><div className="master-result" key={`${row.id}-${row.barcode||index}`}><span><b>{row.name}</b><small>{row.sourceCode} · {row.categoryName||"Χωρίς κατηγορία"}</small></span><span>{row.barcode||"χωρίς barcode"}{row.duplicateBarcode&&<small className="danger">διπλό — scan off</small>}</span><span>{row.defaultRetailPrice===null?"χωρίς τιμή":`${Number(row.defaultRetailPrice).toFixed(2)} €`}</span></div>)}</div>
        </section>
      </div>
    </div>}
  </>;
}
