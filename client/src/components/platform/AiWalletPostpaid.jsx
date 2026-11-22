import React,{useEffect,useRef,useState} from 'react';
import AiWalletDebtSummary from '../voice/AiWalletDebtSummary.jsx';
import {walletMoney,walletMicrosFromEuros} from '../voice/ai-wallet-money.mjs';

export default function AiWalletPostpaid({companyId,version,stores=[],summary,busy,api,onGrant,onPay}){
 const [storeId,setStoreId]=useState(''),[source,setSource]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [amount,setAmount]=useState(''),[reference,setReference]=useState(''),[reason,setReason]=useState(''),[send,setSend]=useState(true),[confirmed,setConfirmed]=useState(false);
 const [creditId,setCreditId]=useState(''),[payment,setPayment]=useState(''),[receipt,setReceipt]=useState(''),[paid,setPaid]=useState(false);
 const generation=useRef(0),submitting=useRef(false);
 useEffect(()=>{
  const epoch=++generation.current,controller=new AbortController();setSource(null);setError('');setLoading(Boolean(storeId));
  if(storeId)api(`/api/ai-wallet/platform/companies/${encodeURIComponent(companyId)}/postpaid-recipients?storeId=${encodeURIComponent(storeId)}`,{cache:'no-store',signal:controller.signal}).then(value=>{
   if(epoch!==generation.current||controller.signal.aborted)return;
   if(value.storeId!==storeId)throw Error('Το κατάστημα άλλαξε.');setSource(value);
  }).catch(e=>{if(epoch===generation.current&&!controller.signal.aborted)setError(e.message)}).finally(()=>{if(epoch===generation.current)setLoading(false)});
  return()=>{generation.current++;controller.abort()};
 },[api,companyId,storeId]);
 const submit=async(kind)=>{
  if(submitting.current||busy)return;setError('');
  try{
   const body=kind==='grant'?{version,storeId,generation:source?.generation,amountMicros:walletMicrosFromEuros(amount),reference:reference.trim(),reason:reason.trim(),sendNotifications:send,recipientFingerprint:send?source?.fingerprint:null,unpaidCreditConfirmed:confirmed}:{version,creditEntryId:creditId,amountMicros:walletMicrosFromEuros(payment),receiptReference:receipt.trim(),receiptConfirmed:paid};
   submitting.current=true;await(kind==='grant'?onGrant(body):onPay(body));
  }catch(e){setError(e.message)}finally{submitting.current=false}
 };
 const unpaid=(summary?.grants||[]).filter(g=>g.status!=='PAID');
 return <section aria-label="Πίστωση AI επί πιστώσει">
  <h2>Πίστωση AI επί πιστώσει</h2>
  <p>Το ποσό γίνεται διαθέσιμο για χρήση AI και καταγράφεται ως οφειλή προς εξόφληση. Δεν καταχωρίζεται ως είσπραξη ή δωρεάν παροχή. Οι τιμές χρήσης παραμένουν ίδιες.</p>
  <p>Το υπόλοιπο και η οφειλή AI αφορούν όλα τα καταστήματα της επιλεγμένης εταιρείας. Το κατάστημα παρακάτω επιλέγει τους παραλήπτες της ενημέρωσης.</p>
  <AiWalletDebtSummary summary={summary}/>
  {error&&<p role="alert">{error}</p>}
  <form aria-label="Νέα πίστωση AI επί πιστώσει" onSubmit={e=>{e.preventDefault();submit('grant')}}>
   <label>Κατάστημα παραληπτών ενημέρωσης<select value={storeId} disabled={busy} required onChange={e=>setStoreId(e.target.value)}><option value="">Επίλεξε κατάστημα</option>{stores.filter(s=>s.active!==false).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   {loading&&<p>Ανάγνωση εγκεκριμένων παραληπτών…</p>}
   {source&&<div aria-label="Παραλήπτες ενημέρωσης πίστωσης"><strong>{source.storeName}</strong>{source.recipients.length?<ul>{source.recipients.map(r=><li key={r.recipientId}>{r.email}</li>)}</ul>:<p>Δεν υπάρχουν ενεργοί εγκεκριμένοι παραλήπτες στις αναφορές αυτού του καταστήματος.</p>}</div>}
   <label>Ποσό AI επί πιστώσει (€)<input inputMode="decimal" value={amount} disabled={busy} required onChange={e=>setAmount(e.target.value)}/></label>
   <label>Μοναδική αναφορά πίστωσης<input value={reference} disabled={busy} minLength={5} maxLength={160} required onChange={e=>setReference(e.target.value)}/></label>
   <label>Αιτιολογία πίστωσης<input value={reason} disabled={busy} minLength={5} maxLength={300} required onChange={e=>setReason(e.target.value)}/></label>
   <label><input type="checkbox" checked={send} disabled={busy} onChange={e=>setSend(e.target.checked)}/>Ενημέρωση email στους παραπάνω εγκεκριμένους παραλήπτες για την πίστωση και την οφειλή AI της εταιρείας</label>
   <p>Το email θα αναφέρει το πιστωμένο ποσό και ότι εκκρεμεί η εξόφλησή του. Η παράδοση ελέγχεται χωριστά.</p>
   <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>Εγκρίνω διαθέσιμο υπόλοιπο AI με υποχρέωση εξόφλησης.</label>
   <button disabled={busy||!confirmed||!storeId||loading||!source||send&&!source.recipients.length}>Καταχώριση πίστωσης επί πιστώσει</button>
  </form>
  {unpaid.length>0&&<form aria-label="Εξόφληση οφειλής AI" onSubmit={e=>{e.preventDefault();submit('pay')}}>
   <h3>Καταχώριση είσπραξης για οφειλή AI</h3>
   <label>Πίστωση προς εξόφληση<select value={creditId} disabled={busy} required onChange={e=>setCreditId(e.target.value)}><option value="">Επίλεξε ανεξόφλητη πίστωση</option>{unpaid.map(g=><option key={g.id} value={g.id}>{g.reference} · οφείλεται {walletMoney(g.outstandingMicros)}</option>)}</select></label>
   <label>Ποσό εξόφλησης (€)<input inputMode="decimal" value={payment} disabled={busy} required onChange={e=>setPayment(e.target.value)}/></label>
   <label>Μοναδική αναφορά είσπραξης οφειλής<input value={receipt} disabled={busy} minLength={5} maxLength={160} required onChange={e=>setReceipt(e.target.value)}/></label>
   <label><input type="checkbox" checked={paid} disabled={busy} onChange={e=>setPaid(e.target.checked)}/>Επιβεβαίωσα την είσπραξη για την επιλεγμένη οφειλή AI.</label>
   <p>Επιτρέπεται μερική εξόφληση. Το διαθέσιμο υπόλοιπο AI δεν πιστώνεται δεύτερη φορά.</p>
   <button disabled={busy||!paid||!creditId}>Καταχώριση εξόφλησης AI</button>
  </form>}
 </section>;
}
