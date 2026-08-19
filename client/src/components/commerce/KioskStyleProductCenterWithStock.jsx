import React,{useEffect,useMemo,useRef,useState} from "react";
import KioskStyleProductCenter from "./KioskStyleProductCenter.jsx";
import ProductDeliveryFields,{deliveryDefaults} from "./ProductDeliveryFields.jsx";
import ProductPreparationEditor from "./ProductPreparationEditor.jsx";

const num=value=>Number(value||0);

export default function KioskStyleProductCenterWithStock({api,stores=[]}){
  const hostRef=useRef(null);
  const [catalog,setCatalog]=useState([]);
  const [target,setTarget]=useState(null);
  const [mode,setMode]=useState("SET");
  const [quantity,setQuantity]=useState("");
  const [logMovement,setLogMovement]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [reloadKey,setReloadKey]=useState(0);
  const [deliveryTarget,setDeliveryTarget]=useState(null);
  const [deliveryDraft,setDeliveryDraft]=useState(null);
  const [preparationTarget,setPreparationTarget]=useState(null);
  const [bulkPreparation,setBulkPreparation]=useState(null);
  const [bulkSourceId,setBulkSourceId]=useState("");
  const [bulkCopyRecipe,setBulkCopyRecipe]=useState(true);
  const [bulkCopyModifiers,setBulkCopyModifiers]=useState(true);
  const [bulkResult,setBulkResult]=useState("");

  const loadCatalog=async()=>{try{const rows=await api("/api/owner-products/catalog?q=");setCatalog(Array.isArray(rows)?rows:[])}catch{setCatalog([])}};
  useEffect(()=>{loadCatalog()},[reloadKey]);
  const bySku=useMemo(()=>{const map=new Map();for(const row of catalog)if(row.sku)map.set(String(row.sku).trim(),row);return map},[catalog]);
  const preparationSources=useMemo(()=>catalog.filter(p=>p?.active!==false&&!String(p?.sku||"").startsWith("MWS-PREP-")).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"el")),[catalog]);

  const openBulkPreparation=()=>{
    const root=hostRef.current;if(!root)return;
    const selectedRows=[...root.querySelectorAll(".kiosk-tr.items-v3:not(.head)")].filter(row=>row.querySelector('.check-cell input[type="checkbox"]')?.checked);
    const targets=selectedRows.map(row=>bySku.get((row.children[2]?.textContent||"").trim())).filter(Boolean);
    if(!targets.length){setError("Επίλεξε πρώτα τα είδη από τα κουτάκια αριστερά.");return}
    setError("");setBulkResult("");setBulkSourceId("");setBulkCopyRecipe(true);setBulkCopyModifiers(true);setBulkPreparation({targets});
  };

  const openDelivery=async product=>{setError("");setBusy(true);try{const data=await api(`/api/owner-products/${product.id}/delivery`);setDeliveryTarget(product);setDeliveryDraft(deliveryDefaults(data))}catch(e){setError(e.message)}finally{setBusy(false)}};

  useEffect(()=>{
    const root=hostRef.current;if(!root)return;
    const decorate=()=>{
      const rows=[...root.querySelectorAll(".kiosk-tr.items-v3:not(.head)")];
      rows.forEach(rowEl=>{const cells=[...rowEl.children];if(cells.length<9)return;const stockCell=cells[cells.length-1];if(stockCell.dataset.stockPencilReady!=="1"){const sku=(cells[2]?.textContent||"").trim();const product=bySku.get(sku);if(product){stockCell.dataset.stockPencilReady="1";const currentText=stockCell.textContent.trim();stockCell.innerHTML="";const button=document.createElement("button");button.type="button";button.className="mws-stock-pencil";button.title="Διόρθωση Stock";button.innerHTML=`<span class="mws-stock-pencil-icon">✎</span><span>${currentText||"0"}</span>`;button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();const storeRows=Array.isArray(product.stores)?product.stores:[];const preferred=storeRows.find(s=>s.active!==false)||storeRows[0]||null;setTarget({product,storeId:preferred?.storeId||stores[0]?.id||""});setMode("SET");setQuantity("");setLogMovement(true);setError("")});stockCell.appendChild(button)}}});
      const tabs=root.querySelector(".kiosk-product-card .product-tabs"),selectedRow=root.querySelector(".kiosk-tr.items-v3.selected-row");
      if(tabs&&selectedRow){const cells=[...selectedRow.children],sku=(cells[2]?.textContent||"").trim(),product=bySku.get(sku);if(product&&!tabs.querySelector(".mws-preparation-tab")){const prep=document.createElement("button");prep.type="button";prep.className="mws-preparation-tab";prep.textContent="Παρασκευή / Modifiers";prep.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();setPreparationTarget(product)});tabs.appendChild(prep)}if(product&&!tabs.querySelector(".mws-delivery-tab")){const button=document.createElement("button");button.type="button";button.className="mws-delivery-tab";button.textContent="E‑Delivery";button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();openDelivery(product)});tabs.appendChild(button)}}
      const footer=root.querySelector(".kiosk-list-footer");
      if(footer&&!footer.querySelector(".mws-bulk-preparation-btn")){const button=document.createElement("button");button.type="button";button.className="mws-bulk-preparation-btn";button.textContent="Συνταγές / Modifiers";button.title="Στείλε συνταγή και ομάδες Modifiers στα επιλεγμένα είδη";button.onclick=event=>{event.preventDefault();event.stopPropagation();openBulkPreparation()};const bulkButton=[...footer.querySelectorAll("button")].find(b=>(b.textContent||"").includes("Ομαδική διόρθωση"));if(bulkButton?.nextSibling)footer.insertBefore(button,bulkButton.nextSibling);else footer.appendChild(button)}
    };
    decorate();const observer=new MutationObserver(decorate);observer.observe(root,{childList:true,subtree:true});return()=>observer.disconnect();
  },[bySku,stores]);

  const storeRows=target?.product?.stores||[],selectedStore=storeRows.find(s=>s.storeId===target?.storeId),currentStock=num(selectedStore?.currentStock),calculated=target?(mode==="SET"?num(quantity):mode==="ADD"?currentStock+num(quantity):currentStock-num(quantity)):0;
  const submit=async()=>{if(!target?.storeId)return setError("Δεν υπάρχει κατάστημα για το προϊόν.");if(quantity===""||Number(quantity)<0)return setError("Συμπλήρωσε έγκυρη ποσότητα.");if(calculated<0)return setError("Η διόρθωση δεν μπορεί να δημιουργήσει αρνητικό stock.");setBusy(true);setError("");try{await api(`/api/owner-products/${target.product.id}/stock-adjustment`,{method:"POST",body:JSON.stringify({storeId:target.storeId,mode,quantity:Number(quantity),logMovement})});setTarget(null);setReloadKey(x=>x+1)}catch(e){setError(e.message)}finally{setBusy(false)}};
  const saveDelivery=async()=>{if(!deliveryTarget||!deliveryDraft)return;setBusy(true);setError("");try{await api(`/api/owner-products/${deliveryTarget.id}/delivery`,{method:"PATCH",body:JSON.stringify({...deliveryDraft,modifierGroup:deliveryDraft.modifierGroup||null,efoodPrice:deliveryDraft.efoodPrice===""?null:Number(deliveryDraft.efoodPrice),woltPrice:deliveryDraft.woltPrice===""?null:Number(deliveryDraft.woltPrice)})});setDeliveryTarget(null);setDeliveryDraft(null)}catch(e){setError(e.message)}finally{setBusy(false)}};
  const changeDelivery=(key,value)=>setDeliveryDraft(d=>({...d,[key]:value}));
  const applyBulkPreparation=async()=>{if(!bulkPreparation?.targets?.length)return;if(!bulkSourceId)return setError("Διάλεξε πρώτα το είδος-πηγή.");if(!bulkCopyRecipe&&!bulkCopyModifiers)return setError("Επίλεξε Συνταγή, Modifiers ή και τα δύο.");const targets=bulkPreparation.targets.filter(p=>p.id!==bulkSourceId);if(!targets.length)return setError("Το είδος-πηγή δεν μπορεί να είναι το μοναδικό είδος προορισμού.");setBusy(true);setError("");setBulkResult("");try{const source=await api(`/api/management/preparation/products/${bulkSourceId}`);let changed=0;for(const product of targets){const current=await api(`/api/management/preparation/products/${product.id}`);if(bulkCopyRecipe){for(const line of current.recipe||[])await api(`/api/management/preparation/recipe/${line.id}`,{method:"DELETE"});for(const line of source.recipe||[])await api(`/api/management/preparation/products/${product.id}/recipe`,{method:"POST",body:JSON.stringify({ingredientProductId:line.ingredientProductId,quantity:Number(line.quantity),unit:line.unit,automatic:line.automatic!==false})})}if(bulkCopyModifiers){for(const group of current.groups||[])await api(`/api/management/preparation/products/${product.id}/groups/${group.groupId}`,{method:"DELETE"});for(const group of source.groups||[])await api(`/api/management/preparation/products/${product.id}/groups`,{method:"POST",body:JSON.stringify({groupId:group.groupId,required:Boolean(group.required),minSelections:Number(group.minSelections||0),maxSelections:Number(group.maxSelections||1),sequence:Number(group.sequence||0)})})}changed++}setBulkResult(`Ολοκληρώθηκε. Ενημερώθηκαν ${changed} είδη.`);setReloadKey(x=>x+1)}catch(e){setError(e.message)}finally{setBusy(false)}};

  return <div ref={hostRef}>
    <style>{`.mws-stock-pencil{width:100%;display:flex;align-items:center;gap:7px;border:0;background:transparent;color:#15355d;font:inherit;font-weight:800;cursor:pointer;padding:2px 4px}.mws-stock-pencil-icon{color:#08a9d6}.mws-stock-dialog{width:min(680px,94vw)}.product-tabs .mws-delivery-tab{color:#075a88;font-weight:900}.product-tabs .mws-preparation-tab{color:#07563f;font-weight:1000;background:#edf8f4}.mws-bulk-preparation-btn{font-weight:900!important;background:#0e6d5a!important;color:#fff!important;border-color:#0e6d5a!important}.mws-bulk-prep-dialog{width:min(920px,96vw)}.mws-bulk-prep-body{padding:18px}.mws-bulk-prep-body>label{display:grid;gap:6px;font-weight:900;color:#17345b}.mws-bulk-prep-body select{width:100%;box-sizing:border-box;border:1px solid #c8d8e6;border-radius:9px;padding:10px;background:#fff}.mws-bulk-prep-options{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.mws-bulk-prep-options label{display:flex;align-items:center;gap:8px;border:1px solid #cfe0ea;border-radius:9px;padding:10px 14px;background:#f7fbfd;font-weight:900}.mws-bulk-prep-targets{border:1px solid #d8e3eb;border-radius:10px;background:#fff;max-height:230px;overflow:auto}.mws-bulk-prep-targets header{padding:10px 12px;background:#eef6fa;font-weight:900}.mws-bulk-prep-targets div{padding:8px 12px;border-top:1px solid #edf1f4}.mws-bulk-prep-warning{margin:14px 0;padding:11px 13px;border-left:4px solid #d98a00;background:#fff7e8}.mws-bulk-prep-success{margin:12px 0;padding:11px 13px;border-left:4px solid #12946c;background:#ecfbf5;color:#096346;font-weight:900}`}</style>
    <KioskStyleProductCenter key={reloadKey} api={api} stores={stores}/>
    {target&&<div className="kiosk-modal-backdrop"><div className="kiosk-modal mws-stock-dialog"><div className="kiosk-modal-title">Διόρθωση Stock είδους <button onClick={()=>setTarget(null)}>×</button></div><p>{target.product.name}</p><div>Τρέχον Stock: <b>{currentStock}</b></div><input type="number" min="0" step="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)}/><div className="kiosk-modal-actions"><button onClick={()=>setTarget(null)}>Επιστροφή</button><button className="primary" disabled={busy} onClick={submit}>Καταχώρηση</button></div></div></div>}
    {deliveryTarget&&deliveryDraft&&<div className="kiosk-modal-backdrop"><div className="kiosk-modal"><div className="kiosk-modal-title">{deliveryTarget.name} · Modifiers & E‑Delivery <button onClick={()=>{setDeliveryTarget(null);setDeliveryDraft(null)}}>×</button></div><ProductDeliveryFields draft={deliveryDraft} onChange={changeDelivery}/><div className="kiosk-modal-actions"><button onClick={()=>{setDeliveryTarget(null);setDeliveryDraft(null)}}>Επιστροφή</button><button className="primary" disabled={busy} onClick={saveDelivery}>Αποθήκευση</button></div></div></div>}
    {preparationTarget&&<ProductPreparationEditor api={api} product={preparationTarget} onClose={()=>setPreparationTarget(null)}/>} 
    {bulkPreparation&&<div className="kiosk-modal-backdrop"><div className="kiosk-modal mws-bulk-prep-dialog"><div className="kiosk-modal-title">Ομαδική αποστολή Συνταγής / Modifiers <button onClick={()=>setBulkPreparation(null)}>×</button></div><div className="mws-bulk-prep-body"><label>Από ποιο είδος θα αντιγράψω;<select value={bulkSourceId} onChange={e=>setBulkSourceId(e.target.value)}><option value="">Επίλεξε είδος-πηγή…</option>{preparationSources.map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku||"χωρίς κωδικό"}</option>)}</select></label><div className="mws-bulk-prep-options"><label><input type="checkbox" checked={bulkCopyRecipe} onChange={e=>setBulkCopyRecipe(e.target.checked)}/> Στείλε ΣΥΝΤΑΓΗ</label><label><input type="checkbox" checked={bulkCopyModifiers} onChange={e=>setBulkCopyModifiers(e.target.checked)}/> Στείλε MODIFIERS</label></div><div className="mws-bulk-prep-targets"><header>Είδη προορισμού · {bulkPreparation.targets.length}</header>{bulkPreparation.targets.map(p=><div key={p.id}>{p.name} · {p.sku||"χωρίς κωδικό"}</div>)}</div><div className="mws-bulk-prep-warning">Αντικαθιστά μόνο τη συνταγή ή/και τα Modifiers στα επιλεγμένα είδη.</div>{error&&<div className="kiosk-error">{error}</div>}{bulkResult&&<div className="mws-bulk-prep-success">{bulkResult}</div>}</div><div className="kiosk-modal-actions"><button onClick={()=>setBulkPreparation(null)}>Κλείσιμο</button><button className="primary" disabled={busy||!bulkSourceId||(!bulkCopyRecipe&&!bulkCopyModifiers)} onClick={applyBulkPreparation}>Αποστολή στα επιλεγμένα</button></div></div></div>}
  </div>;
}
