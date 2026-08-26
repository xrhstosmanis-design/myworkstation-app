import React,{useMemo,useState} from "react";
import {ExternalLink,Search,ShoppingBag,X} from "lucide-react";
import "./online-store-manager.css";
import "./online-store-fulfillment.css";
import "./online-store-branding.css";
const money=v=>Number(v||0).toLocaleString("el-GR",{minimumFractionDigits:2,maximumFractionDigits:2});
const onlinePrice=(p,t,v)=>Math.round((Number(p||0)+(t==="PERCENT"?Number(p||0)*Number(v||0)/100:Number(v||0)))*100)/100;
const days=[["MON","Δευτέρα"],["TUE","Τρίτη"],["WED","Τετάρτη"],["THU","Πέμπτη"],["FRI","Παρασκευή"],["SAT","Σάββατο"],["SUN","Κυριακή"]];
const defaultHours=Object.fromEntries(days.map(([key])=>[key,{enabled:true,start:"07:00",end:"23:00"}]));

export default function OnlineStoreManager({manager,setManager,request,onClose,setBusy,busy,setError,setMessage}){
 const [search,setSearch]=useState(""),[category,setCategory]=useState("ALL");
 const settings={pickupEnabled:true,deliveryEnabled:true,deliveryFee:0,minimumOrderRetail:0,cashEnabled:true,cardOnDeliveryEnabled:true,timezone:"Europe/Athens",brandName:manager.store.name,brandTagline:"Online Παραγγελίες",brandLogoUrl:"",brandPrimaryColor:"#7b1216",brandSecondaryColor:"#5d0c0f",brandWelcomeMessage:"Γρήγορα, εύκολα, όποτε θέλεις!",estimatedMinutes:25,...manager.settings,weeklyHours:{...defaultHours,...(manager.settings.weeklyHours||{})}};
 const categories=useMemo(()=>[...new Set(manager.products.map(p=>p.categoryName||"Χωρίς κατηγορία"))].sort((a,b)=>a.localeCompare(b,"el")),[manager.products]);
 const filtered=useMemo(()=>manager.products.filter(p=>(category==="ALL"||(p.categoryName||"Χωρίς κατηγορία")===category)&&`${p.name} ${p.sku||""}`.toLocaleLowerCase("el").includes(search.toLocaleLowerCase("el"))),[manager.products,category,search]);
 const updateSettings=(key,value)=>setManager(current=>{const next={pickupEnabled:true,deliveryEnabled:true,deliveryFee:0,minimumOrderRetail:0,cashEnabled:true,cardOnDeliveryEnabled:true,timezone:"Europe/Athens",brandName:current.store.name,brandTagline:"Online Παραγγελίες",brandLogoUrl:"",brandPrimaryColor:"#7b1216",brandSecondaryColor:"#5d0c0f",brandWelcomeMessage:"Γρήγορα, εύκολα, όποτε θέλεις!",estimatedMinutes:25,weeklyHours:defaultHours,...current.settings,[key]:value};return {...current,settings:next,products:key==="surchargeType"||key==="surchargeValue"?current.products.map(p=>({...p,onlinePrice:onlinePrice(p.storePrice,next.surchargeType,next.surchargeValue)})):current.products}});
 const updateHours=(day,key,value)=>updateSettings("weeklyHours",{...settings.weeklyHours,[day]:{...settings.weeklyHours[day],[key]:value}});
 const toggle=id=>setManager(c=>({...c,products:c.products.map(p=>p.id===id?{...p,visible:!p.visible}:p)}));
 const setFiltered=visible=>{const ids=new Set(filtered.map(p=>p.id));setManager(c=>({...c,products:c.products.map(p=>ids.has(p.id)?{...p,visible}:p)}))};
 const saveSettings=async()=>{setBusy("online-settings");setError("");try{await request(`/api/platform/companies/${manager.company.id}/stores/${manager.store.id}/online-store/settings`,{method:"PUT",body:JSON.stringify(settings)});setMessage("Οι ρυθμίσεις παραλαβής, delivery, ωραρίου και online τιμών αποθηκεύτηκαν.")}catch(e){setError(e.message)}finally{setBusy("")}};
 const saveProducts=async()=>{setBusy("online-products");setError("");try{const ids=manager.products.filter(p=>p.visible).map(p=>p.id);await request(`/api/platform/companies/${manager.company.id}/stores/${manager.store.id}/online-store/products`,{method:"PUT",body:JSON.stringify({productIds:ids})});setMessage(`Αποθηκεύτηκαν ${ids.length} προϊόντα στο Online Store.`)}catch(e){setError(e.message)}finally{setBusy("")}};
 const publicUrl=settings.publicSlug?`${window.location.origin}/online/${settings.publicSlug}`:"";
 return <div className="platform-modal"><section className="platform-security-dialog online-store-dialog">
  <button type="button" className="modal-close" onClick={onClose}><X/></button><h2><ShoppingBag/> Online Store</h2><p>{manager.company.name} · {manager.store.name}</p>
  <div className="online-settings">
   <label className="platform-toggle"><input type="checkbox" checked={settings.enabled} onChange={e=>updateSettings("enabled",e.target.checked)}/><span>Δημόσιο κατάστημα ενεργό</span></label>
   <label>Δημόσιο URL<div className="slug-input"><span>/online/</span><input value={settings.publicSlug||""} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" onChange={e=>updateSettings("publicSlug",e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))}/></div></label>
   <label>Κανόνας online τιμής<select value={settings.surchargeType} onChange={e=>updateSettings("surchargeType",e.target.value)}><option value="FIXED">Σταθερή προσαύξηση €</option><option value="PERCENT">Ποσοστιαία προσαύξηση %</option></select></label>
   <label>Προσαύξηση<input type="number" min="0" step="0.01" value={settings.surchargeValue} onChange={e=>updateSettings("surchargeValue",e.target.value)}/></label>
   <label className="platform-toggle"><input type="checkbox" checked={settings.stockCheckEnabled} onChange={e=>updateSettings("stockCheckEnabled",e.target.checked)}/><span>Έλεγχος διαθέσιμου stock</span></label>
   <label className="platform-toggle"><input type="checkbox" checked={settings.pickupEnabled} onChange={e=>updateSettings("pickupEnabled",e.target.checked)}/><span>Παραλαβή από κατάστημα</span></label>
   <label className="platform-toggle"><input type="checkbox" checked={settings.deliveryEnabled} onChange={e=>updateSettings("deliveryEnabled",e.target.checked)}/><span>Delivery</span></label>
   <label>Χρέωση Delivery €<input type="number" min="0" step="0.01" value={settings.deliveryFee} onChange={e=>updateSettings("deliveryFee",e.target.value)}/></label>
   <label>Ελάχιστη παραγγελία €<input type="number" min="0" step="0.01" value={settings.minimumOrderRetail} onChange={e=>updateSettings("minimumOrderRetail",e.target.value)}/></label>
   <label className="platform-toggle"><input type="checkbox" checked={settings.cashEnabled} onChange={e=>updateSettings("cashEnabled",e.target.checked)}/><span>Μετρητά</span></label>
   <label className="platform-toggle"><input type="checkbox" checked={settings.cardOnDeliveryEnabled} onChange={e=>updateSettings("cardOnDeliveryEnabled",e.target.checked)}/><span>Κάρτα σε ασύρματο POS</span></label>
  </div>
  <h3>Εμφάνιση και branding</h3><div className="online-branding">
   <label>Όνομα καταστήματος<input value={settings.brandName} onChange={e=>updateSettings("brandName",e.target.value)}/></label><label>Υπότιτλος<input value={settings.brandTagline} onChange={e=>updateSettings("brandTagline",e.target.value)}/></label>
   <label>URL λογοτύπου<input type="url" placeholder="https://…/logo.png" value={settings.brandLogoUrl} onChange={e=>updateSettings("brandLogoUrl",e.target.value)}/></label><label>Μήνυμα καλωσορίσματος<input value={settings.brandWelcomeMessage} onChange={e=>updateSettings("brandWelcomeMessage",e.target.value)}/></label>
   <label>Βασικό χρώμα<input type="color" value={settings.brandPrimaryColor} onChange={e=>updateSettings("brandPrimaryColor",e.target.value)}/></label><label>Σκούρο χρώμα<input type="color" value={settings.brandSecondaryColor} onChange={e=>updateSettings("brandSecondaryColor",e.target.value)}/></label><label>Εκτιμώμενος χρόνος (λεπτά)<input type="number" min="5" max="180" value={settings.estimatedMinutes} onChange={e=>updateSettings("estimatedMinutes",e.target.value)}/></label>
  </div>
  <h3>Ωράριο online παραγγελιών · ώρα Ελλάδας</h3><div className="online-hours">{days.map(([key,label])=><div key={key}><label className="platform-toggle"><input type="checkbox" checked={settings.weeklyHours[key].enabled} onChange={e=>updateHours(key,"enabled",e.target.checked)}/><span>{label}</span></label><input type="time" value={settings.weeklyHours[key].start} disabled={!settings.weeklyHours[key].enabled} onChange={e=>updateHours(key,"start",e.target.value)}/><span>έως</span><input type="time" value={settings.weeklyHours[key].end} disabled={!settings.weeklyHours[key].enabled} onChange={e=>updateHours(key,"end",e.target.value)}/></div>)}</div>
  <div className="online-settings-actions"><button onClick={saveSettings} disabled={busy==="online-settings"}>{busy==="online-settings"?"Αποθήκευση…":"Αποθήκευση ρυθμίσεων"}</button>{publicUrl&&settings.enabled&&<a href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink/>Άνοιγμα δημόσιας σελίδας</a>}</div>
  <small className="online-price-note">Η online τιμή υπολογίζεται από την τιμή καταστήματος. Η τιμή POS δεν αλλάζει.</small>
  <div className="online-product-tools"><label><Search/><input placeholder="Αναζήτηση προϊόντος ή SKU" value={search} onChange={e=>setSearch(e.target.value)}/></label><select value={category} onChange={e=>setCategory(e.target.value)}><option value="ALL">Όλες οι κατηγορίες</option>{categories.map(c=><option key={c}>{c}</option>)}</select><button className="secondary" onClick={()=>setFiltered(true)}>Επιλογή φίλτρου</button><button className="secondary" onClick={()=>setFiltered(false)}>Καθαρισμός φίλτρου</button></div>
  <div className="online-product-list">{filtered.map(p=><label key={p.id}><input type="checkbox" checked={p.visible} onChange={()=>toggle(p.id)}/><span><b>{p.name}</b><small>{p.sku||"Χωρίς SKU"} · {p.categoryName||"Χωρίς κατηγορία"}</small></span><em>{money(p.storePrice)} € → <strong>{money(p.onlinePrice)} €</strong></em></label>)}</div>
  <footer><span>{manager.products.filter(p=>p.visible).length} από {manager.products.length} προϊόντα online</span><button onClick={saveProducts} disabled={busy==="online-products"}>{busy==="online-products"?"Αποθήκευση…":"Αποθήκευση προϊόντων"}</button></footer>
 </section></div>;
}
