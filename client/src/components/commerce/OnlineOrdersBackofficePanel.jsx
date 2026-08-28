import React,{useEffect,useMemo,useState} from "react";
import {AlertTriangle,Box,ChevronDown,ChevronUp,Clock3,CreditCard,FileCheck2,RefreshCw,Search,ShoppingBag} from "lucide-react";
import "./online-orders-backoffice.css";

const TEST_STORE_ID="kat-test-store";
const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const stamp=value=>value?new Date(value).toLocaleString("el-GR",{dateStyle:"short",timeStyle:"short"}):"—";
const statusText=status=>({NEW:"ΝΕΑ",ACCEPTED:"ΑΠΟΔΟΧΗ",PREPARING:"ΕΤΟΙΜΑΖΕΤΑΙ",READY:"ΕΤΟΙΜΗ",OUT_FOR_DELIVERY:"ΣΤΟ DELIVERY",DELIVERED:"ΠΑΡΑΔΟΘΗΚΕ",CANCELLED:"ΑΚΥΡΩΘΗΚΕ"})[status]||status;

function LinkSummary({order}){
  const sale=order.sale,transaction=order.shiftTransaction,attempt=order.eftposAttempt,movements=order.stockMovements||[];
  if(!sale&&order.status==="CANCELLED")return <div className="online-link-wait"><AlertTriangle/><div><b>Ακύρωση {order.cancellationStage==="BEFORE_PRODUCTION"?"πριν την παραγωγή":"μετά την έναρξη παραγωγής"}</b><span>{order.cancelReason||"Χωρίς αιτιολογία"} · {order.cancellationDisposition||"Απαιτείται έλεγχος"}. Δεν δημιουργήθηκε πώληση, fiscal ή αυτόματη επιστροφή stock.</span></div></div>;
  if(!sale)return <div className="online-link-wait"><Clock3/><div><b>Εμπορική εγγραφή σε αναμονή</b><span>Η πώληση και η πραγματική αφαίρεση από την αποθήκη δημιουργούνται όταν η παραγγελία γίνει «ΠΑΡΑΔΟΘΗΚΕ».</span></div></div>;
  const fiscalOk=sale.fiscalStatus&&!['NON_FISCAL','NOT_SUBMITTED','PENDING'].includes(sale.fiscalStatus),card=(sale.payments||[]).some(p=>p.method==='CARD');
  const nodes=[
    {Icon:ShoppingBag,label:'Order → Sale',ok:true,value:sale.id,detail:`${money(sale.total)} · ${sale.status}`},
    {Icon:FileCheck2,label:'Fiscal Receipt',ok:fiscalOk,value:sale.fiscalStatus||'ΧΩΡΙΣ FISCAL',detail:fiscalOk?'Φορολογική ροή καταγεγραμμένη':'Απαιτείται fiscalization'},
    {Icon:CreditCard,label:'EFTPOS Transaction',ok:card?attempt?.status==='SUCCESS':true,warn:card&&['PLANNED','TIMEOUT'].includes(attempt?.status),value:card?(attempt?.eftposDeviceCode||'ΧΩΡΙΣ EFTPOS ATTEMPT'):'Δεν απαιτείται',detail:card?(attempt?`${attempt.status} · προσπάθεια ${attempt.attemptNo||1}`:'Λείπει σύνδεση EFTPOS'):'Πληρωμή χωρίς κάρτα'},
    {Icon:Box,label:'Stock Movement',ok:movements.length>0,value:movements.length?`${movements.length} κινήσεις`:'ΧΩΡΙΣ ΚΙΝΗΣΗ',detail:movements.length?`${movements.reduce((sum,row)=>sum+Number(row.quantity||0),0)} συνολική ποσότητα`:'Έλεγχος stock/συνταγής'},
    {Icon:Clock3,label:'Βάρδια',ok:Boolean(transaction),value:transaction?.sessionId||'ΧΩΡΙΣ ΣΥΝΔΕΣΗ',detail:transaction?`${transaction.type} · ${money(transaction.amount)}`:'Λείπει συναλλαγή βάρδιας'}
  ];
  return <div className="online-reconciliation">{order.integrity?.issues?.length>0&&<div className="online-integrity-alert"><AlertTriangle/><div><b>ΠΙΘΑΝΟ DUPLICATE — απαιτείται χειροκίνητος έλεγχος</b><span>{order.integrity.issues.join(' · ')}. Δεν έγινε αυτόματη διαγραφή ή διόρθωση.</span></div></div>}<div className="online-reconciliation-title"><b>Order → Sale → Fiscal → EFTPOS → Stock</b><span>Κάθε κόκκινος κρίκος χρειάζεται συμφωνία πριν το go-live.</span></div><div className="online-link-grid">{nodes.map(({Icon,label,ok,warn,value,detail})=><article className={ok?'link-ok':warn?'link-warn':'link-missing'} key={label}><Icon/><span>{label}</span><b>{value}</b><small>{detail}</small><i>{ok?'OK':warn?'ΑΝΑΜΟΝΗ':'ΛΕΙΠΕΙ'}</i></article>)}</div></div>;
}

export default function OnlineOrdersBackofficePanel({api}){
  const [managedStores,setManagedStores]=useState([]);
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
    setError("");
    api("/api/public/kat/backoffice-managed/stores",{cache:"no-store"})
      .then(data=>{
        if(!active)return;
        const stores=Array.isArray(data?.stores)?data.stores:[];
        setManagedStores(stores);
        const realKat=stores.find(store=>store.id!==TEST_STORE_ID&&/ΚΥΛΙΚΕΙΟ\s*ΚΑΤ/i.test(String(store.name||"")));
        const preferred=realKat||stores.find(store=>store.id===TEST_STORE_ID)||stores[0]||null;
        setStoreId(preferred?.id||"");
        if(!preferred)setError("Δεν βρέθηκε κατάστημα με Online Παραγγελίες.");
      })
      .catch(e=>{if(active){setManagedStores([]);setStoreId("");setError(e?.message||"Δεν ήταν δυνατή η φόρτωση των καταστημάτων Online Παραγγελιών.")}})
      .finally(()=>{if(active)setStoreLoading(false)});
    return()=>{active=false};
  },[api]);

  const selectedStore=useMemo(()=>managedStores.find(store=>store.id===storeId)||null,[managedStores,storeId]);

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
      <div><span className="online-bo-kicker">MYWORKSTATION BACKOFFICE</span><h2>Online Παραγγελίες</h2><p>Παραγγελίες, κατάσταση, πελάτης, πληρωμή και σύνδεση με την πραγματική εμπορική πώληση. Τα συμβάντα καταγράφονται στο κεντρικό BackOffice → Συμβάντα.</p></div>
      <button onClick={load} disabled={loading||!storeId}><RefreshCw className={loading?"spin":""}/>{loading?"Ανανέωση…":"Ανανέωση"}</button>
    </header>

    <div className="online-bo-counters">
      <article><span>Σύνολο</span><strong>{rows.length}</strong></article>
      <article><span>Ενεργές</span><strong>{activeCount}</strong></article>
      <article><span>Παραδόθηκαν</span><strong>{deliveredCount}</strong></article>
      <article><span>Με εμπορική πώληση</span><strong>{rows.filter(order=>order.saleId).length}</strong></article>
      <article><span>Πιθανά duplicates</span><strong>{rows.filter(order=>order.integrity?.issues?.length).length}</strong></article>
    </div>

    <div className="online-bo-toolbar">
      <label>Κατάστημα<select value={storeId} onChange={e=>setStoreId(e.target.value)} disabled={storeLoading||!managedStores.length}>{storeLoading?<option value="">Φόρτωση…</option>:managedStores.map(store=><option key={store.id} value={store.id}>{store.id===TEST_STORE_ID?"TEST · Online Παραγγελίες":store.name}</option>)}</select></label>
      <label>Κατάσταση<select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">Όλες</option><option value="NEW">Νέες</option><option value="ACCEPTED">Αποδοχή</option><option value="PREPARING">Ετοιμάζεται</option><option value="READY">Έτοιμη</option><option value="OUT_FOR_DELIVERY">Delivery</option><option value="DELIVERED">Παραδόθηκε</option><option value="CANCELLED">Ακυρώθηκε</option></select></label>
      <label className="online-bo-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Αρ. παραγγελίας, πελάτης, τηλέφωνο…"/></label>
    </div>

    {error&&<div className="online-bo-error">{error}</div>}
    {!storeLoading&&!managedStores.length&&!error&&<div className="online-bo-empty">Δεν βρέθηκε κατάστημα με Online Παραγγελίες.</div>}
    {selectedStore&&!loading&&!error&&!filtered.length&&<div className="online-bo-empty">Δεν υπάρχουν παραγγελίες για τα επιλεγμένα φίλτρα.</div>}

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
          <div className="online-bo-commercial-note"><ShoppingBag/><span><b>Μία πραγματική εμπορική συναλλαγή.</b> Με την παράδοση δημιουργείται η πώληση και αφαιρείται το απόθεμα απευθείας από την πραγματική Αποθήκη του καταστήματος. Δεν υπάρχει δεύτερο online stock.</span></div>
        </div>}
      </article>
    })}</div>
  </section>;
}
