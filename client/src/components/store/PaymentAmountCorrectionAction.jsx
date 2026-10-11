import React,{useEffect,useRef,useState} from 'react';
import './payment-amount-correction.css';
const money=v=>Number(v).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
export default function PaymentAmountCorrectionAction({api,storeId,transactionId,onChanged}){
 const [open,setOpen]=useState(false),[context,setContext]=useState(null),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[allocations,setAllocations]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const version=useRef(0),pending=useRef(false),retry=useRef(null);
 useEffect(()=>{version.current++;setOpen(false);setContext(null);setBusy(false);pending.current=false;retry.current=null;return()=>{version.current++}},[storeId,transactionId]);
 const start=async()=>{
  if(pending.current)return;pending.current=true;const v=++version.current;setOpen(true);setBusy(true);setContext(null);setError('');setReason('');retry.current=null;
  try{const c=await api(`/api/transactions/stores/${encodeURIComponent(storeId)}/payments/${encodeURIComponent(transactionId)}/correction-context`);if(v!==version.current)return;if(c.storeId!==storeId||c.transactionId!==transactionId)throw Error('Η πληρωμή δεν αντιστοιχεί στο επιλεγμένο κατάστημα.');setContext(c);setAmount(String(c.amount));setAllocations(c.allocations||[])}catch(e){if(v===version.current)setError(e.message)}finally{if(v===version.current){pending.current=false;setBusy(false)}}
 };
 const submit=async event=>{
  event.preventDefault();if(pending.current||!context||context.storeId!==storeId)return;
  const value=Number(amount.replace(',','.')),reasonText=reason.trim();
  if(!Number.isFinite(value)||!value||reasonText.length<3){setError('Συμπλήρωσε έγκυρο νέο ποσό και αιτιολογία τουλάχιστον 3 χαρακτήρων.');return}
  const payload={amount:value,expectedAmount:context.amount,expectedCorrectionId:context.expectedCorrectionId,reason:reasonText,allocations:allocations.map(a=>({purchaseDocumentId:a.purchaseDocumentId,amount:Number(String(a.amount).replace(',','.'))}))};
  const signature=JSON.stringify(payload);if(retry.current?.signature!==signature)retry.current={signature,key:crypto.randomUUID()};
  pending.current=true;setBusy(true);setError('');const v=version.current;
  try{const result=await api(`/api/transactions/stores/${encodeURIComponent(storeId)}/payments/${encodeURIComponent(transactionId)}/correct-amount`,{method:'POST',body:JSON.stringify({...payload,idempotencyKey:retry.current.key})});if(v!==version.current)return;if(result.storeId!==storeId||result.transactionId!==transactionId)throw Error('Η απάντηση δεν αντιστοιχεί στην πληρωμή.');setOpen(false);setContext(null);onChanged?.(result)}catch(e){if(v===version.current)setError(e.message)}finally{if(v===version.current){pending.current=false;setBusy(false)}}
 };
 const changeAmount=value=>{setAmount(value);if(allocations.length===1)setAllocations([{...allocations[0],amount:value}])};
 const cashDelta=context&&Number.isFinite(Number(amount.replace(',','.')))?context.subtractFromShift?context.amount-Number(amount.replace(',','.')):0:null;
 return <><button type="button" className="payment-correction-action" onClick={start}>Διόρθωση πληρωμής</button>{open&&<div className="payment-correction-overlay"><form className="payment-correction-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Διόρθωση πληρωμής"><h2>Διόρθωση πληρωμής</h2>{error&&<div role="alert">{error}</div>}{context?<><p>{context.supplierName||context.description}</p><p>Αρχικό ποσό: <strong>{money(context.amount)}</strong></p><label>Νέο ποσό<input autoFocus inputMode="decimal" value={amount} onChange={e=>changeAmount(e.target.value)} disabled={busy} required/></label>{allocations.length>1&&allocations.map((a,i)=><label key={a.purchaseDocumentId}>Τιμολόγιο {a.documentNumber||a.purchaseDocumentId}<input inputMode="decimal" value={a.amount} disabled={busy} onChange={e=>setAllocations(rows=>rows.map((row,index)=>index===i?{...row,amount:e.target.value}:row))}/></label>)}<label>Αιτιολογία<textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={3} maxLength={500} disabled={busy} required/></label><p>Μεταβολή διαθέσιμων μετρητών: <strong>{cashDelta===null?'—':money(cashDelta)}</strong></p><small>Η αλλαγή καταγράφεται στα Συμβάντα. Συνδεδεμένη πληρωμή ή αποδεικτικό τίθεται ξανά προς έλεγχο.</small></>:busy?<p>Φόρτωση πληρωμής…</p>:null}<footer><button type="button" disabled={busy} onClick={()=>{version.current++;setOpen(false)}}>Κλείσιμο</button><button type="submit" disabled={busy||!context}>{busy?'Παρακαλώ περίμενε…':'Αποθήκευση διόρθωσης'}</button></footer></form></div>}</>;
}
