import {applyProposalQuantities,proposalSupplierTotals,roundSupplierQuantity} from '../../../../shared/order-proposal-quantities.mjs';
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
function SupplierMinimum({row,sending,onApply,onSave}){
 const [value,setValue]=useState(()=>String(row.supplierMinimum??''));
 const minimum=Number(value);
 const valid=value!==''&&minimum>0&&minimum<=100000000&&Number(minimum.toFixed(4))===minimum;
 const quantity=valid?roundSupplierQuantity(row.requiredQuantity,row.supplierPack,minimum):null;
 return <div>
  <label>Ελάχιστο προμηθευτή για αυτή την πρόταση
   <input type="number" min="0.0001" max="100000000" step="0.0001"
    aria-label={`Ελάχιστο προμηθευτή για ${row.name}`} value={value}
    disabled={sending} onChange={event=>setValue(event.target.value)}/>
  </label>
  <button type="button" disabled={sending||!(quantity>0)||quantity>100000000}
   onClick={()=>onApply(quantity)}>Εφαρμογή ελάχιστου</button>
  {onSave&&<button type="button" disabled={sending||(!valid&&!(value===''&&row.supplierMinimum))}
   onClick={()=>onSave(value===''?null:minimum)}>{value===''?'Κατάργηση μόνιμου ελάχιστου':'Αποθήκευση ελάχιστου για επόμενες προτάσεις'}</button>}
 </div>;
}
export default function PosOrderSuggestions({api,store,operator,open,onOpen,onClose,backoffice=false}){
 const [quantities,setQuantities]=useState({});
 const [removed,setRemoved]=useState({});
 const [allowed,setAllowed]=useState(false),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[q,setQ]=useState('');
 const [filters,setFilters]=useState(defaults),[request,setRequest]=useState(defaults),[suppliers,setSuppliers]=useState([]);
 const [emailOpen,setEmailOpen]=useState(false),[recipients,setRecipients]=useState(''),[sending,setSending]=useState(false),[attempted,setAttempted]=useState(''),[message,setMessage]=useState('');
 const generation=useRef(0),sendingRef=useRef(false),closeRef=useRef(onClose);closeRef.current=onClose;
 const dirty=JSON.stringify(filters)!==JSON.stringify(request);
 useEffect(()=>{const id=++generation.current;let live=true;const initial=defaults();setAllowed(false);setData(null);setError('');setQ('');setFilters(initial);setRequest(initial);setSuppliers([]);setRecipients('');setEmailOpen(false);setMessage('');setAttempted('');setSending(false);sendingRef.current=false;
  const check=()=>api(`/api/pos-order-suggestions/stores/${encodeURIComponent(store.id)}/permission`).then(r=>{if(!live||generation.current!==id)return;if(r.storeId!==store.id||r.allowed!==true)throw Error('Δεν επιβεβαιώθηκε το δικαίωμα.');setAllowed(true)}).catch(()=>{if(live&&generation.current===id){setAllowed(false);setData(null);if(!backoffice)closeRef.current()}});
  check();const timer=setInterval(check,15000);window.addEventListener('focus',check);
  return()=>{live=false;generation.current++;clearInterval(timer);window.removeEventListener('focus',check)};
 },[api,store.id,operator,backoffice]);
 useEffect(()=>{if(!open||!allowed)return;let live=true;const id=generation.current;
  api(`/api/pos-order-suggestions/stores/${encodeURIComponent(store.id)}/suppliers`).then(r=>{if(!live||id!==generation.current)return;if(r.storeId!==store.id)throw Error('Δεν επιβεβαιώθηκε το κατάστημα.');setSuppliers(r.suppliers||[])}).catch(e=>{if(live&&id===generation.current)setError(e.message)});
  return()=>{live=false};
 },[api,store.id,open,allowed]);
 useEffect(()=>{setQuantities({});setRemoved({});setData(null);if(!open||!allowed||dirty){setBusy(false);return;}let live=true;const id=generation.current;setBusy(true);setError('');setMessage('');setAttempted('');
  const params=new URLSearchParams(request);
  api(`/api/pos-order-suggestions/stores/${encodeURIComponent(store.id)}/proposal?${params}`).then(r=>{if(!live||id!==generation.current)return;if(r.storeId!==store.id||!Array.isArray(r.rows))throw Error('Δεν επιβεβαιώθηκε το κατάστημα.');setData(r);setRecipients(current=>current||r.supplier?.email||'')}).catch(e=>{if(live&&id===generation.current)setError(e.message)}).finally(()=>{if(live&&id===generation.current)setBusy(false)});
  return()=>{live=false};
 },[api,store.id,open,allowed,request,dirty]);
 if(!allowed)return backoffice?createPortal(<div className="pos-order-proposals-overlay"><section role="dialog" aria-label="Πρόταση παραγγελίας" className="pos-order-proposals-window"><button type="button" onClick={onClose}>Κλείσιμο</button><p role="status">Έλεγχος πρόσβασης. Αν η οθόνη δεν ανοίξει, έλεγξε την ενεργοποίηση και το δικαίωμα για το κατάστημα.</p></section></div>,document.body):null;
 const cadence=suppliers.find(s=>s.id===filters.supplierId)?.receiptCadence;
 const editable=Boolean(backoffice||data?.rows.some(row=>Object.hasOwn(row,'requiredQuantity')));
 const rows=data?posProposalRows(data,q).filter(row=>!Object.hasOwn(removed,row.productId)):[];
 let finalReport=data;
 try{if(data)finalReport=applyProposalQuantities(data,quantities)}catch{finalReport=null}
 const finalRows=finalReport?posProposalRows(finalReport,q):[];
 const totals=proposalSupplierTotals(finalRows);
 const finalByProduct=new Map(finalRows.map(row=>[row.productId,row]));
 const ready=Boolean(finalReport?.reportId)&&!dirty&&!busy&&finalRows.length>0;
 const change=(key,value)=>{setFilters(current=>({...current,[key]:value}));setData(null);setError('');setMessage('');setEmailOpen(false);if(key==='supplierId')setRecipients(suppliers.find(s=>s.id===value)?.email||'')};
 const calculate=e=>{e.preventDefault();setRequest({...filters});setEmailOpen(false)};
 const removeLine=row=>{
  setRemoved(current=>({...current,[row.productId]:{name:row.name,quantity:quantities[row.productId]}}));
  setQuantities(current=>({...current,[row.productId]:0}));
 };
 const restoreLine=id=>{
  const previous=removed[id]?.quantity;
  setRemoved(current=>{const next={...current};delete next[id];return next});
  setQuantities(current=>{const next={...current};if(previous===undefined)delete next[id];else next[id]=previous;return next});
 };
 const saveMinimum=async(row,minimum)=>{
  if(sendingRef.current||!data?.reportId)return;
  const id=generation.current,reportId=data.reportId;
  sendingRef.current=true;setSending(true);setError('');
  try{
   await api(`/api/pos-order-suggestions/stores/${encodeURIComponent(store.id)}/supplier-minimum`,{
    method:'PUT',body:JSON.stringify({reportId,productId:row.productId,minimum})
   });
   if(id!==generation.current)return;
   setData(current=>current?.reportId===reportId?{...current,rows:current.rows.map(item=>item.productId===row.productId?{...item,supplierMinimum:minimum}:item)}:current);
   setMessage('Αποθηκεύτηκε για τις επόμενες προτάσεις. Πάτησε «Εφαρμογή ελάχιστου» για την τρέχουσα ποσότητα.');
  }catch(error){if(id===generation.current)setError(error.message)}
  finally{if(id===generation.current){sendingRef.current=false;setSending(false)}}
 };
 const send=async e=>{e.preventDefault();if(!ready||sendingRef.current||attempted===data.reportId)return;
  const emails=[...new Set(recipients.split(/[,;]/).map(x=>x.trim().toLowerCase()).filter(Boolean))];
  if(!emails.length||emails.length>10||/[\r\n]/.test(recipients)||emails.some(x=>!/^\S+@\S+\.\S+$/.test(x))){setError('Συμπλήρωσε έως 10 έγκυρα email, χωρισμένα με κόμμα.');return;}
  const id=generation.current,reportId=data.reportId;sendingRef.current=true;setSending(true);setError('');setMessage('');
  try{const r=await api(`/api/pos-order-suggestions/stores/${encodeURIComponent(store.id)}/email`,{method:'POST',body:JSON.stringify({reportId,recipients:emails.join(', '),search:q,...(Object.keys(quantities).length?{quantities}:{})})});
   if(id!==generation.current)return;if(r.ok!==true||!['ACCEPTED','PARTIAL'].includes(r.status)||r.reportId!==reportId)throw Error('Δεν επιβεβαιώθηκε η αποστολή.');
   setMessage(r.status==='PARTIAL'?`Η αποστολή έγινε δεκτή για: ${(r.accepted||[]).join(', ')}. Δεν έγινε δεκτή για: ${(r.rejected||[]).join(', ')}. Έλεγξε πριν από νέα αποστολή.`:r.auditWarning?'Ο διακομιστής email δέχτηκε την αποστολή. Η καταγραφή ιστορικού χρειάζεται έλεγχο· μην την επαναλάβεις.':'Ο διακομιστής email δέχτηκε την πρόταση.');
  }catch(e){if(id===generation.current)setError(e.message||'Η κατάσταση αποστολής δεν επιβεβαιώθηκε. Έλεγξέ την πριν από νέα αποστολή.');}
  finally{if(id===generation.current){sendingRef.current=false;setSending(false);setAttempted(reportId)}}
 };
 return <>{!backoffice&&<button type="button" className="store-chat-top-button" onClick={onOpen}>✣ Πρόταση παραγγελίας</button>}{open&&createPortal(<div className="pos-order-proposals-overlay"><section role="dialog" aria-modal="true" aria-label="Πρόταση παραγγελίας" className="pos-order-proposals-window"><header><div><h2>Πρόταση παραγγελίας</h2><p>{store.name} · μόνο το κατάστημα αυτού του POS</p></div><button type="button" onClick={onClose}>{backoffice?'Κλείσιμο':'Επιστροφή στο POS'}</button></header>
  <form className="pos-order-proposals-filters" onSubmit={calculate}>
   <label>Προμηθευτής<select aria-label="Προμηθευτής πρότασης" value={filters.supplierId} disabled={sending} onChange={e=>change('supplierId',e.target.value)}><option value="">Όλοι οι προμηθευτές</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <label>Πωλήσεις από<input aria-label="Πωλήσεις από" type="date" required value={filters.fromDate} max={filters.toDate} disabled={sending} onChange={e=>change('fromDate',e.target.value)}/></label>
   <label>Πωλήσεις έως<input aria-label="Πωλήσεις έως" type="date" required value={filters.toDate} min={filters.fromDate} max={greeceDateInput()} disabled={sending} onChange={e=>change('toDate',e.target.value)}/></label>
   <label>Ημέρες κάλυψης<input aria-label="Ημέρες κάλυψης" type="number" min="1" max="60" required value={filters.coverageDays} disabled={sending} onChange={e=>change('coverageDays',e.target.value)}/></label>
   <label>Ημέρες μέχρι παράδοση<input aria-label="Ημέρες μέχρι παράδοση" type="number" min="0" max="30" required value={filters.leadDays} disabled={sending} onChange={e=>change('leadDays',e.target.value)}/></label>
   <button type="submit" disabled={busy||sending}>{busy?'Υπολογισμός…':'Υπολογισμός πρότασης'}</button>
  </form>
  {filters.supplierId&&<div className="pos-order-proposals-hint">
   {cadence?<><span>Κάλυψη βάσει παραλαβών: {cadence.coverageDays} ημέρες ({cadence.receiptDays} ημέρες με καταχωρισμένη παραλαβή στις τελευταίες 56).</span>{' '}
    <button type="button" disabled={sending||Number(filters.coverageDays)===cadence.coverageDays} onClick={()=>change('coverageDays',String(cadence.coverageDays))}>Χρήση προτεινόμενης κάλυψης</button></>
    :<span>Χρειάζονται περισσότερες πρόσφατες ημέρες παραλαβής για εκτίμηση κάλυψης.</span>}
  </div>}
  <p className="pos-order-proposals-hint">Περίοδος πωλήσεων έως 366 ημέρες, με τις δύο ημερομηνίες μέσα στον υπολογισμό. Τα είδη προμηθευτή προκύπτουν από προηγούμενες εγκεκριμένες αγορές του καταστήματος. Η σημερινή ημέρα μπορεί να είναι μερική.</p>
  {data&&<p>Χρησιμοποιείται το τρέχον αποθηκευμένο alarm. {data?.automaticAlarm?'Η εβδομαδιαία αυτόματη αναπροσαρμογή είναι ενεργοποιημένη.':'Η εβδομαδιαία αυτόματη αναπροσαρμογή δεν είναι ενεργή.'}</p>}
  {dirty&&<p role="status">Άλλαξαν τα κριτήρια. Πάτησε «Υπολογισμός πρότασης».</p>}
  <div className="pos-order-proposals-actions"><input aria-label="Αναζήτηση πρότασης" placeholder="Όνομα ή κωδικός" maxLength="200" value={q} disabled={sending} onChange={e=>{setQ(e.target.value);setMessage('')}}/><button type="button" disabled={!ready||sending} onClick={()=>{try{printPosOrderProposal(finalReport,q)}catch(e){setError(e.message)}}}>Εκτύπωση</button><button type="button" disabled={!ready||sending||attempted===data?.reportId} onClick={()=>setEmailOpen(current=>!current)}>Αποστολή με email</button></div>
  {emailOpen&&ready&&<form className="pos-order-proposals-email" onSubmit={send}><label>Email παραληπτών<input aria-label="Email παραληπτών πρότασης" required maxLength="1000" value={recipients} disabled={sending||attempted===data.reportId} placeholder="email1@example.gr, email2@example.gr" onChange={e=>setRecipients(e.target.value)}/></label><p>Θα σταλεί η εμφανιζόμενη πρόταση με {finalRows.length} είδη. Η αποστολή δεν καταχωρίζει παραγγελία.</p><button type="submit" disabled={sending||attempted===data.reportId}>{sending?'Αποστολή…':'Αποστολή πρότασης'}</button>{attempted===data.reportId&&<p>Για νέα αποστολή χρειάζεται νέος υπολογισμός, αφού ελέγξεις την προηγούμενη αποστολή.</p>}</form>}
  {busy&&<p role="status">Υπολογισμός…</p>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {data?.expectedReceipts?.available===false&&<p role="status">Οι αναμενόμενες παραλαβές δεν είναι διαθέσιμες στον υπολογισμό. Έλεγξέ τες πριν παραγγείλεις.</p>}
  {editable&&totals.map(total=><p key={total.id??''}><strong>{total.name}</strong> · Εκτιμώμενη καθαρή αξία {fmt(total.cents/100)} €{total.missing>0&&` · ${total.missing} είδη χωρίς πλήρη εκτίμηση`}</p>)}
  {data&&!finalReport&&<p role="alert">Συμπλήρωσε έγκυρες ποσότητες. Βάλε 0 για εξαίρεση είδους.</p>}
  {Object.keys(removed).length>0&&<details className="proposal-removed">
   <summary>Αφαιρεμένα είδη ({Object.keys(removed).length})</summary>
   {Object.entries(removed).map(([id,line])=><div key={id}>{line.name} <button type="button" disabled={sending} onClick={()=>restoreLine(id)}>Επαναφορά</button></div>)}
  </details>}
  {data&&<div className="pos-order-proposals-scroll"><table><thead><tr><th>Είδος</th><th>Καθαρές πωλήσεις περιόδου</th><th>Απόθεμα</th><th>Alarm</th><th>Πρόταση</th><th>Έλεγχος</th></tr></thead><tbody>{rows.map(r=><tr key={r.productId}><td>{r.name}<small>{r.sku}</small></td><td>{fmt(r.netQuantity)}<small>Πωλήσεις {fmt(r.soldQuantity)} · επιστροφές {fmt(r.returnedQuantity)}</small></td><td>{fmt(r.currentStock)}</td><td>{fmt(r.minStock)}</td><td>{editable?<><input type="number" min="0" max="100000000" step="0.0001" aria-label={`Ποσότητα ${r.name}`} disabled={sending} value={Object.hasOwn(quantities,r.productId)?quantities[r.productId]??'':r.suggestedQuantity??''} onChange={e=>{const value=e.target.value;setQuantities(current=>({...current,[r.productId]:value===''?null:Number(value)}));setMessage('')}}/> {r.unitLabel}
   {r.orderSupplierId&&r.requiredQuantity>0&&<details className="proposal-minimum"><summary>Ρύθμιση ελάχιστου</summary><SupplierMinimum row={r} sending={sending} onSave={backoffice&&data.supplierMinimumAvailable?minimum=>saveMinimum(r,minimum):null}
    onApply={quantity=>{setQuantities(current=>({...current,[r.productId]:quantity}));setMessage('')}}/></details>}
   {r.supplierPack&&<small>Συσκευασία {fmt(r.supplierPack)} · ανάγκη {fmt(r.requiredQuantity)}</small>}
   <small>{r.orderSupplierName||'Χωρίς προμηθευτή'}</small>
   <small>{r.orderPackageCost!=null?`${fmt(r.orderPackageCost)} € / κιβώτιο ${fmt(r.supplierPack)}`:r.orderUnitCost==null?'Κόστος προς έλεγχο':`${fmt(r.orderUnitCost)} € / ${r.unitLabel}`} {r.orderUnitCost!=null&&'χωρίς ΦΠΑ'}</small>
   {r.orderUnitCost!=null&&finalByProduct.get(r.productId)&&<strong>{fmt(Math.round(finalByProduct.get(r.productId).suggestedQuantity*r.orderUnitCost*100)/100)} €</strong>}
   <button className="proposal-remove" type="button" disabled={sending} aria-label={`Αφαίρεση ${r.name}`} onClick={()=>removeLine(r)}>Αφαίρεση</button>
   {finalByProduct.get(r.productId)?.warnings?.includes('Η ποσότητα δεν είναι πολλαπλάσιο της γνωστής συσκευασίας.')&&<small>Έλεγξε τη συσκευασία με τον προμηθευτή.</small>}</>:<>{fmt(r.suggestedQuantity)} {r.unitLabel}</>}</td><td>{r.reason}{r.confirmedPendingStockQuantity>0&&<small>Επιβεβαιωμένο αναμενόμενο υπόλοιπο: {fmt(r.confirmedPendingStockQuantity)} {r.unitLabel}</small>}{r.pendingPurchaseReview?.map(review=><small key={review.status}>{review.status==='NEW'?'Πρόχειρες αγορές':'Προς τιμολόγηση'}: {review.orderCount} · {review.recordedStockQuantity==null?'Μετατροπή προς έλεγχο':`${fmt(review.recordedStockQuantity)} ${r.unitLabel} καταγεγραμμένα`}</small>)}{r.warnings.map(w=><small key={w}>{w}</small>)}</td></tr>)}</tbody></table>{!rows.length&&<p>Δεν υπάρχουν προτάσεις με αυτά τα κριτήρια.</p>}</div>}
 </section></div>,document.body)}</>;
}
