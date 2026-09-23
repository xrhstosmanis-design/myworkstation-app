import React,{useEffect,useRef,useState} from "react";
import {BadgeCheck,Clock3,KeyRound,ScanLine,X} from "lucide-react";

export default function PosAttendanceCardModal({api,store,onClose}){
  const [method,setMethod]=useState("PIN"),[cardCode,setCardCode]=useState(""),[pin,setPin]=useState(""),[employeeId,setEmployeeId]=useState(""),[operators,setOperators]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState(null),inputRef=useRef(null);
  useEffect(()=>{let active=true;api(`/api/operators/stores/${store.id}/directory`).then(row=>{if(!active)return;const eligible=(row.operators||[]).filter(operator=>operator.hasPin);setOperators(eligible);setEmployeeId(current=>current||eligible[0]?.employeeId||"")}).catch(err=>active&&setError(err.message)).finally(()=>active&&setLoading(false));return()=>{active=false}},[store.id]);
  useEffect(()=>{setError("");setResult(null);setTimeout(()=>inputRef.current?.focus(),0)},[method,loading]);
  const submit=async event=>{
    event.preventDefault();if(busy||(method==="CARD"?!cardCode.trim():!employeeId||pin.length<4))return;
    setBusy(true);setError("");setResult(null);
    try{
      const card=method==="CARD",row=await api(`/api/cash-control/stores/${store.id}/${card?"attendance-card/scan":"attendance-pin/submit"}`,{method:"POST",body:JSON.stringify(card?{cardCode}:{employeeId,pin})});
      setResult(row);setCardCode("");setPin("");setTimeout(()=>inputRef.current?.focus(),0);
    }catch(err){setError(err.message);setCardCode("");setPin("");setTimeout(()=>inputRef.current?.focus(),0)}
    finally{setBusy(false)}
  };
  return <div className="category-product-overlay pos-attendance-card-modal" onMouseDown={event=>event.target===event.currentTarget&&!busy&&onClose()}>
    <section>
      <header><div><small>MYWORKSTATION · ΠΑΡΟΥΣΙΕΣ</small><h2><Clock3/> Κάρτα εργασίας</h2><p>{store.name} · προσέλευση και αποχώρηση εργαζομένων</p></div><button type="button" onClick={onClose} aria-label="Κλείσιμο"><X/></button></header>
      <form className="pos-attendance-card-body" onSubmit={submit}>
        <div className="pos-attendance-card-instructions"><b>Προσέλευση ή αποχώρηση</b><span>Χρησιμοποίησε το προσωπικό PIN ή την κάρτα. Η πρώτη καταχώρηση γράφει προσέλευση και η επόμενη αποχώρηση.</span></div>
        <div className="pos-attendance-methods"><button type="button" className={method==="PIN"?"active":""} onClick={()=>setMethod("PIN")}><KeyRound/> PIN</button><button type="button" className={method==="CARD"?"active":""} onClick={()=>setMethod("CARD")}><ScanLine/> Κάρτα</button></div>
        {method==="PIN"?<>{loading?<div className="operator-login-loading">Φόρτωση εργαζομένων…</div>:operators.length?<><label>Εργαζόμενος<select value={employeeId} onChange={event=>setEmployeeId(event.target.value)} disabled={busy}>{operators.map(operator=><option value={operator.employeeId} key={operator.employeeId}>{operator.displayName}</option>)}</select></label><label>Προσωπικό PIN<input ref={inputRef} type="password" inputMode="numeric" autoComplete="off" maxLength="8" value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,""))} placeholder="4–8 ψηφία" disabled={busy}/></label></>:<div className="store-pos-alert error">Δεν έχει οριστεί προσωπικό PIN σε εργαζόμενο.</div>}</>:<label>Κάρτα εργαζομένου<input ref={inputRef} type="password" autoComplete="off" value={cardCode} onChange={event=>setCardCode(event.target.value)} placeholder="Σάρωση κάρτας και Enter" disabled={busy}/></label>}
        <button className="pos-primary-inline" disabled={busy||loading||(method==="CARD"?cardCode.trim().length<3:!employeeId||pin.length<4)}>{busy?"Καταχώρηση…":method==="CARD"?"Καταχώρηση κάρτας":"Καταχώρηση με PIN"}</button>
        {error&&<div className="store-pos-alert error" role="alert">{error}</div>}
        {result&&<div className="pos-attendance-card-success" role="status"><BadgeCheck/><div><b>{result.employeeName}</b><span>{result.eventType==="IN"?"Η προσέλευση καταχωρίστηκε.":"Η αποχώρηση καταχωρίστηκε."}</span></div></div>}
      </form>
    </section>
  </div>;
}
