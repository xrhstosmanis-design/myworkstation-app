import React,{useEffect,useRef,useState} from 'react';
import {greeceDateInput,greeceDateTimeInput,greeceDateTimeToIso} from '../../../../shared/greece-time.mjs';
import './store-shift-menu.css';
import './store-cash-transfer.css';
const euro=v=>Number(v).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
const dateTime=v=>v?greeceDateTimeInput(v).replace('T',' '):'Ανοικτή';
export default function OwnerCashWithdrawalModal({api,store,actorKey,allowed,onClose,onChanged}){
 const [date,setDate]=useState(()=>greeceDateInput()),[sessions,setSessions]=useState([]),[sessionId,setSessionId]=useState(''),[at,setAt]=useState(()=>greeceDateTimeInput()),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[preview,setPreview]=useState(null),[pending,setPending]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null);
 const alive=useRef(true),locked=useRef(false),epoch=useRef(0),access=useRef(allowed);access.current=allowed;
 const journalKey=`owner-withdrawal-v1:${actorKey}:${store.id}`,base=`/api/transactions/stores/${encodeURIComponent(store.id)}/owner-withdrawals`;
 useEffect(()=>{alive.current=true;try{const value=JSON.parse(sessionStorage.getItem(journalKey)||'null');if(value?.storeId===store.id&&value?.actorKey===actorKey&&value?.packet)setPending(value.packet)}catch{setError('Δεν ήταν δυνατή η ανάκτηση εκκρεμούς καταχώρισης. Ελέγξτε τα Συμβάντα πριν νέα προσπάθεια.');}return()=>{alive.current=false;epoch.current++}},[journalKey]);
 useEffect(()=>{if(!allowed){epoch.current++;setPreview(null);setError('Το δικαίωμα καταχώρισης δεν είναι πλέον ενεργό.');}},[allowed]);
 useEffect(()=>{if(pending)return;const seq=++epoch.current;setSessions([]);setSessionId('');setPreview(null);if(!allowed)return;api(`${base}/sessions?date=${date}`).then(v=>{if(alive.current&&seq===epoch.current){if(v.storeId!==store.id||!Array.isArray(v.sessions))throw Error('Άλλαξε το επιλεγμένο κατάστημα.');setSessions(v.sessions)}}).catch(e=>{if(alive.current&&seq===epoch.current)setError(e.message)});},[api,store.id,date,allowed,pending]);
 const change=setter=>e=>{if(pending||locked.current)return;setter(e.target.value);setPreview(null);setError('')};
 const inspect=async()=>{
  if(locked.current||!access.current)return;locked.current=true;setBusy(true);setError('');const seq=epoch.current;
  try{const packet={sessionId,amount:Number(amount.replace(',','.')),occurredAt:greeceDateTimeToIso(at),reason:reason.trim(),idempotencyKey:crypto.randomUUID()};const value=await api(`${base}/preview`,{method:'POST',body:JSON.stringify(packet)});if(alive.current&&access.current&&seq===epoch.current){if(value.storeId!==store.id||value.sessionId!==sessionId||typeof value.expectedSnapshot!=='string')throw Error('Δεν επιβεβαιώθηκε η βάρδια.');setPreview({packet:{...packet,expectedSnapshot:value.expectedSnapshot},value})}}catch(e){if(alive.current)setError(e.message)}finally{locked.current=false;if(alive.current)setBusy(false)}
 };
 const confirm=async()=>{
  if(locked.current||!access.current||result)return;const packet=pending||preview?.packet;if(!packet)return;
  locked.current=true;setBusy(true);setError('');const seq=epoch.current;
  try{
   // Persist the exact packet before POST. A lost reply never creates a new key.
   sessionStorage.setItem(journalKey,JSON.stringify({storeId:store.id,actorKey,packet}));setPending(packet);
   const value=await api(`${base}/confirm`,{method:'POST',body:JSON.stringify(packet)});
   if(alive.current&&access.current&&seq===epoch.current){if(value?.ok!==true||value.sessionId!==packet.sessionId||value.amount!==packet.amount||typeof value.transactionId!=='string'||!value.transactionId.startsWith('owner-withdrawal-'))throw Error('Δεν επιβεβαιώθηκε η καταχώριση.');sessionStorage.removeItem(journalKey);setResult(value);setPending(null);setPreview(null);onChanged?.()}
  }catch(e){if(alive.current)setError(`${e.message} Αν δεν επιβεβαιώθηκε η απάντηση, επανάλαβε το ίδιο αίτημα. Μην δημιουργήσεις δεύτερη καταχώριση.`)}finally{locked.current=false;if(alive.current)setBusy(false)}
 };
 return <div className="shift-overlay"><section className="shift-close-modal cash-transfer-modal" role="dialog" aria-modal="true" aria-label="Ανάληψη ιδιοκτήτη"><header><div><small>{store.name}</small><h2>Ταμείο → Ιδιοκτήτης</h2><p>Καταχώριση χρημάτων που ήδη παραλήφθηκαν</p></div></header><div className="shift-close-body">
 {!pending&&!result&&<><label>Ημερομηνία παραλαβής (Ελλάδα)<input type="date" value={date} disabled={busy} onChange={change(setDate)}/></label><label>Αρχική βάρδια / ταμείο<select value={sessionId} disabled={busy} onChange={change(setSessionId)}><option value="">Επίλεξε βάρδια</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.terminalPos} · {s.openedByName} · {dateTime(s.openedAt)} → {dateTime(s.closedAt)}</option>)}</select></label><label>Ημερομηνία και ώρα παραλαβής (Ελλάδα)<input type="datetime-local" value={at} disabled={busy} onChange={change(setAt)}/></label><label>Ποσό (€)<input inputMode="decimal" value={amount} disabled={busy} onChange={change(setAmount)}/></label><label>Αιτιολογία<input value={reason} maxLength={400} disabled={busy} onChange={change(setReason)}/></label><button type="button" disabled={busy||!allowed||!sessionId} onClick={inspect}>Προεπισκόπηση διόρθωσης</button></>}
 {preview&&!pending&&<div role="status"><p>Ανάληψη: {euro(preview.value.amount)}. {preview.value.operatorName}.</p>{preview.value.before&&<p>Διαφορά βάρδιας: {euro(preview.value.before.variance)} → {euro(preview.value.after.variance)}. Η αρχική καταμέτρηση διατηρείται.</p>}<button type="button" disabled={busy||!allowed} onClick={confirm}>Επιβεβαίωση καταχώρισης και συμβάντος</button></div>}
 {pending&&!result&&<div role="status"><p>Εκκρεμεί επιβεβαίωση ανάληψης {euro(pending.amount)} στις {dateTime(pending.occurredAt)}. Η επανάληψη χρησιμοποιεί το ίδιο αίτημα.</p><button type="button" disabled={busy||!allowed} onClick={confirm}>Επανάληψη ίδιου αιτήματος</button></div>}
 {result&&<p role="status">Η ανάληψη καταχωρίστηκε και συνδέθηκε με τα Συμβάντα.{result.after?` Νέα διαφορά: ${euro(result.after.variance)}.`:''}</p>}{error&&<p role="alert">{error}</p>}
 <button type="button" disabled={busy} onClick={onClose}>Κλείσιμο</button></div></section></div>;
}
