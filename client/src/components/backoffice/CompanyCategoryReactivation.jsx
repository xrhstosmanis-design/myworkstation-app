import React,{useEffect,useRef,useState} from "react";
import {companyCategoryManagePrefix} from "../../../../shared/backoffice-staff-company.mjs";

export default function CompanyCategoryReactivation({api,companyId,data,onSaved}){
  const [selection,setSelection]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const mounted=useRef(false),saving=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const activeParent=data.categories.some(row=>row.id===data.selectedCategoryId&&row.active);
  const candidates=[
    ...data.categories.filter(row=>!row.active&&!row.productCount).map(row=>({...row,kind:"categories",label:"Κατηγορία"})),
    ...(activeParent?data.subcategories.filter(row=>!row.active&&!row.productCount).map(row=>({...row,kind:"subcategories",label:"Υποκατηγορία"})):[])
  ];
  const selected=candidates.find(row=>row.kind+"/"+row.id===selection);
  if(!candidates.length)return null;
  async function reactivate(event){
    event.preventDefault();
    if(saving.current||!selected)return;
    saving.current=true;
    setBusy(true);
    setError("");
    try{
      const {kind,id,name}=selected;
      const result=await api(`${companyCategoryManagePrefix}/${kind}/${encodeURIComponent(id)}/reactivate`,{
        method:"POST",headers:{"x-backoffice-company-id":companyId,"Content-Type":"application/json"},
        body:JSON.stringify({expectedName:name,confirm:true})
      });
      if(!mounted.current)return;
      if(result?.ok!==true||result.companyId!==companyId||result.id!==id||result.kind!==kind||result.active!==true){
        throw Error("Δεν επιβεβαιώθηκε η επανενεργοποίηση.");
      }
      setSelection("");
      onSaved();
    }catch(failure){if(mounted.current)setError(failure.message);}
    finally{if(mounted.current)setBusy(false);saving.current=false;}
  }
  return <form aria-label="Επανενεργοποίηση κατηγορίας" onSubmit={reactivate}>
    <label>Ανενεργή κατηγορία ή υποκατηγορία
      <select value={selection} disabled={busy} onChange={event=>{setSelection(event.target.value);setError("");}} required>
        <option value="">Επίλεξε καταχώριση</option>
        {candidates.map(row=><option key={row.kind+"/"+row.id} value={row.kind+"/"+row.id}>{row.label} · {row.name}</option>)}
      </select>
    </label>
    <button type="submit" disabled={!selected||busy}>Επανενεργοποίηση</button>
    {error&&<p role="alert">{error}</p>}
  </form>;
}
