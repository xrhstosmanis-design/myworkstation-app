import React,{useEffect,useRef,useState} from "react";
import {X} from "lucide-react";
import "./store-shift-menu.css";
import "./store-cash-transfer.css";

export default function StoreCashTransferModal({api,store,direction="OUT",allowed=true,onClose,onChanged}){
 const [overview,setOverview]=useState(null),[sessionId,setSessionId]=useState(""),[amount,setAmount]=useState(""),[reason,setReason]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 const lock=useRef(false),key=useRef(crypto.randomUUID()),live=useRef(true),access=useRef(allowed);access.current=allowed;
 useEffect(()=>{let current=true;live.current=true;api(`/api/transactions/stores/${encodeURIComponent(store.id)}/overview`).then(value=>{if(current){setOverview(value);setSessionId(value.openSession?.id||"")}}).catch(e=>{if(current)setError(e.message)});return()=>{current=false;live.current=false}},[api,store.id]);
 useEffect(()=>{if(!allowed)onClose()},[allowed,onClose]);
 const sessions=overview?.openSessions||[],session=sessions.find(s=>s.id===sessionId),incoming=direction==="IN";
 const submit=async event=>{
  event.preventDefault();if(lock.current||done||!access.current)return;
  const value=Number(amount.replace(",","."));
  if(!Number.isFinite(value)||value<=0||Math.abs(value*100-Math.round(value*100))>0.00001)return setError("Βάλε θετικό ποσό με έως δύο δεκαδικά.");
  if(reason.trim().length<3)return setError("Η αιτιολογία είναι υποχρεωτική (τουλάχιστον 3 χαρακτήρες).");
  if(!session)return setError("Επίλεξε ενεργή βάρδια / ταμείο.");
  lock.current=true;setBusy(true);setError("");
  try{
   await api(`/api/transactions/stores/${encodeURIComponent(store.id)}/cash-transfer`,{method:"POST",...(incoming?{headers:{"x-mws-terminal-pos":session.terminalPos}}:{}),body:JSON.stringify({direction,amount:value,reason:reason.trim(),sessionId:session.id,idempotencyKey:key.current})});
   if(live.current){setDone(true);onChanged?.()}
  }catch(e){if(live.current)setError(/καθυστέρησε|network|fetch/i.test(e.message||"")?"Δεν επιβεβαιώθηκε η μεταφορά. Ελέγξτε το Audit ή επαναλάβετε από την ίδια φόρμα.":e.message)}finally{lock.current=false;if(live.current)setBusy(false)}
 };
 return <div className="shift-overlay"><section className="shift-close-modal cash-transfer-modal"><header><div><small>MYWORKSTATION · {store.name}</small><h2>Μεταφορά μετρητών</h2><p>{incoming?"Ιδιοκτήτης → Ταμείο":"Ταμείο → Ιδιοκτήτης"}</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="Κλείσιμο μεταφοράς"><X/></button></header><form className="shift-close-body" onSubmit={submit}>
  <p>Η μεταφορά καταγράφεται ξεχωριστά στη βάρδια και στο Audit. {incoming?"Προσθέτει μετρητά στο ταμείο.":"Αφαιρεί μετρητά από το ταμείο προς τον Ιδιοκτήτη."}</p>
  {incoming?<label>Ενεργό ταμείο<select value={sessionId} disabled={busy||done} onChange={e=>setSessionId(e.target.value)}><option value="">Επίλεξε ταμείο</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.terminalPos} · {s.shiftLabel}</option>)}</select></label>:<p>Ταμείο: {session?.terminalPos||"Δεν υπάρχει ενεργή βάρδια"}</p>}
  <label>Ποσό (€)<input inputMode="decimal" value={amount} disabled={busy||done} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></label>
  <label>Αιτιολογία<input value={reason} maxLength={400} disabled={busy||done} onChange={e=>setReason(e.target.value)}/></label>
  {error&&<div role="alert">{error}</div>}{done&&<div role="status">Η μεταφορά καταχωρίστηκε.</div>}
  <button type="submit" disabled={!allowed||!session||busy||done}>{busy?"Καταχώριση…":"Καταχώριση μεταφοράς"}</button><button type="button" disabled={busy} onClick={onClose}>{done?"Κλείσιμο":"Άκυρο"}</button>
 </form></section></div>;
}
