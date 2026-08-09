import React,{useEffect,useMemo,useRef,useState} from "react";
import KioskStyleProductCenter from "./KioskStyleProductCenter.jsx";
import ProductDeliveryFields,{deliveryDefaults} from "./ProductDeliveryFields.jsx";

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

  const loadCatalog=async()=>{
    try{const rows=await api("/api/owner-products/catalog?q=");setCatalog(Array.isArray(rows)?rows:[])}catch{setCatalog([])}
  };
  useEffect(()=>{loadCatalog()},[reloadKey]);

  const bySku=useMemo(()=>{
    const map=new Map();for(const row of catalog)if(row.sku)map.set(String(row.sku).trim(),row);return map;
  },[catalog]);

  const openDelivery=async product=>{
    setError("");setBusy(true);
    try{const data=await api(`/api/owner-products/${product.id}/delivery`);setDeliveryTarget(product);setDeliveryDraft(deliveryDefaults(data))}catch(e){setError(e.message)}finally{setBusy(false)}
  };

  useEffect(()=>{
    const root=hostRef.current;if(!root)return;
    const decorate=()=>{
      const rows=[...root.querySelectorAll(".kiosk-tr.items-v3:not(.head)")];
      rows.forEach(rowEl=>{
        const cells=[...rowEl.children];if(cells.length<9)return;
        const stockCell=cells[cells.length-1];if(stockCell.dataset.stockPencilReady!=="1"){
          const sku=(cells[2]?.textContent||"").trim();
          const product=bySku.get(sku);if(product){
            stockCell.dataset.stockPencilReady="1";
            const currentText=stockCell.textContent.trim();stockCell.innerHTML="";
            const button=document.createElement("button");button.type="button";button.className="mws-stock-pencil";button.title="Διόρθωση Stock";
            button.innerHTML=`<span class="mws-stock-pencil-icon">✎</span><span>${currentText||"0"}</span>`;
            button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();const storeRows=Array.isArray(product.stores)?product.stores:[];const preferred=storeRows.find(s=>s.active!==false)||storeRows[0]||null;setTarget({product,storeId:preferred?.storeId||stores[0]?.id||""});setMode("SET");setQuantity("");setLogMovement(true);setError("")});
            stockCell.appendChild(button);
          }
        }
      });
      const tabs=root.querySelector(".kiosk-product-card .product-tabs");
      const selectedRow=root.querySelector(".kiosk-tr.items-v3.selected-row");
      if(tabs&&selectedRow&&!tabs.querySelector(".mws-delivery-tab")){
        const cells=[...selectedRow.children],sku=(cells[2]?.textContent||"").trim(),product=bySku.get(sku);
        if(product){const button=document.createElement("button");button.type="button";button.className="mws-delivery-tab";button.textContent="E‑Delivery";button.title="Modifiers, efood, Wolt, stock και τιμές";button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();openDelivery(product)});tabs.appendChild(button)}
      }
    };
    decorate();const observer=new MutationObserver(decorate);observer.observe(root,{childList:true,subtree:true});return()=>observer.disconnect();
  },[bySku,stores]);

  const storeRows=target?.product?.stores||[];
  const selectedStore=storeRows.find(s=>s.storeId===target?.storeId);
  const currentStock=num(selectedStore?.currentStock);
  const calculated=target?(mode==="SET"?num(quantity):mode==="ADD"?currentStock+num(quantity):currentStock-num(quantity)):0;

  const submit=async()=>{
    if(!target?.storeId)return setError("Δεν υπάρχει κατάστημα για το προϊόν.");
    if(quantity===""||Number(quantity)<0)return setError("Συμπλήρωσε έγκυρη ποσότητα.");
    if(calculated<0)return setError("Η διόρθωση δεν μπορεί να δημιουργήσει αρνητικό stock.");
    setBusy(true);setError("");try{await api(`/api/owner-products/${target.product.id}/stock-adjustment`,{method:"POST",body:JSON.stringify({storeId:target.storeId,mode,quantity:Number(quantity),logMovement})});setTarget(null);setReloadKey(x=>x+1)}catch(e){setError(e.message)}finally{setBusy(false)}
  };

  const saveDelivery=async()=>{
    if(!deliveryTarget||!deliveryDraft)return;setBusy(true);setError("");
    try{await api(`/api/owner-products/${deliveryTarget.id}/delivery`,{method:"PATCH",body:JSON.stringify({...deliveryDraft,modifierGroup:deliveryDraft.modifierGroup||null,efoodPrice:deliveryDraft.efoodPrice===""?null:Number(deliveryDraft.efoodPrice),woltPrice:deliveryDraft.woltPrice===""?null:Number(deliveryDraft.woltPrice)})});setDeliveryTarget(null);setDeliveryDraft(null)}catch(e){setError(e.message)}finally{setBusy(false)}
  };
  const changeDelivery=(key,value)=>setDeliveryDraft(d=>({...d,[key]:value}));

  return <div ref={hostRef}>
    <style>{`
      .mws-stock-pencil{width:100%;display:flex;align-items:center;justify-content:flex-start;gap:7px;border:0;background:transparent;color:#15355d;font:inherit;font-weight:800;cursor:pointer;padding:2px 4px}.mws-stock-pencil:hover{color:#08a9d6}.mws-stock-pencil-icon{color:#08a9d6;font-size:16px}
      .mws-stock-dialog{width:min(680px,94vw)}.mws-stock-dialog .stock-product{font-weight:900;color:#14355f;margin:0 0 14px}.mws-stock-current{display:flex;justify-content:space-between;align-items:center;background:#edf7fc;border:1px solid #c9dfec;border-radius:10px;padding:12px 14px;margin:10px 0 14px}.mws-stock-current b{font-size:20px;color:#0a9fca}
      .mws-stock-modes{display:grid;gap:9px}.mws-stock-mode{display:flex;gap:10px;align-items:flex-start;border:1px solid #d7e2ec;border-radius:10px;padding:11px;background:#fff}.mws-stock-mode:has(input:checked){border-color:#08a9d6;background:#f1fbfe}.mws-stock-mode strong{display:block;color:#132f55}.mws-stock-mode small{display:block;color:#6c7e94;margin-top:3px}.mws-stock-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:15px}.mws-stock-fields label{font-weight:800;color:#17345b}.mws-stock-fields input,.mws-stock-fields select{width:100%;box-sizing:border-box;border:1px solid #c9d7e5;border-radius:8px;padding:9px;margin-top:5px;background:#fff}.mws-stock-log{display:flex!important;align-items:center;gap:8px;margin-top:14px!important}.mws-stock-log input{width:auto!important;margin:0!important}.mws-stock-preview{margin-top:12px;padding:10px 12px;border-left:4px solid #08a9d6;background:#eef9fc;color:#17345b}
      .product-tabs .mws-delivery-tab{color:#075a88;font-weight:900}.product-tabs .mws-delivery-tab:hover{background:#e8f8fd;color:#00a9d6}.mws-delivery-dialog{width:min(900px,95vw)}.mws-delivery-section{padding:18px}.mws-delivery-title{display:flex;justify-content:space-between;margin-bottom:14px}.mws-delivery-title b{display:block;font-size:18px;color:#15355d}.mws-delivery-title small{color:#718096}.mws-delivery-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 14px}.mws-delivery-check{display:flex;gap:8px;align-items:center;border:1px solid #d6e4ef;border-radius:9px;padding:10px;background:#f8fbfe;font-weight:800}.mws-delivery-grid{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:12px;margin-top:14px}.mws-delivery-grid label{display:grid;gap:5px;color:#17345b;font-weight:800}.mws-delivery-grid input{border:1px solid #c8d8e6;border-radius:8px;padding:9px}.mws-delivery-note{background:#eef9fc;border-left:4px solid #08a9d6;padding:10px 12px;color:#46647e}@media(max-width:760px){.mws-delivery-checks,.mws-delivery-grid{grid-template-columns:1fr}}
    `}</style>
    <KioskStyleProductCenter key={reloadKey} api={api} stores={stores}/>
    {target&&<div className="kiosk-modal-backdrop"><div className="kiosk-modal mws-stock-dialog"><div className="kiosk-modal-title">Διόρθωση Stock είδους <button onClick={()=>setTarget(null)}>×</button></div><p className="stock-product">{target.product.name}</p>{storeRows.length>1&&<label>Κατάστημα<select value={target.storeId} onChange={e=>setTarget(t=>({...t,storeId:e.target.value}))}>{storeRows.map(s=><option key={s.storeId} value={s.storeId}>{s.storeName}</option>)}</select></label>}<div className="mws-stock-current"><span>Τρέχον Stock</span><b>{currentStock}</b></div><div className="mws-stock-modes"><label className="mws-stock-mode"><input type="radio" checked={mode==="SET"} onChange={()=>setMode("SET")}/><span><strong>(=) Ακριβώς την «ποσότητα»</strong><small>Η ποσότητα θα γίνει ακριβώς το stock της αποθήκης.</small></span></label><label className="mws-stock-mode"><input type="radio" checked={mode==="ADD"} onChange={()=>setMode("ADD")}/><span><strong>(+) Αύξηση κατά την «ποσότητα»</strong><small>Η ποσότητα θα προστεθεί στο τρέχον stock.</small></span></label><label className="mws-stock-mode"><input type="radio" checked={mode==="SUBTRACT"} onChange={()=>setMode("SUBTRACT")}/><span><strong>(−) Μείωση κατά την «ποσότητα»</strong><small>Η ποσότητα θα αφαιρεθεί από το τρέχον stock.</small></span></label></div><div className="mws-stock-fields"><label>Ποσότητα<input autoFocus type="number" min="0" step="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label>Νέο Stock<input readOnly value={quantity===""?currentStock:calculated}/></label></div><label className="mws-stock-log"><input type="checkbox" checked={logMovement} onChange={e=>setLogMovement(e.target.checked)}/> Καταχώρηση στο ημερολόγιο κινήσεων</label>{error&&<div className="kiosk-error">{error}</div>}<div className="mws-stock-preview">Η αλλαγή θα εφαρμοστεί μόνο στο επιλεγμένο κατάστημα και προϊόν.</div><div className="kiosk-modal-actions"><button onClick={()=>setTarget(null)}>Επιστροφή</button><button className="primary" disabled={busy} onClick={submit}>{busy?"Καταχώρηση…":"Καταχώρηση"}</button></div></div></div>}
    {deliveryTarget&&deliveryDraft&&<div className="kiosk-modal-backdrop"><div className="kiosk-modal mws-delivery-dialog"><div className="kiosk-modal-title">{deliveryTarget.name} · Modifiers & E‑Delivery <button onClick={()=>{setDeliveryTarget(null);setDeliveryDraft(null)}}>×</button></div><ProductDeliveryFields draft={deliveryDraft} onChange={changeDelivery}/>{error&&<div className="kiosk-error">{error}</div>}<div className="kiosk-modal-actions"><button onClick={()=>{setDeliveryTarget(null);setDeliveryDraft(null)}}>Επιστροφή</button><button className="primary" disabled={busy} onClick={saveDelivery}>{busy?"Αποθήκευση…":"Αποθήκευση"}</button></div></div></div>}
  </div>;
}
