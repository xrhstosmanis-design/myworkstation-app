import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {greeceDateInput} from '../../../../shared/greece-time.mjs';
import {posProposalRows,renderPosOrderProposal} from '../../../../shared/pos-order-proposal-report.mjs';
import './pos-order-suggestions.css';
const fmt=x=>x==null?'—':Number(x).toLocaleString('el-GR',{maximumFractionDigits:3});
function defaults(){const toDate=greeceDateInput(),fromDate=new Date(Date.parse(toDate+'T00:00:00Z')-27*86400000).toISOString().slice(0,10);return {supplierId:'',fromDate,toDate,coverageDays:'7',leadDays:'3'}}
export function printPosOrderProposal(report,search='',openWindow=()=>window.open('','_blank','width=1100,height=800')){
 const popup=openWindow();if(!popup)throw Error('Ο browser μπλόκαρε την εκτύπωση. Επίτρεψε το παράθυρο εκτύπωσης.');
 popup.opener=null;popup.document.write(renderPosOrderProposal(report,search).html);popup.document.close();popup.focus();popup.print();
}
export default function PosOrderSuggestions({api,store,operator,open,onOpen,onClose}){
 const [allowed,setAllowed]=useState(false),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[q,setQ]=useState('');
 const [filters,setFilters]=useState(defaults),[request,setRequest]=useState(defaults),[suppliers,setSuppliers]=useState([]);
 const [emailOpen,setEmailOpen]=useState(false),[recipients,setRecipients]=useState(''),[sending,setSending]=useState(false),[attempted,setAttempted]=useState(''),[message,setMessage]=useState('');
 const generation=useRef(0),sendingRef=useRef(false),closeRef=useRef(onClose);closeRef.current=onClose;
 const dirty=JSON.stringify(filters)!==JSON.stringify(request);
 useEffect(()=>{const id=++generation.current;let live=true;const initial=defaults();setAllowed(false);setData(null);setError('');setQ('');setFilters(initial);setRequest(initial);setSuppliers([]);setRecipients('');setEmailOpen(false);setMessage('');setAttempted('');setSending(false);sendingRef.current=false;
  const check=()=>api(`/api/pos-order-suggestions/stores/${encodeURIComponent(store.id)}/permission`).then(r=>{if(!live||generation.current!==id)return;if(r.storeId!==store.id||r.allowed!==true)throw Error('Δεν επιβεβαιώθηκε το δικαίωμα.');setAllowed(true)}).catch(()=>{if(live&&generation.current===id){setAllowed(false);setData(null);closeRef.current()}});
  check();const timer=setInterval(check,15000);window.addEventListener('focus',check);
  return()=>{live=false;generation.current++;clearInterval(timer);window.removeEventListener('focus',check)};
 },[api,store.id,operator]);
 useEffect(()=>{if(!open||!allowed)return;let live=true;const id=generation.current;
  api(`/api/pos-order-suggestions/stores/${encodeURIComponent(store.id)}/suppliers`).then(r=>{if(!live||id!==generation.current)return;if(r.storeId!==store.id)throw Error('Δεν επιβεβαιώθηκε το κατάστημα.');setSuppliers(r.suppliers||[])}).catch(e=>{if(live&&id===generation.current)setError(e.message)});
  return()=>{live=false};
 },[api,store.id,open,allowed]);
 useEffect(()=>{setData(null);if(!open||!allowed||dirty){setBusy(false);return;}let live=true;const id=generation.current;setBusy(true);setError('');setMessage('');setAttempted('');
  const params=new URLSearchParams(request);
  api(`/api/pos-order-suggestions/stores/${encodeURIComponent(store.id)}/proposal?${params}`).then(r=>{if(!live||id!==generation.current)return;if(r.storeId!==store.id||!Array.isArray(r.rows))throw Error('Δεν επιβεβαιώθηκε το κατάστημα.');setData(r);setRecipients(current=>current||r.supplier?.email||'')}).catch(e=>{if(live&&id===generation.current)setError(e.message)}).finally(()=>{if(live&&id===generation.current)setBusy(false)});
  return()=>{live=false};
 },[api,store.id,open,allowed,request,dirty]);
 if(!allowed)return null;
 const rows=data?posProposalRows(data,q):[],ready=Boolean(data?.reportId)&&!dirty&&!busy&&rows.length>0;
 const change=(key,value)=>{setFilters(current=>({...current,[key]:value}));setData(null);setError('');setMessage('');setEmailOpen(false);if(key==='supplierId')setRecipients(suppliers.find(s=>s.id===value)?.email||'')};
 const calculate=e=>{e.preventDefault();setRequest({...filters});setEmailOpen(false)};
 const send=async e=>{e.preventDefault();if(!ready||sendingRef.current||attempted===data.reportId)return;
  const emails=[...new Set(recipients.split(/[,;]/).map(x=>x.trim().toLowerCase()).filter(Boolean))];
  if(!emails.length||emails.length>10||/[\r\n]/.test(recipients)||emails.some(x=>!/^\S+@\S+\.\S+$/.test(x))){setError('Συμπλήρωσε έως 10 έγκυρα email, χωρισμένα με κόμμα.');return;}
  const id=generation.current,reportId=data.reportId;sendingRef.current=true;setSending(true);setError('');setMessage('');
  try{const r=await api(`/api/pos-order-suggestions/stores/${encodeURIComponent(store.id)}/email`,{method:'POST',body:JSON.stringify({reportId,recipients:emails.join(', '),search:q})});
   if(id!==generation.current)return;if(r.ok!==true||!['ACCEPTED','PARTIAL'].includes(r.status)||r.reportId!==reportId)throw Error('Δεν επιβεβαιώθηκε η αποστολή.');
   setMessage(r.status==='PARTIAL'?`Η αποστολή έγινε δεκτή για: ${(r.accepted||[]).join(', ')}. Δεν έγινε δεκτή για: ${(r.rejected||[]).join(', ')}. Έλεγξε πριν από νέα αποστολή.`:r.auditWarning?'Ο διακομιστής email δέχτηκε την αποστολή. Η καταγραφή ιστορικού χρειάζεται έλεγχο· μην την επαναλάβεις.':'Ο διακομιστής email δέχτηκε την πρόταση.');
  }catch(e){if(id===generation.current)setError(e.message||'Η κατάσταση αποστολής δεν επιβεβαιώθηκε. Έλεγξέ την πριν από νέα αποστολή.');}
  finally{if(id===generation.current){sendingRef.current=false;setSending(false);setAttempted(reportId)}}
 };
 return <><button type="button" className="store-chat-top-button" onClick={onOpen}>✣ Πρόταση παραγγελίας</button>{open&&createPortal(<div className="pos-order-proposals-overlay"><section role="dialog" aria-modal="true" aria-label="Πρόταση παραγγελίας" className="pos-order-proposals-window"><header><div><h2>Πρόταση παραγγελίας</h2><p>{store.name} · μόνο το κατάστημα αυτού του POS</p></div><button type="button" onClick={onClose}>Επιστροφή στο POS</button></header>
  <form className="pos-order-proposals-filters" onSubmit={calculate}>
   <label>Προμηθευτής<select aria-label="Προμηθευτής πρότασης" value={filters.supplierId} disabled={sending} onChange={e=>change('supplierId',e.target.value)}><option value="">Όλοι οι προμηθευτές</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <label>Πωλήσεις από<input aria-label="Πωλήσεις από" type="date" required value={filters.fromDate} max={filters.toDate} disabled={sending} onChange={e=>change('fromDate',e.target.value)}/></label>
   <label>Πωλήσεις έως<input aria-label="Πωλήσεις έως" type="date" required value={filters.toDate} min={filters.fromDate} max={greeceDateInput()} disabled={sending} onChange={e=>change('toDate',e.target.value)}/></label>
   <label>Ημέρες κάλυψης<input aria-label="Ημέρες κάλυψης" type="number" min="1" max="60" required value={filters.coverageDays} disabled={sending} onChange={e=>change('coverageDays',e.target.value)}/></label>
   <label>Ημέρες μέχρι παράδοση<input aria-label="Ημέρες μέχρι παράδοση" type="number" min="0" max="30" required value={filters.leadDays} disabled={sending} onChange={e=>change('leadDays',e.target.value)}/></label>
   <button type="submit" disabled={busy||sending}>{busy?'Υπολογισμός…':'Υπολογισμός πρότασης'}</button>
  </form>
  <p className="pos-order-proposals-hint">Περίοδος πωλήσεων έως 366 ημέρες, με τις δύο ημερομηνίες μέσα στον υπολογισμό. Τα είδη προμηθευτή προκύπτουν από προηγούμενες εγκεκριμένες αγορές του καταστήματος. Η σημερινή ημέρα μπορεί να είναι μερική.</p>
  {data&&<p>Χρησιμοποιείται το τρέχον αποθηκευμένο alarm. {data?.automaticAlarm?'Η εβδομαδιαία αυτόματη αναπροσαρμογή είναι ενεργοποιημένη.':'Η εβδομαδιαία αυτόματη αναπροσαρμογή δεν είναι ενεργή.'}</p>}
  {dirty&&<p role="status">Άλλαξαν τα κριτήρια. Πάτησε «Υπολογισμός πρότασης».</p>}
  <div className="pos-order-proposals-actions"><input aria-label="Αναζήτηση πρότασης" placeholder="Όνομα ή κωδικός" maxLength="200" value={q} disabled={sending} onChange={e=>{setQ(e.target.value);setMessage('')}}/><button type="button" disabled={!ready||sending} onClick={()=>{try{printPosOrderProposal(data,q)}catch(e){setError(e.message)}}}>Εκτύπωση</button><button type="button" disabled={!ready||sending||attempted===data?.reportId} onClick={()=>setEmailOpen(current=>!current)}>Αποστολή με email</button></div>
  {emailOpen&&ready&&<form className="pos-order-proposals-email" onSubmit={send}><label>Email παραληπτών<input aria-label="Email παραληπτών πρότασης" required maxLength="1000" value={recipients} disabled={sending||attempted===data.reportId} placeholder="email1@example.gr, email2@example.gr" onChange={e=>setRecipients(e.target.value)}/></label><p>Θα σταλεί η εμφανιζόμενη πρόταση με {rows.length} είδη. Η αποστολή δεν καταχωρίζει παραγγελία.</p><button type="submit" disabled={sending||attempted===data.reportId}>{sending?'Αποστολή…':'Αποστολή πρότασης'}</button>{attempted===data.reportId&&<p>Για νέα αποστολή χρειάζεται νέος υπολογισμός, αφού ελέγξεις την προηγούμενη αποστολή.</p>}</form>}
  {busy&&<p role="status">Υπολογισμός…</p>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {data?.expectedReceipts?.available===false&&<p role="status">Οι αναμενόμενες παραλαβές δεν είναι διαθέσιμες στον υπολογισμό. Έλεγξέ τες πριν παραγγείλεις.</p>}
  {data&&<div className="pos-order-proposals-scroll"><table><thead><tr><th>Είδος</th><th>Καθαρές πωλήσεις περιόδου</th><th>Απόθεμα</th><th>Alarm</th><th>Πρόταση</th><th>Έλεγχος</th></tr></thead><tbody>{rows.map(r=><tr key={r.productId}><td>{r.name}<small>{r.sku}</small></td><td>{fmt(r.netQuantity)}<small>Πωλήσεις {fmt(r.soldQuantity)} · επιστροφές {fmt(r.returnedQuantity)}</small></td><td>{fmt(r.currentStock)}</td><td>{fmt(r.minStock)}</td><td>{fmt(r.suggestedQuantity)} {r.unitLabel}</td><td>{r.reason}{r.confirmedPendingStockQuantity>0&&<small>Επιβεβαιωμένο αναμενόμενο υπόλοιπο: {fmt(r.confirmedPendingStockQuantity)} {r.unitLabel}</small>}{r.pendingPurchaseReview?.map(review=><small key={review.status}>{review.status==='NEW'?'Πρόχειρες αγορές':'Προς τιμολόγηση'}: {review.orderCount} · {review.recordedStockQuantity==null?'Μετατροπή προς έλεγχο':`${fmt(review.recordedStockQuantity)} ${r.unitLabel} καταγεγραμμένα`}</small>)}{r.warnings.map(w=><small key={w}>{w}</small>)}</td></tr>)}</tbody></table>{!rows.length&&<p>Δεν υπάρχουν προτάσεις με αυτά τα κριτήρια.</p>}</div>}
 </section></div>,document.body)}</>;
}
