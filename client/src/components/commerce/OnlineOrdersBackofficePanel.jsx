import React,{useEffect,useMemo,useState} from "react";
import {ChevronDown,ChevronUp,Clock3,CreditCard,PackageSearch,RefreshCw,Search,ShoppingBag,Warehouse} from "lucide-react";
import "./online-orders-backoffice.css";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const stamp=value=>value?new Date(value).toLocaleString("el-GR",{dateStyle:"short",timeStyle:"short"}):"—";
const statusText=status=>({NEW:"ΝΕΑ",ACCEPTED:"ΑΠΟΔΟΧΗ",PREPARING:"ΕΤΟΙΜΑΖΕΤΑΙ",READY:"ΕΤΟΙΜΗ",OUT_FOR_DELIVERY:"ΣΤΟ DELIVERY",DELIVERED:"ΠΑΡΑΔΟΘΗΚΕ",CANCELLED:"ΑΚΥΡΩΘΗΚΕ"})[status]||status;
const eventText=event=>{
  if(event.note==="ORDER_RECEIVED")return "Λήψη online παραγγελίας";
  if(event.note==="AUTO_PRINT_REQUESTED")return "Αίτημα αυτόματης εκτύπωσης μετά την αποδοχή";
  if(event.note==="PRINT_REQUESTED")return "Αίτημα εκτύπωσης / επανεκτύπωσης";
  if(event.kind==="SALE")return `Εμπορική πώληση ολοκληρώθηκε · ${event.saleId}`;
  if(event.kind==="PAYMENT")return `Πληρωμή καταχωρήθηκε · ${event.method} · ${money(event.amount)}`;
  if(event.kind==="STOCK")return `Κίνηση stock · ${event.description} · −${Number(event.quantity||0)}`;
  if(event.kind==="SHIFT")return `Συναλλαγή βάρδιας · ${event.type} · ${money(event.amount)}`;
  if(event.fromStatus===event.toStatus&&event.note)return event.note;
  if(!event.fromStatus&&event.toStatus==="NEW")return "Λήψη online παραγγελίας";
  return `${event.fromStatus?statusText(event.fromStatus)+" → ":""}${statusText(event.toStatus)}`;
};
const orderEvents=order=>{
  const events=[...(order.events||[])];
  if(order.sale){
    events.push({id:`sale-${order.sale.id}`,kind:"SALE",saleId:order.sale.id,createdAt:order.sale.createdAt||order.commercialPostedAt||order.deliveredAt});
    (order.sale.payments||[]).forEach(payment=>events.push({id:`payment-${payment.id}`,kind:"PAYMENT",method:payment.method,amount:payment.amount,createdAt:order.sale.createdAt||order.commercialPostedAt||order.deliveredAt}));
    (order.sale.stockLines||[]).filter(line=>line.trackStock).forEach((line,index)=>events.push({id:`stock-${order.sale.id}-${line.productId||index}`,kind:"STOCK",description:line.description,quantity:line.quantity,createdAt:order.sale.createdAt||order.commercialPostedAt||order.deliveredAt}));
  }
  if(order.shiftTransaction)events.push({id:`shift-${order.shiftTransaction.id}`,kind:"SHIFT",type:order.shiftTransaction.type,amount:order.shiftTransaction.amount,createdAt:order.shiftTransaction.createdAt});
  return events.sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0));
};

function LinkSummary({order}){
  const sale=order.sale,transaction=order.shiftTransaction;
  if(!sale)return <div className="online-link-wait"><Clock3/><div><b>Εμπορική εγγραφή σε αναμονή</b><span>Η πώληση, η πληρωμή και η πραγματική κίνηση stock δημιουργούνται όταν η παραγγελία γίνει «ΠΑΡΑΔΟΘΗΚΕ».</span></div></div>;
  const stock=(sale.stockLines||[]).filter(line=>line.trackStock);
  return <div className="online-link-grid">
    <article><ShoppingBag/><span>Πώληση</span><b>{sale.id}</b><small>{money(sale.total)} · {sale.status}</small></article>
    <article><CreditCard/><span>Πληρωμή</span><b>{(sale.payments||[]).map(p=>p.method).join(" + ")||"—"}</b><small>{(sale.payments||[]).map(p=>money(p.amount)).join(" · ")||"—"}</small></article>
    <article><Warehouse/><span>Κίνηση stock</span><b>{stock.length} προϊόντα</b><small>{stock.length?stock.map(line=>`${line.description} −${Number(line.quantity||0)}`).join(" · "):"Δεν υπήρχε προϊόν με παρακολούθηση stock"}</small></article>
    <article><Clock3/><span>Βάρδια</span><b>{transaction?.sessionId||"—"}</b><small>{transaction?`${transaction.type} · ${money(transaction.amount)}`:"Δεν βρέθηκε συνδεδεμένη συναλλαγή βάρδιας"}</small></article>
  </div>;
}

export default function OnlineOrdersBackofficePanel({api,stores=[]}){
  const katStores=useMemo(()=>stores.filter(store=>/ΚΥΛΙΚΕΙΟ\s*ΚΑΤ/i.test(String(store.name||""))),[stores]);
  const [storeId,setStoreId]=useState("");
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("ALL");
  const [expanded,setExpanded]=useState(null);
  const [detail,setDetail]=useState("links");

  useEffect(()=>{if(!storeId&&katStores[0])setStoreId(katStores[0].id)},[katStores,storeId]);
  const load=async()=>{
    if(!storeId)return;
    setLoading(true);setError("");
    try{const data=await api(`/api/public/kat/backoffice/stores/${encodeURIComponent(storeId)}/orders?limit=250`,{cache:"no-store"});setRows(data.rows||[])}catch(e){setError(e.message);setRows([])}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[storeId]);

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
      <div><span className="online-bo-kicker">MYWORKSTATION BACKOFFICE</span><h2>Online Παραγγελίες</h2><p>Ξεχωριστό ιστορικό παραγγελιών με άμεση σύνδεση σε πωλήσεις, πληρωμές, stock, βάρδιες και συμβάντα.</p></div>
      <button onClick={load} disabled={loading}><RefreshCw className={loading?"spin":""}/>{loading?"Ανανέωση…":"Ανανέωση"}</button>
    </header>

    <div className="online-bo-counters">
      <article><span>Σύνολο</span><strong>{rows.length}</strong></article>
      <article><span>Ενεργές</span><strong>{activeCount}</strong></article>
      <article><span>Παραδόθηκαν</span><strong>{deliveredCount}</strong></article>
      <article><span>Με εμπορική πώληση</span><strong>{rows.filter(order=>order.saleId).length}</strong></article>
    </div>

    <div className="online-bo-toolbar">
      <label>Κατάστημα<select value={storeId} onChange={e=>setStoreId(e.target.value)}>{katStores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <label>Κατάσταση<select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">Όλες</option><option value="NEW">Νέες</option><option value="ACCEPTED">Αποδοχή</option><option value="PREPARING">Ετοιμάζεται</option><option value="READY">Έτοιμη</option><option value="OUT_FOR_DELIVERY">Delivery</option><option value="DELIVERED">Παραδόθηκε</option></select></label>
      <label className="online-bo-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Αρ. παραγγελίας, πελάτης, τηλέφωνο…"/></label>
    </div>

    {error&&<div className="online-bo-error">{error}</div>}
    {!katStores.length&&<div className="online-bo-empty">Δεν βρέθηκε το Κυλικείο ΚΑΤ στα καταστήματα του λογαριασμού.</div>}
    {katStores.length&&!loading&&!filtered.length&&<div className="online-bo-empty">Δεν υπάρχουν παραγγελίες για τα επιλεγμένα φίλτρα.</div>}

    <div className="online-bo-list">{filtered.map(order=>{
      const open=expanded===order.id;
      const timeline=orderEvents(order);
      return <article className={`online-bo-order ${open?"open":""}`} key={order.id}>
        <button className="online-bo-order-main" onClick={()=>{setExpanded(open?null:order.id);setDetail("links")}}>
          <div className="online-bo-number"><b>#{order.orderNumber}</b><small>{stamp(order.createdAt)}</small></div>
          <div><span>Πελάτης</span><b>{order.customerName}</b><small>{order.customerPhone}</small></div>
          <div><span>Παράδοση</span><b>{order.fulfillmentType==="DELIVERY"?"Delivery":"Παραλαβή"}</b><small>{[order.department,order.room].filter(Boolean).join(" · ")||"—"}</small></div>
          <div><span>Σύνολο</span><b>{money(order.total)}</b><small>{order.paymentMethod==="CASH"?"Μετρητά":"Κάρτα"}</small></div>
          <div><span className={`online-bo-status s-${String(order.status).toLowerCase()}`}>{statusText(order.status)}</span><small>{order.saleId?"✓ Συνδεδεμένη πώληση":"Χωρίς οριστική πώληση"}</small></div>
          {open?<ChevronUp/>:<ChevronDown/>}
        </button>
        {open&&<div className="online-bo-detail">
          <div className="online-bo-tabs">
            <button className={detail==="links"?"active":""} onClick={()=>setDetail("links")}>Σύνδεση BackOffice</button>
            <button className={detail==="items"?"active":""} onClick={()=>setDetail("items")}>Προϊόντα / Stock</button>
            <button className={detail==="events"?"active":""} onClick={()=>setDetail("events")}>Συμβάντα ({timeline.length})</button>
          </div>
          {detail==="links"&&<LinkSummary order={order}/>} 
          {detail==="items"&&<div className="online-bo-items"><div className="online-bo-items-head"><span>Προϊόν</span><span>Ποσ.</span><span>Online τιμή</span><span>Σύνολο</span><span>Stock</span></div>{(order.items||[]).map(item=>{const stockLine=(order.sale?.stockLines||[]).find(line=>line.productId===item.productId);return <div key={item.id}><span><b>{item.productName}</b></span><span>{item.quantity}</span><span>{money(item.onlineUnitPrice)}</span><span>{money(item.lineTotal)}</span><span>{order.saleId?(stockLine?.trackStock?`−${Number(stockLine.quantity||0)}`:"Δεν παρακολουθείται"):"Στην παράδοση"}</span></div>})}</div>}
          {detail==="events"&&<div className="online-bo-events">{timeline.map(event=><div key={event.id}><span></span><div><b>{eventText(event)}</b><small>{stamp(event.createdAt)}{event.employeeId?` · Εργαζόμενος ${event.employeeId}`:""}</small></div></div>)}</div>}
          <div className="online-bo-commercial-note"><PackageSearch/><span><b>Μία εμπορική συναλλαγή.</b> Δεν δημιουργείται δεύτερο online stock. Με την παράδοση η ίδια παραγγελία συνδέεται με Sale/SaleLine, Payment, StoreTransaction και το ενιαίο stock ledger.</span></div>
        </div>}
      </article>
    })}</div>
  </section>;
}
