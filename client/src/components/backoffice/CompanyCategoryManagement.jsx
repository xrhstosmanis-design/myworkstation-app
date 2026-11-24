import React,{useEffect,useRef,useState} from "react";
import {companyCategoryManagePrefix} from "../../../../shared/backoffice-staff-company.mjs";

export default function CompanyCategoryManagement({api,companyId,data,onSaved}){
  const [draft,setDraft]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const active=useRef(false),submitting=useRef(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const parent=data.categories.find(category=>category.id===data.selectedCategoryId);
  const begin=(kind,item=null)=>{
    if(submitting.current)return;
    setError("");
    setDraft({kind,item,name:item?.name||""});
  };
  async function save(event){
    event.preventDefault();
    if(submitting.current||!draft)return;
    const {item,kind}=draft,name=draft.name.trim(),subcategory=kind==="subcategories";
    if(!name||subcategory&&!item&&!parent?.active)return;
    const path=`${companyCategoryManagePrefix}/${kind}${item?"/"+encodeURIComponent(item.id):""}`;
    const body={name,...(item?{expectedName:item.name}:subcategory?{categoryId:parent.id}:{})};
    submitting.current=true;
    setBusy(true);setError("");
    try{
      const result=await api(path,{method:item?"PATCH":"POST",headers:{"x-backoffice-company-id":companyId,"Content-Type":"application/json"},body:JSON.stringify(body)});
      if(!active.current)return;
      if(result?.ok!==true||result.companyId!==companyId||typeof result.id!=="string"||!result.id||item&&result.id!==item.id||
          result.categoryId!==(subcategory?parent.id:null)||result.name!==name)throw Error("Δεν επιβεβαιώθηκε η αποθήκευση της κατηγορίας.");
      setDraft(null);
      onSaved();
    }catch(failure){if(active.current)setError(failure.message);}
    finally{if(active.current)setBusy(false);submitting.current=false;}
  }
  return <section aria-label="Διαχείριση κατηγοριών ειδών">
    <div className="staff-actions">
      <button type="button" disabled={busy} onClick={()=>begin("categories")}>Νέα κατηγορία</button>
      <button type="button" disabled={busy||!parent} onClick={()=>begin("categories",parent)}>Μετονομασία κατηγορίας</button>
      <button type="button" disabled={busy||!parent?.active} onClick={()=>begin("subcategories")}>Νέα υποκατηγορία</button>
      {!!data.subcategories.length&&<label>Μετονομασία υποκατηγορίας<select value={draft?.kind==="subcategories"?draft.item?.id||"":""} disabled={busy} onChange={event=>{
        const item=data.subcategories.find(row=>row.id===event.target.value);
        if(item)begin("subcategories",item);
      }}><option value="">Επίλεξε υποκατηγορία</option>{data.subcategories.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
    </div>
    {draft&&<form onSubmit={save}>
      {draft.kind==="subcategories"&&parent&&<p>{parent.name}</p>}
      <label>Περιγραφή<input required maxLength={draft.kind==="subcategories"?180:160} value={draft.name} disabled={busy} onChange={event=>setDraft({...draft,name:event.target.value})}/></label>
      <button type="submit" disabled={busy}>Αποθήκευση</button>
      <button type="button" disabled={busy} onClick={()=>{setDraft(null);setError("");}}>Ακύρωση</button>
      {error&&<p role="alert">{error}</p>}
    </form>}
  </section>;
}
