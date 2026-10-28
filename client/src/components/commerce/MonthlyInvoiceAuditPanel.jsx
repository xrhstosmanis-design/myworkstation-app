import React,{useEffect,useRef,useState} from 'react';

const labels={UNPOSTED_DOCUMENT:'Δεν έχει καταχωριστεί',UPLOADED_AWAITING_REVIEW:'Ανεβασμένο - προς έλεγχο',POSSIBLE_DUPLICATE:'Πιθανό διπλό',IDENTITY_OR_LINK_REVIEW:'Χρειάζεται ταυτοποίηση',AWAITING_INVOICE:'Λείπει πρωτότυπο',REVIEW_REQUIRED:'Χρειάζεται έλεγχο'};
const sourceLabels={documents:'Παραστατικά',orders:'Αγορές',inbound:'Παραλαβές myDATA',inbox:'Θυρίδα',jobs:'Συνδέσεις ανάγνωσης',attachments:'Πρωτότυπα',aliases:'Ενοποιήσεις',postings:'Καταχωρίσεις αγορών',stockPostings:'Συνδέσεις αποθήκης'};
const money=value=>value===null||value===undefined?'Άγνωστο':(value/100).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
const currentMonth=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit'}).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return p.year+'-'+p.month};
const styles=`.invoice-month-audit{border:1px solid #c5d4e5;border-radius:12px;padding:16px;background:#fff;color:#18324f;margin:12px 0}.invoice-month-audit h3{margin:0 0 10px}.invoice-month-audit form{display:flex;gap:12px;align-items:end;flex-wrap:wrap}.invoice-month-audit label{display:grid;gap:4px;font-weight:700}.invoice-month-audit input,.invoice-month-audit button{font:inherit;min-height:44px;padding:8px 12px;border:1px solid #6b819b;border-radius:6px}.invoice-month-audit button{background:#f0f6fc;color:#153d68;cursor:pointer}.invoice-month-audit button:disabled{cursor:default;opacity:.6}.invoice-month-audit :focus-visible{outline:3px solid #087f8c;outline-offset:2px}.invoice-month-audit .ima-summary{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}.invoice-month-audit .ima-summary span{border:1px solid #d8e2ed;padding:10px;border-radius:8px}.invoice-month-audit .ima-summary b{display:block;font-size:1.3rem}.invoice-month-audit .ima-warning{background:#fff5dd;border-left:4px solid #b16b00;padding:10px}.invoice-month-audit .ima-safe{background:#edf8ef;padding:10px}.invoice-month-audit .ima-rows{padding:0;list-style:none}.invoice-month-audit .ima-rows>li{border-top:1px solid #d7e0eb;padding:12px 0;overflow-wrap:anywhere}.invoice-month-audit .ima-meta{display:flex;gap:12px;flex-wrap:wrap;margin:5px 0}.invoice-month-audit .ima-pending{margin-top:20px;padding-top:16px;border-top:2px solid #8caac5}.invoice-month-audit .ima-tag{display:inline-block;margin:3px 6px 3px 0;padding:3px 7px;border-radius:6px;background:#fff0d6;color:#653a00}.invoice-month-audit .ima-footer{display:flex;gap:10px;align-items:center;flex-wrap:wrap}@media(max-width:600px){.invoice-month-audit{padding:12px}.invoice-month-audit form>*{flex:1 1 100%}.invoice-month-audit input,.invoice-month-audit form button{width:100%}}`;

export default function MonthlyInvoiceAuditPanel({api,storeId='',storeName='',initialMonth}){
 const [month,setMonth]=useState(initialMonth||currentMonth),[observation,setObservation]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const result=observation?.api===api&&observation?.data?.store?.id===storeId?observation.data:null;
 const request=useRef(0),abort=useRef(null),current=useRef({storeId,month,api});current.current={storeId,month,api};
 const [previewObservation,setPreviewObservation]=useState(null),previewRequest=useRef(0),previewAbort=useRef(null);
 const previewScope=previewObservation?.api===api&&previewObservation.storeId===storeId&&previewObservation.month===month?previewObservation:null;
 useEffect(()=>{previewRequest.current++;previewAbort.current?.abort();setPreviewObservation(null);return()=>{previewRequest.current++;previewAbort.current?.abort()}},[storeId,api,month]);
 const loadPreview=async()=>{
  if(!storeId||!month)return;
  previewAbort.current?.abort();const controller=new AbortController();previewAbort.current=controller;
  const serial=++previewRequest.current,selected={storeId,month},scope={...selected,api};setPreviewObservation({...scope,loading:true});
  const currentScope=()=>!controller.signal.aborted&&previewRequest.current===serial&&current.current.storeId===selected.storeId&&current.current.month===selected.month&&current.current.api===api;
  try{
   const data=await api('/api/reports/invoice-audit-email-preview?'+new URLSearchParams(selected).toString(),{signal:controller.signal});
   if(!currentScope())return;
   if(data?.store?.id!==selected.storeId||data?.period?.month!==selected.month||data?.previewOnly!==true||data?.sendingEnabled!==false||data?.readOnly!==true||data?.separateSnapshots!==true||data?.purposeConsent!=='NOT_ASSUMED'||typeof data?.payload?.subject!=='string'||typeof data?.payload?.body!=='string'||!data?.payload?.coverage||!data?.recipients)throw Error('Η προεπισκόπηση δεν αντιστοιχεί στην τρέχουσα επιλογή.');
   setPreviewObservation({...scope,data,loading:false});
  }catch(failure){if(currentScope())setPreviewObservation({...scope,error:failure.message||'Η προεπισκόπηση δεν ολοκληρώθηκε.',loading:false})}
 };
 useEffect(()=>{request.current++;abort.current?.abort();setObservation(null);setError('');setLoading(false);return()=>{request.current++;abort.current?.abort()}},[storeId,api]);
 const load=async(page=null)=>{
  if(!storeId)return;
  abort.current?.abort();const controller=new AbortController();abort.current=controller;
  const serial=++request.current,selected={storeId,month};setLoading(true);setError('');
  try{
   const query=new URLSearchParams(selected);if(page)query.set('page',page);
   const data=await api('/api/reports/invoice-month-audit?'+query.toString(),{signal:controller.signal});
   if(controller.signal.aborted||request.current!==serial||current.current.storeId!==selected.storeId||current.current.month!==selected.month||current.current.api!==api)return;
   if(data?.store?.id!==selected.storeId||data?.period?.month!==selected.month||data?.readOnly!==true)throw Error('Το αποτέλεσμα δεν αντιστοιχεί στην τρέχουσα επιλογή.');
   setObservation({data,api});
  }catch(failure){if(!controller.signal.aborted&&request.current===serial){setError(failure.message||'Ο έλεγχος δεν ολοκληρώθηκε.');setObservation(null)}}
  finally{if(request.current===serial)setLoading(false)}
 };
 const changeMonth=value=>{request.current++;abort.current?.abort();previewRequest.current++;previewAbort.current?.abort();setLoading(false);setError('');setMonth(value)};
 const edited=result&&result.period.month!==month,pending=result?.pendingOriginals,summary=result?.summary;
 return <section className="invoice-month-audit" aria-labelledby="invoice-month-audit-title">
  <style>{styles}</style>
  <h3 id="invoice-month-audit-title">Έλεγχος τιμολογίων μήνα</h3>
  <p>Μόνο ανάγνωση αποθηκευμένων στοιχείων. Δεν καταχωρεί, ενοποιεί, πληρώνει ή διαγράφει παραστατικά και δεν στέλνει email.</p>
  {!storeId?<p role="status">Επίλεξε συγκεκριμένο κατάστημα για να ανοίξεις τον έλεγχο.</p>:<>
   <p><b>Κατάστημα:</b> {storeName||storeId}</p>
   <form onSubmit={event=>{event.preventDefault();load()}}><label>Μήνας έκδοσης<input type="month" value={month} min="2000-01" max="2099-12" required onChange={event=>changeMonth(event.target.value)}/></label><button type="submit" disabled={loading||!month}>{loading?'Έλεγχος...':'Έλεγχος μήνα'}</button><button type="button" disabled={Boolean(previewScope?.loading)||!month} onClick={loadPreview}>{previewScope?.loading?'Προετοιμασία email...':'Προεπισκόπηση μηνιαίου email'}</button></form>
   {previewScope?.error&&<p role="alert" className="ima-warning">{previewScope.error}</p>}
   {previewScope?.data&&<section className="ima-email-preview" aria-labelledby="invoice-email-preview-title" style={{border:'1px solid #8caac5',borderRadius:8,padding:12,marginTop:16,overflowWrap:'anywhere'}}>
    <h4 id="invoice-email-preview-title">Προεπισκόπηση μηνιαίου email — {previewScope.data.period.month}</h4>
    <p className="ima-warning">Προεπισκόπηση μόνο. Η αποστολή είναι απενεργοποιημένη. Οι υπάρχουσες εγκρίσεις μηνιαίων αναφορών δεν ενεργοποιούν την αποστολή αυτού του email.</p>
    <p>Προγραμματισμένη ώρα: {previewScope.data.period.nominalLocalTime} (ώρα Ελλάδας). Προσωρινή εικόνα κατά την παρατήρηση, χωρίς ανακατασκευή ιστορικού ή οριστικό λογιστικό κλείσιμο.</p>
    <p>Παρατήρηση τιμολογίων: {new Date(previewScope.data.reportObservedAt).toLocaleString('el-GR',{timeZone:'Europe/Athens',hour12:false})}. Χωριστή παρατήρηση παραληπτών: {new Date(previewScope.data.recipientObservedAt).toLocaleString('el-GR',{timeZone:'Europe/Athens',hour12:false})}. Οι δύο παρατηρήσεις δεν αποτελούν κοινή έγκριση αποστολής.</p>
    {!previewScope.data.payload.coverage.complete&&<p className="ima-warning">Η κάλυψη είναι ελλιπής. Τα άγνωστα σύνολα δεν θεωρούνται μηδενικά.</p>}
    <div aria-label="Σύνοψη παραληπτών προεπισκόπησης">{previewScope.data.recipients.available?<><p>Επαληθευμένοι παραλήπτες καταστήματος: <b>{previewScope.data.recipients.verifiedCount}</b>. Με τρέχουσα έγκριση μηνιαίας συχνότητας: <b>{previewScope.data.recipients.monthlyConsentEligibleCount}</b> — χωρίς έγκριση σκοπού για αυτό το email.</p><ul>{previewScope.data.recipients.identities.map((r,index)=><li key={index}>{r.maskedEmail}</li>)}</ul></>:<p className="ima-warning">Η σύνοψη παραληπτών δεν είναι διαθέσιμη. Το πλήθος είναι άγνωστο.</p>}</div>
    <p><b>Θέμα:</b> <span className="ima-email-subject">{previewScope.data.payload.subject}</span></p>
    <pre className="ima-email-body" style={{font:'inherit',whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxWidth:'100%'}}>{previewScope.data.payload.body}</pre>
    <a href="https://myworkstation-app.onrender.com/" target="_blank" rel="noopener noreferrer">Άνοιγμα BackOffice με προσωπική σύνδεση</a>
   </section>}
   {error&&<p role="alert" className="ima-warning">{error}</p>}
   {edited&&<p className="ima-warning">Η επιλογή άλλαξε. Τα στοιχεία παρακάτω αφορούν ακόμη τον μήνα {result.period.month}. Πάτησε Έλεγχος μήνα για νέα αποτελέσματα.</p>}
   {result&&<>
    <h4>Φορτωμένος μήνας έκδοσης: {result.period.month}</h4>
    <p>Βάση: ημερομηνία έκδοσης, όχι ημερομηνία πληρωμής. Στοιχεία κατά τον έλεγχο {new Date(result.asOf).toLocaleString('el-GR',{timeZone:'Europe/Athens',hour12:false})} (ώρα Ελλάδας).</p>
    {!result.coverage?.complete?<div role="status" className="ima-warning"><b>Η κάλυψη δεν είναι πλήρης.</b> Δεν μπορεί να εξαχθεί συμπέρασμα ότι δεν υπάρχουν εκκρεμότητες.{result.coverage?.unavailable?.length>0&&<p>Μη διαθέσιμες πηγές: {result.coverage.unavailable.map(key=>sourceLabels[key]||'Πηγή προς έλεγχο').join(', ')}</p>}{result.coverage?.limited?.length>0&&<p>Πηγές πάνω από το όριο ασφαλούς ανάλυσης: {result.coverage.limited.map(key=>sourceLabels[key]||'Πηγή προς έλεγχο').join(', ')}</p>}</div>:summary&&<div className="ima-summary" aria-label="Σύνολα επιλεγμένου μήνα"><span>Εγγραφές ελέγχου<b>{summary.logicalRecords}</b></span><span>Δεν έχουν καταχωριστεί<b>{summary.unposted}</b></span><span>Ανεβασμένα προς έλεγχο<b>{summary.uploadedAwaitingReview}</b></span><span>Πιθανά διπλά<b>{summary.possibleDuplicates}</b></span><span>Ταυτοποίηση / συνδέσεις<b>{summary.identityReview}</b></span><span>Πιστωτικά (χωριστή ένδειξη)<b>{summary.credits}</b></span></div>}
    {result.allClear&&<p className="ima-safe">Δεν εντοπίστηκαν εκκρεμότητες στις ελεγμένες αποθηκευμένες πηγές του καταστήματος.</p>}
    {result.coverage?.complete&&<><p>Τα σύνολα αφορούν ολόκληρη την ελεγμένη πηγή. Οι λεπτομέρειες εμφανίζονται σε σελίδες έως 50 εγγραφών. «Δεν έχει καταχωριστεί» δεν σημαίνει «δεν έχει πληρωθεί».</p><ul className="ima-rows" aria-label="Παραστατικά επιλεγμένου μήνα">{result.items.map(row=><li key={row.id}><b>{row.documentNumber||'Χωρίς επιβεβαιωμένο αριθμό'}</b><div className="ima-meta"><span>{row.supplierName||row.supplierTaxId||'Προμηθευτής προς έλεγχο'}</span><span>{row.issueDay||'Άγνωστη ημερομηνία έκδοσης'}</span><span>{money(row.totalCents)}</span><span>{row.documentType==='CREDIT_NOTE'?'Πιστωτικό':row.documentType==='INVOICE'?'Τιμολόγιο':'Τύπος προς έλεγχο'}</span></div>{row.categories.map(category=><span className="ima-tag" key={category}>{labels[category]||category}</span>)}{row.reasons.map(reason=><p key={reason}>{reason}</p>)}{!row.categories.length&&<span>Καταχωρισμένο - χωρίς ένδειξη ελέγχου από τις διαθέσιμες πηγές.</span>}</li>)}</ul><div className="ima-footer"><button type="button" disabled={loading||edited} onClick={()=>load()}>Πρώτη σελίδα / Ανανέωση</button>{result.nextPage&&<button type="button" disabled={loading||edited} onClick={()=>load(result.nextPage)}>Επόμενη σελίδα</button>}<span>{result.items.length} εγγραφές στην τρέχουσα σελίδα</span></div></>}
    <section className="ima-pending" aria-labelledby="invoice-month-pending-title"><h4 id="invoice-month-pending-title">Εκκρεμότητες πρωτοτύπων - Όλοι οι μήνες</h4><p>Χωριστό σύνολο αρχικών πληρωμών με εκκρεμότητα. Δεν περιλαμβάνεται στα σύνολα του επιλεγμένου μήνα έκδοσης.</p>{!pending?.available?<p role="status" className="ima-warning">Η πηγή εκκρεμοτήτων δεν είναι διαθέσιμη. Δεν θεωρείται μηδενική.</p>:<><div className="ima-summary" aria-label="Εκκρεμότητες όλων των μηνών"><span>Σύνολο<b>{pending.counts.total}</b></span><span>Λείπει πρωτότυπο<b>{pending.counts.missingOriginal}</b></span><span>Ανεβασμένο προς έλεγχο<b>{pending.counts.uploadedAwaitingReview}</b></span><span>Χρειάζεται έλεγχο<b>{pending.counts.reviewRequired}</b></span></div>{pending.truncated&&<p className="ima-warning">Εμφανίζονται μόνο οι πρώτες 50 εκκρεμότητες. Τα παραπάνω σύνολα περιλαμβάνουν όλες τις εκκρεμότητες και όλους τους μήνες.</p>}<ul className="ima-rows">{pending.items.map(row=><li key={row.id}><b>{row.documentNumber||'Χωρίς αριθμό'}</b> - {row.supplierName||'Προμηθευτής προς έλεγχο'}<div className="ima-meta"><span>{row.documentDate||'Άγνωστη ημερομηνία'}</span><span>{money(Math.round(Number(row.amount)*100))}</span><span>{labels[row.status]||'Χρειάζεται έλεγχο'}</span></div></li>)}</ul></>}</section>
    <p><small>Πιθανό διπλό σημαίνει ανάγκη ανθρώπινου ελέγχου. Η αναφορά δεν αποτελεί μόνιμο ιστορικό στιγμιότυπο ή επιβεβαίωση φυσικού αποθέματος. Η μηνιαία αποστολή email δεν ενεργοποιείται από αυτή την οθόνη.</small></p>
   </>}
  </>}
 </section>;
}
