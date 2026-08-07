import React,{useEffect,useMemo,useState} from "react";
import {BadgePercent,Boxes,Check,ClipboardList,PackageSearch,RefreshCw,Search,Store,Tag} from "lucide-react";
import "./owner-products.css";

const money=v=>v===null||v===undefined||v===""?"—":`${Number(v).toFixed(2)} €`;
const n=v=>Number(v||0);
const localInputDate=value=>{
  const d=value?new Date(value):new Date();
  const pad=x=>String(x).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function OwnerProductCenter({api,stores=[]}){
  const [tab,setTab]=useState("master");
  const [masterQuery,setMasterQuery]=useState("");
  const [masterResults,setMasterResults]=useState([]);
  const [selectedMaster,setSelectedMaster]=useState(null);
  const [activationStores,setActivationStores]=useState({});
  const [basePrice,setBasePrice]=useState("");
  const [catalogQuery,setCatalogQuery]=useState("");
  const [catalog,setCatalog]=useState([]);
  const [selectedProduct,setSelectedProduct]=useState(null);
  const [priceStores,setPriceStores]=useState({});
  const [editBasePrice,setEditBasePrice]=useState("");
  const [editVat,setEditVat]=useState("");
  const [editVatVerified,setEditVatVerified]=useState(false);
  const [promotions,setPromotions]=useState([]);\n  const [promotionType,setPromotionType]=useState("PERCENT");
  const [stocktakes,setStocktakes]=useState([]);
  const [openStocktake,setOpenStocktake]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  const activeStores=useMemo(()=>stores.filter(s=>s.active!==false),[stores]);
  const clearStatus=()=>{setError("");setMessage("")};

  const searchMaster=async event=>{
    event?.preventDefault();clearStatus();
    if(masterQuery.trim().length<2)return;
    setBusy(true);
    try{setMasterResults(await api(`/api/owner-products/master?q=${encodeURIComponent(masterQuery.trim())}`))}catch(e){setError(e.message)}finally{setBusy(false)}
  };

  const chooseMaster=row=>{
    setSelectedMaster(row);
    setBasePrice(row.defaultRetailPrice===null||row.defaultRetailPrice===undefined?"":String(Number(row.defaultRetailPrice)));
    const config={};
    activeStores.forEach(s=>{config[s.id]={active:true,salePrice:row.defaultRetailPrice===null||row.defaultRetailPrice===undefined?"":String(Number(row.defaultRetailPrice))}});
    setActivationStores(config);
  };

  const activateMaster=async()=>{
    if(!selectedMaster)return;
    clearStatus();setBusy(true);
    try{
      const storeConfigs=activeStores.map(s=>({storeId:s.id,active:Boolean(activationStores[s.id]?.active),salePrice:activationStores[s.id]?.salePrice===""?null:Number(activationStores[s.id]?.salePrice)}));
      await api("/api/owner-products/activate",{method:"POST",body:JSON.stringify({masterProductId:selectedMaster.id,basePrice:basePrice===""?null:Number(basePrice),storeConfigs})});
      setMessage(`Το προϊόν «${selectedMaster.name}» ενεργοποιήθηκε στην εταιρεία.`);
      setSelectedMaster(null);await searchMaster();await loadCatalog();
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };

  const loadCatalog=async()=>{
    clearStatus();setBusy(true);
    try{setCatalog(await api(`/api/owner-products/catalog?q=${encodeURIComponent(catalogQuery.trim())}`))}catch(e){setError(e.message)}finally{setBusy(false)}
  };

  const chooseProduct=row=>{
    setSelectedProduct(row);setEditBasePrice(String(Number(row.salePrice||0)));setEditVat(row.vatVerified?String(Number(row.vatRate||0)):"");setEditVatVerified(Boolean(row.vatVerified));
    const existing=new Map((row.stores||[]).map(s=>[s.storeId,s]));
    const config={};
    activeStores.forEach(s=>{const e=existing.get(s.id);config[s.id]={active:e?Boolean(e.active):false,salePrice:e?.salePrice===null||e?.salePrice===undefined?String(Number(row.salePrice||0)):String(Number(e.salePrice))}});
    setPriceStores(config);
  };

  const savePrices=async()=>{
    if(!selectedProduct)return;
    clearStatus();setBusy(true);
    try{
      const base=Number(editBasePrice||0);
      const payload={basePrice:base,vatRate:editVat===""?undefined:Number(editVat),vatVerified:editVatVerified,stores:activeStores.map(s=>({storeId:s.id,active:Boolean(priceStores[s.id]?.active),salePrice:priceStores[s.id]?.salePrice===""?base:Number(priceStores[s.id]?.salePrice)}))};
      await api(`/api/owner-products/${selectedProduct.id}/prices`,{method:"PATCH",body:JSON.stringify(payload)});
      setMessage("Οι τιμές ανά κατάστημα αποθηκεύτηκαν και γράφτηκαν στο ιστορικό.");await loadCatalog();
      const fresh=await api(`/api/owner-products/catalog?q=${encodeURIComponent(selectedProduct.sku||selectedProduct.name)}`);const updated=fresh.find(x=>x.id===selectedProduct.id);if(updated)chooseProduct(updated);
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };

  const loadPromotions=async()=>{clearStatus();setBusy(true);try{setPromotions(await api("/api/owner-products/promotions/list"))}catch(e){setError(e.message)}finally{setBusy(false)}};
  const createPromotion=async event=>{
    event.preventDefault();clearStatus();setBusy(true);
    const f=new FormData(event.currentTarget);const type=String(f.get("promotionType"));const storeIds=activeStores.filter(s=>f.get(`store_${s.id}`)==="on").map(s=>s.id);
    try{
      await api("/api/owner-products/promotions",{method:"POST",body:JSON.stringify({productId:f.get("productId"),name:f.get("name"),promotionType:type,percentOff:type==="PERCENT"?Number(f.get("percentOff")):null,buyQuantity:type==="BUY_X_GET_Y"?Number(f.get("buyQuantity")):null,freeQuantity:type==="BUY_X_GET_Y"?Number(f.get("freeQuantity")):null,fixedPrice:type==="FIXED_PRICE"?Number(f.get("fixedPrice")):null,startsAt:f.get("startsAt"),endsAt:f.get("endsAt"),priority:Number(f.get("priority")||100),storeIds})});
      event.currentTarget.reset();setPromotionType("PERCENT");setMessage("Η προσφορά δημιουργήθηκε.");await loadPromotions();
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };
  const togglePromotion=async promotion=>{clearStatus();try{await api(`/api/owner-products/promotions/${promotion.id}`,{method:"PATCH",body:JSON.stringify({active:!promotion.active})});await loadPromotions()}catch(e){setError(e.message)}};

  const loadStocktakes=async()=>{clearStatus();setBusy(true);try{setStocktakes(await api("/api/owner-products/stocktakes/list"))}catch(e){setError(e.message)}finally{setBusy(false)}};
  const createStocktake=async event=>{
    event.preventDefault();clearStatus();setBusy(true);const f=new FormData(event.currentTarget);
    try{const result=await api("/api/owner-products/stocktakes",{method:"POST",body:JSON.stringify({storeId:f.get("storeId"),name:f.get("name")})});event.currentTarget.reset();setMessage("Η απογραφή δημιουργήθηκε με το θεωρητικό απόθεμα του καταστήματος.");await loadStocktakes();await openStocktakeById(result.id)}catch(e){setError(e.message)}finally{setBusy(false)}
  };
  const openStocktakeById=async id=>{clearStatus();setBusy(true);try{setOpenStocktake(await api(`/api/owner-products/stocktakes/${id}`))}catch(e){setError(e.message)}finally{setBusy(false)}};
  const saveCount=async(lineId,value)=>{
    if(!openStocktake)return;clearStatus();
    try{await api(`/api/owner-products/stocktakes/${openStocktake.id}/lines/${lineId}`,{method:"PATCH",body:JSON.stringify({countedQuantity:Number(value||0)})});await openStocktakeById(openStocktake.id)}catch(e){setError(e.message)}
  };
  const finalizeStocktake=async()=>{
    if(!openStocktake||!window.confirm("Να οριστικοποιηθεί η απογραφή; Θα ενημερωθεί το πραγματικό απόθεμα του καταστήματος."))return;
    clearStatus();setBusy(true);try{await api(`/api/owner-products/stocktakes/${openStocktake.id}/finalize`,{method:"POST",body:"{}"});setMessage("Η απογραφή οριστικοποιήθηκε και οι διαφορές γράφτηκαν ως κινήσεις αποθήκης.");await openStocktakeById(openStocktake.id);await loadStocktakes()}catch(e){setError(e.message)}finally{setBusy(false)}
  };

  useEffect(()=>{if(tab==="prices")loadCatalog();if(tab==="promotions"){loadCatalog();loadPromotions()}if(tab==="stocktake")loadStocktakes()},[tab]);

  return <div className="owner-products">
    <div className="owner-products-head"><div><h2>Προϊόντα, Τιμές, Προσφορές & Απογραφή</h2><p>Ο Owner επιλέγει από τον κεντρικό κατάλογο και ορίζει ξεχωριστή εμπορική πολιτική ανά κατάστημα.</p></div><button onClick={()=>{if(tab==="master")searchMaster();if(tab==="prices")loadCatalog();if(tab==="promotions")loadPromotions();if(tab==="stocktake")loadStocktakes()}}><RefreshCw/>Ανανέωση</button></div>
    <div className="owner-product-tabs">
      <button className={tab==="master"?"active":""} onClick={()=>setTab("master")}><PackageSearch/>Master Catalog</button>
      <button className={tab==="prices"?"active":""} onClick={()=>setTab("prices")}><Tag/>Τιμές ανά κατάστημα</button>
      <button className={tab==="promotions"?"active":""} onClick={()=>setTab("promotions")}><BadgePercent/>Προσφορές</button>
      <button className={tab==="stocktake"?"active":""} onClick={()=>setTab("stocktake")}><ClipboardList/>Απογραφή</button>
    </div>
    {error&&<div className="op-alert error">{error}</div>}{message&&<div className="op-alert success">{message}</div>}

    {tab==="master"&&<div className="op-grid two"><section className="op-box"><h3>Αναζήτηση 26.656 προϊόντων</h3><form className="op-search" onSubmit={searchMaster}><input value={masterQuery} onChange={e=>setMasterQuery(e.target.value)} placeholder="Περιγραφή, κωδικός ή barcode"/><button disabled={busy}><Search/>Αναζήτηση</button></form><div className="op-list">{masterResults.map(row=><button key={row.id} className={`op-product ${selectedMaster?.id===row.id?"selected":""}`} onClick={()=>chooseMaster(row)}><span><b>{row.name}</b><small>{row.sourceCode} · {row.categoryName||"Χωρίς κατηγορία"}</small></span><span>{row.companyProductId?<em className="ok">ΕΝΕΡΓΟ</em>:<em>MASTER</em>}<small>{money(row.defaultRetailPrice)}</small></span></button>)}</div></section>{selectedMaster?<aside className="op-box"><h3>{selectedMaster.name}</h3><p>Βασική λιανική Master: <b>{money(selectedMaster.defaultRetailPrice)}</b></p><label>Βασική τιμή εταιρείας<input type="number" step="0.01" min="0" value={basePrice} onChange={e=>setBasePrice(e.target.value)}/></label><div className="store-price-list"><h4>Καταστήματα</h4>{activeStores.map(store=><div className="store-price" key={store.id}><label className="check"><input type="checkbox" checked={Boolean(activationStores[store.id]?.active)} onChange={e=>setActivationStores(c=>({...c,[store.id]:{...c[store.id],active:e.target.checked}}))}/><Store/>{store.name}</label><input type="number" step="0.01" min="0" value={activationStores[store.id]?.salePrice??""} onChange={e=>setActivationStores(c=>({...c,[store.id]:{...c[store.id],salePrice:e.target.value}}))} placeholder="Τιμή"/></div>)}</div>{selectedMaster.vatVerified?<div className="op-alert success">ΦΠΑ Master επιβεβαιωμένος: {n(selectedMaster.vatRate)}%</div>:<div className="op-alert warning">Ο ΦΠΑ δεν είναι επιβεβαιωμένος. Το προϊόν θα ενεργοποιηθεί χωρίς αυθαίρετη φορολογική τιμή.</div>}<button className="primary" onClick={activateMaster} disabled={busy}><Check/>Ενεργοποίηση / ενημέρωση προϊόντος</button></aside>:<aside className="op-box empty">Επίλεξε προϊόν από τον Master Catalog.</aside>}</div>}

    {tab==="prices"&&<div className="op-grid two"><section className="op-box"><h3>Προϊόντα εταιρείας</h3><form className="op-search" onSubmit={e=>{e.preventDefault();loadCatalog()}}><input value={catalogQuery} onChange={e=>setCatalogQuery(e.target.value)} placeholder="Αναζήτηση προϊόντος"/><button><Search/>Αναζήτηση</button></form><div className="op-list">{catalog.map(row=><button key={row.id} className={`op-product ${selectedProduct?.id===row.id?"selected":""}`} onClick={()=>chooseProduct(row)}><span><b>{row.name}</b><small>{row.sku||"—"} · {row.categoryName||"Χωρίς κατηγορία"}</small></span><span><b>{money(row.salePrice)}</b><small>{(row.stores||[]).filter(s=>s.active).length} ενεργά καταστήματα</small></span></button>)}</div></section>{selectedProduct?<aside className="op-box"><h3>{selectedProduct.name}</h3><label>Βασική τιμή<input type="number" step="0.01" min="0" value={editBasePrice} onChange={e=>setEditBasePrice(e.target.value)}/></label><div className="vat-row"><label>ΦΠΑ %<input type="number" min="0" max="100" step="0.01" value={editVat} placeholder={editVatVerified?"Ποσοστό":"Μη επιβεβαιωμένος"} onChange={e=>setEditVat(e.target.value)}/></label><label className="check"><input type="checkbox" checked={editVatVerified} onChange={e=>setEditVatVerified(e.target.checked)}/>ΦΠΑ επιβεβαιωμένος</label></div>{!editVatVerified&&<div className="op-alert warning">Ο ΦΠΑ δεν είναι επιβεβαιωμένος και δεν θα αποθηκευτεί αυθαίρετη φορολογική τιμή.</div>}<div className="store-price-list"><h4>Επιλεκτική αλλαγή ανά κατάστημα</h4>{activeStores.map(store=><div className="store-price" key={store.id}><label className="check"><input type="checkbox" checked={Boolean(priceStores[store.id]?.active)} onChange={e=>setPriceStores(c=>({...c,[store.id]:{...c[store.id],active:e.target.checked}}))}/><Store/>{store.name}</label><input type="number" step="0.01" min="0" value={priceStores[store.id]?.salePrice??editBasePrice} onChange={e=>setPriceStores(c=>({...c,[store.id]:{...c[store.id],salePrice:e.target.value}}))}/></div>)}</div><div className="op-alert info">Κάθε κατάστημα μπορεί να κρατήσει διαφορετική τιμή — υψηλότερη ή χαμηλότερη από τη βασική.</div><button className="primary" onClick={savePrices} disabled={busy}>Αποθήκευση τιμών</button></aside>:<aside className="op-box empty">Επίλεξε προϊόν για ρύθμιση τιμών.</aside>}</div>}

    {tab==="promotions"&&<div className="op-grid two"><section className="op-box"><h3>Νέα προσφορά</h3><form className="op-form" onSubmit={createPromotion}><label>Προϊόν<select name="productId" required><option value="">Επιλογή</option>{catalog.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Όνομα προσφοράς<input name="name" required placeholder="π.χ. ΑΛΦΑ ΦΙΑΛΗ -20%"/></label><label>Τύπος<select name="promotionType" value={promotionType} onChange={e=>setPromotionType(e.target.value)}><option value="PERCENT">Ποσοστό %</option><option value="BUY_X_GET_Y">2+1 / X+Y</option><option value="FIXED_PRICE">Τελική τιμή</option></select></label>{promotionType==="PERCENT"&&<label>Έκπτωση %<input name="percentOff" type="number" min="0.01" max="100" step="0.01" required/></label>}{promotionType==="BUY_X_GET_Y"&&<div className="op-two"><label>Αγορά Χ<input name="buyQuantity" type="number" min="1" step="1" required/></label><label>Δωρεάν Υ<input name="freeQuantity" type="number" min="1" step="1" required/></label></div>}{promotionType==="FIXED_PRICE"&&<label>Τελική τιμή<input name="fixedPrice" type="number" min="0.01" step="0.01" required/></label>}<div className="op-two"><label>Από<input name="startsAt" type="datetime-local" defaultValue={localInputDate(new Date())} required/></label><label>Έως<input name="endsAt" type="datetime-local" defaultValue={localInputDate(new Date(Date.now()+7*86400000))} required/></label></div><label>Προτεραιότητα<input name="priority" type="number" defaultValue="100" min="0"/></label><fieldset><legend>Καταστήματα προσφοράς</legend>{activeStores.map(s=><label className="check" key={s.id}><input name={`store_${s.id}`} type="checkbox" defaultChecked/>{s.name}</label>)}</fieldset><button className="primary">Δημιουργία προσφοράς</button></form></section><section className="op-box"><h3>Προσφορές</h3><div className="promo-list">{promotions.map(p=><article key={p.id}><div><b>{p.name}</b><small>{p.productName} · {p.promotionType}</small><small>{new Date(p.startsAt).toLocaleString("el-GR")} → {new Date(p.endsAt).toLocaleString("el-GR")}</small><small>{(p.stores||[]).map(s=>s.storeName).join(", ")}</small></div><button className={p.active?"danger":"secondary"} onClick={()=>togglePromotion(p)}>{p.active?"Παύση":"Ενεργοποίηση"}</button></article>)}</div></section></div>}

    {tab==="stocktake"&&<div className="op-grid two"><section className="op-box"><h3>Νέα απογραφή</h3><form className="op-form" onSubmit={createStocktake}><label>Κατάστημα<select name="storeId" required><option value="">Επιλογή</option>{activeStores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Ονομασία<input name="name" required defaultValue={`Απογραφή ${new Date().toLocaleDateString("el-GR")}`}/></label><button className="primary"><Boxes/>Έναρξη απογραφής</button></form><h3>Ιστορικό</h3><div className="promo-list">{stocktakes.map(st=><button className="stocktake-card" key={st.id} onClick={()=>openStocktakeById(st.id)}><span><b>{st.name}</b><small>{st.storeName} · {new Date(st.startedAt).toLocaleString("el-GR")}</small></span><span><em className={st.status==="FINALIZED"?"ok":""}>{st.status}</em><small>{st.countedCount}/{st.lineCount}</small></span></button>)}</div></section><section className="op-box">{openStocktake?<><div className="stocktake-head"><div><h3>{openStocktake.name}</h3><p>{openStocktake.storeName} · {openStocktake.status}</p></div>{openStocktake.status==="DRAFT"&&<button className="primary" onClick={finalizeStocktake}>Οριστικοποίηση</button>}</div><div className="stocktake-table"><div className="stock-row head"><span>Προϊόν</span><span>Θεωρητικό</span><span>Φυσικό</span><span>Διαφορά</span><span>Αξία</span></div>{(openStocktake.lines||[]).map(line=><div className="stock-row" key={line.id}><span><b>{line.name}</b><small>{line.sku||"—"}</small></span><span>{n(line.expectedQuantity)}</span><span>{openStocktake.status==="DRAFT"?<input type="number" min="0" step="0.001" defaultValue={line.countedQuantity??""} onBlur={e=>e.target.value!==""&&saveCount(line.id,e.target.value)}/>:n(line.countedQuantity)}</span><span>{n(line.difference)}</span><span>{money(line.differenceValue)}</span></div>)}</div></>:<div className="empty">Επίλεξε ή ξεκίνησε απογραφή.</div>}</section></div>}
  </div>;
}
