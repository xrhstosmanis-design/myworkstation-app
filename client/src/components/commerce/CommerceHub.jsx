import React,{useEffect,useMemo,useState} from "react";
import {BarChart3,Boxes,ClipboardCheck,Clock3,FileScan,Files,LockKeyhole,PackagePlus,RadioTower,RefreshCw,ShoppingCart,Truck} from "lucide-react";
import InvoiceInboxPanel from "./InvoiceInboxPanel.jsx";
import AiReaderPanel from "./AiReaderPanel.jsx";
import SupplierManagementPanel from "./SupplierManagementPanel.jsx";
import SupplierPriceComparisonPanel from "./SupplierPriceComparisonPanel.jsx";
import RecipeManagementPanel from "./RecipeManagementPanel.jsx";
import AdvancedSalesAnalytics from "./AdvancedSalesAnalytics.jsx";
import AttendanceManagementPanel from "./AttendanceManagementPanel.jsx";
import DispatchProviderPanel from "./DispatchProviderPanel.jsx";
import ConnectorObserverPanel from "./ConnectorObserverPanel.jsx";
import NetlinkReportsPanel from "./NetlinkReportsPanel.jsx";
import "./commerce-hub.css";

const money=value=>`${Number(value||0).toFixed(2)} €`;
const number=value=>Number(value||0);

function readActive(){try{return JSON.parse(localStorage.getItem("activeModules")||"[]")}catch{return []}}

export default function CommerceHub({api,stores=[]}){
  const [activeModules,setActiveModules]=useState(readActive);
  const [catalog,setCatalog]=useState([]);
  const [tab,setTab]=useState("modules");
  const [storeId,setStoreId]=useState(stores[0]?.id||"");
  const [overview,setOverview]=useState(null);
  const [products,setProducts]=useState([]);
  const [inventory,setInventory]=useState([]);
  const [suppliers,setSuppliers]=useState([]);
  const [purchases,setPurchases]=useState([]);
  const [report,setReport]=useState(null);
  const [handover,setHandover]=useState([]);
  const [aiStatus,setAiStatus]=useState(null);
  const [cart,setCart]=useState([]);
  const [posLayout,setPosLayout]=useState({title:"OPERATOR POS",productColumns:6,showSku:true,theme:{headerColor:"#033d2f",accentColor:"#087a52",surfaceColor:"#ffffff"},quickKeys:[],categories:[],buttons:[{id:"cash",label:"ΜΕΤΡΗΤΑ",action:"CASH",color:"#078a4d",visible:true},{id:"card",label:"ΚΑΡΤΑ",action:"CARD",color:"#3979cc",visible:true}]});
  const [posCategory,setPosCategory]=useState("");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const active=new Set(activeModules);

  useEffect(()=>{if(!storeId&&stores[0])setStoreId(stores[0].id)},[stores,storeId]);
  useEffect(()=>{
    const onModules=e=>setActiveModules(e.detail?.activeModules||readActive());
    window.addEventListener("myworkstation:modules-updated",onModules);
    return()=>window.removeEventListener("myworkstation:modules-updated",onModules);
  },[]);

  const loadCatalog=async()=>{
    try{const data=await api("/api/license/current");setCatalog(data.modules||[]);setActiveModules(data.activeModules||[])}catch{}
  };

  const loadInventory=async()=>{
    if(!active.has("INVENTORY")||!storeId)return;
    const [o,p,i,s,d]=await Promise.all([
      api("/api/commerce/overview"),api("/api/commerce/products"),api(`/api/commerce/inventory?storeId=${encodeURIComponent(storeId)}`),api("/api/commerce/suppliers"),api("/api/commerce/purchases")
    ]);
    setOverview(o);setProducts(p);setInventory(i.rows||[]);setSuppliers(s);setPurchases(d);
  };

  const loadPos=async()=>{
    if(!storeId||!active.has("POS"))return;
    const tasks=[api(`/api/commerce/pos-layout?storeId=${encodeURIComponent(storeId)}`)];
    if(active.has("INVENTORY"))tasks.push(api(`/api/commerce/inventory?storeId=${encodeURIComponent(storeId)}`));
    const [layout,i]=await Promise.all(tasks);setPosLayout(current=>({...current,...(layout.layoutJson||{}),theme:{...current.theme,...(layout.layoutJson?.theme||{})},quickKeys:layout.layoutJson?.quickKeys||[],categories:layout.layoutJson?.categories||[],buttons:layout.layoutJson?.buttons||current.buttons}));setPosCategory("");if(i)setInventory(i.rows||[]);
  };

  const loadAnalytics=async()=>{
    if(!storeId||!active.has("SALES_ANALYTICS"))return;
    setReport(await api(`/api/commerce/sales/report?storeId=${encodeURIComponent(storeId)}`));
  };

  const loadHandover=async()=>{
    if(!storeId||!active.has("SHIFT_HANDOVER"))return;
    setHandover(await api(`/api/commerce/handover?storeId=${encodeURIComponent(storeId)}`));
  };

  const loadAi=async()=>{if(active.has("AI_READER"))setAiStatus(await api("/api/commerce/ai-reader/status"))};

  useEffect(()=>{loadCatalog()},[]);
  useEffect(()=>{
    setError("");setMessage("");
    if(tab==="inventory")loadInventory().catch(e=>setError(e.message));
    if(tab==="pos")loadPos().catch(e=>setError(e.message));
    if(tab==="analytics")loadAnalytics().catch(e=>setError(e.message));
    if(tab==="handover")loadHandover().catch(e=>setError(e.message));
    if(tab==="ai")loadAi().catch(e=>setError(e.message));
  },[tab,storeId,activeModules.join("|")]);

  const statusModules=useMemo(()=>catalog.filter(m=>["INVENTORY","POS","SALES_ANALYTICS","SHIFT_HANDOVER","AI_READER","DOCUMENTS","ATTENDANCE","CONNECTOR_RBS","REMOTE_SUPPORT"].includes(m.key)),[catalog]);

  const addProduct=async event=>{
    event.preventDefault();setError("");setMessage("");
    const f=new FormData(event.currentTarget);
    try{
      await api("/api/commerce/products",{method:"POST",body:JSON.stringify({name:f.get("name"),sku:f.get("sku")||null,barcodes:f.get("barcode")?[String(f.get("barcode"))]:[],salePrice:Number(f.get("salePrice")||0),costPrice:Number(f.get("costPrice")||0),vatRate:Number(f.get("vatRate")||24),storeId,openingStock:Number(f.get("openingStock")||0),trackStock:true})});
      event.currentTarget.reset();setMessage("Το προϊόν αποθηκεύτηκε.");await loadInventory();
    }catch(e){setError(e.message)}
  };

  const addSupplier=async event=>{
    event.preventDefault();setError("");
    const f=new FormData(event.currentTarget);
    try{await api("/api/commerce/suppliers",{method:"POST",body:JSON.stringify({name:f.get("name"),taxId:f.get("taxId")||null,phone:f.get("phone")||null})});event.currentTarget.reset();setMessage("Ο προμηθευτής αποθηκεύτηκε.");await loadInventory()}catch(e){setError(e.message)}
  };

  const adjustStock=async event=>{
    event.preventDefault();setError("");
    const f=new FormData(event.currentTarget);
    try{await api("/api/commerce/stock/movement",{method:"POST",body:JSON.stringify({storeId,productId:f.get("productId"),movementType:f.get("movementType"),quantity:Number(f.get("quantity")||0),note:f.get("note")||null})});event.currentTarget.reset();setMessage("Η κίνηση αποθήκης καταγράφηκε.");await loadInventory()}catch(e){setError(e.message)}
  };

  const addCart=product=>{
    const price=number(product.salePrice);
    setCart(current=>{const found=current.find(x=>x.id===product.id);return found?current.map(x=>x.id===product.id?{...x,qty:x.qty+1}:x):[...current,{id:product.id,name:product.name,qty:1,price,vatRate:number(product.vatRate||24)}]});
  };
  const cartTotal=cart.reduce((s,x)=>s+x.qty*x.price,0);
  const changeQty=(id,delta)=>setCart(current=>current.map(x=>x.id===id?{...x,qty:Math.max(0,x.qty+delta)}:x).filter(x=>x.qty>0));

  const completeSale=async method=>{
    if(!cart.length||!storeId)return;
    setError("");setMessage("");
    try{
      const result=await api("/api/commerce/sales",{method:"POST",body:JSON.stringify({storeId,lines:cart.map(x=>({productId:x.id,description:x.name,quantity:x.qty,unitPrice:x.price,vatRate:x.vatRate})),payments:[{method,amount:cartTotal}]})});
      setCart([]);setMessage(`Πώληση ${money(result.total)} καταγράφηκε ως ΜΗ ΦΟΡΟΛΟΓΙΚΗ.`);await loadPos();
    }catch(e){setError(e.message)}
  };
  const addQuickProduct=query=>{
    const needle=String(query||"").trim().toLocaleLowerCase("el-GR");
    const product=inventory.find(row=>[row.name,row.sku,row.categoryName].some(value=>String(value||"").toLocaleLowerCase("el-GR")===needle))||inventory.find(row=>String(row.name||"").toLocaleLowerCase("el-GR").includes(needle));
    if(!product)return setError(`Δεν βρέθηκε προϊόν για τη γρήγορη θέση «${query}».`);
    setError("");addCart(product);
  };
  const runPosAction=action=>{
    if(action==="CASH"||action==="CARD")return completeSale(action);
    if(action==="CLEAR_CART"){setCart([]);setMessage("Η τρέχουσα συναλλαγή καθαρίστηκε.");return}
    setMessage(`Η ενέργεια «${action}» επιλέχθηκε. Η φορολογική εκτέλεση παραμένει στον πιστοποιημένο Connector/Kiosk Manager.`);
  };
  const visiblePosProducts=posCategory?inventory.filter(product=>String(product.categoryName||"").toLocaleLowerCase("el-GR")===posCategory.toLocaleLowerCase("el-GR")):inventory;

  const createHandover=async event=>{
    event.preventDefault();const f=new FormData(event.currentTarget);setError("");
    try{await api("/api/commerce/handover",{method:"POST",body:JSON.stringify({storeId,priority:f.get("priority"),message:f.get("message")})});event.currentTarget.reset();setMessage("Η εκκρεμότητα παραδόθηκε στην επόμενη βάρδια.");await loadHandover()}catch(e){setError(e.message)}
  };

  const acknowledge=async handoverId=>{try{await api(`/api/commerce/handover/${handoverId}/ack`,{method:"POST",body:"{}"});await loadHandover()}catch(e){setError(e.message)}};

  return <div className="commerce-hub">
    <section className="panel">
      <div className="panel-head"><div><h2>Εμπορική λειτουργία</h2><p>POS, αποθήκη, παραστατικά, αναλύσεις και παράδοση βάρδιας πάνω στην ενιαία βάση MyWorkStation.</p></div><button onClick={()=>{loadCatalog();if(tab==="inventory")loadInventory();if(tab==="analytics")loadAnalytics();}}><RefreshCw/>Ανανέωση</button></div>
      <div className="commerce-module-strip">
        <button className={tab==="modules"?"active":""} onClick={()=>setTab("modules")}>Modules</button>
        <button disabled={!active.has("INVENTORY")} className={`${tab==="inventory"?"active":""} ${!active.has("INVENTORY")?"locked":""}`} onClick={()=>setTab("inventory")}><Boxes/> Αποθήκη</button>
        <button disabled={!active.has("POS")} className={`${tab==="pos"?"active":""} ${!active.has("POS")?"locked":""}`} onClick={()=>setTab("pos")}><ShoppingCart/> POS</button>
        <button disabled={!active.has("SALES_ANALYTICS")} className={`${tab==="analytics"?"active":""} ${!active.has("SALES_ANALYTICS")?"locked":""}`} onClick={()=>setTab("analytics")}><BarChart3/> Αναλυτική</button>
        <button disabled={!active.has("SHIFT_HANDOVER")} className={`${tab==="handover"?"active":""} ${!active.has("SHIFT_HANDOVER")?"locked":""}`} onClick={()=>setTab("handover")}><ClipboardCheck/> Παράδοση</button>
        <button disabled={!active.has("DOCUMENTS")} className={`${tab==="documents"?"active":""} ${!active.has("DOCUMENTS")?"locked":""}`} onClick={()=>setTab("documents")}><Files/> Θυρίδα Τιμολογίων</button>
        <button disabled={!active.has("AI_READER")} className={`${tab==="ai"?"active":""} ${!active.has("AI_READER")?"locked":""}`} onClick={()=>setTab("ai")}><FileScan/> Ανάγνωση τιμολογίων</button>
        <button disabled={!active.has("ATTENDANCE")} className={`${tab==="attendance"?"active":""} ${!active.has("ATTENDANCE")?"locked":""}`} onClick={()=>setTab("attendance")}><Clock3/> Παρουσίες</button>
        <button disabled={!active.has("INVENTORY")} className={`${tab==="dispatch"?"active":""} ${!active.has("INVENTORY")?"locked":""}`} onClick={()=>setTab("dispatch")}><Truck/> Δελτία / Πάροχος</button>
        <button disabled={!active.has("CONNECTOR_RBS")} className={`${tab==="observer"?"active":""} ${!active.has("CONNECTOR_RBS")?"locked":""}`} onClick={()=>setTab("observer")}><RadioTower/> RBS Observer</button>
        <button disabled={!active.has("NETLINK_PREPAID")} className={`${tab==="netlink"?"active":""} ${!active.has("NETLINK_PREPAID")?"locked":""}`} onClick={()=>setTab("netlink")}>NETLINK</button>
      </div>
      <label>Κατάστημα <select value={storeId} onChange={e=>setStoreId(e.target.value)}>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      {error&&<div className="commerce-error">{error}</div>}{message&&<div className="commerce-success">{message}</div>}
    </section>

    {tab==="modules"&&<section className="commerce-status-grid">{statusModules.map(module=><article key={module.key} className={`commerce-status-card ${module.active?"active":""} ${!module.commercialReady?"locked":""}`}><b>{module.name}</b><p>{module.description}</p><em>{module.active?"ΕΝΕΡΓΟ":module.commercialReady?"ΔΙΑΘΕΣΙΜΟ — ΑΝΕΝΕΡΓΟ":"ΥΠΟ ΑΝΑΠΤΥΞΗ / ΤΕΧΝΙΚΟ ΚΛΕΙΔΩΜΑ"}</em>{!module.commercialReady&&<LockKeyhole/>}</article>)}</section>}

    {tab==="netlink"&&<NetlinkReportsPanel api={api} storeId={storeId}/>}

    {tab==="inventory"&&<>
      <div className="commerce-cards"><article className="commerce-card"><span>Προϊόντα</span><strong>{overview?.products||products.length}</strong></article><article className="commerce-card"><span>Προμηθευτές</span><strong>{overview?.suppliers||suppliers.length}</strong></article><article className="commerce-card"><span>Παραστατικά αγορών</span><strong>{overview?.purchases||purchases.length}</strong></article><article className="commerce-card"><span>Καταγεγραμμένες πωλήσεις</span><strong>{overview?.sales||0}</strong></article></div>
      <div className="commerce-grid"><section className="commerce-box"><h3>Απόθεμα καταστήματος</h3><div className="commerce-table"><div className="commerce-row head"><span>Προϊόν</span><span>SKU</span><span>Τιμή</span><span>Απόθεμα</span><span>Κόστος</span></div>{inventory.map(row=><div className="commerce-row" key={row.id}><span><b>{row.name}</b><small>{row.categoryName||"Χωρίς κατηγορία"}</small></span><span>{row.sku||"—"}</span><span>{money(row.salePrice)}</span><span>{number(row.currentStock)}</span><span>{money(row.costPrice)}</span></div>)}</div></section><aside className="commerce-box"><h3>Νέο προϊόν</h3><form className="commerce-form" onSubmit={addProduct}><input name="name" placeholder="Όνομα προϊόντος" required/><input name="sku" placeholder="Κωδικός / SKU"/><input name="barcode" placeholder="Barcode"/><input name="salePrice" type="number" step="0.01" min="0" placeholder="Τιμή πώλησης"/><input name="costPrice" type="number" step="0.01" min="0" placeholder="Κόστος"/><input name="vatRate" type="number" step="0.01" defaultValue="24"/><input name="openingStock" type="number" step="0.001" placeholder="Αρχικό απόθεμα"/><button><PackagePlus/>Αποθήκευση προϊόντος</button></form><h3>Νέος προμηθευτής</h3><form className="commerce-form" onSubmit={addSupplier}><input name="name" placeholder="Επωνυμία" required/><input name="taxId" placeholder="ΑΦΜ"/><input name="phone" placeholder="Τηλέφωνο"/><button>Αποθήκευση προμηθευτή</button></form><h3>Κίνηση αποθήκης</h3><form className="commerce-form" onSubmit={adjustStock}><select name="productId" required><option value="">Προϊόν</option>{inventory.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><select name="movementType"><option value="ADJUSTMENT">Διόρθωση +</option><option value="PURCHASE">Παραλαβή</option><option value="WASTE">Φύρα</option><option value="TRANSFER_IN">Μεταφορά εισόδου</option><option value="TRANSFER_OUT">Μεταφορά εξόδου</option></select><input name="quantity" type="number" step="0.001" required placeholder="Ποσότητα"/><input name="note" placeholder="Σημείωση"/><button>Καταχώριση κίνησης</button></form></aside></div>
      <SupplierManagementPanel api={api} suppliers={suppliers} onChanged={loadInventory}/>
      <SupplierPriceComparisonPanel api={api}/>
      <RecipeManagementPanel api={api} products={products}/>
    </>}

    {tab==="pos"&&<><div className="commerce-notice"><b>ΜΗ ΦΟΡΟΛΟΓΙΚΗ ΛΕΙΤΟΥΡΓΙΑ PILOT.</b> Η φορολογική απόδειξη συνεχίζει να εκδίδεται μόνο από Kiosk Manager/RBS μέχρι να ενεργοποιηθεί ο πιστοποιημένος Connector.</div>{!active.has("INVENTORY")&&<div className="commerce-error">Για τον κατάλογο POS ενεργοποίησε μαζί και το module Αποθήκη.</div>}<div className="store-operator-pos" style={{"--store-pos-head":posLayout.theme?.headerColor||"#033d2f","--store-pos-accent":posLayout.theme?.accentColor||"#087a52","--store-pos-surface":posLayout.theme?.surfaceColor||"#ffffff"}}>
      <header><div className="store-pos-logo">MW</div><div className="store-pos-brand"><small>MyWorkStation · STORE POS</small><b>{posLayout.title||"OPERATOR POS"}</b></div><input placeholder="Barcode ή αναζήτηση προϊόντος"/><button>Αναζήτηση</button><div className="store-pos-user"><b>Συνδεδεμένος χρήστης</b><small>Ταμείο ανοικτό</small></div></header>
      <aside className="store-pos-quick"><div><b>ΓΡΗΓΟΡΑ</b><small>{(posLayout.quickKeys||[]).filter(x=>x.visible).length} θέσεις</small></div>{(posLayout.quickKeys||[]).filter(x=>x.visible).slice(0,24).map((button,index)=><button key={button.id} style={{background:button.color}} onClick={()=>addQuickProduct(button.productQuery||button.label)}><i>{index+1}</i>{button.label}</button>)}</aside>
      <main className="store-pos-main"><div className="store-pos-table-head"><span>ΠΟΣ.</span><span>ΕΙΔΟΣ</span><span>STOCK</span><span>ΤΙΜΗ</span><span>ΣΥΝΟΛΟ</span></div><div className="store-pos-sale-lines">{cart.length?cart.map(line=><article key={line.id}><span>{line.qty}</span><b>{line.name}</b><span>—</span><span>{money(line.price)}</span><strong>{money(line.qty*line.price)}</strong></article>):<div className="store-pos-empty"><b>Νέα συναλλαγή</b><span>Πάτησε προϊόν ή σκάναρε barcode</span></div>}</div><div className="store-pos-category-title"><b>ΚΑΤΗΓΟΡΙΕΣ</b><button className={!posCategory?"active":""} onClick={()=>setPosCategory("")}>ΑΡΧΙΚΗ</button><span>{posCategory||"ΒΑΣΙΚΗ ΟΘΟΝΗ"}</span></div><div className="store-pos-categories" style={{gridTemplateColumns:`repeat(${posLayout.productColumns||6},minmax(0,1fr))`}}>{(posLayout.categories||[]).filter(x=>x.visible).map((button,index)=><button className={posCategory===button.categoryName?"active":""} key={button.id} style={{background:button.color}} onClick={()=>setPosCategory(button.categoryName||"")}><i>{index+1}</i>{button.label}</button>)}</div><div className="store-pos-products" style={{gridTemplateColumns:`repeat(${posLayout.productColumns||6},minmax(0,1fr))`}}>{visiblePosProducts.map(product=><button key={product.id} onClick={()=>addCart(product)}><b>{product.name}</b>{posLayout.showSku&&<small>{product.sku||product.categoryName||""}</small>}<strong>{money(product.salePrice)}</strong></button>)}</div></main>
      <aside className="store-pos-right"><label>ΠΕΛΑΤΗΣ — Πελάτης λιανικής</label><div className="store-pos-money"><span>ΕΛΑΒΑ<b>0,00 €</b></span><span>ΡΕΣΤΑ<b>0,00 €</b></span></div><div className="store-pos-keypad">{[7,8,9,4,5,6,1,2,3,0,",","⌫"].map(value=><button key={value}>{value}</button>)}</div><button className="store-pos-clear">ΚΑΘΑΡΙΣΜΟΣ ΠΟΣΟΥ</button><div className="store-pos-cart-tools"><button onClick={()=>cart[0]&&changeQty(cart[0].id,1)}>ΠΟΣ.</button><button>ΑΛΛΑΓΗ</button><button onClick={()=>setCart([])}>ΣΒΗΣΙΜΟ</button></div></aside>
      <footer>{(posLayout.buttons||[]).filter(button=>button.visible).map(button=><button style={{background:button.color,color:String(button.color).toLowerCase()==="#ffffff"?"#173f34":"#fff"}} key={button.id} disabled={(button.action==="CASH"||button.action==="CARD")&&!cart.length} onClick={()=>runPosAction(button.action)}>{button.label}</button>)}<div className="store-pos-total"><span>ΣΥΝΟΛΟ</span><b>{money(cartTotal)}</b></div></footer>
    </div></>}

    {tab==="analytics"&&<AdvancedSalesAnalytics api={api} stores={stores} initialStoreId={storeId}/>}

    {tab==="handover"&&<div className="commerce-grid"><section className="commerce-box"><h3>Εκκρεμότητες βάρδιας</h3><div className="commerce-table">{handover.map(item=><article className={`handover-item ${item.priority}`} key={item.id}><b>{item.priority} · {item.status}</b><span>{item.message}</span><small>{item.fromName||"—"} → {item.toName||"Επόμενη βάρδια"}</small>{item.status==="OPEN"&&<button className="commerce-primary" onClick={()=>acknowledge(item.id)}>Επιβεβαίωση παραλαβής</button>}</article>)}</div></section><aside className="commerce-box"><h3>Νέα παράδοση</h3><form className="commerce-form" onSubmit={createHandover}><select name="priority"><option value="NORMAL">Κανονική</option><option value="LOW">Χαμηλή</option><option value="HIGH">Υψηλή</option><option value="SOS">SOS</option></select><textarea name="message" rows="6" placeholder="Τι πρέπει να γνωρίζει η επόμενη βάρδια;" required/><button>Παράδοση στην επόμενη βάρδια</button></form></aside></div>}

    {tab==="documents"&&<InvoiceInboxPanel api={api} stores={stores}/>}

    {tab==="ai"&&aiStatus&&<AiReaderPanel api={api} storeId={storeId} status={aiStatus} onStatus={loadAi}/>}

    {tab==="attendance"&&<AttendanceManagementPanel api={api} stores={stores} initialStoreId={storeId}/>}

    {tab==="dispatch"&&<DispatchProviderPanel api={api} stores={stores} initialStoreId={storeId}/>}

    {tab==="observer"&&<ConnectorObserverPanel api={api} storeId={storeId}/>}
  </div>;
}
