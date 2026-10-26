import React,{useEffect,useMemo,useRef,useState} from 'react';
import {bundleDocumentPhotos} from '../../lib/document-photo-pdf.js';

const readFile=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Δεν διαβάστηκε το αρχείο.'));reader.readAsDataURL(file)});
const money=value=>Number(value||0).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
const empty=()=>({supplierId:'',documentNumber:'',documentDate:'',amount:'',paymentMethod:'CASH_SHIFT',acknowledged:false});
const newKey=()=>`pending-invoice-${crypto.randomUUID()}`;

export default function StorePendingInvoicePanel({api,store,allowCreate=false,suppliers=[],allowCash=true,onChanged}){
 const [data,setData]=useState(null),[form,setForm]=useState(empty),[selected,setSelected]=useState(null),[files,setFiles]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const current=useRef(null),key=useRef(newKey()),changed=useRef(onChanged),submitting=useRef(false),prepared=useRef(null);changed.current=onChanged;
 const renderContext=useMemo(()=>({storeId:store.id,api}),[store.id,api]);
 const load=async context=>{const value=await context.api(`/api/transactions/stores/${encodeURIComponent(context.storeId)}/pending-invoices`);if(current.current!==context)return;if(value.storeId!==context.storeId)throw Error('Η απάντηση δεν αντιστοιχεί στο κατάστημα.');setData(value);return value};
 useEffect(()=>{const context=renderContext;current.current=context;prepared.current=null;setData(null);setSelected(null);setFiles([]);setForm(empty());setBusy(false);setError('');setMessage('');key.current=newKey();submitting.current=false;load(context).catch(e=>{if(current.current===context)setError(e.message)});return()=>{if(current.current===context)current.current=null}},[renderContext]);
 const active=()=>current.current===renderContext;
 const update=(name,value)=>{if(active())setForm(old=>({...old,[name]:value,acknowledged:false}))};
 const refresh=async()=>{const context=renderContext;if(current.current!==context||submitting.current)return;setError('');try{await load(context)}catch(e){if(current.current===context)setError(e.message)}};
 const create=async event=>{
  event.preventDefault();const context=renderContext;if(current.current!==context||submitting.current)return;
  const amount=Number(form.amount.replace(',','.'));
  if(!data?.openSession?.id||!form.supplierId||!form.documentNumber.trim()||!form.documentDate||!Number.isFinite(amount)||amount<=0||!form.acknowledged){setError('Συμπλήρωσε τα πραγματικά στοιχεία και επιβεβαίωσε την πληρωμή.');return}
  if(form.paymentMethod==='CASH_SHIFT'&&!allowCash){setError('Δεν έχεις δικαίωμα πληρωμής από την ίδια βάρδια.');return}
  submitting.current=true;setBusy(true);setError('');setMessage('');let confirmed=false;
  try{
   const result=await context.api(`/api/transactions/stores/${encodeURIComponent(context.storeId)}`,{method:'POST',body:JSON.stringify({type:'SUPPLIER_PAYMENT',supplierId:form.supplierId,invoiceDocumentNumber:form.documentNumber.trim(),amount,description:`Τιμολόγιο ${form.documentNumber.trim()} — αναμονή ανεβάσματος παραστατικού`,evidenceMode:'NO_DOCUMENT',paymentSource:form.paymentMethod==='CASH_SHIFT'?'CASH_SHIFT':'EXTERNAL',paymentMethod:form.paymentMethod,idempotencyKey:key.current,deferredInvoice:{documentDate:form.documentDate,sessionId:data.openSession.id}})});
   if(current.current!==context)return;
   if(!result?.pendingInvoiceId)throw Error('Δεν επιβεβαιώθηκε η ασφαλής εκκρεμότητα. Επανέλαβε το ίδιο αίτημα.');
   confirmed=true;
   if(form.paymentMethod==='CASH_SHIFT'&&!result.duplicate)window.dispatchEvent(new window.CustomEvent('myworkstation:cash-drawer-request',{detail:{reason:'SUPPLIER_PAYMENT',amount,storeId:context.storeId,transactionId:result.pendingInvoiceId}}));
   setMessage(`Η πληρωμή ${money(amount)} καταγράφηκε${result.duplicate?' ήδη':''}. Το τιμολόγιο παραμένει προς ανέβασμα. Δεν έγινε ανάγνωση AI.`);setForm(empty());key.current=newKey();await load(context);changed.current?.();
  }catch(e){if(current.current===context)setError(confirmed?`Η πληρωμή επιβεβαιώθηκε. Η λίστα δεν ανανεώθηκε: ${e.message}. Πάτησε Ανανέωση εκκρεμοτήτων.`:`${e.message} Τα στοιχεία και το ίδιο αναγνωριστικό διατηρούνται για ασφαλή επανάληψη.`)}finally{if(current.current===context){submitting.current=false;setBusy(false)}}
 };
 const upload=async()=>{
  const context=renderContext;if(current.current!==context||submitting.current||!selected||!files.length)return;
  if(files.length>5||files.reduce((n,f)=>n+f.size,0)>6500000){setError('Επίλεξε έως 5 σελίδες με συνολικό μέγεθος έως 6,5 MB.');return}
  const original=selected;submitting.current=true;setBusy(true);setError('');setMessage('');let confirmed=false;
  try{
   let attempt=prepared.current;
   if(!attempt||attempt.context!==context||attempt.id!==original.id||attempt.fingerprint!==original.fingerprint||attempt.files!==files){
    const bundled=await bundleDocumentPhotos(files,{maxBytes:6500000});if(current.current!==context)return;
    const dataUrl=await readFile(bundled);if(current.current!==context)return;
    attempt={context,id:original.id,fingerprint:original.fingerprint,files,attachment:{filename:bundled.name,mimeType:bundled.type,dataUrl}};prepared.current=attempt;
   }
   const body={sourceKind:'PLAIN_CAPTURE',storeId:context.storeId,supplierId:original.supplierId,documentNumber:original.documentNumber,documentDate:original.documentDate,totalGross:original.amount,documentType:'INVOICE',settlementMode:'PAID',paymentTransactionId:original.id,expectedPendingInvoice:{id:original.id,fingerprint:original.fingerprint},attachment:attempt.attachment};
   const result=await context.api(`/api/transactions/stores/${encodeURIComponent(context.storeId)}/pending-invoices/${encodeURIComponent(original.id)}/attachment`,{method:'POST',body:JSON.stringify(body)});
   if(current.current!==context)return;
   if(result?.sourceKind!=='PLAIN_CAPTURE'||!result.captured||result.paymentTransactionId!==original.id||result.attachmentId!==original.id||!result.proofId||!result.checksum)throw Error('Η παραλαβή δεν έχει επιβεβαιωθεί πλήρως. Επανέλαβε με τα ίδια αρχεία.');
   confirmed=true;prepared.current=null;setMessage('Το τιμολόγιο αποθηκεύτηκε και συνδέθηκε με την αρχική πληρωμή. Δεν έγινε δεύτερη πληρωμή ούτε ανάγνωση AI.');setSelected(null);setFiles([]);await load(context);changed.current?.();
  }catch(e){if(current.current===context)setError(confirmed?`Το τιμολόγιο αποθηκεύτηκε και επιβεβαιώθηκε. Η λίστα δεν ανανεώθηκε: ${e.message}. Πάτησε Ανανέωση εκκρεμοτήτων.`:`${e.message} Μην πληρώσεις ξανά. Η ίδια επιλογή αρχείων παραμένει για ασφαλή επανάληψη.`)}finally{if(current.current===context){submitting.current=false;setBusy(false)}}
 };
 return <section aria-label="Εκκρεμότητες τιμολογίων" data-pending-invoices="true" style={{padding:12,border:'1px solid #d8b45b',borderRadius:10,margin:'12px 0',background:'#fffdf5'}}>
  <h4>Εκκρεμότητες τιμολογίων</h4><p>Οι παρακάτω πληρωμές έχουν ήδη γίνει. Το ανέβασμα συνδέει το πρωτότυπο με την ίδια πληρωμή, χωρίς νέα χρέωση.</p>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <button type="button" disabled={busy} onClick={refresh}>Ανανέωση εκκρεμοτήτων</button>
  {!data?<p>Φόρτωση εκκρεμοτήτων…</p>:<><p>{data.count} εκκρεμότητες τιμολογίων{data.truncated?' · εμφανίζονται τα πρώτα 50':''}.</p>{data.rows.map(row=><div key={row.id} style={{padding:8,borderBottom:'1px solid #ddd'}}><b>{row.supplierName} · {row.documentNumber}</b><p>{row.documentDate} · {money(row.amount)} · {row.terminalPos} · {row.actorName}</p>{row.status==="UPLOADED_AWAITING_REVIEW"&&<p>Το πρωτότυπο ανέβηκε — εκκρεμεί σύνδεση ή έλεγχος. Ο έλεγχος συνεχίζεται στην υπάρχουσα καταχώριση. Δεν ξεκινά νέα ανάγνωση από εδώ.</p>}{row.status==="REVIEW_REQUIRED"&&<p>Χρειάζεται έλεγχος της αρχικής πληρωμής ή του παραστατικού.</p>}<button type="button" disabled={busy||row.status==='UPLOADED_AWAITING_REVIEW'} onClick={()=>{if(!active())return;prepared.current=null;setSelected(row);setFiles([]);setError('');setMessage('')}}>{row.status==='UPLOADED_AWAITING_REVIEW'?'Αναμονή ελέγχου στην υπάρχουσα καταχώριση':'Ανέβασε το ίδιο τιμολόγιο'}</button></div>)}</>}
  {selected&&<div role="group" aria-label="Σύνδεση πρωτοτύπου με αρχική πληρωμή"><p><b>{selected.documentNumber} · {money(selected.amount)}</b> — επιβεβαίωσε ότι όλες οι σελίδες ανήκουν σε αυτό το τιμολόγιο.</p><label>Ένα πολυσέλιδο PDF ή έως 5 φωτογραφίες<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={e=>{if(active()){prepared.current=null;setFiles(Array.from(e.target.files||[]))}}}/></label><p>Οι φωτογραφίες αποθηκεύονται μαζί σε ένα PDF. Δεν γίνεται ανάγνωση AI.</p><p>{files.map(f=>f.name).join(' · ')}</p><button type="button" disabled={busy||!files.length} onClick={upload}>Σύνδεση χωρίς νέα πληρωμή</button><button type="button" disabled={busy} onClick={()=>{if(active()){prepared.current=null;setSelected(null);setFiles([])}}}>Ακύρωση</button></div>}
  {allowCreate&&<form onSubmit={create}><h4>Πληρωμή τώρα — ανέβασμα τιμολογίου αργότερα</h4><label>Προμηθευτής<select required disabled={busy} value={form.supplierId} onChange={e=>update('supplierId',e.target.value)}><option value="">Επίλεξε προμηθευτή</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Πραγματικός αριθμός τιμολογίου<input required maxLength={80} disabled={busy} value={form.documentNumber} onChange={e=>update('documentNumber',e.target.value)}/></label><label>Ημερομηνία τιμολογίου<input required type="date" disabled={busy} value={form.documentDate} onChange={e=>update('documentDate',e.target.value)}/></label><label>Ποσό πληρωμής<input required inputMode="decimal" disabled={busy} value={form.amount} onChange={e=>update('amount',e.target.value)}/></label><label>Τρόπος πληρωμής<select disabled={busy} value={form.paymentMethod} onChange={e=>update('paymentMethod',e.target.value)}><option value="CASH_SHIFT" disabled={!allowCash}>Μετρητά της ενεργής βάρδιας</option><option value="CORPORATE_CARD">Εταιρική κάρτα</option><option value="BANK_TRANSFER">Τραπεζική μεταφορά</option><option value="EMPLOYEE_REIMBURSEMENT">Πληρωμή υπαλλήλου προς επιστροφή</option></select></label><label><input type="checkbox" disabled={busy} checked={form.acknowledged} onChange={e=>{if(active())setForm(old=>({...old,acknowledged:e.target.checked}))}}/>Επιβεβαιώνω την πραγματική πληρωμή και θα ανεβάσω το τιμολόγιο αργότερα.</label><button type="submit" disabled={busy||!form.acknowledged||!data?.openSession}>Καταχώριση πληρωμής με εκκρεμές τιμολόγιο</button></form>}
 </section>;
}
