import React,{useEffect,useRef,useState} from "react";
import {pairDocumentScanner,scanDocument,ScannerPairingRequired} from "../../lib/document-scanner.js";

const sessionStamp=()=>{try{return [localStorage.getItem("token"),sessionStorage.getItem("storeOperatorToken"),sessionStorage.getItem("storeOperatorSession")].join("\u0000")}catch{return "unavailable"}};

export default function DocumentScanButton({scopeKey,onFiles,disabled=false,maxPages=5}){
  const live=useRef(null),[busy,setBusy]=useState(false),[pairing,setPairing]=useState(false),[code,setCode]=useState(""),[error,setError]=useState("");
  const props=useRef({scopeKey,onFiles,disabled,maxPages});props.current={scopeKey,onFiles,disabled,maxPages};
  useEffect(()=>{const current={key:scopeKey,controller:null};live.current=current;setBusy(false);setPairing(false);setCode("");setError("");return()=>{current.controller?.abort();if(live.current===current)live.current=null}},[scopeKey]);
  useEffect(()=>{if(disabled)live.current?.controller?.abort()},[disabled]);
  const run=async pair=>{
    const current=live.current;if(!current||current.controller||props.current.disabled)return;
    const controller=new AbortController(),session=sessionStamp();current.controller=controller;setBusy(true);setError("");
    const valid=()=>live.current===current&&props.current.scopeKey===current.key&&sessionStamp()===session&&!props.current.disabled&&!controller.signal.aborted;
    try{
      if(pair){await pairDocumentScanner(code,{signal:controller.signal});if(valid()){setCode("");setPairing(false)}return}
      const files=await scanDocument({maxPages:props.current.maxPages,signal:controller.signal});
      if(valid())await props.current.onFiles(files);
    }catch(cause){if(valid()){if(cause instanceof ScannerPairingRequired)setPairing(true);else setError(cause.message||"Η σάρωση απέτυχε.")}}
    finally{current.controller=null;if(live.current===current)setBusy(false)}
  };
  return <div className="document-scan-control" style={{display:"grid",gap:8,margin:"8px 0"}}>
    <button type="button" disabled={disabled||busy||maxPages<1} onClick={()=>run(false)} style={{minHeight:48,fontSize:18,fontWeight:800,padding:"10px 14px"}}>{busy?"Σάρωση…":"Σάρωση εγγράφου"}</button>
    {busy&&<button type="button" onClick={()=>{live.current?.controller?.abort();setError("Η λήψη ακυρώθηκε. Ο σαρωτής μπορεί να ολοκληρώνει τη φυσική κίνηση· περίμενε πριν ξαναδοκιμάσεις.")}}>Ακύρωση λήψης</button>}
    {pairing&&<div role="group" aria-label="Σύνδεση σαρωτή"><p>Μόνο την πρώτη φορά: άνοιξε τον σύνδεσμο σαρωτή MyWorkStation στον υπολογιστή και γράψε τον κωδικό του.</p><label>Κωδικός σύνδεσης σαρωτή<input inputMode="numeric" autoComplete="off" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))}/></label><button type="button" disabled={busy||disabled||code.length!==6} onClick={()=>run(true)}>Σύνδεση σαρωτή</button></div>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}
