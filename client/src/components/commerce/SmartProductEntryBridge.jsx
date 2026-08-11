import React,{useEffect,useMemo,useState} from "react";

const emptyDraft=()=>({barcode:"",name:"",sku:"",categoryId:"",subcategoryId:"",vatDepartmentId:"",vatRate:"",costPrice:"0",salePrice:"0",unit:"PIECE",initialStock:"0",trackStock:true,active:true});

export default function SmartProductEntryBridge({api,stores=[]}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[looking,setLooking]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [options,setOptions]=useState({nextSku:"",categories:[],subcategories:[],vats:[]}),[draft,setDraft]=useState(emptyDraft());
  const [creator,setCreator]=useState(null),[creatorBusy,setCreatorBusy]=useState(false);
  const subs=useMemo(()=>options.subcategories.filter(s=>s.categoryId===draft.categoryId),[options.subcategories,draft.categoryId]);
  const update=(key,value)=>setDraft(d=>({...d,[key]:value}));

  const loadOptions=async()=>{
    const data=await api("/api/owner-products/smart-entry/options");
    setOptions(data);setDraft(d=>({...d,sku:data.nextSku||d.sku,categoryId:d.categoryId||data.categories?.[0]?.id||"",vatDepartmentId:d.vatDepartmentId||data.vats?.[0]?.id||"",vatRate:d.vatRate||String(data.vats?.[0]?.vatRate??13)}));
    return data;
  };
  const begin=async()=>{setOpen(true);setError("");setMessage("");setCreator(null);setDraft(emptyDraft());try{await loadOptions()}catch(e){setError(e.message)}};

  useEffect(()=>{
    const capture=event=>{
      const button=event.target.closest?.("button");
      if(!button||String(button.textContent||"").trim()!=="Νέο είδος")return;
      if(!button.closest(".kiosk-shell"))return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();begin();
    };
    document.addEventListener("click",capture,true);return()=>document.removeEventListener("click",capture,true);
  },[]);

  const lookup=async()=>{
    const code=draft.barcode.trim();if(code.length<6)return;
    setLooking(true);setError("");setMessage("");
    try{
      const data=await api(`/api/owner-products/smart-entry/barcode/${encodeURIComponent(code)}`);
      if(!data.found){setMessage("Το barcode δεν βρέθηκε online. Συμπλήρωσε τα στοιχεία χειροκίνητα.");return}
      const p=data.product||{};
      let categoryId=draft.categoryId;
      if(p.categoryName){const exact=options.categories.find(c=>String(c.name).toLocaleLowerCase("el")===String(p.categoryName).toLocaleLowerCase("el"));if(exact)categoryId=exact.id}
      let subcategoryId="";
      if(p.subcategoryName){const exact=options.subcategories.find(s=>s.categoryId===categoryId&&String(s.name).toLocaleLowerCase("el")===String(p.subcategoryName).toLocaleLowerCase("el"));if(exact)subcategoryId=exact.id}
      let vatDepartmentId=draft.vatDepartmentId,vatRate=draft.vatRate;
      if(p.vatRate!==null&&p.vatRate!==undefined){const dep=options.vats.find(v=>Number(v.vatRate)===Number(p.vatRate));if(dep){vatDepartmentId=dep.id;vatRate=String(dep.vatRate)}}
      setDraft(d=>({...d,name:p.name||d.name,categoryId,subcategoryId,vatDepartmentId,vatRate}));
      setMessage(data.source==="MYWORKSTATION"?"Το barcode υπάρχει ήδη στο MyWorkStation.":data.source==="MASTER_CATALOG"?"Βρέθηκε στον Master Catalog και συμπληρώθηκαν τα γνωστά στοιχεία.":"Βρέθηκε online και συμπληρώθηκαν τα διαθέσιμα στοιχεία. Έλεγξέ τα πριν την καταχώρηση.");
    }catch(e){setError(e.message)}finally{setLooking(false)}
  };

  const chooseVat=value=>{const dep=options.vats.find(v=>v.id===value);update("vatDepartmentId",value);if(dep)update("vatRate",String(dep.vatRate))};
  const openCreator=type=>{
    setError("");
    if(type==="subcategory"&&!draft.categoryId)return setError("Επίλεξε πρώτα κατηγορία για τη νέα υποκατηγορία.");
    setCreator(type==="vat"?{type,name:"",rate:"0"}:{type,name:""});
  };
  const saveCreator=async()=>{
    if(!creator?.name?.trim())return setError("Συμπλήρωσε περιγραφή.");
    setCreatorBusy(true);setError("");
    try{
      let result;
      if(creator.type==="category")result=await api("/api/management/categories",{method:"POST",body:JSON.stringify({name:creator.name.trim(),active:true})});
      else if(creator.type==="subcategory")result=await api("/api/management/subcategories",{method:"POST",body:JSON.stringify({categoryId:draft.categoryId,name:creator.name.trim(),active:true})});
      else result=await api("/api/management/vat-departments",{method:"POST",body:JSON.stringify({description:creator.name.trim(),vatRate:Number(creator.rate||0),active:true,commerce:true})});
      const data=await api("/api/owner-products/smart-entry/options");setOptions(data);
      if(creator.type==="category")setDraft(d=>({...d,categoryId:result.id,subcategoryId:""}));
      else if(creator.type==="subcategory")setDraft(d=>({...d,subcategoryId:result.id}));
      else setDraft(d=>({...d,vatDepartmentId:result.id,vatRate:String(Number(creator.rate||0))}));
      setMessage(creator.type==="category"?"Η νέα κατηγορία δημιουργήθηκε και επιλέχθηκε.":creator.type==="subcategory"?"Η νέα υποκατηγορία δημιουργήθηκε και επιλέχθηκε.":"Το νέο τμήμα ΦΠΑ δημιουργήθηκε και επιλέχθηκε.");
      setCreator(null);
    }catch(e){setError(e.message)}finally{setCreatorBusy(false)}
  };
  const save=async()=>{
    if(!draft.name.trim())return setError("Συμπλήρωσε περιγραφή προϊόντος.");
    if(!draft.categoryId)return setError("Επίλεξε κατηγορία.");
    if(draft.salePrice==="")return setError("Συμπλήρωσε τιμή λιανικής.");
    setBusy(true);setError("");
    try{
      const result=await api("/api/owner-products/smart-entry",{method:"POST",body:JSON.stringify({...draft,barcode:draft.barcode.trim(),vatRate:Number(draft.vatRate||0),costPrice:Number(draft.costPrice||0),salePrice:Number(draft.salePrice||0),initialStock:Number(draft.initialStock||0),storeIds:stores.filter(s=>s.active!==false).map(s=>s.id)})});
      setMessage(`Το προϊόν καταχωρήθηκε με εσωτερικό κωδικό ${result.sku}.`);setTimeout(()=>{setOpen(false);window.location.reload()},650);
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };

  if(!open)return null;
  return <div className="kiosk-modal-backdrop smart-entry-backdrop"><div className="kiosk-modal smart-entry-modal">
    <div className="kiosk-modal-title">Νέο είδος <button onClick={()=>setOpen(false)}>×</button></div>
    <div className="smart-entry-hint">Σκάναρε πρώτα το barcode. Το MyWorkStation θα ψάξει στον Master Catalog και online και θα δώσει μόνο του τον επόμενο εσωτερικό κωδικό.</div>
    <div className="smart-entry-grid">
      <label>Barcode<div className="smart-barcode-row"><input autoFocus value={draft.barcode} onChange={e=>update("barcode",e.target.value.replace(/\D/g,""))} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();lookup()}}} onBlur={()=>draft.barcode.length>=6&&lookup()}/><button type="button" onClick={lookup} disabled={looking}>{looking?"Αναζήτηση…":"Online αναζήτηση"}</button></div></label>
      <label>Εσωτερικός κωδικός<input value={draft.sku||options.nextSku} readOnly/><small>Δημιουργείται αυτόματα από το σύστημα.</small></label>
      <label className="smart-wide">Περιγραφή<input value={draft.name} onChange={e=>update("name",e.target.value)}/></label>
      <label>Κατηγορία<div className="smart-select-row"><select value={draft.categoryId} onChange={e=>{update("categoryId",e.target.value);update("subcategoryId","")}}><option value="">— Επιλογή —</option>{options.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button type="button" className="smart-add" onClick={()=>openCreator("category")}>+ Νέα</button></div></label>
      <label>Υποκατηγορία<div className="smart-select-row"><select value={draft.subcategoryId} onChange={e=>update("subcategoryId",e.target.value)}><option value="">Χωρίς υποκατηγορία</option>{subs.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button type="button" className="smart-add" onClick={()=>openCreator("subcategory")}>+ Νέα</button></div></label>
      <label>Τμήμα ΦΠΑ<div className="smart-select-row"><select value={draft.vatDepartmentId} onChange={e=>chooseVat(e.target.value)}><option value="">— Επιλογή ΦΠΑ —</option>{options.vats.map(v=><option key={v.id} value={v.id}>{v.description} · {Number(v.vatRate)}%</option>)}</select><button type="button" className="smart-add" onClick={()=>openCreator("vat")}>+ Νέο</button></div></label>
      <label>Μονάδα μέτρησης<select value={draft.unit} onChange={e=>update("unit",e.target.value)}><option value="PIECE">ΤΕΜ</option><option value="KG">KG</option><option value="LITER">LIT</option><option value="PACKAGE">ΣΥΣΚΕΥΑΣΙΑ</option></select></label>
      <label>Τιμή αγοράς<input type="number" min="0" step="0.01" value={draft.costPrice} onChange={e=>update("costPrice",e.target.value)}/></label>
      <label>Τιμή λιανικής<input type="number" min="0" step="0.01" value={draft.salePrice} onChange={e=>update("salePrice",e.target.value)}/></label>
      <label>Αρχικό stock<input type="number" min="0" step="0.001" value={draft.initialStock} onChange={e=>update("initialStock",e.target.value)}/></label>
      <div className="smart-checks"><label><input type="checkbox" checked={draft.active} onChange={e=>update("active",e.target.checked)}/> Ενεργό</label><label><input type="checkbox" checked={draft.trackStock} onChange={e=>update("trackStock",e.target.checked)}/> Παρακολούθηση stock</label></div>
    </div>
    {creator&&<div className="smart-inline-create"><strong>{creator.type==="category"?"Νέα κατηγορία":creator.type==="subcategory"?"Νέα υποκατηγορία":"Νέο τμήμα ΦΠΑ"}</strong><input autoFocus placeholder={creator.type==="category"?"π.χ. ΚΑΠΝΙΚΑ":creator.type==="subcategory"?"π.χ. ΤΣΙΓΑΡΑ":"π.χ. ΦΠΑ 0%"} value={creator.name} onChange={e=>setCreator(c=>({...c,name:e.target.value}))}/>{creator.type==="vat"&&<label>Ποσοστό ΦΠΑ %<input type="number" min="0" max="100" step="0.001" value={creator.rate} onChange={e=>setCreator(c=>({...c,rate:e.target.value}))}/></label>}<div><button type="button" onClick={()=>setCreator(null)}>Ακύρωση</button><button type="button" className="primary" disabled={creatorBusy} onClick={saveCreator}>{creatorBusy?"Αποθήκευση…":"Αποθήκευση & επιλογή"}</button></div></div>}
    {error&&<div className="kiosk-error">{error}</div>}{message&&<div className="kiosk-success">{message}</div>}
    <div className="kiosk-modal-actions"><button onClick={()=>setOpen(false)}>Ακύρωση</button><button className="primary" disabled={busy} onClick={save}>{busy?"Καταχώρηση…":"Καταχώρηση"}</button></div>
    <style>{`.smart-entry-modal{width:min(1120px,96vw)}.smart-entry-hint{margin:12px 18px;padding:12px 14px;border-radius:10px;background:#eef8ff;color:#284b70;border:1px solid #cfe3f4}.smart-entry-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:18px}.smart-entry-grid label{display:grid;gap:6px;font-weight:800;color:#17345b}.smart-entry-grid input,.smart-entry-grid select,.smart-inline-create input{width:100%;box-sizing:border-box;border:1px solid #bfd0df;border-radius:8px;padding:10px;background:#fff}.smart-entry-grid small{font-weight:500;color:#718096}.smart-entry-grid .smart-wide{grid-column:1/-1}.smart-barcode-row{display:grid;grid-template-columns:1fr auto;gap:8px}.smart-barcode-row button{border:0;border-radius:8px;padding:0 14px;background:#0b7891;color:#fff;font-weight:900}.smart-select-row{display:grid;grid-template-columns:1fr auto;gap:8px}.smart-add{border:1px solid #0b7891;border-radius:8px;background:#eef9fc;color:#075a6e;font-weight:900;padding:0 12px;white-space:nowrap}.smart-checks{display:flex;gap:20px;align-items:center}.smart-checks label{display:flex;align-items:center;gap:7px}.smart-checks input{width:auto}.smart-inline-create{margin:0 18px 14px;padding:14px;border:1px solid #8fc8d8;border-radius:10px;background:#f1fbfe;display:grid;grid-template-columns:180px 1fr auto;gap:10px;align-items:end}.smart-inline-create strong{align-self:center;color:#17345b}.smart-inline-create label{display:grid;gap:4px;font-weight:800;color:#17345b}.smart-inline-create>div{display:flex;gap:8px}.smart-inline-create button{border:1px solid #bfd0df;border-radius:8px;padding:10px 12px;background:#fff;font-weight:800}.smart-inline-create button.primary{background:#0b7891;color:#fff;border-color:#0b7891}@media(max-width:760px){.smart-entry-grid{grid-template-columns:1fr}.smart-entry-grid .smart-wide{grid-column:auto}.smart-barcode-row,.smart-select-row{grid-template-columns:1fr}.smart-inline-create{grid-template-columns:1fr}}`}</style>
  </div></div>;
}
