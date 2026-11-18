import {expectedReceiptProduct} from '../../../../shared/supplier-expected-receipts.mjs';
import React,{useEffect,useRef,useState} from 'react';

const number=value=>{
  const text=String(value??'');
  if(!/^-?\d+(?:\.\d+)?$/.test(text))return '—';
  const [whole,fraction='']=text.split('.');
  return BigInt(whole).toLocaleString('el-GR')+(fraction?','+fraction:'');
};
export default function ExpectedReceiptsPanel({api,storeId,products,onChanged,onClose}){
  const generation=useRef(0),operation=useRef(null);
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selection,setSelection]=useState(null),[candidates,setCandidates]=useState(null);
  const [form,setForm]=useState({productId:'',supplierId:'',invoiceQuantity:'',invoiceUnit:'ΤΜΧ',stockUnitsPerInvoiceUnit:'1'});
  const [link,setLink]=useState({orderId:'',quantity:''}),[reason,setReason]=useState('');
  const load=async(token)=>{
    const result=await api(`/api/commerce/expected-receipts?${new URLSearchParams({storeId})}`);
    if(token===generation.current){if(result.storeId!==storeId)throw Error('Το κατάστημα άλλαξε.');setData(result);}
  };
  useEffect(()=>{
    const token=++generation.current;setData(null);setSelection(null);setCandidates(null);operation.current=null;setError('');setBusy(true);
    load(token).catch(e=>{if(token===generation.current)setError(e.message)}).finally(()=>{if(token===generation.current)setBusy(false)});
    return()=>{generation.current++};
  },[storeId,api]);
  const mutate=async(path,body)=>{
    const token=generation.current;
    const payload=JSON.stringify({path,body});
    if(operation.current?.payload!==payload)operation.current={payload,key:crypto.randomUUID()};
    setBusy(true);setError('');
    try{
      await api(path,{method:'POST',body:JSON.stringify({...body,storeId,idempotencyKey:operation.current.key})});
      if(token!==generation.current)return;
      setSelection(null);setCandidates(null);setReason('');
      await load(token);
      if(token===generation.current)operation.current=null;
      if(token===generation.current)onChanged();
    }catch(e){if(token===generation.current)setError(e.message||'Δεν ολοκληρώθηκε η ενέργεια. Επανάλαβε με τα ίδια στοιχεία.');}
    finally{if(token===generation.current)setBusy(false)}
  };
  const choose=async(row)=>{
    const token=++generation.current;setSelection(row);setCandidates(null);setLink({orderId:'',quantity:''});setReason('');setError('');setBusy(true);
    try{
      const result=await api(`/api/commerce/expected-receipts/candidates?${new URLSearchParams({storeId,expectedId:row.id})}`);
      if(token===generation.current){if(result.storeId!==storeId||result.expectedId!==row.id)throw Error('Η επιλογή άλλαξε.');setCandidates(result);}
    }catch(e){if(token===generation.current)setError(e.message)}finally{if(token===generation.current)setBusy(false)}
  };
  const product=products.find(item=>item.productId===form.productId);
  const candidate=candidates?.rows.find(row=>row.orderId===link.orderId);
  return <section aria-label="Αναμενόμενες παραλαβές" aria-busy={busy}>
    <header><h3>Αναμενόμενες παραλαβές</h3><button type="button" onClick={onClose}>Κλείσιμο</button></header>
    <p>Επιβεβαίωσε ποσότητες που αναμένεις από προμηθευτή. Σύνδεσε την παραλαβή με αγορά που έχει ήδη ενημερώσει το απόθεμα.</p>
    <p>{data?.sourceSupportNote||'Οι αυτόνομες αγορές εκτός παραγγελίας χρειάζονται χωριστό έλεγχο και δεν προσφέρονται για σύνδεση εδώ.'}</p>
    {error&&<p role="alert">{error}</p>}
    {data?.canWrite&&<form onSubmit={event=>{event.preventDefault();mutate('/api/commerce/expected-receipts',form)}}>
      <label>Είδος<select required value={form.productId} onChange={e=>setForm({...form,productId:e.target.value})}><option value="">Επίλεξε είδος</option>{products.map(row=><option key={row.productId} value={row.productId}>{row.name} · {row.unitLabel}</option>)}</select></label>
      <label>Προμηθευτής<select required value={form.supplierId} onChange={e=>setForm({...form,supplierId:e.target.value})}><option value="">Επίλεξε προμηθευτή</option>{data.suppliers.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>Ποσότητα αγοράς<input required type="number" min="0.000001" max="999999999.999999" step="0.000001" value={form.invoiceQuantity} onChange={e=>setForm({...form,invoiceQuantity:e.target.value})}/></label>
      <label>Μονάδα αγοράς<input required maxLength="30" value={form.invoiceUnit} onChange={e=>setForm({...form,invoiceUnit:e.target.value})}/></label>
      <label>Μονάδες αποθήκης ανά μονάδα αγοράς<input required type="number" min="0.000001" max="999999999.999999" step="0.000001" value={form.stockUnitsPerInvoiceUnit} onChange={e=>setForm({...form,stockUnitsPerInvoiceUnit:e.target.value})}/></label>
      {product&&form.invoiceQuantity&&<p>Αναγωγή για επιβεβαίωση: {expectedReceiptProduct(form.invoiceQuantity,form.stockUnitsPerInvoiceUnit)||'Έλεγξε ποσότητα και μετατροπή'} {product.unitLabel}. Η μετατροπή αποθηκεύεται με την επιβεβαίωση.</p>}
      <button disabled={busy}>Επιβεβαίωση αναμενόμενης παραλαβής</button>
    </form>}
    {data&&<table><thead><tr><th>Είδος / προμηθευτής</th><th>Επιβεβαιωμένα</th><th>Συνδεδεμένα</th><th>Ακυρωμένα</th><th>Υπόλοιπο</th><th>Έλεγχος</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.id}><td>{row.productName}<small>{row.supplierName} · {row.stockUnit}</small></td><td>{number(row.expectedStockQuantity)}</td><td>{number(row.allocatedQuantity)}</td><td>{number(row.cancelledQuantity)}</td><td>{number(row.remainingQuantity)}</td><td>{row.reviewReason}{data.canWrite&&Number(row.remainingQuantity)>0&&<button disabled={busy} onClick={()=>choose(row)}>Παραλαβή / ακύρωση υπολοίπου</button>}</td></tr>)}</tbody></table>}
    {selection&&<section aria-label="Σύνδεση καταχωρισμένης παραλαβής">
      <h4>{selection.productName} · υπόλοιπο {number(selection.remainingQuantity)} {selection.stockUnit}</h4>
      {candidates?.reviewReason&&<p role="alert">{candidates.reviewReason}</p>}
      {candidates?.hasMore&&<p role="alert">Εμφανίζονται οι πρώτες 100 πηγές αγοράς. Χρειάζεται χωριστός έλεγχος για τις υπόλοιπες.</p>}
      <form onSubmit={event=>{event.preventDefault();if(candidate)mutate(`/api/commerce/expected-receipts/${selection.id}/link`,{version:selection.version,orderId:candidate.orderId,sourceDigest:candidate.sourceDigest,quantity:link.quantity})}}>
        <label>Καταχωρισμένη αγορά<select required value={link.orderId} onChange={e=>setLink({...link,orderId:e.target.value})}><option value="">Επίλεξε αγορά</option>{candidates?.rows.map(row=><option disabled={!!row.reviewReason} key={row.orderId} value={row.orderId}>{row.documentNumber||row.orderId} · {row.reviewReason||`${number(row.available)} ${selection.stockUnit} διαθέσιμα`}</option>)}</select></label>
        <label>Ποσότητα που παρελήφθη<input required type="number" min="0.000000000001" step="0.000000000001" value={link.quantity} onChange={e=>setLink({...link,quantity:e.target.value})}/></label>
        <button disabled={busy||!candidate||!!selection.reviewReason}>Επιβεβαίωση σύνδεσης υπάρχουσας παραλαβής</button>
      </form>
      <form onSubmit={event=>{event.preventDefault();mutate(`/api/commerce/expected-receipts/${selection.id}/cancel-remaining`,{version:selection.version,reason})}}><label>Αιτιολογία ακύρωσης υπολοίπου<input required maxLength="500" value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy}>Ακύρωση υπολοίπου</button></form>
    </section>}
  </section>;
}
