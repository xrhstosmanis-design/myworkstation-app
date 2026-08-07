import React,{useEffect,useMemo,useState} from "react";
import {ArrowLeft,Boxes,Cloud,Copy,History,Link2,Monitor,PackagePlus,ReceiptText,RefreshCw,ShieldOff,ShieldCheck,Users,WalletCards,Wifi,WifiOff} from "lucide-react";
import CashControlPanel from "./CashControlPanel.jsx";
import OperatorAccessPanel from "./OperatorAccessPanel.jsx";
import StoreTransactionsPanel from "../store/StoreTransactionsPanel.jsx";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const when=value=>value?new Date(value).toLocaleString("el-GR"):"—";

export default function StoreCloudPage({api,store,onBack}){
  const [data,setData]=useState(null);
  const [activeModules,setActiveModules]=useState(new Set());
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [pairing,setPairing]=useState(null);
  const [drafts,setDrafts]=useState({});
  const [ledgerVersion,setLedgerVersion]=useState(0);

  const load=async(showSpinner=true)=>{
    if(showSpinner)setLoading(true);
    setError("");
    try{
      const [result,license]=await Promise.all([
        api(`/api/cloud/v1/stores/${store.id}/overview`),
        api("/api/license/current")
      ]);
      setData(result);
      setActiveModules(new Set(license.activeModules||[]));
      setDrafts(Object.fromEntries((result.catalog||[]).map(item=>[item.id,{name:item.name,category:item.category,price:String(item.price),active:item.active}])));
    }catch(err){setError(err.message)}finally{if(showSpinner)setLoading(false)}
  };
  useEffect(()=>{load()},[store.id]);

  const online=useMemo(()=>data?.devices?.filter(device=>device.isOnline).length||0,[data]);
  const createPairing=async()=>{
    setBusy("pair");setError("");setMessage("");
    try{
      const result=await api(`/api/cloud/v1/stores/${store.id}/pairing-code`,{method:"POST",body:JSON.stringify({minutes:15})});
      setPairing(result);setMessage("Ο νέος κωδικός σύνδεσης είναι έτοιμος για τον δεύτερο υπολογιστή.");
    }catch(err){setError(err.message)}finally{setBusy("")}
  };
  const createDemo=async()=>{
    setBusy("demo");setError("");setMessage("");
    try{
      await api(`/api/cloud/v1/stores/${store.id}/demo-catalog`,{method:"POST",body:JSON.stringify({sku:"DEMO-COFFEE-001",name:"Freddo Espresso Demo",category:"Καφέδες",price:2.5})});
      setMessage("Το Demo προϊόν και η τιμή μπήκαν στην ουρά συγχρονισμού.");await load(false);
    }catch(err){setError(err.message)}finally{setBusy("")}
  };
  const saveItem=async item=>{
    const draft=drafts[item.id];
    setBusy(`item:${item.id}`);setError("");setMessage("");
    try{
      await api(`/api/cloud/v1/stores/${store.id}/catalog/${item.id}`,{method:"PATCH",body:JSON.stringify({...draft,price:Number(draft.price),active:Boolean(draft.active)})});
      setMessage(`Η αλλαγή του ${item.sku} μπήκε στην ουρά cloud.`);await load(false);
    }catch(err){setError(err.message)}finally{setBusy("")}
  };
  const deviceAction=async(device,action)=>{
    setBusy(`device:${device.id}`);setError("");setMessage("");
    try{
      await api(`/api/cloud/v1/devices/${device.id}/${action}`,{method:"POST",body:"{}"});
      setMessage(action==="revoke"?"Η συσκευή απενεργοποιήθηκε και το token ανακλήθηκε.":"Η συσκευή ενεργοποιήθηκε. Θα χρειαστεί νέο pairing για νέο token.");
      await load(false);
    }catch(err){setError(err.message)}finally{setBusy("")}
  };
  const copyCode=async()=>{
    if(!pairing?.code)return;
    try{await navigator.clipboard.writeText(pairing.code);setMessage("Ο κωδικός αντιγράφηκε.")}catch{setMessage(`Κωδικός: ${pairing.code}`)}
  };
  const goTo=sectionId=>document.getElementById(sectionId)?.scrollIntoView({behavior:"smooth",block:"start"});

  return <section className="cloud-page">
    <div className="cloud-titlebar">
      <button className="cloud-back" onClick={onBack}><ArrowLeft/>Πίσω στα καταστήματα</button>
      <button className="cloud-refresh" onClick={()=>load()} disabled={loading}><RefreshCw/>Ανανέωση</button>
    </div>
    <div className="cloud-hero">
      <div className="cloud-hero-icon"><Cloud/></div>
      <div><span className="cloud-kicker">GO LIVE 14.7.0C</span><h2>{store.name}</h2><p>Cloud Store Connector, pairing συσκευών και πρώτος ελεγχόμενος συγχρονισμός καταλόγου.</p></div>
    </div>
    <nav className="backoffice-section-nav" aria-label="Λειτουργίες Backoffice">
      <button type="button" onClick={()=>goTo("backoffice-operators")}><Users/>Χειριστές</button>
      <button type="button" onClick={()=>goTo("backoffice-transactions")}><ReceiptText/>Πωλήσεις & Πληρωμές</button>
      <button type="button" onClick={()=>goTo("backoffice-cash")}><WalletCards/>Βάρδιες & Ταμεία</button>
      <button type="button" onClick={()=>goTo("backoffice-catalog")}><Boxes/>Προϊόντα & Απόθεμα</button>
      <button type="button" onClick={()=>goTo("backoffice-devices")}><Monitor/>Συσκευές</button>
      <button type="button" onClick={()=>goTo("backoffice-audit")}><History/>Ιστορικό</button>
    </nav>
    {error&&<div className="cloud-alert cloud-error">{error}</div>}
    {message&&<div className="cloud-alert cloud-success">{message}</div>}
    {loading?<div className="cloud-loading">Γίνεται έλεγχος της σύνδεσης cloud…</div>:<>
      <div className="cloud-metrics">
        <article><span>Συσκευές</span><strong>{data?.devices?.length||0}</strong></article>
        <article><span>Online τώρα</span><strong>{online}</strong></article>
        <article><span>Cloud προϊόντα</span><strong>{data?.catalog?.length||0}</strong></article>
        <article><span>Τελευταία αλλαγή</span><strong className="cloud-date">{when(data?.latestChange?.createdAt)}</strong></article>
      </div>

      {activeModules.has("STORE_MODE")&&<div id="backoffice-operators" className="backoffice-anchor"><OperatorAccessPanel api={api} store={store}/></div>}

      {activeModules.has("CASH_CONTROL")&&<>
        <div id="backoffice-transactions" className="backoffice-anchor"><StoreTransactionsPanel api={api} store={store} onChanged={()=>setLedgerVersion(v=>v+1)}/></div>
        <div id="backoffice-cash" className="backoffice-anchor"><CashControlPanel key={`cash-${ledgerVersion}`} api={api} store={store}/></div>
      </>}

      <div id="backoffice-catalog" className="cloud-two-columns backoffice-anchor">
        <article className="cloud-panel">
          <div className="cloud-panel-head"><div><h3><Link2/>Σύνδεση δεύτερου υπολογιστή</h3><p>Ο κωδικός ισχύει 15 λεπτά και χρησιμοποιείται μία φορά.</p></div><button onClick={createPairing} disabled={busy==="pair"}>{busy==="pair"?"Δημιουργία…":"Νέος κωδικός"}</button></div>
          {pairing?<div className="pairing-box"><small>PAIRING CODE</small><div><strong>{pairing.code}</strong><button onClick={copyCode} title="Αντιγραφή"><Copy/></button></div><p>Λήγει: {when(pairing.expiresAt)}</p></div>:<div className="cloud-empty">Δεν υπάρχει ενεργός κωδικός στην οθόνη. Δημιούργησε νέο μόνο όταν βρίσκεσαι μπροστά στον δεύτερο υπολογιστή.</div>}
          <ol className="pairing-steps"><li>Άνοιξε το Store Connector στον δεύτερο υπολογιστή.</li><li>Βάλε την online διεύθυνση του MyWorkStation.</li><li>Πληκτρολόγησε τον κωδικό και ολοκλήρωσε το pairing.</li></ol>
        </article>

        <article className="cloud-panel">
          <div className="cloud-panel-head"><div><h3><PackagePlus/>Demo catalog</h3><p>Πρώτη ασφαλής δοκιμή: ένα προϊόν και μία τιμή.</p></div><button onClick={createDemo} disabled={busy==="demo"}>{busy==="demo"?"Αποθήκευση…":"Δημιουργία Demo"}</button></div>
          {(data?.catalog||[]).length===0?<div className="cloud-empty">Δεν υπάρχει ακόμη cloud προϊόν. Πάτησε «Δημιουργία Demo».</div>:<div className="catalog-list">{data.catalog.map(item=>{
            const draft=drafts[item.id]||{name:item.name,category:item.category,price:String(item.price),active:item.active};
            return <div className="catalog-row" key={item.id}>
              <div className="catalog-code"><b>{item.sku}</b><small>Version {item.version}</small></div>
              <input value={draft.name} onChange={e=>setDrafts(all=>({...all,[item.id]:{...draft,name:e.target.value}}))}/>
              <input value={draft.category} onChange={e=>setDrafts(all=>({...all,[item.id]:{...draft,category:e.target.value}}))}/>
              <input className="price-input" type="number" min="0" step="0.01" value={draft.price} onChange={e=>setDrafts(all=>({...all,[item.id]:{...draft,price:e.target.value}}))}/>
              <label className="catalog-active"><input type="checkbox" checked={draft.active} onChange={e=>setDrafts(all=>({...all,[item.id]:{...draft,active:e.target.checked}}))}/>Ενεργό</label>
              <button onClick={()=>saveItem(item)} disabled={busy===`item:${item.id}`}>{busy===`item:${item.id}`?"…":"Αποθήκευση"}</button>
            </div>})}</div>}
        </article>
      </div>

      <article id="backoffice-devices" className="cloud-panel cloud-devices backoffice-anchor">
        <div className="cloud-panel-head"><div><h3><Monitor/>Συσκευές καταστήματος</h3><p>Online/offline κατάσταση, τελευταίος συγχρονισμός και απομακρυσμένη ανάκληση.</p></div></div>
        {(data?.devices||[]).length===0?<div className="cloud-empty">Δεν έχει συνδεθεί ακόμη συσκευή.</div>:<div className="device-list">{data.devices.map(device=><div className="device-row" key={device.id}>
          <span className={`device-state ${device.isOnline?"online":"offline"}`}>{device.isOnline?<Wifi/>:<WifiOff/>}</span>
          <div><b>{device.name}</b><small>{device.platform||"Windows / άγνωστη πλατφόρμα"} · Pairing {when(device.pairedAt)}</small></div>
          <div><span className={`status-pill ${device.status.toLowerCase()}`}>{device.status}</span><small>Τελευταία επαφή: {when(device.lastSeenAt)}</small></div>
          {device.status==="ACTIVE"?<button className="danger-action" onClick={()=>deviceAction(device,"revoke")} disabled={busy===`device:${device.id}`}><ShieldOff/>Απενεργοποίηση</button>:<button onClick={()=>deviceAction(device,"reactivate")} disabled={busy===`device:${device.id}`}><ShieldCheck/>Ενεργοποίηση</button>}
        </div>)}</div>}
      </article>

      <article id="backoffice-audit" className="cloud-panel cloud-audit backoffice-anchor">
        <div className="cloud-panel-head"><div><h3>Τελευταίες cloud ενέργειες</h3><p>Βασικό audit για pairing, αλλαγές καταλόγου και συσκευές.</p></div></div>
        {(data?.audit||[]).length===0?<div className="cloud-empty">Δεν υπάρχουν ακόμη cloud συμβάντα.</div>:<div className="audit-list">{data.audit.map(row=><div key={row.id}><b>{row.eventType.replaceAll("_"," ")}</b><span>{when(row.createdAt)}</span></div>)}</div>}
      </article>
    </>}
  </section>;
}
