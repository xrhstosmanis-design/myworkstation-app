import React,{useEffect,useRef,useState} from "react";

export default function EfoodManualMapping({url,eventId,item,request,onSaved}){
  const [id,setId]=useState(""),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[submitted,setSubmitted]=useState(false);
  const epoch=useRef(0),pending=useRef(false),scope=useRef("");
  const scopeKey=JSON.stringify([url,eventId,item.line,item.externalProductId,item.externalSku]);
  scope.current=scopeKey;
  useEffect(()=>{epoch.current++;pending.current=false;setId("");setConfirmed(false);setBusy(false);setError("");setSubmitted(false);return()=>{epoch.current++;pending.current=false}},[scopeKey]);
  const externalProductId=item.externalProductId||item.externalSku;
  const save=async()=>{
    const productId=id.trim();
    if(!confirmed||!productId||productId.length>300||!externalProductId||pending.current||submitted)return;
    pending.current=true;const generation=epoch.current,selectedScope=scopeKey,selectedUrl=url;
    const current=()=>epoch.current===generation&&scope.current===selectedScope;
    setBusy(true);setError("");
    try{
      const result=await request(`${selectedUrl}/product-mappings`,{method:"PUT",body:JSON.stringify({externalProductId,externalSku:item.externalSku||null,providerName:item.name||null,productId,notes:"Χειροκίνητη αντιστοίχιση LAB - προετοιμασία, όχι εμπορική ενεργοποίηση."})});
      if(!current())return;
      setSubmitted(true);
      if(!result?.ok||result.mapping?.productId!==productId||result.mapping?.status!=="MATCHED"){
        setError("Η υποβολή ολοκληρώθηκε χωρίς επιβεβαιωμένο αποτέλεσμα. Διάβασε ξανά την προεπισκόπηση πριν άλλη αποθήκευση.");
        return;
      }
      await onSaved();
    }catch(err){if(current())setError(err.message||"Η αντιστοίχιση δεν επιβεβαιώθηκε. Έλεγξε την προεπισκόπηση πριν νέα υποβολή.")}
    finally{if(current()){pending.current=false;setBusy(false)}}
  };
  return <div className="efood-manual-mapping" role="group" aria-label={`Χειροκίνητη αντιστοίχιση γραμμής ${item.line}`}>
    <p>Σύνδεση με υπάρχον προϊόν του επιλεγμένου LAB. Δεν ενεργοποιεί το είδος και δεν επιβεβαιώνει διαθεσιμότητα, μονάδες, τιμές ή ΦΠΑ.</p>
    <label>Αναγνωριστικό προϊόντος LAB<input aria-label={`Αναγνωριστικό προϊόντος LAB γραμμής ${item.line}`} value={id} maxLength={300} disabled={busy||submitted} onInput={event=>{setId(event.target.value);setConfirmed(false);setError("")}}/></label>
    <label className="efood-mapping-confirm"><input type="checkbox" checked={confirmed} disabled={busy||submitted||!id.trim()} onChange={event=>setConfirmed(event.target.checked)}/>Επιβεβαιώνω ότι το προϊόν αντιστοιχεί στο συγκεκριμένο SKU/barcode και στο επιλεγμένο LAB.</label>
    <button type="button" disabled={busy||submitted||!confirmed||!id.trim()} onClick={save}>{busy?"Αποθήκευση αντιστοίχισης…":submitted?"Υποβλήθηκε - απαιτείται ανάγνωση":"Αποθήκευση αντιστοίχισης LAB"}</button>
    {error&&<p role="alert">{error}</p>}
  </div>;
}
