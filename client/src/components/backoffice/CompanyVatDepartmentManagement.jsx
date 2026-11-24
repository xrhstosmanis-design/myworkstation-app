import React,{useEffect,useRef,useState} from "react";
import {companyVatManagePath} from "../../../../shared/backoffice-staff-company.mjs";

export default function CompanyVatDepartmentManagement({api,companyId,items,onSaved}){
  const [draft,setDraft]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const mounted=useRef(false),saving=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  function begin(item=null){
    setDraft({item,description:item?.description||""});
    setError("");
  }
  async function save(event){
    event.preventDefault();
    if(saving.current||!draft?.description.trim())return;
    const {item}=draft,description=draft.description.trim();
    saving.current=true;
    setBusy(true);
    setError("");
    try{
      const result=await api(companyVatManagePath+(item?"/"+encodeURIComponent(item.id):""),{
        method:item?"PATCH":"POST",
        headers:{"x-backoffice-company-id":companyId,"Content-Type":"application/json"},
        body:JSON.stringify({description,...(item?{expectedDescription:item.description}:{})})
      });
      if(!mounted.current)return;
      if(result?.ok!==true||result.companyId!==companyId||typeof result.id!=="string"||!result.id||
        result.description!==description||typeof result.active!=="boolean"||(item?result.id!==item.id:result.active)){
        throw Error("Δεν επιβεβαιώθηκε η αποθήκευση του τμήματος ΦΠΑ.");
      }
      setDraft(null);
      onSaved();
    }catch(failure){if(mounted.current)setError(failure.message);}
    finally{if(mounted.current)setBusy(false);saving.current=false;}
  }
  return <section aria-label="Διαχείριση περιγραφών ΦΠΑ">
    <div className="staff-actions">
      <button type="button" disabled={busy} onClick={()=>begin()}>Νέο ανενεργό τμήμα ΦΠΑ</button>
      {!!items.length&&<label>Μετονομασία τμήματος ΦΠΑ<select value={draft?.item?.id||""} disabled={busy} onChange={event=>{
        const item=items.find(row=>row.id===event.target.value);
        if(item)begin(item);
      }}><option value="">Επίλεξε τμήμα ΦΠΑ</option>{items.map(row=><option key={row.id} value={row.id}>{row.description}</option>)}</select></label>}
    </div>
    {draft&&<form onSubmit={save}>
      {!draft.item&&<p>Ο Ιδιοκτήτης ρυθμίζει τον συντελεστή και ενεργοποιεί το τμήμα.</p>}
      <label>Περιγραφή<input required maxLength={160} value={draft.description} disabled={busy} onChange={event=>setDraft({...draft,description:event.target.value})}/></label>
      <button type="submit" disabled={busy}>Αποθήκευση</button>
      <button type="button" disabled={busy} onClick={()=>{setDraft(null);setError("");}}>Ακύρωση</button>
      {error&&<p role="alert">{error}</p>}
    </form>}
  </section>;
}
