import React,{useEffect,useMemo,useRef,useState} from "react";
import KioskStyleProductCenter from "./KioskStyleProductCenter.jsx";
import ProductDeliveryFields,{deliveryDefaults} from "./ProductDeliveryFields.jsx";
import ProductPreparationEditor from "./ProductPreparationEditor.jsx";

const num=value=>Number(value||0);
const txt=value=>String(value??"").trim();
const isPrepMaterial=product=>txt(product?.sku).toUpperCase().startsWith("MWS-PREP-");
const categoryOf=p=>txt(p?.categoryName)||"ΧΩΡΙΣ ΚΑΤΗΓΟΡΙΑ";
const subcategoryOf=p=>txt(p?.subcategoryName)||"ΧΩΡΙΣ ΥΠΟΚΑΤΗΓΟΡΙΑ";
const searchable=p=>`${txt(p?.name)} ${txt(p?.sku)} ${(p?.barcodes||[]).map(x=>txt(x.barcode)).join(" ")}`.toLocaleUpperCase("el");

export default function KioskStyleProductCenterWithStock({api,stores=[]}){
 const hostRef=useRef(null);
 const [catalog,setCatalog]=useState([]),[target,setTarget]=useState(null),[mode,setMode]=useState("SET"),[quantity,setQuantity]=useState(""),[logMovement,setLogMovement]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[reloadKey,setReloadKey]=useState(0),[deliveryTarget,setDeliveryTarget]=useState(null),[deliveryDraft,setDeliveryDraft]=useState(null),[preparationTarget,setPreparationTarget]=useState(null);
 const [bulkOpen,setBulkOpen]=useState(false),[bulkAction,setBulkAction]=useState("COPY"),[bulkSourceId,setBulkSourceId]=useState(""),[bulkRecipe,setBulkRecipe]=useState(true),[bulkModifiers,setBulkModifiers]=useState(true),[bulkCategory,setBulkCategory]=useState("ALL"),[bulkSubcategory,setBulkSubcategory]=useState("ALL"),[bulkSearch,setBulkSearch]=useState(""),[bulkIds,setBulkIds]=useState([]),[bulkResult,setBulkResult]=useState(""),[bulkError,setBulkError]=useState("");
 const [sourceCategory,setSourceCategory]=useState("ALL"),[sourceSubcategory,setSourceSubcategory]=useState("ALL"),[sourceSearch,setSourceSearch]=useState("");

 const loadCatalog=async()=>{try{const rows=await api("/api/owner-products/catalog?q=");setCatalog(Array.isArray(rows)?rows:[])}catch{setCatalog([])}};
 useEffect(()=>{loadCatalog()},[reloadKey]);
 const bySku=useMemo(()=>{const m=new Map();for(const r of catalog)if(r.sku)m.set(String(r.sku).trim(),r);return m},[catalog]);
 const preparationProducts=useMemo(()=>catalog.filter(p=>p?.active!==false&&!isPrepMaterial(p)),[catalog]);

 const bulkCategories=useMemo(()=>[...new Set(preparationProducts.map(categoryOf))].sort((a,b)=>a.localeCompare(b,"el")),[preparationProducts]);
 const bulkSubcategories=useMemo(()=>[...new Set(preparationProducts.filter(p=>bulkCategory==="ALL"||categoryOf(p)===bulkCategory).map(subcategoryOf))].sort((a,b)=>a.localeCompare(b,"el")),[preparationProducts,bulkCategory]);
 const bulkVisible=useMemo(()=>{const q=bulkSearch.trim().toLocaleUpperCase("el");return preparationProducts.filter(p=>{if(bulkCategory!=="ALL"&&categoryOf(p)!==bulkCategory)return false;if(bulkSubcategory!=="ALL"&&subcategoryOf(p)!==bulkSubcategory)return false;if(q&&!searchable(p).includes(q))return false;return true}).sort((a,b)=>txt(a.name).localeCompare(txt(b.name),"el"))},[preparationProducts,bulkCategory,bulkSubcategory,bulkSearch]);
 const allBulkVisible=bulkVisible.length>0&&bulkVisible.every(p=>bulkIds.includes(p.id));

 const sourceCategories=useMemo(()=>[...new Set(preparationProducts.map(categoryOf))].sort((a,b)=>a.localeCompare(b,"el")),[preparationProducts]);
 const sourceSubcategories=useMemo(()=>[...new Set(preparationProducts.filter(p=>sourceCategory==="ALL"||categoryOf(p)===sourceCategory).map(subcategoryOf))].sort((a,b)=>a.localeCompare(b,"el")),[preparationProducts,sourceCategory]);
 const sourceVisible=useMemo(()=>{const q=sourceSearch.trim().toLocaleUpperCase("el");return preparationProducts.filter(p=>{if(sourceCategory!=="ALL"&&categoryOf(p)!==sourceCategory)return false;if(sourceSubcategory!=="ALL"&&subcategoryOf(p)!==sourceSubcategory)return false;if(q&&!searchable(p).includes(q))return false;return true}).sort((a,b)=>txt(a.name).localeCompare(txt(b.name),"el"))},[preparationProducts,sourceCategory,sourceSubcategory,sourceSearch]);

 const openBulkManager=()=>{setError("");setBulkError("");setBulkResult("");setBulkAction("COPY");setBulkSourceId("");setBulkRecipe(true);setBulkModifiers(true);setBulkCategory("ALL");setBulkSubcategory("ALL");setBulkSearch("");setBulkIds([]);setSourceCategory("ALL");setSourceSubcategory("ALL");setSourceSearch("");setBulkOpen(true)};
 const toggleBulk=id=>{setBulkError("");setBulkIds(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id])};
 const toggleAllBulk=()=>{setBulkError("");setBulkIds(ids=>allBulkVisible?ids.filter(id=>!bulkVisible.some(p=>p.id===id)):[...new Set([...ids,...bulkVisible.map(p=>p.id)])])};
 const failBulk=message=>{setBulkError(message);setBulkResult("");return false};

 const clearPreparation=async product=>{const current=await api(`/api/management/preparation/products/${product.id}`);if(bulkRecipe)for(const line of current.recipe||[])await api(`/api/management/preparation/recipe/${line.id}`,{method:"DELETE"});if(bulkModifiers)for(const group of current.groups||[])await api(`/api/management/preparation/products/${product.id}/groups/${group.groupId}`,{method:"DELETE"})};
 const applyBulkManager=async()=>{
  setBulkError("");setBulkResult("");
  if(!bulkIds.length)return failBulk("Επίλεξε τουλάχιστον ένα προϊόν από τη λίστα.");
  if(!bulkRecipe&&!bulkModifiers)return failBulk("Επίλεξε ΣΥΝΤΑΓΗ, MODIFIERS ή και τα δύο.");
  if(bulkAction==="COPY"&&!bulkSourceId)return failBulk("Δεν έχει επιλεγεί είδος-πηγή. Βρες το με τα φίλτρα και επίλεξέ το πριν την καταχώρηση.");
  const targets=preparationProducts.filter(p=>bulkIds.includes(p.id)&&String(p.id)!==String(bulkSourceId));
  if(!targets.length)return failBulk(bulkAction==="COPY"?"Το είδος-πηγή δεν μπορεί να είναι το μοναδικό επιλεγμένο προϊόν.":"Δεν υπάρχουν προϊόντα για αφαίρεση.");
  setBusy(true);
  try{
   let source=null;
   if(bulkAction==="COPY")source=await api(`/api/management/preparation/products/${bulkSourceId}`);
   let changed=0;
   for(const product of targets){
    await clearPreparation(product);
    if(bulkAction==="COPY"){
     if(bulkRecipe)for(const line of source.recipe||[])await api(`/api/management/preparation/products/${product.id}/recipe`,{method:"POST",body:JSON.stringify({ingredientProductId:line.ingredientProductId,quantity:Number(line.quantity),unit:line.unit,automatic:line.automatic!==false})});
     if(bulkModifiers)for(const group of source.groups||[])await api(`/api/management/preparation/products/${product.id}/groups`,{method:"POST",body:JSON.stringify({groupId:group.groupId,required:Boolean(group.required),minSelections:Number(group.minSelections||0),maxSelections:Number(group.maxSelections||1),sequence:Number(group.sequence||0)})});
    }
    changed++;
   }
   setBulkResult(`${bulkAction==="COPY"?"Καταχώρηση":"Αφαίρεση"} ολοκληρώθηκε σε ${changed} προϊόντα.`);
   setReloadKey(x=>x+1);
  }catch(e){failBulk(e.message||"Η μαζική ενέργεια απέτυχε.")}finally{setBusy(false)}
 };

 const onCapture=e=>{const button=e.target.closest?.(".mws-bulk-preparation-btn");if(!button)return;e.preventDefault();e.stopPropagation();openBulkManager()};
 const openDelivery=async product=>{setError("");setBusy(true);try{const data=await api(`/api/owner-products/${product.id}/delivery`);setDeliveryTarget(product);setDeliveryDraft(deliveryDefaults(data))}catch(e){setError(e.message)}finally{setBusy(false)}};

 useEffect(()=>{const root=hostRef.current;if(!root)return;const decorate=()=>{const rows=[...root.querySelectorAll(".kiosk-tr.items-v3:not(.head)")];rows.forEach(row=>{const c=[...row.children];if(c.length<9)return;const stock=c[c.length-1],sku=(c[2]?.textContent||"").trim(),product=bySku.get(sku);if(product&&!stock.dataset.stockPencilReady){stock.dataset.stockPencilReady="1";const currentText=stock.textContent.trim();stock.innerHTML="";const b=document.createElement("button");b.type="button";b.className="mws-stock-pencil";b.innerHTML=`✎ <span>${currentText||"0"}</span>`;b.onclick=e=>{e.preventDefault();e.stopPropagation();const sr=product.stores||[],pref=sr.find(s=>s.active!==false)||sr[0];setTarget({product,storeId:pref?.storeId||stores[0]?.id||""});setMode("SET");setQuantity("");setError("")};stock.appendChild(b)}});const tabs=root.querySelector(".kiosk-product-card .product-tabs"),sr=root.querySelector(".kiosk-tr.items-v3.selected-row");if(tabs&&sr){const p=bySku.get((sr.children[2]?.textContent||"").trim());if(p&&!tabs.querySelector(".mws-preparation-tab")){const b=document.createElement("button");b.type="button";b.className="mws-preparation-tab";b.textContent="Παρασκευή / Modifiers";b.onclick=e=>{e.preventDefault();setPreparationTarget(p)};tabs.appendChild(b)}if(p&&!tabs.querySelector(".mws-delivery-tab")){const b=document.createElement("button");b.type="button";b.className="mws-delivery-tab";b.textContent="E‑Delivery";b.onclick=e=>{e.preventDefault();openDelivery(p)};tabs.appendChild(b)}}};decorate();const o=new MutationObserver(decorate);o.observe(root,{childList:true,subtree:true});return()=>o.disconnect()},[bySku,catalog,stores]);

 const storeRows=target?.product?.stores||[],selectedStore=storeRows.find(s=>s.storeId===target?.storeId),currentStock=num(selectedStore?.currentStock);
 const submit=async()=>{if(!target?.storeId)return setError("Δεν υπάρχει κατάστημα.");setBusy(true);try{await api(`/api/owner-products/${target.product.id}/stock-adjustment`,{method:"POST",body:JSON.stringify({storeId:target.storeId,mode,quantity:Number(quantity),logMovement})});setTarget(null);setReloadKey(x=>x+1)}catch(e){setError(e.message)}finally{setBusy(false)}};
 const saveDelivery=async()=>{if(!deliveryTarget||!deliveryDraft)return;setBusy(true);try{await api(`/api/owner-products/${deliveryTarget.id}/delivery`,{method:"PATCH",body:JSON.stringify(deliveryDraft)});setDeliveryTarget(null);setDeliveryDraft(null)}catch(e){setError(e.message)}finally{setBusy(false)}};

 return <div ref={hostRef} onClickCapture={onCapture}>
  <style>{`.mws-stock-pencil{border:0;background:transparent;font-weight:800;color:#15355d;cursor:pointer}.mws-bulk-preparation-btn{font-weight:900!important;background:#0e6d5a!important;color:white!important}.mws-bulk-manager{width:min(1220px,97vw);max-height:94vh;display:flex;flex-direction:column}.mws-bulk-body{padding:16px;overflow:auto}.mws-bulk-mode{display:flex;gap:10px;margin-bottom:14px}.mws-bulk-mode button{padding:10px 18px;font-weight:900}.mws-bulk-mode button.active{background:#0e6d5a;color:#fff}.mws-bulk-source-box{border:1px solid #d7dee7;background:#f8fafc;padding:12px;margin-bottom:12px}.mws-bulk-source-box h4{margin:0 0 10px}.mws-source-grid,.mws-bulk-grid{display:grid;grid-template-columns:1fr 1fr 1.5fr;gap:10px;margin:10px 0}.mws-source-grid select,.mws-source-grid input,.mws-bulk-grid select,.mws-bulk-grid input,.mws-source-final select{width:100%;padding:10px}.mws-source-final{margin-top:8px}.mws-bulk-options{display:flex;gap:20px;margin:14px 0}.mws-bulk-list{border:1px solid #d8dee6;max-height:360px;overflow:auto}.mws-bulk-list-head,.mws-bulk-row{display:grid;grid-template-columns:44px 120px 1fr 220px 220px;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid #edf0f3}.mws-bulk-list-head{position:sticky;top:0;background:#f5f7fa;font-weight:900;z-index:1}.mws-bulk-selected{font-weight:900;margin:10px 0}.mws-bulk-result{padding:10px;margin-top:10px;background:#ecfbf5;color:#096346;font-weight:900}.mws-bulk-error{padding:11px 12px;margin-top:12px;background:#fff0f0;border:1px solid #d77;color:#8e1d1d;font-weight:900}.mws-danger{background:#a12626!important;color:#fff!important}.mws-action-count{font-weight:900}@media(max-width:900px){.mws-source-grid,.mws-bulk-grid{grid-template-columns:1fr}.mws-bulk-list-head,.mws-bulk-row{grid-template-columns:36px 1fr}.mws-bulk-list-head span:nth-child(n+3),.mws-bulk-row span:nth-child(n+3){display:none}}`}</style>
  <KioskStyleProductCenter key={reloadKey} api={api} stores={stores}/>
  {target&&<div className="kiosk-modal-backdrop"><div className="kiosk-modal"><div className="kiosk-modal-title">Διόρθωση Stock <button onClick={()=>setTarget(null)}>×</button></div><p>{target.product.name} · {currentStock}</p><input value={quantity} onChange={e=>setQuantity(e.target.value)}/><div className="kiosk-modal-actions"><button onClick={()=>setTarget(null)}>Κλείσιμο</button><button onClick={submit}>Καταχώρηση</button></div></div></div>}
  {deliveryTarget&&deliveryDraft&&<div className="kiosk-modal-backdrop"><div className="kiosk-modal"><div className="kiosk-modal-title">{deliveryTarget.name} · E‑Delivery<button onClick={()=>setDeliveryTarget(null)}>×</button></div><ProductDeliveryFields draft={deliveryDraft} onChange={(k,v)=>setDeliveryDraft(d=>({...d,[k]:v}))}/><button onClick={saveDelivery}>Αποθήκευση</button></div></div>}
  {preparationTarget&&<ProductPreparationEditor api={api} product={preparationTarget} onClose={()=>setPreparationTarget(null)}/>} 
  {bulkOpen&&<div className="kiosk-modal-backdrop"><div className="kiosk-modal mws-bulk-manager">
   <div className="kiosk-modal-title">Μαζική διαχείριση Συνταγών / Modifiers <button onClick={()=>setBulkOpen(false)}>×</button></div>
   <div className="mws-bulk-body">
    <div className="mws-bulk-mode"><button className={bulkAction==="COPY"?"active":""} onClick={()=>{setBulkAction("COPY");setBulkError("");setBulkResult("")}}>ΜΑΖΙΚΗ ΚΑΤΑΧΩΡΗΣΗ</button><button className={bulkAction==="REMOVE"?"active mws-danger":""} onClick={()=>{setBulkAction("REMOVE");setBulkError("");setBulkResult("")}}>ΜΑΖΙΚΗ ΑΦΑΙΡΕΣΗ</button></div>
    {bulkAction==="COPY"&&<div className="mws-bulk-source-box"><h4>1. Είδος-πηγή</h4><div className="mws-source-grid"><label>Κατηγορία<select value={sourceCategory} onChange={e=>{setSourceCategory(e.target.value);setSourceSubcategory("ALL");setBulkSourceId("");setBulkError("")}}><option value="ALL">Όλες οι κατηγορίες</option>{sourceCategories.map(x=><option key={x}>{x}</option>)}</select></label><label>Υποκατηγορία<select value={sourceSubcategory} onChange={e=>{setSourceSubcategory(e.target.value);setBulkSourceId("");setBulkError("")}}><option value="ALL">Όλες οι υποκατηγορίες</option>{sourceSubcategories.map(x=><option key={x}>{x}</option>)}</select></label><label>Αναζήτηση<input value={sourceSearch} onChange={e=>{setSourceSearch(e.target.value);setBulkSourceId("");setBulkError("")}} placeholder="Περιγραφή, κωδικός ή barcode"/></label></div><label className="mws-source-final"><b>Επίλεξε είδος-πηγή ({sourceVisible.length} αποτελέσματα)</b><select value={bulkSourceId} onChange={e=>{setBulkSourceId(e.target.value);setBulkError("")}}><option value="">Επίλεξε είδος-πηγή…</option>{sourceVisible.map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku||"χωρίς κωδικό"}</option>)}</select></label></div>}
    <div className="mws-bulk-options"><label><input type="checkbox" checked={bulkRecipe} onChange={e=>{setBulkRecipe(e.target.checked);setBulkError("")}}/> ΣΥΝΤΑΓΗ</label><label><input type="checkbox" checked={bulkModifiers} onChange={e=>{setBulkModifiers(e.target.checked);setBulkError("")}}/> MODIFIERS</label></div>
    <h4>{bulkAction==="COPY"?"2. Προϊόντα προορισμού":"1. Προϊόντα για αφαίρεση"}</h4>
    <div className="mws-bulk-grid"><label>Κατηγορία<select value={bulkCategory} onChange={e=>{setBulkCategory(e.target.value);setBulkSubcategory("ALL");setBulkError("")}}><option value="ALL">Όλες οι κατηγορίες</option>{bulkCategories.map(x=><option key={x}>{x}</option>)}</select></label><label>Υποκατηγορία<select value={bulkSubcategory} onChange={e=>{setBulkSubcategory(e.target.value);setBulkError("")}}><option value="ALL">Όλες οι υποκατηγορίες</option>{bulkSubcategories.map(x=><option key={x}>{x}</option>)}</select></label><label>Αναζήτηση<input value={bulkSearch} onChange={e=>{setBulkSearch(e.target.value);setBulkError("")}} placeholder="Περιγραφή, κωδικός ή barcode"/></label></div>
    <div className="mws-bulk-selected">{bulkIds.length} επιλεγμένα από {bulkVisible.length} εμφανιζόμενα</div>
    <div className="mws-bulk-list"><div className="mws-bulk-list-head"><span><input type="checkbox" checked={allBulkVisible} onChange={toggleAllBulk}/></span><span>Κωδικός</span><span>Περιγραφή</span><span>Κατηγορία</span><span>Υποκατηγορία</span></div>{bulkVisible.map(p=><label className="mws-bulk-row" key={p.id}><span><input type="checkbox" checked={bulkIds.includes(p.id)} onChange={()=>toggleBulk(p.id)}/></span><span>{p.sku||"—"}</span><span><b>{p.name}</b></span><span>{categoryOf(p)}</span><span>{subcategoryOf(p)}</span></label>)}</div>
    {bulkError&&<div className="mws-bulk-error">{bulkError}</div>}{bulkResult&&<div className="mws-bulk-result">{bulkResult}</div>}
   </div>
   <div className="kiosk-modal-actions"><button onClick={()=>setBulkOpen(false)}>Κλείσιμο</button><button className={bulkAction==="REMOVE"?"mws-danger":"primary"} disabled={busy} onClick={applyBulkManager}><span className="mws-action-count">{bulkAction==="COPY"?`Καταχώρηση στα επιλεγμένα (${bulkIds.length})`:`Αφαίρεση από τα επιλεγμένα (${bulkIds.length})`}</span></button></div>
  </div></div>}
 </div>
}
