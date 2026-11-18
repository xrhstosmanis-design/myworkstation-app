import React,{useEffect,useRef,useState} from 'react';
const euro=cents=>new Intl.NumberFormat('el-GR',{style:'currency',currency:'EUR'}).format(cents/100);
export const cashReturnStorageKey=(storeId,actorId)=>`mws-scanned-cash-return:${storeId}:${actorId||'owner'}`;
export function pendingCashReturn(storeId,actorId){try{return Boolean(sessionStorage.getItem(cashReturnStorageKey(storeId,actorId)))}catch{return false}}
export default function PosScannedCashReturn({api,storeId,actorId,cart,onClose,onCompleted}){
 const key=cashReturnStorageKey(storeId,actorId),saved=useRef(null),alive=useRef(true),lock=useRef(false);
 if(saved.current===null){try{saved.current=JSON.parse(sessionStorage.getItem(key)||'null')||false}catch{saved.current=false}}
 const [quote,setQuote]=useState(saved.current?.quote||null),[payload,setPayload]=useState(saved.current?.payload||null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const items=useRef(cart.map(row=>({productId:row.productId||row.id,quantity:Number(row.quantity),barcode:row.scannedBarcode||null})));
 useEffect(()=>{alive.current=true;let current=true;if(!saved.current){setBusy(true);api(`/api/store-pos/stores/${encodeURIComponent(storeId)}/cash-returns/quote`,{method:'POST',body:JSON.stringify({items:items.current})}).then(r=>{if(current)setQuote(r)}).catch(e=>{if(current)setError(e.message)}).finally(()=>{if(current)setBusy(false)})}return()=>{current=false;alive.current=false}},[api,storeId]);
 const finish=async(cancel=false)=>{
  if(lock.current||(!quote&&!payload))return;lock.current=true;setBusy(true);setError('');
  let body=payload;
  try{
   if(!body){body={items:items.current,requestId:crypto.randomUUID(),quoteHash:quote.quoteHash,sessionId:quote.sessionId,confirmed:true};sessionStorage.setItem(key,JSON.stringify({payload:body,quote}));setPayload(body)}
   const result=await api(`/api/store-pos/stores/${encodeURIComponent(storeId)}/cash-returns${cancel?'/cancel':''}`,{method:'POST',body:JSON.stringify(body)});
   sessionStorage.removeItem(key);
   if(alive.current){if(result.cancelled)onClose();else onCompleted({...result,returnedItems:body.items})}
  }catch(e){if(alive.current)setError(`${e.message}${body?' Η επιστροφή χρειάζεται έλεγχο. Πάτησε ξανά Τέλος ή Ακύρωση για ασφαλή ολοκλήρωση.':''}`)}finally{lock.current=false;if(alive.current)setBusy(false)}
 };
 const close=()=>{if(busy)return;if(payload)finish(true);else onClose()};
 return <div className="category-product-overlay pos-price-modal" role="dialog" aria-modal="true" aria-label="Επιστροφή πελάτη με μετρητά"><section><header><div><small>ΕΠΙΣΤΡΟΦΗ ΠΕΛΑΤΗ</small><h2>Επιστροφή με μετρητά</h2></div><button type="button" disabled={busy} onClick={close}>×</button></header><div className="pos-price-body" style={{maxHeight:"65vh",overflowY:"auto"}}>{error&&<p role="alert">{error}</p>}{quote&&<><ul>{quote.items.map((row,i)=><li key={`${row.productId}:${i}`}>{row.quantity} × {row.name} — {euro(row.totalCents)}</li>)}</ul><p>Δίνεις στον πελάτη <strong>{euro(quote.refundCents)} μετρητά</strong>.</p><p>Τα προϊόντα επιστρέφουν στο απόθεμα και το ποσό αφαιρείται από τα μετρητά αυτής της βάρδιας. Δεν χρειάζεται καταχώριση στα λοιπά έξοδα.</p></>}<div className="pos-price-buttons"><button type="button" disabled={busy} onClick={close}>Ακύρωση</button><button type="button" disabled={busy||!quote} onClick={()=>finish(false)}>{busy?'Έλεγχος…':'Τέλος'}</button></div></div></section></div>;
}
