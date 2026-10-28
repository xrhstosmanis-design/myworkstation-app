import React,{useEffect,useRef,useState} from 'react';

const maxBytes=7*1024*1024;
const fileData=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(Error('Δεν διαβάστηκε το αρχείο.'));reader.readAsDataURL(file);});
export default function CashKioskImportPanel({api,storeId,storeName,generation,from,to,onChanged,onBusyChange,onUncertain,disabled=false}){
 const [sources,setSources]=useState([]),[file,setFile]=useState(null),[kind,setKind]=useState('EVENTS'),[shift,setShift]=useState(''),[operator,setOperator]=useState(''),[start,setStart]=useState(from),[end,setEnd]=useState(to),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[target,setTarget]=useState(''),[reason,setReason]=useState(''),[revokeConfirmed,setRevokeConfirmed]=useState(false);
 const scope=JSON.stringify([storeId,generation,from,to]),current=useRef(scope),epoch=useRef(0),busyRef=useRef(false),loaded=useRef(false);current.current=scope;
 const active=()=>Boolean(storeId&&storeName&&generation!==undefined&&from&&to);
 const endpoint=`/api/cash-reconciliation/stores/${encodeURIComponent(storeId||'')}/kiosk-sources`;
 const refresh=async()=>{
  if(current.current!==scope||busyRef.current||disabled)return;
  const own=scope,id=++epoch.current;
  try{const r=await api(endpoint+'?'+new URLSearchParams({from,to}));if(current.current!==own||id!==epoch.current)return;
   if(r.storeId!==storeId||r.generation!==generation||r.period?.from!==from||r.period?.to!==to||!Array.isArray(r.sources))throw Error('Ανανέωσε τον έλεγχο του επιλεγμένου καταστήματος.');loaded.current=true;setSources(r.sources);
  }catch(e){if(current.current===own&&id===epoch.current)setError(e.message||'Δεν φορτώθηκαν τα αρχεία.');}
 };
 useEffect(()=>{epoch.current++;busyRef.current=false;loaded.current=false;setSources([]);setFile(null);setKind('EVENTS');setShift('');setOperator('');setStart(from);setEnd(to);setConfirmed(false);setBusy(false);setError('');setNotice('');setTarget('');setReason('');setRevokeConfirmed(false);return()=>{epoch.current++;if(busyRef.current)onBusyChange?.(false);};},[scope]);
 const send=async(mode)=>{
  if(current.current!==scope||!active()||busyRef.current||disabled)return;
  if(mode==='IMPORT'&&(!file||!confirmed||start>end||!start||!end||kind==='JOURNAL'&&(!shift.trim()||!operator.trim())))return;
  if(mode==='REVOKE'&&(!target||reason.trim().length<10||!revokeConfirmed))return;
  const own=scope,id=++epoch.current,isCurrent=()=>current.current===own&&epoch.current===id;busyRef.current=true;setBusy(true);onBusyChange?.(true);setError('');setNotice('');
  let released=false;const release=()=>{if(released)return;released=true;busyRef.current=false;setBusy(false);onBusyChange?.(false);};
  try{
   let body;
   if(mode==='IMPORT'){
    if(file.size<8||file.size>maxBytes||!/\.xlsx?$/i.test(file.name))throw Error('Επίλεξε XLS ή XLSX έως 7 MB.');
    const contentData=await fileData(file);if(!isCurrent())return;
    body={requestId:crypto.randomUUID(),generation,period:{from:start,to:end},fileName:file.name,contentData,binding:kind==='JOURNAL'?{kind,kioskShiftId:shift.trim(),kioskOperator:operator.trim()}:{kind},selectedStoreConfirmed:true};
   }else body={requestId:crypto.randomUUID(),generation,sourceId:target,reason:reason.trim()};
   const r=await api(endpoint+(mode==='REVOKE'?'/revoke':''),{method:'POST',body:JSON.stringify(body)});if(!isCurrent())return;
   if(r.storeId!==storeId||r.generation!==generation)throw Error('Δεν επιβεβαιώθηκε η ενέργεια στο ίδιο κατάστημα.');
   setNotice(mode==='IMPORT'?(r.reused?'Το ίδιο αρχείο είχε ήδη συνδεθεί.':'Το αρχείο συνδέθηκε με τον έλεγχο.'):'Το αρχείο αφαιρέθηκε από την ανάλυση. Το πρωτότυπο και το ιστορικό διατηρούνται.');
   setConfirmed(false);setTarget('');setReason('');setRevokeConfirmed(false);release();onChanged?.();void refresh();
  }catch(e){if(isCurrent()){setError((e.message||'Δεν επιβεβαιώθηκε η ενέργεια.')+' Ανανέωσε τον έλεγχο πριν ξαναδοκιμάσεις.');release();onUncertain?.();}}
  finally{if(isCurrent())release();}
 };
 return <details aria-label="Αρχεία συμβάντων Kiosk" onToggle={e=>{if(e.currentTarget.open&&!loaded.current&&active())void refresh();}}><summary>Excel συμβάντων και ημερολόγια Kiosk</summary>
  <p>Κατάστημα: <strong>{storeName}</strong>. Τα χειρόγραφα συνεχίζουν να ανεβαίνουν στο Chat του καταστήματος.</p>
  <button type="button" disabled={busy||disabled||!active()} onClick={refresh}>Ανανέωση λίστας αρχείων</button>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{busy&&<p role="status">Ανάγνωση αρχείου…</p>}
  <form onSubmit={e=>{e.preventDefault();void send('IMPORT');}}>
   <label>Αρχείο XLS / XLSX<input key={scope} type="file" accept=".xls,.xlsx" disabled={busy||disabled||!active()} onChange={e=>{setFile(e.target.files?.[0]||null);setConfirmed(false);setError('');}}/></label>
   <label>Περιεχόμενο<select value={kind} disabled={busy||disabled} onChange={e=>{setKind(e.target.value);setConfirmed(false);}}><option value="EVENTS">ΣΥΜΒΑΝΤΑ ΣΥΣΤΗΜΑΤΟΣ</option><option value="JOURNAL">Ημερολόγιο κινήσεων βάρδιας</option></select></label>
   <label>Περίοδος αρχείου από<input type="date" value={start} disabled={busy||disabled} onChange={e=>{setStart(e.target.value);setConfirmed(false);}}/></label>
   <label>Έως<input type="date" value={end} disabled={busy||disabled} onChange={e=>{setEnd(e.target.value);setConfirmed(false);}}/></label>
   {kind==='JOURNAL'&&<><label>Αριθμός βάρδιας στο Kiosk<input value={shift} maxLength={100} disabled={busy||disabled} onChange={e=>{setShift(e.target.value);setConfirmed(false);}}/></label><label>Κωδικός χειριστή στο Kiosk<input value={operator} maxLength={100} disabled={busy||disabled} onChange={e=>{setOperator(e.target.value);setConfirmed(false);}}/></label><p>Συμπλήρωσε τους κωδικούς του πρωτοτύπου.</p></>}
   <label><input type="checkbox" checked={confirmed} disabled={busy||disabled||!file||!active()} onChange={e=>setConfirmed(e.target.checked)}/>Επιβεβαίωσα ότι το αρχείο αφορά το {storeName}, την παραπάνω περίοδο και τους δηλωμένους κωδικούς.</label>
   <button type="submit" disabled={busy||disabled||!active()||!file||!confirmed||!start||!end||start>end||kind==='JOURNAL'&&(!shift.trim()||!operator.trim())}>Σύνδεση αρχείου με τον έλεγχο</button>
  </form>
  <ul>{sources.map(s=><li key={s.id}>{s.fileName} · {s.period.from} έως {s.period.to}{s.sequence?` · καταχώριση ${s.sequence}`:''}{s.kind==='JOURNAL'?` · Kiosk ${s.binding.kioskShiftId} / ${s.binding.kioskOperator}`:''}{s.status==='LIMITED'?' · ελλιπής ανάγνωση':''}<button type="button" disabled={busy||disabled} onClick={()=>{setTarget(s.id);setReason('');setRevokeConfirmed(false);}}>Αφαίρεση από την ανάλυση</button></li>)}</ul>
  {target&&<form onSubmit={e=>{e.preventDefault();void send('REVOKE');}}><label>Αιτία αφαίρεσης<textarea value={reason} minLength={10} maxLength={500} disabled={busy||disabled} onChange={e=>{setReason(e.target.value);setRevokeConfirmed(false);}}/></label><label><input type="checkbox" checked={revokeConfirmed} disabled={busy||disabled} onChange={e=>setRevokeConfirmed(e.target.checked)}/>Επιβεβαιώνω την αφαίρεση μόνο από την ανάλυση.</label><button type="submit" disabled={busy||disabled||reason.trim().length<10||!revokeConfirmed}>Επιβεβαίωση αφαίρεσης</button></form>}
 </details>;
}
