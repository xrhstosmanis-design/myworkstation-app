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

  const loadCatalog=async()=>{
    try{const rows=await api("/api/owner-products/catalog?q=");setCatalog(Array.isArray(rows)?rows:[])}catch{setCatalog([])}
  };
  useEffect(()=>{loadCatalog()},[reloadKey]);

  const bySku=useMemo(()=>{
    const map=new Map();for(const row of catalog)if(row.sku)map.set(String(row.sku).trim(),row);return map;
  },[catalog]);
  const preparationSources=useMemo(()=>catalog.filter(p=>p?.active!==false&&!String(p?.sku||"").startsWith("MWS-PREP-")).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"el")),[catalog]);

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
      if(tabs&&selectedRow){
        const cells=[...selectedRow.children],sku=(cells[2]?.textContent||"").trim(),product=bySku.get(sku);
        if(product&&!tabs.querySelector(".mws-preparation-tab")){
          const prep=document.createElement("button");prep.type="button";prep.className="mws-preparation-tab";prep.textContent="Παρασκευή / Modifiers";prep.title="Συνταγή, Modifiers, stock υλικών και παραγωγή";prep.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();setPreparationTarget(product)});tabs.appendChild(prep)
        }
        if(product&&!tabs.querySelector(".mws-delivery-tab")){
          const button=document.createElement("button");button.type="button";button.className="mws-delivery-tab";button.textContent="E‑Delivery";button.title="Modifiers, efood, Wolt, stock και τιμές";button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();openDelivery(product)});tabs.appendChild(button)
        }
      }
      const footer=root.querySelector(".kiosk-list-footer");
      if(footer&&!footer.querySelector(".mws-bulk-preparation-btn")){
        const button=document.createElement("button");button.type="button";button.className="mws-bulk-preparation-btn";button.textContent="Συνταγές / Modifiers";button.title="Στείλε συνταγή και ομάδες Modifiers στα είδη που έχεις επιλέξει με τα κουτάκια";
        button.addEventListener("click",event=>{
          event.preventDefault();event.stopPropagation();
          const selectedRows=[...root.querySelectorAll(".kiosk-tr.items-v3:not(.head)")].filter(row=>row.querySelector('.check-cell input[type="checkbox"]')?.checked);
          const targets=selectedRows.map(row=>bySku.get((row.children[2]?.textContent||"").trim())).filter(Boolean);
          if(!targets.length){setError("Επίλεξε πρώτα τα είδη από τα κουτάκια αριστερά.");return}
          setError("");setBulkResult("");setBulkSourceId("");setBulkCopyRecipe(true);setBulkCopyModifiers(true);setBulkPreparation({targets});
        });
        const bulkButton=[...footer.querySelectorAll("button")].find(b=>(b.textContent||"").includes("Ομαδική διόρθωση"));
        if(bulkButton?.nextSibling)footer.insertBefore(button,bulkButton.nextSibling);else footer.appendChild(button);
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

  const applyBulkPreparation=async()=>{
    if(!bulkPreparation?.targets?.length)return;
    if(!bulkSourceId)return setError("Διάλεξε πρώτα το είδος-πηγή από το οποίο θα σταλεί η συνταγή / τα Modifiers.");
    if(!bulkCopyRecipe&&!bulkCopyModifiers)return setError("Επίλεξε Συνταγή, Modifiers ή και τα δύο.");
    const targets=bulkPreparation.targets.filter(p=>p.id!==bulkSourceId);
    if(!targets.length)return setError("Το είδος-πηγή δεν μπορεί να είναι το μοναδικό είδος προορισμού.");
    setBusy(true);setError("");setBulkResult("");
    try{
      const source=await api(`/api/management/preparation/products/${bulkSourceId}`);
      let changed=0;
      for(const product of targets){
        const current=await api(`/api/management/preparation/products/${product.id}`);
        if(bulkCopyRecipe){
          for(const line of current.recipe||[])await api(`/api/management/preparation/recipe/${line.id}`,{method:"DELETE"});
          for(const line of source.recipe||[])await api(`/api/management/preparation/products/${product.id}/recipe`,{method:"POST",body:JSON.stringify({ingredientProductId:line.ingredientProductId,quantity:Number(line.quantity),unit:line.unit,automatic:line.automatic!==false})});
        }
        if(bulkCopyModifiers){
          for(const group of current.groups||[])await api(`/api/management/preparation/products/${product.id}/groups/${group.groupId}`,{method:"DELETE"});
          for(const group of source.groups||[])await api(`/api/management/preparation/products/${product.id}/groups`,{method:"POST",body:JSON.stringify({groupId:group.groupId,required:Boolean(group.required),minSelections:Number(group.minSelections||0),maxSelections:Number(group.maxSelections||1),sequence:Number(group.sequence||0)})});
        }
        changed++;
      }
      setBulkResult(`Ολοκληρώθηκε. Ενημερώθηκαν ${changed} είδη${bulkCopyRecipe&&bulkCopyModifiers?" με Συνταγή και Modifiers":bulkCopyRecipe?" με τη Συνταγή":" με τα Modifiers"}.`);
      setReloadKey(x=>x+1);
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };

  return <div ref={hostRef}>
    <style>{`
      .mws-stock-pencil{width:100%;display:flex;align-items:center;justify-content:flex-start;gap:7px;border:0;background:transparent;color:#15355d;font:inherit;font-weight:800;cursor:pointer;padding:2px 4px}.mws-stock-pencil:hover{color:#08a9d6}.mws-stock-pencil-icon{color:#08a9d6;font-size:16px}
      .mws-stock-dialog{width:min(680px,94vw)}.mws-stock-dialog .stock-product{font-weight:900;color:#14355f;margin:0 0 14px}.mws-stock-current{display:flex;justify-content:space-between;align-items:center;background:#edf7fc;border:1px solid #c9dfec;border-radius:10px;padding:12px 14px;margin:10px 0 14px}.mws-stock-current b{font-size:20px;color:#0a9fca}
      .mws-stock-modes{display:grid;gap:9px}.mws-stock-mode{display:flex;gap:10px;align-items:flex-start;border:1px solid #d7e2ec;border-radius:10px;padding:11px;background:#fff}.mws-stock-mode:has(input:checked){border-color:#08a9d6;background:#f1fbfe}.mws-stock-mode strong{display:block;color:#132f55}.mws-stock-mode small{display:block;color:#6c7e94;margin-top:3px}.mws-stock-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:15px}.mws-stock-fields label{font-weight:800;color:#17345b}.mws-stock-fields input,.mws-stock-fields select{width:100%;box-sizing:border-box;border:1px solid #c9d7e5;border-radius:8px;padding:9px;margin-top:5px;background:#fff}.mws-stock-log{display:flex!important;align-items:center;gap:8px;margin-top:14px!important}.mws-stock-log input{width:auto!important;margin:0!important}.mws-stock-preview{margin-top:12px;padding:10px 12px;border-left:4px solid #08a9d6;background:#eef9fc;color:#17345b}
      .product-tabs .mws-delivery-tab{color:#075a88;font-weight:900}.product-tabs .mws-delivery-tab:hover{background:#e8f8fd;color:#00a9d6}.product-tabs .mws-preparation-tab{color:#07563f;font-weight:1000;background:#edf8f4}.product-tabs .mws-preparation-tab:hover{background:#dff3eb;color:#087a52}.mws-delivery-dialog{width:min(900px,95vw)}.mws-delivery-section{padding:18px}.mws-delivery-title{display:flex;justify-content:space-between;margin-bottom:14px}.mws-delivery-title b{display:block;font-size:18px;color:#15355d}.mws-delivery-title small{color:#718096}.mws-delivery-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 14px}.mws-delivery-check{display:flex;gap:8px;align-items:center;border:1px solid #d6e4ef;border-radius:9px;padding:10px;background:#f8fbfe;font-weight:800}.mws-delivery-grid{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:12px;margin-top:14px}.mws-delivery-grid label{display:grid;gap:5px;color:#17345b;font-weight:800}.mws-delivery-grid input{border:1px solid #c8d8e6;border-radius:8px;padding:9px}.mws-delivery-note{background:#eef9fc;border-left:4px solid #08a9d6;padding:10px 12px;color:#46647e}@media(max-width:760px){.mws-delivery-checks,.mws-delivery-grid{grid-template-columns:1fr}}
      .mws-bulk-preparation-btn{font-weight:900!important;background:#0e6d5a!important;color:#fff!important;border-color:#0e6d5a!important}.mws-bulk-preparation-btn:hover{background:#095646!important}.mws-bulk-prep-dialog{width:min(920px,96vw)}.mws-bulk-prep-body{padding:18px}.mws-bulk-prep-body>label{display:grid;gap:6px;font-weight:900;color:#17345b}.mws-bulk-prep-body select{width:100%;box-sizing:border-box;border:1px solid #c8d8e6;border-radius:9px;padding:10px;background:#fff}.mws-bulk-prep-options{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.mws-bulk-prep-options label{display:flex;align-items:center;gap:8px;border:1px solid #cfe0ea;border-radius:9px;padding:10px 14px;background:#f7fbfd;font-weight:900;color:#15355d}.mws-bulk-prep-targets{border:1px solid #d8e3eb;border-radius:10px;background:#fff;max-height:230px;overflow:auto}.mws-bulk-prep-targets header{position:sticky;top:0;padding:10px 12px;background:#eef6fa;border-bottom:1px solid #d8e3eb;font-weight:900;color:#15355d}.mws-bulk-prep-targets div{padding:8px 12px;border-bottom:1px solid #edf1f4;color:#203b60}.mws-bulk-prep-targets div:last-child{border-bottom:0}.mws-bulk-prep-warning{margin:14px 0;padding:11px 13px;border-left:4px solid #d98a00;background:#fff7e8;color:#684900;font-weight:700}.mws-bulk-prep-success{margin:12px 0;padding:11px 13px;border-left:4px solid #12946c;background:#ecfbf5;color:#096346;font-weight:900}
    `}</style>
    <KioskStyleProductCenter key={reloadKey} api={api} stores={stores}/>
    {target&&<div className="kiosk-modal-backdrop"><div className="kiosk-modal mws-stock-dialog"><div className="kiosk-modal-title">Διόρθωση Stock είδους <button onClick={()=>setTarget(null)}>×</button></div><p className="stock-product">{target.product.name}</p>{storeRows.length>1&&<label>Κατάστημα<select value={target.storeId} onChange={e=>setTarget(t=>({...t,storeId:e.target.value}))}>{storeRows.map(s=><option key={s.storeId} value={s.storeId}>{s.storeName}</option>)}</select></label>}<div className="mws-stock-current"><span>Τρέχον Stock</span><b>{currentStock}</b></div><div className="mws-stock-modes"><label className="mws-stock-mode"><input type="radio" checked={mode==="SET"} onChange={()=>setMode("SET")}/><span><strong>(=) Ακριβώς την «ποσότητα»</strong><small>Η ποσότητα θα γίνει ακριβώς το stock της αποθήκης.</small></span></label><label className="mws-stock-mode"><input type="radio" checked={mode==="ADD"} onChange={()=>setMode("ADD")}/><span><strong>(+) Αύξηση κατά την «ποσότητα»</strong><small>Η ποσότητα θα προστεθεί στο τρέχον stock.</small></span></label><label className="mws-stock-mode"><input type="radio" checked={mode==="SUBTRACT"} onChange={()=>setMode("SUBTRACT")}/><span><strong>(−) Μείωση κατά την «ποσότητα»</strong><small>Η ποσότητα θα αφαιρεθεί από το τρέχον stock.</small></span></label></div><div className="mws-stock-fields"><label>Ποσότητα<input autoFocus type="number" min="0" step="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label>Νέο Stock<input readOnly value={quantity===""?currentStock:calculated}/></label></div><label className="mws-stock-log"><input type="checkbox" checked={logMovement} onChange={e=>setLogMovement(e.target.checked)}/> Καταχώρηση στο ημερολόγιο κινήσεων</label>{error&&<div className="kiosk-error">{error}</div>}<div className="mws-stock-preview">Η αλλαγή θα εφαρμοστεί μόνο στο επιλεγμένο κατάστημα και προϊόν.</div><div className="kiosk-modal-actions"><button onClick={()=>setTarget(null)}>Επιστροφή</button><button className="primary" disabled={busy} onClick={submit}>{busy?"Καταχώρηση…":"Καταχώρηση"}</button></div></div></div>}
    {deliveryTarget&&deliveryDraft&&<div className="kiosk-modal-backdrop"><div className="kiosk-modal mws-delivery-dialog"><div className="kiosk-modal-title">{deliveryTarget.name} · Modifiers & E‑Delivery <button onClick={()=>{setDeliveryTarget(null);setDeliveryDraft(null)}}>×</button></div><ProductDeliveryFields draft={deliveryDraft} onChange={changeDelivery}/>{error&&<div className="kiosk-error">{error}</div>}<div className="kiosk-modal-actions"><button onClick={()=>{setDeliveryTarget(null);setDeliveryDraft(null)}}>Επιστροφή</button><button className="primary" disabled={busy} onClick={saveDelivery}>{busy?"Αποθήκευση…":"Αποθήκευση"}</button></div></div></div>}
    {preparationTarget&&<ProductPreparationEditor api={api} product={preparationTarget} onClose={()=>setPreparationTarget(null)}/>} 
    {bulkPreparation&&<div className="kiosk-modal-backdrop"><div className="kiosk-modal mws-bulk-prep-dialog"><div className="kiosk-modal-title">Ομαδική αποστολή Συνταγής / Modifiers <button onClick={()=>setBulkPreparation(null)}>×</button></div><div className="mws-bulk-prep-body"><label>Από ποιο είδος θα αντιγράψω;<select value={bulkSourceId} onChange={e=>{setBulkSourceId(e.target.value);setBulkResult("")}}><option value="">Επίλεξε είδος-πηγή…</option>{preparationSources.map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku||"χωρίς κωδικό"}</option>)}</select></label><div className="mws-bulk-prep-options"><label><input type="checkbox" checked={bulkCopyRecipe} onChange={e=>setBulkCopyRecipe(e.target.checked)}/> Στείλε ΣΥΝΤΑΓΗ</label><label><input type="checkbox" checked={bulkCopyModifiers} onChange={e=>setBulkCopyModifiers(e.target.checked)}/> Στείλε MODIFIERS</label></div><div className="mws-bulk-prep-targets"><header>Είδη προορισμού · {bulkPreparation.targets.length}</header>{bulkPreparation.targets.map(p=><div key={p.id}>{p.name} · {p.sku||"χωρίς κωδικό"}</div>)}</div><div className="mws-bulk-prep-warning">Η αποστολή ΑΝΤΙΚΑΘΙΣΤΑ την υπάρχουσα συνταγή ή/και τις υπάρχουσες ομάδες Modifiers στα επιλεγμένα είδη. Δεν αλλάζει τιμές, stock ή άλλα στοιχεία προϊόντος.</div>{error&&<div className="kiosk-error">{error}</div>}{bulkResult&&<div className="mws-bulk-prep-success">{bulkResult}</div>}</div><div className="kiosk-modal-actions"><button onClick={()=>setBulkPreparation(null)}>Κλείσιμο</button><button className="primary" disabled={busy||!bulkSourceId||(!bulkCopyRecipe&&!bulkCopyModifiers)} onClick={applyBulkPreparation}>{busy?"Αποστολή…":"Αποστολή στα επιλεγμένα"}</button></div></div></div>}
  </div>;
}
