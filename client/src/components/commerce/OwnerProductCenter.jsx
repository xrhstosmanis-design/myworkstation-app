import React,{useEffect,useMemo,useState} from "react";
import {BadgePercent,Boxes,Check,ClipboardList,PackageSearch,RefreshCw,Search,Store,Tag,Upload} from "lucide-react";
import "./owner-products.css";
import "./commercial-tools.css";
import InventoryV2Center from "../inventory/InventoryV2Center.jsx";

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
  const [productCard,setProductCard]=useState(null);
  const [promotions,setPromotions]=useState([]);
  const [promotionType,setPromotionType]=useState("PERCENT");
  const [bulkProducts,setBulkProducts]=useState([]);
  const [bulkStores,setBulkStores]=useState([]);
  const [bulkMode,setBulkMode]=useState("SET");
  const [excelFile,setExcelFile]=useState(null);
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
    setProductCard({name:row.name||"",sku:row.sku||"",description:row.description||"",categoryName:row.categoryName||"",unit:row.unit||"PIECE",costPrice:String(Number(row.costPrice||0)),trackStock:row.trackStock!==false,active:row.active!==false,barcodes:(row.barcodes||[]).map(item=>({barcode:item.barcode||"",unitMultiplier:String(Number(item.unitMultiplier||1))}))});
    const existing=new Map((row.stores||[]).map(s=>[s.storeId,s]));
    const config={};
    activeStores.forEach(s=>{const e=existing.get(s.id);config[s.id]={active:e?Boolean(e.active):false,salePrice:e?.salePrice===null||e?.salePrice===undefined?String(Number(row.salePrice||0)):String(Number(e.salePrice)),minStock:e?.minStock===null||e?.minStock===undefined?"":String(Number(e.minStock))}});
    setPriceStores(config);
  };

  const saveProductCard=async()=>{
    if(!selectedProduct||!productCard)return;
    clearStatus();setBusy(true);
    try{
      const base=Number(editBasePrice||0);
      await api(`/api/owner-products/${selectedProduct.id}/card`,{method:"PATCH",body:JSON.stringify({...productCard,salePrice:base,costPrice:Number(productCard.costPrice||0),vatRate:Number(editVat||0),vatVerified:editVatVerified,barcodes:productCard.barcodes.filter(row=>row.barcode.trim()).map(row=>({barcode:row.barcode.trim(),unitMultiplier:Number(row.unitMultiplier||1)})),stores:activeStores.map(store=>({storeId:store.id,active:Boolean(priceStores[store.id]?.active),salePrice:Number(priceStores[store.id]?.salePrice||base),minStock:priceStores[store.id]?.minStock===""||priceStores[store.id]?.minStock===undefined?null:Number(priceStores[store.id].minStock)}))})});
      setMessage("Η κεντρική καρτέλα προϊόντος αποθηκεύτηκε με ασφάλεια.");
      const fresh=await api(`/api/owner-products/catalog?q=${encodeURIComponent(productCard.sku||productCard.name)}`);setCatalog(fresh);const updated=fresh.find(row=>row.id===selectedProduct.id);if(updated)chooseProduct(updated);
    }catch(e){setError(e.message)}finally{setBusy(false)}
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
    if(!f.get("productId")&&!String(f.get("barcode")||"").trim()){setBusy(false);return setError("Επίλεξε προϊόν ή γράψε το barcode του.")}
    try{
      await api("/api/owner-products/promotions",{method:"POST",body:JSON.stringify({productId:f.get("productId")||null,barcode:String(f.get("barcode")||"").trim()||null,name:f.get("name"),promotionType:type,percentOff:type==="PERCENT"?Number(f.get("percentOff")):null,buyQuantity:type==="BUY_X_GET_Y"?Number(f.get("buyQuantity")):null,freeQuantity:type==="BUY_X_GET_Y"?Number(f.get("freeQuantity")):null,fixedPrice:type==="FIXED_PRICE"?Number(f.get("fixedPrice")):null,startsAt:f.get("startsAt"),endsAt:f.get("endsAt"),priority:Number(f.get("priority")||100),storeIds})});
      event.currentTarget.reset();setPromotionType("PERCENT");setMessage("Η προσφορά δημιουργήθηκε.");await loadPromotions();
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };
  const togglePromotion=async promotion=>{clearStatus();try{await api(`/api/owner-products/promotions/${promotion.id}`,{method:"PATCH",body:JSON.stringify({active:!promotion.active})});await loadPromotions()}catch(e){setError(e.message)}};

  const saveBulkPrices=async event=>{
    event.preventDefault();clearStatus();
    if(!bulkProducts.length||!bulkStores.length)return setError("Επίλεξε τουλάχιστον ένα προϊόν και ένα κατάστημα.");
    const f=new FormData(event.currentTarget);setBusy(true);
    try{
      const result=await api("/api/owner-products/prices/bulk",{method:"POST",body:JSON.stringify({productIds:bulkProducts,storeIds:bulkStores,mode:bulkMode,value:Number(f.get("value"))})});
      setMessage(`Η μαζική αλλαγή ολοκληρώθηκε σε ${result.changed} τιμές και καταγράφηκε στο ιστορικό.`);await loadCatalog();
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };

  const importPromotions=async event=>{
    event.preventDefault();clearStatus();
    if(!excelFile)return setError("Επίλεξε αρχείο Excel.");
    const f=new FormData(event.currentTarget),sourceStoreId=String(f.get("sourceStoreId")||"");
    const targetStoreIds=activeStores.filter(s=>s.id!==sourceStoreId&&f.get(`target_${s.id}`)==="on").map(s=>s.id);
    setBusy(true);
    try{
      const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Δεν διαβάστηκε το αρχείο."));reader.readAsDataURL(excelFile)});
      const result=await api("/api/owner-products/promotions/import-excel",{method:"POST",body:JSON.stringify({dataUrl,sourceStoreId,targetStoreIds})});
      setMessage(`Εισήχθησαν ${result.created} γραμμές και εφαρμόστηκαν σε ${result.stores} καταστήματα.`);setExcelFile(null);event.currentTarget.reset();await loadPromotions();
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };

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

  useEffect(()=>{if(tab==="prices"||tab==="bulk"||tab==="promotion-import"||tab==="inventory2")loadCatalog();if(tab==="promotions"){loadCatalog();loadPromotions()}if(tab==="promotion-import")loadPromotions();if(tab==="stocktake")loadStocktakes()},[tab]);

  return <div className="owner-products">
    <div className="owner-products-head"><div><h2>Προϊόντα, Τιμές, Προσφορές & Απογραφή</h2><p>Ο Owner επιλέγει από τον κεντρικό κατάλογο και ορίζει ξεχωριστή εμπορική πολιτική ανά κατάστημα.</p></div><button onClick={()=>{if(tab==="master")searchMaster();if(tab==="prices")loadCatalog();if(tab==="promotions")loadPromotions();if(tab==="stocktake")loadStocktakes()}}><RefreshCw/>Ανανέωση</button></div>
    <div className="owner-product-tabs">
      <button className={tab==="master"?"active":""} onClick={()=>setTab("master")}><PackageSearch/>Master Catalog</button>
      <button className={tab==="prices"?"active":""} onClick={()=>setTab("prices")}><Tag/>Τιμές ανά κατάστημα</button>
      <button className={tab==="bulk"?"active":""} onClick={()=>setTab("bulk")}><Tag/>Μαζική αλλαγή τιμών</button>
      <button className={tab==="promotions"?"active":""} onClick={()=>setTab("promotions")}><BadgePercent/>Προσφορές</button>
      <button className={tab==="promotion-import"?"active":""} onClick={()=>setTab("promotion-import")}><Upload/>Excel / Barcode</button>
      <button className={tab==="stocktake"?"active":""} onClick={()=>setTab("stocktake")}><ClipboardList/>Απογραφή</button>
      <button className={tab==="inventory2"?"active":""} onClick={()=>setTab("inventory2")}><Boxes/>Inventory 2.0</button>
    </div>
    {error&&<div className="op-alert error">{error}</div>}{message&&<div className="op-alert success">{message}</div>}
    {tab==="bulk"&&<form className="op-box op-form" onSubmit={saveBulkPrices}>
      <h3>Μαζική αλλαγή τιμών με επιλογή προϊόντων</h3>
      <p>Επίλεξε συγκεκριμένα προϊόντα και καταστήματα. Κάθε αλλαγή αποθηκεύεται στο ιστορικό τιμών.</p>
      <fieldset><legend>Προϊόντα</legend><div className="bulk-check-list">{catalog.map(product=><label className="check" key={product.id}><input type="checkbox" checked={bulkProducts.includes(product.id)} onChange={e=>setBulkProducts(current=>e.target.checked?[...current,product.id]:current.filter(id=>id!==product.id))}/><span>{product.name}<small>{product.sku||"—"} · {money(product.salePrice)}</small></span></label>)}</div></fieldset>
      <fieldset><legend>Καταστήματα</legend>{activeStores.map(store=><label className="check" key={store.id}><input type="checkbox" checked={bulkStores.includes(store.id)} onChange={e=>setBulkStores(current=>e.target.checked?[...current,store.id]:current.filter(id=>id!==store.id))}/>{store.name}</label>)}</fieldset>
      <div className="op-two"><label>Ενέργεια<select value={bulkMode} onChange={e=>setBulkMode(e.target.value)}><option value="SET">Ορισμός νέας τιμής</option><option value="INCREASE_PERCENT">Αύξηση %</option><option value="DECREASE_PERCENT">Μείωση %</option></select></label><label>{bulkMode==="SET"?"Νέα τιμή €":"Ποσοστό %"}<input name="value" type="number" min="0" max="999999" step="0.01" required/></label></div>
      <button className="primary" disabled={busy}>Εφαρμογή σε {bulkProducts.length} προϊόντα × {bulkStores.length} καταστήματα</button>
    </form>}
    {tab==="promotion-import"&&<div className="op-grid two">
      <section className="op-box"><h3>Νέα προσφορά με barcode</h3><form className="op-form" onSubmit={createPromotion}>
        <label>Barcode προϊόντος<input name="barcode" required autoFocus placeholder="Σκάναρε ή γράψε barcode"/></label><input name="productId" type="hidden" value="" readOnly/>
        <label>Όνομα προσφοράς<input name="name" required/></label><label>Τύπος<select name="promotionType" value={promotionType} onChange={e=>setPromotionType(e.target.value)}><option value="PERCENT">Ποσοστό %</option><option value="BUY_X_GET_Y">X + Y δωρεάν</option><option value="FIXED_PRICE">Τελική τιμή</option></select></label>
        {promotionType==="PERCENT"&&<label>Έκπτωση %<input name="percentOff" type="number" min="0.01" max="100" step="0.01" required/></label>}{promotionType==="BUY_X_GET_Y"&&<div className="op-two"><label>Αγορά X<input name="buyQuantity" type="number" min="1" required/></label><label>Δωρεάν Y<input name="freeQuantity" type="number" min="1" required/></label></div>}{promotionType==="FIXED_PRICE"&&<label>Τελική τιμή<input name="fixedPrice" type="number" min="0.01" step="0.01" required/></label>}
        <div className="op-two"><label>Από<input name="startsAt" type="datetime-local" defaultValue={localInputDate(new Date())} required/></label><label>Έως<input name="endsAt" type="datetime-local" defaultValue={localInputDate(new Date(Date.now()+7*86400000))} required/></label></div><input name="priority" type="hidden" value="100" readOnly/>
        <fieldset><legend>Δημιουργία και αποστολή σε καταστήματα</legend>{activeStores.map(store=><label className="check" key={store.id}><input name={`store_${store.id}`} type="checkbox" defaultChecked/>{store.name}</label>)}</fieldset><button className="primary">Δημιουργία με barcode</button>
      </form></section>
      <section className="op-box"><h3>Εισαγωγή προσφορών από Excel</h3><form className="op-form" onSubmit={importPromotions}>
        <label>Αρχείο Excel<input type="file" accept=".xlsx,.xls" onChange={e=>setExcelFile(e.target.files?.[0]||null)} required/></label><label>Δημιουργία πρώτα στο κατάστημα<select name="sourceStoreId" required><option value="">Επιλογή</option>{activeStores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
        <fieldset><legend>Αποστολή αντιγράφου και στα υπόλοιπα</legend>{activeStores.map(store=><label className="check" key={store.id}><input name={`target_${store.id}`} type="checkbox"/>{store.name}</label>)}</fieldset><div className="op-alert info">Στήλες: Barcode, Όνομα προσφοράς, Τύπος, Από, Έως και ανάλογα Έκπτωση %, Αγορά X, Δωρεάν Y ή Τελική τιμή.</div><button className="primary" disabled={busy}><Upload/>Εισαγωγή και αποστολή</button>
      </form></section>
    </div>}

    {tab==="master"&&<div className="op-grid two"><section className="op-box"><h3>Αναζήτηση 26.656 προϊόντων</h3><form className="op-search" onSubmit={searchMaster}><input value={masterQuery} onChange={e=>setMasterQuery(e.target.value)} placeholder="Περιγραφή, κωδικός ή barcode"/><button disabled={busy}><Search/>Αναζήτηση</button></form><div className="op-list">{masterResults.map(row=><button key={row.id} className={`op-product ${selectedMaster?.id===row.id?"selected":""}`} onClick={()=>chooseMaster(row)}><span><b>{row.name}</b><small>{row.sourceCode} · {row.categoryName||"Χωρίς κατηγορία"}</small></span><span>{row.companyProductId?<em className="ok">ΕΝΕΡΓΟ</em>:<em>MASTER</em>}<small>{money(row.defaultRetailPrice)}</small></span></button>)}</div></section>{selectedMaster?<aside className="op-box"><h3>{selectedMaster.name}</h3><p>Βασική λιανική Master: <b>{money(selectedMaster.defaultRetailPrice)}</b></p><label>Βασική τιμή εταιρείας<input type="number" step="0.01" min="0" value={basePrice} onChange={e=>setBasePrice(e.target.value)}/></label><div className="store-price-list"><h4>Καταστήματα</h4>{activeStores.map(store=><div className="store-price" key={store.id}><label className="check"><input type="checkbox" checked={Boolean(activationStores[store.id]?.active)} onChange={e=>setActivationStores(c=>({...c,[store.id]:{...c[store.id],active:e.target.checked}}))}/><Store/>{store.name}</label><input type="number" step="0.01" min="0" value={activationStores[store.id]?.salePrice??""} onChange={e=>setActivationStores(c=>({...c,[store.id]:{...c[store.id],salePrice:e.target.value}}))} placeholder="Τιμή"/></div>)}</div>{selectedMaster.vatVerified?<div className="op-alert success">ΦΠΑ Master επιβεβαιωμένος: {n(selectedMaster.vatRate)}%</div>:<div className="op-alert warning">Ο ΦΠΑ δεν είναι επιβεβαιωμένος. Το προϊόν θα ενεργοποιηθεί χωρίς αυθαίρετη φορολογική τιμή.</div>}<button className="primary" onClick={activateMaster} disabled={busy}><Check/>Ενεργοποίηση / ενημέρωση προϊόντος</button></aside>:<aside className="op-box empty">Επίλεξε προϊόν από τον Master Catalog.</aside>}</div>}

    {tab==="prices"&&<div className="op-grid product-card-grid"><section className="op-box"><h3>Προϊόντα εταιρείας</h3><form className="op-search" onSubmit={e=>{e.preventDefault();loadCatalog()}}><input value={catalogQuery} onChange={e=>setCatalogQuery(e.target.value)} placeholder="Αναζήτηση προϊόντος"/><button><Search/>Αναζήτηση</button></form><div className="op-list">{catalog.map(row=><button key={row.id} className={`op-product ${selectedProduct?.id===row.id?"selected":""}`} onClick={()=>chooseProduct(row)}><span><b>{row.name}</b><small>{row.sku||"—"} · {row.categoryName||"Χωρίς κατηγορία"}</small></span><span><b>{money(row.salePrice)}</b><small>{(row.stores||[]).filter(s=>s.active).length} ενεργά καταστήματα</small></span></button>)}</div></section>{selectedProduct&&productCard?<aside className="op-box product-card"><div className="product-card-title"><div><h3>Κεντρική καρτέλα προϊόντος</h3><p>{selectedProduct.name}</p></div><em className={productCard.active?"active":""}>{productCard.active?"ΕΝΕΡΓΟ":"ΑΝΕΝΕΡΓΟ"}</em></div><div className="product-card-fields"><label className="span-two">Περιγραφή προϊόντος<input value={productCard.name} onChange={e=>setProductCard(c=>({...c,name:e.target.value}))}/></label><label>Κωδικός / SKU<input value={productCard.sku} onChange={e=>setProductCard(c=>({...c,sku:e.target.value}))}/></label><label>Κατηγορία<input value={productCard.categoryName} onChange={e=>setProductCard(c=>({...c,categoryName:e.target.value}))}/></label><label className="span-two">Σχόλια / περιγραφή<textarea value={productCard.description} onChange={e=>setProductCard(c=>({...c,description:e.target.value}))}/></label><label>Μονάδα μέτρησης<select value={productCard.unit} onChange={e=>setProductCard(c=>({...c,unit:e.target.value}))}><option value="PIECE">Τεμάχιο</option><option value="KG">Κιλό</option><option value="LITER">Λίτρο</option><option value="PACKAGE">Συσκευασία</option></select></label><label>Τιμή αγοράς €<input type="number" step="0.01" min="0" value={productCard.costPrice} onChange={e=>setProductCard(c=>({...c,costPrice:e.target.value}))}/></label><label>Βασική τιμή λιανικής €<input type="number" step="0.01" min="0" value={editBasePrice} onChange={e=>setEditBasePrice(e.target.value)}/></label><label>ΦΠΑ %<input type="number" min="0" max="100" step="0.01" value={editVat} placeholder={editVatVerified?"Ποσοστό":"Μη επιβεβαιωμένος"} onChange={e=>setEditVat(e.target.value)}/></label></div><div className="product-card-switches"><label className="check"><input type="checkbox" checked={editVatVerified} onChange={e=>setEditVatVerified(e.target.checked)}/>ΦΠΑ επιβεβαιωμένος</label><label className="check"><input type="checkbox" checked={productCard.trackStock} onChange={e=>setProductCard(c=>({...c,trackStock:e.target.checked}))}/>Παρακολούθηση αποθήκης</label><label className="check"><input type="checkbox" checked={productCard.active} onChange={e=>setProductCard(c=>({...c,active:e.target.checked}))}/>Ενεργό προϊόν</label></div>{!editVatVerified&&<div className="op-alert warning">Ο ΦΠΑ παραμένει μη επιβεβαιωμένος και εμφανίζεται καθαρά ως εκκρεμότητα.</div>}<div className="barcode-editor"><div className="section-heading"><div><h4>Barcodes</h4><small>Πολλαπλά barcodes και συσκευασίες για το ίδιο είδος.</small></div><button type="button" className="secondary" onClick={()=>setProductCard(c=>({...c,barcodes:[...c.barcodes,{barcode:"",unitMultiplier:"1"}]}))}>+ Προσθήκη</button></div>{productCard.barcodes.length===0&&<div className="empty-row">Δεν έχει καταχωριστεί barcode.</div>}{productCard.barcodes.map((row,index)=><div className="barcode-row" key={index}><input aria-label={`Barcode ${index+1}`} value={row.barcode} onChange={e=>setProductCard(c=>({...c,barcodes:c.barcodes.map((item,i)=>i===index?{...item,barcode:e.target.value}:item)}))} placeholder="Barcode"/><input aria-label={`Πολλαπλασιαστής ${index+1}`} type="number" step="0.001" min="0.001" value={row.unitMultiplier} onChange={e=>setProductCard(c=>({...c,barcodes:c.barcodes.map((item,i)=>i===index?{...item,unitMultiplier:e.target.value}:item)}))} placeholder="Τεμάχια"/><button type="button" className="remove-row" onClick={()=>setProductCard(c=>({...c,barcodes:c.barcodes.filter((_,i)=>i!==index)}))}>Διαγραφή</button></div>)}</div><div className="store-price-list"><div className="section-heading"><div><h4>Καταστήματα, τιμές και alarm stock</h4><small>Ξεχωριστή ενεργοποίηση, λιανική και ελάχιστο απόθεμα.</small></div></div>{activeStores.map(store=><div className="store-product-card" key={store.id}><label className="check"><input type="checkbox" checked={Boolean(priceStores[store.id]?.active)} onChange={e=>setPriceStores(c=>({...c,[store.id]:{...c[store.id],active:e.target.checked}}))}/><Store/>{store.name}</label><label>Τιμή €<input type="number" step="0.01" min="0" value={priceStores[store.id]?.salePrice??editBasePrice} onChange={e=>setPriceStores(c=>({...c,[store.id]:{...c[store.id],salePrice:e.target.value}}))}/></label><label>Alarm stock<input type="number" step="0.001" min="0" value={priceStores[store.id]?.minStock??""} onChange={e=>setPriceStores(c=>({...c,[store.id]:{...c[store.id],minStock:e.target.value}}))} placeholder="—"/></label></div>)}</div><button className="primary product-card-save" onClick={saveProductCard} disabled={busy||!productCard.name.trim()}><Check/>Αποθήκευση καρτέλας προϊόντος</button></aside>:<aside className="op-box empty">Επίλεξε προϊόν για να ανοίξει η πλήρης καρτέλα του.</aside>}</div>}

    {tab==="promotions"&&<div className="op-grid two"><section className="op-box"><h3>Νέα προσφορά</h3><form className="op-form" onSubmit={createPromotion}><label>Προϊόν<select name="productId" required><option value="">Επιλογή</option>{catalog.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Όνομα προσφοράς<input name="name" required placeholder="π.χ. ΑΛΦΑ ΦΙΑΛΗ -20%"/></label><label>Τύπος<select name="promotionType" value={promotionType} onChange={e=>setPromotionType(e.target.value)}><option value="PERCENT">Ποσοστό %</option><option value="BUY_X_GET_Y">2+1 / X+Y</option><option value="FIXED_PRICE">Τελική τιμή</option></select></label>{promotionType==="PERCENT"&&<label>Έκπτωση %<input name="percentOff" type="number" min="0.01" max="100" step="0.01" required/></label>}{promotionType==="BUY_X_GET_Y"&&<div className="op-two"><label>Αγορά Χ<input name="buyQuantity" type="number" min="1" step="1" required/></label><label>Δωρεάν Υ<input name="freeQuantity" type="number" min="1" step="1" required/></label></div>}{promotionType==="FIXED_PRICE"&&<label>Τελική τιμή<input name="fixedPrice" type="number" min="0.01" step="0.01" required/></label>}<div className="op-two"><label>Από<input name="startsAt" type="datetime-local" defaultValue={localInputDate(new Date())} required/></label><label>Έως<input name="endsAt" type="datetime-local" defaultValue={localInputDate(new Date(Date.now()+7*86400000))} required/></label></div><label>Προτεραιότητα<input name="priority" type="number" defaultValue="100" min="0"/></label><fieldset><legend>Καταστήματα προσφοράς</legend>{activeStores.map(s=><label className="check" key={s.id}><input name={`store_${s.id}`} type="checkbox" defaultChecked/>{s.name}</label>)}</fieldset><button className="primary">Δημιουργία προσφοράς</button></form></section><section className="op-box"><h3>Προσφορές</h3><div className="promo-list">{promotions.map(p=><article key={p.id}><div><b>{p.name}</b><small>{p.productName} · {p.promotionType}</small><small>{new Date(p.startsAt).toLocaleString("el-GR")} → {new Date(p.endsAt).toLocaleString("el-GR")}</small><small>{(p.stores||[]).map(s=>s.storeName).join(", ")}</small></div><button className={p.active?"danger":"secondary"} onClick={()=>togglePromotion(p)}>{p.active?"Παύση":"Ενεργοποίηση"}</button></article>)}</div></section></div>}

    {tab==="stocktake"&&<div className="op-grid two"><section className="op-box"><h3>Νέα απογραφή</h3><form className="op-form" onSubmit={createStocktake}><label>Κατάστημα<select name="storeId" required><option value="">Επιλογή</option>{activeStores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Ονομασία<input name="name" required defaultValue={`Απογραφή ${new Date().toLocaleDateString("el-GR")}`}/></label><button className="primary"><Boxes/>Έναρξη απογραφής</button></form><h3>Ιστορικό</h3><div className="promo-list">{stocktakes.map(st=><button className="stocktake-card" key={st.id} onClick={()=>openStocktakeById(st.id)}><span><b>{st.name}</b><small>{st.storeName} · {new Date(st.startedAt).toLocaleString("el-GR")}</small></span><span><em className={st.status==="FINALIZED"?"ok":""}>{st.status}</em><small>{st.countedCount}/{st.lineCount}</small></span></button>)}</div></section><section className="op-box">{openStocktake?<><div className="stocktake-head"><div><h3>{openStocktake.name}</h3><p>{openStocktake.storeName} · {openStocktake.status}</p></div>{openStocktake.status==="DRAFT"&&<button className="primary" onClick={finalizeStocktake}>Οριστικοποίηση</button>}</div><div className="stocktake-table"><div className="stock-row head"><span>Προϊόν</span><span>Θεωρητικό</span><span>Φυσικό</span><span>Διαφορά</span><span>Αξία</span></div>{(openStocktake.lines||[]).map(line=><div className="stock-row" key={line.id}><span><b>{line.name}</b><small>{line.sku||"—"}</small></span><span>{n(line.expectedQuantity)}</span><span>{openStocktake.status==="DRAFT"?<input type="number" min="0" step="0.001" defaultValue={line.countedQuantity??""} onBlur={e=>e.target.value!==""&&saveCount(line.id,e.target.value)}/>:n(line.countedQuantity)}</span><span>{n(line.difference)}</span><span>{money(line.differenceValue)}</span></div>)}</div></>:<div className="empty">Επίλεξε ή ξεκίνησε απογραφή.</div>}</section></div>}
    {tab==="inventory2"&&<InventoryV2Center api={api} stores={activeStores} catalog={catalog} loadCatalog={loadCatalog}/>}
  </div>;
}
