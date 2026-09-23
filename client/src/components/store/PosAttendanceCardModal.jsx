import React,{useEffect,useRef,useState} from "react";
import {BadgeCheck,Clock3,X} from "lucide-react";

export default function PosAttendanceCardModal({api,store,onClose}){
  const [cardCode,setCardCode]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState(null),inputRef=useRef(null);
  useEffect(()=>{inputRef.current?.focus()},[]);
  const submit=async event=>{
    event.preventDefault();if(!cardCode.trim()||busy)return;
    setBusy(true);setError("");setResult(null);
    try{
      const row=await api(`/api/cash-control/stores/${store.id}/attendance-card/scan`,{method:"POST",body:JSON.stringify({cardCode})});
      setResult(row);setCardCode("");setTimeout(()=>inputRef.current?.focus(),0);
    }catch(err){setError(err.message);setCardCode("");setTimeout(()=>inputRef.current?.focus(),0)}
    finally{setBusy(false)}
  };
  return <div className="category-product-overlay pos-attendance-card-modal" onMouseDown={event=>event.target===event.currentTarget&&!busy&&onClose()}>
    <section>
      <header><div><small>MYWORKSTATION · ΠΑΡΟΥΣΙΕΣ</small><h2><Clock3/> Κάρτα εργασίας</h2><p>{store.name} · προσέλευση και αποχώρηση εργαζομένων</p></div><button type="button" onClick={onClose} aria-label="Κλείσιμο"><X/></button></header>
      <form className="pos-attendance-card-body" onSubmit={submit}>
        <div className="pos-attendance-card-instructions"><b>Σκάναρε την προσωπική κάρτα</b><span>Η πρώτη σάρωση γράφει προσέλευση. Η επόμενη γράφει αποχώρηση. Το παράθυρο μένει ανοικτό για τον επόμενο εργαζόμενο.</span></div>
        <label>Κάρτα εργαζομένου<input ref={inputRef} type="password" inputMode="numeric" autoComplete="off" value={cardCode} onChange={event=>setCardCode(event.target.value)} placeholder="Σάρωση κάρτας και Enter" disabled={busy}/></label>
        <button className="pos-primary-inline" disabled={busy||cardCode.trim().length<3}>{busy?"Καταχώρηση…":"Καταχώρηση κάρτας"}</button>
        {error&&<div className="store-pos-alert error" role="alert">{error}</div>}
        {result&&<div className="pos-attendance-card-success" role="status"><BadgeCheck/><div><b>{result.employeeName}</b><span>{result.eventType==="IN"?"Η προσέλευση καταχωρίστηκε.":"Η αποχώρηση καταχωρίστηκε."}</span></div></div>}
      </form>
    </section>
  </div>;
}
