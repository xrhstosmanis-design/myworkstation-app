import React,{useEffect,useRef,useState} from "react";
import {flushSync} from "react-dom";
import {BadgeCheck,Camera,CameraOff,Clock3,KeyRound,ScanLine,X} from "lucide-react";
import {BrowserMultiFormatReader} from "@zxing/browser";
import {BarcodeFormat,DecodeHintType} from "@zxing/library";

export default function PosAttendanceCardModal({api,store,onClose}){
  const [method,setMethod]=useState("PIN"),[cardCode,setCardCode]=useState(""),[pin,setPin]=useState(""),[employeeId,setEmployeeId]=useState(""),[operators,setOperators]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState(null),[cameraActive,setCameraActive]=useState(false),inputRef=useRef(null),videoRef=useRef(null),streamRef=useRef(null),frameRef=useRef(0),scannerControlsRef=useRef(null),scanningRef=useRef(false);
  useEffect(()=>{let active=true;api(`/api/operators/stores/${store.id}/directory`).then(row=>{if(!active)return;const eligible=(row.operators||[]).filter(operator=>operator.hasPin);setOperators(eligible);setEmployeeId(current=>current||eligible[0]?.employeeId||"")}).catch(err=>active&&setError(err.message)).finally(()=>active&&setLoading(false));return()=>{active=false}},[store.id]);
  const stopCamera=()=>{
    cancelAnimationFrame(frameRef.current);frameRef.current=0;
    scannerControlsRef.current?.stop?.();scannerControlsRef.current=null;
    streamRef.current?.getTracks().forEach(track=>track.stop());streamRef.current=null;scanningRef.current=false;setCameraActive(false);
  };
  useEffect(()=>()=>{cancelAnimationFrame(frameRef.current);scannerControlsRef.current?.stop?.();streamRef.current?.getTracks().forEach(track=>track.stop())},[]);
  useEffect(()=>{stopCamera();setError("");setResult(null);setTimeout(()=>inputRef.current?.focus(),0)},[method,loading]);
  const recordCard=async value=>{
    const normalized=String(value||"").trim();if(busy||scanningRef.current||normalized.length<3)return;
    scanningRef.current=true;setBusy(true);setError("");setResult(null);
    try{const row=await api(`/api/cash-control/stores/${store.id}/attendance-card/scan`,{method:"POST",body:JSON.stringify({cardCode:normalized})});setResult(row);setCardCode("")}
    catch(err){setError(err.message);setCardCode("")}
    finally{scanningRef.current=false;setBusy(false);setTimeout(()=>inputRef.current?.focus(),0)}
  };
  const startCamera=async()=>{
    setError("");setResult(null);
    if(!navigator.mediaDevices?.getUserMedia)return setError("Η κάμερα δεν είναι διαθέσιμη σε αυτόν τον υπολογιστή ή browser.");
    try{
      flushSync(()=>setCameraActive(true));
      if(!videoRef.current)throw new Error("Δεν δημιουργήθηκε η προεπισκόπηση της κάμερας. Δοκίμασε ξανά.");
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}},audio:false});
      streamRef.current=stream;
      videoRef.current.srcObject=stream;await videoRef.current.play();
      const accept=async value=>{if(!value||scanningRef.current)return;setCardCode(value);stopCamera();await recordCard(value)};
      if("BarcodeDetector" in window){
        const supported=await window.BarcodeDetector.getSupportedFormats?.();
        if(!supported||supported.includes("code_128")){
          const detector=new window.BarcodeDetector({formats:["code_128","qr_code"]});
          const scan=async()=>{if(!streamRef.current||scanningRef.current)return;try{const codes=await detector.detect(videoRef.current);const value=codes.find(code=>code.rawValue)?.rawValue;if(value)return accept(value)}catch{}frameRef.current=requestAnimationFrame(scan)};
          frameRef.current=requestAnimationFrame(scan);return;
        }
      }
      const hints=new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.QR_CODE,BarcodeFormat.CODE_128]],[DecodeHintType.TRY_HARDER,true]]);
      const reader=new BrowserMultiFormatReader(hints,{delayBetweenScanAttempts:80,delayBetweenScanSuccess:500});
      scannerControlsRef.current=await reader.decodeFromVideoElement(videoRef.current,(decoded)=>decoded&&accept(decoded.getText()));
    }catch(err){stopCamera();setError(err?.name==="NotAllowedError"?"Δεν δόθηκε άδεια χρήσης της κάμερας. Πάτησε Άδεια στον browser και δοκίμασε ξανά.":err.message||"Δεν άνοιξε η κάμερα.")}
  };
  const submit=async event=>{
    event.preventDefault();if(busy||(method==="CARD"?!cardCode.trim():!employeeId||pin.length<4))return;
    if(method==="CARD")return recordCard(cardCode);
    setBusy(true);setError("");setResult(null);
    try{
      const row=await api(`/api/cash-control/stores/${store.id}/attendance-pin/submit`,{method:"POST",body:JSON.stringify({employeeId,pin})});
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
        {method==="PIN"?<>{loading?<div className="operator-login-loading">Φόρτωση εργαζομένων…</div>:operators.length?<><label>Εργαζόμενος<select value={employeeId} onChange={event=>setEmployeeId(event.target.value)} disabled={busy}>{operators.map(operator=><option value={operator.employeeId} key={operator.employeeId}>{operator.displayName}</option>)}</select></label><label>Προσωπικό PIN<input ref={inputRef} type="password" inputMode="numeric" autoComplete="off" maxLength="8" value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,""))} placeholder="4–8 ψηφία" disabled={busy}/></label></>:<div className="store-pos-alert error">Δεν έχει οριστεί προσωπικό PIN σε εργαζόμενο.</div>}</>:<><label>Κάρτα εργαζομένου<input ref={inputRef} type="password" autoComplete="off" value={cardCode} onChange={event=>setCardCode(event.target.value)} placeholder="Σάρωση κάρτας και Enter" disabled={busy||cameraActive}/></label><button type="button" className="pos-attendance-camera-button" onClick={cameraActive?stopCamera:startCamera} disabled={busy}>{cameraActive?<><CameraOff/> Κλείσιμο κάμερας</>:<><Camera/> Σάρωση με κάμερα</>}</button>{cameraActive&&<div className="pos-attendance-camera"><video ref={videoRef} muted playsInline/><span><ScanLine/> Βάλε ολόκληρο το barcode μέσα στο πλαίσιο</span></div>}</>}
        <button className="pos-primary-inline" disabled={busy||loading||(method==="CARD"?cardCode.trim().length<3:!employeeId||pin.length<4)}>{busy?"Καταχώρηση…":method==="CARD"?"Καταχώρηση κάρτας":"Καταχώρηση με PIN"}</button>
        {error&&<div className="store-pos-alert error" role="alert">{error}</div>}
        {result&&<div className="pos-attendance-card-success" role="status"><BadgeCheck/><div><b>{result.employeeName}</b><span>{result.eventType==="IN"?"Η προσέλευση καταχωρίστηκε.":"Η αποχώρηση καταχωρίστηκε."}</span></div></div>}
      </form>
    </section>
  </div>;
}
