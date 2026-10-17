import React,{useEffect,useRef,useState} from 'react';
export default function TerminalDeleteButton({companyId,storeId,terminal,request,onDeleted,disabled=false}){
 const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),cancel=useRef(null),trigger=useRef(null);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{if(confirm)cancel.current?.focus()},[confirm]);
 const close=()=>{if(busy)return;setConfirm(false);setError('');trigger.current?.focus()};
 const remove=async()=>{if(busy)return;setBusy(true);setError('');try{
  await request(`/api/platform/companies/${companyId}/stores/${storeId}/installation-terminals/${terminal.id}`,{method:'DELETE'});
  if(alive.current){setConfirm(false);onDeleted(terminal)}
 }catch(err){if(alive.current)setError(err.message)}finally{if(alive.current)setBusy(false)}};
 return <><button ref={trigger} type="button" className="danger" disabled={disabled||terminal.active||busy} title={terminal.active?'Απενεργοποίησε πρώτα το τερματικό.':'Αφαίρεση από τις εγκαταστάσεις με διατήρηση ιστορικού.'} onClick={()=>setConfirm(true)}>Διαγραφή</button>{confirm&&<div className="platform-modal" onKeyDown={e=>{if(e.key==='Escape')close()}}><section className="platform-security-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`delete-terminal-${terminal.id}`}><h2 id={`delete-terminal-${terminal.id}`}>Διαγραφή τερματικού;</h2><p><b>{terminal.displayName} · {terminal.terminalPos}</b></p><p>Θα αφαιρεθεί από τη λίστα εγκαταστάσεων. Οι βάρδιες, οι συναλλαγές και το ιστορικό παραμένουν. Το Terminal ID διατηρείται για το ιστορικό και δεν δημιουργείται ξανά.</p><p>Ανοιχτή βάρδια ή ενεργή αντιστοίχιση ταμειακής εμποδίζει τη διαγραφή.</p>{error&&<p role="alert">{error}</p>}<div className="platform-form-actions"><button ref={cancel} type="button" className="secondary" onClick={close} disabled={busy}>Ακύρωση</button><button type="button" className="danger" onClick={remove} disabled={busy}>{busy?'Διαγραφή…':'Επιβεβαίωση διαγραφής'}</button></div></section></div>}</>;
}
