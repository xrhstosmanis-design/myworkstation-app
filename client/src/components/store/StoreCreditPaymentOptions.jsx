import React,{useEffect,useRef,useState} from 'react';
const euro=v=>Number(v||0).toLocaleString('el-GR',{style:'currency',currency:'EUR'});

export default function StoreCreditPaymentOptions({api,storeId,supplierId,amount,original,busy,onChange}){
 const [mode,setMode]=useState(''),[payments,setPayments]=useState([]),[paymentId,setPaymentId]=useState(''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const callback=useRef(onChange);callback.current=onChange;
 useEffect(()=>{
  let cancelled=false;setPayments([]);setPaymentId('');setConfirmed(false);setError('');setLoading(false);
  if(!supplierId)return;
  setLoading(true);
  api(`/api/transactions/stores/${encodeURIComponent(storeId)}/supplier-credit-cash?supplierId=${encodeURIComponent(supplierId)}`).then(c=>{if(!cancelled)setPayments(c.payments)}).catch(e=>{if(!cancelled)setError(e.message)}).finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[api,storeId,supplierId]);
 const payment=payments.find(p=>p.id===paymentId),net=payment?(Math.round(payment.remainingAmount*100)-Math.round(amount*100))/100:null;
 useEffect(()=>{setConfirmed(false)},[mode,paymentId,amount,original]);
 useEffect(()=>{callback.current({mode,payment,reason,confirmed,original,valid:mode==='BALANCE'||Boolean(!loading&&!error&&confirmed&&reason.trim().length>=3&&(mode==='CASH_RETURN'||mode==='OFFSET'&&payment&&net>=0))})},[mode,payment,reason,confirmed,loading,error,net,original]);
 return <section aria-label="Πληρωμή πιστωτικού" style={{padding:14,background:'#e9f8f1',fontSize:18}}>
  <strong style={{fontSize:24}}>Πιστωτικό / αρνητική πληρωμή: {euro(-amount)}</strong>
  <label>Χρήση πιστωτικού<select aria-label="Τρόπος αρνητικής πληρωμής" disabled={busy} value={mode} onChange={e=>setMode(e.target.value)}><option value="">Επίλεξε τι έγινε με τα χρήματα</option><option value="OFFSET">Συμψηφισμός με πληρωμή τιμολογίου</option><option value="CASH_RETURN">Επιστροφή μετρητών στο ταμείο</option><option value="BALANCE">Μόνο υπόλοιπο προμηθευτή — χωρίς κίνηση ταμείου</option></select></label>
  {mode&&mode!=='BALANCE'&&<>
   {loading&&<p role="status">Έλεγχος ενεργής βάρδιας και πληρωμών…</p>}{error&&<p role="alert">{error}</p>}
   {mode==='OFFSET'&&<label>Αρχική πληρωμή<select aria-label="Πληρωμή για άμεσο συμψηφισμό" disabled={busy||loading} value={paymentId} onChange={e=>setPaymentId(e.target.value)}><option value="">Επίλεξε την πληρωμή της ίδιας βάρδιας</option>{payments.filter(p=>p.remainingAmount>0).map(p=><option key={p.id} value={p.id}>{p.documentNumber} · {euro(p.amount)} · διαθέσιμα {euro(p.remainingAmount)}</option>)}</select></label>}
   {mode==='OFFSET'&&payment&&<p role="status"><b>Καθαρά προς προμηθευτή: {euro(net)}</b>{net<0&&' — Το πιστωτικό υπερβαίνει το διαθέσιμο υπόλοιπο.'}</p>}
   <label>Αιτιολογία<textarea aria-label="Αιτιολογία άμεσης αρνητικής πληρωμής" disabled={busy} value={reason} onChange={e=>setReason(e.target.value)} minLength={3} maxLength={500}/></label>
   <label><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{mode==='OFFSET'?' Έλεγξα το πιστωτικό και την αρχική πληρωμή. Ο προμηθευτής έλαβε το εμφανιζόμενο καθαρό ποσό.':' Παρέλαβα τα μετρητά του πιστωτικού και τα έβαλα στο συρτάρι της ενεργής βάρδιας.'}</label>
  </>}
  <p>Το ίδιο πρόχειρο θα ελεγχθεί στο BackOffice. Απόθεμα αφαιρείται μόνο κατά την τελική καταχώριση των ελεγμένων προϊόντων.</p>
 </section>;
}
