import React,{useEffect,useRef,useState} from "react";
import {companyVatManagePath} from "../../../../shared/backoffice-staff-company.mjs";

export default function CompanyVatDraftActivation({api,companyId,items,onSaved}){
  const [itemId,setItemId]=useState(""),[rate,setRate]=useState(""),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const mounted=useRef(false),saving=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const candidates=items.filter(row=>!row.active&&!row.commerce&&row.vatRate===0&&row.productCount===0&&
    [row.cashRegisterDepartment,row.legacyVatCode,row.exemptionCode,row.exemptionDescription].every(value=>value===null));
  const item=candidates.find(row=>row.id===itemId);
  if(!candidates.length)return null;
  function changeItem(event){
    setItemId(event.target.value);
    setRate("");
    setConfirmed(false);
    setError("");
  }
  async function submit(event){
    event.preventDefault();
    if(saving.current||!item||!confirmed)return;
    const input=rate.trim().replace(",",".");
    if(!/^\d+(?:\.\d{1,3})?$/.test(input)||Number(input)<=0||Number(input)>100){
      setError("Βάλε θετικό συντελεστή έως 100% με έως τρία δεκαδικά ψηφία.");
      return;
    }
    const vatRate=Number(input);
    saving.current=true;
    setBusy(true);
    setError("");
    try{
      const result=await api(`${companyVatManagePath}/${encodeURIComponent(item.id)}/activate-draft`,{
        method:"POST",headers:{"x-backoffice-company-id":companyId,"Content-Type":"application/json"},
        body:JSON.stringify({expectedDescription:item.description,vatRate,confirm:true})
      });
      if(!mounted.current)return;
      if(result?.ok!==true||result.companyId!==companyId||result.id!==item.id||result.description!==item.description||
        result.vatRate!==vatRate||result.active!==true)throw Error("Δεν επιβεβαιώθηκε η ενεργοποίηση του τμήματος ΦΠΑ.");
      setItemId("");
      setRate("");
      setConfirmed(false);
      onSaved();
    }catch(failure){if(mounted.current)setError(failure.message);}
    finally{if(mounted.current)setBusy(false);saving.current=false;}
  }
  return <form aria-label="Ενεργοποίηση νέου τμήματος ΦΠΑ" onSubmit={submit}>
    <label>Ανενεργό τμήμα ΦΠΑ<select value={itemId} onChange={changeItem} disabled={busy} required>
      <option value="">Επίλεξε τμήμα ΦΠΑ</option>{candidates.map(row=><option key={row.id} value={row.id}>{row.description}</option>)}
    </select></label>
    {item&&<>
      <label>Συντελεστής ΦΠΑ (%)<input inputMode="decimal" value={rate} disabled={busy} required onChange={event=>{setRate(event.target.value);setConfirmed(false);}}/></label>
      <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>Επιβεβαιώνω τον συντελεστή και την ενεργοποίηση για την εταιρεία.</label>
      <button type="submit" disabled={!confirmed||busy}>Ενεργοποίηση τμήματος ΦΠΑ</button>
    </>}
    {error&&<p role="alert">{error}</p>}
  </form>;
}
