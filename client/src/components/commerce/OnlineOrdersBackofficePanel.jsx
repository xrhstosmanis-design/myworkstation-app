import React,{useEffect,useMemo,useState} from "react";
import {ChevronDown,ChevronUp,Clock3,CreditCard,RefreshCw,Search,ShoppingBag} from "lucide-react";
import "./online-orders-backoffice.css";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const stamp=value=>value?new Date(value).toLocaleString("el-GR",{dateStyle:"short",timeStyle:"short"}):"—";
const statusText=status=>({NEW:"ΝΕΑ",ACCEPTED:"ΑΠΟΔΟΧΗ",PREPARING:"ΕΤΟΙΜΑΖΕΤΑΙ",READY:"ΕΤΟΙΜΗ",OUT_FOR_DELIVERY:"ΣΤΟ DELIVERY",DELIVERED:"ΠΑΡΑΔΟΘΗΚΕ",CANCELLED:"ΑΚΥΡΩΘΗΚΕ"})[status]||status;

function LinkSummary({order}){
  const sale=order.sale,transaction=order.shiftTransaction;
  if(!sale)return <div className="online-link-wait"><Clock3/><div><b>Εμπορική εγγραφή σε αναμονή</b><span>Η πώληση και η πραγματική αφαίρεση από την αποθήκη δημιουργούνται όταν η παραγγελία γίνει «ΠΑΡΑΔΟΘΗΚΕ».</span></div></div>;
  return <div className="online-link-grid">
    <article><ShoppingBag/><span>Πώληση</span><b>{sale.id}</b><small>{money(sale.total)} · {sale.status}</small></article>
    <article><CreditCard/><span>Πληρωμή</span><b>{(sale.payments||[]).map(p=>p.method).join(" + ")||"—"}</b><small>{(sale.payments||[]).map(p=>money(p.amount)).join(" · ")||"—"}</small></article>
    <article><Clock3/><span>Βάρδια</span><b>{transaction?.sessionId||"—"}</b><small>{transaction?`${transaction.type} · ${money(transaction.amount)}`:"Δεν βρέθηκε συνδεδεμένη συναλλαγή βάρδιας"}</small></article>
  </div>;
}

export default function OnlineOrdersBackofficePanel({api}){
  const [katStore,setKatStore]=useState(null);
  const [storeId,setStoreId]=useState("");
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(false);
  const [storeLoading,setStoreLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("ALL");
  const [expanded,setExpanded]=useState(null);

  useEffect(()=>{
    let active=true;
    setStoreLoading(true);
    api("/api/public/kat/catalog",{cache:"no-store"})
      .then(data=>{
        if(!active)return;
        const store=data?.store||null;
        setKatStore(store);
        setStoreId(store?.id||"");
        if(!store)setError("Δεν βρέθηκε το πραγματικό κατάστημα Κυλικείο ΚΑΤ στο Online Ordering.");
      })
      .catch(e=>{if(active){setKatStore(null);setStoreId("");setError(e?.message||"Δεν ήταν δυνατή η σύνδεση με το Κυλικείο ΚΑΤ.")}})
      .finally(()=>{if(active)setStoreLoading(false)});
    return()=>{active=false};
  },[api]);

  const load=async()=>{
    if(!storeId){setRows([]);return}
    setLoading(true);setError("");
    try{
      const data=await api(`/api/public/kat/backoffice-managed/stores/${encodeURIComponent(storeId)}/orders?limit=250`,{cache:"no-store"});
      setRows(data.rows||[]);
    }catch(e){setError(e?.message||"Δεν ήταν δυνατή η φόρτωση των Online Παραγγελιών.");setRows([])}finally{setLoading(false)}
  };
  useEffect(()=>{if(storeId)load()},[storeId]);

  const filtered=useMemo(()=>rows.filter(order=>{
    if(status!=="ALL"&&order.status!==status)return false;
    const needle=query.trim().toLocaleLowerCase("el-GR");
    if(!needle)return true;
    return [order.orderNumber,order.customerName,order.customerPhone,order.department,order.room,order.saleId].some(value=>String(value||"").toLocaleLowerCase("el-GR").includes(needle));
  }),[rows,query,status]);
  const activeCount=rows.filter(order=>!["DELIVERED","CANCELLED"].includes(order.status)).length;
  const deliveredCount=rows.filter(order=>order.status==="DELIVERED").length;

  return <section className="online-orders-backoffice">
    <header className="online-bo-head">
      <div><span className="online-bo-kicker">MYWORKSTATION BACKOFFICE</span><h2>Online Παραγγελίες</h2><p>Παραγγελίες του πραγματικού Κυλικείου ΚΑΤ, κατάσταση, πελάτης, πληρωμή και σύνδεση με την πραγματική εμπορική πώληση. Τα συμβάντα καταγράφονται στο κεντρικό BackOffice → Συμβάντα.</p></div>
      <button onClick={load} disabled={loading||!storeId}><RefreshCw className={loading?"spin":""}/>{loading?"Ανανέωση…":"Ανανέωση"}</button>
    </header>

    <div className="online-bo-counters">
      <article><span>Σύνολο</span><strong>{rows.length}</strong></article>
      <article><span>Ενεργές</span><strong>{activeCount}</strong></article>
      <article><span>Παραδόθηκαν</span><strong>{deliveredCount}</strong></article>
      <article><span>Με εμπορική πώληση</span><strong>{rows.filter(order=>order.saleId).length}</strong></article>
    </div>

    <div className="online-bo-toolbar">
      <label>Κατάστημα<select value={storeId} disabled><option value={storeId}>{storeLoading?"Φόρτωση Κυλικείου ΚΑΤ…":katStore?.name||"Κυλικείο ΚΑΤ"}</option></select></label>
      <label>Κατάσταση<select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">Όλες</option><option value="NEW">Νέες</option><option value="ACCEPTED">Αποδοχή</option><option value="PREPARING">Ετοιμάζεται</option><option value="READY">Έτοιμη</option><option value="OUT_FOR_DELIVERY">Delivery</option><option value="DELIVERED">Παραδόθηκε</option><option value="CANCELLED">Ακυρώθηκε</option></select></label>
      <label className="online-bo-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Αρ. παραγγελίας, πελάτης, τηλέφωνο…"/></label>
    </div>

    {error&&<div className="online-bo-error">{error}</div>}
    {!storeLoading&&!katStore&&!error&&<div className="online-bo-empty">Δεν βρέθηκε το πραγματικό Κυλικείο ΚΑΤ.</div>}
    {katStore&&!loading&&!error&&!filtered.length&&<div className="online-bo-empty">Δεν υπάρχουν παραγγελίες για τα επιλεγμένα φίλτρα.</div>}

    <div className="online-bo-list">{filtered.map(order=>{
      const open=expanded===order.id;
      return <article className={`online-bo-order ${open?"open":""}`} key={order.id}>
        <button className="online-bo-order-main" onClick={()=>setExpanded(open?null:order.id)}>
          <div className="online-bo-number"><b>#{order.orderNumber}</b><small>{stamp(order.createdAt)}</small></div>
          <div><span>Πελάτης</span><b>{order.customerName}</b><small>{order.customerPhone}</small></div>
          <div><span>Παράδοση</span><b>{order.fulfillmentType==="DELIVERY"?"Delivery":"Παραλαβή"}</b><small>{[order.department,order.room].filter(Boolean).join(" · ")||"—"}</small></div>
          <div><span>Σύνολο</span><b>{money(order.total)}</b><small>{order.paymentMethod==="CASH"?"Μετρητά":"Κάρτα"}</small></div>
          <div><span className={`online-bo-status s-${String(order.status).toLowerCase()}`}>{statusText(order.status)}</span><small>{order.saleId?"✓ Συνδεδεμένη πώληση":"Χωρίς οριστική πώληση"}</small></div>
          {open?<ChevronUp/>:<ChevronDown/>}
        </button>
        {open&&<div className="online-bo-detail">
          <LinkSummary order={order}/>
          <div className="online-bo-commercial-note"><ShoppingBag/><span><b>Μία πραγματική εμπορική συναλλαγή.</b> Με την παράδοση δημιουργείται η πώληση και αφαιρείται το απόθεμα απευθείας από την πραγματική Αποθήκη του Κυλικείου ΚΑΤ. Δεν υπάρχει δεύτερο online stock.</span></div>
        </div>}
      </article>
    })}</div>
  </section>;
}