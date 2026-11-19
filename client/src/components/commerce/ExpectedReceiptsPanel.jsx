import {expectedReceiptIntentContext,sameExpectedReceiptContext,readExpectedReceiptIntent,createExpectedReceiptIntent,saveExpectedReceiptIntent,clearExpectedReceiptIntent} from './expected-receipt-intents.js';
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
  const [pendingIntent,setPendingIntent]=useState(null);
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selection,setSelection]=useState(null),[candidates,setCandidates]=useState(null);
  const [form,setForm]=useState({productId:'',supplierId:'',invoiceQuantity:'',invoiceUnit:'ΤΜΧ',stockUnitsPerInvoiceUnit:'1'});
  const [link,setLink]=useState({orderId:'',quantity:''}),[reason,setReason]=useState('');
  const load=async(token)=>{
    const result=await api(`/api/commerce/expected-receipts?${new URLSearchParams({storeId})}`);
    if(token===generation.current){
      const context=expectedReceiptIntentContext(result,storeId);
      const saved=readExpectedReceiptIntent(context);
      operation.current=saved;setPendingIntent(saved);setData(result);
    }
    return result;
  };
  useEffect(()=>{
    const token=++generation.current;setData(null);setSelection(null);setCandidates(null);operation.current=null;setPendingIntent(null);setForm({productId:'',supplierId:'',invoiceQuantity:'',invoiceUnit:'ΤΜΧ',stockUnitsPerInvoiceUnit:'1'});setError('');setBusy(true);
    load(token).catch(e=>{if(token===generation.current)setError(e.message)}).finally(()=>{if(token===generation.current)setBusy(false)});
    return()=>{generation.current++};
  },[storeId,api]);
  const sendIntent=async(intent)=>{
    const token=generation.current;
    setBusy(true);setError('');
    try{
      if(!sameExpectedReceiptContext(expectedReceiptIntentContext(data,storeId),intent))throw Error('Η σύνδεση ή το κατάστημα άλλαξε.');
      const result=await api(intent.path,{method:'POST',body:intent.serializedBody});
      if(!result||(!result.id&&result.rejected!==true))throw Error('Δεν επιβεβαιώθηκε το αποτέλεσμα. Επανέλεγξε το εκκρεμές αίτημα.');
      if(token!==generation.current)return;
      const refreshed=await load(token);
      if(token!==generation.current)return;
      if(!sameExpectedReceiptContext(expectedReceiptIntentContext(refreshed,storeId),intent))throw Error('Η σύνδεση άλλαξε. Το αρχικό αίτημα παραμένει αποθηκευμένο.');
      clearExpectedReceiptIntent(intent);operation.current=null;setPendingIntent(null);
      setSelection(null);setCandidates(null);setReason('');
      if(result.rejected===true)setError(result.message||'Το αίτημα απορρίφθηκε. Διόρθωσε τα στοιχεία πριν από νέα ενέργεια.');
      onChanged();
    }catch(e){if(token===generation.current)setError(e.message||'Το αποτέλεσμα χρειάζεται επιβεβαίωση. Επανέλεγξε το ίδιο αποθηκευμένο αίτημα.');}
    finally{if(token===generation.current)setBusy(false)}
  };
  const mutate=async(path,body)=>{
    try{
      if(operation.current)throw Error('Επανέλεγξε το εκκρεμές αίτημα πριν από άλλη ενέργεια.');
      const intent=createExpectedReceiptIntent(expectedReceiptIntentContext(data,storeId),path,body);
      saveExpectedReceiptIntent(intent);operation.current=intent;setPendingIntent(intent);
      await sendIntent(intent);
    }catch(e){setError(e.message)}
  };
  const choose=async(row)=>{
    if(operation.current){setError('Επανέλεγξε πρώτα το εκκρεμές αίτημα.');return;}
    const token=++generation.current;setSelection(row);setCandidates(null);setLink({orderId:'',quantity:''});setReason('');setError('');setBusy(true);
    try{
      const result=await api(`/api/commerce/expected-receipts/candidates?${new URLSearchParams({storeId,expectedId:row.id})}`);
      if(token===generation.current){if(result.storeId!==storeId||result.expectedId!==row.id)throw Error('Η επιλογή άλλαξε.');setCandidates(result);}
    }catch(e){if(token===generation.current)setError(e.message)}finally{if(token===generation.current)setBusy(false)}
  };
  const product=products.find(item=>item.productId===form.productId);
  const pendingBody=pendingIntent?JSON.parse(pendingIntent.serializedBody):null;
  const pendingLabel=pendingIntent?.path.endsWith('/link')?'Σύνδεση παραλαβής':pendingIntent?.path.endsWith('/cancel-remaining')?'Ακύρωση υπολοίπου':'Επιβεβαίωση αναμονής';
  const pendingProduct=products.find(row=>row.productId===pendingBody?.productId)?.name||data?.rows.find(row=>row.id===pendingIntent?.path.split('/')[4])?.productName;
  const candidate=candidates?.rows.find(row=>row.orderId===link.orderId);
  return <section aria-label="Αναμενόμενες παραλαβές" aria-busy={busy}>
    <header><h3>Αναμενόμενες παραλαβές</h3><button type="button" onClick={onClose}>Κλείσιμο</button></header>
    <p>Επιβεβαίωσε ποσότητες που αναμένεις από προμηθευτή. Σύνδεσε την παραλαβή με αγορά που έχει ήδη ενημερώσει το απόθεμα.</p>
    <p>{data?.sourceSupportNote||'Οι αυτόνομες αγορές εκτός παραγγελίας χρειάζονται χωριστό έλεγχο και δεν προσφέρονται για σύνδεση εδώ.'}</p>
    {error&&<p role="alert">{error}</p>}
    {pendingIntent&&<section aria-label="Εκκρεμές αίτημα παραλαβής"><p role="status">Υπάρχει αποθηκευμένο αίτημα με αποτέλεσμα προς επιβεβαίωση. Οι άλλες ενέργειες περιμένουν τον επανέλεγχο. Μπορείς να κλείσεις την οθόνη και να επιστρέψεις.</p><p>{pendingLabel}{pendingProduct?` · ${pendingProduct}`:""}{pendingBody?.invoiceQuantity?` · ${pendingBody.invoiceQuantity} ${pendingBody.invoiceUnit}`:pendingBody?.quantity?` · ${pendingBody.quantity}`:""}</p><button type="button" disabled={busy} onClick={()=>sendIntent(pendingIntent)}>Επανέλεγχος εκκρεμούς αιτήματος</button></section>}
    {data?.canWrite&&<form onSubmit={event=>{event.preventDefault();mutate('/api/commerce/expected-receipts',form)}}><fieldset disabled={busy||!!pendingIntent}>
      <label>Είδος<select required value={form.productId} onChange={e=>setForm({...form,productId:e.target.value})}><option value="">Επίλεξε είδος</option>{products.map(row=><option key={row.productId} value={row.productId}>{row.name} · {row.unitLabel}</option>)}</select></label>
      <label>Προμηθευτής<select required value={form.supplierId} onChange={e=>setForm({...form,supplierId:e.target.value})}><option value="">Επίλεξε προμηθευτή</option>{data.suppliers.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>Ποσότητα αγοράς<input required type="number" min="0.000001" max="999999999.999999" step="0.000001" value={form.invoiceQuantity} onChange={e=>setForm({...form,invoiceQuantity:e.target.value})}/></label>
      <label>Μονάδα αγοράς<input required maxLength="30" value={form.invoiceUnit} onChange={e=>setForm({...form,invoiceUnit:e.target.value})}/></label>
      <label>Μονάδες αποθήκης ανά μονάδα αγοράς<input required type="number" min="0.000001" max="999999999.999999" step="0.000001" value={form.stockUnitsPerInvoiceUnit} onChange={e=>setForm({...form,stockUnitsPerInvoiceUnit:e.target.value})}/></label>
      {product&&form.invoiceQuantity&&<p>Αναγωγή για επιβεβαίωση: {expectedReceiptProduct(form.invoiceQuantity,form.stockUnitsPerInvoiceUnit)||'Έλεγξε ποσότητα και μετατροπή'} {product.unitLabel}. Η μετατροπή αποθηκεύεται με την επιβεβαίωση.</p>}
      <button disabled={busy||!!pendingIntent}>Επιβεβαίωση αναμενόμενης παραλαβής</button>
    </fieldset></form>}
    {data&&<table><thead><tr><th>Είδος / προμηθευτής</th><th>Επιβεβαιωμένα</th><th>Συνδεδεμένα</th><th>Ακυρωμένα</th><th>Υπόλοιπο</th><th>Έλεγχος</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.id}><td>{row.productName}<small>{row.supplierName} · {row.stockUnit}</small></td><td>{number(row.expectedStockQuantity)}</td><td>{number(row.allocatedQuantity)}</td><td>{number(row.cancelledQuantity)}</td><td>{number(row.remainingQuantity)}</td><td>{row.reviewReason}{data.canWrite&&Number(row.remainingQuantity)>0&&<button disabled={busy||!!pendingIntent} onClick={()=>choose(row)}>Παραλαβή / ακύρωση υπολοίπου</button>}</td></tr>)}</tbody></table>}
    {selection&&<section aria-label="Σύνδεση καταχωρισμένης παραλαβής">
      <h4>{selection.productName} · υπόλοιπο {number(selection.remainingQuantity)} {selection.stockUnit}</h4>
      {candidates?.reviewReason&&<p role="alert">{candidates.reviewReason}</p>}
      {candidates?.hasMore&&<p role="alert">Εμφανίζονται οι πρώτες 100 πηγές αγοράς. Χρειάζεται χωριστός έλεγχος για τις υπόλοιπες.</p>}
      <form onSubmit={event=>{event.preventDefault();if(candidate)mutate(`/api/commerce/expected-receipts/${selection.id}/link`,{version:selection.version,orderId:candidate.orderId,sourceDigest:candidate.sourceDigest,quantity:link.quantity})}}><fieldset disabled={busy||!!pendingIntent}>
        <label>Καταχωρισμένη αγορά<select required value={link.orderId} onChange={e=>setLink({...link,orderId:e.target.value})}><option value="">Επίλεξε αγορά</option>{candidates?.rows.map(row=><option disabled={!!row.reviewReason} key={row.orderId} value={row.orderId}>{row.documentNumber||row.orderId} · {row.reviewReason||`${number(row.available)} ${selection.stockUnit} διαθέσιμα`}</option>)}</select></label>
        <label>Ποσότητα που παρελήφθη<input required type="number" min="0.000000000001" step="0.000000000001" value={link.quantity} onChange={e=>setLink({...link,quantity:e.target.value})}/></label>
        <button disabled={busy||!candidate||!!selection.reviewReason}>Επιβεβαίωση σύνδεσης υπάρχουσας παραλαβής</button>
      </fieldset></form>
      <form onSubmit={event=>{event.preventDefault();mutate(`/api/commerce/expected-receipts/${selection.id}/cancel-remaining`,{version:selection.version,reason})}}><fieldset disabled={busy||!!pendingIntent}><label>Αιτιολογία ακύρωσης υπολοίπου<input required maxLength="500" value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy}>Ακύρωση υπολοίπου</button></fieldset></form>
    </section>}
  </section>;
}
