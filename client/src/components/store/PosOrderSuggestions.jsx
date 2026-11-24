import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './pos-order-suggestions.css';
const fmt=x=>x==null?'—':Number(x).toLocaleString('el-GR',{maximumFractionDigits:3});
export default function PosOrderSuggestions({api,store,operator,open,onOpen,onClose}){
 const [allowed,setAllowed]=useState(false),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[q,setQ]=useState('');
 const generation=useRef(0),closeRef=useRef(onClose);closeRef.current=onClose;
 useEffect(()=>{const id=++generation.current;let live=true;setAllowed(false);setData(null);setError('');setQ('');
  const check=()=>api(`/api/pos-order-suggestions/stores/${encodeURIComponent(store.id)}/permission`).then(r=>{if(!live||generation.current!==id)return;if(r.storeId!==store.id||r.allowed!==true)throw Error('Δεν επιβεβαιώθηκε το δικαίωμα.');setAllowed(true)}).catch(()=>{if(live&&generation.current===id){setAllowed(false);setData(null);closeRef.current()}});
  check();const timer=setInterval(check,15000);window.addEventListener('focus',check);
  return()=>{live=false;generation.current++;clearInterval(timer);window.removeEventListener('focus',check)};
 },[api,store.id,operator]);
 useEffect(()=>{setData(null);setError('');if(!open||!allowed){setBusy(false);return;}let live=true;const id=generation.current;setBusy(true);
  api(`/api/pos-order-suggestions/stores/${encodeURIComponent(store.id)}/proposal`).then(r=>{if(!live||id!==generation.current)return;if(r.storeId!==store.id||!Array.isArray(r.rows))throw Error('Δεν επιβεβαιώθηκε το κατάστημα.');setData(r)}).catch(e=>{if(live&&id===generation.current)setError(e.message)}).finally(()=>{if(live&&id===generation.current)setBusy(false)});
  return()=>{live=false};
 },[api,store.id,open,allowed]);
 if(!allowed)return null;
 const rows=data?.rows?.filter(r=>(r.suggestedQuantity>0||r.suggestedQuantity==null)&&`${r.name} ${r.sku||''}`.toLocaleLowerCase('el-GR').includes(q.toLocaleLowerCase('el-GR')))||[];
 return <><button type="button" className="store-chat-top-button" onClick={onOpen}>✣ Πρόταση παραγγελίας</button>{open&&createPortal(<div className="pos-order-proposals-overlay"><section role="dialog" aria-modal="true" aria-label="Πρόταση παραγγελίας" className="pos-order-proposals-window"><header><div><h2>Πρόταση παραγγελίας</h2><p>{store.name} · μόνο το κατάστημα αυτού του POS</p></div><button type="button" onClick={onClose}>Επιστροφή στο POS</button></header><p>Πρόταση για έλεγχο, χωρίς αποστολή παραγγελίας. Ιστορικό 28 ημερών, κάλυψη 7 και παράδοση 3 ημερών. Αφαιρούνται οι επιβεβαιωμένες αναμενόμενες παραλαβές.</p><input aria-label="Αναζήτηση πρότασης" placeholder="Όνομα ή κωδικός" value={q} onChange={e=>setQ(e.target.value)}/>{busy&&<p role="status">Υπολογισμός…</p>}{error&&<p role="alert">{error}</p>}{data?.expectedReceipts?.available===false&&<p role="status">Οι αναμενόμενες παραλαβές δεν είναι διαθέσιμες στον υπολογισμό. Έλεγξέ τες πριν παραγγείλεις.</p>}{data&&<div className="pos-order-proposals-scroll"><table><thead><tr><th>Είδος</th><th>Απόθεμα</th><th>Alarm</th><th>Πρόταση</th><th>Έλεγχος</th></tr></thead><tbody>{rows.map(r=><tr key={r.productId}><td>{r.name}<small>{r.sku}</small></td><td>{fmt(r.currentStock)}</td><td>{fmt(r.minStock)}</td><td>{fmt(r.suggestedQuantity)} {r.unitLabel}</td><td>{r.reason}{r.confirmedPendingStockQuantity>0&&<small>Επιβεβαιωμένο αναμενόμενο υπόλοιπο: {fmt(r.confirmedPendingStockQuantity)} {r.unitLabel}</small>}{r.pendingPurchaseReview?.map(review=><small key={review.status}>{review.status==='NEW'?'Πρόχειρες αγορές':'Προς τιμολόγηση'}: {review.orderCount} · {review.recordedStockQuantity==null?'Μετατροπή προς έλεγχο':`${fmt(review.recordedStockQuantity)} ${r.unitLabel} καταγεγραμμένα`}</small>)}{r.warnings.map(w=><small key={w}>{w}</small>)}</td></tr>)}</tbody></table>{!rows.length&&<p>Δεν υπάρχουν προτάσεις με αυτά τα κριτήρια.</p>}</div>}</section></div>,document.body)}</>;
}
