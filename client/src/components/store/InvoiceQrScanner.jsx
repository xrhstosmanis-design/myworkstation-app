import React,{useEffect,useRef,useState} from "react";
import {invoiceScannerAsciiKey,invoiceScannerInputError} from "../../lib/invoice-scanner-input.js";

export default function InvoiceQrScanner({api,store,onRead,onClose}){
  const input=useRef(null),pending=useRef(false),generation=useRef(0);
  const callbacks=useRef({api,onRead,onClose});callbacks.current={api,onRead,onClose};
  const [value,setValue]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    generation.current++;pending.current=false;if(input.current)input.current.value="";setValue("");setError("");setBusy(false);input.current?.focus();
    return()=>{generation.current++};
  },[store.id]);
  const read=async()=>{
    if(pending.current)return;
    const url=input.current?.value.trim()||"";if(!url)return;
    const problem=invoiceScannerInputError(url);if(problem){setError(problem);return}
    const current=generation.current;pending.current=true;setBusy(true);setError("");
    try{
      const data=await callbacks.current.api("/api/commerce/documents/qr-read",{method:"POST",timeoutMs:60000,body:JSON.stringify({storeId:store.id,url})});
      if(current!==generation.current)return;
      if(!/^data:application\/pdf;base64,/.test(data?.dataUrl||"")||!data?.header)throw Error("Δεν παραλήφθηκε ασφαλές PDF τιμολογίου.");
      const bytes=Uint8Array.from(atob(data.dataUrl.split(",")[1]),char=>char.charCodeAt(0));
      callbacks.current.onRead({...data,file:new File([bytes],data.filename,{type:"application/pdf"})});
    }catch(cause){if(current===generation.current)setError(cause?.message||"Δεν διαβάστηκε το QR. Χρησιμοποίησε φωτογραφία ή PDF.")}
    finally{if(current===generation.current){pending.current=false;setBusy(false);input.current?.focus()}}
  };
  const keyDown=event=>{
    event.stopPropagation();
    if(event.target===input.current){
      if(event.key==="Tab"){event.preventDefault();if(!event.isComposing)read();return}
      const ascii=invoiceScannerAsciiKey(event);
      if(ascii!==null){event.preventDefault();if(!pending.current){const field=input.current;field.setRangeText(ascii,field.selectionStart??field.value.length,field.selectionEnd??field.value.length,"end");setValue(field.value);setError("")}return}
    }
    if(event.key==="Enter"){event.preventDefault();if(!event.isComposing)read()}
    if(event.key==="Escape"){event.preventDefault();generation.current++;callbacks.current.onClose()}
  };
  const close=()=>{generation.current++;callbacks.current.onClose()};
  const clear=()=>{if(pending.current)return;input.current.value="";setValue("");setError("");input.current.focus()};
  return <div className="operator-camera-overlay" role="dialog" aria-modal="true" aria-label="QR τιμολογίου με scanner" onKeyDown={keyDown}>
    <section className="operator-camera-modal"><header><div><small>MYWORKSTATION · {store.name}</small><h2>QR τιμολογίου με scanner</h2></div><button type="button" onClick={close} aria-label="Κλείσιμο scanner">×</button></header>
      <p>Σκάναρε το τετράγωνο QR του τιμολογίου. Με Enter ή Tab ξεκινά η αναγνώριση. Διαφορετικά πάτησε «Αναγνώριση».</p>
      <label>QR / σύνδεσμος τιμολογίου<input ref={input} aria-label="QR / σύνδεσμος τιμολογίου" defaultValue="" onInput={event=>{setValue(event.currentTarget.value);setError("")}} data-keyboard="off" readOnly={busy} maxLength={4096} autoComplete="off" spellCheck={false} style={{width:"100%",fontSize:18,padding:12}}/></label>
      <small>{value.length} χαρακτήρες · Περιμένουμε ολόκληρο σύνδεσμο https://</small>
      <p role="status">{busy?"Λήψη πρωτότυπου PDF… Δεν γίνεται πληρωμή.":"Τα στοιχεία και το ποσό χρειάζονται επιβεβαίωση. Το QR δεν αποτελεί αποδεικτικό εξόφλησης."}</p>
      {error&&<div className="operator-login-error" role="alert">{error}</div>}
      <button type="button" disabled={busy||!value.trim()} onClick={read}>Αναγνώριση</button><button type="button" disabled={busy} onClick={clear}>Καθαρισμός / νέα σάρωση</button><button type="button" onClick={close}>Κλείσιμο / φωτογραφία ή PDF</button>
    </section>
  </div>;
}
