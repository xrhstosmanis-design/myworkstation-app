import React,{useEffect,useRef,useState} from "react";
import {Barcode,Printer,Search,X} from "lucide-react";
import {isValidEan13,writeEan13Label} from "../../utils/ean13-label.js";
import "./pos-barcode-registration.css";

const euro=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});

export default function PosBarcodeRegistrationModal({api,store,onClose,onChanged,initialQuery=""}){
  const searchRequest=useRef(0),context=useRef(""),saveLock=useRef(false);
  const [rows,setRows]=useState([]),[query,setQuery]=useState(initialQuery),[selected,setSelected]=useState(null),[barcode,setBarcode]=useState(""),[price,setPrice]=useState(""),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState("");
  const [missingOnly,setMissingOnly]=useState(!initialQuery),[offset,setOffset]=useState(0),[summary,setSummary]=useState(null);
  const scope=JSON.stringify([store.id,query,missingOnly,offset]);context.current=scope;
  const [labelConfig,setLabelConfig]=useState(null);
  useEffect(()=>{let active=true;setLabelConfig(null);api(`/api/store-pos/stores/${store.id}/label-settings`).then(result=>{if(active)setLabelConfig(result)}).catch(err=>{if(active)setError(`Δεν φορτώθηκαν οι ρυθμίσεις ετικέτας: ${err.message}`)});return()=>{active=false}},[api,store.id]);
  const load=async(q=query,{clearError=true}={})=>{
    const request=++searchRequest.current,captured=scope;setBusy(true);if(clearError)setError("");
    try{
      const result=await api(`/api/store-pos/stores/${store.id}/barcode-registration?q=${encodeURIComponent(q)}&missingOnly=${missingOnly}&offset=${offset}`);
      if(request!==searchRequest.current||context.current!==captured)return;
      if(offset>0&&offset>=Number(result.totalMatches||0)){setOffset(0);return}
      setRows(result.rows||[]);setSummary({scope:captured,missingCount:result.missingCount,totalMatches:result.totalMatches});
      setSelected(current=>current?((result.rows||[]).find(row=>row.id===current.id)||null):null);
    }catch(err){if(request===searchRequest.current&&context.current===captured){setSummary(null);setRows([]);setError(err.message)}}
    finally{if(request===searchRequest.current&&context.current===captured)setBusy(false)}
  };
  useEffect(()=>{setRows([]);setSummary(null);setSelected(null);const timer=setTimeout(()=>load(query),query.trim()?220:0);return()=>{clearTimeout(timer);searchRequest.current++}},[api,store.id,query,missingOnly,offset]);
  useEffect(()=>{
    const refresh=()=>{if(!saving&&!busy&&document.visibilityState!=="hidden")load(query,{clearError:false})};
    const timer=setInterval(refresh,60000);window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
    return()=>{clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh)};
  },[api,scope,saving,busy]);
  const choose=row=>{setSelected(row);setBarcode("");setPrice(String(Number(row.salePrice||0).toFixed(2)).replace(".",","));setError("")};
  const save=async()=>{
    if(saveLock.current)return;
    if(!selected||!barcode.trim())return setError("Επίλεξε προϊόν και σκάναρε ή γράψε το νέο barcode.");
    const salePrice=price.trim()===""?null:Number(price.replace(",","."));if(salePrice!==null&&(!Number.isFinite(salePrice)||salePrice<0))return setError("Η νέα τιμή δεν είναι έγκυρη.");
    const captured=scope;saveLock.current=true;setSaving(true);setError("");
    try{const result=await api(`/api/store-pos/stores/${store.id}/barcode-registration`,{method:"POST",body:JSON.stringify({productId:selected.id,barcode:barcode.trim(),salePrice})});if(context.current!==captured)return;onChanged?.(result.message);setSelected(null);setBarcode("");setPrice("");await load(query)}
    catch(err){if(context.current===captured){setError(err.message);await load(query,{clearError:false})}}
    finally{saveLock.current=false;setSaving(false)}
  };
  const printLabel=async code=>{
    if(!labelConfig)return setError("Περίμενε να φορτωθούν οι ρυθμίσεις ετικέτας.");
    const value=String(code.barcode||"").trim();
    if(!isValidEan13(value))return setError("Η εκτύπωση αυτή υποστηρίζει μόνο έγκυρο EAN-13.");
    const printWindow=window.open("","_blank","width=620,height=460");
    if(!printWindow)return setError("Ο browser εμπόδισε το παράθυρο εκτύπωσης. Επίτρεψε τα αναδυόμενα για το MyWorkStation.");
    try{writeEan13Label(printWindow,{barcode:value,productName:selected.name,price:code.salePrice==null?selected.salePrice:code.salePrice,storeName:labelConfig.storeName,settings:labelConfig.settings})}
    catch(err){printWindow.close();return setError(`Δεν ανοίχτηκε ετικέτα: ${err.message}`)}
    try{await api(`/api/store-pos/stores/${store.id}/audit`,{method:"POST",body:JSON.stringify({actionType:"LABEL_PREVIEW_OPENED",details:{productId:selected.id,productName:selected.name,sku:selected.sku||null,barcode:value,source:"BARCODE_CARD"}})})}
    catch(err){setError(`Η προεπισκόπηση άνοιξε, αλλά δεν καταγράφηκε στο Audit: ${err.message}`)}
  };
  return <div className="category-product-overlay pos-price-modal pos-barcode-registration" onMouseDown={e => e.target === e.currentTarget && !busy && !saving && onClose()}><section role="dialog" aria-modal="true" aria-labelledby="pos-barcode-registration-title"><header><div><small>POS · ΑΠΟΘΗΚΗ ΚΑΤΑΣΤΗΜΑΤΟΣ</small><h2 id="pos-barcode-registration-title"><Barcode /> Έλεγχος και καταχώρηση νέου Barcode</h2><p>Πολλά barcode, διαφορετικές τιμές, ένα κοινό προϊόν και απόθεμα.</p></div><button aria-label="Κλείσιμο καταχώρησης Barcode" onClick={() => !busy && !saving && onClose()}><X /></button></header><div className="pos-price-body"><div className="pos-barcode-search"><input autoFocus disabled={saving} value={query} onChange={e => {setOffset(0);setQuery(e.target.value)}} onKeyDown={e => e.key === "Enter" && load(query)} placeholder="Όνομα παλιού προϊόντος, SKU ή barcode" /><button className="pos-primary-inline" onClick={() => load(query)}><Search /> Αναζήτηση</button></div><div className="pos-barcode-pending-status" role="status">{summary?.scope===scope&&Number.isSafeInteger(summary.missingCount)?(summary.missingCount>0?<>Υπάρχουν <b>{summary.missingCount}</b> είδη χωρίς barcode. <button type="button" onClick={()=>{setQuery("");setOffset(0);setMissingOnly(true)}}>Προβολή ειδών</button></>:"Όλα τα είδη έχουν barcode."):"Έλεγχος εκκρεμών barcode…"}</div><label className="pos-barcode-filter"><input type="checkbox" disabled={saving} checked={missingOnly} onChange={e=>{setMissingOnly(e.target.checked);setOffset(0)}}/> Μόνο είδη χωρίς barcode</label>{error && <div className="store-pos-alert error" role="alert">{error}</div>}<div className="pos-barcode-workspace"><div className="pos-barcode-results">{rows.map(row => <button type="button" key={row.id} onClick={() => choose(row)} aria-pressed={selected?.id === row.id} style={{
              background: selected?.id === row.id ? "#dff5ec" : "#fff"
            }}><b>{row.name}</b><small style={{
                display: "block"
              }}>{row.sku || "Χωρίς SKU"} · stock {row.currentStock} · {euro(row.salePrice)}</small><small style={{
                display: "block",
                color: (row.barcodes || []).length ? "#52635f" : "#a33",
                fontWeight: 800
              }}>{(row.barcodes || []).length ? (row.barcodes || []).map(code => `${code.barcode}${code.salePrice == null ? "" : ` (${euro(code.salePrice)})`}`).join(" · ") : "ΧΩΡΙΣ BARCODE"}</small></button>)}{!busy&&rows.length===0&&<p>Δεν βρέθηκαν είδη με αυτά τα φίλτρα.</p>}<div className="pos-barcode-pagination"><button type="button" disabled={busy||saving||offset===0} onClick={()=>setOffset(Math.max(0,offset-250))}>Προηγούμενα</button><span>{summary?.scope===scope?`${offset+Math.min(1,rows.length)}–${offset+rows.length} / ${summary.totalMatches??rows.length}`:"…"}</span><button type="button" disabled={busy||saving||!summary||offset+rows.length>=Number(summary.totalMatches||0)} onClick={()=>setOffset(offset+250)}>Επόμενα</button></div></div><div className="pos-barcode-details">{selected ? <div style={{
              display: "grid",
              gap: 11
            }}><div><small>ΕΠΙΛΕΓΜΕΝΟ ΠΡΟΪΟΝ</small><h3 style={{
                  margin: "4px 0"
                }}>{selected.name}</h3><b>Κοινό απόθεμα: {selected.currentStock}</b></div><label>Νέο barcode<input inputMode="numeric" value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="Σκάναρε ή πληκτρολόγησε" /></label><label>Τιμή πώλησης αυτού του barcode<input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="π.χ. 4,20" /></label><button className="pos-primary-inline" disabled={busy||saving} onClick={save}>{saving ? "Αποθήκευση…" : "Σύνδεση barcode με το προϊόν"}</button><div style={{
                display: "grid",
                gap: 6
              }}><b>Ετικέτες ήδη καταχωρισμένων EAN-13</b>{(selected.barcodes || []).filter(code => isValidEan13(String(code.barcode || "").trim())).map(code => <button type="button" key={code.barcode} disabled={busy||saving || !labelConfig} onClick={() => printLabel(code)}><Printer size={15} /> {code.barcode} · {euro(code.salePrice == null ? selected.salePrice : code.salePrice)}</button>)}{!(selected.barcodes || []).some(code => isValidEan13(String(code.barcode || "").trim())) && <small>Δεν υπάρχει έγκυρο EAN-13 στο προϊόν. Αποθήκευσε πρώτα το barcode και άνοιξε ξανά το προϊόν.</small>}</div><small>Χωρίς δικαίωμα αλλαγής τιμής, η τιμή πηγαίνει για έγκριση. Το barcode παραμένει συνδεδεμένο με το ίδιο προϊόν.</small></div> : <div style={{
              padding: 20,
              background: "#f5f8f7",
              borderRadius: 9
            }}>Επίλεξε προϊόν από τη λίστα. Απενεργοποίησε το «Μόνο είδη χωρίς barcode» για προσθήκη επιπλέον barcode σε υπάρχον προϊόν.</div>}</div></div></div></section></div>;
}
