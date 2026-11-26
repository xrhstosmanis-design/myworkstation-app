import React,{useEffect,useRef,useState} from 'react';
const money=v=>Number(v||0).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
export default function ManualSupplierAllocation({item,request,onCancel,onSaved}){
 const base='/api/transactions/supplier-settlements/'+encodeURIComponent(item.id)+'/manual-allocation/';
 const [context,setContext]=useState(null),[supplier,setSupplier]=useState(''),[amounts,setAmounts]=useState({}),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[preview,setPreview]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const seq=useRef(0),saving=useRef(false);
 useEffect(()=>{const n=++seq.current;setBusy(true);setError('');setPreview(null);setAmounts({});request(base+'context'+(supplier?'?supplierId='+encodeURIComponent(supplier):'')).then(x=>{if(n===seq.current)setContext(x)}).catch(e=>{if(n===seq.current){setContext(null);setError(e.message)}}).finally(()=>{if(n===seq.current)setBusy(false)});return()=>{seq.current++}},[base,supplier,request]);
 const target=supplier||context?.payment?.supplierId||'',changed=!!context&&target!==context.payment.supplierId;
 const allocations=Object.entries(amounts).filter(([,v])=>Number(v)>0).map(([purchaseDocumentId,amount])=>({purchaseDocumentId,amount:Number(amount)}));
 const sum=allocations.reduce((n,a)=>n+Math.round(a.amount*100),0)/100;
 const invalid=Object.entries(amounts).some(([id,v])=>v!==''&&(!Number.isFinite(Number(v))||Number(v)<0||Math.abs(Number(v)*100-Math.round(Number(v)*100))>0.00001||Number(v)>(context?.documents.find(d=>d.id===id)?.availableAmount??0)));
 const ready=!!context&&!busy&&!invalid&&allocations.length>0&&allocations.length<=80&&sum<=context.payment.amount+.00001&&reason.trim().length>=5&&(!changed||confirmed);
 function edit(fn){setPreview(null);fn()}
 async function submit(apply){
  if(saving.current||!ready||apply&&(!preview||preview.status!=='CONFIRMED'))return;
  saving.current=true;setBusy(true);setError('');
  try{
   const body={companyId:context.payment.companyId,storeId:context.payment.storeId,targetSupplierId:target,allocations,confirmSupplierChange:confirmed,reason:reason.trim(),...(apply?{expectedVersion:preview.version}:{})};
   const result=await request(base+(apply?'apply':'preview'),{method:'POST',body:JSON.stringify(body)});
   if(apply){onSaved(result);return}setPreview(result);
  }catch(e){setPreview(null);setError(e.message)}finally{saving.current=false;setBusy(false)}
 }
 return <section className="supplier-review-note" aria-label="Αντιστοίχιση υπάρχουσας πληρωμής">
  <h3>Αντιστοίχιση πληρωμής — {money(item.amount)}</h3>
  <p>Συνδέεται η υπάρχουσα πληρωμή. Δεν δημιουργείται νέα εκταμίευση ή κίνηση αποθήκης.</p>
  {error&&<div role="alert" className="platform-alert error">{error}</div>}
  {busy&&!context&&<p>Φόρτωση…</p>}
  {context&&<>
   <label>Προμηθευτής<select disabled={busy} value={target} onChange={e=>edit(()=>{setConfirmed(false);setSupplier(e.target.value)})}>{context.suppliers.map(s=><option key={s.id} value={s.id}>{s.name} — {s.taxId||'Χωρίς ΑΦΜ'}</option>)}</select></label>
   {changed&&<label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>edit(()=>setConfirmed(e.target.checked))}/> Επιβεβαιώνω ότι η πληρωμή αφορά τον επιλεγμένο προμηθευτή.</label>}
   <p>Επιλέξτε τα τιμολόγια και καταχωρίστε ποσό μέχρι το διαθέσιμο υπόλοιπο.</p>
   {!context.documents.length&&<p>Δεν βρέθηκαν διαθέσιμα τιμολόγια.</p>}
   {context.documents.map(d=><div key={d.id}><label><input type="checkbox" disabled={busy} checked={Object.hasOwn(amounts,d.id)} onChange={e=>edit(()=>setAmounts(old=>{const next={...old};if(e.target.checked)next[d.id]=String(Math.min(d.availableAmount,Math.max(0,Math.round((context.payment.amount-sum)*100)/100)));else delete next[d.id];return next}))}/> {d.documentNumber} · {String(d.documentDate||'').slice(0,10)} · υπόλοιπο {money(d.availableAmount)}</label>{Object.hasOwn(amounts,d.id)&&<label>Ποσό<input type="number" min="0" max={d.availableAmount} step="0.01" disabled={busy} value={amounts[d.id]} onChange={e=>edit(()=>setAmounts(old=>({...old,[d.id]:e.target.value})))}/></label>}</div>)}
   <label>Αιτιολογία<textarea disabled={busy} maxLength={500} value={reason} onChange={e=>edit(()=>setReason(e.target.value))}/></label>
   <p>Πληρωμή: {money(context.payment.amount)} · Κατανομή: {money(sum)} · Διαφορά: {money(context.payment.amount-sum)}</p>
   {preview&&<p role="status">Έλεγχος: {preview.status==='CONFIRMED'?'Επιβεβαίωση':'Απαιτείται χωριστός έλεγχος'} — διαφορά {money(preview.difference)}.</p>}
   <button type="button" disabled={!ready} onClick={()=>submit(false)}>Προεπισκόπηση</button>
   <button type="button" disabled={!ready||preview?.status!=='CONFIRMED'} onClick={()=>submit(true)}>Αποθήκευση αντιστοίχισης</button>
  </>}
  <button type="button" disabled={busy&&!!context} onClick={onCancel}>Κλείσιμο</button>
 </section>
}
