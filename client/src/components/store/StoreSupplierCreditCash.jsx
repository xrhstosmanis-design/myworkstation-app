import './store-supplier-credit-cash.css';
import React,{useEffect,useRef,useState} from 'react';
const euro=v=>Number(v||0).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
const date=v=>new Date(v).toLocaleDateString('el-GR',{timeZone:'Europe/Athens'});

export default function StoreSupplierCreditCash({api,store,suppliers=[],allowCash=true,onChanged,onCompleted,setMessage}){
 const [supplierId,setSupplierId]=useState(''),[context,setContext]=useState(null),[creditId,setCreditId]=useState(''),[paymentId,setPaymentId]=useState(''),[mode,setMode]=useState('OFFSET'),[confirmed,setConfirmed]=useState(false),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 const request=useRef(null),active=useRef(true),callbacks=useRef({api,onChanged,onCompleted,setMessage}),submitting=useRef(false);
 callbacks.current={api,onChanged,onCompleted,setMessage};
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 useEffect(()=>{
  let cancelled=false;setContext(null);setCreditId('');setPaymentId('');setConfirmed(false);setError('');setLoading(false);
  if(!supplierId||!allowCash)return;
  setLoading(true);
  callbacks.current.api(`/api/transactions/stores/${encodeURIComponent(store.id)}/supplier-credit-cash?supplierId=${encodeURIComponent(supplierId)}`).then(data=>{if(!cancelled)setContext(data)}).catch(e=>{if(!cancelled)setError(e.message)}).finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[store.id,supplierId,allowCash]);
 useEffect(()=>{request.current=null;setConfirmed(false)},[store.id,supplierId,creditId,paymentId,mode]);
 const credit=context?.credits?.find(c=>c.id===creditId),payment=context?.payments?.find(p=>p.id===paymentId);
 const net=payment&&credit?(Math.round(payment.remainingAmount*100)-Math.round(credit.totalGross*100))/100:null;
 const ready=Boolean(allowCash&&credit&&confirmed&&reason.trim().length>=3&&!loading&&!busy&&(mode==='CASH_RETURN'||payment&&net>=0));
 const submit=async event=>{
  event.preventDefault();if(!ready||submitting.current)return;
  submitting.current=true;setBusy(true);setError('');
  const body={type:'SUPPLIER_PAYMENT',paymentSource:'CASH_SHIFT',supplierId,creditDocumentId:credit.id,mode,invoicePaymentId:mode==='OFFSET'?payment.id:null,expectedCreditAmount:credit.totalGross,expectedCreditUpdatedAt:credit.updatedAt,expectedCreditVersion:credit.version,expectedPaymentAmount:mode==='OFFSET'?payment.amount:null,expectedAppliedAmount:mode==='OFFSET'?payment.appliedAmount:0,confirmOriginal:true,reason:reason.trim()};
  const signature=JSON.stringify(body);if(request.current?.signature!==signature)request.current={signature,key:crypto.randomUUID()};
  try{
   const result=await callbacks.current.api(`/api/transactions/stores/${encodeURIComponent(store.id)}/supplier-credit-cash`,{method:'POST',body:JSON.stringify({...body,idempotencyKey:request.current.key})});
   if(!active.current)return;
   if(mode==='CASH_RETURN'&&!result.duplicate)try{window.dispatchEvent(new window.CustomEvent('myworkstation:cash-drawer-request',{detail:{reason:'SUPPLIER_CREDIT_RETURN',amount:result.creditAmount,storeId:store.id,transactionId:result.transactionId}}))}catch{}
   callbacks.current.setMessage?.(mode==='OFFSET'?`✅ Συμψηφίστηκε πιστωτικό ${euro(result.creditAmount)}. Καθαρά μετρητά προς προμηθευτή: ${euro(result.netCashAmount)}. Η αρχική πληρωμή και τα παραστατικά διατηρήθηκαν.`:`✅ Καταγράφηκε επιστροφή προμηθευτή ${euro(result.creditAmount)} στο ταμείο της βάρδιας.`);
   callbacks.current.onChanged?.();callbacks.current.onCompleted?.();
  }catch(e){if(active.current)setError(e.message)}finally{if(active.current)setBusy(false);submitting.current=false}
 };
 return <form className="pos-payment-form pos-credit-cash-form" onSubmit={submit}>
  <h3>Πιστωτικά / επιστροφές προμηθευτή</h3>
  <p>Η λήψη πιστωτικού μειώνει την οφειλή. Εδώ καταγράφεις μόνο συμφωνημένο συμψηφισμό ή μετρητά που επέστρεψε ο προμηθευτής.</p>
  {!allowCash&&<div role="alert">Απαιτείται ενεργή βάρδια και δικαίωμα πληρωμών από το ίδιο ταμείο.</div>}
  {error&&<div role="alert" style={{padding:12,background:'#fee2e2',fontWeight:800}}>{error}</div>}
  <label>Προμηθευτής<select aria-label="Προμηθευτής πιστωτικού" value={supplierId} disabled={busy} onChange={e=>setSupplierId(e.target.value)}><option value="">Επίλεξε προμηθευτή</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
  {loading&&<p role="status">Έλεγχος διαθέσιμων πιστωτικών και πληρωμών…</p>}
  {context&&<>
   <label>Πιστωτικό<select aria-label="Διαθέσιμο πιστωτικό" value={creditId} disabled={busy} onChange={e=>setCreditId(e.target.value)}><option value="">Επίλεξε το πρωτότυπο πιστωτικό</option>{context.credits.map(c=><option key={c.id} value={c.id}>{c.documentNumber} · {date(c.documentDate)} · {euro(c.totalGross)}</option>)}</select></label>
   {!context.credits.length&&<p>Δεν υπάρχουν διαθέσιμα πιστωτικά με ολοκληρωμένη ανάγνωση. Καταχώρισε πρώτα το πιστωτικό από «Νέο τιμολόγιο» και περίμενε να ολοκληρωθεί η ανάγνωση.</p>}
   <label>Χρήση πιστωτικού<select aria-label="Χρήση πιστωτικού" value={mode} disabled={busy} onChange={e=>setMode(e.target.value)}><option value="OFFSET">Συμψηφισμός με πληρωμή τιμολογίου</option><option value="CASH_RETURN">Επιστροφή μετρητών στο ταμείο</option></select></label>
   {mode==='OFFSET'&&<label>Αρχική πληρωμή τιμολογίου<select aria-label="Αρχική πληρωμή για συμψηφισμό" value={paymentId} disabled={busy} onChange={e=>setPaymentId(e.target.value)}><option value="">Επίλεξε την πληρωμή της ίδιας βάρδιας</option>{context.payments.filter(p=>p.remainingAmount>0).map(p=><option key={p.id} value={p.id}>{p.documentNumber} · {euro(p.amount)} · διαθέσιμα {euro(p.remainingAmount)}</option>)}</select></label>}
   {credit&&<div role="status" style={{padding:14,background:'#e9f8f1',fontSize:20,fontWeight:900}}>
    <div>Πιστωτικό / αρνητική πληρωμή: {euro(-credit.totalGross)}</div>
    {mode==='OFFSET'&&payment?<><div>Αρχική πληρωμή: {euro(payment.amount)}</div>{payment.appliedAmount>0&&<div>Προηγούμενα πιστωτικά: {euro(payment.appliedAmount)}</div>}<div>Καθαρά μετρητά προς προμηθευτή: {euro(net)}</div>{net<0&&<div role="alert">Το πιστωτικό υπερβαίνει το διαθέσιμο υπόλοιπο.</div>}<small>Η αρνητική κίνηση διορθώνει τη συνολική εκροή. Η αρχική πληρωμή διατηρείται.</small></>:mode==='CASH_RETURN'?<div>Πραγματικά μετρητά που μπαίνουν στο συρτάρι: {euro(credit.totalGross)}</div>:null}
   </div>}
   <label className="credit-cash-reason">Αιτιολογία<textarea aria-label="Αιτιολογία πιστωτικού" value={reason} disabled={busy} onChange={e=>setReason(e.target.value)} required minLength={3}/></label>
   <label className="pos-check"><input type="checkbox" checked={confirmed} disabled={busy||!credit} onChange={e=>setConfirmed(e.target.checked)}/><span>{mode==='OFFSET'?'Έλεγξα το πρωτότυπο πιστωτικό και την αρχική πληρωμή. Ο προμηθευτής έλαβε το εμφανιζόμενο καθαρό ποσό.':'Έλεγξα το πρωτότυπο πιστωτικό, παρέλαβα τα μετρητά και τα έβαλα στο συρτάρι της ενεργής βάρδιας.'}</span></label>
   <button type="submit" className="pos-primary-action" disabled={!ready}>{busy?'Καταχώριση…':mode==='OFFSET'?'ΚΑΤΑΧΩΡΙΣΗ ΣΥΜΨΗΦΙΣΜΟΥ ΠΙΣΤΩΤΙΚΟΥ':'ΚΑΤΑΧΩΡΙΣΗ ΕΠΙΣΤΡΟΦΗΣ ΜΕΤΡΗΤΩΝ'}</button>
  </>}
 </form>;
}
