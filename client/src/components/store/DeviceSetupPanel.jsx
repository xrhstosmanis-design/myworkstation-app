import React,{useEffect,useRef,useState} from "react";
import {fetchDeviceSetup} from "../../lib/device-setup-download.js";
const css=`.mws-device-setup{box-sizing:border-box;border:0;border-radius:16px;padding:22px;width:min(640px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;color:#164b3d;background:#f7fcfa}.mws-device-setup::backdrop{background:#0009}.mws-device-setup button,.mws-device-setup a{min-height:48px;padding:10px 14px;font:inherit;border:1px solid #83b6a6;border-radius:8px;background:white;color:#164b3d;display:inline-flex;align-items:center;justify-content:center;text-align:center;text-decoration:none;cursor:pointer}.mws-device-setup button:disabled{opacity:.5}.mws-device-setup section{display:grid;gap:10px;border:1px solid #b7d8cc;border-radius:10px;padding:14px;margin:12px 0}.mws-device-setup progress{width:100%}`;
export default function DeviceSetupPanel({scopeKey,initialDevice="scanner",label,disabled=false}){
  const [opened,setOpened]=useState(null),[progress,setProgress]=useState(null),[message,setMessage]=useState("");
  const dialog=useRef(null),launcher=useRef(null),active=useRef(null),live=useRef(true),urls=useRef(new Set()),timers=useRef(new Set());
  const validScope=typeof scopeKey==="string"&&scopeKey.length>0;
  const open=validScope&&opened!==null&&opened===scopeKey;
  const close=()=>{dialog.current?.close?.();active.current?.abort();active.current=null;setOpened(null);setProgress(null);setMessage("");launcher.current?.focus()};
  useEffect(()=>{live.current=true;return()=>{live.current=false;active.current?.abort();for(const t of timers.current)clearTimeout(t);timers.current.clear();for(const u of urls.current)URL.revokeObjectURL(u);urls.current.clear()}},[]);
  useEffect(()=>{active.current?.abort();active.current=null;setOpened(null);setProgress(null);setMessage("")},[scopeKey,disabled]);
  useEffect(()=>{if(open&&dialog.current){if(dialog.current.showModal)dialog.current.showModal();else dialog.current.setAttribute("open","")}},[open]);
  const download=async device=>{
    if(active.current)return;const control=new AbortController();active.current=control;setProgress(0);setMessage("");
    try{
      const result=await fetchDeviceSetup({device,signal:control.signal,onProgress:n=>{if(live.current&&!control.signal.aborted)setProgress(n)}});
      if(!live.current||control.signal.aborted||active.current!==control)return;
      const url=URL.createObjectURL(result.blob);urls.current.add(url);const a=document.createElement("a");a.href=url;a.download=result.filename;a.hidden=true;document.body.append(a);a.click();a.remove();
      const timer=setTimeout(()=>{URL.revokeObjectURL(url);urls.current.delete(url);timers.current.delete(timer)},60000);timers.current.add(timer);
      setMessage("Η λήψη ζητήθηκε. Άνοιξε το αρχείο από τις λήψεις και επίλεξε τη συσκευή στον βοηθό Windows. Η λήψη δεν σημαίνει ότι η συσκευή εγκαταστάθηκε.");
    }catch(error){if(live.current&&!control.signal.aborted)setMessage(error?.message||"Δεν ολοκληρώθηκε η λήψη.")}finally{if(active.current===control){active.current=null;if(live.current)setProgress(null)}}
  };
  return <><button ref={launcher} type="button" disabled={disabled||!validScope} onClick={()=>{setMessage("");setOpened(scopeKey)}} style={{minHeight:48,padding:"8px 12px",fontWeight:700}}>{label||"Εγκατάσταση συσκευών"}</button>{open&&<dialog ref={dialog} className="mws-device-setup" aria-label="Εγκατάσταση συσκευών" onCancel={e=>{e.preventDefault();close()}}>
    <style>{css}</style><h2>Εγκατάσταση συσκευών</h2><p>Στον υπολογιστή που είναι συνδεδεμένη η συσκευή. Μία φορά εγκατάσταση, χωρίς ZIP ή εντολές.</p>
    {initialDevice==="printer"&&<p>Για καρτελάκια τιμών: πρόσθεσε πρώτα τον εκτυπωτή στα Windows και διατήρησε τις σωστές διαστάσεις ετικέτας στη φόρμα του καταστήματος.</p>}
    <section><h3>Σαρωτής εγγράφων</h3><p>Κατέβασε και άνοιξε τον βοηθό Windows. Πάτησε Εγκατάσταση σαρωτή. Έπειτα ολοκλήρωσε μία φορά τη σύνδεση από το MyWorkStation, αν ζητηθεί κωδικός.</p><button type="button" disabled={progress!==null} onClick={()=>download("scanner")}>Εγκατάσταση σαρωτή</button></section>
    <section><h3>Εκτυπωτής ετικετών / καρτελακίων τιμών</h3><p>Πρόσθεσε τη συσκευή από τις ρυθμίσεις των Windows. Στην εκτύπωση διάλεξε τον ίδιο εκτυπωτή, το σωστό χαρτί και κλίμακα 100%.</p><a href="ms-settings:printers">Προσθήκη εκτυπωτή στα Windows</a><button type="button" disabled={progress!==null} onClick={()=>download("printer")}>Βοηθός εγκατάστασης εκτυπωτή</button></section>
    {progress!==null&&<><progress max="100" value={progress}/><p role="status">Λήψη βοηθού… {progress}%</p><button type="button" onClick={()=>{active.current?.abort();active.current=null;setProgress(null);setMessage("Η λήψη ακυρώθηκε.")}}>Ακύρωση λήψης</button></>}{message&&<p role="status">{message}</p>}<button type="button" onClick={close}>Κλείσιμο</button>
  </dialog>}</>;
}
